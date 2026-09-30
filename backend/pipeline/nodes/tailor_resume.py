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
        
    missing_reqs = state.get("missing_requirements")
    if missing_reqs:
        missing_section = "Identified Gaps (Try to reframe existing adjacent experience to address these if possible):\n" + "\n".join(f"- {r}" for r in missing_reqs)
    else:
        missing_section = ""

    github_signal = state.get("github_signal")
    if github_signal:
        github_section = f"\nAdditional GitHub Signal (Can be woven into projects/skills if it fills a gap):\n{github_signal}\n"
    else:
        github_section = ""

    try:
        prompt = TAILOR_PROMPT.format(
            role=parsed_jd.role_title,
            company=parsed_jd.company,
            responsibilities=", ".join(parsed_jd.responsibilities),
            keywords=", ".join(parsed_jd.keywords) if parsed_jd.keywords else "",
            missing_requirements_section=missing_section,
            parsed_resume=parsed_resume.model_dump_json(indent=2),
            github_signal_section=github_section
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
