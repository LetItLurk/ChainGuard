"""Attack-chain construction: deterministic patterns plus validated AI candidates,
scored against the knowledge graph and linked back to findings."""

from __future__ import annotations

from dataclasses import dataclass

from app.analysis.mapper import MapResult
from app.chains import patterns
from app.chains.drafts import ChainDraft, EvidenceRegistry, evaluate
from app.chains.graph import KnowledgeGraph, fmt
from app.models.domain import (
    AttackChain,
    AttackStep,
    BreakPoint,
    BreakPointLocation,
    EntryPoint,
    Evidence,
    Finding,
    Impact,
    Severity,
)

SEVERITY_RANK: dict[str, int] = {"critical": 4, "high": 3, "medium": 2, "low": 1, "informational": 0}
MAX_CHAINS = 12


@dataclass
class ChainBuild:
    chains: list[AttackChain]
    findings: list[Finding]
    evidence: list[Evidence]


def _severity(draft: ChainDraft) -> Severity:
    ranked = sorted((f.severity for f in draft.core_findings), key=lambda s: -SEVERITY_RANK[s])
    top: Severity = ranked[0] if ranked else "medium"
    highs = sum(1 for s in ranked if SEVERITY_RANK[s] >= 3)
    if highs >= 2 and draft.assets:
        return "critical"
    hint_rank = SEVERITY_RANK.get(draft.severity_hint or "", -1)
    if hint_rank > SEVERITY_RANK[top]:
        return "high" if hint_rank >= 3 else draft.severity_hint  # type: ignore[return-value]
    return top


class ChainEngine:
    def __init__(self, mapped: MapResult, findings: list[Finding], evidence: list[Evidence]) -> None:
        self.findings = findings
        self.graph = KnowledgeGraph(mapped, findings)
        self.registry = EvidenceRegistry(evidence)

    def deterministic_drafts(self) -> list[ChainDraft]:
        return [
            *patterns.state_poisoning(self.graph, self.registry),
            *patterns.price_manipulation(self.graph, self.registry),
            *patterns.reentrancy(self.graph, self.registry),
        ]

    def finalize(self, drafts: list[ChainDraft]) -> ChainBuild:
        unique: dict[tuple, ChainDraft] = {}
        for draft in drafts:
            if not draft.steps:
                continue
            existing = unique.get(draft.signature)
            if existing is None or (existing.origin == "ai" and draft.origin == "deterministic"):
                unique[draft.signature] = draft

        scored = []
        for draft in unique.values():
            checks, confidence, level = evaluate(draft, self.graph)
            scored.append((draft, checks, confidence, level, _severity(draft)))
        scored.sort(key=lambda s: (-SEVERITY_RANK[s[4]], -s[2], s[0].title))

        chains: list[AttackChain] = []
        for index, (draft, checks, confidence, level, severity) in enumerate(scored[:MAX_CHAINS], start=1):
            chain_id = f"AC-{index:03d}"
            step_ids = [f"{chain_id}-S{i}" for i in range(1, len(draft.steps) + 1)]
            steps = [
                AttackStep(
                    id=step_ids[i],
                    order=i + 1,
                    type=s.type,
                    title=s.title,
                    contract=s.key[0] if s.key else None,
                    function=s.key[1] if s.key else None,
                    source_location=s.location,
                    description=s.description,
                    reason=s.reason,
                    dependencies=[step_ids[i - 1]] if i else [],
                    evidence=list(dict.fromkeys(e for e in s.evidence if e in self.registry.items)),
                    finding_ids=sorted(set(s.finding_ids)),
                    assumptions=s.assumptions,
                    confidence=round(min(s.confidence, confidence + 0.1), 2),
                )
                for i, s in enumerate(draft.steps)
            ]
            break_points = [
                BreakPoint(
                    id=f"{chain_id}-BP{i}",
                    title=bp.title,
                    location=BreakPointLocation(
                        file=bp.location.file,
                        line_start=bp.location.line_start,
                        line_end=bp.location.line_end,
                        contract=bp.key[0],
                        function=bp.key[1],
                    ),
                    recommendation=bp.recommendation,
                    rationale=bp.rationale,
                    affected_step_ids=[step_ids[j] for j in bp.step_indexes if j < len(step_ids)],
                    confidence=bp.confidence,
                )
                for i, bp in enumerate(draft.break_points, start=1)
            ]
            evidence = list(dict.fromkeys(e for s in steps for e in s.evidence))
            contracts = list(dict.fromkeys(s.contract for s in steps if s.contract))
            limitations = [
                *draft.limitations,
                "Runtime exploitability was not simulated; the chain is inferred from static structure.",
            ]
            if draft.origin == "ai":
                limitations.insert(0, "Proposed by AI investigation and validated against the repository map.")
            chains.append(
                AttackChain(
                    id=chain_id,
                    title=draft.title,
                    summary=draft.summary,
                    severity=severity,
                    confidence=confidence,
                    support_level=level,
                    status="supported" if level != "weak" else "potential",
                    entry_point=EntryPoint(
                        contract=draft.entry[0],
                        function=draft.entry[1],
                        source_location=self.graph.location(draft.entry) if draft.entry in self.graph.functions else None,
                    ),
                    preconditions=draft.preconditions,
                    steps=steps,
                    evidence=evidence,
                    impact=Impact(summary=draft.impact_summary, assets_at_risk=draft.assets),
                    related_finding_ids=draft.finding_ids,
                    contracts_involved=contracts,
                    break_points=break_points,
                    confidence_checks=checks,
                    assumptions=draft.assumptions,
                    limitations=limitations,
                )
            )

        return ChainBuild(chains=chains, findings=self._link_findings(chains), evidence=self.registry.all())

    def _link_findings(self, chains: list[AttackChain]) -> list[Finding]:
        chains_by_finding: dict[str, list[AttackChain]] = {}
        for chain in chains:
            for fid in chain.related_finding_ids:
                chains_by_finding.setdefault(fid, []).append(chain)
        chained_contracts: dict[str, set[str]] = {}
        for fid, owners in chains_by_finding.items():
            for chain in owners:
                for contract in chain.contracts_involved:
                    chained_contracts.setdefault(contract, set()).add(fid)

        linked: list[Finding] = []
        for finding in self.findings:
            owners = chains_by_finding.get(finding.id, [])
            if owners:
                related = sorted({f for c in owners for f in c.related_finding_ids} - {finding.id})
                supported = any(c.status == "supported" for c in owners)
                linked.append(finding.model_copy(update={
                    "relationship": "chain",
                    "chain_ids": [c.id for c in owners],
                    "related_findings": related,
                    "status": "supported" if supported and finding.status == "potential" else finding.status,
                }))
                continue
            neighbours = sorted(chained_contracts.get(finding.contract or "", set()))
            linked.append(finding.model_copy(update={
                "relationship": "related" if neighbours else "isolated",
                "related_findings": neighbours,
                "chain_ids": [],
            }))
        return linked


__all__ = ["ChainBuild", "ChainEngine", "fmt"]
