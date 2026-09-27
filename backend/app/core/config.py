from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc


def _list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    max_upload_bytes: int
    max_extracted_bytes: int
    max_files: int
    max_solidity_files: int
    slither_timeout_s: int
    python_bin: str
    github_token: str | None
    ai_reason_url: str | None
    internal_token: str | None
    ai_timeout_s: int
    allowed_origins: list[str] = field(default_factory=list)

    @property
    def ai_enabled(self) -> bool:
        return bool(self.ai_reason_url and self.internal_token)


@lru_cache
def get_settings() -> Settings:
    data_dir = Path(os.environ.get("CHAINGUARD_DATA_DIR", "./.chainguard-data")).resolve()
    return Settings(
        data_dir=data_dir,
        max_upload_bytes=_int("CHAINGUARD_MAX_UPLOAD_MB", 20) * 1024 * 1024,
        max_extracted_bytes=_int("CHAINGUARD_MAX_EXTRACTED_MB", 80) * 1024 * 1024,
        max_files=_int("CHAINGUARD_MAX_FILES", 5_000),
        max_solidity_files=_int("CHAINGUARD_MAX_SOLIDITY_FILES", 150),
        slither_timeout_s=_int("CHAINGUARD_SLITHER_TIMEOUT_S", 180),
        python_bin=os.environ.get("CHAINGUARD_PYTHON") or sys.executable,
        github_token=os.environ.get("GITHUB_TOKEN") or None,
        ai_reason_url=os.environ.get("CHAINGUARD_AI_REASON_URL") or None,
        internal_token=os.environ.get("CHAINGUARD_INTERNAL_TOKEN") or None,
        ai_timeout_s=_int("CHAINGUARD_AI_TIMEOUT_S", 120),
        allowed_origins=_list("CHAINGUARD_ALLOWED_ORIGINS", ["http://localhost:3000"]),
    )
