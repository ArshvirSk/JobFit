import logging
from pydantic import BaseModel
from typing import List
from backend.services.llm import llm_service
from backend.models.schemas import SkillGap
from backend.pipeline.prompts.gap_analysis import GAP_ANALYSIS_SYSTEM, GAP_ANALYSIS_PROMPT

logger = logging.getLogger(__name__)

class SkillGapList(BaseModel):
    gaps: List[SkillGap]

async def analyze_gap_node(state: dict) -> dict:
    """Node: Analyze skill gaps between resume and JD."""
    logger.info("Running analyze_gap_node")
    parsed_resume = state.get("parsed_resume")
    parsed_jd = state.get("parsed_jd")
    
    if not parsed_resume or not parsed_jd:
        return {"errors": state.get("errors", []) + ["Missing parsed resume or parsed JD."]}
        
    try:
        jd_skills = ", ".join(parsed_jd.required_skills)
        resume_skills = ", ".join(parsed_resume.skills)
        
        prompt = GAP_ANALYSIS_PROMPT.format(
            jd_skills=jd_skills,
            resume_skills=resume_skills
        )
        
        result = await llm_service.generate_structured(
            system_msg=GAP_ANALYSIS_SYSTEM,
            prompt=prompt,
            response_model=SkillGapList
        )
        
        return {"skill_gaps": result.gaps}
    except Exception as e:
        logger.error(f"Error in analyze_gap_node: {e}")
        return {"errors": state.get("errors", []) + [f"Gap Analysis Error: {str(e)}"]}
