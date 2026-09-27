"""ChainGuard FastAPI service."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.analysis.slither_runner import slither_available
from app.core.config import get_settings
from app.core.errors import ChainGuardError, InvalidInputError, NotFoundError, PayloadTooLargeError
from app.core.logging import configure_logging
from app.ingestion.archive import as_stream, extract_zip
from app.ingestion.github import download_and_extract, parse_github_url
from app.pipeline import Source, create_analysis
from app.storage.store import AnalysisStore

configure_logging()
app = FastAPI(title="ChainGuard Analyzer", version="1.0.0", docs_url="/docs", redoc_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

MAX_SOURCE_PATHS = 40


@lru_cache
def get_store() -> AnalysisStore:
    return AnalysisStore(get_settings().data_dir)


@app.exception_handler(ChainGuardError)
async def _chainguard_error(_: Request, exc: ChainGuardError) -> JSONResponse:
    return JSONResponse({"detail": exc.public_message}, status_code=exc.status_code)


class AnalyzeRequest(BaseModel):
    source_type: Literal["github"]
    github_url: str


class StartResponse(BaseModel):
    id: str


@app.get("/health")
def health() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "slither": slither_available(),
        "ai": settings.ai_enabled,
        "version": "1.0.0",
        "store": str(settings.data_dir),
    }


@app.post("/analyze", response_model=StartResponse, status_code=202)
def analyze(body: AnalyzeRequest) -> StartResponse:
    settings = get_settings()
    ref = parse_github_url(body.github_url)
    source = Source(
        type="github",
        reference=body.github_url.strip(),
        name=f"{ref.owner}/{ref.repo}",
        ingest=lambda dest: download_and_extract(
            ref,
            dest,
            max_download=settings.max_upload_bytes * 3,
            max_extracted=settings.max_extracted_bytes,
            max_files=settings.max_files,
            token=settings.github_token,
        ),
    )
    return StartResponse(id=create_analysis(get_store(), source))


@app.post("/analyze/upload", response_model=StartResponse, status_code=202)
def analyze_upload(file: UploadFile = File(...)) -> StartResponse:
    settings = get_settings()
    filename = Path(file.filename or "upload.zip").name
    if not filename.lower().endswith(".zip"):
        raise InvalidInputError("Upload must be a .zip archive.")
    data = file.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise PayloadTooLargeError(f"Archive exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB upload limit.")
    if not data:
        raise InvalidInputError("Uploaded archive is empty.")
    source = Source(
        type="zip",
        reference=filename,
        name=filename.removesuffix(".zip").removesuffix(".ZIP")[:100] or "upload",
        ingest=lambda dest: extract_zip(as_stream(data), dest, settings.max_extracted_bytes, settings.max_files),
    )
    return StartResponse(id=create_analysis(get_store(), source))


@app.get("/analysis/{analysis_id}")
def get_analysis(analysis_id: str) -> dict:
    return get_store().load_analysis(analysis_id).dump()


@app.get("/analysis/{analysis_id}/status")
def get_status(analysis_id: str) -> dict:
    return get_store().load_status(analysis_id).dump()


@app.get("/analysis/{analysis_id}/findings")
def get_findings(analysis_id: str) -> list[dict]:
    analysis = get_store().load_analysis(analysis_id)
    return [f.dump() for f in analysis.findings]


@app.get("/analysis/{analysis_id}/chains")
def get_chains(analysis_id: str) -> list[dict]:
    analysis = get_store().load_analysis(analysis_id)
    return [c.dump() for c in analysis.attack_chains]


@app.get("/analysis/{analysis_id}/chains/{chain_id}")
def get_chain(analysis_id: str, chain_id: str) -> dict:
    analysis = get_store().load_analysis(analysis_id)
    chain = next((c for c in analysis.attack_chains if c.id == chain_id), None)
    if chain is None:
        raise NotFoundError(f"Chain {chain_id!r} not found in analysis {analysis_id!r}.")
    return chain.dump()


@app.get("/analysis/{analysis_id}/sources")
def get_sources(analysis_id: str, path: list[str] = Query(default=[])) -> list[dict]:
    store = get_store()
    analysis = store.load_analysis(analysis_id)
    allowed = set(analysis.repository.solidity_files) | {c.file for c in analysis.repository_map.contracts}
    requested = list(dict.fromkeys(path))[:MAX_SOURCE_PATHS]
    sources = []
    for rel in requested:
        if rel not in allowed:
            continue
        content = store.read_source(analysis_id, rel)
        if content is not None:
            sources.append({"path": rel, "content": content})
    if requested and not sources:
        raise NotFoundError("Requested source files were not found.")
    return sources
