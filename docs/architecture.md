# ChainGuard Architecture

## Overview

ChainGuard is a **three-tier system**:

1. **Frontend** — Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4
2. **Backend** — Python 3.12+, FastAPI, async job model
3. **AI layer** — Vercel AI SDK v7 (server-side only), provider-agnostic, structured output

---

## Runtime Flow

```
User
  │
  ├─ GitHub URL / ZIP upload
  │
  ▼
Next.js API Route (/api/analyses)
  │
  ├─ POST /analyze  →  FastAPI backend
  │                     │
  │                     ├─ 1. Ingestion        (archive extraction / github tarball)
  │                     ├─ 2. Mapping          (lexical + Slither contract map)
  │                     ├─ 3. Static Analysis  (Slither runner — isolated subprocess)
  │                     ├─ 4. Dependency Map   (call graph, state deps, oracle deps)
  │                     ├─ 5. AI Investigation (context package → Next.js AI endpoint)
  │                     ├─ 6. Validation       (CandidateValidator grounds AI output)
  │                     ├─ 7. Chain Build      (ChainEngine → AttackChain objects)
  │                     └─ 8. Report Prep      (store serialized analysis)
  │
  ├─ GET /analyses/{id}/status  →  polling for pipeline progress
  │
  └─ GET /analyses/{id}  →  full Analysis payload (Zod-validated on receipt)
```

---

## Key Design Decisions

### AI is never the source of truth

The AI produces **candidates** (draft chains + finding relationships). These pass through `CandidateValidator` which:

1. Checks every `contract` and `function` name against the `KnowledgeGraph`
2. Validates every `file` path and `lineStart`/`lineEnd` range against the source
3. Drops steps that reference non-existent code
4. Adjusts confidence based on evidence availability

Only validated candidates reach `ChainEngine.finalize()`.

### No secrets in the browser

All AI calls go through a Next.js server route (`/api/internal/reason`). The frontend never sees API keys. The backend calls this Next.js endpoint (server-to-server).

### Structured output, not prose parsing

`InvestigationCandidatesSchema` (Zod) is used with `Output.object({ schema })` in Vercel AI SDK v7. The schema is strict — the AI cannot return arbitrary JSON.

### Atomic file storage

`AnalysisStore` writes via temp-file + `os.replace()` so readers never see partial JSON. The store uses a per-instance threading lock for writes.

### Path traversal protection

`AnalysisStore.read_source()` resolves the candidate path and verifies it stays inside `repo_dir` before reading. ZIP extraction uses `_safe_target()` which checks for absolute paths, path traversal (`..`), and symlinks.

---

## Directory Structure

```
ChainGuard/
├── app/                      # Next.js App Router
│   ├── analyses/[id]/        # Analysis shell + sub-pages
│   ├── analyze/              # Repository input form
│   ├── api/analyses/         # REST API routes (server-only)
│   └── api/internal/reason/  # Server-to-server AI endpoint
│
├── components/chainguard/    # Feature components
│   ├── analysis/             # Progress, header, nav
│   ├── investigation/        # Graph, evidence, step list
│   ├── findings/             # Findings table
│   ├── overview/             # Dashboard
│   ├── report/               # Report document + actions
│   └── landing/              # Landing page components
│
├── lib/
│   ├── domain/schemas.ts     # All Zod schemas (canonical contract)
│   ├── domain/labels.ts      # Display labels + formatters
│   ├── domain/queries.ts     # Pure query functions
│   ├── api/                  # Server-only API clients
│   ├── ai/investigation.ts   # Vercel AI SDK integration
│   ├── code/                 # Solidity tokenizer
│   └── reporting/markdown.ts # Report export
│
├── fixtures/demo/            # Fixture analysis (schema-validated at load)
│
├── backend/app/
│   ├── main.py               # FastAPI application + routes
│   ├── pipeline.py           # 8-stage analysis pipeline
│   ├── models/domain.py      # Pydantic models (mirrors lib/domain/schemas.ts)
│   ├── ingestion/            # ZIP + GitHub ingestion
│   ├── analysis/             # Slither runner, mapper, normalizer
│   ├── chains/               # Chain engine, patterns, graph
│   ├── ai/                   # Context builder, AI client, validator
│   └── storage/store.py      # Atomic filesystem store
│
└── contracts/vulnerable/     # Test fixtures for Slither + ChainGuard
```

---

## Data Flow: Finding → AttackChain

```
Slither detectors
  └─ normalize.py → Finding[]
                       │
              build_map() → KnowledgeGraph
                               │
              patterns.py  → ChainDraft[]  (deterministic)
              ai_validator → ChainDraft[]  (AI-proposed, grounded)
                               │
              ChainEngine.finalize()
                │
                ├─ Deduplication (signature-based)
                ├─ evaluate() → confidence + support level
                ├─ _link_findings() → relationship tagging
                └─ AttackChain[]
```

---

## Frontend State Model

The frontend is **server-component-first**. Data flows:

1. Server component loads analysis via `loadAnalysis()` (React cache-deduped)
2. Complete analysis is passed as props — no client-side fetch for the main data
3. `AnalysisProgress` is the only polling component (client, SWR)
4. `InvestigationView` manages local selection state — no global store

---

## Confidence Calculation

Confidence is derived from **evidence availability**, not model certainty:

| Factor | Weight |
|---|---|
| Source code verified | +0.20 |
| Function exists in map | +0.15 |
| Call graph supports relationship | +0.20 |
| Static detector supports issue | +0.20 |
| State dependency exists | +0.10 |
| Oracle dependency mapped | +0.10 |
| All steps have source locations | +0.05 |

Support level: `strong` ≥ 0.75, `moderate` ≥ 0.50, `weak` < 0.50

---

## Security Assumptions

- Uploaded source code is **never executed**
- Slither runs in an **isolated subprocess** with `subprocess.run(..., timeout=...)` 
- All paths from ZIP are sanitized — no path traversal, no absolute paths, no symlinks
- API keys are **server-only** — never sent to the browser
- GitHub token (optional) is read from environment, never logged
- Temporary directories are cleaned up after ingestion
- Upload size limits enforced at the API layer (default: 50 MB)

---

## Known Limitations (V1)

- Static analysis only — no runtime simulation or transaction replay
- Solidity support only (no Vyper, Move, Rust)
- No persistent database — filesystem storage only
- No authentication or multi-user support
- Slither requires Python 3.8+ and a compatible solc version
- Large repositories (> 200 Solidity files) may hit timeout limits
- AI investigation requires a configured LLM provider

ChainGuard is an AI-**assisted** investigation tool, not a substitute for a professional security audit.
