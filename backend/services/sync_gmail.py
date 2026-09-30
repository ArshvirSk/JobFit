import logging
import httpx
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field
from backend.services.supabase_client import get_supabase
from backend.services.llm import llm_service

logger = logging.getLogger(__name__)

class DetectedEmailStatus(BaseModel):
    detected: bool = Field(description="True if this email is definitively related to a job application status or interview")
    company_name: Optional[str] = Field(description="The name of the company the application is for")
    status: Optional[str] = Field(description="One of: 'applied', 'interview_scheduled', 'rejected', 'offer', 'other'")
    confidence: float = Field(description="Confidence score from 0.0 to 1.0. Use high confidence (>0.8) for clear signals.")

CLASSIFICATION_SYSTEM_PROMPT = """You are an AI assistant that extracts job application statuses from emails.
You will be provided with the subject and a snippet (and optionally full text) of an email.
Your goal is to determine if this email is a job application update (e.g. confirmation of application, interview invite, rejection, offer).
If it is, extract the company name, the status, and your confidence level.
Only output "detected": true if it is genuinely a job application email. If it's marketing or a generic newsletter, output false."""

async def sync_gmail_for_user(user_id: str, access_token: str, last_synced_at: Optional[str]) -> None:
    """Query Gmail for application-related emails and classify them."""
    sb = get_supabase()
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }
    
    query_parts = [
        "(subject:application OR subject:interview OR subject:update OR subject:rejected OR subject:offer OR subject:\"next steps\")"
    ]
    
    # If we have a last_synced_at, we can limit the query to messages after that time.
    # Gmail search accepts 'after:EPOCH'
    if last_synced_at:
        try:
            # Parse ISO datetime and get unix timestamp
            dt = datetime.fromisoformat(last_synced_at.replace("Z", "+00:00"))
            epoch = int(dt.timestamp())
            query_parts.append(f"after:{epoch}")
        except Exception as e:
            logger.warning(f"Failed to parse last_synced_at {last_synced_at}: {e}")

    query = " ".join(query_parts)
    
    url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    params = {
        "q": query,
        "maxResults": 10  # Start simple
    }

    async with httpx.AsyncClient() as client:
        res = await client.get(url, headers=headers, params=params)
        if res.status_code == 401 or res.status_code == 403:
            # Token expired or revoked
            sb.table("user_connectors").update({"status": "expired"}).eq("user_id", user_id).eq("provider", "google").execute()
            logger.info(f"Google token expired for user {user_id}")
            return
            
        res.raise_for_status()
        data = res.json()
        
        messages = data.get("messages", [])
        if not messages:
            return
            
        for msg in messages:
            msg_id = msg["id"]
            
            # Fetch message details
            msg_res = await client.get(f"{url}/{msg_id}", headers=headers, params={"format": "metadata", "metadataHeaders": "Subject"})
            if not msg_res.is_success:
                continue
                
            msg_data = msg_res.json()
            snippet = msg_data.get("snippet", "")
            subject = ""
            for header in msg_data.get("payload", {}).get("headers", []):
                if header["name"].lower() == "subject":
                    subject = header["value"]
                    break
                    
            if not subject and not snippet:
                continue
                
            # Classify
            email_text = f"Subject: {subject}\nSnippet: {snippet}"
            
            try:
                classification = await llm_service.generate_structured(
                    system_msg=CLASSIFICATION_SYSTEM_PROMPT,
                    prompt=f"Please classify this email snippet:\n\n{email_text}",
                    response_model=DetectedEmailStatus
                )
                
                if classification.detected and classification.company_name and classification.status:
                    company = classification.company_name.lower().strip()
                    
                    if classification.confidence >= 0.8:
                        # Auto-populate or update tracker
                        # Find existing application
                        app_res = sb.table("applications").select("id").eq("user_id", user_id).ilike("company", f"%{company}%").execute()
                        if app_res.data:
                            # Update existing
                            sb.table("applications").update({
                                "status": classification.status.capitalize(),
                                "source": "gmail",
                                "source_reference_id": msg_id
                            }).eq("id", app_res.data[0]["id"]).execute()
                        else:
                            # Create new
                            sb.table("applications").insert({
                                "user_id": user_id,
                                "company": classification.company_name,
                                "role": "Unknown Role",
                                "status": classification.status.capitalize(),
                                "source": "gmail",
                                "source_reference_id": msg_id
                            }).execute()
                    else:
                        # Low confidence -> Insert to detected_events for UI confirmation
                        # Check if we already detected this to prevent duplicates
                        dup_res = sb.table("detected_events").select("id").eq("user_id", user_id).eq("event_type", "email_application_status").eq("event_data->>source_message_id", msg_id).execute()
                        if not dup_res.data:
                            sb.table("detected_events").insert({
                                "user_id": user_id,
                                "event_type": "email_application_status",
                                "company_name": classification.company_name,
                                "status": "pending",
                                "event_data": {
                                    "status": classification.status,
                                    "confidence": classification.confidence,
                                    "source_message_id": msg_id,
                                    "subject": subject
                                }
                            }).execute()
            except Exception as e:
                logger.error(f"Error classifying email {msg_id} for user {user_id}: {e}")
