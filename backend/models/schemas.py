from typing import List, Optional
from pydantic import BaseModel, Field

# --- Parsed Resume Models ---

class Experience(BaseModel):
    company: str
    role: str
    start_date: str
    end_date: Optional[str] = None
    bullets: List[str]

class Education(BaseModel):
    institution: str
    degree: str
    graduation_date: Optional[str] = None

class ParsedResume(BaseModel):
    name: str
    contact_info: str
    summary: str
    experience: List[Experience]
    education: List[Education]
    skills: List[str]
    certifications: Optional[List[str]] = None
    projects: Optional[List[str]] = None

# --- JD Models ---

class ParsedJD(BaseModel):
    role_title: str
    company: str
    required_skills: List[str]
    preferred_skills: Optional[List[str]] = None
    seniority: str
    responsibilities: List[str]
    keywords: Optional[List[str]] = None
    industry: Optional[str] = None

# --- Pipeline Models ---

class SkillGap(BaseModel):
    skill_name: str
    suggestion_type: str = Field(description="e.g. course, project, phrasing")
    suggestion_text: str

class CoverLetter(BaseModel):
    text: str
    tone: str

class PipelineInput(BaseModel):
    jd_text: Optional[str] = None
    jd_url: Optional[str] = None
    resume_text: Optional[str] = None
    base_resume_id: Optional[str] = None

class PipelineOutput(BaseModel):
    tailored_resume: ParsedResume
    cover_letter: CoverLetter
    skill_gaps: List[SkillGap]
    interview_questions: Optional[List[str]] = None
    ats_issues: Optional[List[str]] = None
