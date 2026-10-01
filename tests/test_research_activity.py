"""Offline tests for the research activity bus (the live monitor's data source)."""
from backend.chat.connectors.schemas import FundingData, OrgInfoData
from backend.services import research
from backend.services import research_activity as activity


def test_emit_and_snapshot_filtering():
    activity.clear()
    activity.emit("plan", entity="Acme", category="funding", detail="need: valuation")
    activity.emit("done", entity="Acme", category="funding", coverage=1.0)

    events = activity.snapshot(0)
    assert [e["step"] for e in events] == ["plan", "done"]
    assert events[0]["entity"] == "Acme"
    assert events[1]["coverage"] == 1.0
    assert "id" in events[0] and "ts" in events[0]

    # Incremental reads only return newer events.
    assert [e["step"] for e in activity.snapshot(events[0]["id"])] == ["done"]
    assert activity.snapshot(events[-1]["id"]) == []


def test_buffer_is_bounded():
    activity.clear()
    for i in range(activity.MAX_EVENTS + 100):
        activity.emit("search", detail=str(i))
    events = activity.snapshot(0)
    assert len(events) <= activity.MAX_EVENTS
    assert events[-1]["detail"] == str(activity.MAX_EVENTS + 99)  # newest kept


def test_emit_never_raises():
    activity.clear()
    activity.emit("weird", entity=123, category=None, detail={"not": "a str"}, extra=None)
    assert activity.snapshot(0)  # event recorded despite odd payload


async def test_research_company_emits_full_activity_lifecycle(monkeypatch):
    activity.clear()

    async def fake_plan(entity, model, target, hint, limit):
        return ["acme funding crunchbase"]

    async def fake_searches(entity, queries, **kwargs):
        from backend.services.research import SearchBrief, SearchResult
        return [SearchResult(query=queries[0], brief=SearchBrief(summary="s"), urls=["https://src.com/a"])]

    async def fake_pages(urls, max_pages, **kwargs):
        from backend.services.web_extract import PageNote
        return [PageNote(url="https://src.com/a", title="T", text="x" * 300)], list(urls)

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

    async def no_network(*args, **kwargs):  # safety net: fallback must not hit the API here
        raise AssertionError("legacy fallback should not run in this test")

    monkeypatch.setattr(research, "plan_queries", fake_plan)
    monkeypatch.setattr(research, "run_searches", fake_searches)
    monkeypatch.setattr(research, "collect_pages", fake_pages)
    monkeypatch.setattr(research, "synthesize", fake_synth)
    monkeypatch.setattr(research.llm_service, "generate_structured_with_search", no_network)

    out = await research.research_company(
        "Acme",
        OrgInfoData,
        goal="goal",
        field_hint="hint",
        category="org_info",
    )
    assert out.coverage == 1.0

    steps = [e["step"] for e in activity.snapshot(0)]
    # Lifecycle: plan -> plan_ready -> synthesize -> round_done -> done
    assert steps.index("plan") < steps.index("plan_ready") < steps.index("synthesize")
    assert steps.index("round_done") < steps.index("done")

    done = next(e for e in activity.snapshot(0) if e["step"] == "done")
    assert done["category"] == "org_info"
    assert done["coverage"] == 1.0


async def test_connector_fetch_emits_cache_and_live_events(monkeypatch):
    from backend.chat.connectors.base import BaseConnector

    activity.clear()

    class Dummy(BaseConnector):
        category = "dummy_cat"
        response_model = FundingData

        def _check_cache(self, entity_name):
            return {"data": {"coverage": 0.9}}

        async def _fetch_live(self, entity_name):
            return FundingData()

    data = await Dummy().fetch("Acme")
    assert data is not None
    steps = [e["step"] for e in activity.snapshot(0)]
    assert steps == ["cache_hit"]
    assert activity.snapshot(0)[0]["category"] == "dummy_cat"
