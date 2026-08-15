import logging
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

async def fetch_html(url: str) -> str:
    """Fetch HTML content from a URL."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            response = await client.get(url, headers=headers, timeout=15.0)
            response.raise_for_status()
            return response.text
    except Exception as e:
        logger.error(f"Failed to fetch JD from URL {url}: {e}")
        raise ValueError(f"Failed to fetch job description: {e}")

def extract_text_from_html(html_content: str) -> str:
    """Extract clean text from HTML using BeautifulSoup."""
    soup = BeautifulSoup(html_content, "lxml") # or "html.parser"
    
    # Remove script and style elements
    for script in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        script.decompose()
        
    # Get text
    text = soup.get_text(separator="\n", strip=True)
    
    # Basic cleanup: remove excessive newlines
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text = "\n".join(chunk for chunk in chunks if chunk)
    
    return text

async def extract_text_from_url(url: str) -> str:
    """Fetch URL and extract clean text from it."""
    html_content = await fetch_html(url)
    return extract_text_from_html(html_content)
