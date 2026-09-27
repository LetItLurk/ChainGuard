"""Canonical ChainGuard domain contract.

Mirrors `lib/domain/schemas.ts`. Fields are snake_case in Python and
serialized as camelCase so the frontend's zod schemas parse them directly.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Severity = Literal["critical", "high", "medium", "low", "informational"]
SupportStatus = Literal["detected", "supported", "potential", "unverified"]
RelationshipStatus = Literal["chain", "related", "isolated", "unverified"]
FindingCategory = Literal[
    "reentrancy",
    "access_control",
    "oracle_manipulation",
    "flash_loan_surface",
    "unchecked_external_call",
    "logic_arithmetic",
    "other",
]
EvidenceType = Literal[
    "source",
    "function",
    "call_dependency",
    "state_dependency",
    "static_detector",
    "external_dependency",
    "access_control",
    "ai_reasoning",
]
EvidenceOrigin = Literal["slither", "mapper", "ai", "validator", "fixture"]
VerificationStatus = Literal["verified", "partial", "unverified", "failed"]
AttackStepType = Literal[
    "attacker_action", "contract_function", "state_change", "external_dependency", "vulnerability", "impact"
]
SupportLevel = Literal["strong", "moderate", "weak"]
StageName = Literal[
    "ingestion",
    "mapping",
    "static_analysis",
    "dependency_mapping",
    "ai_investigation",
    "evidence_validation",
    "chain_construction",
    "report_preparation",
]
StageStatus = Literal["pending", "running", "complete", "failed", "skipped"]
AnalysisStatus = Literal["queued", "running", "complete", "failed"]
ExternalCallKind = Literal["low_level_call", "transfer", "send", "delegatecall", "contract_call"]

STAGE_ORDER: tuple[StageName, ...] = (
    "ingestion",
    "mapping",
    "static_analysis",
    "dependency_mapping",
    "ai_investigation",
    "evidence_validation",
    "chain_construction",
    "report_preparation",
)


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    def dump(self) -> dict:
        return self.model_dump(by_alias=True, mode="json")


class SourceLocation(Model):
    file: str = Field(min_length=1)
    line_start: int = Field(gt=0)
    line_end: int = Field(gt=0)


class Evidence(Model):
    id: str
    type: EvidenceType
    source_file: str | None
    contract: str | None
    function: str | None
    line_start: int | None
    line_end: int | None
    description: str
    source: EvidenceOrigin
    verification_status: VerificationStatus


class Finding(Model):
    id: str
    category: FindingCategory
    title: str
    severity: Severity
    status: SupportStatus
    relationship: RelationshipStatus
    description: str
    contract: str | None
    function: str | None
    source_location: SourceLocation | None
    detector: str | None
    evidence_references: list[str] = Field(default_factory=list)
    related_findings: list[str] = Field(default_factory=list)
    chain_ids: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class AttackStep(Model):
    id: str
    order: int = Field(gt=0)
    type: AttackStepType
    title: str
    contract: str | None
    function: str | None
    source_location: SourceLocation | None
    description: str
    reason: str
    dependencies: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    finding_ids: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class BreakPointLocation(SourceLocation):
    contract: str
    function: str | None


class BreakPoint(Model):
    id: str
    title: str
    location: BreakPointLocation
    recommendation: str
    rationale: str
    affected_step_ids: list[str]
    confidence: float = Field(ge=0, le=1)


class ConfidenceCheck(Model):
    label: str
    status: Literal["met", "unmet", "unavailable"]
    detail: str | None = None


class EntryPoint(Model):
    contract: str
    function: str
    source_location: SourceLocation | None


class Impact(Model):
    summary: str
    assets_at_risk: list[str]


class AttackChain(Model):
    id: str
    title: str
    summary: str
    severity: Severity
    confidence: float = Field(ge=0, le=1)
    support_level: SupportLevel
    status: SupportStatus
    entry_point: EntryPoint
    preconditions: list[str]
    steps: list[AttackStep] = Field(min_length=1)
    evidence: list[str]
    impact: Impact
    related_finding_ids: list[str]
    contracts_involved: list[str]
    break_points: list[BreakPoint]
    confidence_checks: list[ConfidenceCheck]
    assumptions: list[str]
    limitations: list[str]


class ExternalCall(Model):
    target: str
    kind: ExternalCallKind
    line: int = Field(gt=0)


class ContractFunction(Model):
    name: str
    visibility: Literal["public", "external", "internal", "private"]
    mutability: Literal["pure", "view", "payable", "nonpayable"]
    modifiers: list[str] = Field(default_factory=list)
    privileged: bool = False
    line_start: int = Field(gt=0)
    line_end: int = Field(gt=0)
    external_calls: list[ExternalCall] = Field(default_factory=list)
    state_reads: list[str] = Field(default_factory=list)
    state_writes: list[str] = Field(default_factory=list)


class Contract(Model):
    name: str
    kind: Literal["contract", "interface", "library", "abstract"]
    file: str
    line_start: int = Field(gt=0)
    line_end: int = Field(gt=0)
    imports: list[str] = Field(default_factory=list)
    state_variables: list[str] = Field(default_factory=list)
    functions: list[ContractFunction] = Field(default_factory=list)


class ContractRelationship(Model):
    from_: str = Field(alias="from")
    to: str
    kind: Literal["calls", "inherits", "imports", "reads_oracle"]


class OracleDependency(Model):
    contract: str
    function: str
    target: str
    line: int = Field(gt=0)


class TrustBoundary(Model):
    id: str
    description: str
    contracts: list[str]


class RepositoryMap(Model):
    contracts: list[Contract] = Field(default_factory=list)
    relationships: list[ContractRelationship] = Field(default_factory=list)
    oracle_dependencies: list[OracleDependency] = Field(default_factory=list)
    trust_boundaries: list[TrustBoundary] = Field(default_factory=list)


class AnalysisStage(Model):
    name: StageName
    status: StageStatus = "pending"
    message: str | None = None
    started_at: str | None = None
    completed_at: str | None = None


class Repository(Model):
    id: str
    name: str
    source_type: Literal["github", "zip", "fixture"]
    source_reference: str
    status: AnalysisStatus
    solidity_files: list[str] = Field(default_factory=list)
    contracts_count: int = 0
    functions_count: int = 0
    external_calls_count: int = 0
    privileged_functions_count: int = 0
    oracle_dependencies_count: int = 0
    created_at: str
    completed_at: str | None = None


class Diagnostic(Model):
    level: Literal["info", "warning", "error"]
    stage: StageName
    message: str


class StaticAnalysisInfo(Model):
    tool: str
    status: Literal["complete", "failed", "unavailable", "fixture"]
    message: str | None = None


class Analysis(Model):
    id: str
    mode: Literal["live", "fixture"] = "live"
    status: AnalysisStatus
    repository: Repository
    stages: list[AnalysisStage]
    static_analysis: StaticAnalysisInfo
    ai_status: Literal["complete", "unavailable", "skipped", "fixture"]
    repository_map: RepositoryMap
    findings: list[Finding]
    attack_chains: list[AttackChain]
    evidence: list[Evidence]
    diagnostics: list[Diagnostic]
    limitations: list[str]
    created_at: str
    completed_at: str | None = None


class AnalysisStatusPayload(Model):
    id: str
    status: AnalysisStatus
    stages: list[AnalysisStage]
    error: str | None = None


class SourceFile(Model):
    path: str
    content: str
