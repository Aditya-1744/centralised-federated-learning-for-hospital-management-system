import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from data_pipeline.ingest import build_hospital_year_features
from inference import predict_for_hospital
from shared.model import ICUDemandNet


def test_predict_for_hospital_matches_schema():
    torch.manual_seed(0)
    features = build_hospital_year_features()
    hospitalid = int(features["hospitalid"].iloc[0])
    model = ICUDemandNet(input_dim=9)

    result = predict_for_hospital(hospitalid, model, features)

    assert result["hospitalid"] == hospitalid
    assert isinstance(result["current_beds_available"], int)
    assert isinstance(result["predicted_demand"], int)
    assert isinstance(result["predicted_shortage_in_24h"], bool)
    assert result["current_beds_available"] >= 0


def test_predict_for_unknown_hospital_raises():
    features = build_hospital_year_features()
    model = ICUDemandNet(input_dim=9)
    try:
        predict_for_hospital(999999, model, features)
        assert False, "expected ValueError for an unknown hospitalid"
    except ValueError:
        pass
