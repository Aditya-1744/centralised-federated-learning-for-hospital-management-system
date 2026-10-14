"""FastAPI metrics API -- the only HTTP surface the frontend BI dashboard
talks to. Reads round telemetry that backend/server/strategy.py's
TelemetryFedProx writes to disk; never touches raw patient data or the
model weights directly.

Run: cd backend/api && uvicorn main:app --host 0.0.0.0 --port 8000
"""
import json
import os
import sys
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from auth import authenticate, require_auth
from simulation import router as simulation_router

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ on path
from data_pipeline.ingest import build_hospital_year_features  # noqa: E402
from inference import load_global_model, predict_for_hospital  # noqa: E402

TELEMETRY_DIR = Path(__file__).resolve().parents[1] / "server" / "telemetry"
METRICS_FILE = TELEMETRY_DIR / "round_metrics.jsonl"
NODES_FILE = TELEMETRY_DIR / "nodes_seen.json"

FRONTEND_ORIGIN = os.environ.get("FL_DASHBOARD_FRONTEND_ORIGIN", "http://localhost:3000")

app = FastAPI(title="AURA (Automated Unit Resource Allocation) Metrics API")
app.include_router(simulation_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PredictionResponse(BaseModel):
    """Strict schema for model inferences (system_architecture.md). These raw
    integers/booleans must always be shown explicitly in the UI, never only
    implied by a chart (CLAUDE.md Data Visualization Integrity rule)."""

    hospitalid: int
    year: int
    current_beds_available: int
    predicted_demand: int
    predicted_shortage_in_24h: bool
    capacity: int


@app.post("/auth/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    token = authenticate(form_data.username, form_data.password)
    return TokenResponse(access_token=token)


@app.get("/metrics/rounds")
def get_rounds(user: str = Depends(require_auth)):
    if not METRICS_FILE.exists():
        return []
    return [json.loads(line) for line in METRICS_FILE.read_text().splitlines() if line.strip()]


@app.get("/metrics/nodes")
def get_nodes(user: str = Depends(require_auth)):
    if not NODES_FILE.exists():
        return {}
    return json.loads(NODES_FILE.read_text())


@app.get("/predictions", response_model=list[PredictionResponse])
def get_all_predictions(user: str = Depends(require_auth)):
    try:
        model = load_global_model()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    features = build_hospital_year_features()
    hospital_ids = sorted(features["hospitalid"].unique().tolist())
    return [predict_for_hospital(hid, model, features) for hid in hospital_ids]


@app.get("/predictions/{hospitalid}", response_model=PredictionResponse)
def get_prediction(hospitalid: int, user: str = Depends(require_auth)):
    try:
        model = load_global_model()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    try:
        return predict_for_hospital(hospitalid, model)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
