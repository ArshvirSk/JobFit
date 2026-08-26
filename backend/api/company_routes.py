import asyncio
import json
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from backend.api.routes import get_current_user_id
from backend.chat.connectors.nodes import (
    FundingConnector,
    LinkedInConnector,
    GlassdoorConnector,
    CompensationConnector,
    BenefitsConnector,
    CompetitorsConnector,
    JobsConnector,
    DSAQuestionsConnector
)

logger = logging.getLogger(__name__)

company_router = APIRouter(prefix="/api/company", tags=["company"])

@company_router.get("/{slug}/stream")
async def stream_company_profile(slug: str, user_id: str = Depends(get_current_user_id)):
    """
    Parallel fetches the 7 data categories for a company and streams them as SSE.
    """
    entity_name = slug.replace("-", " ").title() # Normalize
    
    async def fetch_category(category: str, coro):
        try:
            res = await coro
            return category, res
        except Exception as e:
            logger.error(f"Error fetching {category} for {entity_name}: {e}")
            return category, None

    async def stream_response():
        connectors = [
            ("funding", FundingConnector().fetch(entity_name)),
            ("linkedin", LinkedInConnector().fetch(entity_name)),
            ("glassdoor", GlassdoorConnector().fetch(entity_name)),
            ("compensation", CompensationConnector().fetch(entity_name)),
            ("benefits", BenefitsConnector().fetch(entity_name)),
            ("competitors", CompetitorsConnector().fetch(entity_name)),
            ("jobs", JobsConnector().fetch(entity_name)),
            ("dsa", DSAQuestionsConnector().fetch(entity_name)),
        ]
        
        tasks = [asyncio.create_task(fetch_category(cat, coro)) for cat, coro in connectors]
        
        for coro in asyncio.as_completed(tasks):
            category, res = await coro
            
            data = None
            if res:
                data = res.model_dump()
                
            chunk = json.dumps({
                "category": category,
                "data": data
            })
            yield f"data: {chunk}\n\n"
            
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@company_router.get("/{slug}/digest")
async def get_company_digest(slug: str, user_id: str = Depends(get_current_user_id)):
    """
    Generate a personalized 2-3 sentence digest for a company,
    combining fit scores, application tracker history, and compensation context.
    
    This is the USP: it requires knowing the specific user's background.
    """
    from backend.services.supabase_client import get_supabase
    from backend.services.llm import llm_service
    
    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()

    # ── 1. Gather fit scores (from job_fit_scores cache) ─────────
    fit_summary = None
    try:
        # Get user's latest resume
        resume_res = sb.table("base_resumes").select("id, parsed_json") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True).limit(1).execute()
        
        if resume_res.data and resume_res.data[0].get("parsed_json"):
            resume_id = resume_res.data[0]["id"]
            
            # Get all fit scores for this user
            fit_res = sb.table("job_fit_scores").select("fit_data") \
                .eq("user_id", user_id) \
                .eq("resume_id", resume_id) \
                .execute()
            
            if fit_res.data:
                scores = [r["fit_data"] for r in fit_res.data if r.get("fit_data")]
                strong = [s for s in scores if s.get("fit_label") == "strong_match"]
                partial = [s for s in scores if s.get("fit_label") == "partial_match"]
                stretch = [s for s in scores if s.get("fit_label") == "stretch"]
                
                fit_summary = {
                    "total_scored": len(scores),
                    "strong_matches": len(strong),
                    "partial_matches": len(partial),
                    "stretches": len(stretch),
                    "best_match": strong[0] if strong else (partial[0] if partial else None),
                }
    except Exception as e:
        logger.warning(f"Failed to load fit scores for digest: {e}")

    # ── 2. Gather tracker / application history ──────────────────
    tracker_summary = None
    try:
        apps_res = sb.table("applications").select("company, role, status, applied_at") \
            .eq("user_id", user_id) \
            .ilike("company", f"%{entity_name}%") \
            .order("applied_at", desc=True) \
            .limit(5) \
            .execute()
        
        if apps_res.data and len(apps_res.data) > 0:
            tracker_summary = {
                "total_applications": len(apps_res.data),
                "applications": [
                    {
                        "role": app["role"],
                        "status": app["status"],
                        "applied_at": app["applied_at"],
                    }
                    for app in apps_res.data
                ]
            }
    except Exception as e:
        logger.warning(f"Failed to load tracker data for digest: {e}")

    # ── 3. Gather compensation context ───────────────────────────
    comp_summary = None
    try:
        comp_res = sb.table("company_profiles").select("data") \
            .eq("entity_name", entity_name) \
            .eq("category", "compensation") \
            .execute()
        
        if comp_res.data and comp_res.data[0].get("data"):
            comp_data = comp_res.data[0]["data"]
            comp_summary = {
                "average_package": comp_data.get("average_package"),
                "highest_package": comp_data.get("highest_package"),
                "by_role": comp_data.get("by_role", {}),
            }
    except Exception as e:
        logger.warning(f"Failed to load compensation for digest: {e}")

    # ── 4. Generate the digest via LLM synthesis ─────────────────
    # Build context parts (only include what we have)
    context_parts = []

    if fit_summary:
        best = fit_summary.get("best_match")
        best_desc = ""
        if best:
            # best is a JobFitScore dict
            best_desc = f"Best match: job_index={best.get('job_index')}, summary: {best.get('summary', 'N/A')}"
        context_parts.append(
            f"FIT SCORES: {fit_summary['strong_matches']} strong matches, "
            f"{fit_summary['partial_matches']} partial matches, "
            f"{fit_summary['stretches']} stretches out of {fit_summary['total_scored']} scored roles. "
            f"{best_desc}"
        )

    if tracker_summary:
        apps_desc = "; ".join(
            f"{a['role']} (status: {a['status']}, applied: {a['applied_at'][:10] if a.get('applied_at') else 'unknown'})"
            for a in tracker_summary["applications"]
        )
        context_parts.append(
            f"APPLICATION HISTORY at {entity_name}: {tracker_summary['total_applications']} past application(s). "
            f"Details: {apps_desc}"
        )

    if comp_summary:
        comp_desc = f"Average package: {comp_summary.get('average_package', 'unknown')}"
        if comp_summary.get("highest_package"):
            comp_desc += f", Highest: {comp_summary['highest_package']}"
        context_parts.append(f"COMPENSATION DATA: {comp_desc}")

    # If we have absolutely nothing, return a simple fallback
    if not context_parts:
        return {
            "digest": f"Exploring {entity_name}. Upload a resume and track applications to get a personalized summary.",
            "has_data": False,
        }

    context_text = "\n".join(context_parts)

    system_prompt = (
        "You are a concise career advisor. Generate a 2-3 sentence personalized digest "
        "for a user looking at a company profile. The digest should:\n"
        "- Reference specific numbers (how many roles match, which is the best fit)\n"
        "- Mention compensation context if available\n"
        "- Note any prior application history if available\n"
        "- Be direct, factual, and helpful — no fluff\n"
        "- Degrade gracefully: if some data is missing, write a shorter valid sentence "
        "covering only what's available. Never mention missing data or apologize.\n"
        "- Do NOT use emojis.\n"
        "- Do NOT use markdown formatting.\n"
        "- Write in second person ('you', 'your').\n"
    )

    prompt = (
        f"Company: {entity_name}\n\n"
        f"Data available:\n{context_text}\n\n"
        f"Write the personalized digest (2-3 sentences max):"
    )

    try:
        digest_text = await llm_service.generate_text(system_prompt, prompt)
        # Clean up any quotes the LLM might wrap the text in
        digest_text = digest_text.strip().strip('"').strip("'")
        return {"digest": digest_text, "has_data": True}
    except Exception as e:
        logger.error(f"Failed to generate digest: {e}")
        # Fallback: build a simple sentence from the data we have
        parts = []
        if fit_summary and fit_summary["strong_matches"] > 0:
            parts.append(f"{fit_summary['strong_matches']} open role(s) strongly match your background")
        elif fit_summary and fit_summary["total_scored"] > 0:
            parts.append(f"{fit_summary['total_scored']} open role(s) have been scored against your resume")
        if tracker_summary:
            parts.append(f"you have {tracker_summary['total_applications']} prior application(s) here")
        
        fallback = f"At {entity_name}: " + ", and ".join(parts) + "." if parts else f"Exploring {entity_name}."
        return {"digest": fallback, "has_data": bool(parts)}

# ── Watch & Notification Routes ───────────────────────────

@company_router.post("/{slug}/watch")
async def watch_company(slug: str, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase
    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()

    # Check limit based on tier
    tier_res = sb.table("users").select("subscription_tier").eq("id", user_id).execute()
    tier = tier_res.data[0].get("subscription_tier", "free") if tier_res.data else "free"
    limit = 15 if tier == "pro" else 3

    current_res = sb.table("watched_companies").select("id").eq("user_id", user_id).execute()
    if len(current_res.data) >= limit:
        return {"error": f"Watch limit reached for {tier} tier ({limit} companies)."}, 400

    sb.table("watched_companies").upsert({
        "user_id": user_id,
        "company_name": entity_name
    }, on_conflict="user_id,company_name").execute()
    
    return {"status": "success", "message": f"Watching {entity_name}"}

@company_router.delete("/{slug}/watch")
async def unwatch_company(slug: str, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase
    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()
    
    sb.table("watched_companies").delete().eq("user_id", user_id).eq("company_name", entity_name).execute()
    return {"status": "success"}

@company_router.get("/{slug}/watch")
async def check_watch_status(slug: str, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase
    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()
    
    res = sb.table("watched_companies").select("id").eq("user_id", user_id).eq("company_name", entity_name).execute()
    return {"is_watched": len(res.data) > 0}

@company_router.get("/notifications")
async def get_notifications(user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase
    sb = get_supabase()
    
    res = sb.table("job_notifications").select("*").eq("user_id", user_id).eq("is_read", False).order("created_at", desc=True).execute()
    return res.data

@company_router.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase
    sb = get_supabase()
    
    sb.table("job_notifications").update({"is_read": True}).eq("id", notif_id).eq("user_id", user_id).execute()
    return {"status": "success"}
