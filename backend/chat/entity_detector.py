"""
Entity detection heuristic for chat messages (Phase 1).

Strategy:
  1. Check user message against a curated set of ~60 well-known company
     names and common aliases (case-insensitive).
  2. If no match from the curated list, look for capitalized multi-word
     phrases that aren't common English words — treat as a possible entity.

This is intentionally simple and swappable. Phase 2 will replace this with
a real NER model or an LLM classifier call. The function signature and
return type are the stable contract.

To swap in Phase 2:
  - Replace the body of `detect_entity()` with your NER/LLM call.
  - Keep the return type as `EntityDetectionResult`.
  - The routing logic in `graph.py` doesn't need to change.
"""

import logging
import re
from dataclasses import dataclass
from typing import Optional, List

logger = logging.getLogger(__name__)

# ── Curated company list ────────────────────────────────────────
# Lowercase keys → canonical display name.
# Add aliases as separate keys pointing to the same canonical name.
KNOWN_COMPANIES: dict[str, str] = {
    # Indian Tech
    "razorpay": "Razorpay",
    "zomato": "Zomato",
    "swiggy": "Swiggy",
    "flipkart": "Flipkart",
    "paytm": "Paytm",
    "phonepe": "PhonePe",
    "cred": "CRED",
    "meesho": "Meesho",
    "zerodha": "Zerodha",
    "groww": "Groww",
    "ola": "Ola",
    "rapido": "Rapido",
    "dunzo": "Dunzo",
    "nykaa": "Nykaa",
    "unacademy": "Unacademy",
    "byju": "BYJU'S",
    "byju's": "BYJU'S",
    "byjus": "BYJU'S",
    "urban company": "Urban Company",
    "urbancompany": "Urban Company",
    "dream11": "Dream11",
    "curefit": "Curefit",
    "cure.fit": "Curefit",
    "lenskart": "Lenskart",
    "sharechat": "ShareChat",
    "dailyhunt": "Dailyhunt",
    "freshworks": "Freshworks",
    "zoho": "Zoho",
    "infosys": "Infosys",
    "wipro": "Wipro",
    "tcs": "TCS",
    "hcl": "HCL",
    "reliance": "Reliance",
    "jio": "Jio",

    # Global Tech
    "google": "Google",
    "alphabet": "Google",
    "microsoft": "Microsoft",
    "apple": "Apple",
    "amazon": "Amazon",
    "aws": "Amazon",
    "meta": "Meta",
    "facebook": "Meta",
    "netflix": "Netflix",
    "tesla": "Tesla",
    "nvidia": "NVIDIA",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "stripe": "Stripe",
    "uber": "Uber",
    "airbnb": "Airbnb",
    "spotify": "Spotify",
    "salesforce": "Salesforce",
    "adobe": "Adobe",
    "twitter": "X (Twitter)",
    "x": "X (Twitter)",
    "linkedin": "LinkedIn",
    "slack": "Slack",
    "atlassian": "Atlassian",
    "github": "GitHub",
    "gitlab": "GitLab",
    "databricks": "Databricks",
    "snowflake": "Snowflake",
    "coinbase": "Coinbase",
    "shopify": "Shopify",
    "doordash": "DoorDash",
    "lyft": "Lyft",
    "instacart": "Instacart",
    "palantir": "Palantir",
}

# Words/phrases to ignore when doing the capitalized-phrase fallback
STOP_WORDS = {
    "i", "me", "my", "the", "a", "an", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "shall", "can", "about",
    "tell", "what", "how", "who", "where", "when", "why", "which",
    "please", "thanks", "thank", "hello", "hi", "hey", "good", "great",
    "yes", "no", "okay", "ok", "sure", "right", "well",
    "company", "startup", "firm", "corp", "corporation", "inc",
    "interview", "salary", "resume", "job", "role", "position",
    "engineer", "developer", "manager", "director", "vp",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
    "new", "york", "san", "francisco", "bangalore", "mumbai", "delhi",
}


@dataclass
class EntityDetectionResult:
    """Result of entity detection. `entities` is empty if no company was detected."""
    entities: List[str]
    method: str  # "curated_list" | "capitalized_phrase" | "none" | "mixed"


def detect_entity(message: str) -> EntityDetectionResult:
    """
    Detect whether a user message mentions company names.

    Returns an EntityDetectionResult with the canonical company names
    (if detected) and the method used for detection.
    """
    if not message or not message.strip():
        return EntityDetectionResult(entities=[], method="none")

    msg_lower = message.lower().strip()
    detected = set()
    methods = set()

    # Strategy 1: Check against curated company list
    # Try multi-word matches first (longer phrases), then single words
    for company_key in sorted(KNOWN_COMPANIES.keys(), key=len, reverse=True):
        # Use word boundary matching to avoid partial matches
        pattern = r'\b' + re.escape(company_key) + r'\b'
        if re.search(pattern, msg_lower):
            canonical = KNOWN_COMPANIES[company_key]
            detected.add(canonical)
            methods.add("curated_list")

    # Strategy 2: Capitalized phrase fallback
    # Look for capitalized words that aren't common English words
    # This catches company names not in our curated list
    capitalized_words = re.findall(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b', message)
    for phrase in capitalized_words:
        words_in_phrase = phrase.lower().split()
        if all(w not in STOP_WORDS and len(w) > 1 for w in words_in_phrase):
            # Only add if we didn't already detect something containing this phrase
            # to avoid duplicates like "Razorpay" (curated) and "Razorpay" (capitalized)
            is_duplicate = any(phrase.lower() in existing.lower() for existing in detected)
            if not is_duplicate:
                detected.add(phrase)
                methods.add("capitalized_phrase")

    entities = list(detected)
    if entities:
        method = "mixed" if len(methods) > 1 else list(methods)[0]
        logger.info(f"Entities detected ({method}): {entities} from message: '{message[:80]}...'")
        return EntityDetectionResult(entities=entities, method=method)

    logger.info(f"No entity detected in message: '{message[:80]}...'")
    return EntityDetectionResult(entities=[], method="none")
