"""Isolated Slither process. Invoked as:

    python -m app.analysis.slither_worker <repo_dir> <request.json> <result.json>

The parent process enforces the timeout. This module compiles each root
Solidity file (files not imported by another in-scope file), extracts a
structural map plus raw detector results, and writes JSON. Slither only
parses and compiles source; repository code is never executed.
"""

from __future__ import annotations

import json
import posixpath
import re
import sys
import traceback
from pathlib import Path
from typing import Any

_IMPORT = re.compile(r"""import\s+(?:[^'"]*?from\s+)?["']([^"']+)["']""")
_PRIV_MODIFIER = re.compile(r"^(only|auth|requires?auth|isauthorized|restricted)|owner|admin|role|governance|guardian", re.I)
_PRIV_CALL = re.compile(r"^_(check|require)(Owner|Role|Admin|Auth)", re.I)
_SENDER_CHECK = re.compile(r"msg\.sender\s*==|==\s*msg\.sender|msg\.sender\s*!=|!=\s*msg\.sender")


def _root_files(repo: Path, files: list[str]) -> list[str]:
    imported: set[str] = set()
    for rel in files:
        text = (repo / rel).read_text(encoding="utf-8", errors="replace")
        base = posixpath.dirname(rel)
        for target in _IMPORT.findall(text):
            if target.startswith("."):
                imported.add(posixpath.normpath(posixpath.join(base, target)))
            else:
                imported.add(posixpath.normpath(target))
    roots = [f for f in files if f not in imported]
    return roots or files


def _lines(obj: Any) -> tuple[int, int]:
    lines = obj.source_mapping.lines
    return (lines[0], lines[-1]) if lines else (1, 1)


def _rel(repo: Path, obj: Any) -> str:
    filename = obj.source_mapping.filename
    absolute = Path(filename.absolute)
    try:
        return absolute.resolve().relative_to(repo.resolve()).as_posix()
    except ValueError:
        return filename.relative


def _privileged(fn: Any) -> bool:
    if any(_PRIV_MODIFIER.search(m.name) for m in fn.modifiers):
        return True
    for call in fn.internal_calls:
        callee = getattr(call, "function", None)
        if callee is not None and _PRIV_CALL.search(getattr(callee, "name", "")):
            return True
    for node in fn.nodes:
        # contains_require_or_assert / contains_if API varies across Slither versions.
        has_check = (
            getattr(node, "contains_require_or_assert", lambda: False)()
            or getattr(node, "contains_if", lambda: False)()
        )
        if has_check and _SENDER_CHECK.search(str(getattr(node, "expression", ""))):
            return True
    return False


def _external_calls(fn: Any) -> list[dict]:
    from slither.slithir.operations import HighLevelCall, LowLevelCall, Send, Transfer

    calls: list[dict] = []
    for node in fn.nodes:
        line = node.source_mapping.lines[0] if node.source_mapping.lines else _lines(fn)[0]
        for ir in node.irs:
            if isinstance(ir, LowLevelCall):
                kind = "delegatecall" if ir.function_name == "delegatecall" else "low_level_call"
                calls.append({"target": str(ir.destination), "kind": kind, "line": line, "function": ir.function_name})
            elif isinstance(ir, Transfer):
                calls.append({"target": str(ir.destination), "kind": "transfer", "line": line, "function": "transfer"})
            elif isinstance(ir, Send):
                calls.append({"target": str(ir.destination), "kind": "send", "line": line, "function": "send"})
            elif isinstance(ir, HighLevelCall):
                dest_type = getattr(ir.destination, "type", None)
                target = getattr(getattr(dest_type, "type", None), "name", None) or str(ir.destination)
                calls.append(
                    {"target": target, "kind": "contract_call", "line": line, "function": str(ir.function_name)}
                )
    return calls


def _internal_calls(fn: Any) -> list[str]:
    try:
        from slither.core.declarations import Function as SlitherFunction
        fn_type: type = SlitherFunction
    except ImportError:
        fn_type = type(None)

    names: set[str] = set()
    for call in fn.internal_calls:
        callee = getattr(call, "function", call)
        name = getattr(callee, "name", None)
        if name and isinstance(callee, fn_type) and not name.startswith("slither"):
            names.add(name)
    return sorted(names)


def _map_contract(repo: Path, contract: Any) -> dict:
    kind = "interface" if contract.is_interface else "library" if contract.is_library else (
        "abstract" if getattr(contract, "is_abstract", False) else "contract"
    )
    start, end = _lines(contract)
    functions = []
    for fn in contract.functions_and_modifiers_declared:
        if fn.name.startswith("slitherConstructor") or not hasattr(fn, "visibility"):
            continue
        if type(fn).__name__.startswith("Modifier"):
            continue
        f_start, f_end = _lines(fn)
        mutability = "pure" if fn.pure else "view" if fn.view else "payable" if fn.payable else "nonpayable"
        name = "constructor" if fn.is_constructor else fn.name
        functions.append(
            {
                "name": name,
                "visibility": fn.visibility if fn.visibility in ("public", "external", "internal", "private") else "public",
                "mutability": mutability,
                "modifiers": [m.name for m in fn.modifiers],
                "privileged": _privileged(fn),
                "lineStart": f_start,
                "lineEnd": f_end,
                "externalCalls": _external_calls(fn),
                "stateReads": sorted({v.name for v in fn.state_variables_read}),
                "stateWrites": sorted({v.name for v in fn.state_variables_written}),
                "internalCalls": _internal_calls(fn),
            }
        )
    return {
        "name": contract.name,
        "kind": kind,
        "file": _rel(repo, contract),
        "lineStart": start,
        "lineEnd": end,
        "inherits": [p.name for p in contract.immediate_inheritance],
        "stateVariables": [v.name for v in contract.state_variables_declared],
        "stateVariableTypes": {v.name: str(v.type) for v in contract.state_variables_declared},
        "functions": functions,
    }


def _run_detectors(slither: Any) -> list[dict]:
    from slither.detectors import all_detectors
    from slither.detectors.abstract_detector import AbstractDetector

    for name in dir(all_detectors):
        detector = getattr(all_detectors, name)
        if isinstance(detector, type) and issubclass(detector, AbstractDetector) and detector is not AbstractDetector:
            slither.register_detector(detector)
    results: list[dict] = []
    for batch in slither.run_detectors():
        results.extend(batch)
    return results


def main(repo_arg: str, request_arg: str, result_arg: str) -> None:
    from slither import Slither

    from app.analysis.solc import pragma_constraint, select_solc

    repo = Path(repo_arg).resolve()
    request = json.loads(Path(request_arg).read_text())
    files: list[str] = request["files"]
    remaps: str | None = request.get("remappings")

    contracts: dict[str, dict] = {}
    detectors: dict[str, dict] = {}
    covered: set[str] = set()
    errors: list[str] = []

    for rel in _root_files(repo, files):
        if rel in covered:
            continue
        constraint = pragma_constraint((repo / rel).read_text(encoding="utf-8", errors="replace"))
        solc = select_solc([constraint] if constraint else [])
        if solc is None:
            errors.append(f"{rel}: no installed solc satisfies pragma '{constraint}'")
            continue
        try:
            kwargs: dict[str, Any] = {
                "compile_force_framework": "solc",
                "solc": solc,
                "solc_working_dir": str(repo),
                "solc_args": f"--allow-paths {repo}",
            }
            if remaps:
                kwargs["solc_remaps"] = remaps
            slither = Slither(str(repo / rel), **kwargs)
        except Exception as exc:  # noqa: BLE001 - surfaced as a diagnostic
            errors.append(f"{rel}: compilation failed ({type(exc).__name__}: {str(exc).strip()[:300]})")
            continue

        for contract in slither.contracts:
            file = _rel(repo, contract)
            covered.add(file)
            key = f"{file}:{contract.name}"
            if key not in contracts and file in files:
                contracts[key] = _map_contract(repo, contract)
        try:
            for result in _run_detectors(slither):
                detectors.setdefault(result.get("id") or json.dumps(result, sort_keys=True)[:200], result)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{rel}: detectors failed ({type(exc).__name__})")

    Path(result_arg).write_text(
        json.dumps(
            {"contracts": list(contracts.values()), "detectors": list(detectors.values()), "errors": errors},
            default=str,
        )
    )


if __name__ == "__main__":
    try:
        main(*sys.argv[1:4])
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        sys.exit(2)
