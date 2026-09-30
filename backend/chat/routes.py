"""
Chat API routes — thread CRUD + streaming message endpoint.

Endpoints:
  GET    /api/chat/threads                  — List user's threads
  POST   /api/chat/threads                  — Create a new thread
  GET    /api/chat/threads/{id}/messages     — Load full message history
  POST   /api/chat/threads/{id}/messages     — Send message → stream SSE response
  DELETE /api/chat/threads/{id}              — Delete a thread
"""

import asyncio
import json
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.api.routes import get_current_user_id
from backend.services.supabase_client import get_supabase
from backend.chat.graph import chat_pipeline
from backend.chat.context import load_company_context, save_company_context

logger = logging.getLogger(__name__)

chat_router = APIRouter(prefix="/api/chat", tags=["chat"])


# ── Request models ───────────────────────────────────────

class CreateThreadRequest(BaseModel):
    title: Optional[str] = None

class SendMessageRequest(BaseModel):
    content: str


# ── Thread CRUD ──────────────────────────────────────────

@chat_router.get("/threads")
async def list_threads(user_id: str = Depends(get_current_user_id)):
    """List all chat threads for the authenticated user, sorted by most recent."""
    sb = get_supabase()

    # Get threads with their last message for preview
    threads_resp = sb.table("chat_threads") \
        .select("*") \
        .eq("user_id", user_id) \
        .order("updated_at", desc=True) \
        .execute()

    threads = threads_resp.data or []

    # Fetch the last message for each thread for preview
    for thread in threads:
        last_msg_resp = sb.table("chat_messages") \
            .select("content, role") \
            .eq("thread_id", thread["id"]) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if last_msg_resp.data:
            preview = last_msg_resp.data[0]["content"][:100]
            thread["last_message_preview"] = preview
            thread["last_message_role"] = last_msg_resp.data[0]["role"]
        else:
            thread["last_message_preview"] = ""
            thread["last_message_role"] = None

    return threads


@chat_router.post("/threads")
async def create_thread(
    request: CreateThreadRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Create a new chat thread."""
    sb = get_supabase()

    thread_data = {
        "user_id": user_id,
        "title": request.title or "New Chat",
    }

    resp = sb.table("chat_threads").insert(thread_data).execute()
    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create thread")

    return resp.data[0]


@chat_router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Delete a chat thread and all its messages (cascade)."""
    sb = get_supabase()

    # Verify ownership
    thread_resp = sb.table("chat_threads") \
        .select("id") \
        .eq("id", thread_id) \
        .eq("user_id", user_id) \
        .single() \
        .execute()

    if not thread_resp.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    sb.table("chat_threads").delete().eq("id", thread_id).execute()
    return {"success": True}


# ── Messages ─────────────────────────────────────────────

@chat_router.get("/threads/{thread_id}/messages")
async def get_messages(
    thread_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Load full message history for a thread."""
    sb = get_supabase()

    # Verify thread ownership
    thread_resp = sb.table("chat_threads") \
        .select("id") \
        .eq("id", thread_id) \
        .eq("user_id", user_id) \
        .single() \
        .execute()

    if not thread_resp.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    messages_resp = sb.table("chat_messages") \
        .select("*") \
        .eq("thread_id", thread_id) \
        .order("created_at", desc=False) \
        .execute()

    return messages_resp.data or []


@chat_router.post("/threads/{thread_id}/messages")
async def send_message(
    thread_id: str,
    request: SendMessageRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Send a user message, run it through the chat pipeline, and stream
    the assistant response back as SSE events.

    SSE event format:
      data: {"token": "...", "done": false}
      data: {"token": "", "done": true, "metadata": {...}}
    """
    sb = get_supabase()

    # 1. Verify thread ownership
    thread_resp = sb.table("chat_threads") \
        .select("*") \
        .eq("id", thread_id) \
        .eq("user_id", user_id) \
        .single() \
        .execute()

    if not thread_resp.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    # 2. Save the user message to DB
    user_msg_resp = sb.table("chat_messages").insert({
        "thread_id": thread_id,
        "role": "user",
        "content": request.content,
        "metadata": {},
    }).execute()

    if not user_msg_resp.data:
        raise HTTPException(status_code=500, detail="Failed to save user message")

    # 3. Auto-generate thread title from first user message
    if thread_resp.data["title"] == "New Chat":
        title = request.content[:50].strip()
        if len(request.content) > 50:
            title += "..."
        sb.table("chat_threads") \
            .update({"title": title}) \
            .eq("id", thread_id) \
            .execute()

    # 4a. Load active company context for follow-up routing
    active_ctx = load_company_context(thread_id)

    # 4b. Load chat history for context
    history_resp = sb.table("chat_messages") \
        .select("role, content") \
        .eq("thread_id", thread_id) \
        .order("created_at", desc=False) \
        .limit(20) \
        .execute()

    chat_history = history_resp.data or []
    # Remove the just-inserted user message from history (it's the last one)
    # so the pipeline sees prior context, not the current message duplicated
    if chat_history and chat_history[-1]["content"] == request.content:
        chat_history = chat_history[:-1]

    # 5. Run the LangGraph chat pipeline
    async def stream_response():
        try:
            pipeline_input = {
                "user_id": user_id,
                "user_message": request.content,
                "chat_history": chat_history,
                "detected_entities": [],
                "detection_method": None,
                "quota_exceeded": None,
                "response_text": None,
                "response_type": None,
                "company_data": {},
                "active_company_context": active_ctx,
                "followup_classification": None,
                # Thread-level intent routing
                "thread_intent": None,
                "thread_intent_filters": None,
                "thread_intent_company": None,
                "action_buttons": None,
            }

            final_response = None
            final_type = None
            detected_entities = []
            detection_method = None
            final_company_data = None
            action_metadata = None
            action_buttons = None
            
            # Start streaming updates
            async for step in chat_pipeline.astream(pipeline_input, stream_mode="updates"):
                for node_name, state_update in step.items():
                    if not state_update:
                        continue
                    # Detect entities
                    if "detected_entities" in state_update and state_update["detected_entities"]:
                        detected_entities = state_update["detected_entities"]
                        detection_method = state_update.get("detection_method")
                        names = " and ".join(detected_entities)
                        msg = f"Searching live data for {names}..."
                        yield f"data: {json.dumps({'token': '', 'done': False, 'progress': msg})}\n\n"
                    
                    # Helper to check if a pydantic model has actual data
                    def has_data(obj):
                        if not obj: return False
                        dump = obj.model_dump(exclude_unset=True)
                        return any(bool(v) for k, v in dump.items() if k not in ("note", "source_type", "link_confidence"))

                    # Stream parallel fetch progress
                    company_data = state_update.get("company_data", {})
                    if node_name == "fetch_funding" and has_data(company_data.get("funding")):
                        yield f"data: {json.dumps({'token': '', 'done': False, 'progress': 'Found funding data'})}\n\n"
                    elif node_name == "fetch_jobs" and has_data(company_data.get("jobs")):
                        yield f"data: {json.dumps({'token': '', 'done': False, 'progress': 'Found open roles'})}\n\n"
                    elif node_name == "fetch_compensation" and has_data(company_data.get("compensation")):
                        yield f"data: {json.dumps({'token': '', 'done': False, 'progress': 'Found compensation data'})}\n\n"
                    elif node_name == "fetch_competitors" and has_data(company_data.get("competitors")):
                        yield f"data: {json.dumps({'token': '', 'done': False, 'progress': 'Found competitors'})}\n\n"
                    
                    # Final text output
                    if "response_text" in state_update:
                        final_response = state_update["response_text"]
                        final_type = state_update.get("response_type", "generic")
                    
                    if "action_metadata" in state_update:
                        action_metadata = state_update["action_metadata"]
                    
                    if "action_buttons" in state_update and state_update["action_buttons"]:
                        action_buttons = state_update["action_buttons"]
                    
                    # Capture company_data for context saving
                    if state_update.get("company_data"):
                        final_company_data = state_update["company_data"]
            
            if not final_response:
                final_response = "I'm sorry, I couldn't generate a response."
                final_type = "error"

            # Stream the final text in chunks for a typing effect
            chunk_size = 5
            words = final_response.split(" ")
            buffer = []
            for word in words:
                buffer.append(word)
                if len(buffer) >= chunk_size:
                    chunk = " ".join(buffer) + " "
                    event_data = json.dumps({"token": chunk, "done": False})
                    yield f"data: {event_data}\n\n"
                    buffer = []
                    await asyncio.sleep(0.01)

            # Flush remaining buffer
            if buffer:
                chunk = " ".join(buffer)
                event_data = json.dumps({"token": chunk, "done": False})
                yield f"data: {event_data}\n\n"
                await asyncio.sleep(0.01)

            # 6. Save assistant message to DB with metadata
            metadata = {
                "detected_entities": detected_entities,
                "response_type": final_type,
                "detection_method": detection_method,
            }
            if action_metadata:
                metadata["action_metadata"] = action_metadata
            if action_buttons:
                metadata["action_buttons"] = action_buttons

            sb.table("chat_messages").insert({
                "thread_id": thread_id,
                "role": "assistant",
                "content": final_response, # Store only the final markdown without the progress tokens
                "metadata": metadata,
            }).execute()

            # Send the final "done" event with metadata
            done_data = json.dumps({
                "token": "",
                "done": True,
                "metadata": metadata,
            })
            yield f"data: {done_data}\n\n"

            # 7. Save company context if this was a company_profile response
            if final_type == "company_profile" and detected_entities and final_company_data:
                try:
                    # Fetch resume summary for context
                    resume_summary = None
                    res = sb.table("base_resumes").select("parsed_json").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
                    if res.data and res.data[0].get("parsed_json"):
                        parsed = res.data[0]["parsed_json"]
                        # Build a concise summary
                        skills = parsed.get("skills", [])
                        experience = parsed.get("experience", [])
                        summary_parts = []
                        if skills:
                            summary_parts.append(f"Skills: {', '.join(skills[:15])}")
                        if experience:
                            for exp in experience[:3]:
                                title = exp.get("title", "")
                                company = exp.get("company", "")
                                summary_parts.append(f"{title} at {company}")
                        resume_summary = "; ".join(summary_parts) if summary_parts else None
                    
                    # Extract fit scores from company_data jobs
                    fit_scores = None
                    jobs_data = final_company_data.get("jobs")
                    if jobs_data:
                        if hasattr(jobs_data, "model_dump"):
                            jobs_dict = jobs_data.model_dump()
                        else:
                            jobs_dict = jobs_data
                        roles = jobs_dict.get("open_roles", [])
                        scored_roles = [r for r in roles if r.get("fit_score")]
                        if scored_roles:
                            fit_scores = {"scored_roles": scored_roles}
                    
                    save_company_context(
                        thread_id=thread_id,
                        entity=detected_entities[0],
                        company_data=final_company_data,
                        fit_scores=fit_scores,
                        resume_summary=resume_summary,
                    )
                except Exception as ctx_err:
                    logger.warning(f"Failed to save company context: {ctx_err}")

        except Exception as e:
            logger.error(f"Chat pipeline error: {e}", exc_info=True)
            error_msg = "I'm sorry, something went wrong. Please try again."
            error_data = json.dumps({"token": error_msg, "done": True, "error": True})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
