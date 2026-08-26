import logging
import json
from typing import List
from pydantic import BaseModel, Field
from backend.services.llm import llm_service

logger = logging.getLogger(__name__)

class JobFitScore(BaseModel):
    job_index: int = Field(description="The index of the job in the provided list (0-indexed)")
    fit_label: str = Field(description="'strong_match', 'partial_match', or 'stretch'")
    matched_requirements: List[str] = Field(description="Max 3 concise bullet points of what matches")
    missing_requirements: List[str] = Field(description="Max 3 concise bullet points of gaps/missing requirements")
    summary: str = Field(description="A 1-line natural language reason")

class BatchedJobFitScores(BaseModel):
    scores: List[JobFitScore]

FIT_SCORING_SYSTEM = """You are an expert technical recruiter and career coach.
You will receive a candidate's parsed resume and a list of open jobs.
For each open job, analyze the candidate's fit based on their skills, experience, and seniority level against the job's title and inferred requirements.

Output a score for EACH job provided.
Keep the matched and missing requirements extremely concise (max 3 short items each).
Do NOT hallucinate information not in the resume."""

FIT_SCORING_PROMPT = """Candidate Resume:
{resume_json}

Open Jobs:
{jobs_json}

Analyze the fit for each job and return the structured response. Make sure to return exactly one score per job provided."""

async def score_jobs_fit(parsed_resume: dict, jobs: List[dict]) -> BatchedJobFitScores:
    """Batch score a list of open jobs against a candidate's resume."""
    if not jobs:
        return BatchedJobFitScores(scores=[])
        
    jobs_with_index = [{"index": idx, **job} for idx, job in enumerate(jobs)]
    
    prompt = FIT_SCORING_PROMPT.format(
        resume_json=json.dumps(parsed_resume, indent=2),
        jobs_json=json.dumps(jobs_with_index, indent=2)
    )
    
    try:
        response = await llm_service.generate_structured(
            system_msg=FIT_SCORING_SYSTEM,
            prompt=prompt,
            response_model=BatchedJobFitScores
        )
        return response
    except Exception as e:
        logger.error(f"Error in score_jobs_fit: {e}")
        return BatchedJobFitScores(scores=[])
