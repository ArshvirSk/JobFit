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
        "DO NOT output generic questions like 'Tell me about yourself' or 'What is your greatest weakness'.\n"
        "IMPORTANT: Adjust the question style and focus based on the company's stage and signals. "
        "For example, if it's an early/growth-stage startup (Series A/B), emphasize ownership, ambiguity, and scrappiness. "
        "If it's a larger enterprise/public company, emphasize process, scale, and cross-team coordination. "
        "Use competitor context to formulate 'How would you compete with X' style questions."
    )
    
    # Try to fetch company profile context
    company_context_str = ""
    if parsed_jd.company:
        try:
            from backend.services.supabase_client import get_supabase
            sb = get_supabase()
            # Fetch all categories for this company
            res = sb.table("company_profiles").select("category, data").ilike("entity_name", f"%{parsed_jd.company}%").execute()
            if res.data:
                profile_data = {r["category"]: r["data"] for r in res.data}
                context_parts = []
                
                funding = profile_data.get("funding")
                if funding:
                    stage = funding.get("last_round_stage", "Unknown")
                    context_parts.append(f"- Funding Stage: {stage}")
                
                competitors = profile_data.get("competitors")
                if competitors and "competitors" in competitors:
                    comps = competitors["competitors"]
                    if isinstance(comps, list):
                        comp_names = [c.get("name", "") for c in comps[:3] if isinstance(c, dict)]
                        if comp_names:
                            context_parts.append(f"- Competitors: {', '.join(comp_names)}")
                
                benefits = profile_data.get("benefits")
                if benefits and "culture_values" in benefits:
                    culture = benefits["culture_values"]
                    if isinstance(culture, list) and culture:
                        context_parts.append(f"- Culture/Values: {', '.join(culture[:3])}")
                        
                if context_parts:
                    company_context_str = "Company Profile Context:\n" + "\n".join(context_parts) + "\n\n"
        except Exception as e:
            logger.warning(f"Failed to fetch company profile context for interview questions: {e}")

    prompt = (
        f"Role: {parsed_jd.role_title}\n"
        f"Company: {parsed_jd.company}\n"
        f"Seniority: {parsed_jd.seniority}\n"
        f"Required Skills: {', '.join(parsed_jd.required_skills)}\n"
        f"Responsibilities: {', '.join(parsed_jd.responsibilities)}\n\n"
        f"{company_context_str}"
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

