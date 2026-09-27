"""Pick an installed solc binary satisfying a file's `pragma solidity` constraint.

Binaries come from solc-select's artifact directory. No version is ever
downloaded at analysis time; unsatisfied pragmas become diagnostics.
"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path

Version = tuple[int, int, int]

_PRAGMA = re.compile(r"pragma\s+solidity\s+([^;]+);")
_TERM = re.compile(r"(\^|~|>=|<=|>|<|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?")


def _artifacts_dir() -> Path:
    base = os.environ.get("VIRTUAL_ENV_SOLC") or os.environ.get("SOLC_SELECT_DIR")
    return Path(base) if base else Path.home() / ".solc-select" / "artifacts"


@lru_cache
def installed_versions() -> dict[Version, str]:
    found: dict[Version, str] = {}
    root = _artifacts_dir()
    if not root.is_dir():
        return found
    for entry in root.iterdir():
        match = re.fullmatch(r"solc-(\d+)\.(\d+)\.(\d+)", entry.name)
        binary = entry / entry.name
        if match and binary.is_file():
            found[(int(match[1]), int(match[2]), int(match[3]))] = str(binary)
    return found


def _satisfies(version: Version, op: str, target: Version) -> bool:
    if op == "^":
        upper = (target[0], target[1] + 1, 0) if target[0] == 0 else (target[0] + 1, 0, 0)
        return target <= version < upper
    if op == "~":
        return target <= version < (target[0], target[1] + 1, 0)
    return {
        ">=": version >= target,
        "<=": version <= target,
        ">": version > target,
        "<": version < target,
        "=": version == target,
        "": version == target,
    }[op]


def _matches(version: Version, constraint: str) -> bool:
    for alternative in constraint.split("||"):
        terms = _TERM.findall(alternative)
        if terms and all(
            _satisfies(version, op or "", (int(a), int(b or 0), int(c or 0))) for op, a, b, c in terms
        ):
            return True
    return False


def pragma_constraint(source: str) -> str | None:
    match = _PRAGMA.search(source)
    return match[1].strip() if match else None


def select_solc(constraints: list[str]) -> str | None:
    """Return the newest installed solc satisfying every constraint."""
    candidates = sorted(installed_versions().items(), reverse=True)
    for version, binary in candidates:
        if all(_matches(version, c) for c in constraints):
            return binary
    return None
