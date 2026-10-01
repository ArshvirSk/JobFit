"""Offline tests for the deep-research engine (no network, no live LLM)."""
from __future__ import annotations

import pytest

from backend.chat.connectors.base import BaseConnector
from backend.chat.connectors.schemas import Evidence, FundingData, OrgInfoData
from backend.services import research
from backend.services.research import (
    SearchBrief,
    SearchResult,
    content_fields,
    coverage_of,
    missing_fields,
)
from backend.services.web_extract import PageNote, html_to_text, is_fetchable

# ---------------------------------------------------------------------------
# Coverage / missing-field math
# ---------------------------------------------------------------------------

def test_coverage_ignores_meta_fields():
    # Meta fields are set but every content field is empty -> 0.0
    sparse = FundingData(coverage=0.9, research_rounds=1, evidence=[])
    assert coverage_of(sparse) == 0.0

    full = FundingData(
        last_round_stage="Seed",
        last_round_amount="$1M",
        total_raised="$3M",
        valuation="$10M",
        key_investors=["Angel Fund"],
    )
    assert coverage_of(full) == 1.0


def test_coverage_partial_counts_empty_containers_as_unfilled():
    partial = FundingData(last_round_stage="Seed", total_raised="$3M")
    # 2 of 5 content fields filled
    assert coverage_of(partial) == pytest.approx(0.4)
    assert missing_fields(partial) == ["last_round_amount", "valuation", "key_investors"]


def test_missing_fields_excludes_meta_even_when_unset():
    assert missing_fields(OrgInfoData(confidence="low", source="?")) == [
        "founded_year",
        "headcount_range",
        "hq_location",
        "office_locations",
        "industry_tags",
    ]


def test_content_fields_of_schema():
    assert "coverage" not in content_fields(FundingData)
    assert "evidence" not in content_fields(FundingData)
    assert "founded_year" in content_fields(OrgInfoData)


# ---------------------------------------------------------------------------
# Evidence filtering (anti-hallucination guard)
# ---------------------------------------------------------------------------

def test_filter_evidence_keeps_only_retrieved_urls():
    data = FundingData(
        total_raised="$3M",
        evidence=[
            Evidence(field="total_raised", value="$3M", url="https://source.com/funding"),
            Evidence(field="valuation", value="$10M", url="https://fabricated.example/never-fetched"),
        ],
    )
    out = research.filter_evidence(data, ["https://source.com/funding"])
    assert [e.url for e in out.evidence] == ["https://source.com/funding"]


def test_filter_evidence_normalizes_trailing_slash_and_dedupes():
    data = FundingData(
        total_raised="$3M",
        evidence=[
            Evidence(field="total_raised", value="$3M", url="https://source.com/funding/"),
            Evidence(field="total_raised", value="$3M", url="https://source.com/funding"),
        ],
    )
    out = research.filter_evidence(data, ["https://source.com/funding"])
    assert len(out.evidence) == 1


def test_finalize_stamps_coverage_and_rounds():
    data = FundingData(last_round_stage="Seed")
    out = research.finalize(data, known_urls=[], rounds=2)
    assert out.research_rounds == 2
    assert out.coverage == pytest.approx(coverage_of(data))


# ---------------------------------------------------------------------------
# Research context assembly
# ---------------------------------------------------------------------------

def test_build_research_context_includes_findings_pages_and_prior():
    prior = FundingData(last_round_stage="Seed")
    results = [
        SearchResult(
            query="acme funding",
            brief=SearchBrief(summary="No funding found", facts=["Bootstrapped"], source_urls=["https://a.com"]),
            urls=["https://a.com"],
        )
    ]
    pages = [PageNote(url="https://a.com/about", title="About", text="Acme is a private company.")]
    context = research.build_research_context(results, pages, prior, ["valuation"])

    assert "PREVIOUS ROUND RESULT" in context
    assert "valuation" in context
    assert "acme funding" in context
    assert "Bootstrapped" in context
    assert "[P1] About — https://a.com/about" in context


# ---------------------------------------------------------------------------
# The loop itself (all LLM/network steps mocked)
# ---------------------------------------------------------------------------

def _result_with_urls(urls: list[str]) -> list[SearchResult]:
    return [
        SearchResult(
            query=f"q-{i}",
            brief=SearchBrief(summary="summary", facts=["fact"], source_urls=list(urls)),
            urls=list(urls),
        )
        for i, urls in enumerate([urls])
    ]


async def test_loop_targets_only_missing_fields_in_second_round(monkeypatch):
    round_results = iter(
        [
            # 3/5 filled = 0.6 < 0.65 target -> one more round
            FundingData(last_round_stage="Seed", total_raised="$3M", key_investors=["Angel"]),
            # fully filled -> stop even though max_rounds=4
            FundingData(
                last_round_stage="Seed",
                last_round_amount="$1M",
                total_raised="$3M",
                valuation="$10M",
                key_investors=["Angel"],
                evidence=[
                    Evidence(field="total_raised", value="$3M", url="https://src.com/a"),
                    Evidence(field="valuation", value="$10M", url="https://not-retrieved.example/x"),
                ],
            ),
        ]
    )
    planned_targets: list[list[str]] = []

    async def fake_plan(entity, model, target, hint, limit):
        planned_targets.append(list(target))
        return [f"query-{len(planned_targets)}"]

    async def fake_searches(entity, queries, **kwargs):
        return _result_with_urls(["https://src.com/a"])

    async def fake_pages(urls, max_pages, **kwargs):
        return [PageNote(url="https://src.com/a", title="T", text="x" * 300)], list(urls)

    async def fake_synth(entity, model, context):
        return next(round_results)

    monkeypatch.setattr(research, "plan_queries", fake_plan)
    monkeypatch.setattr(research, "run_searches", fake_searches)
    monkeypatch.setattr(research, "collect_pages", fake_pages)
    monkeypatch.setattr(research, "synthesize", fake_synth)

    out = await research._research_loop("Acme", FundingData, "find funding", 4, 3, 6)

    # First round plans over everything, second round only over the gaps.
    assert planned_targets[0] == content_fields(FundingData)
    assert set(planned_targets[1]) == {"last_round_amount", "valuation"}
    assert len(planned_targets) == 2  # stopped on coverage, not on round budget
    assert out.research_rounds == 2
    assert out.coverage == 1.0
    # Citation not backed by a retrieved URL was stripped.
    assert [e.url for e in out.evidence] == ["https://src.com/a"]


async def test_loop_stops_after_one_round_when_coverage_is_high(monkeypatch):
    async def fake_plan(entity, model, target, hint, limit):
        return ["query-1"]

    async def fake_searches(entity, queries, **kwargs):
        return _result_with_urls(["https://src.com/a"])

    async def fake_pages(urls, max_pages, **kwargs):
        return [PageNote(url="https://src.com/a", title="T", text="y" * 300)], list(urls)

    async def fake_synth(entity, model, context):
        return OrgInfoData(
            founded_year="2016",
            headcount_range="50-100",
            hq_location="Mumbai, India",
            office_locations=["Mumbai"],
            industry_tags=["IT Consulting"],
            confidence="high",
            source="Public Search",
        )

    monkeypatch.setattr(research, "plan_queries", fake_plan)
    monkeypatch.setattr(research, "run_searches", fake_searches)
    monkeypatch.setattr(research, "collect_pages", fake_pages)
    monkeypatch.setattr(research, "synthesize", fake_synth)

    out = await research._research_loop("Acme", OrgInfoData, "find org info", 3, 3, 6)
    assert out.research_rounds == 1
    assert out.coverage == 1.0


async def test_planner_failure_uses_fallback_query_then_legacy_call(monkeypatch):
    """Planner down -> sensible fallback query; zero evidence -> the original
    single grounded call keeps the connector working exactly as before."""
    seen_queries: list[list[str]] = []

    async def broken_plan(*args, **kwargs):
        raise RuntimeError("planner down")

    async def fake_searches(entity, queries, **kwargs):
        seen_queries.append(list(queries))
        return []

    async def fake_pages(urls, max_pages, **kwargs):
        return [], []

    async def fake_legacy(system_msg, prompt, response_model):
        return response_model(last_round_stage="Seed")

    monkeypatch.setattr(research, "plan_queries", broken_plan)
    monkeypatch.setattr(research, "run_searches", fake_searches)
    monkeypatch.setattr(research, "collect_pages", fake_pages)
    monkeypatch.setattr(research.llm_service, "generate_structured_with_search", fake_legacy)

    out = await research.research_company(
        "Acme", FundingData, goal="goal", field_hint="hint", category="funding"
    )
    assert seen_queries and "Acme" in seen_queries[0][0]
    assert out.last_round_stage == "Seed"
    assert out.research_rounds == 0


async def test_research_company_falls_back_to_legacy_single_call(monkeypatch):
    async def broken_loop(*args, **kwargs):
        raise RuntimeError("everything failed")

    async def fake_legacy(system_msg, prompt, response_model):
        return response_model(last_round_stage="Seed")

    monkeypatch.setattr(research, "_research_loop", broken_loop)
    monkeypatch.setattr(research.llm_service, "generate_structured_with_search", fake_legacy)

    out = await research.research_company(
        "Acme",
        FundingData,
        goal="goal",
        field_hint="hint",
        category="funding",
    )
    assert out.last_round_stage == "Seed"
    assert out.research_rounds == 0  # legacy path, no research rounds used
    assert out.coverage == pytest.approx(coverage_of(out))


# ---------------------------------------------------------------------------
# Page collection
# ---------------------------------------------------------------------------

async def test_collect_pages_skips_blocked_and_dedupes(monkeypatch):
    fetched: list[str] = []

    async def fake_fetch(url, **kwargs):
        fetched.append(url)
        return PageNote(url=url, title="T", text="z" * 300)

    monkeypatch.setattr(research, "fetch_page_text", fake_fetch)
    urls = [
        "https://ok.com/page",
        "https://www.linkedin.com/company/acme",  # blocked
        "https://ok.com/page",  # duplicate
        "ftp://not-a-web-url",  # not fetchable
    ]
    pages, requested = await research.collect_pages(urls, max_pages=6)

    assert fetched == ["https://ok.com/page"]
    assert requested == ["https://ok.com/page"]
    assert [p.url for p in pages] == ["https://ok.com/page"]


# ---------------------------------------------------------------------------
# Sparse-result cache TTL (BaseConnector)
# ---------------------------------------------------------------------------

class _DummyConnector(BaseConnector):
    category = "dummy"
    ttl_hours = 168
    response_model = FundingData


def test_ttl_depends_on_coverage():
    connector = _DummyConnector()
    assert connector._effective_ttl_hours({"coverage": 0}) == 3       # empty -> retry soon
    assert connector._effective_ttl_hours({"coverage": 0.3}) == 12    # partial -> sooner than TTL
    assert connector._effective_ttl_hours({"coverage": 0.9}) == 168   # good data -> full TTL
    assert connector._effective_ttl_hours({"founded_year": "2016"}) == 168  # no metadata -> full TTL


def test_ttl_never_exceeds_category_ttl():
    class ShortTTL(_DummyConnector):
        ttl_hours = 2

    connector = ShortTTL()
    assert connector._effective_ttl_hours({"coverage": 0}) == 2


# ---------------------------------------------------------------------------
# HTML extraction / fetch policy
# ---------------------------------------------------------------------------

def test_html_to_text_strips_boilerplate_and_collapses_whitespace():
    html = """
    <html><head><title>Acme — About</title><script>var x=1;</script></head>
    <body>
      <nav>Home About Careers</nav>
      <h1>About us</h1>
      <p>Acme   builds   software.</p>
      <footer>Copyright</footer>
      <style>.x{color:red}</style>
    </body></html>
    """
    title, text = html_to_text(html)
    assert title == "Acme — About"
    assert "Acme builds software." in text
    assert "var x" not in text
    assert "color:red" not in text
    assert "Copyright" not in text
    assert "Home About Careers" not in text  # nav chrome dropped


def test_html_to_text_truncates_long_documents():
    html = "<p>" + ("word " * 2000) + "</p>"
    _, text = html_to_text(html, max_chars=500)
    assert len(text) <= 502
    assert text.endswith("…")


def test_is_fetchable_policy():
    assert is_fetchable("https://acme.com/careers")
    assert not is_fetchable("https://www.linkedin.com/company/acme")
    assert not is_fetchable("https://www.glassdoor.com/Overview/Working-at-acme")
    assert not is_fetchable("not-a-url")
    assert not is_fetchable("")
