import logging

logger = logging.getLogger(__name__)


async def predict_questions_node(state: dict) -> dict:
    """P1 Stub: Generate interview questions."""
    logger.info("Running predict_questions_node (STUB)")
    return {"interview_questions": []}


async def check_ats_node(state: dict) -> dict:
    """P1 Stub: Generate ATS compatibility issues."""
    logger.info("Running check_ats_node (STUB)")
    return {"ats_issues": []}
