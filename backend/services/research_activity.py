"""In-memory activity bus for the research engine.

Every meaningful step of a research run (plan → search → fetch → synthesize →
round result) is appended to a bounded ring buffer. The dev-only monitor page
polls this buffer over SSE, so emission must be safe from any thread and must
never raise — monitoring must not be able to break a research run.
"""
import itertools
import threading
import time
from collections import deque
from typing import Any

MAX_EVENTS = 500

_seq = itertools.count(1)
_lock = threading.Lock()
_events: deque[dict[str, Any]] = deque(maxlen=MAX_EVENTS)


def emit(step: str, *, entity: str = "", category: str = "", detail: str = "", **extra: Any) -> None:
    """Record one research activity event. Never raises."""
    try:
        event: dict[str, Any] = {
            "id": next(_seq),
            "ts": time.time(),
            "step": step,
            "entity": entity,
            "category": category,
            "detail": detail,
        }
        event.update(extra)
        with _lock:
            _events.append(event)
    except Exception:
        pass


def snapshot(last_id: int = 0) -> list[dict[str, Any]]:
    """All events with id > last_id, oldest first."""
    with _lock:
        return [event for event in _events if event["id"] > last_id]


def clear() -> None:
    """Drop buffered history (monitor 'Clear' button)."""
    with _lock:
        _events.clear()
