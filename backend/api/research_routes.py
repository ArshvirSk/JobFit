"""Dev-only research activity monitor: SSE event stream + live run trigger.

Everything here is gated on APP_ENV=development — none of these routes exist
in a production deployment. The monitor page at GET /api/research/monitor
renders the stream so you can watch the deep-research loop think in real time.
"""
import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse

from backend.config import settings
from backend.services import research_activity as activity

research_router = APIRouter(prefix="/api/research", tags=["research"])

_MONITOR_PATH = Path(__file__).resolve().parent.parent / "static" / "research_monitor.html"


def _dev_only() -> None:
    if settings.app_env != "development":
        raise HTTPException(status_code=404)


@research_router.get("/activity")
def activity_snapshot(last_id: int = Query(0, ge=0)):
    """JSON snapshot of buffered activity (polling fallback for the SSE stream)."""
    _dev_only()
    events = activity.snapshot(last_id)
    return {"events": events, "last_id": events[-1]["id"] if events else last_id}


@research_router.get("/activity/stream")
async def activity_stream(last_id: int = Query(0, ge=0)):
    """Server-sent events: every research step as it happens."""
    _dev_only()

    async def _generate():
        cursor = last_id
        idle_ticks = 0
        yield "retry: 2000\n\n"
        while True:
            events = activity.snapshot(cursor)
            if events:
                for event in events:
                    yield f"data: {json.dumps(event, default=str)}\n\n"
                cursor = events[-1]["id"]
                idle_ticks = 0
            else:
                idle_ticks += 1
                if idle_ticks % 40 == 0:  # ~12s keep-alive
                    yield ": ping\n\n"
                await asyncio.sleep(0.3)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@research_router.post("/activity/clear")
def clear_activity():
    _dev_only()
    activity.clear()
    return {"ok": True}


@research_router.get("/monitor", response_class=HTMLResponse)
def monitor():
    """The live research-activity dashboard."""
    _dev_only()
    return HTMLResponse(_MONITOR_PATH.read_text(encoding="utf-8"))


@research_router.post("/run")
async def run_research(
    entity: str = Query(..., min_length=2, max_length=120),
    category: str = Query("org_info"),
    fresh: bool = Query(True),
):
    """Trigger one research run from the monitor page.

    ``fresh=true`` bypasses the cache so the full loop runs (and streams to
    the monitor) even for companies already looked up. No cache is written.
    """
    _dev_only()
    from backend.chat.connectors.nodes import CONNECTOR_REGISTRY

    connector_cls = CONNECTOR_REGISTRY.get(category)
    if connector_cls is None:
        raise HTTPException(status_code=400, detail=f"unknown category '{category}'")

    connector = connector_cls()
    try:
        data = await connector._fetch_live(entity) if fresh else await connector.fetch(entity)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"research failed: {e}") from e
    if data is None:
        raise HTTPException(status_code=502, detail="connector returned no data")

    return {
        "entity": entity,
        "category": category,
        "coverage": getattr(data, "coverage", None),
        "research_rounds": getattr(data, "research_rounds", None),
        "evidence_count": len(getattr(data, "evidence", None) or []),
        "data": data.model_dump(),
    }
