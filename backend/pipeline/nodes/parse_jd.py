import logging
from backend.services.llm import llm_service
from backend.models.schemas import ParsedJD
from backend.pipeline.prompts.jd_parse import JD_PARSE_SYSTEM, JD_PARSE_PROMPT

logger = logging.getLogger(__name__)

async def parse_jd_node(state: dict) -> dict:
    """Node: Parse raw JD text into structured format."""
    logger.info("Running parse_jd_node")
    raw_jd_text = state.get("raw_jd", "")
    
    if not raw_jd_text:
        return {"errors": state.get("errors", []) + ["No raw JD text provided."]}
        
    try:
        prompt = JD_PARSE_PROMPT.format(raw_jd_text=raw_jd_text)
        parsed_jd = await llm_service.generate_structured(
            system_msg=JD_PARSE_SYSTEM,
            prompt=prompt,
            response_model=ParsedJD
        )
        return {"parsed_jd": parsed_jd}
    except Exception as e:
        logger.error(f"Error in parse_jd_node: {e}")
        return {"errors": state.get("errors", []) + [f"JD Parse Error: {str(e)}"]}
