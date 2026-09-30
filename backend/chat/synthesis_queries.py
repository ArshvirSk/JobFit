"""
Reusable Supabase query helpers for cross-company synthesis nodes.

Each function encapsulates a single data-fetching concern so that
synthesis nodes stay focused on orchestration + LLM calls.
All queries hit existing tables — no new connectors or external fetches.
"""

import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional

from backend.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)


async def get_upcoming_interviews(user_id: str, days: int = 7) -> list[dict]:
    """Return detected calendar-interview events within the next N days."""
    sb = get_supabase()
    try:
        res = (
            sb.table("detected_events")
            .select("*")
            .eq("user_id", user_id)
            .eq("event_type", "calendar_interview")
            .in_("status", ["pending", "confirmed"])
            .order("created_at", desc=False)
            .execute()
        )
        if not res.data:
            return []

        cutoff = datetime.now(timezone.utc) + timedelta(days=days)
        upcoming = []
        for ev in res.data:
            event_date_str = ev.get("event_data", {}).get("event_date")
            if not event_date_str:
                continue
            try:
                event_date = datetime.fromisoformat(event_date_str.replace("Z", "+00:00"))
                if event_date <= cutoff:
                    upcoming.append(ev)
            except (ValueError, TypeError):
                continue
        return upcoming
    except Exception as e:
        logger.error(f"Failed to fetch upcoming interviews: {e}")
        return []


async def get_stale_applications(user_id: str, stale_days: int = 14) -> list[dict]:
    """Return tracker entries with no status change in N+ days."""
    sb = get_supabase()
    try:
        res = (
            sb.table("applications")
            .select("*")
            .eq("user_id", user_id)
            .order("applied_at", desc=True)
            .execute()
        )
        if not res.data:
            return []

        cutoff = datetime.now(timezone.utc) - timedelta(days=stale_days)
        stale = []
        for app in res.data:
            # Use updated_at if available, otherwise applied_at
            last_change_str = app.get("updated_at") or app.get("applied_at")
            if not last_change_str:
                continue
            try:
                last_change = datetime.fromisoformat(last_change_str.replace("Z", "+00:00"))
                if last_change < cutoff:
                    days_since = (datetime.now(timezone.utc) - last_change).days
                    app["days_since_update"] = days_since
                    stale.append(app)
            except (ValueError, TypeError):
                continue
        return stale
    except Exception as e:
        logger.error(f"Failed to fetch stale applications: {e}")
        return []


async def get_watched_company_notifications(user_id: str) -> list[dict]:
    """Return unread job notifications from watched companies."""
    sb = get_supabase()
    try:
        res = (
            sb.table("job_notifications")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_read", False)
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch watched notifications: {e}")
        return []


async def get_in_progress_project_ideas(user_id: str) -> list[dict]:
    """Return project ideas the user has marked as 'building'."""
    sb = get_supabase()
    try:
        res = (
            sb.table("project_ideas")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "building")
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch in-progress project ideas: {e}")
        return []


async def get_all_fit_scores(user_id: str) -> list[dict]:
    """Return all job fit scores for the user (across all companies)."""
    sb = get_supabase()
    try:
        res = (
            sb.table("job_fit_scores")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch fit scores: {e}")
        return []


async def get_user_preferences(user_id: str) -> dict:
    """Return the user's onboarding preferences."""
    sb = get_supabase()
    try:
        res = (
            sb.table("user_preferences")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return res.data[0] if res.data else {}
    except Exception as e:
        logger.error(f"Failed to fetch user preferences: {e}")
        return {}


async def get_company_profile_data(
    entity_name: str, categories: list[str] | None = None
) -> dict:
    """Return cached company profile data for the given categories.

    Returns a dict keyed by category name, e.g.
    {"dsa": {...}, "interview_process": {...}, "jobs": {...}}
    """
    sb = get_supabase()
    try:
        q = (
            sb.table("company_profiles")
            .select("category, data")
            .eq("entity_name", entity_name)
        )
        if categories:
            q = q.in_("category", categories)
        res = q.execute()
        return {row["category"]: row["data"] for row in (res.data or [])}
    except Exception as e:
        logger.error(f"Failed to fetch company profile for {entity_name}: {e}")
        return {}


async def get_aggregate_skill_gaps(user_id: str) -> list[dict]:
    """Aggregate missing_requirements across all fit scores, ranked by frequency.

    Returns a list of {"skill": str, "count": int, "companies": list[str]}
    sorted by count descending.
    """
    scores = await get_all_fit_scores(user_id)
    if not scores:
        return []

    skill_counter: Counter = Counter()
    skill_companies: dict[str, set] = {}

    for score_row in scores:
        fit_data = score_row.get("fit_data", {})
        company = score_row.get("company_name", "Unknown")
        missing = fit_data.get("missing_requirements", [])
        for skill in missing:
            normalized = skill.strip().lower()
            if normalized:
                skill_counter[normalized] += 1
                skill_companies.setdefault(normalized, set()).add(company)

    return [
        {
            "skill": skill,
            "count": count,
            "companies": sorted(skill_companies.get(skill, set())),
        }
        for skill, count in skill_counter.most_common()
    ]


async def get_all_applications(user_id: str) -> list[dict]:
    """Return all tracker entries for the user."""
    sb = get_supabase()
    try:
        res = (
            sb.table("applications")
            .select("*")
            .eq("user_id", user_id)
            .order("applied_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch applications: {e}")
        return []


async def get_watched_companies(user_id: str) -> list[dict]:
    """Return the list of companies the user is watching."""
    sb = get_supabase()
    try:
        res = (
            sb.table("watched_companies")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch watched companies: {e}")
        return []


async def run_compound_filter(user_id: str, filters: dict) -> list[dict]:
    """Apply structured filters across existing data dimensions.

    Supported filter keys (all optional):
      - fit_label: str ("strong_match", "partial_match", "stretch")
      - tracker_status: str (e.g. "Applied", "Interview", "Rejected")
      - has_upcoming_interview: bool
      - is_watched: bool
      - posting_recency_days: int (jobs posted within N days)

    Returns a list of result dicts with company/role context.
    """
    results: list[dict] = []

    # Gather base data
    applications = await get_all_applications(user_id)
    fit_scores = await get_all_fit_scores(user_id)
    interviews = await get_upcoming_interviews(user_id, days=30)
    watched = await get_watched_companies(user_id)

    # Index helpers
    interview_companies = set()
    for iv in interviews:
        cn = iv.get("company_name")
        if cn:
            interview_companies.add(cn.lower())

    watched_companies = {w["company_name"].lower() for w in watched}

    # Build fit score index by company
    fit_by_company: dict[str, list[dict]] = {}
    for fs in fit_scores:
        cn = (fs.get("company_name") or "").lower()
        if cn:
            fit_by_company.setdefault(cn, []).append(fs)

    # Build application index by company
    app_by_company: dict[str, list[dict]] = {}
    for app in applications:
        cn = (app.get("company") or "").lower()
        if cn:
            app_by_company.setdefault(cn, []).append(app)

    # Collect all companies referenced across all data
    all_companies = set()
    all_companies.update(fit_by_company.keys())
    all_companies.update(app_by_company.keys())
    all_companies.update(watched_companies)
    all_companies.update(interview_companies)

    # Apply filters per company
    for company in all_companies:
        entry = {
            "company": company.title(),
            "fit_scores": fit_by_company.get(company, []),
            "applications": app_by_company.get(company, []),
            "is_watched": company in watched_companies,
            "has_upcoming_interview": company in interview_companies,
        }

        # Filter: fit_label
        if "fit_label" in filters and filters["fit_label"]:
            target_label = filters["fit_label"].lower().replace(" ", "_")
            matching = [
                fs for fs in entry["fit_scores"]
                if (fs.get("fit_data", {}).get("fit_label", "")
                    .lower().replace(" ", "_")) == target_label
            ]
            if not matching:
                continue
            entry["matched_fit_scores"] = matching

        # Filter: tracker_status
        if "tracker_status" in filters and filters["tracker_status"]:
            target_status = filters["tracker_status"].lower()
            matching_apps = [
                a for a in entry["applications"]
                if a.get("status", "").lower() == target_status
            ]
            if not matching_apps:
                continue
            entry["matched_applications"] = matching_apps

        # Filter: has_upcoming_interview
        if filters.get("has_upcoming_interview"):
            if not entry["has_upcoming_interview"]:
                continue

        # Filter: is_watched
        if filters.get("is_watched"):
            if not entry["is_watched"]:
                continue

        results.append(entry)

    return results
