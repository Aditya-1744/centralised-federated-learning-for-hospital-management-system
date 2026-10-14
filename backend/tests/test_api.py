import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from main import app

client = TestClient(app)


def test_metrics_requires_auth():
    resp = client.get("/metrics/rounds")
    assert resp.status_code in (401, 403)


def test_login_rejects_bad_credentials():
    resp = client.post("/auth/login", data={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_login_then_read_metrics_succeeds():
    login = client.post("/auth/login", data={"username": "admin", "password": "changeme"})
    assert login.status_code == 200
    token = login.json()["access_token"]

    resp = client.get("/metrics/rounds", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
