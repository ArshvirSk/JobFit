"""Fetching and text-extraction helpers for the company deep-research loop.

The research engine uses Gemini's Google Search to *discover* facts and URLs,
then reads the most promising pages itself so the synthesis step works from
actual page text instead of search snippets.
"""
import logging
import re

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Sites that block automated clients outright (403/bot-challenge) or where
# fetching would be a Terms-of-Service problem. We cite/link to these instead.
BLOCKED_DOMAINS = (
    "linkedin.com",
    "glassdoor.",
    "crunchbase.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com/",
    "youtube.com",
    "naukri.com",
    "indeed.",
    "tracxn.com",
    "pitchbook.com",
)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

DEFAULT_TIMEOUT = 10.0
DEFAULT_MAX_CHARS = 4000
# Below this much extracted text a page is boilerplate (cookie banners, JS
# shells, login walls) and not worth a slot in the synthesis context.
MIN_TEXT_CHARS = 200


class PageNote(BaseModel):
    """Extracted, LLM-ready text from one fetched page."""

    url: str
    title: str = ""
    text: str = ""


def is_fetchable(url: str) -> bool:
    """True if we should attempt to download this URL at all."""
    if not url or not url.startswith(("http://", "https://")):
        return False
    lowered = url.lower()
    return not any(domain in lowered for domain in BLOCKED_DOMAINS)


def html_to_text(html: str, max_chars: int = DEFAULT_MAX_CHARS) -> tuple[str, str]:
    """Strip a document down to (title, visible text).

    Navigation/footer/script noise is dropped so the LLM spends its context
    budget on content, not chrome.
    """
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "svg", "canvas", "nav", "footer", "header", "form", "iframe"]):
        tag.decompose()

    title = soup.title.get_text(strip=True) if soup.title else ""
    text = soup.get_text(separator=" ")
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0] + " …"
    return title, text


async def fetch_page_text(
    url: str,
    max_chars: int = DEFAULT_MAX_CHARS,
    client: httpx.AsyncClient | None = None,
) -> PageNote | None:
    """Download one page and return extracted text, or None on any failure.

    Never raises — a dead/blocked page is simply skipped by the caller.
    """
    if not is_fetchable(url):
        return None

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(
            follow_redirects=True,
            timeout=DEFAULT_TIMEOUT,
            headers=DEFAULT_HEADERS,
        )
    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            logger.debug("fetch_page_text %s -> HTTP %s", url, resp.status_code)
            return None
        content_type = resp.headers.get("content-type", "").lower()
        if "html" not in content_type and "text" not in content_type:
            return None
        title, text = html_to_text(resp.text, max_chars=max_chars)
        if len(text) < MIN_TEXT_CHARS:
            logger.debug("fetch_page_text %s -> too little text (%d chars)", url, len(text))
            return None
        return PageNote(url=url, title=title, text=text)
    except Exception as e:  # network/parse errors are expected and non-fatal
        logger.debug("fetch_page_text %s failed: %s", url, e)
        return None
    finally:
        if owns_client:
            await client.aclose()
