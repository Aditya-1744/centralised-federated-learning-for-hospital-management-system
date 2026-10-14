"""Flower client wrapping one hospital's local training. Run one process per
hospital (one terminal each) -- each instance only ever loads its own
hospitalid's partition via get_hospital_partition, and only sends model
weight arrays + scalar metrics over the wire (via TLS). Raw patient rows
never leave this process.
"""
import argparse
import sys
from pathlib import Path

import flwr as fl
import torch
from opacus import PrivacyEngine
from torch.utils.data import DataLoader, TensorDataset

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ on path

from data_pipeline.ingest import (
    FEATURE_COLUMNS,
    build_hospital_year_features,
    get_feature_scaler,
    get_hospital_partition,
)
from shared.model import ICUDemandNet, get_parameters, set_parameters

LOCAL_EPOCHS = 40
CERT_PATH = Path(__file__).resolve().parents[1] / "certs" / "server.crt"

# Differential privacy (DP-SGD via Opacus) defaults for local training.
NOISE_MULTIPLIER = 1.0
MAX_GRAD_NORM = 1.0
DELTA = 1e-5


class HospitalClient(fl.client.NumPyClient):
    def __init__(self, hospitalid: int):
        self.hospitalid = hospitalid
        features = build_hospital_year_features()
        partition = get_hospital_partition(hospitalid, features)
        if len(partition) < 2:
            raise ValueError(f"hospital {hospitalid} needs >=2 year-transitions to train/evaluate.")

        X = torch.tensor(partition[FEATURE_COLUMNS].values, dtype=torch.float32)
        y = torch.tensor(partition["next_year_occupancy"].values, dtype=torch.float32)

        # Standardize against the fixed global (all-hospital) scaler, not this
        # hospital's own ~3-4 rows -- see get_feature_scaler's docstring for why:
        # every client and the inference module must agree on one shared scale
        # for the FedProx-aggregated weights to mean the same thing everywhere.
        mean, std = get_feature_scaler(features)
        mean = torch.tensor(mean.values, dtype=torch.float32)
        std = torch.tensor(std.values, dtype=torch.float32)
        X = (X - mean) / std

        self.X_train, self.y_train = X[:-1], y[:-1]
        self.X_test, self.y_test = X[-1:], y[-1:]

        self.model = ICUDemandNet(input_dim=X.shape[1])

    def get_parameters(self, config):
        return get_parameters(self.model)

    def fit(self, parameters, config):
        # A fresh model per round (rather than reusing self.model in place) avoids
        # re-wrapping the same nn.Module with Opacus's PrivacyEngine twice, which
        # errors -- Opacus hooks its wrapped submodules and expects one wrap per
        # object's lifetime.
        model = ICUDemandNet(input_dim=len(FEATURE_COLUMNS))
        set_parameters(model, parameters)
        global_params = [p.detach().clone() for p in model.parameters()]
        proximal_mu = float(config.get("proximal_mu", 0.0))

        optimizer = torch.optim.SGD(model.parameters(), lr=0.1)
        loader = DataLoader(TensorDataset(self.X_train, self.y_train), batch_size=len(self.X_train))

        privacy_engine = PrivacyEngine()
        dp_model, dp_optimizer, dp_loader = privacy_engine.make_private(
            module=model,
            optimizer=optimizer,
            data_loader=loader,
            noise_multiplier=NOISE_MULTIPLIER,
            max_grad_norm=MAX_GRAD_NORM,
        )

        dp_model.train()
        for _ in range(LOCAL_EPOCHS):
            for xb, yb in dp_loader:
                dp_optimizer.zero_grad()
                per_sample_loss = torch.nn.functional.mse_loss(dp_model(xb), yb, reduction="none")
                if proximal_mu > 0:
                    # The proximal term depends only on public parameters (not
                    # per-sample data), so folding it into the per-sample loss
                    # before Opacus's clipping doesn't need DP protection itself
                    # -- it's just the simplest way to combine FedProx with
                    # Opacus's per-sample-gradient hooks without hand-splicing
                    # gradients after the DP step.
                    prox_term = sum(
                        (p - gp).pow(2).sum() for p, gp in zip(dp_model.parameters(), global_params)
                    )
                    per_sample_loss = per_sample_loss + (proximal_mu / 2) * prox_term
                per_sample_loss.mean().backward()
                dp_optimizer.step()

        # ponytail: epsilon reported here is this round's local DP spend only,
        # not a cumulative cross-round budget. Upgrade path: persist one
        # PrivacyEngine/accountant per hospital across rounds if a hard total
        # epsilon budget must be enforced.
        epsilon = privacy_engine.get_epsilon(delta=DELTA)

        self.model = model
        return (
            get_parameters(model),
            len(self.X_train),
            {"hospitalid": self.hospitalid, "epsilon": round(epsilon, 4)},
        )

    def evaluate(self, parameters, config):
        set_parameters(self.model, parameters)
        self.model.eval()
        loss_fn = torch.nn.MSELoss()
        with torch.no_grad():
            loss = loss_fn(self.model(self.X_test), self.y_test).item()
        return loss, len(self.X_test), {"hospitalid": self.hospitalid}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hospitalid", type=int, required=True)
    parser.add_argument("--server_address", type=str, default="localhost:8443")
    parser.add_argument("--insecure", action="store_true", help="plaintext gRPC, local debugging only")
    args = parser.parse_args()

    client = HospitalClient(args.hospitalid).to_client()

    if args.insecure:
        fl.client.start_client(server_address=args.server_address, client=client, insecure=True)
    else:
        fl.client.start_client(
            server_address=args.server_address,
            client=client,
            root_certificates=CERT_PATH.read_bytes(),
        )
