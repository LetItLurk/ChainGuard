"""Decide which extracted Solidity files are in analysis scope."""

from __future__ import annotations

from dataclasses import dataclass

_EXCLUDED_DIRS = {"node_modules", "lib", "test", "tests", "script", "scripts", "mocks", "mock", "forge-std", ".git"}
_EXCLUDED_SUFFIXES = (".t.sol", ".s.sol")


@dataclass(frozen=True)
class Discovery:
    in_scope: list[str]
    out_of_scope: list[str]


def discover_solidity(files: list[str], limit: int) -> Discovery:
    in_scope: list[str] = []
    out: list[str] = []
    for path in sorted(files):
        if not path.endswith(".sol"):
            continue
        dirs = path.split("/")[:-1]
        if path.endswith(_EXCLUDED_SUFFIXES) or any(d.lower() in _EXCLUDED_DIRS for d in dirs):
            out.append(path)
        else:
            in_scope.append(path)
    if not in_scope and out:
        in_scope, out = out, []
    return Discovery(in_scope=in_scope[:limit], out_of_scope=out + in_scope[limit:])
