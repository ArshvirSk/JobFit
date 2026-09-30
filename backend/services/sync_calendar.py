import logging
import httpx
from datetime import datetime, timezone
from typing import Optional
from backend.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

async def sync_calendar_for_user(user_id: str, access_token: str, last_synced_at: Optional[str]) -> None:
    """Query Google Calendar for upcoming interviews."""
    sb = get_supabase()
    
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }
    
    # We want to look for upcoming interviews (from now up to e.g. 30 days)
    now_iso = datetime.now(timezone.utc).isoformat()
    
    url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    params = {
        "q": "interview",
        "timeMin": now_iso,
        "singleEvents": "true",
        "orderBy": "startTime",
        "maxResults": 20
    }

    async with httpx.AsyncClient() as client:
        res = await client.get(url, headers=headers, params=params)
        if res.status_code == 401 or res.status_code == 403:
            sb.table("user_connectors").update({"status": "expired"}).eq("user_id", user_id).eq("provider", "google").execute()
            logger.info(f"Google token expired for user {user_id}")
            return
            
        res.raise_for_status()
        data = res.json()
        
        events = data.get("items", [])
        if not events:
            return
            
        # Get user's tracked companies to match against
        apps_res = sb.table("applications").select("company").eq("user_id", user_id).execute()
        tracked_companies = [app["company"].lower() for app in apps_res.data] if apps_res.data else []
        
        for event in events:
            title = event.get("summary", "")
            event_id = event.get("id")
            
            # Extract start time
            start = event.get("start", {})
            event_date = start.get("dateTime") or start.get("date")
            if not event_date:
                continue
                
            # Attempt to match company name
            matched_company = None
            title_lower = title.lower()
            for company in tracked_companies:
                if company in title_lower:
                    matched_company = next((app["company"] for app in apps_res.data if app["company"].lower() == company), None)
                    break
            
            # Check if we already detected this to prevent duplicates
            dup_res = sb.table("detected_events").select("id").eq("user_id", user_id).eq("event_type", "calendar_interview").eq("event_data->>calendar_event_id", event_id).execute()
            if not dup_res.data:
                sb.table("detected_events").insert({
                    "user_id": user_id,
                    "event_type": "calendar_interview",
                    "company_name": matched_company,
                    "status": "pending",
                    "event_data": {
                        "event_title": title,
                        "event_date": event_date,
                        "calendar_event_id": event_id
                    }
                }).execute()
                logger.info(f"Detected upcoming interview for user {user_id}: {title}")
