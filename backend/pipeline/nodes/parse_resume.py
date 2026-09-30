import logging
from backend.services.llm import llm_service
from backend.models.schemas import ParsedResume
from backend.pipeline.prompts.resume_parse import RESUME_PARSE_SYSTEM, RESUME_PARSE_PROMPT

logger = logging.getLogger(__name__)

def validate_parsed_resume(parsed: ParsedResume, raw_text: str) -> dict:
    warnings = []
    confidence = "high"

    if len(raw_text) < 200:
        warnings.append("Extracted text is suspiciously short.")
        confidence = "low"
    
    if not parsed.experience:
        warnings.append("No work experience found.")
        confidence = "low"
        
    if not parsed.skills:
        warnings.append("No skills found.")
        confidence = "low"

    return {"confidence": confidence, "warnings": warnings}

async def parse_resume_node(state: dict) -> dict:
    """Node: Parse raw resume text into structured JSON. Usually done before the main graph starts, but can be included."""
    logger.info("Running parse_resume_node")
    raw_resume_text = state.get("raw_resume", "")
    
    if not raw_resume_text:
        return {"errors": state.get("errors", []) + ["No raw resume text provided."]}
        
    try:
        prompt = RESUME_PARSE_PROMPT.format(raw_resume_text=raw_resume_text)
        parsed_resume = await llm_service.generate_structured(
            system_msg=RESUME_PARSE_SYSTEM,
            prompt=prompt,
            response_model=ParsedResume
        )
        
        validation = validate_parsed_resume(parsed_resume, raw_resume_text)
        
        return {
            "parsed_resume": parsed_resume,
            "parse_confidence": validation["confidence"],
            "parse_warnings": validation["warnings"]
        }
    except Exception as e:
        logger.error(f"Error in parse_resume_node: {e}")
        return {"errors": state.get("errors", []) + [f"Resume Parse Error: {str(e)}"]}
