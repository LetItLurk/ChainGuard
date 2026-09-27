"""Calls the Next.js AI investigation route. Failures degrade to deterministic-only analysis."""

from __future__ import annotations

import json
from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)
MAX_RESPONSE_BYTES = 2 * 1024 * 1024


@dataclass
class AIResult:
    status: str  # complete | unavailable | failed
    candidates: dict | None = None
    message: str | None = None


def request_investigation(context: dict) -> AIResult:
    settings = get_settings()
    if not settings.ai_enabled:
        return AIResult("unavailable", message="AI investigation is not configured; deterministic analysis only.")

    body = json.dumps(context)
    try:
        response = httpx.post(
            settings.ai_reason_url,  # type: ignore[arg-type]
            content=body,
            headers={"Authorization": f"Bearer {settings.internal_token}", "Content-Type": "application/json"},
            timeout=settings.ai_timeout_s,
            follow_redirects=False,
        )
    except httpx.HTTPError as exc:
        log.warning("ai request failed", extra={"error": type(exc).__name__})
        return AIResult("failed", message="AI investigation could not be reached.")

    if response.status_code != 200:
        log.warning("ai request rejected", extra={"status": response.status_code})
        return AIResult("failed", message=f"AI investigation returned HTTP {response.status_code}.")
    if len(response.content) > MAX_RESPONSE_BYTES:
        return AIResult("failed", message="AI investigation response was too large.")
    try:
        data = response.json()
    except ValueError:
        return AIResult("failed", message="AI investigation returned invalid JSON.")
    if not isinstance(data, dict) or not isinstance(data.get("chains"), list):
        return AIResult("failed", message="AI investigation returned an unexpected shape.")
    return AIResult("complete", candidates=data)
