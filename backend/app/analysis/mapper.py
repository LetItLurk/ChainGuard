"""Deterministic repository map.

Primary source is Slither's compiled view (accurate calls, state access,
modifiers). Files Slither could not compile fall back to a lexical parser so
they still appear in the map, flagged by a diagnostic.
"""

from __future__ import annotations

import posixpath
import re
from dataclasses import dataclass, field
from pathlib import Path

from app.models.domain import (
    Contract,
    ContractFunction,
    ContractRelationship,
    ExternalCall,
    OracleDependency,
    RepositoryMap,
    TrustBoundary,
)

ORACLE_FUNCTIONS = re.compile(
    r"^(getPrice|price|latestAnswer|latestRoundData|getRoundData|consult|observe|getReserves|slot0|getRate|"
    r"getAmountsOut|getAmountOut|quote|peek|read|getUnderlyingPrice|getAssetPrice|pricePerShare|getPricePerFullShare)$"
)
SPOT_PRICE_FUNCTIONS = {"getReserves", "slot0", "getAmountsOut", "getAmountOut"}
VALUE_TRANSFER_KINDS = {"low_level_call", "transfer", "send"}

_IMPORT = re.compile(r"""import\s+(?:[^'"]*?from\s+)?["']([^"']+)["']""")
_CONTRACT = re.compile(r"\b(abstract\s+contract|contract|interface|library)\s+([A-Za-z_]\w*)[^{;]*\{")
_FUNCTION = re.compile(r"\b(function\s+([A-Za-z_]\w*)|constructor|receive|fallback)\s*\(([^)]*)\)([^{;]*)([{;])")


@dataclass
class MapResult:
    repository_map: RepositoryMap
    state_types: dict[str, dict[str, str]] = field(default_factory=dict)
    internal_calls: dict[tuple[str, str], list[str]] = field(default_factory=dict)
    lexical_files: list[str] = field(default_factory=list)
    call_names: dict[tuple[str, str, int, str], str] = field(default_factory=dict)

    def reaches(self, contract: str, function: str, targets: set[str]) -> str | None:
        """First function in `targets` reachable from contract.function via internal calls."""
        stack, seen = [function], set()
        while stack:
            current = stack.pop()
            if current in targets and current != function:
                return current
            if current in seen:
                continue
            seen.add(current)
            stack.extend(self.internal_calls.get((contract, current), []))
        return None


def _file_imports(repo: Path, rel: str) -> list[str]:
    text = (repo / rel).read_text(encoding="utf-8", errors="replace")
    base = posixpath.dirname(rel)
    return sorted(
        {
            posixpath.normpath(posixpath.join(base, target)) if target.startswith(".") else target
            for target in _IMPORT.findall(text)
        }
    )


def _blank_comments_and_strings(src: str) -> str:
    def blank(match: re.Match[str]) -> str:
        return re.sub(r"[^\n]", " ", match[0])

    return re.sub(r"//[^\n]*|/\*.*?\*/|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'", blank, src, flags=re.S)


def _match_brace(src: str, open_index: int) -> int:
    depth = 0
    for i in range(open_index, len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    return len(src) - 1


def _line(src: str, index: int) -> int:
    return src.count("\n", 0, index) + 1


def lexical_contracts(repo: Path, rel: str) -> list[Contract]:
    src = _blank_comments_and_strings((repo / rel).read_text(encoding="utf-8", errors="replace"))
    imports = _file_imports(repo, rel)
    contracts: list[Contract] = []
    for match in _CONTRACT.finditer(src):
        open_i = match.end() - 1
        close_i = _match_brace(src, open_i)
        body_start = open_i
        kind_raw = match[1].split()[0]
        kind = "abstract" if kind_raw == "abstract" else kind_raw
        functions: list[ContractFunction] = []
        for fn in _FUNCTION.finditer(src, body_start, close_i):
            header = fn[4]
            name = fn[2] or fn[1]
            end_i = _match_brace(src, fn.end() - 1) if fn[5] == "{" else fn.end()
            visibility = next((v for v in ("external", "public", "internal", "private") if re.search(rf"\b{v}\b", header)), "public")
            mutability = next((m for m in ("pure", "view", "payable") if re.search(rf"\b{m}\b", header)), "nonpayable")
            modifiers = [
                m for m in re.findall(r"\b([A-Za-z_]\w*)\b", header)
                if m not in {"external", "public", "internal", "private", "pure", "view", "payable", "virtual",
                             "override", "returns", "memory", "calldata", "storage", "uint256", "address", "bool"}
                and not m[0].isdigit()
            ]
            functions.append(
                ContractFunction(
                    name=name,
                    visibility=visibility,
                    mutability=mutability,
                    modifiers=modifiers[:6],
                    privileged=any(re.match(r"only|auth", m, re.I) for m in modifiers),
                    line_start=_line(src, fn.start()),
                    line_end=_line(src, end_i),
                )
            )
        contracts.append(
            Contract(
                name=match[2],
                kind=kind,
                file=rel,
                line_start=_line(src, match.start()),
                line_end=_line(src, close_i),
                imports=imports,
                functions=functions,
            )
        )
    return contracts


def _from_slither(raw: dict, imports: list[str]) -> Contract:
    return Contract(
        name=raw["name"],
        kind=raw["kind"],
        file=raw["file"],
        line_start=raw["lineStart"],
        line_end=raw["lineEnd"],
        imports=imports,
        state_variables=raw["stateVariables"],
        functions=[
            ContractFunction(
                name=f["name"],
                visibility=f["visibility"],
                mutability=f["mutability"],
                modifiers=f["modifiers"],
                privileged=f["privileged"],
                line_start=f["lineStart"],
                line_end=f["lineEnd"],
                external_calls=[
                    ExternalCall(target=c["target"], kind=c["kind"], line=c["line"]) for c in f["externalCalls"]
                ],
                state_reads=f["stateReads"],
                state_writes=f["stateWrites"],
            )
            for f in raw["functions"]
        ],
    )


CallKey = tuple[str, str, int, str]


def call_function_names(raw_contracts: list[dict]) -> dict[CallKey, str]:
    """(contract, function, line, target) -> called function name, from worker output."""
    names: dict[CallKey, str] = {}
    for c in raw_contracts:
        for f in c["functions"]:
            for call in f["externalCalls"]:
                names[(c["name"], f["name"], call["line"], call["target"])] = call.get("function", "")
    return names


def build_map(repo: Path, files: list[str], raw_contracts: list[dict]) -> MapResult:
    contracts: list[Contract] = []
    state_types: dict[str, dict[str, str]] = {}
    compiled_files = {c["file"] for c in raw_contracts}
    imports_cache = {rel: _file_imports(repo, rel) for rel in files}

    internal_calls: dict[tuple[str, str], list[str]] = {}
    for raw in raw_contracts:
        contracts.append(_from_slither(raw, imports_cache.get(raw["file"], [])))
        state_types[raw["name"]] = raw.get("stateVariableTypes", {})
        for f in raw["functions"]:
            internal_calls[(raw["name"], f["name"])] = f.get("internalCalls", [])

    lexical_files = [rel for rel in files if rel not in compiled_files]
    for rel in lexical_files:
        contracts.extend(lexical_contracts(repo, rel))

    known = {c.name for c in contracts}
    called = call_function_names(raw_contracts)
    relationships: set[tuple[str, str, str]] = set()
    oracle_deps: list[OracleDependency] = []

    for raw in raw_contracts:
        for parent in raw["inherits"]:
            if parent in known:
                relationships.add((raw["name"], parent, "inherits"))

    for contract in contracts:
        for fn in contract.functions:
            for call in fn.external_calls:
                if call.kind != "contract_call" or call.target not in known or call.target == contract.name:
                    continue
                callee = called.get((contract.name, fn.name, call.line, call.target), "")
                if ORACLE_FUNCTIONS.match(callee):
                    oracle_deps.append(
                        OracleDependency(contract=contract.name, function=fn.name, target=f"{call.target}.{callee}", line=call.line)
                    )
                    relationships.add((contract.name, call.target, "reads_oracle"))
                else:
                    relationships.add((contract.name, call.target, "calls"))

    repository_map = RepositoryMap(
        contracts=contracts,
        relationships=[ContractRelationship(**{"from": a, "to": b, "kind": k}) for a, b, k in sorted(relationships)],
        oracle_dependencies=oracle_deps,
        trust_boundaries=_trust_boundaries(contracts, oracle_deps),
    )
    return MapResult(repository_map, state_types, internal_calls, lexical_files, called)


def _trust_boundaries(contracts: list[Contract], oracle_deps: list[OracleDependency]) -> list[TrustBoundary]:
    implementations = [c for c in contracts if c.kind in ("contract", "abstract")]
    public_mutating = [
        c.name for c in implementations
        if any(f.visibility in ("public", "external") and f.mutability in ("nonpayable", "payable")
               and not f.privileged and f.name != "constructor" for f in c.functions)
    ]
    privileged = [c.name for c in implementations if any(f.privileged for f in c.functions)]
    value_senders = [
        c.name for c in implementations
        if any(call.kind in VALUE_TRANSFER_KINDS for f in c.functions for call in f.external_calls)
    ]
    oracle_consumers = sorted({d.contract for d in oracle_deps})

    boundaries = [
        ("tb-untrusted-callers", "Any account can call these state-changing entry points", public_mutating),
        ("tb-privileged-roles", "Privileged roles gate configuration or fund movement", privileged),
        ("tb-external-prices", "Prices or rates are read from other contracts", oracle_consumers),
        ("tb-value-egress", "ETH or tokens leave the system through external calls", value_senders),
    ]
    return [TrustBoundary(id=i, description=d, contracts=sorted(set(cs))) for i, d, cs in boundaries if cs]
