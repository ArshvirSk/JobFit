import logging
import os
import uuid
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Query, Request, Depends, Header
from pydantic import BaseModel
import jwt

from backend.models.schemas import ParsedResume, PipelineInput, PipelineOutput
from backend.parsers.resume_parser import parse_resume_file
from backend.parsers.jd_parser import extract_text_from_url
from backend.pipeline.graph import jobfit_pipeline
from backend.pipeline.nodes.parse_resume import parse_resume_node
from backend.config import settings
from backend.services.supabase_client import get_supabase
from backend.services import stripe_service

logger = logging.getLogger(__name__)

router = APIRouter()

# For Phase 1, store uploaded resumes temporarily in memory or local disk
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Auth dependency ──────────────────────────────────────

async def get_current_user_id(authorization: str = Header(None)) -> str:
    """Extract user_id from Supabase JWT in the Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.split(" ", 1)[1]

    try:
        # Instead of using sb.auth.get_user(token) which attempts buggy local PyJWT verification
        # for ES256 tokens, we hit the Supabase Auth REST endpoint directly.
        import httpx
        url = f"{settings.supabase_url}/auth/v1/user"
        headers = {
            "Authorization": f"Bearer {token}",
            "apikey": settings.supabase_anon_key
        }
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers)
            
        if resp.status_code != 200:
            logger.error(f"[Auth] get_user REST call failed: {resp.status_code} {resp.text}")
            raise HTTPException(status_code=401, detail=f"Supabase Auth rejected token: {resp.status_code} {resp.text}")
            
        user_data = resp.json()
        if not user_data or "id" not in user_data:
            logger.error(f"[Auth] get_user returned empty for token {token[:10]}...")
            raise HTTPException(status_code=401, detail=f"Supabase Auth returned empty user object: {resp.text}")
            
        return user_data["id"]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Auth] Auth token validation failed for token {token[:10]}... Error: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")


# ── Request models ───────────────────────────────────────

class ParseTextRequest(BaseModel):
    raw_text: str

class FitScoreRequest(BaseModel):
    base_resume_id: str
    jd_text: str
    company: Optional[str] = None
    role: Optional[str] = None

class CheckoutSessionRequest(BaseModel):
    plan_tier: str

class SaveResumeRequest(BaseModel):
    label: str
    raw_text: str

class SaveApplicationRequest(BaseModel):
    company: str
    role: str
    status: str = "Materials Generated"
    notes: str = ""
    job_url: Optional[str] = None
    resume_version_used: Optional[str] = None
    cover_letter_generated: Optional[bool] = False
    fit_label: Optional[str] = None

class UpdateApplicationStatusRequest(BaseModel):
    status: str

class UpdateApplicationRequest(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    job_url: Optional[str] = None
    resume_version_used: Optional[str] = None
    cover_letter_generated: Optional[bool] = None
    fit_label: Optional[str] = None


# ── Health ───────────────────────────────────────────────

@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


# ── Resume Parsing (no auth required) ────────────────────

@router.post("/api/resume/upload", response_model=ParsedResume)
async def upload_resume(file: UploadFile = File(...)):
    """Upload and parse a resume file (PDF, DOCX)."""
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["pdf", "docx", "doc", "txt"]:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{file_ext}")

    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        raw_text = parse_resume_file(file_path, file_ext)
        result = await parse_resume_node({"raw_resume": raw_text})
        if "errors" in result and result["errors"]:
            raise ValueError(" | ".join(result["errors"]))
        return result["parsed_resume"]

    except Exception as e:
        logger.warning(f"Resume upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/api/resume/extract-text")
async def extract_resume_text_endpoint(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    """Extract raw text from a PDF or DOCX file."""
    file_ext = file.filename.split(".")[-1].lower()
    if file_ext not in ["pdf", "docx", "doc", "txt"]:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{file_ext}")

    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)

        raw_text = parse_resume_file(file_path, file_ext)
        return {"raw_text": raw_text}
    except Exception as e:
        logger.warning(f"Text extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/api/resume/parse-text", response_model=ParsedResume)
async def parse_resume_text(request: ParseTextRequest):
    """Parse raw pasted resume text."""
    try:
        result = await parse_resume_node({"raw_resume": request.raw_text})
        if "errors" in result and result["errors"]:
            raise ValueError(" | ".join(result["errors"]))
        return result["parsed_resume"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Tailor Pipeline (auth required) ─────────────────────

@router.post("/api/tailor", response_model=PipelineOutput)
async def run_tailor_pipeline(input_data: PipelineInput, user_id: str = Depends(get_current_user_id)):
    """Run the full LangGraph pipeline to tailor the resume and generate a cover letter."""
    sb = get_supabase()

    # 0. Fetch user and check limits
    user_resp = sb.table("users").select("*").eq("id", user_id).single().execute()
    user = user_resp.data
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user["plan_tier"] == "free" and user["credits_used"] >= user["credits_limit"]:
        raise HTTPException(status_code=403, detail="Free tier limit reached. Please upgrade to Pro.")

    # 1. Resolve JD text
    jd_text = input_data.jd_text
    if not jd_text and input_data.jd_url:
        try:
            jd_text = await extract_text_from_url(input_data.jd_url)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    if not jd_text:
        raise HTTPException(status_code=400, detail="Must provide jd_text or jd_url")

    # 2. Resolve Resume text
    resume_text = input_data.resume_text
    if not resume_text and input_data.base_resume_id:
        resume_resp = sb.table("base_resumes").select("raw_text").eq("id", input_data.base_resume_id).eq("user_id", user_id).single().execute()
        if resume_resp.data:
            resume_text = resume_resp.data["raw_text"]

    if not resume_text:
        raise HTTPException(status_code=400, detail="Must provide resume_text or base_resume_id")

    # 3. Fetch GitHub Signal
    github_signal = None
    github_resp = sb.table("base_resumes").select("raw_text").eq("user_id", user_id).eq("label", "GitHub Profile").execute()
    if github_resp.data:
        github_signal = github_resp.data[0]["raw_text"]

    # 4. Invoke LangGraph pipeline
    initial_state = {
        "raw_jd": jd_text,
        "raw_resume": resume_text,
        "tone": "professional",
        "missing_requirements": input_data.missing_requirements,
        "github_signal": github_signal,
        "errors": []
    }

    try:
        logger.debug("Invoking LangGraph pipeline")
        final_state = await jobfit_pipeline.ainvoke(initial_state)

        if not final_state.get("tailored_resume") or not final_state.get("cover_letter"):
            raise ValueError(f"Pipeline failed. Errors: {final_state.get('errors')}")

        # Increment credits
        sb.table("users").update({"credits_used": user["credits_used"] + 1}).eq("id", user_id).execute()

        # Log usage
        sb.table("usage_log").insert({"user_id": user_id, "action": "tailor", "tier": user["plan_tier"]}).execute()

        # Strip pro features if free tier
        interview_questions = final_state.get("interview_questions")
        ats_issues = final_state.get("ats_issues")

        if user["plan_tier"] == "free":
            interview_questions = None
            ats_issues = None

        return PipelineOutput(
            tailored_resume=final_state["tailored_resume"],
            cover_letter=final_state["cover_letter"],
            skill_gaps=final_state.get("skill_gaps", []),
            interview_questions=interview_questions,
            ats_issues=ats_issues
        )

    except Exception as e:
        logger.warning(f"Pipeline execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/fit-score")
async def get_fit_score(request: FitScoreRequest, user_id: str = Depends(get_current_user_id)):
    """Fast endpoint just to score the fit between a resume and JD."""
    sb = get_supabase()
    resume_resp = sb.table("base_resumes").select("parsed_json").eq("id", request.base_resume_id).eq("user_id", user_id).single().execute()
    if not resume_resp.data or not resume_resp.data.get("parsed_json"):
        raise HTTPException(status_code=400, detail="Resume not found or not parsed")
    
    parsed_resume = resume_resp.data["parsed_json"]
    
    try:
        from backend.services.llm import llm_service
        from pydantic import BaseModel
        
        class FitScoreResponse(BaseModel):
            fit_score: int
            fit_label: str
            analysis: str
            
        prompt = f"""
        Analyze the fit between this candidate's resume and the job description.
        Job Title: {request.role or 'Unknown'}
        Company: {request.company or 'Unknown'}
        
        Job Description:
        {request.jd_text}
        
        Candidate Resume (JSON):
        {parsed_resume}
        """
        
        result = await llm_service.generate_structured(
            system_msg="You are an expert technical recruiter. Score the candidate's fit out of 100. Provide a short 2-sentence analysis and a label (e.g. 'Strong Fit', 'Reach', 'Mismatch').",
            prompt=prompt,
            response_model=FitScoreResponse
        )
        return result.model_dump()
    except Exception as e:
        logger.error(f"Fit score failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── User Profile ─────────────────────────────────────────

@router.get("/api/user/me")
async def get_my_profile(user_id: str = Depends(get_current_user_id)):
    """Get the authenticated user's profile."""
    sb = get_supabase()
    resp = sb.table("users").select("*").eq("id", user_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="User not found")
    return resp.data


# ── Billing (Stripe) ────────────────────────────────────

@router.post("/api/billing/checkout")
async def create_checkout(request: CheckoutSessionRequest, user_id: str = Depends(get_current_user_id)):
    """Create a Stripe Checkout Session for subscription."""
    sb = get_supabase()
    user_resp = sb.table("users").select("email").eq("id", user_id).single().execute()
    if not user_resp.data:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        url = stripe_service.create_checkout_session(
            user_id=user_id,
            user_email=user_resp.data["email"],
            plan_tier=request.plan_tier,
        )
        return {"url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.warning(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@router.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (e.g. checkout.session.completed)."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe_service.verify_webhook(payload, sig)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    if event["type"] == "checkout.session.completed":
        try:
            session = event.data.object
            metadata = getattr(session, "metadata", None)
            
            user_id = getattr(metadata, "user_id", None) if metadata else None
            plan_tier = getattr(metadata, "plan_tier", "pro") if metadata else "pro"
            stripe_customer_id = getattr(session, "customer", None)

            if user_id:
                sb = get_supabase()
                res = sb.table("users").update({
                    "plan_tier": plan_tier,
                    "credits_limit": 999999,  # Effectively unlimited for pro
                    "stripe_customer_id": stripe_customer_id,
                }).eq("id", user_id).execute()
                logger.info(f"Upgraded user {user_id} to {plan_tier}")
            else:
                logger.warning("No user_id found in checkout session metadata")
        except Exception as e:
            logger.error(f"Failed to process checkout webhook: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    return {"received": True}


# ── Resumes CRUD ─────────────────────────────────────────

@router.get("/api/resume")
async def get_resumes(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    resp = sb.table("base_resumes").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return resp.data

@router.post("/api/resume")
async def save_resume(request: SaveResumeRequest, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    
    # Parse the resume on upload so we don't have to re-parse it for every chat lookup
    try:
        from backend.pipeline.nodes.parse_resume import parse_resume_node
        parse_result = await parse_resume_node({"raw_resume": request.raw_text})
        
        if "errors" in parse_result and parse_result["errors"]:
            raise ValueError(" | ".join(parse_result["errors"]))
            
        parsed_resume = parse_result.get("parsed_resume")
        parsed_json = parsed_resume.model_dump() if parsed_resume else None
        confidence = parse_result.get("parse_confidence", "high")
        warnings = parse_result.get("parse_warnings", [])
    except Exception as e:
        logger.error(f"Failed to parse resume on upload: {e}")
        parsed_json = None
        confidence = "low"
        warnings = [str(e)]
        
    resp = sb.table("base_resumes").insert({
        "user_id": user_id,
        "label": request.label,
        "raw_text": request.raw_text,
        "parsed_json": parsed_json
    }).execute()
    
    result = resp.data[0] if resp.data else {}
    result["parse_confidence"] = confidence
    result["parse_warnings"] = warnings
    return result

@router.delete("/api/resume/{resume_id}")
async def delete_resume(resume_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    resp = sb.table("base_resumes").delete().eq("id", resume_id).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"success": True}

@router.post("/api/resume/{resume_id}/reparse")
async def reparse_resume(resume_id: str, user_id: str = Depends(get_current_user_id)):
    """Re-run the extraction on the saved raw_text to generate a fresh parsed_json."""
    sb = get_supabase()
    
    # 1. Fetch the existing resume
    resp = sb.table("base_resumes").select("raw_text").eq("id", resume_id).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Resume not found")
        
    raw_text = resp.data[0].get("raw_text", "")
    if not raw_text:
        raise HTTPException(status_code=400, detail="Resume has no raw text to re-parse")
        
    # 2. Re-parse using the node
    try:
        from backend.pipeline.nodes.parse_resume import parse_resume_node
        parse_result = await parse_resume_node({"raw_resume": raw_text})
        
        if "errors" in parse_result and parse_result["errors"]:
            raise ValueError(" | ".join(parse_result["errors"]))
            
        parsed_resume = parse_result.get("parsed_resume")
        parsed_json = parsed_resume.model_dump() if parsed_resume else None
        
        confidence = parse_result.get("parse_confidence", "high")
        warnings = parse_result.get("parse_warnings", [])
        
    except Exception as e:
        logger.error(f"Failed to re-parse resume {resume_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Parse error: {e}")
        
    # 3. Update the database
    update_resp = sb.table("base_resumes").update({
        "parsed_json": parsed_json
    }).eq("id", resume_id).eq("user_id", user_id).execute()
    
    return {
        "success": True, 
        "resume": update_resp.data[0] if update_resp.data else {},
        "confidence": confidence,
        "warnings": warnings
    }


# ── Applications Tracker CRUD ────────────────────────────

@router.get("/api/applications")
async def get_applications(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    resp = sb.table("applications").select("*").eq("user_id", user_id).order("applied_at", desc=True).execute()
    return resp.data

@router.post("/api/applications")
async def save_application(request: SaveApplicationRequest, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    resp = sb.table("applications").insert({
        "user_id": user_id,
        "company": request.company,
        "role": request.role,
        "status": request.status,
        "notes": request.notes,
        "job_url": request.job_url,
        "resume_version_used": request.resume_version_used,
        "cover_letter_generated": request.cover_letter_generated,
        "fit_label": request.fit_label,
    }).execute()
    return resp.data[0] if resp.data else {}

@router.patch("/api/applications/{app_id}/status")
async def update_application_status(app_id: str, request: UpdateApplicationStatusRequest, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    resp = sb.table("applications").update({"status": request.status}).eq("id", app_id).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Application not found")
    return resp.data[0]

@router.patch("/api/applications/{app_id}")
async def update_application(app_id: str, request: UpdateApplicationRequest, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    update_data = {k: v for k, v in request.dict().items() if v is not None}
    if not update_data:
        return {"success": True}
    resp = sb.table("applications").update(update_data).eq("id", app_id).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Application not found")
    return resp.data[0]

@router.delete("/api/applications/{app_id}")
async def delete_application(app_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase()
    resp = sb.table("applications").delete().eq("id", app_id).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"success": True}
