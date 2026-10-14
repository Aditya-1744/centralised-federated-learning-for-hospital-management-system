"""Loads the latest FedProx-aggregated global model checkpoint and produces
the strict prediction JSON (system_architecture.md's schema:
current_beds_available / predicted_demand / predicted_shortage_in_24h).

Only reads the already-aggregated, non-identifying per-hospital-per-year
feature table -- never individual patient rows -- and only the model's raw
numeric outputs are returned, per CLAUDE.md's Data Visualization Integrity
rule (the UI must show these explicit integers, not just a chart).
"""
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ on path

from data_pipeline.ingest import (
    FEATURE_COLUMNS,
    build_hospital_year_features,
    get_feature_scaler,
    get_latest_hospital_row,
)
from shared.model import ICUDemandNet, set_parameters

GLOBAL_MODEL_FILE = Path(__file__).resolve().parents[1] / "server" / "telemetry" / "global_model.npz"


def load_global_model() -> ICUDemandNet:
    if not GLOBAL_MODEL_FILE.exists():
        raise FileNotFoundError(
            "No trained global model checkpoint yet -- run an FL round "
            "(fl_server.py + hospital_node.py) at least once first."
        )
    npz = np.load(GLOBAL_MODEL_FILE)
    arrays = [npz[f"arr_{i}"] for i in range(len(npz.files))]
    model = ICUDemandNet(input_dim=len(FEATURE_COLUMNS))
    set_parameters(model, arrays)
    model.eval()
    return model


def predict_for_hospital(hospitalid: int, model: ICUDemandNet, features=None) -> dict:
    if features is None:
        features = build_hospital_year_features()
    row = get_latest_hospital_row(hospitalid, features)
    mean, std = get_feature_scaler(features)

    x = (row[FEATURE_COLUMNS] - mean) / std
    x_tensor = torch.tensor(x.values, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        predicted_demand = model(x_tensor).item()

    capacity = float(row["bed_capacity_mid"])
    current_occupancy = float(row["avg_daily_occupancy"])

    return {
        "hospitalid": hospitalid,
        "year": int(row["year"]),
        "current_beds_available": max(0, round(capacity - current_occupancy)),
        "predicted_demand": round(predicted_demand),
        "predicted_shortage_in_24h": predicted_demand > capacity,
        "capacity": round(capacity),
    }
