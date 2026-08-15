import logging
from typing import List
from pydantic import BaseModel, Field
from backend.services.llm import llm_service

logger = logging.getLogger(__name__)

class ATSCheckOutput(BaseModel):
    issues: List[str] = Field(description="List of 2-5 specific ATS compatibility warnings and actionable fix suggestions.")

async def check_ats_node(state: dict) -> dict:
    """Node to check the resume for ATS compatibility issues."""
    logger.info("Running check_ats_node")
    
    raw_resume = state.get("raw_resume")
    parsed_resume = state.get("parsed_resume")
    
    if not raw_resume:
        logger.warning("No raw resume found, skipping ATS check.")
        return {"ats_issues": []}
        
    system_msg = (
        "You are an expert ATS (Applicant Tracking System) optimizer and technical recruiter. "
        "Your task is to analyze the provided raw extracted text from a candidate's resume and "
        "identify potential ATS compatibility issues. Look for signs of:\n"
        "- Missing standard headers (e.g., missing 'Education' or 'Experience' section)\n"
        "- Signs of complex multi-column layouts (unusual text wrapping or jumbled text)\n"
        "- Missing critical contact info (email, phone)\n"
        "- Unreadable or missing dates for roles\n"
        "Generate a list of 2-5 actionable warnings. If the resume is perfectly fine, return an empty list."
    )
    
    # We pass the raw text and a quick summary of what the parser found
    parsed_summary = "Parser was unable to extract structured data."
    if parsed_resume:
        parsed_summary = (
            f"Parser found: Name: {parsed_resume.name}, "
            f"Experience roles: {len(parsed_resume.experience)}, "
            f"Education entries: {len(parsed_resume.education)}, "
            f"Skills: {len(parsed_resume.skills)} skills found."
        )
        
    prompt = (
        f"--- PARSER SUMMARY ---\n{parsed_summary}\n\n"
        f"--- RAW EXTRACTED TEXT ---\n{raw_resume[:3000]}...\n\n"
        "Identify ATS compatibility issues."
    )
    
    try:
        result = await llm_service.generate_structured(
            system_msg=system_msg,
            prompt=prompt,
            response_model=ATSCheckOutput
        )
        return {"ats_issues": result.issues}
    except Exception as e:
        logger.error(f"Failed to perform ATS check: {e}")
        return {"errors": [f"Failed to check ATS compatibility: {str(e)}"]}
