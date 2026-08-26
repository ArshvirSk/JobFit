from typing import List, Optional
from pydantic import BaseModel, Field

class FundingData(BaseModel):
    last_round_stage: Optional[str] = Field(None, description="e.g. Series A, Seed, Post-IPO")
    last_round_amount: Optional[str] = Field(None, description="e.g. $50M")
    total_raised: Optional[str] = Field(None, description="e.g. $120M")
    valuation: Optional[str] = Field(None, description="e.g. $1B")
    key_investors: List[str] = Field(default_factory=list, description="List of notable investors")

class LinkedInData(BaseModel):
    url: Optional[str] = Field(None, description="LinkedIn company URL")
    source_type: str = Field("link_only", description="Source of the data")
    link_confidence: Optional[str] = Field(None, description="'verified' or 'unverified_fallback'")
    note: str = Field(
        "Ratings and stats not scraped to respect Terms of Service. Please visit the URL.", 
        description="Explanation note"
    )

class GlassdoorData(BaseModel):
    url: Optional[str] = Field(None, description="Glassdoor company URL")
    source_type: str = Field("link_only", description="Source of the data")
    link_confidence: Optional[str] = Field(None, description="'verified' or 'unverified_fallback'")
    note: str = Field(
        "Ratings not scraped to respect Terms of Service. Please visit the URL.", 
        description="Explanation note"
    )

class CompensationData(BaseModel):
    average_package: Optional[str] = Field(None, description="e.g. ₹20 LPA or $150k")
    highest_package: Optional[str] = Field(None, description="e.g. ₹80 LPA")
    by_role: dict[str, str] = Field(
        default_factory=dict, 
        description="Mapping of role name to typical compensation range (e.g. {'SDE-1': '₹18-25 LPA'})"
    )

class BenefitsData(BaseModel):
    benefits: List[str] = Field(default_factory=list, description="List of key benefits e.g. 'Remote Work', 'Health Insurance'")

class CompetitorsData(BaseModel):
    top_competitors: List[str] = Field(default_factory=list, description="List of direct competitors in the sector")

class OpenJob(BaseModel):
    title: str = Field(description="Job title")
    location: str = Field(description="Location or 'Remote'")
    url: Optional[str] = Field(None, description="Link to the job posting if available")

class JobsData(BaseModel):
    open_roles: List[OpenJob] = Field(default_factory=list, description="Recent open roles")

class DSATopic(BaseModel):
    topic: str
    relative_frequency: str = Field(description="high, medium, or low")

class DSAQuestion(BaseModel):
    title: str
    difficulty: str = Field(description="easy, medium, or hard")
    topic: str
    leetcode_url: str
    source_note: str

class CompanyDSAProfile(BaseModel):
    topics_frequency: List[DSATopic]
    reported_questions: Optional[List[DSAQuestion]] = None
    confidence: str = Field(description="'verified_links', 'topic_only', or 'unavailable'")

class LinkEntry(BaseModel):
    url: Optional[str] = Field(None, description="URL of the specific profile or page")
    source_type: str = Field("link_only", description="Source of the data")
    link_confidence: Optional[str] = Field(None, description="'verified' or 'unverified_fallback'")
    note: Optional[str] = Field(None, description="Explanation note")

class ExtendedLinksData(BaseModel):
    website: Optional[LinkEntry] = None
    twitter: Optional[LinkEntry] = None
    instagram: Optional[LinkEntry] = None
    crunchbase: Optional[LinkEntry] = None
    ambitionbox: Optional[LinkEntry] = None

class OrgInfoData(BaseModel):
    founded_year: Optional[str] = Field(None, description="Year the company was founded")
    headcount_range: Optional[str] = Field(None, description="e.g. '1,000-5,000' or '10,000+'")
    hq_location: Optional[str] = Field(None, description="e.g. 'San Francisco, CA' or 'Bengaluru, India'")
    office_locations: List[str] = Field(default_factory=list, description="Major office locations")
    industry_tags: List[str] = Field(default_factory=list, description="Industry sector tags")
    confidence: str = Field(description="'high', 'medium', or 'low'")
    source: str = Field(description="Where this info was sourced from")

class InterviewProcessData(BaseModel):
    typical_rounds_summary: Optional[str] = Field(None, description="e.g. 'commonly reported: 4-5 rounds including 2 DSA rounds and 1 HR round'")
    careers_page_url: Optional[str] = Field(None, description="URL to the official careers page")
    confidence: str = Field(description="'high', 'medium', or 'not reliably available'")
    source: str = Field(description="Where this info was sourced from")

class CompanyProfile(BaseModel):
    """The normalized output that Phase 3 SPA will eventually consume."""
    entity_name: str
    funding: Optional[FundingData] = None
    linkedin: Optional[LinkedInData] = None
    glassdoor: Optional[GlassdoorData] = None
    extended_links: Optional[ExtendedLinksData] = None
    org_info: Optional[OrgInfoData] = None
    interview_process: Optional[InterviewProcessData] = None
    compensation: Optional[CompensationData] = None
    benefits: Optional[BenefitsData] = None
    competitors: Optional[CompetitorsData] = None
    jobs: Optional[JobsData] = None
    dsa: Optional[CompanyDSAProfile] = None
