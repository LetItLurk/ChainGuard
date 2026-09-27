"""Defensive ZIP / tar.gz extraction.

Repository code is never executed. Only a small allow-list of file types is
written to disk, every path is normalized and confined to the destination,
links and special files are rejected, and total/entry sizes are capped to
stop archive bombs.
"""

from __future__ import annotations

import io
import posixpath
import stat
import tarfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO, Iterator

from app.core.errors import InvalidInputError, PayloadTooLargeError, UnsupportedRepositoryError

EXTRACT_SUFFIXES = (".sol",)
EXTRACT_NAMES = {"remappings.txt", "foundry.toml"}
MAX_ENTRY_BYTES = 2 * 1024 * 1024


class IngestionFormatError(InvalidInputError):
    def __init__(self) -> None:
        super().__init__("Repository archive could not be read.")


@dataclass
class ExtractionResult:
    total_entries: int = 0
    extracted: list[str] = field(default_factory=list)
    skipped_unsafe: int = 0
    skipped_large: int = 0


def safe_member_path(name: str, strip_root: bool) -> str | None:
    """Normalize an archive member name to a safe repo-relative POSIX path."""
    if not name or "\x00" in name or "\\" in name:
        return None
    if name.startswith("/"):
        return None
    normalized = posixpath.normpath(_strip_dot_prefix(name))
    if normalized == "." or normalized == ".." or normalized.startswith("../"):
        return None
    parts = normalized.split("/")
    if strip_root:
        parts = parts[1:]
    if not parts or any(p in ("", ".", "..") for p in parts):
        return None
    if len(parts[0]) >= 2 and parts[0][1] == ":":
        return None
    return "/".join(parts)


def _wanted(rel_path: str) -> bool:
    base = rel_path.rsplit("/", 1)[-1]
    return rel_path.endswith(EXTRACT_SUFFIXES) or base in EXTRACT_NAMES


class _Budget:
    def __init__(self, max_total: int, max_files: int) -> None:
        self.remaining = max_total
        self.max_files = max_files

    def consume(self, n: int) -> None:
        self.remaining -= n
        if self.remaining < 0:
            raise PayloadTooLargeError("Repository exceeds the extracted size limit.")


def _write_limited(src: BinaryIO, dest: Path, budget: _Budget) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with dest.open("wb") as out:
        while chunk := src.read(64 * 1024):
            written += len(chunk)
            if written > MAX_ENTRY_BYTES:
                out.close()
                dest.unlink(missing_ok=True)
                return False
            budget.consume(len(chunk))
            out.write(chunk)
    return True


def _strip_dot_prefix(name: str) -> str:
    while name.startswith("./"):
        name = name[2:]
    return name


def _common_root(names: list[str]) -> bool:
    """True when every file sits under one top-level directory (e.g. a zipped folder)."""
    files = [_strip_dot_prefix(n) for n in names if n and not n.endswith("/")]
    if not files or any("/" not in f for f in files):
        return False
    return len({f.split("/", 1)[0] for f in files}) == 1


def extract_zip(data: BinaryIO, dest: Path, max_total: int, max_files: int) -> ExtractionResult:
    try:
        archive = zipfile.ZipFile(data)
    except zipfile.BadZipFile as exc:
        raise InvalidInputError("Upload is not a valid ZIP archive.") from exc
    with archive:
        infos = archive.infolist()
        if len(infos) > max_files:
            raise PayloadTooLargeError(f"Archive contains more than {max_files} entries.")
        strip = _common_root([i.filename for i in infos])
        budget = _Budget(max_total, max_files)
        result = ExtractionResult(total_entries=len(infos))
        for info in infos:
            if info.is_dir():
                continue
            mode = info.external_attr >> 16
            if stat.S_ISLNK(mode) or info.flag_bits & 0x1:
                result.skipped_unsafe += 1
                continue
            rel = safe_member_path(info.filename, strip)
            if rel is None:
                result.skipped_unsafe += 1
                continue
            if not _wanted(rel):
                continue
            if info.file_size > MAX_ENTRY_BYTES:
                result.skipped_large += 1
                continue
            with archive.open(info) as src:
                if _write_limited(src, dest / rel, budget):
                    result.extracted.append(rel)
                else:
                    result.skipped_large += 1
    return _finish(result)


def extract_tar_gz(data: BinaryIO, dest: Path, max_total: int, max_files: int) -> ExtractionResult:
    try:
        archive = tarfile.open(fileobj=data, mode="r:gz")
    except (tarfile.TarError, OSError) as exc:
        raise IngestionFormatError() from exc
    with archive:
        budget = _Budget(max_total, max_files)
        result = ExtractionResult()
        for member in _iter_members(archive, max_files):
            result.total_entries += 1
            if member.isdir() or member.name == "pax_global_header":
                continue
            if not member.isreg():
                result.skipped_unsafe += 1
                continue
            rel = safe_member_path(member.name, strip_root=True)
            if rel is None:
                result.skipped_unsafe += 1
                continue
            if not _wanted(rel):
                continue
            if member.size > MAX_ENTRY_BYTES:
                result.skipped_large += 1
                continue
            src = archive.extractfile(member)
            if src is None:
                continue
            with src:
                if _write_limited(src, dest / rel, budget):
                    result.extracted.append(rel)
                else:
                    result.skipped_large += 1
    return _finish(result)


def _iter_members(archive: tarfile.TarFile, max_files: int) -> Iterator[tarfile.TarInfo]:
    for count, member in enumerate(archive, start=1):
        if count > max_files:
            raise PayloadTooLargeError(f"Repository contains more than {max_files} entries.")
        yield member


def _finish(result: ExtractionResult) -> ExtractionResult:
    if not any(p.endswith(".sol") for p in result.extracted):
        raise UnsupportedRepositoryError("No Solidity (.sol) files were found in the repository.")
    result.extracted.sort()
    return result


def as_stream(data: bytes) -> BinaryIO:
    return io.BytesIO(data)
