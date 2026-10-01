import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings
from backend.api.routes import router
from backend.chat.routes import chat_router
from backend.api.company_routes import company_router
from backend.api.onboarding_routes import router as onboarding_router
from contextlib import asynccontextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.app_debug else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start background tasks
    from backend.tasks import run_watch_loop, run_connector_sync_loop
    import asyncio
    watch_task = asyncio.create_task(run_watch_loop())
    sync_task = asyncio.create_task(run_connector_sync_loop())
    
    yield
    
    # Shutdown: Clean up background tasks
    watch_task.cancel()
    sync_task.cancel()
    try:
        await watch_task
        await sync_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="JobFit API",
    description="AI Job Application Copilot — Core AI Pipeline API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.api.actions_routes import router as actions_router
from backend.api.research_routes import research_router

# Include routes
app.include_router(router)
app.include_router(chat_router)
app.include_router(company_router)
app.include_router(onboarding_router)
app.include_router(actions_router)
app.include_router(research_router)  # dev-only research monitor + SSE stream

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=settings.app_debug)
