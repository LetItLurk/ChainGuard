"""End-to-end analysis pipeline. Each stage updates persisted status so the UI can poll progress."""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from app.ai.client import request_investigation
from app.ai.context_builder import build_context, excerpt_ranges
from app.ai.validator import CandidateValidator
from app.analysis.mapper import build_map
from app.analysis.normalize import normalize
from app.analysis.slither_runner import run_slither
from app.chains.engine import ChainEngine
from app.core.config import get_settings
from app.core.errors import ChainGuardError, UnsupportedRepositoryError
from app.core.logging import get_logger
from app.ingestion.archive import ExtractionResult
from app.ingestion.discovery import discover_solidity
from app.models.domain import (
    STAGE_ORDER,
    Analysis,
    AnalysisStage,
    AnalysisStatusPayload,
    Diagnostic,
    Repository,
    RepositoryMap,
    StageName,
    StaticAnalysisInfo,
)
from app.storage.store import AnalysisStore

log = get_logger(__name__)
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="analysis")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Source:
    type: str  # "github" | "zip" — validated by the caller (main.py)
    reference: str
    name: str
    ingest: Callable[[Path], ExtractionResult]


class Run:
    def __init__(self, store: AnalysisStore, analysis: Analysis) -> None:
        self.store = store
        self.analysis = analysis
        self.lock = threading.Lock()

    def save(self, error: str | None = None) -> None:
        with self.lock:
            self.store.save_analysis(self.analysis)
            self.store.save_status(
                AnalysisStatusPayload(id=self.analysis.id, status=self.analysis.status, stages=self.analysis.stages, error=error)
            )

    def stage(self, name: StageName) -> AnalysisStage:
        return next(s for s in self.analysis.stages if s.name == name)

    def start(self, name: StageName) -> None:
        stage = self.stage(name)
        stage.status, stage.started_at = "running", now()
        self.analysis.status = "running"
        self.analysis.repository.status = "running"
        self.save()

    def finish(self, name: StageName, message: str | None = None, status: str = "complete") -> None:
        stage = self.stage(name)
        stage.status, stage.completed_at, stage.message = status, now(), message  # type: ignore[assignment]
        self.save()

    def diag(self, level: str, stage: StageName, message: str) -> None:
        self.analysis.diagnostics.append(Diagnostic(level=level, stage=stage, message=message[:500]))  # type: ignore[arg-type]


def create_analysis(store: AnalysisStore, source: Source) -> str:
    analysis_id = store.new_id()
    store.create(analysis_id)
    created = now()
    source_type = source.type if source.type in ("github", "zip", "fixture") else "zip"
    analysis = Analysis(
        id=analysis_id,
        status="queued",
        repository=Repository(
            id=analysis_id, name=source.name, source_type=source_type, source_reference=source.reference, status="queued", created_at=created  # type: ignore[arg-type]
        ),
        stages=[AnalysisStage(name=name) for name in STAGE_ORDER],
        static_analysis=StaticAnalysisInfo(tool="slither", status="unavailable", message="Not started."),
        ai_status="skipped",
        repository_map=RepositoryMap(),
        findings=[],
        attack_chains=[],
        evidence=[],
        diagnostics=[],
        limitations=[],
        created_at=created,
    )
    run = Run(store, analysis)
    run.save()
    _executor.submit(_execute, run, source)
    return analysis_id


def _execute(run: Run, source: Source) -> None:
    try:
        execute(run, source)
    except ChainGuardError as exc:
        _fail(run, exc.public_message)
    except Exception:
        log.exception("analysis crashed", extra={"analysis_id": run.analysis.id})
        _fail(run, "Analysis failed unexpectedly.")


def _fail(run: Run, message: str) -> None:
    for stage in run.analysis.stages:
        if stage.status == "running":
            stage.status, stage.completed_at, stage.message = "failed", now(), message
        elif stage.status == "pending":
            stage.status = "skipped"
    run.analysis.status = "failed"
    run.analysis.repository.status = "failed"
    run.analysis.completed_at = now()
    run.save(error=message)


def execute(run: Run, source: Source) -> None:
    settings = get_settings()
    analysis = run.analysis
    repo = run.store.repo_dir(analysis.id)

    run.start("ingestion")
    repo.mkdir(parents=True, exist_ok=True)
    extraction = source.ingest(repo)
    discovery = discover_solidity(extraction.extracted, settings.max_solidity_files)
    if not discovery.in_scope:
        raise UnsupportedRepositoryError("No Solidity (.sol) files were found in the repository.")
    files = discovery.in_scope
    analysis.repository.solidity_files = files
    if discovery.out_of_scope:
        analysis.limitations.append(
            f"{len(discovery.out_of_scope)} Solidity file(s) were excluded as tests, scripts, mocks, or dependencies."
        )
    skipped = extraction.skipped_unsafe + extraction.skipped_large
    if skipped:
        run.diag("warning", "ingestion", f"{skipped} archive entries were skipped (unsafe paths or oversized files).")
    run.finish("ingestion", f"{len(files)} Solidity file(s) in scope")

    run.start("mapping")
    lexical = build_map(repo, files, [])
    _apply_map(analysis, lexical.repository_map)
    run.finish("mapping", f"{len(lexical.repository_map.contracts)} contract(s) discovered")

    run.start("static_analysis")
    slither = run_slither(repo, files)
    analysis.static_analysis = StaticAnalysisInfo(tool="slither", status=slither.status, message=slither.message)  # type: ignore[arg-type]
    for error in slither.errors[:10]:
        run.diag("warning", "static_analysis", error)
    if slither.status != "complete":
        analysis.limitations.append("Slither could not analyze this repository; findings rely on ChainGuard heuristics only.")
    run.finish(
        "static_analysis",
        f"{len(slither.detectors)} detector result(s)" if slither.status == "complete" else slither.message,
        "complete" if slither.status == "complete" else "skipped",
    )

    run.start("dependency_mapping")
    mapped = build_map(repo, files, slither.contracts) if slither.contracts else lexical
    normalized = normalize(repo, mapped, slither.detectors)
    _apply_map(analysis, mapped.repository_map)
    analysis.findings = normalized.findings
    analysis.evidence = normalized.evidence
    rm = mapped.repository_map
    run.finish(
        "dependency_mapping",
        f"{len(rm.relationships)} relationship(s), {len(rm.oracle_dependencies)} oracle dependenc{'y' if len(rm.oracle_dependencies) == 1 else 'ies'}",
    )

    engine = ChainEngine(mapped, normalized.findings, normalized.evidence)
    run.start("ai_investigation")
    context = build_context(analysis.id, analysis.repository.name, repo, engine.graph, normalized.findings, rm)
    ai = request_investigation(context)
    if ai.status == "complete":
        analysis.ai_status = "complete"
        run.finish("ai_investigation", f"{len(ai.candidates.get('chains', []))} candidate chain(s) proposed")  # type: ignore[union-attr]
    else:
        analysis.ai_status = "unavailable"
        analysis.limitations.append("AI investigation was unavailable; chains come from deterministic patterns only.")
        if ai.status == "failed":
            run.diag("warning", "ai_investigation", ai.message or "AI investigation failed.")
        run.finish("ai_investigation", ai.message, "skipped")

    run.start("evidence_validation")
    ai_drafts = []
    relationships: dict[str, tuple[str, str]] = {}
    if ai.candidates:
        report = CandidateValidator(engine.graph, normalized.findings, engine.registry, excerpt_ranges(context)).validate(ai.candidates)
        ai_drafts, relationships = report.drafts, report.relationships
        for reason in report.rejected[:10]:
            run.diag("info", "evidence_validation", f"Rejected AI chain — {reason}")
        message = f"{len(report.drafts)} AI chain(s) accepted, {len(report.rejected)} rejected, {report.dropped_steps} step(s) dropped"
    else:
        message = "No AI candidates to validate"
    run.finish("evidence_validation", message)

    run.start("chain_construction")
    build = engine.finalize([*engine.deterministic_drafts(), *ai_drafts])
    findings = build.findings
    if relationships:
        findings = [
            f.model_copy(update={"relationship": relationships[f.id][0]})
            if f.relationship != "chain" and f.id in relationships and relationships[f.id][0] in ("isolated", "unverified")
            else f
            for f in findings
        ]
    analysis.findings = findings
    analysis.attack_chains = build.chains
    analysis.evidence = build.evidence
    run.finish("chain_construction", f"{len(build.chains)} attack chain(s) constructed")

    run.start("report_preparation")
    analysis.limitations.append("ChainGuard performs static reasoning only; no transactions were simulated or executed.")
    analysis.status = "complete"
    analysis.repository.status = "complete"
    analysis.completed_at = analysis.repository.completed_at = now()
    run.finish("report_preparation", "Report ready")


def _apply_map(analysis: Analysis, rm: RepositoryMap) -> None:
    analysis.repository_map = rm
    functions = [f for c in rm.contracts for f in c.functions]
    repo = analysis.repository
    repo.contracts_count = len(rm.contracts)
    repo.functions_count = len(functions)
    repo.external_calls_count = sum(len(f.external_calls) for f in functions)
    repo.privileged_functions_count = sum(1 for f in functions if f.privileged)
    repo.oracle_dependencies_count = len(rm.oracle_dependencies)
