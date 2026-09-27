"""GitHub repository ingestion via the tarball API. Nothing is cloned or executed."""

from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import httpx

from app.core.errors import IngestionError, InvalidInputError, NotFoundError, PayloadTooLargeError

from .archive import ExtractionResult, extract_tar_gz

_URL_PATTERN = re.compile(
    r"^https://github\.com/(?P<owner>[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/(?P<repo>[A-Za-z0-9._-]{1,100}?)"
    r"(?:\.git)?(?:/tree/(?P<ref>[A-Za-z0-9._/-]{1,200}))?/?$"
)


@dataclass(frozen=True)
class GitHubRef:
    owner: str
    repo: str
    ref: str | None

    @property
    def display(self) -> str:
        base = f"{self.owner}/{self.repo}"
        return f"{base}@{self.ref}" if self.ref else base

    @property
    def url(self) -> str:
        base = f"https://github.com/{self.owner}/{self.repo}"
        return f"{base}/tree/{self.ref}" if self.ref else base


def parse_github_url(url: str) -> GitHubRef:
    match = _URL_PATTERN.match(url.strip())
    if not match or match["repo"] in (".", ".."):
        raise InvalidInputError("Expected a public repository URL like https://github.com/owner/repo.")
    return GitHubRef(owner=match["owner"], repo=match["repo"], ref=match["ref"])


def download_and_extract(
    ref: GitHubRef, dest: Path, *, max_download: int, max_extracted: int, max_files: int, token: str | None
) -> ExtractionResult:
    path = f"https://api.github.com/repos/{quote(ref.owner)}/{quote(ref.repo)}/tarball"
    if ref.ref:
        path += f"/{quote(ref.ref, safe='')}"
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "ChainGuard-Analyzer"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    with tempfile.TemporaryFile() as buffer:
        try:
            with httpx.stream("GET", path, headers=headers, follow_redirects=True, timeout=60) as response:
                if response.status_code == 404:
                    raise NotFoundError("Repository or ref not found, or it is private.")
                if response.status_code in (403, 429):
                    raise IngestionError("GitHub rate limit reached. Try again later or configure GITHUB_TOKEN.")
                if response.status_code != 200:
                    raise IngestionError(f"GitHub responded with status {response.status_code}.")
                received = 0
                for chunk in response.iter_bytes():
                    received += len(chunk)
                    if received > max_download:
                        raise PayloadTooLargeError("Repository archive exceeds the download size limit.")
                    buffer.write(chunk)
        except httpx.HTTPError as exc:
            raise IngestionError("Could not download the repository from GitHub.") from exc
        buffer.seek(0)
        return extract_tar_gz(buffer, dest, max_extracted, max_files)
