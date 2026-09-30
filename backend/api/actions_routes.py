import logging
import httpx
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.services.supabase_client import get_supabase
from backend.api.routes import get_current_user_id
from backend.services.encryption import decrypt

logger = logging.getLogger(__name__)
router = APIRouter()

class EmailDraftRequest(BaseModel):
    recipient: str
    subject: str
    body: str
    application_id: Optional[str] = None

class CalendarEventRequest(BaseModel):
    title: str
    start_time: str
    end_time: str
    description: Optional[str] = None
    application_id: Optional[str] = None

@router.post("/api/actions/gmail/send")
async def send_email(request: EmailDraftRequest, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    
    # Check for gmail connector and gmail.send scope
    conn_res = sb.table("user_connectors").select("encrypted_access_token, scopes_granted").eq("user_id", user_id).eq("provider", "google").execute()
    if not conn_res.data:
        raise HTTPException(status_code=400, detail="Google account not connected")
        
    scopes = conn_res.data[0].get("scopes_granted", [])
    if "https://www.googleapis.com/auth/gmail.send" not in scopes:
        raise HTTPException(status_code=403, detail="gmail.send scope required. Please re-authenticate.")
        
    access_token = decrypt(conn_res.data[0]["encrypted_access_token"])
    
    # Format email as RFC 2822 standard string, then base64url encode
    import base64
    from email.message import EmailMessage
    
    msg = EmailMessage()
    msg.set_content(request.body)
    msg["To"] = request.recipient
    msg["Subject"] = request.subject
    
    raw_msg = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
    
    # Send via Gmail API
    url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    payload = {"raw": raw_msg}
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=payload)
        
        if resp.status_code in [401, 403]:
            # Token might be expired or scope invalid
            raise HTTPException(status_code=403, detail="Google authentication failed. Please re-authenticate.")
        elif not resp.is_success:
            logger.error(f"Failed to send email: {resp.text}")
            raise HTTPException(status_code=500, detail="Failed to send email via Gmail API")
            
    # Log to tracker activity log
    if request.application_id:
        sb.table("application_activities").insert({
            "application_id": request.application_id,
            "activity_type": "email_sent",
            "details": {
                "recipient": request.recipient,
                "subject": request.subject,
                "body_preview": request.body[:100] + "..." if len(request.body) > 100 else request.body
            }
        }).execute()
        
    return {"status": "success"}

@router.post("/api/actions/calendar/create")
async def create_calendar_event(request: CalendarEventRequest, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    
    # Check for calendar connector and calendar.events scope
    conn_res = sb.table("user_connectors").select("encrypted_access_token, scopes_granted").eq("user_id", user_id).eq("provider", "google").execute()
    if not conn_res.data:
        raise HTTPException(status_code=400, detail="Google account not connected")
        
    scopes = conn_res.data[0].get("scopes_granted", [])
    if "https://www.googleapis.com/auth/calendar.events" not in scopes:
        raise HTTPException(status_code=403, detail="calendar.events scope required. Please re-authenticate.")
        
    access_token = decrypt(conn_res.data[0]["encrypted_access_token"])
    
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    
    # Tag event as created by JobFit
    description = request.description or ""
    description += "\n\n[Created via JobFit]"
    
    payload = {
        "summary": request.title,
        "description": description.strip(),
        "start": {
            "dateTime": request.start_time,
            "timeZone": "UTC"
        },
        "end": {
            "dateTime": request.end_time,
            "timeZone": "UTC"
        }
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=payload)
        
        if resp.status_code in [401, 403]:
            raise HTTPException(status_code=403, detail="Google authentication failed. Please re-authenticate.")
        elif not resp.is_success:
            logger.error(f"Failed to create event: {resp.text}")
            raise HTTPException(status_code=500, detail="Failed to create event via Calendar API")
            
    # Log to tracker activity log
    if request.application_id:
        sb.table("application_activities").insert({
            "application_id": request.application_id,
            "activity_type": "event_created",
            "details": {
                "title": request.title,
                "start_time": request.start_time
            }
        }).execute()
        
    return {"status": "success"}
