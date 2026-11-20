"""
main.py — FastAPI Application Entry Point
Registers all routers and middleware.
"""

import sys
import os
import logging
from pathlib import Path

# Add project root to sys.path so 'backend' is discoverable as a package
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import engine, Base, SessionLocal
from backend.routers import auth, predictions, shipments, warehouses, farmers, notifications, ai, admin

import asyncio
from backend.tasks import background_monitoring_loop

logger = logging.getLogger(__name__)

# ── Create all database tables on startup ─────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Post-Harvest Loss Prediction API",
    description=(
        "Backend API for the AI-Driven Post-Harvest Loss Prediction System. "
        "Bangalore Institute of Technology — CSE Dept — Major Project 2023-27."
    ),
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

background_tasks_set = set()


@app.on_event("startup")
async def startup_event():
    # Idempotently seed demo users (skips existing accounts)
    try:
        from backend.seed_data import seed_default_users
        db = SessionLocal()
        try:
            seed_default_users(db)
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Demo user seeding failed (non-fatal): %s", exc)

    task = asyncio.create_task(background_monitoring_loop())
    background_tasks_set.add(task)
    task.add_done_callback(background_tasks_set.discard)
    logger.info("Background monitoring loop started.")


# ── CORS Middleware ───────────────────────────────────────────────────────────
# In production, ALLOWED_ORIGINS is set via environment variable.
# Format: comma-separated list, e.g. "https://agrishield.vercel.app,http://localhost:5173"
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173",
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Routers ─────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(predictions.router)
app.include_router(shipments.router)
app.include_router(warehouses.router)
app.include_router(farmers.router)
app.include_router(notifications.router)
app.include_router(ai.router)
app.include_router(admin.router)


# ── Health Endpoints ──────────────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
def health_check():
    """Basic liveness check — always returns 200 if the process is alive."""
    return {
        "status": "healthy",
        "service": "Post-Harvest Loss Prediction API",
        "version": "1.0.0",
    }


@app.get("/api/health/ready", tags=["Health"])
def readiness_check():
    """Readiness check — verifies database connectivity."""
    db_ok = False
    db_error = None
    try:
        db = SessionLocal()
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db.close()
        db_ok = True
    except Exception as exc:
        db_error = str(exc)

    ready = db_ok
    return {
        "ready": ready,
        "database": "ok" if db_ok else f"error: {db_error}",
    }


@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Welcome to the Post-Harvest Loss Prediction API",
        "docs": "/api/docs",
        "health": "/api/health",
        "ready": "/api/health/ready",
    }
