"""
Thread-level intent classifier for the chat pipeline.

Runs BEFORE entity detection. Identifies cross-company synthesis intents
that should be handled at the thread level (not single-company follow-ups).
Returns 'passthrough' for anything that should fall through to the existing
entity detection → company lookup → follow-up → generic flow.
"""

import logging
from typing import Optional
from pydantic import BaseModel, Field

from backend.services.llm import llm_service

logger = logging.getLogger(__name__)


class CompoundFilters(BaseModel):
    """Parsed structured filters for compound queries."""
    fit_label: Optional[str] = Field(
        None, description="'strong_match', 'partial_match', or 'stretch'"
    )
    tracker_status: Optional[str] = Field(
        None, description="Application tracker status e.g. 'Applied', 'Interview'"
    )
    has_upcoming_interview: Optional[bool] = Field(
        None, description="True if filtering for companies with upcoming interviews"
    )
    is_watched: Optional[bool] = Field(
        None, description="True if filtering for watched companies only"
    )
    posting_recency_days: Optional[int] = Field(
        None, description="Filter jobs posted within this many days"
    )


class IntentClassification(BaseModel):
    """Result of thread-level intent classification."""
    intent: str = Field(
        description=(
            "One of: 'daily_briefing', 'interview_prep', 'stale_nudges', "
            "'skill_gap_pattern', 'apply_recommendation', 'compound_query', "
            "or 'passthrough'"
        )
    )
    compound_filters: Optional[CompoundFilters] = Field(
        None,
        description="Parsed filter dimensions — only set when intent is 'compound_query'",
    )
    interview_company: Optional[str] = Field(
        None,
        description=(
            "Company name extracted from the message for interview_prep intent. "
            "Null if the user didn't mention a specific company."
        ),
    )


INTENT_CLASSIFIER_SYSTEM = """\
You are a query classifier for a job-search assistant. The user has data in these dimensions:

1. Application Tracker: companies applied to, status (Applied, Interview, Rejected, Offer, etc.), dates
2. Calendar: upcoming interview events detected from Google Calendar
3. Fit Scores: per-job fit labels (strong_match, partial_match, stretch), matched/missing requirements
4. Watched Companies: companies the user is monitoring for new roles
5. Job Notifications: new strong-match roles at watched companies
6. Project Ideas: skill-gap project suggestions (status: suggested, building, completed)
7. User Preferences: target roles, locations, work mode, seniority

Classify the user's message into EXACTLY ONE of these intents:

- "daily_briefing": The user wants a status update on their job search, what to focus on, or a summary of what's happening. Examples: "what's going on with my job search", "give me an update", "what should I focus on this week", "how's my search going"

- "interview_prep": The user wants to prepare for an upcoming interview. Examples: "prep me for tomorrow", "I have an interview coming up", "help me prepare for my Google interview", "what should I know before my interview at Meta"

- "stale_nudges": The user is asking about applications that need follow-up. Examples: "any apps I should follow up on", "what's gone quiet", "which applications are stale", "anything I should nudge"

- "skill_gap_pattern": The user wants to know what skills they're missing across their job search. Examples: "what should I be learning", "what skills keep coming up", "what am I missing", "where are my gaps"

- "apply_recommendation": The user wants job recommendations. Examples: "what should I apply to", "any good matches", "where should I apply next", "recommend me some jobs"

- "compound_query": The user is combining filters across multiple data dimensions. Examples: "show me companies where I have a strong match AND an upcoming interview", "which watched companies have new roles", "strong matches I haven't applied to yet"
  For compound queries, extract the structured filters into compound_filters.

- "passthrough": ANYTHING ELSE — including questions about a specific company, general career advice, greetings, follow-up questions, email/calendar drafts, resume help, or anything not clearly one of the above.

CRITICAL: When in doubt, classify as "passthrough". Only use the synthesis intents when the user's message CLEARLY maps to one. A question about a specific company (e.g. "tell me about Google") is always "passthrough" — the existing entity detection handles that.

For "interview_prep", extract the company name into interview_company if mentioned.
For "compound_query", extract filters into compound_filters.
"""


async def classify_thread_intent(
    user_message: str, chat_history: list[dict] | None = None
) -> IntentClassification:
    """Classify whether a user message is a cross-company synthesis intent.

    Returns IntentClassification with intent='passthrough' if the message
    should fall through to the existing entity detection flow.
    """
    history_context = ""
    if chat_history:
        recent = chat_history[-4:]
        for msg in recent:
            role_label = "User" if msg["role"] == "user" else "Assistant"
            history_context += f"{role_label}: {msg['content'][:200]}\n"

    prompt = f"{history_context}User: {user_message}\n\nClassify this message."

    try:
        result = await llm_service.generate_structured(
            INTENT_CLASSIFIER_SYSTEM, prompt, IntentClassification
        )

        # Validate the intent value
        valid_intents = {
            "daily_briefing", "interview_prep", "stale_nudges",
            "skill_gap_pattern", "apply_recommendation", "compound_query",
            "passthrough",
        }
        if result.intent not in valid_intents:
            logger.warning(
                f"Intent classifier returned invalid intent '{result.intent}', "
                f"defaulting to passthrough"
            )
            result.intent = "passthrough"

        logger.info(
            f"Thread intent classified: {result.intent} "
            f"for message: '{user_message[:60]}...'"
        )
        return result

    except Exception as e:
        logger.warning(f"Intent classification failed: {e}. Defaulting to passthrough.")
        return IntentClassification(intent="passthrough")
