"""Intermediate chain representation shared by deterministic patterns and AI candidates.

Drafts reference graph nodes by (contract, function) so confidence scoring
and finalization can verify every claim against the knowledge graph.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Literal

from app.chains.graph import FnKey, KnowledgeGraph, fmt
from app.models.domain import (
    AttackStepType,
    ConfidenceCheck,
    Evidence,
    EvidenceOrigin,
    EvidenceType,
    Finding,
    SourceLocation,
    SupportLevel,
    VerificationStatus,
)


@dataclass
class StepDraft:
    type: AttackStepType
    title: str
    key: FnKey | None
    location: SourceLocation | None
    description: str
    reason: str
    finding_ids: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)
    confidence: float = 0.75


@dataclass
class BreakPointDraft:
    title: str
    key: FnKey
    location: SourceLocation
    recommendation: str
    rationale: str
    step_indexes: list[int]
    confidence: float


@dataclass
class StateLink:
    contract: str
    variable: str
    writer: FnKey
    reader: FnKey


@dataclass
class ChainDraft:
    pattern: str
    origin: Literal["deterministic", "ai"]
    title: str
    summary: str
    entry: FnKey
    preconditions: list[str]
    steps: list[StepDraft]
    impact_summary: str
    assets: list[str]
    core_findings: list[Finding]
    break_points: list[BreakPointDraft]
    state_link: StateLink | None = None
    assumptions: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    severity_hint: str | None = None

    @property
    def finding_ids(self) -> list[str]:
        ids = {f.id for f in self.core_findings}
        for step in self.steps:
            ids.update(step.finding_ids)
        return sorted(ids)

    @property
    def signature(self) -> tuple[FnKey, frozenset[str]]:
        return (self.entry, frozenset(self.finding_ids))


class EvidenceRegistry:
    def __init__(self, existing: list[Evidence]) -> None:
        self.items: dict[str, Evidence] = {e.id: e for e in existing}

    def add(
        self,
        *,
        type: EvidenceType,
        key: str,
        location: SourceLocation | None,
        contract: str | None,
        function: str | None,
        description: str,
        source: EvidenceOrigin = "mapper",
        status: VerificationStatus = "verified",
    ) -> str:
        evidence_id = f"EV-{hashlib.sha1(key.encode()).hexdigest()[:10]}"
        if evidence_id not in self.items:
            self.items[evidence_id] = Evidence(
                id=evidence_id,
                type=type,
                source_file=location.file if location else None,
                contract=contract,
                function=function,
                line_start=location.line_start if location else None,
                line_end=location.line_end if location else None,
                description=description[:400],
                source=source,
                verification_status=status,
            )
        return evidence_id

    def all(self) -> list[Evidence]:
        return list(self.items.values())


RUNTIME_CHECK = ConfidenceCheck(
    label="Runtime exploit confirmed", status="unavailable", detail="No transaction simulation was performed."
)
_WEIGHTS = {"sources": 0.2, "exist": 0.15, "calls": 0.25, "state": 0.2, "detector": 0.2}


def location_in_map(graph: KnowledgeGraph, location: SourceLocation | None) -> bool:
    if location is None or location.line_end < location.line_start:
        return False
    return any(
        c.file == location.file and c.line_start <= location.line_start and location.line_end <= c.line_end
        for c in graph.contracts.values()
    )


def evaluate(draft: ChainDraft, graph: KnowledgeGraph) -> tuple[list[ConfidenceCheck], float, SupportLevel]:
    results: list[tuple[str, ConfidenceCheck]] = []

    located = all(location_in_map(graph, s.location) for s in draft.steps)
    results.append(("sources", ConfidenceCheck(label="Source code located for every step", status="met" if located else "unmet",
                                               detail=None if located else "One or more steps cite lines outside mapped contracts.")))

    missing = sorted({fmt(s.key) for s in draft.steps if s.key and s.key not in graph.functions})
    results.append(("exist", ConfidenceCheck(label="Referenced contracts and functions exist", status="unmet" if missing else "met",
                                             detail=f"Not found: {', '.join(missing)}" if missing else None)))

    step_keys = [s.key for s in draft.steps if s.key and s.key != draft.entry and s.key in graph.functions]
    unlinked = sorted({fmt(k) for k in step_keys if not graph.is_entry(k) and graph.path(draft.entry, {k}) is None})
    reached = [fmt(k) for k in dict.fromkeys(step_keys) if graph.path(draft.entry, {k})]
    results.append((
        "calls",
        ConfidenceCheck(
            label=f"Call graph connects {fmt(draft.entry)} to every step",
            status="unmet" if unlinked else "met",
            detail=f"No call path to {', '.join(unlinked)}" if unlinked else (
                f"{fmt(draft.entry)} → {' → '.join(reached)}" if reached else "Steps are directly callable entry points"
            ),
        ),
    ))

    if draft.state_link:
        link = draft.state_link
        writer = graph.functions.get(link.writer)
        written = writer is not None and link.variable in writer.state_writes
        read = any(link.variable in graph.functions[k].state_reads for k in graph.readers.get((link.contract, link.variable), set()))
        ok = written and read
        results.append((
            "state",
            ConfidenceCheck(
                label="State dependency confirmed",
                status="met" if ok else "unmet",
                detail=f"`{link.variable}` written by {fmt(link.writer)}, read by {fmt(link.reader)}" if ok
                else f"Could not confirm reads and writes of `{link.variable}`.",
            ),
        ))

    detectors = sorted({f.detector.removeprefix("slither:") for f in draft.core_findings if f.detector and f.detector.startswith("slither:")})
    results.append((
        "detector",
        ConfidenceCheck(
            label="Static detector flags the core issue",
            status="met" if detectors else "unmet",
            detail=", ".join(detectors) if detectors else "Supported by ChainGuard heuristics only; no Slither detector reports the core issue.",
        ),
    ))

    checks = [c for _, c in results] + [RUNTIME_CHECK]
    applicable = sum(_WEIGHTS[k] for k, _ in results)
    met = sum(_WEIGHTS[k] for k, c in results if c.status == "met")
    ratio = met / applicable if applicable else 0.0
    finding_conf = sum(f.confidence for f in draft.core_findings) / len(draft.core_findings) if draft.core_findings else 0.4
    score = 0.15 + 0.6 * ratio + 0.15 * finding_conf - (0.05 if draft.origin == "ai" else 0.0)
    if not located or missing:
        score = min(score, 0.45)
    score = round(max(0.05, min(0.9, score)), 2)
    level: SupportLevel = "strong" if score >= 0.75 else "moderate" if score >= 0.55 else "weak"
    return checks, score, level
