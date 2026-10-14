import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from main import app
from simulation import Simulation

client = TestClient(app)


def test_profiles_span_20_to_150_beds():
    sim = Simulation()
    capacities = [h["capacity"] for h in sim.hospitals]
    assert len(capacities) == 30
    assert min(capacities) == 20
    assert max(capacities) == 150


def test_batch_message_shape():
    batch = Simulation().tick()
    assert batch["type"] == "batch"
    assert len(batch["hospitals"]) == 30
    for h in batch["hospitals"]:
        assert 0 <= h["occupied"] <= h["capacity"]
        assert h["available"] == h["capacity"] - h["occupied"]
        assert 0 <= h["available_pct"] <= 100
    assert 0 <= batch["global_available_pct"] <= 100
    assert batch["global_loss"] > 0


def test_ws_idle_until_start_then_streams():
    with client.websocket_connect("/ws/simulation") as ws:
        ws.send_json({"action": "start"})
        batch = ws.receive_json()
        assert batch["type"] == "batch"
        assert len(batch["hospitals"]) == 30
        ws.send_json({"action": "stop"})
