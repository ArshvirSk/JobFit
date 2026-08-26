"""
LangGraph graph definition for the chat pipeline.

Graph shape:
  START → detect_entity_node
    ├─ company detected   → check_quota_node
    │                           ├─ quota OK → [parallel fetch nodes] → format_company_profile → END
    │                           └─ quota exceeded → quota_exceeded_node → END
    ├─ no company, but active context → classify_followup_node
    │                                     ├─ company_followup → company_synthesis_node → END
    │                                     └─ other → generic_response_node → END
    └─ no company, no context → generic_response_node → END
"""

import logging
import operator
from typing import TypedDict, Optional, List, Annotated
from langgraph.graph import StateGraph, END
from backend.chat.entity_detector import detect_entity
from backend.chat.nodes import (
    generic_response_node,
    classify_followup_node,
    company_synthesis_node,
)
from backend.chat.connectors.nodes import fetch_company_profile_node
from backend.chat.connectors.schemas import CompanyProfile

logger = logging.getLogger(__name__)

class ChatPipelineState(TypedDict):
    """State flowing through the chat LangGraph pipeline."""
    # Inputs
    user_id: str
    user_message: str
    chat_history: List[dict]

    # Set by detect_entity_node
    detected_entities: List[str]
    detection_method: Optional[str]

    # Quota check
    quota_exceeded: Optional[bool]

    # Set by response nodes
    response_text: Optional[str]
    response_type: Optional[str]

    # Parallel data accumulation
    company_data: dict
    company_data_found_summary: dict

    # Company context follow-up
    active_company_context: Optional[dict]
    followup_classification: Optional[str]

def detect_entity_node(state: ChatPipelineState) -> dict:
    result = detect_entity(state["user_message"])
    logger.info(
        f"Entity detection result: entities={result.entities}, "
        f"method={result.method}, message={state['user_message'][:60]!r}"
    )
    return {
        "detected_entities": result.entities,
        "detection_method": result.method,
    }

async def check_quota_node(state: ChatPipelineState) -> dict:
    """Check if the user has enough credits to perform a company lookup."""
    from backend.services.supabase_client import get_supabase
    supabase = get_supabase()
    user_id = state.get("user_id")
    
    # Bypass if no user_id (for local testing without auth)
    if not user_id:
        return {"quota_exceeded": False}

    try:
        res = supabase.table("users").select("credits_used, credits_limit").eq("id", user_id).execute()
        if res.data and len(res.data) > 0:
            user = res.data[0]
            if user["credits_used"] >= user["credits_limit"]:
                return {"quota_exceeded": True}
            
            # Optimistically deduct 1 credit (in production you'd use a Postgres function or RPC to avoid race conditions)
            supabase.table("users").update({"credits_used": user["credits_used"] + 1}).eq("id", user_id).execute()
    except Exception as e:
        logger.warning(f"Failed to check/update quota for {user_id}: {e}")
        # Default to allow if DB fails so we don't break the app
        
    return {"quota_exceeded": False}

def route_after_detection(state: ChatPipelineState) -> str:
    """Route based on entity detection AND active company context."""
    if state.get("detected_entities"):
        if len(state["detected_entities"]) > 3:
            return "too_many_entities"
        return "check_quota"
    # No entity detected — check if we have active company context for follow-up
    if state.get("active_company_context"):
        return "classify_followup"
    return "generic_response"

def route_after_quota(state: ChatPipelineState) -> str:
    if state.get("quota_exceeded"):
        return "quota_exceeded"
    return "fetch_company_profile"

def route_after_classification(state: ChatPipelineState) -> str:
    """Route based on follow-up classification result."""
    if state.get("followup_classification") == "company_followup":
        return "company_synthesis"
    return "generic_response"

async def quota_exceeded_node(state: ChatPipelineState) -> dict:
    return {
        "response_text": "You've reached your monthly limit for detailed company lookups. Please upgrade your plan to continue researching companies.",
        "response_type": "quota_exceeded"
    }

async def format_company_profile_node(state: ChatPipelineState) -> dict:
    """Consolidate the parallel data into a structured response."""
    entities = state.get("detected_entities", ["Unknown Company"])
    entity_names = " and ".join(entities)
    
    # Let the frontend UI render the actual components; the backend just
    # returns a conversational intro.
    response_text = f"I've pulled up the company profile for {entity_names}. You can view the details in the panel."

    return {
        "response_text": response_text,
        "response_type": "company_profile"
    }

def create_chat_graph():
    workflow = StateGraph(ChatPipelineState)

    workflow.add_node("detect_entity", detect_entity_node)
    workflow.add_node("generic_response", generic_response_node)
    workflow.add_node("check_quota", check_quota_node)
    workflow.add_node("quota_exceeded", quota_exceeded_node)
    
    workflow.add_node("fetch_company_profile", fetch_company_profile_node)
    
    # Fit scoring
    from backend.chat.nodes import evaluate_job_fit_node
    workflow.add_node("evaluate_job_fit", evaluate_job_fit_node)
    
    # Reducer/Formatter
    workflow.add_node("format_company_profile", format_company_profile_node)

    # Follow-up nodes
    workflow.add_node("classify_followup", classify_followup_node)
    workflow.add_node("company_synthesis", company_synthesis_node)
    
    # New node for too many entities
    async def too_many_entities_node(state: dict) -> dict:
        state["response_text"] = f"I detected {len(state['detected_entities'])} companies to compare, which is a bit too many for a good side-by-side view. Could you narrow it down to 2 or 3?"
        state["response_type"] = "generic"
        return state
        
    workflow.add_node("too_many_entities", too_many_entities_node)

    # Add edges
    workflow.set_entry_point("detect_entity")

    workflow.add_conditional_edges(
        "detect_entity",
        route_after_detection,
        {
            "too_many_entities": "too_many_entities",
            "check_quota": "check_quota",
            "classify_followup": "classify_followup",
            "generic_response": "generic_response"
        }
    )
    
    workflow.add_edge("too_many_entities", END)
    
    workflow.add_conditional_edges(
        "check_quota",
        route_after_quota,
        {"quota_exceeded": "quota_exceeded", "fetch_company_profile": "fetch_company_profile"}
    )

    workflow.add_conditional_edges(
        "classify_followup",
        route_after_classification,
        {
            "company_synthesis": "company_synthesis",
            "generic_response": "generic_response",
        }
    )

    workflow.add_edge("fetch_company_profile", "evaluate_job_fit")
    workflow.add_edge("evaluate_job_fit", "format_company_profile")

    workflow.add_edge("format_company_profile", END)
    workflow.add_edge("generic_response", END)
    workflow.add_edge("quota_exceeded", END)
    workflow.add_edge("company_synthesis", END)

    return workflow.compile()

chat_pipeline = create_chat_graph()
