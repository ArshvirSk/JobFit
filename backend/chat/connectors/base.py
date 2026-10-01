import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Type, TypeVar
from pydantic import BaseModel
from backend.services import research_activity as activity
from backend.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)
T = TypeVar("T", bound=BaseModel)

class BaseConnector:
    """Base class for data connectors with caching logic."""
    category: str
    ttl_hours: int = 24  # Default TTL
    response_model: Type[T]

    async def fetch(self, entity_name: str) -> Optional[T]:
        """Fetch data, checking the cache first."""
        cached = self._check_cache(entity_name)
        if cached:
            logger.info(f"Cache hit for {entity_name} [{self.category}]")
            activity.emit("cache_hit", entity=entity_name, category=self.category, detail="served from cache")
            if self.category in ["linkedin", "glassdoor"]:
                logger.info(f"METRIC: URL_CACHE_HIT category={self.category} entity={entity_name}")
            try:
                return self.response_model.model_validate(cached["data"])
            except Exception as e:
                logger.error(f"Error parsing cached data for {entity_name} [{self.category}]: {e}")
                # If parsing fails, proceed to fetch live

        logger.info(f"Fetching live data for {entity_name} [{self.category}]")
        activity.emit("start", entity=entity_name, category=self.category, detail="research needed — going live")
        if self.category in ["linkedin", "glassdoor"]:
            logger.info(f"METRIC: URL_CACHE_MISS category={self.category} entity={entity_name}")
        try:
            live_data = await self._fetch_live(entity_name)
            if live_data:
                self._update_cache(entity_name, live_data)
            return live_data
        except Exception as e:
            logger.error(f"Error fetching live data for {entity_name} [{self.category}]: {e}")
            return None

    # Sparse results (lots of nulls) must NOT pin the cache for days: they get
    # a short TTL so the research engine can retry with better queries soon.
    # Categories without research metadata keep the plain category TTL.
    SPARSE_TTL_HOURS = 3
    PARTIAL_TTL_HOURS = 12

    @staticmethod
    def _coverage_from(data) -> Optional[float]:
        if isinstance(data, dict):
            value = data.get("coverage")
        else:
            value = getattr(data, "coverage", None)
        return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None

    def _effective_ttl_hours(self, data) -> int:
        coverage = self._coverage_from(data)
        if coverage is None:
            return self.ttl_hours
        if coverage <= 0:
            return min(self.SPARSE_TTL_HOURS, self.ttl_hours)
        if coverage < 0.5:
            return min(self.PARTIAL_TTL_HOURS, self.ttl_hours)
        return self.ttl_hours

    def _check_cache(self, entity_name: str) -> Optional[dict]:
        supabase = get_supabase()
        try:
            res = supabase.table("company_profiles").select("*").eq("entity_name", entity_name).eq("category", self.category).execute()
            if res.data and len(res.data) > 0:
                record = res.data[0]
                fetched_at = datetime.fromisoformat(record["fetched_at"])
                ttl_hours = self._effective_ttl_hours(record.get("data"))
                if datetime.now(timezone.utc) - fetched_at < timedelta(hours=ttl_hours):
                    return record
        except Exception as e:
            logger.warning(f"Failed to check cache for {entity_name} [{self.category}]: {e}")
        return None

    def _update_cache(self, entity_name: str, data: T):
        """Persist a fetched result. TTL is applied at read time based on the
        result's research coverage — see _effective_ttl_hours."""
        supabase = get_supabase()
        try:
            supabase.table("company_profiles").upsert(
                {
                    "entity_name": entity_name,
                    "category": self.category,
                    "data": data.model_dump(),
                    "source": getattr(self, "source", "unknown"),
                    "fetched_at": datetime.now(timezone.utc).isoformat()
                },
                on_conflict="entity_name,category"
            ).execute()
        except Exception as e:
            logger.warning(f"Failed to update cache for {entity_name} [{self.category}]: {e}")

    async def _fetch_live(self, entity_name: str) -> Optional[T]:
        """Override this method in subclasses to fetch live data."""
        raise NotImplementedError
