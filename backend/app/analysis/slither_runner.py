"""Run the Slither worker in a separate process with a hard timeout."""

from __future__ import annotations

import json
import subprocess
import tempfile
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger(__name__)
_BACKEND_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class SlitherOutput:
    status: str  # complete | failed | unavailable
    message: str | None = None
    contracts: list[dict] = field(default_factory=list)
    detectors: list[dict] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@lru_cache
def slither_available() -> bool:
    try:
        probe = subprocess.run(
            [get_settings().python_bin, "-c", "import slither"],
            capture_output=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return probe.returncode == 0


def _remappings(repo: Path) -> str | None:
    file = repo / "remappings.txt"
    if not file.is_file():
        return None
    lines = [line.strip() for line in file.read_text(errors="replace").splitlines()]
    valid = [line for line in lines if line and "=" in line and not line.startswith("#") and " " not in line]
    return " ".join(valid) or None


def run_slither(repo: Path, files: list[str]) -> SlitherOutput:
    if not slither_available():
        return SlitherOutput("unavailable", "Slither is not installed in the analysis environment.")

    settings = get_settings()
    with tempfile.TemporaryDirectory(prefix="cg-slither-") as tmp:
        request = Path(tmp) / "request.json"
        result = Path(tmp) / "result.json"
        request.write_text(json.dumps({"files": files, "remappings": _remappings(repo)}))
        try:
            proc = subprocess.run(
                [settings.python_bin, "-m", "app.analysis.slither_worker", str(repo), str(request), str(result)],
                cwd=_BACKEND_ROOT,
                capture_output=True,
                text=True,
                timeout=settings.slither_timeout_s,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return SlitherOutput("failed", f"Slither exceeded the {settings.slither_timeout_s}s time limit.")

        if proc.returncode != 0 or not result.is_file():
            log.warning("slither worker failed", extra={"stderr": proc.stderr[-2000:]})
            return SlitherOutput("failed", "Slither worker exited unexpectedly.")

        data = json.loads(result.read_text())

    contracts, detectors, errors = data["contracts"], data["detectors"], data["errors"]
    if not contracts:
        return SlitherOutput("failed", "No file compiled successfully.", errors=errors)
    message = f"{len(errors)} file(s) could not be compiled." if errors else None
    return SlitherOutput("complete", message, contracts, detectors, errors)
