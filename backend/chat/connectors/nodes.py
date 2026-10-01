import logging
import asyncio
from backend.chat.connectors.base import BaseConnector
from backend.chat.connectors.schemas import (
    FundingData, LinkedInData, GlassdoorData, 
    CompensationData, BenefitsData, CompetitorsData, JobsData, CompanyDSAProfile,
    ExtendedLinksData, OrgInfoData, InterviewProcessData, LinkEntry
)
from backend.services.llm import llm_service
from backend.services.research import research_company

logger = logging.getLogger(__name__)

class FundingConnector(BaseConnector):
    category = "funding"
    ttl_hours = 24 * 7  # 1 week
    response_model = FundingData
    source = "deep_research"

    async def _fetch_live(self, entity_name: str) -> FundingData:
        return await research_company(
            entity_name,
            FundingData,
            category=self.category,
            goal=(
                "You are a helpful assistant that finds funding and investment data for companies. "
                "Be accurate and concise."
            ),
            field_hint=(
                "Find the latest funding round (stage and amount), total funding raised, valuation, "
                "and key investors. Bootstrapped/private companies often have no disclosed funding — "
                "that is a valid answer, but check funding databases and news before concluding it."
            ),
        )

class LinkedInConnector(BaseConnector):
    category = "linkedin"
    ttl_hours = 24 * 90  # 90 days
    response_model = LinkedInData
    source = "google_search_llm"

    async def _fetch_live(self, entity_name: str) -> LinkedInData:
        system_msg = "Find the official LinkedIn company page URL for a company."
        prompt = f"Find the official LinkedIn company page URL for '{entity_name}'. Return ONLY a JSON object with a 'url' field."
        res = await llm_service.generate_structured_with_search(system_msg, prompt, self.response_model)
        
        # Verification
        url = res.url or ""
        clean_name = entity_name.lower().replace(" ", "").replace("-", "")
        # Basic domain check: Does it look like a valid linkedin company url that somewhat matches the name?
        if url.startswith("https://www.linkedin.com/company/") and any(part in url.lower() for part in [clean_name, clean_name[:4]]):
            res.link_confidence = "verified"
        else:
            res.url = f"https://www.linkedin.com/search/results/companies/?keywords={entity_name}"
            res.link_confidence = "unverified_fallback"
            
        res.source_type = "link_only"
        res.note = "Ratings and stats not scraped to respect Terms of Service. Please visit the URL."
        return res

class GlassdoorConnector(BaseConnector):
    category = "glassdoor"
    ttl_hours = 24 * 90  # 90 days
    response_model = GlassdoorData
    source = "link_only"

    async def _fetch_live(self, entity_name: str) -> GlassdoorData:
        # Just resolve the URL via LLM search, do NOT scrape ratings.
        system_msg = "Find the official Glassdoor company page URL for a company."
        prompt = f"What is the official Glassdoor company profile URL for '{entity_name}'? Do not provide ratings. Return ONLY a JSON object with a 'url' field."
        res = await llm_service.generate_structured_with_search(system_msg, prompt, self.response_model)
        
        # Verification
        url = res.url or ""
        clean_name = entity_name.lower().replace(" ", "").replace("-", "")
        # Basic domain check
        if url.startswith("https://www.glassdoor") and "/Overview/Working-at-" in url and any(part in url.lower() for part in [clean_name, clean_name[:4]]):
            res.link_confidence = "verified"
        else:
            res.url = f"https://www.glassdoor.com/Search/results.htm?keyword={entity_name}"
            res.link_confidence = "unverified_fallback"

        res.source_type = "link_only"
        res.note = "Ratings not scraped to respect Terms of Service. Please visit the URL."
        return res

class CompensationConnector(BaseConnector):
    category = "compensation"
    ttl_hours = 24 * 14
    response_model = CompensationData
    source = "deep_research"

    async def _fetch_live(self, entity_name: str) -> CompensationData:
        return await research_company(
            entity_name,
            CompensationData,
            category=self.category,
            goal=(
                "Find average and highest compensation package estimates for a company. "
                "Break it down by role if possible."
            ),
            field_hint=(
                "Find software/tech compensation at this company: average package, highest reported, "
                "and ranges by level (e.g. SDE-1, SDE-2). Salary aggregators, job posts and employee "
                "reports are the best sources."
            ),
        )

class BenefitsConnector(BaseConnector):
    category = "benefits"
    ttl_hours = 24 * 30
    response_model = BenefitsData
    source = "deep_research"

    async def _fetch_live(self, entity_name: str) -> BenefitsData:
        return await research_company(
            entity_name,
            BenefitsData,
            category=self.category,
            goal="List the top employee benefits for a company.",
            field_hint=(
                "Find the concrete employee benefits and perks this company offers (insurance, "
                "hybrid/remote policy, training, leave). Careers pages and review sites are the "
                "best sources."
            ),
        )

class CompetitorsConnector(BaseConnector):
    category = "competitors"
    ttl_hours = 24 * 30
    response_model = CompetitorsData
    source = "deep_research"

    async def _fetch_live(self, entity_name: str) -> CompetitorsData:
        return await research_company(
            entity_name,
            CompetitorsData,
            category=self.category,
            goal="Identify the top direct competitors for a company.",
            field_hint=(
                "Who are the top 3-5 direct competitors of this company in their sector and size "
                "bracket? Industry directories, comparisons and market coverage are good sources."
            ),
        )

class JobsConnector(BaseConnector):
    category = "open_jobs"
    ttl_hours = 24  # 1 day
    response_model = JobsData
    source = "deep_research"

    async def _fetch_live(self, entity_name: str) -> JobsData:
        return await research_company(
            entity_name,
            JobsData,
            category=self.category,
            goal="Find a few currently open job roles for a company.",
            field_hint=(
                "Find currently open tech roles: check the company careers page first, then job "
                "boards and LinkedIn. Include title, location and URL where available."
            ),
        )

class DSAQuestionsConnector(BaseConnector):
    category = "dsa"
    ttl_hours = 24 * 30  # 30 days
    response_model = CompanyDSAProfile
    source = "deep_research"

    async def _fetch_live(self, entity_name: str) -> CompanyDSAProfile:
        import re

        res = await research_company(
            entity_name,
            CompanyDSAProfile,
            category=self.category,
            goal=(
                "You are an expert at aggregating technical interview data. Extract only what real "
                "interview reports support; empty results are perfectly acceptable."
            ),
            field_hint=(
                "Find real interview experiences for software/tech roles (LeetCode Discuss, "
                "Glassdoor, AmbitionBox, GeeksforGeeks): the DSA topics tested most often, and any "
                "specific problem titles with their exact LeetCode URLs (https://leetcode.com/problems/...). "
                "Never reproduce problem statements and never guess URLs."
            ),
        )

        # Verification: only keep genuinely well-formed LeetCode links.
        verified_questions = []
        if res.reported_questions:
            url_pattern = re.compile(r"^https?://(www\.)?leetcode\.com/problems/[a-zA-Z0-9-]+/?$")
            for q in res.reported_questions:
                if q.leetcode_url and url_pattern.match(q.leetcode_url):
                    verified_questions.append(q)

        res.reported_questions = verified_questions

        if len(res.reported_questions) > 0:
            res.confidence = "verified_links"
        elif res.topics_frequency and len(res.topics_frequency) > 0:
            res.confidence = "topic_only"
        else:
            res.confidence = "unavailable"

        return res

class ExtendedLinksConnector(BaseConnector):
    category = "extended_links"
    ttl_hours = 24 * 90  # 90 days
    response_model = ExtendedLinksData
    source = "google_search_llm"

    async def _fetch_live(self, entity_name: str) -> ExtendedLinksData:
        system_msg = "Find the official website, Twitter, Instagram, Crunchbase, and AmbitionBox URLs for a company."
        prompt = f"Find the official URLs for '{entity_name}' for their Website, Twitter, Instagram, Crunchbase, and AmbitionBox. Do not provide stats or ratings. Return ONLY a JSON object."
        res = await llm_service.generate_structured_with_search(system_msg, prompt, self.response_model)
        
        # Verification helper
        def verify_link(entry, name, domain):
            if not entry:
                return None
            url = entry.url or ""
            clean_name = name.lower().replace(" ", "").replace("-", "")
            if url.startswith("http") and domain in url and any(part in url.lower() for part in [clean_name, clean_name[:4]]):
                entry.link_confidence = "verified"
            elif url:
                entry.url = f"https://www.google.com/search?q={name}+{domain}"
                entry.link_confidence = "unverified_fallback"
            entry.source_type = "link_only"
            entry.note = "Please visit the URL for more details."
            return entry
        
        if res.website:
            # Websites might not contain the exact name but should be valid URLs
            res.website.link_confidence = "verified" if res.website.url else "unverified_fallback"
            res.website.source_type = "link_only"

        res.twitter = verify_link(res.twitter, entity_name, "twitter.com") or verify_link(res.twitter, entity_name, "x.com")
        res.instagram = verify_link(res.instagram, entity_name, "instagram.com")
        res.crunchbase = verify_link(res.crunchbase, entity_name, "crunchbase.com")
        res.ambitionbox = verify_link(res.ambitionbox, entity_name, "ambitionbox.com")

        return res

class OrgInfoConnector(BaseConnector):
    category = "org_info"
    ttl_hours = 24 * 30
    response_model = OrgInfoData
    source = "deep_research"

    async def _fetch_live(self, entity_name: str) -> OrgInfoData:
        res = await research_company(
            entity_name,
            OrgInfoData,
            category=self.category,
            goal="Find high-level organizational facts for a company. Do not guess; if unknown, leave null.",
            field_hint=(
                "Find founding year, estimated headcount range, HQ, major office locations and "
                "industry tags. The company's own site (about/contact pages), LinkedIn public page, "
                "directories and news are the best sources."
            ),
        )
        res.source = "Public Search"
        res.confidence = "high" if res.founded_year and res.hq_location else "medium"
        return res

class InterviewProcessConnector(BaseConnector):
    category = "interview_process"
    ttl_hours = 24 * 30
    response_model = InterviewProcessData
    source = "deep_research"

    async def _fetch_live(self, entity_name: str) -> InterviewProcessData:
        res = await research_company(
            entity_name,
            InterviewProcessData,
            category=self.category,
            goal="Find the typical number of interview rounds and the official careers page URL for a company.",
            field_hint=(
                "Find how many interview rounds candidates report and what they contain (DSA, system "
                "design, HR), plus the official careers page URL. Interview-experience sites and "
                "review platforms are the best sources."
            ),
        )
        res.source = "Public Interview Experiences"
        res.confidence = "high" if res.typical_rounds_summary and res.careers_page_url else "not reliably available"
        return res

CONNECTOR_REGISTRY = {
    "funding": FundingConnector,
    "linkedin": LinkedInConnector,
    "glassdoor": GlassdoorConnector,
    "extended_links": ExtendedLinksConnector,
    "org_info": OrgInfoConnector,
    "interview_process": InterviewProcessConnector,
    "compensation": CompensationConnector,
    "benefits": BenefitsConnector,
    "competitors": CompetitorsConnector,
    "jobs": JobsConnector,
    "dsa": DSAQuestionsConnector,
}


async def _fetch_one(category: str, connector_cls, entity: str) -> tuple[str, object | None]:
    """Never raises — one bad connector can't take the whole lookup down.
    Returns (category, data) where data is None on failure OR genuinely
    no result, so downstream code can tell 'empty' apart from 'still loading'."""
    try:
        data = await connector_cls().fetch(entity)
        return category, data
    except Exception:
        logger.exception(f"Connector '{category}' failed for entity '{entity}'")
        return category, None


async def fetch_company_profile_node(state: dict) -> dict:
    """
    Single node, fetches ALL categories concurrently via asyncio.gather,
    returns ONE atomic state update.
    """
    entities = state.get("detected_entities", [])
    if not entities:
        return {}
    entity = entities[0]

    tasks = [_fetch_one(cat, cls, entity) for cat, cls in CONNECTOR_REGISTRY.items()]
    results = await asyncio.gather(*tasks)

    company_data: dict = {}
    found_summary: dict[str, bool] = {}
    for category, data in results:
        company_data[category] = data          # None is an explicit "no data", not "missing"
        found_summary[category] = data is not None

    return {
        "company_data": company_data,
        "company_data_found_summary": found_summary,
        "response_type": "company_profile",
    }
