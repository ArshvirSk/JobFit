import asyncio
import logging
import hashlib
from datetime import datetime, timezone
from backend.services.supabase_client import get_supabase
from backend.chat.connectors.nodes import JobsConnector
from backend.chat.fit_scorer import score_jobs_fit

logger = logging.getLogger(__name__)

async def run_watch_loop():
    """
    Background polling loop that checks watched companies for new jobs,
    scores them, and issues notifications for strong matches.
    """
    logger.info("Starting background watch loop...")
    while True:
        try:
            await _process_watched_companies()
        except Exception as e:
            logger.error(f"Error in watch loop: {e}")
        
        # Sleep for 1 hour (configurable)
        await asyncio.sleep(3600)

async def _process_watched_companies():
    sb = get_supabase()
    
    # 1. Get all unique watched companies
    res = sb.table("watched_companies").select("company_name").execute()
    if not res.data:
        return
        
    unique_companies = {r["company_name"] for r in res.data}
    logger.info(f"Watch loop processing {len(unique_companies)} companies")
    
    for company_name in unique_companies:
        try:
            # 2. Fetch jobs (this natively hits the DB cache first. If TTL expired, it fetches live)
            jobs_data = await JobsConnector().fetch(company_name)
            if not jobs_data or not jobs_data.open_roles:
                continue
                
            open_roles = jobs_data.open_roles
            
            # 3. Find all users watching this company
            users_res = sb.table("watched_companies").select("user_id").eq("company_name", company_name).execute()
            user_ids = [r["user_id"] for r in users_res.data]
            
            for user_id in user_ids:
                # 4. Fetch the user's latest parsed resume
                resume_res = sb.table("base_resumes").select("id, parsed_json").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
                if not resume_res.data or not resume_res.data[0].get("parsed_json"):
                    continue
                    
                resume_id = resume_res.data[0]["id"]
                parsed_resume = resume_res.data[0]["parsed_json"]
                
                # 5. Determine which jobs are new (uncached for this user)
                jobs_to_score = []
                for idx, job in enumerate(open_roles):
                    job_str = f"{job.title}|{job.location}"
                    job_hash = hashlib.sha256(job_str.encode()).hexdigest()
                    
                    # Check if scored already
                    score_res = sb.table("job_fit_scores").select("id").eq("user_id", user_id).eq("job_hash", job_hash).eq("resume_id", resume_id).execute()
                    if not score_res.data:
                        # Also check if already notified (in case score was deleted but notification exists)
                        notif_res = sb.table("job_notifications").select("id").eq("user_id", user_id).eq("job_hash", job_hash).execute()
                        if not notif_res.data:
                            jobs_to_score.append({
                                "original_idx": idx,
                                "job_hash": job_hash,
                                "title": job.title,
                                "location": job.location,
                                "url": getattr(job, "url", None)
                            })
                
                # 6. Score new jobs
                if jobs_to_score:
                    logger.info(f"Scoring {len(jobs_to_score)} new jobs for user {user_id} at {company_name}")
                    batched_results = await score_jobs_fit(parsed_resume, jobs_to_score)
                    
                    for score in batched_results.scores:
                        if score.job_index < len(jobs_to_score):
                            job_info = jobs_to_score[score.job_index]
                            
                            # Cache the score so we don't re-score it
                            fit_data = score.model_dump()
                            sb.table("job_fit_scores").upsert({
                                "user_id": user_id,
                                "resume_id": resume_id,
                                "company_name": company_name,
                                "job_hash": job_info["job_hash"],
                                "fit_data": fit_data
                            }).execute()
                            
                            # 7. Notify if strong match
                            if fit_data.get("fit_label") in ["strong_match", "Strong Match"]:
                                logger.info(f"Generating notification for strong match: {job_info['title']} at {company_name}")
                                sb.table("job_notifications").upsert({
                                    "user_id": user_id,
                                    "company_name": company_name,
                                    "job_hash": job_info["job_hash"],
                                    "job_title": job_info["title"],
                                    "job_url": job_info["url"],
                                    "fit_label": fit_data.get("fit_label")
                                }, on_conflict="user_id,job_hash").execute()

        except Exception as e:
            logger.error(f"Error processing watched company {company_name}: {e}")
