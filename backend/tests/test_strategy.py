import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))

import strategy as strategy_module
from strategy import TelemetryFedProx


def test_record_nodes_writes_hospital_ids_and_epsilon(tmp_path, monkeypatch):
    monkeypatch.setattr(strategy_module, "NODES_FILE", tmp_path / "nodes_seen.json")
    strat = TelemetryFedProx(proximal_mu=0.1)

    strat._record_nodes(server_round=1, node_updates={6: 2.5, 12: 3.1, 19: None})

    seen = json.loads((tmp_path / "nodes_seen.json").read_text())
    assert set(seen.keys()) == {"6", "12", "19"}
    assert all(v["last_round"] == 1 for v in seen.values())
    assert seen["6"]["dp_epsilon"] == 2.5
    assert "dp_epsilon" not in seen["19"]


def test_append_round_metric_is_appended_not_overwritten(tmp_path, monkeypatch):
    monkeypatch.setattr(strategy_module, "METRICS_FILE", tmp_path / "round_metrics.jsonl")
    strat = TelemetryFedProx(proximal_mu=0.1)

    strat._append_round_metric(1, loss=10.0, num_clients=3)
    strat._append_round_metric(2, loss=8.0, num_clients=3)

    lines = (tmp_path / "round_metrics.jsonl").read_text().splitlines()
    records = [json.loads(line) for line in lines]
    assert [r["round"] for r in records] == [1, 2]
    assert [r["loss"] for r in records] == [10.0, 8.0]
