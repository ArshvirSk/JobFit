import logging
from backend.services.llm import llm_service
from backend.models.schemas import CoverLetter
from backend.pipeline.prompts.cover_letter import COVER_LETTER_SYSTEM, COVER_LETTER_PROMPT

logger = logging.getLogger(__name__)

async def generate_cover_node(state: dict) -> dict:
    """Node: Generate a role-specific cover letter."""
    logger.info("Running generate_cover_node")
    parsed_resume = state.get("parsed_resume")
    parsed_jd = state.get("parsed_jd")
    tone = state.get("tone", "professional")
    
    if not parsed_resume or not parsed_jd:
        return {"errors": state.get("errors", []) + ["Missing parsed resume or parsed JD."]}
        
    try:
        jd_highlights = f"Required: {', '.join(parsed_jd.required_skills)}\nResponsibilities: {', '.join(parsed_jd.responsibilities[:3])}"
        
        # Pick top 2 experience entries for highlights
        resume_highlights = ""
        for exp in parsed_resume.experience[:2]:
            resume_highlights += f"{exp.role} at {exp.company}: {exp.bullets[0]}\n"
            
        prompt = COVER_LETTER_PROMPT.format(
            role=parsed_jd.role_title,
            company=parsed_jd.company,
            tone=tone,
            jd_highlights=jd_highlights,
            resume_highlights=resume_highlights
        )
        
        cover_letter = await llm_service.generate_structured(
            system_msg=COVER_LETTER_SYSTEM.format(tone=tone),
            prompt=prompt,
            response_model=CoverLetter
        )
        
        return {"cover_letter": cover_letter}
    except Exception as e:
        logger.error(f"Error in generate_cover_node: {e}")
        return {"errors": state.get("errors", []) + [f"Generate Cover Letter Error: {str(e)}"]}
