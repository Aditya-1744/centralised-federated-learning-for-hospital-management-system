"""ICUDemandNet: the regressor trained locally in Phase 1 and FedAvg-averaged
across hospital nodes in Phase 2. Kept as a small MLP (not a sequence model)
since each hospital only has a handful of yearly data points to train on.
"""
import torch
import torch.nn as nn


class ICUDemandNet(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int = 16):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(-1)


def get_parameters(model: ICUDemandNet) -> list:
    """Ordered list of numpy arrays -- the exact form Flower ships over the wire
    and the form the global model checkpoint is saved in."""
    return [val.cpu().numpy() for val in model.state_dict().values()]


def set_parameters(model: ICUDemandNet, parameters) -> None:
    keys = model.state_dict().keys()
    state_dict = {k: torch.tensor(v) for k, v in zip(keys, parameters)}
    model.load_state_dict(state_dict, strict=True)
