import logging
import uuid
import json
import httpx
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
import os
import shutil

from backend.models.schemas import (
    UserPreferences,
    UserConnector,
    CompleteOnboardingRequest,
    OAuthStartRequest,
    OAuthCallbackRequest
)
from backend.services.supabase_client import get_supabase
from backend.api.routes import get_current_user_id
from backend.services.oauth_service import OAuthService
from backend.services.encryption import encrypt, decrypt
from backend.parsers.linkedin_parser import parse_linkedin_zip

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/api/onboarding/complete")
async def complete_onboarding(request: CompleteOnboardingRequest, user_id: str = Depends(get_current_user_id)):
    """Save user preferences, optional LinkedIn URL, and mark onboarding as complete."""
    sb = get_supabase()
    
    # Update users table
    update_data = {
        "onboarding_completed_at": datetime.utcnow().isoformat()
    }
    if request.linkedin_url:
        update_data["linkedin_url"] = request.linkedin_url
        
    user_resp = sb.table("users").update(update_data).eq("id", user_id).execute()
    if not user_resp.data:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Upsert preferences
    prefs_dict = request.preferences.model_dump(exclude_unset=True)
    prefs_dict["user_id"] = user_id
    prefs_dict["updated_at"] = datetime.utcnow().isoformat()
    
    pref_resp = sb.table("user_preferences").upsert(prefs_dict).execute()
    
    return {"success": True, "user": user_resp.data[0]}

@router.get("/api/onboarding/preferences", response_model=UserPreferences)
async def get_preferences(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    resp = sb.table("user_preferences").select("*").eq("user_id", user_id).execute()
    if resp.data:
        return resp.data[0]
    return {}

@router.put("/api/onboarding/preferences")
async def save_preferences(preferences: UserPreferences, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    prefs_dict = preferences.model_dump(exclude_unset=True)
    prefs_dict["user_id"] = user_id
    prefs_dict["updated_at"] = datetime.utcnow().isoformat()
    
    resp = sb.table("user_preferences").upsert(prefs_dict).execute()
    return {"success": True}

@router.get("/api/connectors", response_model=List[UserConnector])
async def list_connectors(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    # explicitly selecting safe fields, excluding access_token and refresh_token
    resp = sb.table("user_connectors").select("id, provider, scopes_granted, status, connected_at, last_synced_at").eq("user_id", user_id).execute()
    return resp.data

@router.delete("/api/connectors/{provider}")
async def revoke_connector(provider: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    
    # Get the connector to decrypt the token
    connector_resp = sb.table("user_connectors").select("*").eq("user_id", user_id).eq("provider", provider).execute()
    if not connector_resp.data:
        raise HTTPException(status_code=404, detail="Connector not found")
        
    connector = connector_resp.data[0]
    encrypted_token = connector.get("encrypted_access_token")
    if encrypted_token:
        try:
            access_token = decrypt(encrypted_token)
            await OAuthService.revoke_token(provider, access_token)
        except Exception as e:
            logger.error(f"Failed to decrypt or revoke {provider} token remotely: {e}")
            # Continue to delete locally even if remote fails
    
    resp = sb.table("user_connectors").delete().eq("user_id", user_id).eq("provider", provider).execute()
    return {"success": True}

@router.post("/api/connectors/oauth/start")
async def oauth_start(request: OAuthStartRequest, user_id: str = Depends(get_current_user_id)):
    """Generate OAuth Start URL."""
    state = str(uuid.uuid4())
    # Note: State should ideally be stored in DB or Redis mapped to user_id to prevent CSRF.
    # For now, we will pass it and frontend can store it in localStorage/sessionStorage.
    url = OAuthService.get_auth_url(request.provider, request.redirect_uri, state, extra_scopes=request.extra_scopes)
    return {"url": url, "state": state}

@router.post("/api/connectors/oauth/callback")
async def oauth_callback(request: OAuthCallbackRequest, user_id: str = Depends(get_current_user_id)):
    """Exchanges code for tokens and stores them encrypted."""
    sb = get_supabase()
    
    try:
        token_data = await OAuthService.exchange_code(request.provider, request.code, request.redirect_uri)
    except httpx.HTTPStatusError as e:
        logger.error(f"Failed to exchange code for {request.provider}. HTTP Error: {e.response.text}")
        raise HTTPException(status_code=400, detail=f"Failed to exchange authorization code: {e.response.text}")
    except Exception as e:
        logger.error(f"Failed to exchange code for {request.provider}: {e}")
        raise HTTPException(status_code=400, detail="Failed to exchange authorization code")
        
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600) # Default to 1 hour
    
    if not access_token:
        raise HTTPException(status_code=400, detail="No access token received")
        
    scopes = []
    returned_scopes = token_data.get("scope", "")
    if returned_scopes:
        scopes = returned_scopes.split(" ")
    else:
        if request.provider == "google":
            scopes = [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/calendar.readonly"
            ]
        elif request.provider == "outlook":
            scopes = ["offline_access", "Mail.Read", "Calendars.Read"]
        elif request.provider == "github":
            scopes = ["read:user", "public_repo"]
    if request.provider == "github":
        # Fetch GitHub Profile and Repos
        try:
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github.v3+json"}
                user_resp = await client.get("https://api.github.com/user", headers=headers)
                if user_resp.status_code == 200:
                    user_data = user_resp.json()
                    github_login = user_data.get("login")
                    github_name = user_data.get("name") or github_login
                    bio = user_data.get("bio") or ""
                    
                    repos_resp = await client.get(f"https://api.github.com/users/{github_login}/repos?sort=pushed&per_page=100", headers=headers)
                    repos = repos_resp.json() if repos_resp.status_code == 200 else []
                    
                    languages = set()
                    projects = []
                    # Sort by stars and take top non-forks
                    valid_repos = [r for r in repos if not r.get("fork")]
                    for r in sorted(valid_repos, key=lambda x: x.get("stargazers_count", 0), reverse=True)[:10]:
                        lang = r.get("language")
                        if lang:
                            languages.add(lang)
                        desc = r.get("description") or ""
                        projects.append(f"{r.get('name')} - {desc} ({lang if lang else 'No primary language'})")
                        
                    from backend.models.schemas import ParsedResume
                    raw_text_parts = [f"Name: {github_name}", f"Bio: {bio}", "SKILLS: " + ", ".join(languages), "PROJECTS:"]
                    for p in projects:
                        raw_text_parts.append(f"- {p}")
                        
                    parsed_resume = ParsedResume(
                        name=f"{github_name} (GitHub Profile)",
                        contact_info="",
                        summary=bio,
                        experience=[],
                        education=[],
                        skills=list(languages),
                        projects=projects
                    )
                    raw_text = "\n".join(raw_text_parts)
                    
                    # Upsert into base_resumes
                    existing_resume_resp = sb.table("base_resumes").select("id").eq("user_id", user_id).eq("label", "GitHub Profile").execute()
                    if existing_resume_resp.data:
                        sb.table("base_resumes").update({
                            "raw_text": raw_text,
                            "parsed_json": parsed_resume.model_dump()
                        }).eq("id", existing_resume_resp.data[0]["id"]).execute()
                    else:
                        sb.table("base_resumes").insert({
                            "user_id": user_id,
                            "label": "GitHub Profile",
                            "raw_text": raw_text,
                            "parsed_json": parsed_resume.model_dump()
                        }).execute()
        except Exception as e:
            logger.error(f"Failed to fetch GitHub data for {user_id}: {e}")
            # Still proceed to save the connector even if data fetching failed
        
    connector_data = {
        "user_id": user_id,
        "provider": request.provider,
        "encrypted_access_token": encrypt(access_token),
        "scopes_granted": scopes,
        "status": "active",
        "connected_at": datetime.utcnow().isoformat(),
        "token_expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat()
    }
    
    if refresh_token:
        connector_data["encrypted_refresh_token"] = encrypt(refresh_token)
    
    sb.table("user_connectors").upsert(connector_data, on_conflict="user_id, provider").execute()
    
    
    return {"success": True, "provider": request.provider}

@router.post("/api/connectors/linkedin/upload")
async def upload_linkedin_data(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed")
        
    upload_dir = os.path.join(os.getcwd(), "uploads", "linkedin")
    os.makedirs(upload_dir, exist_ok=True)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    safe_filename = f"{user_id}_{timestamp}.zip"
    file_path = os.path.join(upload_dir, safe_filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        parsed_resume, raw_text = parse_linkedin_zip(file_path)
    except Exception as e:
        logger.error(f"Failed to parse LinkedIn zip: {e}")
        # Clean up the file if parsing fails
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail="Failed to parse LinkedIn export. Make sure it's a valid LinkedIn data export zip.")
        
    sb = get_supabase()
    
    # Store in base_resumes
    # We first check if a "LinkedIn Data Export" resume already exists for this user to overwrite it
    existing_resume_resp = sb.table("base_resumes").select("id").eq("user_id", user_id).eq("label", "LinkedIn Data Export").execute()
    if existing_resume_resp.data:
        # Update existing
        resume_id = existing_resume_resp.data[0]["id"]
        sb.table("base_resumes").update({
            "raw_text": raw_text,
            "parsed_json": parsed_resume.model_dump()
        }).eq("id", resume_id).execute()
    else:
        # Insert new
        sb.table("base_resumes").insert({
            "user_id": user_id,
            "label": "LinkedIn Data Export",
            "raw_text": raw_text,
            "parsed_json": parsed_resume.model_dump()
        }).execute()

    # Clean up zip
    if os.path.exists(file_path):
        os.remove(file_path)
        
    # Record connector in database
    connector_data = {
        "user_id": user_id,
        "provider": "linkedin",
        "encrypted_access_token": encrypt("linkedin-data-export"), # Dummy token
        "scopes_granted": ["data_export"],
        "status": "active",
        "connected_at": datetime.utcnow().isoformat()
    }
    
    sb.table("user_connectors").upsert(connector_data, on_conflict="user_id, provider").execute()
    
    return {"success": True, "provider": "linkedin"}

@router.get("/api/detected_events")
async def get_detected_events(user_id: str = Depends(get_current_user_id)):
    """Fetch pending detected events from Gmail and Calendar integrations."""
    sb = get_supabase()
    res = sb.table("detected_events").select("*").eq("user_id", user_id).eq("status", "pending").order("created_at", desc=True).execute()
    return res.data

@router.post("/api/detected_events/{event_id}/dismiss")
async def dismiss_detected_event(event_id: str, user_id: str = Depends(get_current_user_id)):
    """Dismiss a pending detected event."""
    sb = get_supabase()
    sb.table("detected_events").update({"status": "dismissed"}).eq("id", event_id).eq("user_id", user_id).execute()
    return {"status": "success"}

@router.post("/api/detected_events/{event_id}/confirm")
async def confirm_detected_event(event_id: str, user_id: str = Depends(get_current_user_id)):
    """Confirm a pending detected event (e.g. add to applications)."""
    sb = get_supabase()
    # Get event
    res = sb.table("detected_events").select("*").eq("id", event_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Event not found")
        
    event = res.data[0]
    
    if event["event_type"] == "email_application_status":
        company = event.get("company_name", "Unknown")
        status = event.get("event_data", {}).get("status", "Applied").capitalize()
        source_id = event.get("event_data", {}).get("source_message_id", "")
        
        # Upsert application tracker
        app_res = sb.table("applications").select("id").eq("user_id", user_id).ilike("company", f"%{company}%").execute()
        if app_res.data:
            sb.table("applications").update({
                "status": status,
                "source": "gmail",
                "source_reference_id": source_id
            }).eq("id", app_res.data[0]["id"]).execute()
        else:
            sb.table("applications").insert({
                "user_id": user_id,
                "company": company,
                "role": "Unknown Role",
                "status": status,
                "source": "gmail",
                "source_reference_id": source_id
            }).execute()
            
    # Calendar interviews don't strictly require confirmation into tracker, but could be added.
    
    sb.table("detected_events").update({"status": "confirmed"}).eq("id", event_id).eq("user_id", user_id).execute()
    return {"status": "success"}
