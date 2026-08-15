import logging
import json
from backend.services.llm import llm_service
from backend.models.schemas import ParsedResume
from backend.pipeline.prompts.tailor import TAILOR_SYSTEM, TAILOR_PROMPT

logger = logging.getLogger(__name__)

async def tailor_resume_node(state: dict) -> dict:
    """Node: Tailor resume based on JD."""
    logger.info("Running tailor_resume_node")
    parsed_resume = state.get("parsed_resume")
    parsed_jd = state.get("parsed_jd")
    
    if not parsed_resume or not parsed_jd:
        return {"errors": state.get("errors", []) + ["Missing parsed resume or parsed JD."]}
        
    try:
        prompt = TAILOR_PROMPT.format(
            role=parsed_jd.role_title,
            company=parsed_jd.company,
            responsibilities=", ".join(parsed_jd.responsibilities),
            keywords=", ".join(parsed_jd.keywords) if parsed_jd.keywords else "",
            parsed_resume=parsed_resume.model_dump_json(indent=2)
        )
        
        tailored_resume = await llm_service.generate_structured(
            system_msg=TAILOR_SYSTEM,
            prompt=prompt,
            response_model=ParsedResume
        )
        
        return {"tailored_resume": tailored_resume}
    except Exception as e:
        logger.error(f"Error in tailor_resume_node: {e}")
        return {"errors": state.get("errors", []) + [f"Tailor Resume Error: {str(e)}"]}
