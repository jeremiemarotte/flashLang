import os

from fastapi import Header, HTTPException, status

HERMES_TOKEN = os.environ["HERMES_TOKEN"]
PWA_TOKEN = os.environ["PWA_TOKEN"]


def _extract(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    return authorization.removeprefix("Bearer ").strip()


def require_hermes(authorization: str | None = Header(default=None)) -> None:
    """Card creation is Hermes-only — the PWA is read/review-only per product scope."""
    if _extract(authorization) != HERMES_TOKEN:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")


def require_any_client(authorization: str | None = Header(default=None)) -> None:
    if _extract(authorization) not in (HERMES_TOKEN, PWA_TOKEN):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
