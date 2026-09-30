"""
Cross-company synthesis nodes for the chat pipeline.

Each node:
1. Queries existing Supabase tables via synthesis_queries helpers
2. Assembles structured context
3. Calls the LLM to produce a synthesized, conversational response
4. Populates action_buttons metadata for frontend action rendering

No new connectors or external API calls — pure synthesis from stored data.
"""

import json
import logging
from typing import Optional
from pydantic import BaseModel, Field

from backend.services.llm import llm_service
from backend.chat.synthesis_queries import (
    get_upcoming_interviews,
    get_stale_applications,
    get_watched_company_notifications,
    get_in_progress_project_ideas,
    get_all_fit_scores,
    get_user_preferences,
    get_company_profile_data,
    get_aggregate_skill_gaps,
    get_all_applications,
    run_compound_filter,
)

logger = logging.getLogger(__name__)


# ── Shared response model for action buttons ─────────────

class ActionButton(BaseModel):
    label: str
    action_type: str  # email_draft, open_profile, view_project_idea, open_tailor
    payload: dict = Field(default_factory=dict)


class SynthesisLLMResponse(BaseModel):
    """Structured output for synthesis nodes that produce text + actions."""
    message: str = Field(description="The conversational response to show the user")


# ── Helper ───────────────────────────────────────────────

def _set_synthesis_response(
    state: dict,
    message: str,
    response_type: str,
    actions: list[ActionButton] | None = None,
) -> dict:
    """Set standard synthesis response fields on the pipeline state."""
    state["response_text"] = message
    state["response_type"] = response_type
    if actions:
        state["action_buttons"] = [a.model_dump() for a in actions]
    else:
        state["action_buttons"] = []
    return state


# ── 1. Daily / Weekly Briefing ───────────────────────────

async def daily_briefing_node(state: dict) -> dict:
    """Assemble a synthesized job-search status update."""
    user_id = state.get("user_id", "")

    prefs = await get_user_preferences(user_id)
    stale_days = prefs.get("stale_threshold_days", 14) or 14

    interviews = await get_upcoming_interviews(user_id, days=7)
    stale_apps = await get_stale_applications(user_id, stale_days=stale_days)
    notifications = await get_watched_company_notifications(user_id)
    building_projects = await get_in_progress_project_ideas(user_id)

    # Build context for the LLM
    context_parts = []

    if interviews:
        interview_lines = []
        for iv in interviews:
            ed = iv.get("event_data", {})
            company = iv.get("company_name") or "Unknown company"
            date_str = ed.get("event_date", "")
            title = ed.get("event_title", "Interview")
            interview_lines.append(f"- {title} at {company} on {date_str}")
        context_parts.append(
            f"UPCOMING INTERVIEWS ({len(interviews)}):\n" + "\n".join(interview_lines)
        )

    if stale_apps:
        stale_lines = []
        for app in stale_apps[:5]:  # Limit to 5
            days_n = app.get("days_since_update", "?")
            stale_lines.append(
                f"- {app.get('company', '?')} / {app.get('role', '?')} — "
                f"{days_n} days since last update (status: {app.get('status', '?')})"
            )
        context_parts.append(
            f"STALE APPLICATIONS ({len(stale_apps)} total, showing top 5):\n"
            + "\n".join(stale_lines)
        )

    if notifications:
        notif_lines = []
        for n in notifications[:5]:
            notif_lines.append(
                f"- {n.get('job_title', '?')} at {n.get('company_name', '?')} "
                f"(fit: {n.get('fit_label', '?')})"
            )
        context_parts.append(
            f"NEW MATCHES AT WATCHED COMPANIES ({len(notifications)}):\n"
            + "\n".join(notif_lines)
        )

    if building_projects:
        proj_lines = [
            f"- \"{p.get('project_title', '?')}\" (skill gap: {p.get('skill_gap', '?')})"
            for p in building_projects[:3]
        ]
        context_parts.append(
            f"IN-PROGRESS PROJECTS:\n" + "\n".join(proj_lines)
        )

    if not context_parts:
        return _set_synthesis_response(
            state,
            "Your job search dashboard is quiet right now — no upcoming interviews, "
            "stale applications, or new matches to report. Keep applying and checking "
            "back, or ask me to look up a company you're interested in.",
            "briefing",
        )

    context_text = "\n\n".join(context_parts)

    system_prompt = (
        "You are a concise career copilot providing a daily job search briefing. "
        "Synthesize the data below into a SHORT, actionable summary — a brief paragraph "
        "plus a few bullet points. Do NOT dump all the raw data. Prioritize what needs "
        "the user's attention most (upcoming interviews > stale apps > new matches). "
        "Be direct and second-person ('you have', 'your'). "
        "Do NOT use emojis. Do NOT use markdown headers (##). "
        "Use bullet points for actionable items."
    )

    prompt = f"Data:\n{context_text}\n\nGenerate the briefing."

    try:
        result = await llm_service.generate_structured(
            system_prompt, prompt, SynthesisLLMResponse
        )
        message = result.message
    except Exception as e:
        logger.error(f"Briefing LLM call failed: {e}")
        message = "Here's a quick update on your job search:\n\n"
        if interviews:
            message += f"- You have {len(interviews)} upcoming interview(s) in the next 7 days\n"
        if stale_apps:
            message += f"- {len(stale_apps)} application(s) haven't been updated in {stale_days}+ days\n"
        if notifications:
            message += f"- {len(notifications)} new match(es) at your watched companies\n"

    # Build action buttons
    actions: list[ActionButton] = []
    if stale_apps:
        for app in stale_apps[:2]:
            slug = app.get("company", "").replace(" ", "-").lower()
            actions.append(ActionButton(
                label=f"Follow up: {app.get('company', '?')}",
                action_type="email_draft",
                payload={
                    "company": app.get("company", ""),
                    "role": app.get("role", ""),
                    "application_id": app.get("id"),
                    "days_since": app.get("days_since_update", 0),
                },
            ))
    if notifications:
        company_name = notifications[0].get("company_name", "")
        slug = company_name.replace(" ", "-").lower()
        actions.append(ActionButton(
            label=f"View {company_name}",
            action_type="open_profile",
            payload={"slug": slug},
        ))

    return _set_synthesis_response(state, message, "briefing", actions)


# ── 2. Interview Prep Bundling ───────────────────────────

async def interview_prep_node(state: dict) -> dict:
    """Bundle company digest + DSA + process + fit + project ideas for interview prep."""
    user_id = state.get("user_id", "")
    target_company = state.get("thread_intent_company")

    # If no company specified, try to find the next upcoming interview
    if not target_company:
        interviews = await get_upcoming_interviews(user_id, days=7)
        if interviews:
            target_company = interviews[0].get("company_name")

    if not target_company:
        return _set_synthesis_response(
            state,
            "I'd love to help you prep, but I couldn't determine which company you're "
            "interviewing with. Could you specify the company name? For example: "
            "'prep me for my Google interview'",
            "interview_prep",
        )

    # Fetch all relevant data
    profile_data = await get_company_profile_data(
        target_company,
        ["dsa", "interview_process", "jobs", "compensation", "org_info", "funding"],
    )

    # Get fit scores for this company
    all_scores = await get_all_fit_scores(user_id)
    company_scores = [
        s for s in all_scores
        if (s.get("company_name", "").lower() == target_company.lower())
    ]

    # Get relevant project ideas
    sb_project_ideas = []
    try:
        from backend.services.supabase_client import get_supabase
        sb = get_supabase()
        res = (
            sb.table("project_ideas")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        # Filter to this company or related skill gaps
        if res.data:
            for idea in res.data:
                if target_company.lower() in (idea.get("skill_gap", "") + idea.get("project_title", "")).lower():
                    sb_project_ideas.append(idea)
            # If no direct match, take any building/suggested ideas
            if not sb_project_ideas:
                sb_project_ideas = [
                    i for i in res.data
                    if i.get("status") in ("building", "suggested")
                ][:3]
    except Exception as e:
        logger.warning(f"Failed to fetch project ideas for interview prep: {e}")

    # Build context
    context_parts = [f"Company: {target_company}"]

    if profile_data.get("org_info"):
        org = profile_data["org_info"]
        context_parts.append(
            f"COMPANY INFO: Founded {org.get('founded_year', '?')}, "
            f"Headcount: {org.get('headcount_range', '?')}, "
            f"HQ: {org.get('hq_location', '?')}"
        )

    if profile_data.get("funding"):
        f = profile_data["funding"]
        context_parts.append(
            f"FUNDING: Last round: {f.get('last_round_stage', '?')} "
            f"({f.get('last_round_amount', '?')}), "
            f"Valuation: {f.get('valuation', '?')}"
        )

    if profile_data.get("interview_process"):
        ip = profile_data["interview_process"]
        context_parts.append(
            f"INTERVIEW PROCESS: {ip.get('typical_rounds_summary', 'No data available')}"
        )

    if profile_data.get("dsa"):
        dsa = profile_data["dsa"]
        topics = dsa.get("topics_frequency", [])
        if topics:
            topic_str = ", ".join(
                f"{t.get('topic', '?')} ({t.get('relative_frequency', '?')})"
                for t in topics[:6]
            )
            context_parts.append(f"DSA FOCUS AREAS: {topic_str}")
        questions = dsa.get("reported_questions", [])
        if questions:
            q_lines = [
                f"- {q.get('title', '?')} [{q.get('difficulty', '?')}] ({q.get('topic', '?')}) — {q.get('leetcode_url', '')}"
                for q in questions[:5]
            ]
            context_parts.append("KEY DSA QUESTIONS:\n" + "\n".join(q_lines))

    if company_scores:
        score_lines = []
        for s in company_scores[:3]:
            fd = s.get("fit_data", {})
            score_lines.append(
                f"- {fd.get('job_title', s.get('job_hash', '?')[:8])}: "
                f"{fd.get('fit_label', '?')} — {fd.get('summary', '')}"
            )
        context_parts.append("YOUR FIT SCORES:\n" + "\n".join(score_lines))

    if profile_data.get("compensation"):
        comp = profile_data["compensation"]
        context_parts.append(
            f"COMPENSATION: Avg: {comp.get('average_package', '?')}, "
            f"Top: {comp.get('highest_package', '?')}"
        )

    if sb_project_ideas:
        idea_lines = [
            f"- \"{p.get('project_title', '?')}\" — {p.get('why_this_helps', '')[:80]}"
            for p in sb_project_ideas[:2]
        ]
        context_parts.append("RELEVANT PROJECT IDEAS:\n" + "\n".join(idea_lines))

    context_text = "\n\n".join(context_parts)

    system_prompt = (
        "You are an expert interview coach. The user has an upcoming interview. "
        "Create a cohesive, well-structured prep summary from the data below. "
        "Structure it as:\n"
        "1. Quick company context (1-2 sentences)\n"
        "2. Interview process and what to expect\n"
        "3. Technical prep priorities (DSA topics + key questions to practice)\n"
        "4. Your fit analysis — strengths to highlight and gaps to address\n"
        "5. Talking points from your project experience\n\n"
        "Keep each section concise. Use bullet points. "
        "Be direct and actionable — this is a prep briefing, not an essay. "
        "Do NOT use emojis. Write in second person."
    )

    prompt = f"Data:\n{context_text}\n\nGenerate the interview prep summary."

    try:
        result = await llm_service.generate_structured(
            system_prompt, prompt, SynthesisLLMResponse
        )
        message = result.message
    except Exception as e:
        logger.error(f"Interview prep LLM call failed: {e}")
        message = f"Here's what I have for your {target_company} interview prep:\n\n"
        if profile_data.get("interview_process"):
            ip = profile_data["interview_process"]
            message += f"**Process:** {ip.get('typical_rounds_summary', 'Check their careers page')}\n\n"
        if profile_data.get("dsa"):
            message += "**DSA Topics:** Check the company panel for detailed question bank\n\n"
        message += "Open the company profile for full details."

    # Action buttons
    slug = target_company.replace(" ", "-").lower()
    actions = [
        ActionButton(
            label=f"Open {target_company} profile",
            action_type="open_profile",
            payload={"slug": slug},
        ),
    ]

    return _set_synthesis_response(state, message, "interview_prep", actions)


# ── 3. Stale Application Nudges ──────────────────────────

async def stale_nudges_node(state: dict) -> dict:
    """Surface applications that haven't been updated recently, with follow-up actions."""
    user_id = state.get("user_id", "")

    prefs = await get_user_preferences(user_id)
    stale_days = prefs.get("stale_threshold_days", 14) or 14

    stale_apps = await get_stale_applications(user_id, stale_days=stale_days)

    if not stale_apps:
        return _set_synthesis_response(
            state,
            f"All clear — none of your tracked applications have been sitting idle "
            f"for more than {stale_days} days. Your pipeline looks active.",
            "stale_nudges",
        )

    # Build context
    app_lines = []
    for app in stale_apps[:6]:
        app_lines.append(
            f"- {app.get('company', '?')} / {app.get('role', '?')} — "
            f"{app.get('days_since_update', '?')} days since last update, "
            f"current status: {app.get('status', '?')}"
        )

    context_text = (
        f"STALE APPLICATIONS (no update in {stale_days}+ days):\n"
        + "\n".join(app_lines)
    )

    system_prompt = (
        "You are a career coach helping the user follow up on stale job applications. "
        "For each stale application, write a brief, specific nudge. Format as:\n"
        "A short intro sentence about the situation, then a bullet for each app with "
        "the company, role, how many days it's been, and a specific suggestion "
        "(e.g. follow-up email, check portal, reach out to connection). "
        "Do NOT use emojis. Be direct and practical."
    )

    prompt = f"Data:\n{context_text}\n\nGenerate the nudges."

    try:
        result = await llm_service.generate_structured(
            system_prompt, prompt, SynthesisLLMResponse
        )
        message = result.message
    except Exception as e:
        logger.error(f"Stale nudges LLM call failed: {e}")
        message = f"You have {len(stale_apps)} application(s) that haven't been updated in {stale_days}+ days:\n\n"
        for app in stale_apps[:5]:
            message += (
                f"- **{app.get('company', '?')}** / {app.get('role', '?')} — "
                f"{app.get('days_since_update', '?')} days\n"
            )

    # Action buttons — draft follow-up email for each stale app
    actions: list[ActionButton] = []
    for app in stale_apps[:3]:  # Max 3 buttons
        actions.append(ActionButton(
            label=f"Draft follow-up: {app.get('company', '?')}",
            action_type="email_draft",
            payload={
                "company": app.get("company", ""),
                "role": app.get("role", ""),
                "application_id": app.get("id"),
                "days_since": app.get("days_since_update", 0),
            },
        ))

    return _set_synthesis_response(state, message, "stale_nudges", actions)


# ── 4. Cross-Company Skill Gap Pattern ───────────────────

async def skill_gap_pattern_node(state: dict) -> dict:
    """Surface which missing skills recur across fit-scored jobs."""
    user_id = state.get("user_id", "")

    skill_gaps = await get_aggregate_skill_gaps(user_id)

    if not skill_gaps:
        return _set_synthesis_response(
            state,
            "I don't have enough fit-score data to identify skill gap patterns yet. "
            "Try looking up a few companies you're interested in — I'll score your "
            "fit against their open roles, and the patterns will emerge.",
            "skill_gap",
        )

    # Take top 8 for the LLM
    top_gaps = skill_gaps[:8]
    gap_lines = [
        f"- \"{g['skill']}\" — appears in {g['count']} role(s) "
        f"across: {', '.join(g['companies'][:3])}"
        for g in top_gaps
    ]

    context_text = "RECURRING SKILL GAPS (ranked by frequency):\n" + "\n".join(gap_lines)

    system_prompt = (
        "You are a career strategist analyzing a user's skill gaps across multiple "
        "job applications. Synthesize the data below into actionable insights:\n"
        "1. Identify the top 2-3 most impactful skills to close (based on frequency)\n"
        "2. For each, give a concrete suggestion — a project idea, course, or way to "
        "demonstrate the skill\n"
        "3. Note which companies these gaps apply to\n\n"
        "Be concise and actionable. Use bullet points. "
        "Do NOT use emojis. Write in second person."
    )

    prompt = f"Data:\n{context_text}\n\nSynthesize the skill gap analysis."

    try:
        result = await llm_service.generate_structured(
            system_prompt, prompt, SynthesisLLMResponse
        )
        message = result.message
    except Exception as e:
        logger.error(f"Skill gap LLM call failed: {e}")
        message = "Here are the skills that keep coming up across your job search:\n\n"
        for g in top_gaps[:5]:
            message += f"- **{g['skill']}** — needed for {g['count']} role(s)\n"

    return _set_synthesis_response(state, message, "skill_gap")


# ── 5. "What Should I Apply To" Recommendation ──────────

async def apply_recommendation_node(state: dict) -> dict:
    """Cross-reference fit scores with preferences to recommend top matches."""
    user_id = state.get("user_id", "")

    prefs = await get_user_preferences(user_id)
    fit_scores = await get_all_fit_scores(user_id)

    if not fit_scores:
        return _set_synthesis_response(
            state,
            "I don't have any fit scores to base recommendations on yet. "
            "Try looking up some companies you're interested in — I'll score your "
            "resume against their open roles and can then make personalized "
            "recommendations.",
            "recommendations",
        )

    # Score and rank
    target_roles = [r.lower() for r in (prefs.get("target_roles") or [])]
    target_locations = [l.lower() for l in (prefs.get("locations") or [])]
    work_mode = (prefs.get("work_mode") or "").lower()

    ranked: list[dict] = []
    for score_row in fit_scores:
        fd = score_row.get("fit_data", {})
        fit_label = fd.get("fit_label", "stretch")
        company = score_row.get("company_name", "Unknown")

        # Compute a simple ranking score
        label_weight = {"strong_match": 3, "partial_match": 2, "stretch": 1}
        rank = label_weight.get(fit_label.lower().replace(" ", "_"), 0)

        # Boost for preference alignment
        job_title = fd.get("job_title", "").lower()
        job_location = fd.get("job_location", "").lower()

        if target_roles and any(tr in job_title for tr in target_roles):
            rank += 1
        if target_locations and any(tl in job_location for tl in target_locations):
            rank += 1
        if work_mode and work_mode in job_location:
            rank += 0.5

        ranked.append({
            "company": company,
            "job_title": fd.get("job_title", "Unknown Role"),
            "job_location": fd.get("job_location", "Unknown"),
            "fit_label": fit_label,
            "summary": fd.get("summary", ""),
            "matched_requirements": fd.get("matched_requirements", []),
            "rank_score": rank,
        })

    # Sort by rank, take top 5
    ranked.sort(key=lambda x: x["rank_score"], reverse=True)
    top_5 = ranked[:5]

    # Build context
    rec_lines = []
    for r in top_5:
        rec_lines.append(
            f"- {r['company']} / {r['job_title']} ({r['job_location']}) — "
            f"fit: {r['fit_label']}. {r['summary']}"
        )

    pref_context = ""
    if prefs:
        pref_parts = []
        if prefs.get("target_roles"):
            pref_parts.append(f"Target roles: {', '.join(prefs['target_roles'])}")
        if prefs.get("locations"):
            pref_parts.append(f"Preferred locations: {', '.join(prefs['locations'])}")
        if prefs.get("work_mode"):
            pref_parts.append(f"Work mode: {prefs['work_mode']}")
        pref_context = "USER PREFERENCES: " + "; ".join(pref_parts) + "\n\n"

    context_text = (
        f"{pref_context}"
        f"TOP MATCHES (ranked by fit + preference alignment):\n"
        + "\n".join(rec_lines)
    )

    system_prompt = (
        "You are a career advisor recommending jobs to apply for. Present the top "
        "matches as a short, curated recommendation list. For each:\n"
        "- Company and role\n"
        "- One-line reasoning why it's a good fit for THIS user\n\n"
        "Open with a brief sentence about the user's search context. "
        "Keep it to 3-5 recommendations max. Do NOT use emojis. "
        "Be specific about why each is recommended — don't just restate the fit label."
    )

    prompt = f"Data:\n{context_text}\n\nGenerate the recommendations."

    try:
        result = await llm_service.generate_structured(
            system_prompt, prompt, SynthesisLLMResponse
        )
        message = result.message
    except Exception as e:
        logger.error(f"Recommendation LLM call failed: {e}")
        message = "Based on your fit scores, here are your top matches:\n\n"
        for r in top_5:
            message += f"- **{r['company']}** / {r['job_title']} — {r['fit_label']}\n"

    # Action buttons
    actions: list[ActionButton] = []
    for r in top_5[:3]:
        slug = r["company"].replace(" ", "-").lower()
        actions.append(ActionButton(
            label=f"View {r['company']}",
            action_type="open_profile",
            payload={"slug": slug},
        ))

    return _set_synthesis_response(state, message, "recommendations", actions)


# ── 6. Compound Query ────────────────────────────────────

async def compound_query_node(state: dict) -> dict:
    """Execute a structured filter query across multiple data dimensions."""
    user_id = state.get("user_id", "")
    filters = state.get("thread_intent_filters") or {}

    if not filters:
        return _set_synthesis_response(
            state,
            "I understood you want to filter across your data, but I couldn't "
            "extract specific filter criteria. Try something like: 'show me companies "
            "where I have a strong match and an upcoming interview' or 'which watched "
            "companies have new roles'.",
            "compound_results",
        )

    results = await run_compound_filter(user_id, filters)

    if not results:
        filter_desc = ", ".join(f"{k}={v}" for k, v in filters.items() if v)
        return _set_synthesis_response(
            state,
            f"No results matched your query ({filter_desc}). This could mean you "
            f"don't have data in all the dimensions you're filtering on, or the "
            f"intersection is empty.",
            "compound_results",
        )

    # Build context
    result_lines = []
    for r in results[:8]:
        parts = [r["company"]]
        if r.get("matched_fit_scores"):
            labels = [
                s.get("fit_data", {}).get("fit_label", "?")
                for s in r["matched_fit_scores"]
            ]
            parts.append(f"fit: {', '.join(labels)}")
        if r.get("has_upcoming_interview"):
            parts.append("has upcoming interview")
        if r.get("is_watched"):
            parts.append("watched")
        if r.get("matched_applications"):
            statuses = [a.get("status", "?") for a in r["matched_applications"]]
            parts.append(f"tracker: {', '.join(statuses)}")
        result_lines.append("- " + " | ".join(parts))

    filter_desc = ", ".join(f"{k}: {v}" for k, v in filters.items() if v)
    context_text = (
        f"FILTERS APPLIED: {filter_desc}\n\n"
        f"MATCHING COMPANIES ({len(results)}):\n"
        + "\n".join(result_lines)
    )

    system_prompt = (
        "You are a career assistant presenting filtered job search results. "
        "Summarize the matching companies in a clear, scannable format. "
        "Start with a one-line summary of what was filtered, then list results. "
        "For each company, mention the relevant attributes that matched the filter. "
        "Do NOT use emojis. Be concise."
    )

    prompt = f"Data:\n{context_text}\n\nPresent the results."

    try:
        result_resp = await llm_service.generate_structured(
            system_prompt, prompt, SynthesisLLMResponse
        )
        message = result_resp.message
    except Exception as e:
        logger.error(f"Compound query LLM call failed: {e}")
        message = f"Found {len(results)} companies matching your filters ({filter_desc}):\n\n"
        for line in result_lines[:5]:
            message += f"{line}\n"

    # Action buttons
    actions: list[ActionButton] = []
    for r in results[:3]:
        slug = r["company"].replace(" ", "-").lower()
        actions.append(ActionButton(
            label=f"View {r['company']}",
            action_type="open_profile",
            payload={"slug": slug},
        ))

    return _set_synthesis_response(state, message, "compound_results", actions)
