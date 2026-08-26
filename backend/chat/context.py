"""
Thread-level company context manager.

Stores and retrieves the active company context (profile, fit scores,
resume summary) on the chat_threads table so follow-up questions can
reference already-fetched data without re-running connectors.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from backend.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Context expires after 2 hours of inactivity
CONTEXT_TTL_HOURS = 2


def save_company_context(
    thread_id: str,
    entity: str,
    company_data: dict,
    fit_scores: Optional[dict] = None,
    resume_summary: Optional[str] = None,
) -> None:
    """Persist the active company context to the thread row.

    Called after a successful company profile fetch + fit scoring.
    Overwrites any previous context (handles the "look up a second company" case).
    """
    context = {
        "entity": entity,
        "profile": _serialise(company_data),
        "fit_scores": fit_scores,
        "resume_summary": resume_summary,
        "opened_at": datetime.now(timezone.utc).isoformat(),
    }

    sb = get_supabase()
    try:
        sb.table("chat_threads") \
            .update({"active_company_context": context}) \
            .eq("id", thread_id) \
            .execute()
        logger.info(f"Saved company context for thread {thread_id}: entity={entity}")
    except Exception as e:
        logger.error(f"Failed to save company context for thread {thread_id}: {e}")


def load_company_context(thread_id: str) -> Optional[dict]:
    """Load the active company context from the thread row.

    Returns None if:
      - No context has been saved
      - The context is older than CONTEXT_TTL_HOURS
    """
    sb = get_supabase()
    try:
        res = sb.table("chat_threads") \
            .select("active_company_context") \
            .eq("id", thread_id) \
            .single() \
            .execute()

        ctx = res.data.get("active_company_context") if res.data else None
        if not ctx:
            return None

        # Check expiry
        opened_at = datetime.fromisoformat(ctx["opened_at"])
        age_hours = (datetime.now(timezone.utc) - opened_at).total_seconds() / 3600
        if age_hours > CONTEXT_TTL_HOURS:
            logger.info(
                f"Company context for thread {thread_id} expired "
                f"({age_hours:.1f}h > {CONTEXT_TTL_HOURS}h)"
            )
            clear_company_context(thread_id)
            return None

        return ctx
    except Exception as e:
        logger.error(f"Failed to load company context for thread {thread_id}: {e}")
        return None


def clear_company_context(thread_id: str) -> None:
    """Explicitly clear the active company context."""
    sb = get_supabase()
    try:
        sb.table("chat_threads") \
            .update({"active_company_context": None}) \
            .eq("id", thread_id) \
            .execute()
    except Exception as e:
        logger.error(f"Failed to clear company context for thread {thread_id}: {e}")


def _serialise(obj: object) -> object:
    """Recursively convert Pydantic models to dicts for JSON storage."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if isinstance(obj, dict):
        return {k: _serialise(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialise(v) for v in obj]
    return obj
