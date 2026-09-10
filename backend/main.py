"""
main.py — FastAPI Application Entry Point
Registers all routers and middleware.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.database import engine, Base
from backend.routers import auth, predictions, shipments, warehouses, farmers, notifications, ai

import asyncio
from backend.tasks import background_monitoring_loop

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

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(background_monitoring_loop())

# ── CORS Middleware (allow Streamlit frontend) ────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your Streamlit domain
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


# ── Health Check ──────────────────────────────────────────────────────────────
@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "Post-Harvest Loss Prediction API",
        "version": "1.0.0",
    }


@app.get("/", tags=["Root"])
def root():
    return {
        "message": "Welcome to the Post-Harvest Loss Prediction API",
        "docs": "/api/docs",
        "health": "/api/health",
    }
