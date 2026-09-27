"""Filesystem-backed analysis store.

Layout: <data_dir>/analyses/<id>/{analysis.json,status.json,repo/}
Writes are atomic (temp file + rename) so readers never see partial JSON.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import threading
from pathlib import Path

from app.core.errors import NotFoundError
from app.models.domain import Analysis, AnalysisStatusPayload

_ID_PATTERN = re.compile(r"^[a-z0-9]{8,32}$")


class AnalysisStore:
    def __init__(self, root: Path) -> None:
        self._root = root / "analyses"
        self._root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def new_id(self) -> str:
        return secrets.token_hex(8)

    def analysis_dir(self, analysis_id: str) -> Path:
        if not _ID_PATTERN.match(analysis_id):
            raise NotFoundError("Analysis not found.")
        return self._root / analysis_id

    def repo_dir(self, analysis_id: str) -> Path:
        return self.analysis_dir(analysis_id) / "repo"

    def create(self, analysis_id: str) -> Path:
        directory = self.analysis_dir(analysis_id)
        directory.mkdir(parents=True, exist_ok=False)
        return directory

    def save_analysis(self, analysis: Analysis) -> None:
        self._write_json(self.analysis_dir(analysis.id) / "analysis.json", analysis.dump())

    def save_status(self, status: AnalysisStatusPayload) -> None:
        self._write_json(self.analysis_dir(status.id) / "status.json", status.dump())

    def load_analysis(self, analysis_id: str) -> Analysis:
        return Analysis.model_validate(self._read_json(self.analysis_dir(analysis_id) / "analysis.json"))

    def load_status(self, analysis_id: str) -> AnalysisStatusPayload:
        return AnalysisStatusPayload.model_validate(self._read_json(self.analysis_dir(analysis_id) / "status.json"))

    def read_source(self, analysis_id: str, relative_path: str, max_bytes: int = 1_000_000) -> str | None:
        """Return file content only if the resolved path stays inside the repo dir."""
        repo = self.repo_dir(analysis_id).resolve()
        if not relative_path or relative_path.startswith("/") or "\x00" in relative_path:
            return None
        candidate = (repo / relative_path).resolve()
        if repo not in candidate.parents or not candidate.is_file() or candidate.is_symlink():
            return None
        if candidate.stat().st_size > max_bytes:
            return None
        return candidate.read_text(encoding="utf-8", errors="replace")

    def delete(self, analysis_id: str) -> None:
        shutil.rmtree(self.analysis_dir(analysis_id), ignore_errors=True)

    def _write_json(self, path: Path, payload: dict) -> None:
        tmp = path.with_suffix(f".{secrets.token_hex(4)}.tmp")
        with self._lock:
            tmp.write_text(json.dumps(payload), encoding="utf-8")
            os.replace(tmp, path)

    def _read_json(self, path: Path) -> dict:
        if not path.is_file():
            raise NotFoundError("Analysis not found.")
        return json.loads(path.read_text(encoding="utf-8"))
