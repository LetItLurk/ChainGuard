"""Builds the bounded context package sent to the AI investigation endpoint.

Only repository-map facts, normalized findings, and source excerpts around
functions that matter (findings, value egress, oracle reads, state writers)
are included. Sizes mirror the zod limits in lib/ai/investigation.ts.
"""

from __future__ import annotations

from pathlib import Path

from app.chains.graph import FnKey, KnowledgeGraph
from app.models.domain import Finding

MAX_FINDINGS = 200
MAX_EXCERPTS = 80
MAX_EXCERPT_CHARS = 20_000
MAX_TOTAL_CHARS = 600_000
CONTEXT_LINES = 2


def _priority(graph: KnowledgeGraph) -> list[FnKey]:
    ranked: dict[FnKey, int] = {}
    for key, found in graph.findings_by_fn.items():
        ranked[key] = ranked.get(key, 0) + 10 * len(found)
    for key in graph.functions:
        if graph.egress_by_fn.get(key):
            ranked[key] = ranked.get(key, 0) + 5
        if key in graph.oracle_readers or key in graph.oracle_targets:
            ranked[key] = ranked.get(key, 0) + 5
    for (contract, _), writers in graph.writers.items():
        for key in writers:
            if graph.is_entry(key):
                ranked[key] = ranked.get(key, 0) + 1
    return [k for k, _ in sorted(ranked.items(), key=lambda kv: (-kv[1], kv[0]))]


def _read_lines(repo: Path, rel: str, cache: dict[str, list[str]]) -> list[str]:
    if rel not in cache:
        path = (repo / rel).resolve()
        try:
            path.relative_to(repo.resolve())
            cache[rel] = path.read_text(errors="replace").splitlines()
        except (OSError, ValueError):
            cache[rel] = []
    return cache[rel]


def build_context(
    analysis_id: str, repository_name: str, repo: Path, graph: KnowledgeGraph, findings: list[Finding], repository_map
) -> dict:
    cache: dict[str, list[str]] = {}
    excerpts: list[dict] = []
    seen: set[tuple[str, int, int]] = set()
    total = 0
    for key in _priority(graph):
        if len(excerpts) >= MAX_EXCERPTS:
            break
        fn = graph.functions[key]
        file = graph.contracts[key[0]].file
        lines = _read_lines(repo, file, cache)
        if not lines:
            continue
        start = max(1, fn.line_start - CONTEXT_LINES)
        end = min(len(lines), fn.line_end + CONTEXT_LINES)
        if (file, start, end) in seen:
            continue
        content = "\n".join(f"{n}: {lines[n - 1]}" for n in range(start, end + 1))[:MAX_EXCERPT_CHARS]
        if total + len(content) > MAX_TOTAL_CHARS:
            break
        seen.add((file, start, end))
        total += len(content)
        excerpts.append({"file": file, "lineStart": start, "lineEnd": end, "content": content})

    return {
        "analysisId": analysis_id,
        "repositoryName": repository_name,
        "repositoryMap": repository_map.dump(),
        "findings": [f.dump() for f in findings[:MAX_FINDINGS]],
        "excerpts": excerpts,
    }


def excerpt_ranges(context: dict) -> dict[str, list[tuple[int, int]]]:
    ranges: dict[str, list[tuple[int, int]]] = {}
    for excerpt in context["excerpts"]:
        ranges.setdefault(excerpt["file"], []).append((excerpt["lineStart"], excerpt["lineEnd"]))
    return ranges
