from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.routes import health, leads, drafts, logs, analytics, integrations, prompts, campaigns, do_not_contact, emails
from app.services.error_service import register_error_handlers

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    init_db()
    yield
    # Shutdown actions (if any)

app = FastAPI(
    title="OutreachOps AI API",
    description="Production-grade cold email automation API with Google Sheets sync, Gemini analysis, and Gmail OAuth",
    version="1.0.0",
    lifespan=lifespan
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



@app.get("/")
async def root():
    return {
        "message": "Welcome to OutreachOps AI API. Use /api/v1/health for diagnostics or /docs for API documentation."
    }
