"""
LangGraph nodes for the chat pipeline.

Two nodes:
  - generic_response_node: Produces a helpful conversational reply via the LLM.
  - company_stub_node: Returns a mocked company "postmortem" stub with
    clearly-labeled placeholder data.

Both nodes are async generators that yield string chunks, enabling SSE
streaming on the FastAPI side.
"""

import asyncio
import logging
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


async def generic_response_node(state: dict) -> dict:
    """
    Generate a helpful generic conversational response.

    Uses structured output to optionally return an email or calendar draft
    if requested by the user.
    """
    from backend.services.llm import llm_service
    from pydantic import BaseModel, Field
    from typing import Optional
    import json

    class EmailDraft(BaseModel):
        recipient: str
        subject: str
        body: str

    class CalendarDraft(BaseModel):
        title: str
        start_time: str = Field(description="ISO 8601 format")
        end_time: str = Field(description="ISO 8601 format")
        description: str

    class ChatResponse(BaseModel):
        message: str = Field(description="The conversational text response to the user.")
        action_type: Optional[str] = Field(description="'email_draft', 'calendar_draft', or null")
        email_draft: Optional[EmailDraft] = None
        calendar_draft: Optional[CalendarDraft] = None

    user_message = state.get("user_message", "")
    chat_history = state.get("chat_history", [])

    # Build a simple prompt with history context
    history_text = ""
    if chat_history:
        recent = chat_history[-6:]  # Last 3 exchanges
        for msg in recent:
            role_label = "User" if msg["role"] == "user" else "Assistant"
            history_text += f"{role_label}: {msg['content']}\n"

    system_prompt = (
        "You are a helpful career and job search assistant called Tailr Chat. "
        "You help users with interview preparation, resume advice, salary negotiation, "
        "company research, and general career guidance. "
        "Keep your responses concise, friendly, and actionable. "
        "If asked about a specific company, mention that you can provide detailed "
        "company insights if the user asks directly (e.g. 'Tell me about Razorpay').\n"
        "IMPORTANT: Do NOT use emojis anywhere in your response.\n\n"
        "If the user asks you to draft an email (e.g. to a recruiter, for an interview follow-up, etc.), "
        "you MUST set action_type='email_draft' and provide the 'email_draft' object. Your 'message' should just introduce the draft.\n"
        "If the user asks you to create a calendar event or schedule something, "
        "you MUST set action_type='calendar_draft' and provide the 'calendar_draft' object. Your 'message' should introduce it."
    )

    prompt = f"{history_text}User: {user_message}\nAssistant:"

    try:
        response_data = await llm_service.generate_structured(system_prompt, prompt, ChatResponse)
        state["response_text"] = response_data.message
        
        if response_data.action_type == "email_draft" and response_data.email_draft:
            state["response_type"] = "email_draft"
            # Add metadata for the UI
            state["action_metadata"] = response_data.email_draft.model_dump()
        elif response_data.action_type == "calendar_draft" and response_data.calendar_draft:
            state["response_type"] = "calendar_draft"
            state["action_metadata"] = response_data.calendar_draft.model_dump()
        else:
            state["response_type"] = "generic"
            
        return state
    except Exception as e:
        logger.warning(f"LLM call failed in generic_response_node: {e}")
        fallback = (
            "I'm here to help with your career questions! You can ask me about "
            "interview tips, resume advice, salary negotiation, or even ask about "
            "a specific company like 'Tell me about Razorpay'. What would you like to know?"
        )
        state["response_text"] = fallback
        state["response_type"] = "generic"
        return state

async def evaluate_job_fit_node(state: dict) -> dict:
    """Evaluate job fit for open roles based on user's resume."""
    from backend.services.supabase_client import get_supabase
    import hashlib
    from backend.chat.fit_scorer import score_jobs_fit

    user_id = state.get("user_id")
    company_data = state.get("company_data", {})
    
    # company_data is sometimes a dict of Pydantic models. We need to handle it.
    jobs_data = company_data.get("jobs")
    
    if not user_id or not jobs_data:
        return state

    # Convert to dict if it's a Pydantic model
    if hasattr(jobs_data, "model_dump"):
        jobs_dict = jobs_data.model_dump()
    else:
        jobs_dict = jobs_data
        
    open_roles = jobs_dict.get("open_roles", [])
    if not open_roles:
        return state

    try:
        supabase = get_supabase()
        
        # 1. Fetch user's latest parsed resume
        res = supabase.table("base_resumes").select("id, parsed_json").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
        if not res.data or not res.data[0].get("parsed_json"):
            logger.info(f"No parsed resume found for user {user_id}. Skipping job fit.")
            return state
            
        resume_record = res.data[0]
        resume_id = resume_record["id"]
        parsed_resume = resume_record["parsed_json"]
        
        # 2. Check cache for each job
        jobs_to_score = []
        cached_scores = {}
        
        for idx, job in enumerate(open_roles):
            # Create stable hash for job
            job_str = f"{job['title']}|{job['location']}"
            job_hash = hashlib.sha256(job_str.encode()).hexdigest()
            job["job_hash"] = job_hash  # add hash to the response
            
            # Check DB cache
            cache_res = supabase.table("job_fit_scores").select("fit_data").eq("user_id", user_id).eq("job_hash", job_hash).eq("resume_id", resume_id).execute()
            
            if cache_res.data:
                cached_scores[idx] = cache_res.data[0]["fit_data"]
            else:
                jobs_to_score.append({
                    "original_idx": idx,
                    "job_hash": job_hash,
                    "title": job["title"],
                    "location": job["location"],
                    "url": job.get("url")
                })
                
        # 3. Score uncached jobs
        if jobs_to_score:
            batched_results = await score_jobs_fit(parsed_resume, jobs_to_score)
            
            # Save results to DB and memory
            for score in batched_results.scores:
                if score.job_index < len(jobs_to_score):
                    original_idx = jobs_to_score[score.job_index]["original_idx"]
                    job_hash = jobs_to_score[score.job_index]["job_hash"]
                    fit_data = score.model_dump()
                    
                    cached_scores[original_idx] = fit_data
                    
                    # Upsert into cache
                    try:
                        supabase.table("job_fit_scores").upsert({
                            "user_id": user_id,
                            "job_hash": job_hash,
                            "fit_data": fit_data,
                            "resume_id": resume_id
                        }, on_conflict="user_id,job_hash").execute()
                    except Exception as e:
                        logger.warning(f"Failed to cache job fit score: {e}")
                
        # 4. Attach scores to the jobs in state
        for idx, job_dict in enumerate(open_roles):
            if idx in cached_scores:
                job_dict["fit_score"] = cached_scores[idx]
                
        # Re-assign back to state
        jobs_dict["open_roles"] = open_roles
        company_data["jobs"] = jobs_dict
        state["company_data"] = company_data
        
    except Exception as e:
        logger.error(f"Failed to evaluate job fit: {e}")
        
    return state


async def classify_followup_node(state: dict) -> dict:
    """Classify whether the user's message is a follow-up about the active company context.

    Uses a cheap structured LLM call (no search grounding) to decide:
      - "company_followup": question relates to the company, its jobs, comp, culture, etc.
      - "other": unrelated question that should go to generic_response
    """
    from backend.services.llm import llm_service
    from pydantic import BaseModel, Field

    class FollowupClassification(BaseModel):
        classification: str = Field(
            description="'company_followup' if the question is about the company/its jobs/compensation/culture, 'other' if it's unrelated"
        )

    ctx = state.get("active_company_context", {})
    entity = ctx.get("entity", "Unknown Company")
    user_message = state.get("user_message", "")

    system_msg = (
        "You are a classifier. Decide whether the user's message is a follow-up "
        "question about a specific company they were just researching, or an unrelated request.\n\n"
        "A 'company_followup' is any question about:\n"
        "- The company's jobs, roles, open positions, or fit for the user\n"
        "- The company's compensation, salary, benefits, or culture\n"
        "- The company's funding, investors, competitors, or business\n"
        "- Advice on applying, interviewing, or working at this company\n"
        "- Comparisons involving this company\n\n"
        "An 'other' is:\n"
        "- General career advice not specific to this company\n"
        "- A request about a different/new company\n"
        "- Small talk, greetings, or off-topic questions\n\n"
        "Respond with ONLY the classification."
    )

    prompt = (
        f"The user was just researching: {entity}\n"
        f"User message: \"{user_message}\"\n"
        f"Is this a company_followup or other?"
    )

    try:
        result = await llm_service.generate_structured(
            system_msg, prompt, FollowupClassification
        )
        classification = result.classification.strip().lower()
        if classification not in ("company_followup", "other"):
            classification = "other"
        logger.info(f"Follow-up classification for '{user_message[:60]}': {classification}")
    except Exception as e:
        logger.warning(f"Follow-up classification failed: {e}. Defaulting to 'other'.")
        classification = "other"

    state["followup_classification"] = classification
    return state


async def company_synthesis_node(state: dict) -> dict:
    """Answer a follow-up question from the cached company context.

    Builds a rich system prompt containing the cached profile + fit scores +
    resume summary, then generates a conversational answer.
    No connectors, no search grounding — pure synthesis from cached data.
    """
    from backend.services.llm import llm_service
    import json

    ctx = state.get("active_company_context", {})
    entity = ctx.get("entity", "Unknown Company")
    profile = ctx.get("profile", {})
    fit_scores = ctx.get("fit_scores", {})
    resume_summary = ctx.get("resume_summary", "Not available")
    user_message = state.get("user_message", "")
    chat_history = state.get("chat_history", [])

    # Build history context
    history_text = ""
    if chat_history:
        recent = chat_history[-6:]
        for msg in recent:
            role_label = "User" if msg["role"] == "user" else "Assistant"
            history_text += f"{role_label}: {msg['content']}\n"

    # Build a condensed profile summary for the system prompt
    profile_sections = []
    
    if profile.get("funding"):
        profile_sections.append(f"Funding: {json.dumps(profile['funding'], indent=2)}")
    if profile.get("compensation"):
        profile_sections.append(f"Compensation: {json.dumps(profile['compensation'], indent=2)}")
    if profile.get("benefits"):
        profile_sections.append(f"Benefits: {json.dumps(profile['benefits'], indent=2)}")
    if profile.get("competitors"):
        profile_sections.append(f"Competitors: {json.dumps(profile['competitors'], indent=2)}")
    if profile.get("jobs") or profile.get("open_jobs"):
        jobs = profile.get("jobs") or profile.get("open_jobs")
        profile_sections.append(f"Open Jobs: {json.dumps(jobs, indent=2)}")

    profile_text = "\n\n".join(profile_sections) if profile_sections else "No detailed profile data available."

    # Build fit scores summary
    fit_text = "No fit scores available."
    if fit_scores:
        fit_text = json.dumps(fit_scores, indent=2)

    system_prompt = (
        f"You are a helpful career copilot. The user has been researching {entity} "
        f"and now has a follow-up question. Answer ONLY from the provided company data "
        f"and fit scores below. Do NOT make up information not present in the data.\n\n"
        f"If the data doesn't contain what's needed to answer the question, say so "
        f"honestly and suggest what the user could do instead.\n\n"
        f"IMPORTANT: Do NOT use emojis anywhere in your response.\n\n"
        f"--- COMPANY PROFILE: {entity} ---\n{profile_text}\n\n"
        f"--- FIT SCORES (user's resume vs open roles) ---\n{fit_text}\n\n"
        f"--- USER'S RESUME SUMMARY ---\n{resume_summary}\n"
    )

    prompt = f"{history_text}User: {user_message}\nAssistant:"

    try:
        response_text = await llm_service.generate_text(system_prompt, prompt)
        state["response_text"] = response_text
        state["response_type"] = "company_followup"
        state["detected_entities"] = [entity]  # So metadata includes the entity
    except Exception as e:
        logger.warning(f"Company synthesis failed: {e}")
        state["response_text"] = (
            f"I have the profile for {entity} loaded, but I ran into an issue "
            f"generating an answer. Could you try rephrasing your question?"
        )
        state["response_type"] = "company_followup"

    return state

