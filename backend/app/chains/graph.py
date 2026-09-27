"""Function-level knowledge graph built from the deterministic repository map.

Nodes are (contract, function) pairs. Edges are internal calls (including
inherited functions) and resolved cross-contract calls. State access and
value egress are indexed so chain patterns can ask precise questions:
"who writes X", "who reads X", "which entry points reach F", "where does
value leave the system".
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Literal

from app.analysis.mapper import VALUE_TRANSFER_KINDS, MapResult
from app.models.domain import Contract, ContractFunction, Finding, SourceLocation

FnKey = tuple[str, str]
TOKEN_EGRESS_FUNCTIONS = {"transfer", "transferFrom", "safeTransfer", "safeTransferFrom", "mint", "sendValue"}
NON_ENTRY_FUNCTIONS = {"constructor"}


@dataclass(frozen=True)
class Edge:
    source: FnKey
    target: FnKey
    kind: Literal["internal", "external"]
    line: int | None


@dataclass(frozen=True)
class Egress:
    fn: FnKey
    line: int
    kind: str
    target: str
    callee: str

    @property
    def asset(self) -> str:
        holder = self.fn[0]
        if self.kind in VALUE_TRANSFER_KINDS:
            return f"ETH held by {holder}"
        return f"{self.target} balance held by {holder}"


def fmt(key: FnKey) -> str:
    return f"{key[0]}.{key[1]}"


class KnowledgeGraph:
    def __init__(self, mapped: MapResult, findings: list[Finding]) -> None:
        repo_map = mapped.repository_map
        self.contracts: dict[str, Contract] = {c.name: c for c in repo_map.contracts}
        self.functions: dict[FnKey, ContractFunction] = {}
        for contract in repo_map.contracts:
            for fn in contract.functions:
                self.functions.setdefault((contract.name, fn.name), fn)

        self.parents: dict[str, list[str]] = defaultdict(list)
        for rel in repo_map.relationships:
            if rel.kind == "inherits":
                self.parents[rel.from_].append(rel.to)

        self.oracle_readers: set[FnKey] = {(d.contract, d.function) for d in repo_map.oracle_dependencies}
        self.oracle_targets: set[FnKey] = set()
        for dep in repo_map.oracle_dependencies:
            target_contract, _, target_fn = dep.target.rpartition(".")
            self.oracle_targets.add((target_contract, target_fn))

        self.edges: dict[FnKey, list[Edge]] = defaultdict(list)
        for (contract, fn), callees in mapped.internal_calls.items():
            for callee in callees:
                resolved = self.resolve(contract, callee)
                if resolved and resolved != (contract, fn):
                    self._add_edge(Edge((contract, fn), resolved, "internal", None))

        self.egress_by_fn: dict[FnKey, list[Egress]] = defaultdict(list)
        self.readers: dict[tuple[str, str], set[FnKey]] = defaultdict(set)
        self.writers: dict[tuple[str, str], set[FnKey]] = defaultdict(set)
        for contract in repo_map.contracts:
            for fn in contract.functions:
                key = (contract.name, fn.name)
                for var in fn.state_reads:
                    self.readers[(contract.name, var)].add(key)
                for var in fn.state_writes:
                    self.writers[(contract.name, var)].add(key)
                for call in fn.external_calls:
                    callee = mapped.call_names.get((contract.name, fn.name, call.line, call.target), "")
                    if call.kind in VALUE_TRANSFER_KINDS or (
                        call.kind == "contract_call" and callee in TOKEN_EGRESS_FUNCTIONS
                    ):
                        self.egress_by_fn[key].append(Egress(key, call.line, call.kind, call.target, callee))
                    if call.kind == "contract_call" and call.target != contract.name:
                        target = self.resolve(call.target, callee)
                        if target:
                            self._add_edge(Edge(key, target, "external", call.line))

        self.findings_by_fn: dict[FnKey, list[Finding]] = defaultdict(list)
        for finding in findings:
            if finding.contract and finding.function:
                self.findings_by_fn[(finding.contract, finding.function)].append(finding)

    def _add_edge(self, edge: Edge) -> None:
        if edge not in self.edges[edge.source]:
            self.edges[edge.source].append(edge)

    def resolve(self, contract: str, function: str) -> FnKey | None:
        """Find `function` on `contract` or the nearest ancestor that declares it."""
        queue, seen = deque([contract]), set()
        while queue:
            current = queue.popleft()
            if current in seen:
                continue
            seen.add(current)
            if (current, function) in self.functions:
                return (current, function)
            queue.extend(self.parents.get(current, []))
        return None

    def contract_of(self, key: FnKey) -> Contract:
        return self.contracts[key[0]]

    def location(self, key: FnKey) -> SourceLocation:
        fn = self.functions[key]
        return SourceLocation(file=self.contract_of(key).file, line_start=fn.line_start, line_end=fn.line_end)

    def line_location(self, key: FnKey, line: int) -> SourceLocation:
        return SourceLocation(file=self.contract_of(key).file, line_start=line, line_end=line)

    def is_entry(self, key: FnKey) -> bool:
        fn = self.functions.get(key)
        if fn is None or key[1] in NON_ENTRY_FUNCTIONS:
            return False
        return (
            fn.visibility in ("public", "external")
            and fn.mutability in ("nonpayable", "payable")
            and not fn.privileged
            and self.contract_of(key).kind in ("contract", "abstract")
        )

    def path(self, start: FnKey, targets: set[FnKey], max_depth: int = 6) -> list[Edge] | None:
        """Shortest edge path from `start` to any target. Empty list when start is a target."""
        if start in targets:
            return []
        queue: deque[tuple[FnKey, list[Edge]]] = deque([(start, [])])
        seen = {start}
        while queue:
            node, trail = queue.popleft()
            if len(trail) >= max_depth:
                continue
            for edge in self.edges.get(node, []):
                if edge.target in seen:
                    continue
                next_trail = [*trail, edge]
                if edge.target in targets:
                    return next_trail
                seen.add(edge.target)
                queue.append((edge.target, next_trail))
        return None

    def entries_reaching(self, targets: set[FnKey], exclude: set[FnKey] = frozenset()) -> list[tuple[FnKey, list[Edge]]]:
        results = []
        for key in self.functions:
            if key in exclude or not self.is_entry(key):
                continue
            trail = self.path(key, targets)
            if trail is not None:
                results.append((key, trail))
        return sorted(results, key=lambda item: (len(item[1]), fmt(item[0])))

    def egress(self, key: FnKey) -> list[Egress]:
        """Value transfers performed by `key` or its same-contract internal callees."""
        found: list[Egress] = []
        stack, seen = [key], set()
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            found.extend(self.egress_by_fn.get(current, []))
            stack.extend(e.target for e in self.edges.get(current, []) if e.kind == "internal" and e.target[0] == key[0])
        return sorted(found, key=lambda e: (e.fn != key, e.line))

    def findings_on(self, key: FnKey, *categories: str) -> list[Finding]:
        found = self.findings_by_fn.get(key, [])
        return [f for f in found if not categories or f.category in categories]
