"""Deterministic attack-chain patterns.

Each pattern starts from a seed finding and only emits a chain when the
knowledge graph proves the connecting edges: an unprivileged entry point,
a call or state path to the vulnerable code, and a value egress.
"""

from __future__ import annotations

from app.chains.drafts import BreakPointDraft, ChainDraft, EvidenceRegistry, StateLink, StepDraft
from app.chains.graph import Edge, Egress, FnKey, KnowledgeGraph, fmt
from app.models.domain import Finding

PRICE_CATEGORIES = ("flash_loan_surface", "oracle_manipulation")


def _evidence_of(findings: list[Finding]) -> list[str]:
    return [ev for f in findings for ev in f.evidence_references]


def _path_evidence(graph: KnowledgeGraph, registry: EvidenceRegistry, trail: list[Edge]) -> list[str]:
    ids = []
    for edge in trail:
        location = graph.line_location(edge.source, edge.line) if edge.line else graph.location(edge.source)
        ids.append(
            registry.add(
                type="call_dependency",
                key=f"call:{fmt(edge.source)}->{fmt(edge.target)}:{edge.line}",
                location=location,
                contract=edge.source[0],
                function=edge.source[1],
                description=f"{fmt(edge.source)} calls {fmt(edge.target)}"
                + (f" at line {edge.line}" if edge.line else " (internal call)"),
            )
        )
    return ids


def _state_evidence(graph: KnowledgeGraph, registry: EvidenceRegistry, link: StateLink) -> str:
    return registry.add(
        type="state_dependency",
        key=f"state:{link.contract}.{link.variable}:{fmt(link.writer)}->{fmt(link.reader)}",
        location=graph.location(link.writer),
        contract=link.contract,
        function=link.writer[1],
        description=f"`{link.variable}` is written by {fmt(link.writer)} and read by {fmt(link.reader)}",
    )


def _path_text(entry: FnKey, trail: list[Edge]) -> str:
    return " → ".join([fmt(entry), *(fmt(e.target) for e in trail)])


def _impact_step(graph: KnowledgeGraph, registry: EvidenceRegistry, egress: Egress, why: str) -> StepDraft:
    location = graph.line_location(egress.fn, egress.line)
    evidence = registry.add(
        type="source",
        key=f"egress:{fmt(egress.fn)}:{egress.line}",
        location=location,
        contract=egress.fn[0],
        function=egress.fn[1],
        description=f"{fmt(egress.fn)} transfers value ({egress.kind}{' ' + egress.callee if egress.callee else ''}) at line {egress.line}",
    )
    return StepDraft(
        type="impact",
        title=f"Value leaves {egress.fn[0]}",
        key=egress.fn,
        location=location,
        description=f"{fmt(egress.fn)} transfers {egress.asset.split(' held by')[0]} at line {egress.line} {why}.",
        reason="The transfer amount is gated only by the check that the previous steps subvert.",
        evidence=[evidence],
        confidence=0.65,
    )


def _entry_with_egress(
    graph: KnowledgeGraph, targets: set[FnKey], exclude: set[FnKey]
) -> tuple[FnKey, list[Edge], Egress, list[FnKey]] | None:
    candidates = [(e, t, graph.egress(e)) for e, t in graph.entries_reaching(targets, exclude)]
    candidates = [(e, t, eg) for e, t, eg in candidates if eg]
    if not candidates:
        return None
    candidates.sort(key=lambda c: (-len(graph.findings_on(c[0], *PRICE_CATEGORIES)), len(c[1]), fmt(c[0])))
    entry, trail, egress = candidates[0]
    return entry, trail, egress[0], [c[0] for c in candidates[1:]]


def state_poisoning(graph: KnowledgeGraph, registry: EvidenceRegistry) -> list[ChainDraft]:
    drafts: list[ChainDraft] = []
    for setter, findings in sorted(graph.findings_by_fn.items()):
        seeds = [f for f in findings if f.category == "access_control"]
        if not seeds or not graph.is_entry(setter):
            continue
        setter_fn = graph.functions[setter]
        for var in setter_fn.state_writes:
            consumers = {k for k in graph.readers.get((setter[0], var), set()) if k != setter and k[1] != "constructor"}
            found = _entry_with_egress(graph, consumers, {setter}) if consumers else None
            if not found:
                continue
            entry, trail, egress, alternates = found
            consumer = trail[-1].target if trail else entry
            link = StateLink(setter[0], var, setter, consumer)
            state_ev = _state_evidence(graph, registry, link)
            path_ev = _path_evidence(graph, registry, trail)
            consumer_findings = [f for f in graph.findings_on(consumer, *PRICE_CATEGORIES) if f not in seeds]
            entry_findings = graph.findings_on(entry, *PRICE_CATEGORIES) if entry != consumer else []

            steps = [
                StepDraft(
                    type="attacker_action",
                    title=f"Call {fmt(setter)} without authorization",
                    key=setter,
                    location=graph.location(setter),
                    description=f"{fmt(setter)} is {setter_fn.visibility} and has no access-control check, so any account can call it.",
                    reason="; ".join(f"{f.detector or 'mapper'}: {f.title}" for f in findings)[:400],
                    finding_ids=[f.id for f in findings],
                    evidence=_evidence_of(findings),
                    confidence=0.8,
                ),
                StepDraft(
                    type="state_change",
                    title=f"Replace `{var}` with an attacker-chosen value",
                    key=setter,
                    location=graph.location(setter),
                    description=f"`{var}` in {setter[0]} now points at a value the attacker controls.",
                    reason=f"{fmt(setter)} writes `{var}`; {fmt(consumer)} reads it.",
                    evidence=[state_ev],
                    confidence=0.8,
                ),
                StepDraft(
                    type="contract_function",
                    title=f"Call {fmt(entry)}",
                    key=entry,
                    location=graph.location(entry),
                    description=f"The attacker calls {fmt(entry)}, which follows {_path_text(entry, trail)}.",
                    reason="Call path resolved from the compiled call graph." if trail else f"{fmt(entry)} reads `{var}` directly.",
                    finding_ids=[f.id for f in entry_findings],
                    evidence=[*path_ev, *_evidence_of(entry_findings)],
                    confidence=0.75,
                ),
            ]
            if consumer != entry:
                steps.append(
                    StepDraft(
                        type="external_dependency" if consumer[0] != entry[0] or consumer in graph.oracle_targets else "contract_function",
                        title=f"{fmt(consumer)} uses the replaced `{var}`",
                        key=consumer,
                        location=graph.location(consumer),
                        description=f"{fmt(consumer)} derives its result from `{var}`, so {fmt(entry)} receives an attacker-controlled value.",
                        reason=f"`{var}` is read by {fmt(consumer)}.",
                        finding_ids=[f.id for f in consumer_findings],
                        evidence=[state_ev, *_evidence_of(consumer_findings)],
                        confidence=0.7,
                    )
                )
            steps.append(_impact_step(graph, registry, egress, "using the manipulated result"))

            break_points = [
                BreakPointDraft(
                    title=f"Restrict {fmt(setter)}",
                    key=setter,
                    location=graph.location(setter),
                    recommendation=f"Gate {setter[1]} behind an owner or role check (for example an onlyOwner modifier) and validate the new `{var}` value.",
                    rationale=f"Without an unauthorized write to `{var}`, none of the later steps are reachable.",
                    step_indexes=list(range(len(steps))),
                    confidence=0.9,
                )
            ]
            if consumer != entry:
                break_points.append(
                    BreakPointDraft(
                        title=f"Sanity-check the value from {fmt(consumer)}",
                        key=consumer,
                        location=graph.location(consumer),
                        recommendation=f"Bound the result of {consumer[1]} (for example against a trusted reference or a maximum deviation) before {fmt(entry)} acts on it.",
                        rationale="Limits damage even if the dependency is replaced.",
                        step_indexes=list(range(3, len(steps))),
                        confidence=0.55,
                    )
                )

            limitations = [f"The same dependency is also reachable from {', '.join(map(fmt, alternates[:4]))}."] if alternates else []
            drafts.append(
                ChainDraft(
                    pattern="state_poisoning",
                    origin="deterministic",
                    title=f"Potential unauthorized `{var}` change in {setter[0]} drains {entry[0]}",
                    summary=(
                        f"Any account can call {fmt(setter)} to replace `{var}`. {fmt(consumer)} reads it, and "
                        f"{fmt(entry)} relies on that result before transferring value."
                    ),
                    entry=entry,
                    preconditions=[
                        f"{entry[0]} holds assets that {fmt(entry)} can transfer.",
                        f"The attacker can deploy a contract that returns chosen values in place of `{var}`.",
                    ],
                    steps=steps,
                    impact_summary=f"Assets held by {entry[0]} can be withdrawn against a value the attacker controls.",
                    assets=[egress.asset],
                    core_findings=[*seeds, *consumer_findings, *entry_findings],
                    break_points=break_points,
                    state_link=link,
                    limitations=limitations,
                )
            )
            break
    return drafts


def price_manipulation(graph: KnowledgeGraph, registry: EvidenceRegistry) -> list[ChainDraft]:
    drafts: list[ChainDraft] = []
    for key, findings in sorted(graph.findings_by_fn.items()):
        for seed in (f for f in findings if f.category == "oracle_manipulation"):
            found = _entry_with_egress(graph, {key}, set())
            if not found or seed.source_location is None:
                continue
            entry, trail, egress, alternates = found
            entry_findings = [f for f in graph.findings_on(entry, *PRICE_CATEGORIES) if f.id != seed.id]
            path_ev = _path_evidence(graph, registry, trail)
            steps = [
                StepDraft(
                    type="attacker_action",
                    title="Move the price source within one transaction",
                    key=key,
                    location=seed.source_location,
                    description="The attacker swaps a large amount (for example with a flash loan) into the pool this price is read from.",
                    reason=f"{fmt(key)} reads instantaneous pool state at line {seed.source_location.line_start}.",
                    finding_ids=[seed.id],
                    evidence=list(seed.evidence_references),
                    assumptions=["Enough capital is available to move the pool; flash loans make this cheap."],
                    confidence=0.65,
                ),
                StepDraft(
                    type="external_dependency",
                    title=f"{fmt(key)} returns a skewed price",
                    key=key,
                    location=graph.location(key),
                    description=f"{fmt(key)} computes its price from the manipulated reserves.",
                    reason=seed.description.splitlines()[0][:400],
                    finding_ids=[seed.id],
                    evidence=list(seed.evidence_references),
                    confidence=0.75,
                ),
                StepDraft(
                    type="contract_function",
                    title=f"Call {fmt(entry)} at the skewed price",
                    key=entry,
                    location=graph.location(entry),
                    description=f"In the same transaction the attacker calls {fmt(entry)}, which follows {_path_text(entry, trail)}.",
                    reason="Call path resolved from the compiled call graph." if trail else f"{fmt(entry)} reads the price directly.",
                    finding_ids=[f.id for f in entry_findings],
                    evidence=[*path_ev, *_evidence_of(entry_findings)],
                    confidence=0.7,
                ),
                _impact_step(graph, registry, egress, "valued at the manipulated price"),
            ]
            drafts.append(
                ChainDraft(
                    pattern="price_manipulation",
                    origin="deterministic",
                    title=f"Potential price manipulation of {fmt(key)} exploited via {fmt(entry)}",
                    summary=(
                        f"{fmt(key)} prices assets from instantaneous pool state. An attacker who moves the pool in the "
                        f"same transaction can call {fmt(entry)} at a skewed price and extract value."
                    ),
                    entry=entry,
                    preconditions=[
                        "The priced pool has limited liquidity relative to available flash-loan capital.",
                        f"{entry[0]} holds assets that {fmt(entry)} can transfer.",
                    ],
                    steps=steps,
                    impact_summary=f"Assets held by {entry[0]} are released at an incorrect valuation.",
                    assets=[egress.asset],
                    core_findings=[seed, *entry_findings],
                    break_points=[
                        BreakPointDraft(
                            title="Use a manipulation-resistant price",
                            key=key,
                            location=seed.source_location,
                            recommendation=f"Replace the spot read in {key[1]} with a TWAP or an external oracle (for example Chainlink) with staleness checks.",
                            rationale="A price that cannot move within one transaction removes the attacker's leverage.",
                            step_indexes=[0, 1],
                            confidence=0.85,
                        ),
                        BreakPointDraft(
                            title=f"Bound price-sensitive actions in {fmt(entry)}",
                            key=entry,
                            location=graph.location(entry),
                            recommendation=f"Add maximum price deviation checks or a delay between collateral changes and {entry[1]}.",
                            rationale="Limits how much value a single manipulated price can release.",
                            step_indexes=[2, 3],
                            confidence=0.5,
                        ),
                    ],
                    limitations=[f"The same price is also consumed by {', '.join(map(fmt, alternates[:4]))}."] if alternates else [],
                )
            )
    return drafts


def reentrancy(graph: KnowledgeGraph, registry: EvidenceRegistry) -> list[ChainDraft]:
    drafts: list[ChainDraft] = []
    for key, findings in sorted(graph.findings_by_fn.items()):
        seeds = [f for f in findings if f.category == "reentrancy"]
        if not seeds or not graph.is_entry(key):
            continue
        own_egress = [e for e in graph.egress(key) if e.fn == key]
        fn = graph.functions[key]
        if not own_egress or not fn.state_writes:
            continue
        call = own_egress[0]
        variables = sorted(fn.state_writes, key=lambda v: -len(graph.readers.get((key[0], v), set())))

        reentry: tuple[FnKey, list[Edge], Egress] | None = None
        var = variables[0]
        for candidate_var in variables:
            readers = {k for k in graph.readers.get((key[0], candidate_var), set()) if k != key}
            found = _entry_with_egress(graph, readers, {key}) if readers else None
            if found and found[0][0] == key[0]:
                reentry, var = (found[0], found[1], found[2]), candidate_var
                break

        target = reentry[0] if reentry else key
        link = StateLink(key[0], var, key, reentry[1][-1].target if reentry and reentry[1] else target)
        state_ev = _state_evidence(graph, registry, link)
        target_findings = graph.findings_on(target, "reentrancy") if reentry else []
        steps = [
            StepDraft(
                type="attacker_action",
                title=f"Call {fmt(key)} from an attacker contract",
                key=key,
                location=graph.location(key),
                description=f"The attacker calls {fmt(key)} from a contract with a receive or fallback hook.",
                reason="; ".join(f"{s.detector}: {s.title}" for s in seeds)[:400],
                finding_ids=[s.id for s in seeds],
                evidence=_evidence_of(seeds),
                confidence=0.8,
            ),
            StepDraft(
                type="external_dependency",
                title=f"{fmt(key)} hands control to the caller",
                key=key,
                location=graph.line_location(key, call.line),
                description=f"The external call at line {call.line} runs before `{var}` is updated.",
                reason=f"{fmt(key)} writes `{var}` and performs a {call.kind.replace('_', ' ')} to the caller.",
                finding_ids=[s.id for s in seeds],
                evidence=[state_ev],
                confidence=0.75,
            ),
            StepDraft(
                type="contract_function",
                title=f"Re-enter {fmt(target)}",
                key=target,
                location=graph.location(target),
                description=(
                    f"From its hook, the attacker calls {fmt(target)}, which still sees the old `{var}`."
                    if reentry else f"From its hook, the attacker calls {fmt(key)} again before `{var}` is updated."
                ),
                reason=f"`{var}` is read by {fmt(link.reader)} while the first call is still in progress.",
                finding_ids=[f.id for f in target_findings] or [s.id for s in seeds],
                evidence=[state_ev, *_path_evidence(graph, registry, reentry[1] if reentry else [])],
                confidence=0.65,
            ),
            _impact_step(graph, registry, reentry[2] if reentry else call, "repeatedly against stale accounting"),
        ]
        drafts.append(
            ChainDraft(
                pattern="reentrancy",
                origin="deterministic",
                title=(
                    f"Potential cross-function reentrancy: {fmt(key)} → {fmt(target)}"
                    if reentry else f"Potential reentrancy drain in {fmt(key)}"
                ),
                summary=(
                    f"{fmt(key)} transfers value before updating `{var}`. A malicious receiver can re-enter "
                    f"{fmt(target)} while `{var}` is stale."
                ),
                entry=key,
                preconditions=[f"The attacker has a position in {key[0]} that {fmt(key)} pays out."],
                steps=steps,
                impact_summary=f"Assets held by {key[0]} can be withdrawn more than once.",
                assets=[(reentry[2] if reentry else call).asset],
                core_findings=[*seeds, *target_findings],
                break_points=[
                    BreakPointDraft(
                        title=f"Apply checks-effects-interactions in {fmt(key)}",
                        key=key,
                        location=graph.location(key),
                        recommendation=(
                            f"Update `{var}` before the external call at line {call.line} and add a nonReentrant guard to "
                            f"{key[1]}{' and ' + target[1] if reentry else ''}."
                        ),
                        rationale="Once state is final before control leaves the contract, re-entry sees correct balances.",
                        step_indexes=[0, 1, 2, 3],
                        confidence=0.9,
                    )
                ],
                state_link=link,
                assumptions=["The payout recipient can be a contract that executes code on receipt."],
            )
        )
    return drafts
