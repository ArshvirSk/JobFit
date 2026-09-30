import asyncio
import json
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from backend.api.routes import get_current_user_id
from backend.chat.connectors.nodes import (
    FundingConnector,
    LinkedInConnector,
    GlassdoorConnector,
    CompensationConnector,
    BenefitsConnector,
    CompetitorsConnector,
    JobsConnector,
    DSAQuestionsConnector,
    OrgInfoConnector,
    InterviewProcessConnector,
    ExtendedLinksConnector,
)

logger = logging.getLogger(__name__)

company_router = APIRouter(prefix="/api/company", tags=["company"])


@company_router.get("/{slug}/stream")
async def stream_company_profile(
    slug: str, user_id: str = Depends(get_current_user_id)
):
    """
    Parallel fetches the 7 data categories for a company and streams them as SSE.
    """
    entity_name = slug.replace("-", " ").title()  # Normalize

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
            ("org_info", OrgInfoConnector().fetch(entity_name)),
            ("interview_process", InterviewProcessConnector().fetch(entity_name)),
            ("extended_links", ExtendedLinksConnector().fetch(entity_name)),
        ]

        tasks = [
            asyncio.create_task(fetch_category(cat, coro)) for cat, coro in connectors
        ]

        for coro in asyncio.as_completed(tasks):
            category, res = await coro

            data = None
            if res:
                data = res.model_dump()

            chunk = json.dumps({"category": category, "data": data})
            yield f"data: {chunk}\n\n"

        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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

    # ── 1. Gather fit scores & Resume Context ─────────
    fit_summary = None
    resume_context = None
    try:
        # Get user's latest resume
        resume_res = (
            sb.table("base_resumes")
            .select("id, parsed_json")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if resume_res.data and resume_res.data[0].get("parsed_json"):
            resume_id = resume_res.data[0]["id"]
            parsed = resume_res.data[0]["parsed_json"]

            # Extract basic resume context for the LLM
            if isinstance(parsed, dict):
                basics = parsed.get("basics", {})
                resume_context = basics.get("summary") or basics.get("label") or ""
                skills = parsed.get("skills", [])
                if isinstance(skills, list) and skills:
                    skill_names = [
                        s.get("name") if isinstance(s, dict) else str(s)
                        for s in skills[:5]
                    ]
                    skill_str = ", ".join(filter(None, skill_names))
                    if skill_str:
                        resume_context += f" Core skills: {skill_str}."

            # Add GitHub signal if available
            github_res = (
                sb.table("base_resumes")
                .select("raw_text")
                .eq("user_id", user_id)
                .eq("label", "GitHub Profile")
                .execute()
            )
            if github_res.data and github_res.data[0].get("raw_text"):
                github_signal = github_res.data[0]["raw_text"]
                if resume_context:
                    resume_context += f" Additional GitHub Tech Stack: {github_signal[:200]}..."  # Truncate so it doesn't overwhelm the digest
                else:
                    resume_context = f"GitHub Tech Stack: {github_signal[:200]}..."

            # Get all fit scores for this user
            fit_res = (
                sb.table("job_fit_scores")
                .select("fit_data")
                .eq("user_id", user_id)
                .eq("resume_id", resume_id)
                .execute()
            )

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
                    "best_match": (
                        strong[0] if strong else (partial[0] if partial else None)
                    ),
                }
    except Exception as e:
        logger.warning(f"Failed to load fit scores for digest: {e}")

    # ── 2. Gather tracker / application history ──────────────────
    tracker_summary = None
    try:
        apps_res = (
            sb.table("applications")
            .select("company, role, status, applied_at")
            .eq("user_id", user_id)
            .ilike("company", f"%{entity_name}%")
            .order("applied_at", desc=True)
            .limit(5)
            .execute()
        )

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
                ],
            }
    except Exception as e:
        logger.warning(f"Failed to load tracker data for digest: {e}")

    # ── 3. Gather compensation context ───────────────────────────
    comp_summary = None
    try:
        comp_res = (
            sb.table("company_profiles")
            .select("data")
            .eq("entity_name", entity_name)
            .eq("category", "compensation")
            .execute()
        )

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
    # If we have absolutely no personal data (no resume, no fit scores, no tracker),
    # we should NOT generate a digest just based on company-wide compensation.
    if not (fit_summary or tracker_summary or resume_context):
        return {
            "digest": f"Exploring {entity_name}. Upload your resume to see a personalized fit summary for open roles.",
            "has_data": False,
        }

    # Build context parts
    context_parts = []

    if resume_context:
        context_parts.append(f"USER BACKGROUND: {resume_context}")

    if fit_summary:
        best = fit_summary.get("best_match")
        best_desc = ""
        if best:
            best_desc = f"Best match role: {best.get('job_title', 'unknown role')} (Location: {best.get('job_location', 'unknown')}). Fit rationale: {best.get('summary', 'N/A')}"
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
        context_parts.append(
            f"COMPANY-WIDE COMPENSATION (Context only, do not restate verbatim): {comp_desc}"
        )

    context_text = "\n".join(context_parts)

    system_prompt = (
        "You are a concise career advisor. Generate a 2-3 sentence personalized digest "
        "for a user looking at a company profile. The digest MUST:\n"
        "- SYNTHESIZE the user's background with the company's open roles (referencing specific fit scores and best match role).\n"
        "- Explicitly CONNECT the company to THIS user.\n"
        "- NEVER restate company-wide average/highest compensation figures as the main point — that generic data is already shown elsewhere in the UI. Only mention pay loosely if it's relevant to their specific matched role or experience level.\n"
        "- Note any prior application history if available.\n"
        "- Be direct, factual, and helpful — no fluff.\n"
        "- Write in second person ('you', 'your').\n"
        "- Do NOT use emojis.\n"
        "- Do NOT use markdown formatting.\n"
        "- If personal fit data is weak or missing, just summarize what is available gracefully without apologizing."
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
        # Fallback: build a simple sentence from the personal data we have
        parts = []
        if fit_summary and fit_summary["strong_matches"] > 0:
            parts.append(
                f"{fit_summary['strong_matches']} open role(s) strongly match your background"
            )
        elif fit_summary and fit_summary["total_scored"] > 0:
            parts.append(
                f"{fit_summary['total_scored']} open role(s) have been scored against your resume"
            )
        if tracker_summary:
            parts.append(
                f"you have {tracker_summary['total_applications']} prior application(s) here"
            )

        if parts:
            return {
                "digest": f"For {entity_name}, " + " and ".join(parts) + ".",
                "has_data": True,
            }
        return {
            "digest": f"Upload your resume to see personalized fit for {entity_name}.",
            "has_data": False,
        }


# ── Watch & Notification Routes ───────────────────────────


@company_router.post("/{slug}/watch")
async def watch_company(slug: str, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase

    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()

    # Check limit based on tier
    tier_res = sb.table("users").select("subscription_tier").eq("id", user_id).execute()
    tier = (
        tier_res.data[0].get("subscription_tier", "free") if tier_res.data else "free"
    )
    limit = 15 if tier == "pro" else 3

    current_res = (
        sb.table("watched_companies").select("id").eq("user_id", user_id).execute()
    )
    if len(current_res.data) >= limit:
        return {
            "error": f"Watch limit reached for {tier} tier ({limit} companies)."
        }, 400

    sb.table("watched_companies").upsert(
        {"user_id": user_id, "company_name": entity_name},
        on_conflict="user_id,company_name",
    ).execute()

    return {"status": "success", "message": f"Watching {entity_name}"}


@company_router.delete("/{slug}/watch")
async def unwatch_company(slug: str, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase

    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()

    sb.table("watched_companies").delete().eq("user_id", user_id).eq(
        "company_name", entity_name
    ).execute()
    return {"status": "success"}


@company_router.get("/{slug}/watch")
async def check_watch_status(slug: str, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase

    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()

    res = (
        sb.table("watched_companies")
        .select("id")
        .eq("user_id", user_id)
        .eq("company_name", entity_name)
        .execute()
    )
    return {"is_watched": len(res.data) > 0}


@company_router.get("/notifications")
async def get_notifications(user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase

    sb = get_supabase()

    res = (
        sb.table("job_notifications")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_read", False)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data


@company_router.post("/notifications/{notif_id}/read")
async def mark_notification_read(
    notif_id: str, user_id: str = Depends(get_current_user_id)
):
    from backend.services.supabase_client import get_supabase

    sb = get_supabase()

    sb.table("job_notifications").update({"is_read": True}).eq("id", notif_id).eq(
        "user_id", user_id
    ).execute()
    return {"status": "success"}


# ── Connections & Github Projects ────────────────────────


@company_router.get("/{slug}/github_match")
async def get_github_match(slug: str, user_id: str = Depends(get_current_user_id)):
    """Fetch GitHub repos that match the company's tech stack."""
    from backend.services.supabase_client import get_supabase
    from backend.services.llm import llm_service
    import json

    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()

    # Get user's Github data
    gh_res = (
        sb.table("base_resumes")
        .select("raw_text, parsed_json")
        .eq("user_id", user_id)
        .eq("label", "GitHub Profile")
        .execute()
    )
    if not gh_res.data:
        return {"repos": []}

    gh_data = gh_res.data[0].get("parsed_json", {})
    repos = gh_data.get("projects", [])
    if not repos:
        # If projects is not a list of dicts, try extracting from raw_text or just return empty
        # Real GitHub parsing should populate "projects" as a list in parsed_json
        return {"repos": []}

    # Get company open jobs to extract context for the LLM
    jobs_res = (
        sb.table("company_profiles")
        .select("data")
        .eq("entity_name", entity_name)
        .eq("category", "jobs")
        .execute()
    )

    open_roles = []
    if jobs_res.data and jobs_res.data[0].get("data"):
        open_roles = jobs_res.data[0]["data"].get("open_roles", [])

    roles_context = ""
    for role in open_roles:
        roles_context += f"- Title: {role.get('title')}\n"

    from pydantic import BaseModel

    class MatchedRepo(BaseModel):
        repo_name: str
        repo_url: str
        matched_stack: list[str]
        one_line_relevance: str

    class RepoMatchResponse(BaseModel):
        repos: list[MatchedRepo]

    system_prompt = (
        "You are an expert technical recruiter evaluating a candidate's GitHub projects against a company's open job roles. "
        "Select up to 3 projects from the candidate's GitHub that are highly relevant to the company's open roles or tech domain. "
        "For example, if the company is hiring an AI Engineer, prioritize agentic AI or ML projects. "
        "If there are no explicit roles provided, select projects relevant to the company's general tech domain. "
        "If no projects are relevant, return an empty array."
    )

    prompt = f"Company: {entity_name}\n\nOpen Roles:\n{roles_context or 'None listed'}\n\nCandidate's GitHub Projects:\n{json.dumps(repos, indent=2)}\n\nSelect up to 3 relevant projects."

    try:
        match_result = await llm_service.generate_structured(
            system_prompt, prompt, RepoMatchResponse
        )
        # Ensure we don't return more than 3
        matched_repos = [repo.model_dump() for repo in match_result.repos[:3]]
    except Exception as e:
        logger.error(f"Failed to generate github match: {e}")
        matched_repos = []

    return {"repos": matched_repos}


@company_router.get("/{slug}/linkedin_connections")
def get_linkedin_connections(
    slug: str, user_id: str = Depends(get_current_user_id)
):
    """Fetch LinkedIn connections that work at the company."""
    from backend.services.supabase_client import get_supabase
    import re

    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()

    li_res = (
        sb.table("base_resumes")
        .select("parsed_json")
        .eq("user_id", user_id)
        .eq("label", "LinkedIn Data Export")
        .execute()
    )
    if not li_res.data:
        return {"connections": [], "source": "no_export_found"}

    li_data = li_res.data[0].get("parsed_json", {})
    connections_list = li_data.get("connections", [])

    # Diagnostic: log the raw shape of what's actually stored, so upstream
    # parsing bugs are visible instead of silently producing bad matches.
    logger.info(
        f"[linkedin_connections] user={user_id} raw_connections_count={len(connections_list)} "
        f"sample={connections_list[:2] if connections_list else 'EMPTY'}"
    )

    source_status = "parsed_linkedin_export"
    if not connections_list:
        source_status = "export_present_but_empty"

    def _normalize(s: str) -> str:
        # Strip common suffixes/punctuation so "Zomato Ltd." / "Zomato, Inc." /
        # "Zomato India" all normalize toward "zomato" without turning into a
        # substring match against everything.
        s = s.lower().strip()
        s = re.sub(r"[.,]", "", s)
        s = re.sub(r"\b(ltd|inc|india|limited|pvt|private|corp|corporation)\b", "", s)
        return s.strip()

    target = _normalize(entity_name)

    matched_connections = []
    skipped_malformed = 0

    for conn in connections_list:
        name = (conn.get("Name") or "").strip()
        comp = (conn.get("Company") or "").strip()
        position = (conn.get("Position") or "").strip()

        # Hard requirement: a real connection record from the actual
        # LinkedIn CSV must have a Name AND a Company. If either is
        # missing, this is not a genuine parsed connection — do not match
        # it against anything. This is what was letting empty/placeholder
        # rows match every single company lookup via the old substring
        # check ("" in "zomato" == True).
        if not name or not comp:
            skipped_malformed += 1
            continue

        norm_comp = _normalize(comp)
        if not norm_comp:
            skipped_malformed += 1
            continue

        # Word-boundary match instead of raw substring containment —
        # avoids "Meta" matching "Metasearch Inc" and vice versa, and
        # requires an actual token match, not just character overlap.
        if norm_comp == target or re.search(rf"\b{re.escape(target)}\b", norm_comp):
            matched_connections.append(
                {
                    "name": name,
                    "position": position or "Employee",
                    "url": conn.get("URL")
                    or f"https://www.linkedin.com/search/results/people/?keywords={name} {entity_name}",
                }
            )

    if skipped_malformed:
        logger.warning(
            f"[linkedin_connections] user={user_id} skipped {skipped_malformed} malformed "
            f"connection record(s) missing Name/Company — check the LinkedIn zip parser, "
            f"this usually means Connections.csv rows aren't being parsed correctly, or "
            f"non-connection data is being written into the same 'connections' array."
        )

    fallback_actions = None
    if not matched_connections:
        import urllib.parse
        alumni_links = []
        education = li_data.get("education", [])
        for edu in education:
            inst = edu.get("institution")
            if inst:
                inst_enc = urllib.parse.quote(inst)
                entity_enc = urllib.parse.quote(entity_name)
                # This uses a generic keyword search since we don't have school IDs
                url = f"https://www.linkedin.com/search/results/people/?keywords={inst_enc} {entity_enc}"
                if len(alumni_links) < 3: # Keep top 3
                    alumni_links.append({"school": inst, "url": url})
                    
        adjacent_connections = []
        comp_res = sb.table("company_profiles").select("data").eq("entity_name", entity_name).eq("category", "org_info").execute()
        if comp_res.data and comp_res.data[0].get("data"):
            competitors = comp_res.data[0]["data"].get("competitors", [])
            norm_competitors = [_normalize(c) for c in competitors if c]
            if norm_competitors:
                for conn in connections_list:
                    name = (conn.get("Name") or "").strip()
                    comp = (conn.get("Company") or "").strip()
                    if not name or not comp:
                        continue
                    norm_comp = _normalize(comp)
                    if not norm_comp:
                        continue
                    
                    for nc in norm_competitors:
                        if nc == norm_comp or re.search(rf"\b{re.escape(nc)}\b", norm_comp):
                            adjacent_connections.append({
                                "name": name,
                                "company": comp,
                                "url": conn.get("URL") or f"https://www.linkedin.com/search/results/people/?keywords={name} {comp}"
                            })
                            break
                            
        entity_enc = urllib.parse.quote(entity_name)
        search_links = {
            "people_search": f"https://www.linkedin.com/search/results/people/?keywords={entity_enc}",
            "second_degree": f"https://www.linkedin.com/search/results/people/?keywords={entity_enc}&network=%5B%22S%22%5D"
        }
        
        fallback_actions = {
            "alumni_links": alumni_links,
            "adjacent_connections": adjacent_connections[:5], # Limit to 5
            "search_links": search_links
        }
        
    manual_res = sb.table("manual_contacts").select("*").eq("user_id", user_id).ilike("company_name", entity_name).execute()
    manual_contacts = manual_res.data if manual_res.data else []

    return {
        "connections": matched_connections,
        "manual_contacts": manual_contacts,
        "source": source_status,
        "total_stored_connections": len(connections_list),
        "fallback_actions": fallback_actions
    }
class OutreachDraftRequest(BaseModel):
    best_fit_role: Optional[str] = None
    github_project: Optional[str] = None

@company_router.post("/{slug}/outreach_draft")
async def generate_outreach_draft(slug: str, req: OutreachDraftRequest = None, user_id: str = Depends(get_current_user_id)):
    """Generate a cold outreach message template using the LLM."""
    from backend.services.supabase_client import get_supabase
    from backend.services.llm import llm_service
    
    entity_name = slug.replace("-", " ").title()
    sb = get_supabase()
    
    # Get user context
    resume_res = sb.table("base_resumes").select("parsed_json").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
    user_context = "No resume data available."
    if resume_res.data and resume_res.data[0].get("parsed_json"):
        parsed = resume_res.data[0]["parsed_json"]
        basics = parsed.get("basics", {})
        title = basics.get("label", "")
        summary = basics.get("summary", "")
        user_context = f"Title: {title}\nSummary: {summary}"
        
    extra_context = ""
    if req:
        if req.best_fit_role:
            extra_context += f"\nBest Fit Role the user is interested in: {req.best_fit_role}"
        if req.github_project:
            extra_context += f"\nUser's Relevant GitHub Project Match: {req.github_project}"

    system_prompt = (
        "You are an expert career coach. Write a short, professional, and genuine cold outreach message "
        "for a candidate to send to a connection or recruiter on LinkedIn at the specified company.\n"
        "RULES:\n"
        "- Keep it strictly under 80 words (2-4 sentences max).\n"
        "- Do NOT use generic phrases like 'I'd love to learn more about opportunities'.\n"
        "- If a 'Best Fit Role' is provided, explicitly reference that specific role instead of a generic job inquiry.\n"
        "- If a 'Relevant GitHub Project' is provided, mention it briefly to show concrete proof of work/fit.\n"
        "- End with a light, low-pressure ask (e.g. 'would you be open to a quick chat about your experience there?' or similar).\n"
        "- Include placeholders like [Name] for the user to fill in.\n"
        "- Do not include a subject line.\n"
        "- Just return the message text directly."
    )
    
    prompt = f"Company: {entity_name}\n\nCandidate Background:\n{user_context}{extra_context}\n\nWrite the outreach message:"
    
    try:
        draft = await llm_service.generate_text(system_prompt, prompt)
    except Exception as e:
        logger.error(f"Failed to generate outreach draft: {e}")
        role_text = f" the {req.best_fit_role} role" if req and req.best_fit_role else " opportunities"
        draft = f"Hi [Name],\n\nI'm reaching out because I'm very interested in{role_text} at {entity_name}. Would you be open to a quick chat about your experience there?\n\nBest,\n[Your Name]"
        
    return {"draft": draft}

class ManualContactRequest(BaseModel):
    name: str
    title: Optional[str] = None
    note: Optional[str] = None
    linkedin_url: Optional[str] = None

@company_router.post("/{slug}/manual_contacts")
def add_manual_contact(slug: str, contact: ManualContactRequest, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase
    sb = get_supabase()
    entity_name = slug.replace("-", " ").title()
    
    data = {
        "user_id": user_id,
        "company_name": entity_name,
        "name": contact.name,
        "title": contact.title,
        "note": contact.note,
        "linkedin_url": contact.linkedin_url,
        "source": "manual_entry"
    }
    
    res = sb.table("manual_contacts").insert(data).execute()
    return res.data[0] if res.data else None

@company_router.put("/{slug}/manual_contacts/{contact_id}")
def update_manual_contact(slug: str, contact_id: str, contact: ManualContactRequest, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase
    sb = get_supabase()
    
    data = {
        "name": contact.name,
        "title": contact.title,
        "note": contact.note,
        "linkedin_url": contact.linkedin_url,
        "updated_at": "now()"
    }
    
    res = sb.table("manual_contacts").update(data).eq("id", contact_id).eq("user_id", user_id).execute()
    return res.data[0] if res.data else None

@company_router.delete("/{slug}/manual_contacts/{contact_id}")
def delete_manual_contact(slug: str, contact_id: str, user_id: str = Depends(get_current_user_id)):
    from backend.services.supabase_client import get_supabase
    sb = get_supabase()
    sb.table("manual_contacts").delete().eq("id", contact_id).eq("user_id", user_id).execute()
    return {"status": "success"}

class ProjectIdeaRequest(BaseModel):
    skill_gap: str
    company_name: str
    job_title: str

class ProjectIdeaStatusUpdate(BaseModel):
    status: str

class ProjectIdeaOutput(BaseModel):
    project_title: str
    project_description: str
    estimated_time: str
    why_this_helps: str
    stretch_from_current_skills: str

@company_router.post("/{slug}/jobs/{job_hash}/project_ideas")
async def get_or_generate_project_idea(
    slug: str, 
    job_hash: str, 
    req: ProjectIdeaRequest, 
    user_id: str = Depends(get_current_user_id)
):
    from backend.services.supabase_client import get_supabase
    from backend.services.llm_service import generate_structured
    
    sb = get_supabase()
    
    # Check cache
    existing = sb.table("project_ideas").select("*").eq("user_id", user_id).eq("job_hash", job_hash).eq("skill_gap", req.skill_gap).execute()
    if existing.data:
        return existing.data[0]
        
    # Get user context
    user_profile = sb.table("user_profiles").select("parsed_resume").eq("id", user_id).execute()
    resume_context = "No resume provided."
    if user_profile.data and user_profile.data[0].get("parsed_resume"):
        resume_context = str(user_profile.data[0]["parsed_resume"])
        
    github_profile = sb.table("github_profiles").select("repositories").eq("user_id", user_id).execute()
    github_context = "No github profile provided."
    if github_profile.data and github_profile.data[0].get("repositories"):
        repos = github_profile.data[0]["repositories"]
        github_context = "\\n".join([f"- {r.get('name')}: {r.get('description')} ({r.get('language')})" for r in repos[:5]])

    system_msg = (
        "You are an expert technical career coach. Your task is to suggest a concrete, buildable project "
        "to help the user close a specific skill gap for a job they are interested in. "
        "CRITICAL INSTRUCTIONS: "
        "1. DO NOT suggest generic tutorials, courses, or 'learning' apps (e.g. 'build a to-do app to learn X'). "
        "2. The project MUST be portfolio-worthy and directly applicable to the target company's industry or the role. "
        "3. Read the user's existing resume and GitHub repos, and strongly prefer suggesting an EXTENSION to one of their "
        "existing projects, or something that clearly builds on their existing stack so they don't start from zero."
    )
    
    prompt = f"""
Target Company: {req.company_name}
Target Role: {req.job_title}
Skill Gap to Close: {req.skill_gap}

User's Existing Resume Context:
{resume_context}

User's Top GitHub Repos:
{github_context}

Generate a project idea that closes the '{req.skill_gap}' gap by building on the user's existing skills/projects.
"""
    
    idea = await generate_structured(system_msg, prompt, ProjectIdeaOutput)
    
    # Save to db
    insert_data = {
        "user_id": user_id,
        "job_hash": job_hash,
        "skill_gap": req.skill_gap,
        "project_title": idea.project_title,
        "project_description": idea.project_description,
        "estimated_time": idea.estimated_time,
        "why_this_helps": idea.why_this_helps,
        "stretch_from_current_skills": idea.stretch_from_current_skills,
        "status": "suggested"
    }
    
    saved = sb.table("project_ideas").insert(insert_data).execute()
    return saved.data[0] if saved.data else insert_data

@company_router.patch("/{slug}/jobs/{job_hash}/project_ideas/{idea_id}/status")
def update_project_idea_status(
    slug: str,
    job_hash: str,
    idea_id: str,
    req: ProjectIdeaStatusUpdate,
    user_id: str = Depends(get_current_user_id)
):
    from backend.services.supabase_client import get_supabase
    sb = get_supabase()
    res = sb.table("project_ideas").update({"status": req.status}).eq("id", idea_id).eq("user_id", user_id).execute()
    return res.data[0] if res.data else None

