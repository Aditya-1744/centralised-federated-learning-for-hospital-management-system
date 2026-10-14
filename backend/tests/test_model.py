import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.model import ICUDemandNet


def test_forward_pass_shape():
    model = ICUDemandNet(input_dim=9)
    x = torch.randn(4, 9)
    out = model(x)
    assert out.shape == (4,)


def test_training_step_reduces_loss():
    torch.manual_seed(0)
    model = ICUDemandNet(input_dim=3)
    x = torch.randn(20, 3)
    y = x.sum(dim=1)
    opt = torch.optim.Adam(model.parameters(), lr=0.05)
    loss_fn = torch.nn.MSELoss()

    initial_loss = loss_fn(model(x), y).item()
    for _ in range(50):
        opt.zero_grad()
        loss = loss_fn(model(x), y)
        loss.backward()
        opt.step()
    final_loss = loss_fn(model(x), y).item()

    assert final_loss < initial_loss
