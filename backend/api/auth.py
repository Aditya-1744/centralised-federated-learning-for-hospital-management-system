"""JWT issuance/verification for the dashboard-facing metrics API.

Local dev-grade auth: a single admin credential (from env vars, with
insecure fallback defaults for local runs only) issues short-lived JWTs;
every /metrics route requires a valid bearer token. This intentionally does
not scale to multi-user auth -- a full OAuth2 provider was judged out of
scope for a local, single-operator simulation (see project plan).
"""
import os
import time

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

SECRET_KEY = os.environ.get("FL_DASHBOARD_JWT_SECRET", "dev-only-insecure-secret-change-me")
ALGORITHM = "HS256"
TOKEN_TTL_SECONDS = 3600

ADMIN_USERNAME = os.environ.get("FL_DASHBOARD_USER", "admin")
ADMIN_PASSWORD = os.environ.get("FL_DASHBOARD_PASSWORD", "changeme")

_bearer = HTTPBearer()


def authenticate(username: str, password: str) -> str:
    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    payload = {"sub": username, "exp": time.time() + TOKEN_TTL_SECONDS}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def require_auth(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired token")
    return payload["sub"]
