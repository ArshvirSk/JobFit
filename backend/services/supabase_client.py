"""Supabase client singleton for backend operations."""
from supabase import create_client, Client
from backend.config import settings

_client: Client | None = None

def get_supabase() -> Client:
    """Get or create the Supabase admin client (uses service key for RLS bypass)."""
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env"
            )
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client
