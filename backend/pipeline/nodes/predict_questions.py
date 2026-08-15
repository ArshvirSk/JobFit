import logging
from typing import List
from pydantic import BaseModel, Field
from backend.services.llm import llm_service

logger = logging.getLogger(__name__)

class InterviewQuestionsOutput(BaseModel):
    questions: List[str] = Field(description="List of 8-10 highly specific interview questions based on the job description.")

async def predict_questions_node(state: dict) -> dict:
    """Node to predict likely interview questions based on the JD."""
    logger.info("Running predict_questions_node")
    
    parsed_jd = state.get("parsed_jd")
    if not parsed_jd:
        logger.warning("No parsed JD found, skipping interview question prediction.")
        return {"interview_questions": []}
        
    system_msg = (
        "You are an expert technical recruiter and hiring manager. "
        "Your task is to predict 8-10 highly likely interview questions that a candidate will face "
        "for this specific role. Include a mix of technical, situational, and behavioral questions "
        "tailored strictly to the skills and responsibilities mentioned in the job description. "
        "DO NOT output generic questions like 'Tell me about yourself' or 'What is your greatest weakness'."
    )
    
    prompt = (
        f"Role: {parsed_jd.role_title}\n"
        f"Company: {parsed_jd.company}\n"
        f"Seniority: {parsed_jd.seniority}\n"
        f"Required Skills: {', '.join(parsed_jd.required_skills)}\n"
        f"Responsibilities: {', '.join(parsed_jd.responsibilities)}\n\n"
        "Generate 8-10 specific interview questions."
    )
    
    try:
        result = await llm_service.generate_structured(
            system_msg=system_msg,
            prompt=prompt,
            response_model=InterviewQuestionsOutput
        )
        return {"interview_questions": result.questions}
    except Exception as e:
        logger.error(f"Failed to generate interview questions: {e}")
        return {"errors": [f"Failed to predict interview questions: {str(e)}"]}
