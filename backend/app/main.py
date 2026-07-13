import base64
import os

# Auto-decode base64 credentials from environment variables on startup
for env_name, file_path in [
    ("GMAIL_CREDENTIALS_B64", "gmail_credentials.json"),
    ("GMAIL_TOKEN_B64", "gmail_token.pkl"),
    ("SHEETS_CREDENTIALS_B64", "sheets_credentials.json"),
]:
    val = os.getenv(env_name)
    if val:
        try:
            with open(file_path, "wb") as f:
                f.write(base64.b64decode(val.strip()))
            print(f"Decoded {env_name} into {file_path}")
        except Exception as e:
            print(f"Failed to write {file_path} from {env_name}: {e}")

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routes import (
    analytics,
    campaigns,
    do_not_contact,
    drafts,
    emails,
    health,
    integrations,
    leads,
    logs,
    prompts,
    imports,
    settings as settings_route,
)
from app.services.error_service import register_error_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    init_db()
    
    from app.services.generation_worker import GenerationWorker
    GenerationWorker.start()
    
    yield
    # Shutdown actions
    GenerationWorker.stop()


app = FastAPI(
    title="OutreachOps AI API",
    description="Production-grade cold email automation API with Google Sheets sync, Gemini analysis, and Gmail OAuth",
    version="1.0.0",
    lifespan=lifespan,
)

# Register custom exception handler middleware
register_error_handlers(app)

# CORS Middleware config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this to the frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(health.router, prefix="/api/v1")
app.include_router(leads.router, prefix="/api/v1")
app.include_router(drafts.router, prefix="/api/v1")
app.include_router(logs.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(integrations.router, prefix="/api/v1")
app.include_router(prompts.router, prefix="/api/v1")
app.include_router(campaigns.router, prefix="/api/v1")
app.include_router(do_not_contact.router, prefix="/api/v1")
app.include_router(emails.router, prefix="/api/v1")
app.include_router(imports.router, prefix="/api/v1")
app.include_router(settings_route.router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "message": "Welcome to OutreachOps AI API. Use /api/v1/health for diagnostics or /docs for API documentation."
    }
