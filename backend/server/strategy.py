"""Custom FedProx strategy that persists per-round telemetry (global loss,
participating hospital IDs, per-client DP epsilon spend) to flat files. A
separate FastAPI process reads these to serve the dashboard -- no shared
DB/message queue needed for a local, single-machine simulation.

FedProx (not plain FedAvg) is used so training tolerates the client drift
that Opacus's DP noise introduces into each hospital's local update --
FedProx's proximal term (`proximal_mu` sent to clients via configure_fit)
pulls local updates back toward the global model each round.
"""
import json
import time
from pathlib import Path

import numpy as np
from flwr.common import parameters_to_ndarrays
from flwr.server.strategy import FedProx

# Kept in its own subdirectory (not alongside strategy.py/fl_server.py) so a
# Docker named volume can share just this runtime output between the server
# and API containers without ever shadowing baked-in source files.
TELEMETRY_DIR = Path(__file__).resolve().parent / "telemetry"
TELEMETRY_DIR.mkdir(exist_ok=True)
METRICS_FILE = TELEMETRY_DIR / "round_metrics.jsonl"
NODES_FILE = TELEMETRY_DIR / "nodes_seen.json"
GLOBAL_MODEL_FILE = TELEMETRY_DIR / "global_model.npz"


class TelemetryFedProx(FedProx):
    def aggregate_fit(self, server_round, results, failures):
        aggregated = super().aggregate_fit(server_round, results, failures)
        node_updates = {
            r.metrics["hospitalid"]: r.metrics.get("epsilon")
            for _, r in results
            if r.metrics.get("hospitalid") is not None
        }
        self._record_nodes(server_round, node_updates)
        if aggregated is not None:
            parameters, _fit_metrics = aggregated
            self._save_global_model(parameters)
        return aggregated

    def aggregate_evaluate(self, server_round, results, failures):
        aggregated = super().aggregate_evaluate(server_round, results, failures)
        if aggregated is not None:
            loss, _metrics = aggregated
            self._append_round_metric(server_round, loss, len(results))
        return aggregated

    def _append_round_metric(self, server_round: int, loss: float, num_clients: int) -> None:
        record = {"round": server_round, "loss": loss, "num_clients": num_clients, "ts": time.time()}
        with METRICS_FILE.open("a") as f:
            f.write(json.dumps(record) + "\n")

    def _record_nodes(self, server_round: int, node_updates: dict) -> None:
        seen = json.loads(NODES_FILE.read_text()) if NODES_FILE.exists() else {}
        for hid, epsilon in node_updates.items():
            entry = {"last_round": server_round, "ts": time.time()}
            if epsilon is not None:
                entry["dp_epsilon"] = epsilon
            seen[str(hid)] = entry
        NODES_FILE.write_text(json.dumps(seen))

    def _save_global_model(self, parameters) -> None:
        """Checkpoint the latest aggregated weights so the API can serve live
        inferences without needing a Flower client/server connection at request
        time. Overwritten every round -- always reflects the latest global model.
        """
        arrays = parameters_to_ndarrays(parameters)
        np.savez(GLOBAL_MODEL_FILE, *arrays)
