"""Deep-research engine behind the company-profile connectors.

The original connectors made exactly one search-grounded LLM call per
category. That works for famous companies whose facts sit in the top search
results, and returns a profile full of `Unknown` for everyone else (50-person
consultancies, startups, regional employers).

This module replaces that single call with a small, budgeted loop:

    plan targeted queries  ->  search them (Gemini grounding)  ->  fetch the
    most promising pages  ->  synthesize the schema with per-field citations
    ->  if coverage is still low, run one more round for the MISSING fields
    only.

Budget: at most ``max_rounds`` rounds (default 2), ``queries_per_round``
searches per round (default 3) and ``max_pages`` page fetches per round
(default 6). If anything blows up, callers fall back to the original single
grounded call so a research failure never costs more than today's behavior.
"""
import asyncio
import json
import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel, Field

from backend.services import research_activity as activity
from backend.services.llm import llm_service
from backend.services.web_extract import PageNote, fetch_page_text, is_fetchable

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Fields that describe HOW we know something rather than WHAT we know. They
# never count toward coverage and are never reported as "missing".
META_FIELDS = frozenset(
    {
        "evidence",
        "coverage",
        "research_rounds",
        "confidence",
        "source",
        "note",
        "source_type",
        "link_confidence",
    }
)

# Stop researching once this share of the schema's content fields is filled.
COVERAGE_TARGET = 0.65
DEFAULT_MAX_ROUNDS = 2
DEFAULT_QUERIES_PER_ROUND = 3
DEFAULT_MAX_PAGES = 6
PAGE_CHAR_BUDGET = 4000
CONTEXT_CHAR_BUDGET = 24000


class QueryPlan(BaseModel):
    """Cheap (non-search) planner output: which queries to run."""

    queries: list[str] = Field(default_factory=list)


class SearchBrief(BaseModel):
    """What one grounded search found for one query."""

    summary: str = ""
    facts: list[str] = Field(default_factory=list)
    source_urls: list[str] = Field(default_factory=list)


@dataclass
class SearchResult:
    query: str
    brief: SearchBrief
    urls: list[str]  # grounding URLs + URLs the model declared it used


# ---------------------------------------------------------------------------
# Pure helpers (unit-tested without any network/LLM)
# ---------------------------------------------------------------------------

def content_fields(response_model: type[BaseModel]) -> list[str]:
    """Schema fields that carry actual research payload (not bookkeeping)."""
    return [name for name in response_model.model_fields if name not in META_FIELDS]


def _is_filled(value) -> bool:
    if value is None:
        return False
    if isinstance(value, (str, list, dict, tuple, set)):
        return len(value) > 0
    return True


def coverage_of(data: BaseModel) -> float:
    """Fraction of content fields that hold a non-empty value."""
    fields = content_fields(type(data))
    if not fields:
        return 1.0
    filled = sum(1 for name in fields if _is_filled(getattr(data, name, None)))
    return round(filled / len(fields), 3)


def missing_fields(data: BaseModel) -> list[str]:
    """Content fields still empty — the targets for the next research round."""
    return [name for name in content_fields(type(data)) if not _is_filled(getattr(data, name, None))]


def _urls_match(candidate: str, known: str) -> bool:
    cand = candidate.rstrip("/")
    ref = known.rstrip("/")
    if not cand or not ref:
        return False
    return cand == ref or cand.startswith(ref + "/") or ref.startswith(cand + "/")


def filter_evidence(data: T, known_urls: Iterable[str]) -> T:
    """Drop citations that don't point at a source we actually retrieved.

    This is the anti-hallucination guard for evidence: the model may only cite
    URLs that came from grounding metadata or a successful page fetch.
    """
    if "evidence" not in type(data).model_fields:
        return data
    known = [u for u in known_urls if u]
    kept = []
    seen = set()
    for entry in getattr(data, "evidence", None) or []:
        url = getattr(entry, "url", "") or ""
        normalized = url.rstrip("/")
        if any(_urls_match(url, k) for k in known) and normalized not in seen:
            seen.add(normalized)
            kept.append(entry)
    dropped = len(getattr(data, "evidence", None) or []) - len(kept)
    if dropped:
        logger.info("Dropped %d citation(s) not backed by retrieved sources", dropped)
    return data.model_copy(update={"evidence": kept})


def finalize(data: T, known_urls: Iterable[str], rounds: int, coverage: float | None = None) -> T:
    """Filter citations and stamp coverage/rounds onto a researched schema."""
    data = filter_evidence(data, known_urls)
    updates = {}
    if "coverage" in type(data).model_fields:
        updates["coverage"] = coverage if coverage is not None else coverage_of(data)
    if "research_rounds" in type(data).model_fields:
        updates["research_rounds"] = rounds
    return data.model_copy(update=updates) if updates else data


def build_research_context(
    search_results: Sequence[SearchResult],
    pages: Sequence[PageNote],
    prior: BaseModel | None = None,
    target_fields: Sequence[str] = (),
) -> str:
    """Assemble the evidence dossier handed to the synthesis call."""
    sections: list[str] = []

    if prior is not None:
        prior_dump = {k: v for k, v in prior.model_dump().items() if k not in META_FIELDS}
        sections.append(
            "PREVIOUS ROUND RESULT (still-valid fields; the listed fields need better data):\n"
            f"{json.dumps(prior_dump, ensure_ascii=False, default=str)}\n"
            f"Fields still needing data: {', '.join(target_fields) or 'none'}"
        )

    if search_results:
        sections.append("SEARCH FINDINGS (Gemini Google Search; URLs are the pages behind them):")
        for result in search_results:
            block = [f"\n### Query: {result.query}"]
            if result.brief.summary:
                block.append(result.brief.summary)
            for fact in result.brief.facts[:8]:
                block.append(f"- {fact}")
            if result.urls:
                block.append("URLs: " + ", ".join(result.urls[:8]))
            sections.append("\n".join(block))

    for i, page in enumerate(pages, 1):
        sections.append(f"\n[P{i}] {page.title or 'Untitled'} — {page.url}\n{page.text[:PAGE_CHAR_BUDGET]}")

    context = "\n".join(sections).strip()
    if not context:
        return ""
    if len(context) > CONTEXT_CHAR_BUDGET:
        context = context[:CONTEXT_CHAR_BUDGET] + "\n[context truncated]"
    return context


# ---------------------------------------------------------------------------
# Research steps (each independently mockable in tests)
# ---------------------------------------------------------------------------

async def plan_queries(
    entity_name: str,
    response_model: type[BaseModel],
    target_fields: Sequence[str],
    field_hint: str,
    limit: int,
) -> list[str]:
    """Turn 'fields we still need' into a small set of source-diverse queries."""
    system_msg = (
        "You plan web searches for deep company research. Return ONLY JSON matching the schema. "
        "Queries must be short, specific, and source-diverse: for at least some of them prefer the "
        "company's own website/careers pages, review or salary sites (Glassdoor, AmbitionBox, GoodFirms), "
        "job boards, news/press coverage, funding databases, and niche industry directories — "
        "not five variations of the same generic query."
    )
    field_docs = {
        name: (response_model.model_fields[name].description or "")
        for name in target_fields
        if name in response_model.model_fields
    }
    prompt = (
        f"Company: {entity_name}\n"
        f"Research goal: {field_hint}\n"
        f"Schema fields needing data: {json.dumps(field_docs, ensure_ascii=False)}\n"
        f"Return at most {limit} web search queries that would surface verifiable facts for these fields."
    )
    plan = await llm_service.generate_structured(system_msg, prompt, QueryPlan)
    queries: list[str] = []
    seen: set[str] = set()
    for query in plan.queries:
        cleaned = (query or "").strip()
        if cleaned and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            queries.append(cleaned)
    return queries[:limit]


async def run_searches(entity_name: str, queries: Sequence[str], category: str = "") -> list[SearchResult]:
    """Run every query as its own grounded search; failures are dropped."""
    if not queries:
        return []
    results = await asyncio.gather(
        *(_search_one(entity_name, q, category) for q in queries), return_exceptions=True
    )
    out: list[SearchResult] = []
    for query, result in zip(queries, results):
        if isinstance(result, BaseException):
            logger.warning("Search failed for %r: %s", query, result)
            continue
        out.append(result)
    return out


async def _search_one(entity_name: str, query: str, category: str = "") -> SearchResult:
    activity.emit("search", entity=entity_name, category=category, detail=query)
    system_msg = (
        "You are a meticulous research assistant using Google Search. "
        "Search for the query, prefer primary and authoritative pages, and summarize ONLY what you "
        "actually found in the results — never what you already know. "
        "Return ONLY JSON: a short summary, a list of concrete factual bullet strings, and source_urls "
        "(the URLs you actually used). If nothing relevant about this company exists, return empty "
        "facts and source_urls instead of guessing."
    )
    prompt = f"Company: {entity_name}\nSearch query: {query}"
    try:
        brief, sources = await llm_service.generate_structured_with_search_and_sources(
            system_msg, prompt, SearchBrief
        )
    except Exception:
        activity.emit("search_error", entity=entity_name, category=category, detail=query)
        raise
    urls: list[str] = []
    seen: set[str] = set()
    for url in [*brief.source_urls, *(s.url for s in sources)]:
        url = (url or "").strip()
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
    activity.emit(
        "search_done", entity=entity_name, category=category,
        detail=f"{len(urls)} source URL(s)", query=query,
    )
    return SearchResult(query=query, brief=brief, urls=urls)


async def collect_pages(
    urls: Sequence[str], max_pages: int, entity_name: str = "", category: str = ""
) -> tuple[list[PageNote], list[str]]:
    """Fetch the most promising URLs in parallel.

    Returns (pages, requested_urls) — the requested URLs are kept even when the
    fetch failed, because grounding snippets from them are still citable.
    """
    candidates: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if is_fetchable(url) and url not in seen:
            seen.add(url)
            candidates.append(url)
    candidates = candidates[:max_pages]
    if not candidates:
        return [], []

    activity.emit(
        "fetch_start", entity=entity_name, category=category,
        detail=f"{len(candidates)} candidate page(s)",
    )

    async def _fetch_one(url: str) -> PageNote | None:
        note = await fetch_page_text(url)
        activity.emit(
            "page" if note else "page_skip", entity=entity_name, category=category, detail=url,
        )
        return note

    pages = await asyncio.gather(*(_fetch_one(url) for url in candidates))
    kept = [p for p in pages if p is not None]
    chars = sum(len(p.text) for p in kept)
    activity.emit(
        "fetch_done", entity=entity_name, category=category,
        detail=f"{len(kept)}/{len(candidates)} pages · {chars // 1000}k chars",
    )
    return kept, list(candidates)


async def synthesize(entity_name: str, response_model: type[T], context: str) -> T:
    """Fill the schema from the evidence dossier — the only call that sees data."""
    system_msg = (
        "You are a meticulous company researcher filling a structured profile from a gathered "
        "evidence dossier.\n"
        "Rules:\n"
        "1. Use ONLY evidence present in the dossier. Never fill a field from your own knowledge; "
        "if the dossier does not support a value, use null (or an empty list/dict).\n"
        "2. For every non-empty field, add an entry to `evidence` with the field name, a short value, "
        "a URL copied verbatim from the dossier, and a short supporting quote from the dossier.\n"
        "3. Cite only URLs that literally appear in the dossier.\n"
        "4. A required list field must be an empty list rather than invented items.\n"
        "5. Facts only — no marketing language, no filler."
    )
    prompt = (
        f"Company: {entity_name}\n\n"
        f"Evidence dossier:\n{context}\n\n"
        "Fill the schema from this evidence."
    )
    return await llm_service.generate_structured(system_msg, prompt, response_model)


# ---------------------------------------------------------------------------
# The loop
# ---------------------------------------------------------------------------

async def _research_loop(
    entity_name: str,
    response_model: type[T],
    field_hint: str,
    max_rounds: int,
    queries_per_round: int,
    max_pages: int,
    category: str = "",
) -> T:
    all_fields = content_fields(response_model)
    known_urls: set[str] = set()
    prior: T | None = None

    for round_no in range(1, max_rounds + 1):
        target = missing_fields(prior) if prior is not None else all_fields
        if prior is not None and not target:
            logger.info("Research for %s complete after %d round(s) — schema fully covered", entity_name, round_no - 1)
            break

        activity.emit(
            "plan", entity=entity_name, category=category, round=round_no,
            detail=f"round {round_no} · need: {', '.join(target[:6]) or 'nothing'}",
        )
        try:
            queries = await plan_queries(
                entity_name, response_model, target, field_hint, queries_per_round
            )
        except Exception as e:
            logger.warning("Query planning failed for %s: %s — using fallback query", entity_name, e)
            queries = []
        if not queries:
            queries = [f'"{entity_name}" {" ".join(target[:2]).replace("_", " ")}'][:1]
        activity.emit(
            "plan_ready", entity=entity_name, category=category, round=round_no,
            detail=" | ".join(queries),
        )

        search_results = await run_searches(entity_name, queries, category=category)
        urls: list[str] = []
        seen: set[str] = set()
        for result in search_results:
            for url in result.urls:
                if url not in seen:
                    seen.add(url)
                    urls.append(url)

        pages, requested_urls = await collect_pages(urls, max_pages, entity_name=entity_name, category=category)
        known_urls.update(urls)
        known_urls.update(requested_urls)
        known_urls.update(p.url for p in pages)

        context = build_research_context(search_results, pages, prior, target)
        if not context:
            logger.warning(
                "Research for %s [%s] gathered no evidence in round %d — stopping",
                entity_name, response_model.__name__, round_no,
            )
            activity.emit(
                "stopped", entity=entity_name, category=category,
                detail="no evidence gathered — retrying later",
            )
            break

        activity.emit(
            "synthesize", entity=entity_name, category=category, round=round_no,
            detail=f"dossier: {len(search_results)} search(es), {len(pages)} page(s)",
        )
        data = await synthesize(entity_name, response_model, context)
        prior = finalize(data, known_urls, rounds=round_no)
        round_coverage = getattr(prior, "coverage", None)
        logger.info(
            "Research round %d for %s: coverage=%s (%d search(es), %d page(s))",
            round_no, entity_name, round_coverage, len(search_results), len(pages),
        )
        activity.emit(
            "round_done", entity=entity_name, category=category, round=round_no,
            coverage=round_coverage,
            detail=f"coverage {round_coverage if round_coverage is not None else '?'}",
        )
        if round_coverage is not None and round_coverage >= COVERAGE_TARGET:
            break

    if prior is None:
        raise RuntimeError(f"Research produced no result for {entity_name}")
    return prior


async def research_company(
    entity_name: str,
    response_model: type[T],
    *,
    goal: str,
    field_hint: str,
    category: str,
    max_rounds: int = DEFAULT_MAX_ROUNDS,
    queries_per_round: int = DEFAULT_QUERIES_PER_ROUND,
    max_pages: int = DEFAULT_MAX_PAGES,
) -> T:
    """Research one company category and return a schema instance with
    ``evidence`` / ``coverage`` / ``research_rounds`` attached.

    Falls back to the original single search-grounded call on any failure, so
    this is strictly an upgrade over the previous behavior — never a new way
    to break a connector.
    """
    try:
        result = await _research_loop(
            entity_name, response_model, field_hint, max_rounds, queries_per_round, max_pages,
            category=category,
        )
        activity.emit(
            "done", entity=entity_name, category=category,
            coverage=getattr(result, "coverage", None),
            rounds=getattr(result, "research_rounds", None),
            evidence=len(getattr(result, "evidence", None) or []),
            detail=(
                f"coverage {getattr(result, 'coverage', None)} · "
                f"{getattr(result, 'research_rounds', None)} round(s) · "
                f"{len(getattr(result, 'evidence', None) or [])} citation(s)"
            ),
        )
        return result
    except Exception:
        logger.exception(
            "Deep research failed for %s [%s]; falling back to single grounded call",
            entity_name, category,
        )
        activity.emit(
            "fallback", entity=entity_name, category=category,
            detail="research loop failed — using single grounded call",
        )
        data = await llm_service.generate_structured_with_search(goal, field_hint, response_model)
        return finalize(data, known_urls=[], rounds=0)
