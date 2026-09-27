"""Validates AI chain candidates against the knowledge graph.

Every contract, function, file, line range, and finding ID the model cites is
checked. Steps that cannot be grounded are dropped; chains that lose their
entry point, fall below two grounded steps, or have no valid break point are
rejected entirely. Surviving chains become ordinary drafts and are scored by
the same confidence rules as deterministic chains.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.chains.drafts import BreakPointDraft, ChainDraft, EvidenceRegistry, StepDraft
from app.chains.graph import FnKey, KnowledgeGraph, fmt
from app.models.domain import Finding, SourceLocation

STEP_TYPES = {"attacker_action", "contract_function", "state_change", "external_dependency", "vulnerability", "impact"}
SEVERITIES = {"critical", "high", "medium", "low", "informational"}
RELATIONSHIPS = {"chain", "related", "isolated", "unverified"}


@dataclass
class ValidationReport:
    drafts: list[ChainDraft] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)
    dropped_steps: int = 0
    relationships: dict[str, tuple[str, str]] = field(default_factory=dict)


def _text(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _texts(values, limit: int, count: int) -> list[str]:
    return [_text(v, limit) for v in (values or [])[:count] if isinstance(v, str) and v.strip()]


class CandidateValidator:
    def __init__(
        self, graph: KnowledgeGraph, findings: list[Finding], registry: EvidenceRegistry, excerpts: dict[str, list[tuple[int, int]]]
    ) -> None:
        self.graph = graph
        self.findings = {f.id: f for f in findings}
        self.registry = registry
        self.excerpts = excerpts

    def _key(self, contract, function) -> FnKey | None:
        if not isinstance(contract, str) or contract not in self.graph.contracts:
            return None
        if not isinstance(function, str) or not function:
            return None
        return self.graph.resolve(contract, function)

    def _location(self, item: dict, key: FnKey | None) -> SourceLocation | None:
        contract = self.graph.contracts.get(item.get("contract") or "")
        file, start, end = item.get("file"), item.get("lineStart"), item.get("lineEnd")
        if contract is None or file != contract.file or not isinstance(start, int) or not isinstance(end, int):
            return None
        if start < 1 or end < start:
            return None
        if not any(lo <= start and end <= hi for lo, hi in self.excerpts.get(file, [])):
            return None
        if key is not None:
            fn = self.graph.functions[key]
            owner = self.graph.contracts[key[0]]
            if owner.file == file and not (fn.line_start <= start and end <= fn.line_end):
                return None
        elif not (contract.line_start <= start and end <= contract.line_end):
            return None
        return SourceLocation(file=file, line_start=start, line_end=end)

    def _step(self, raw: dict) -> StepDraft | None:
        if not isinstance(raw, dict) or raw.get("type") not in STEP_TYPES:
            return None
        key = self._key(raw.get("contract"), raw.get("function"))
        if raw.get("function") and key is None:
            return None
        location = self._location(raw, key)
        if location is None:
            return None
        finding_ids = [fid for fid in raw.get("findingIds") or [] if fid in self.findings]
        evidence = [ev for fid in finding_ids for ev in self.findings[fid].evidence_references]
        evidence.append(
            self.registry.add(
                type="ai_reasoning",
                key=f"ai:{location.file}:{location.line_start}-{location.line_end}:{_text(raw.get('title'), 120)}",
                location=location,
                contract=raw.get("contract"),
                function=key[1] if key else None,
                description=_text(raw.get("reason"), 400) or "AI-proposed step grounded in the cited source range.",
                source="ai",
                status="partial",
            )
        )
        return StepDraft(
            type=raw["type"],
            title=_text(raw.get("title"), 120) or "Step",
            key=key,
            location=location,
            description=_text(raw.get("description"), 400),
            reason=_text(raw.get("reason"), 400),
            finding_ids=finding_ids,
            evidence=evidence,
            assumptions=_texts(raw.get("assumptions"), 240, 4),
            confidence=0.6,
        )

    def _chain(self, raw: dict, report: ValidationReport) -> ChainDraft | None:
        entry_raw = raw.get("entryPoint") or {}
        entry = self._key(entry_raw.get("contract"), entry_raw.get("function"))
        if entry is None or not self.graph.is_entry(entry):
            report.rejected.append(f"{_text(raw.get('title'), 80)}: entry point is not an externally callable function")
            return None

        steps: list[StepDraft] = []
        index_map: dict[int, int] = {}
        for i, raw_step in enumerate((raw.get("steps") or [])[:12]):
            step = self._step(raw_step)
            if step is None:
                report.dropped_steps += 1
                continue
            index_map[i] = len(steps)
            steps.append(step)
        if len(steps) < 2:
            report.rejected.append(f"{_text(raw.get('title'), 80)}: fewer than two steps could be grounded in source")
            return None

        unreachable = [
            s for s in steps if s.key and s.key != entry and not self.graph.is_entry(s.key) and self.graph.path(entry, {s.key}) is None
        ]
        if len(unreachable) == len([s for s in steps if s.key and s.key != entry]) and unreachable:
            report.rejected.append(f"{_text(raw.get('title'), 80)}: no step is reachable from {fmt(entry)}")
            return None

        break_points: list[BreakPointDraft] = []
        for raw_bp in (raw.get("breakPoints") or [])[:4]:
            if not isinstance(raw_bp, dict):
                continue
            key = self._key(raw_bp.get("contract"), raw_bp.get("function"))
            location = self._location(raw_bp, key)
            if key is None or location is None:
                continue
            indexes = [index_map[i] for i in raw_bp.get("affectedStepIndexes") or [] if isinstance(i, int) and i in index_map]
            break_points.append(
                BreakPointDraft(
                    title=_text(raw_bp.get("title"), 120) or f"Harden {fmt(key)}",
                    key=key,
                    location=location,
                    recommendation=_text(raw_bp.get("recommendation"), 400),
                    rationale=_text(raw_bp.get("rationale"), 400),
                    step_indexes=indexes or list(range(len(steps))),
                    confidence=0.55,
                )
            )
        if not break_points:
            report.rejected.append(f"{_text(raw.get('title'), 80)}: no break point could be located")
            return None

        related = [fid for fid in raw.get("relatedFindingIds") or [] if fid in self.findings]
        core = {fid for s in steps for fid in s.finding_ids} | set(related)
        title = _text(raw.get("title"), 120)
        if not title.lower().startswith("potential"):
            title = f"Potential {title[:1].lower()}{title[1:]}" if title else "Potential attack chain"
        severity = raw.get("severity") if raw.get("severity") in SEVERITIES else None

        egress = [e for s in steps if s.key for e in self.graph.egress(s.key)]
        return ChainDraft(
            pattern="ai",
            origin="ai",
            title=title,
            summary=_text(raw.get("summary"), 600),
            entry=entry,
            preconditions=_texts(raw.get("preconditions"), 240, 6),
            steps=steps,
            impact_summary=_text(raw.get("impact"), 400) or "Impact not specified.",
            assets=_texts(raw.get("assetsAtRisk"), 120, 5) or ([egress[0].asset] if egress else []),
            core_findings=[self.findings[fid] for fid in sorted(core)],
            break_points=break_points,
            assumptions=_texts(raw.get("assumptions"), 240, 6),
            limitations=[f"{len(unreachable)} step(s) have no resolved call path from {fmt(entry)}."] if unreachable else [],
            severity_hint=severity,
        )

    def validate(self, candidates: dict) -> ValidationReport:
        report = ValidationReport()
        for raw in (candidates.get("chains") or [])[:8]:
            if isinstance(raw, dict):
                draft = self._chain(raw, report)
                if draft:
                    report.drafts.append(draft)
        for rel in candidates.get("findingRelationships") or []:
            if isinstance(rel, dict) and rel.get("findingId") in self.findings and rel.get("relationship") in RELATIONSHIPS:
                report.relationships[rel["findingId"]] = (rel["relationship"], _text(rel.get("reason"), 300))
        return report
