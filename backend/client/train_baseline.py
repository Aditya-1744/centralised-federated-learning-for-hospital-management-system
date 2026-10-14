"""Phase 1 baseline: train ICUDemandNet on ONE hospital's data, in isolation,
with no Flower/networking involved (per CLAUDE.md: test PyTorch locally
before wrapping it in FL client logic).

Usage: python train_baseline.py --hospitalid 6
"""
import argparse
import sys
from pathlib import Path

import torch
from torch import optim

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ on path

from data_pipeline.ingest import FEATURE_COLUMNS, build_hospital_year_features, get_hospital_partition
from shared.model import ICUDemandNet


def train_and_evaluate(hospitalid: int, epochs: int = 200, lr: float = 0.01):
    features = build_hospital_year_features()
    partition = get_hospital_partition(hospitalid, features)

    if len(partition) < 2:
        raise ValueError(
            f"hospital {hospitalid} has only {len(partition)} year-transition(s) of data -- "
            "need at least 2 (train + test) to run a baseline."
        )

    X = torch.tensor(partition[FEATURE_COLUMNS].values, dtype=torch.float32)
    y = torch.tensor(partition["next_year_occupancy"].values, dtype=torch.float32)

    X_train, y_train = X[:-1], y[:-1]
    X_test, y_test = X[-1:], y[-1:]

    mean, std = X_train.mean(dim=0), X_train.std(dim=0).clamp_min(1e-6)
    X_train = (X_train - mean) / std
    X_test = (X_test - mean) / std

    model = ICUDemandNet(input_dim=X.shape[1])
    opt = optim.Adam(model.parameters(), lr=lr)
    loss_fn = torch.nn.MSELoss()

    model.train()
    for _ in range(epochs):
        opt.zero_grad()
        loss = loss_fn(model(X_train), y_train)
        loss.backward()
        opt.step()

    model.eval()
    with torch.no_grad():
        test_pred = model(X_test)
        test_mae = (test_pred - y_test).abs().mean().item()

    print(
        f"hospital {hospitalid}: trained on {len(X_train)} year-transitions, "
        f"final train MSE={loss.item():.4f}, held-out test MAE={test_mae:.4f} "
        f"(predicted next-year avg daily occupancy={test_pred.item():.2f} vs actual={y_test.item():.2f})"
    )
    print(
        "Note: a single hospital only has a handful of yearly transitions to train on -- "
        "this sparsity is exactly the motivation for Phase 2's federated pooling across hospitals."
    )
    return model, test_mae


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hospitalid", type=int, required=True)
    parser.add_argument("--epochs", type=int, default=200)
    args = parser.parse_args()
    train_and_evaluate(args.hospitalid, epochs=args.epochs)
