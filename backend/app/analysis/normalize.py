"""Turn Slither detector output and mapper heuristics into canonical findings.

Every finding carries at least one evidence record pointing at a real
location in the repository map. Detector noise (style, optimisation,
compiler-version chatter) is dropped so chains are built from signal.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from app.analysis.mapper import SPOT_PRICE_FUNCTIONS, VALUE_TRANSFER_KINDS, MapResult
from app.models.domain import Evidence, Finding, FindingCategory, RepositoryMap, Severity, SourceLocation

NOISE_CHECKS = {
    "solc-version", "pragma", "naming-convention", "immutable-states", "constable-states", "dead-code",
    "too-many-digits", "assembly", "unused-state", "external-function", "similar-names", "cache-array-length",
    "costly-loop", "boolean-equal", "redundant-statements", "unimplemented-functions", "missing-inheritance",
    "var-read-using-this", "cyclomatic-complexity", "unused-import", "incorrect-using-for",
}

CATEGORY_BY_CHECK: dict[str, FindingCategory] = {
    "arbitrary-send-eth": "access_control",
    "arbitrary-send-erc20": "access_control",
    "arbitrary-send-erc20-permit": "access_control",
    "suicidal": "access_control",
    "unprotected-upgrade": "access_control",
    "controlled-delegatecall": "access_control",
    "tx-origin": "access_control",
    "protected-vars": "access_control",
    "missing-zero-check": "access_control",
    "events-access": "access_control",
    "unchecked-lowlevel": "unchecked_external_call",
    "unchecked-send": "unchecked_external_call",
    "unchecked-transfer": "unchecked_external_call",
    "low-level-calls": "unchecked_external_call",
    "calls-loop": "unchecked_external_call",
    "delegatecall-loop": "unchecked_external_call",
    "msg-value-loop": "logic_arithmetic",
    "divide-before-multiply": "logic_arithmetic",
    "incorrect-equality": "logic_arithmetic",
    "tautology": "logic_arithmetic",
    "weak-prng": "logic_arithmetic",
    "incorrect-exp": "logic_arithmetic",
    "incorrect-shift": "logic_arithmetic",
    "timestamp": "logic_arithmetic",
    "uninitialized-state": "logic_arithmetic",
    "uninitialized-storage": "logic_arithmetic",
    "uninitialized-local": "logic_arithmetic",
    "shadowing-state": "logic_arithmetic",
}

SEVERITY_BY_IMPACT: dict[str, Severity] = {
    "High": "high", "Medium": "medium", "Low": "low", "Informational": "informational",
}
CONFIDENCE_BY_LEVEL = {"High": 0.85, "Medium": 0.65, "Low": 0.45}
SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "informational": 4}


@dataclass
class Normalized:
    findings: list[Finding] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)


def _category(check: str) -> FindingCategory:
    if check.startswith("reentrancy"):
        return "reentrancy"
    return CATEGORY_BY_CHECK.get(check, "other")


def _relative(repo: Path, source_mapping: dict) -> str | None:
    absolute = source_mapping.get("filename_absolute")
    if absolute:
        try:
            return Path(absolute).resolve().relative_to(repo.resolve()).as_posix()
        except ValueError:
            return None
    return source_mapping.get("filename_short")


def _primary_element(elements: list[dict]) -> dict | None:
    for kind in ("function", "node", "contract", "variable"):
        for element in elements:
            if element.get("type") == kind and element.get("source_mapping", {}).get("lines"):
                return element
    return None


def _owner(element: dict) -> tuple[str | None, str | None]:
    kind = element.get("type")
    parent = element.get("type_specific_fields", {}).get("parent", {})
    if kind == "function":
        return parent.get("name"), element.get("name")
    if kind == "node":
        grand = parent.get("type_specific_fields", {}).get("parent", {})
        return grand.get("name"), parent.get("name")
    if kind == "contract":
        return element.get("name"), None
    return parent.get("name") if parent.get("type") == "contract" else None, None


def _title(check: str, contract: str | None, function: str | None) -> str:
    label = check.replace("-", " ").capitalize()
    where = f"{contract}.{function}" if contract and function else contract or "repository"
    return f"{label} in {where}"


def _digest(*parts: object) -> str:
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:10]


class _Builder:
    def __init__(self, repository_map: RepositoryMap) -> None:
        self.map = repository_map
        self.files = {c.file for c in repository_map.contracts}
        self.findings: list[Finding] = []
        self.evidence: list[Evidence] = []
        self.seen: set[str] = set()

    def add(
        self,
        *,
        key: str,
        category: FindingCategory,
        title: str,
        severity: Severity,
        status: str,
        description: str,
        contract: str | None,
        function: str | None,
        location: SourceLocation | None,
        detector: str | None,
        confidence: float,
        evidence_type: str,
        origin: str,
    ) -> None:
        if key in self.seen:
            return
        self.seen.add(key)
        in_map = location is not None and location.file in self.files
        evidence_id = f"EV-{_digest('finding', key)}"
        self.evidence.append(
            Evidence(
                id=evidence_id,
                type=evidence_type,  # type: ignore[arg-type]
                source_file=location.file if location else None,
                contract=contract,
                function=function,
                line_start=location.line_start if location else None,
                line_end=location.line_end if location else None,
                description=description.splitlines()[0][:400] if description else title,
                source=origin,  # type: ignore[arg-type]
                verification_status="verified" if in_map else "unverified",
            )
        )
        self.findings.append(
            Finding(
                id=key,
                category=category,
                title=title,
                severity=severity,
                status=status,  # type: ignore[arg-type]
                relationship="isolated",
                description=description[:1200],
                contract=contract,
                function=function,
                source_location=location if in_map else None,
                detector=detector,
                evidence_references=[evidence_id],
                confidence=confidence,
            )
        )

    def finalize(self) -> Normalized:
        order = sorted(
            self.findings,
            key=lambda f: (SEVERITY_RANK[f.severity], f.source_location.file if f.source_location else "",
                           f.source_location.line_start if f.source_location else 0),
        )
        renamed = {f.id: f"F-{i:03d}" for i, f in enumerate(order, 1)}
        return Normalized(
            [f.model_copy(update={"id": renamed[f.id]}) for f in order],
            self.evidence,
        )


def normalize(repo: Path, mapped: MapResult, detectors: list[dict]) -> Normalized:
    builder = _Builder(mapped.repository_map)
    _slither_findings(builder, repo, detectors)
    _heuristic_findings(builder, mapped)
    return builder.finalize()


def _slither_findings(builder: _Builder, repo: Path, detectors: list[dict]) -> None:
    for result in detectors:
        check = result.get("check", "")
        severity = SEVERITY_BY_IMPACT.get(result.get("impact", ""))
        if not check or check in NOISE_CHECKS or severity is None:
            continue
        element = _primary_element(result.get("elements", []))
        if element is None:
            continue
        mapping = element["source_mapping"]
        file = _relative(repo, mapping)
        if file is None:
            continue
        contract, function = _owner(element)
        lines = mapping["lines"]
        builder.add(
            key=f"slither:{check}:{file}:{lines[0]}:{function}",
            category=_category(check),
            title=_title(check, contract, function),
            severity=severity,
            status="detected",
            description=result.get("description", "").strip(),
            contract=contract,
            function=function,
            location=SourceLocation(file=file, line_start=lines[0], line_end=lines[-1]),
            detector=f"slither:{check}",
            confidence=CONFIDENCE_BY_LEVEL.get(result.get("confidence", ""), 0.5),
            evidence_type="static_detector",
            origin="slither",
        )


def _heuristic_findings(builder: _Builder, mapped: MapResult) -> None:
    """Patterns Slither does not report but attack chains commonly depend on."""
    repo_map = mapped.repository_map
    oracle_readers = {(d.contract, d.function) for d in repo_map.oracle_dependencies}

    for contract in repo_map.contracts:
        if contract.kind in ("interface", "library"):
            continue
        types = mapped.state_types.get(contract.name, {})
        used_in_calls = {
            var
            for fn in contract.functions
            if fn.external_calls
            for var in fn.state_reads
        }
        for fn in contract.functions:
            location = SourceLocation(file=contract.file, line_start=fn.line_start, line_end=fn.line_end)
            external = fn.visibility in ("public", "external")
            mutating = fn.mutability in ("nonpayable", "payable")

            critical_writes = [
                var for var in fn.state_writes
                if (types.get(var, "").startswith(("address", "contract")) or types.get(var, "")[:1].isupper()
                    or re.search(r"fee|rate|owner|admin|oracle|pool|treasury|price|factor|limit", var, re.I))
                and var in used_in_calls | {v for f in contract.functions for v in f.state_reads if f is not fn}
            ]
            if external and mutating and not fn.privileged and fn.name != "constructor" and critical_writes:
                builder.add(
                    key=f"mapper:unrestricted-setter:{contract.name}:{fn.name}",
                    category="access_control",
                    title=f"Unrestricted write to critical state in {contract.name}.{fn.name}",
                    severity="high",
                    status="potential",
                    description=(
                        f"{contract.name}.{fn.name} is {fn.visibility}, has no access-control modifier or "
                        f"msg.sender check, and writes {', '.join(critical_writes)}, which other functions rely on."
                    ),
                    contract=contract.name,
                    function=fn.name,
                    location=location,
                    detector="chainguard:unrestricted-setter",
                    confidence=0.6,
                    evidence_type="access_control",
                    origin="mapper",
                )

            for dep in repo_map.oracle_dependencies:
                if dep.contract != contract.name or dep.function != fn.name:
                    continue
                if dep.target.rsplit(".", 1)[-1] in SPOT_PRICE_FUNCTIONS:
                    builder.add(
                        key=f"mapper:spot-price:{contract.name}:{fn.name}:{dep.line}",
                        category="oracle_manipulation",
                        title=f"Spot price derived from pool state in {contract.name}.{fn.name}",
                        severity="high",
                        status="potential",
                        description=(
                            f"{contract.name}.{fn.name} derives a price from {dep.target} at line {dep.line}. "
                            "Instantaneous pool reserves can be moved within a single transaction."
                        ),
                        contract=contract.name,
                        function=fn.name,
                        location=SourceLocation(file=contract.file, line_start=dep.line, line_end=dep.line),
                        detector="chainguard:spot-price-oracle",
                        confidence=0.65,
                        evidence_type="external_dependency",
                        origin="mapper",
                    )

            sends_value = any(c.kind in VALUE_TRANSFER_KINDS for c in fn.external_calls)
            direct_readers = {f for c, f in oracle_readers if c == contract.name}
            reads_price = fn.name in direct_readers or mapped.reaches(contract.name, fn.name, direct_readers)
            if external and mutating and reads_price and not fn.privileged:
                builder.add(
                    key=f"mapper:flash-surface:{contract.name}:{fn.name}",
                    category="flash_loan_surface",
                    title=f"Price-dependent entry point {contract.name}.{fn.name}",
                    severity="medium",
                    status="potential",
                    description=(
                        f"{contract.name}.{fn.name} is callable by anyone and uses an external price"
                        f"{' before transferring value' if sends_value else ''}. If that price can be moved "
                        "with borrowed capital, this function is reachable in the same transaction."
                    ),
                    contract=contract.name,
                    function=fn.name,
                    location=location,
                    detector="chainguard:price-dependent-entry",
                    confidence=0.5,
                    evidence_type="call_dependency",
                    origin="mapper",
                )

