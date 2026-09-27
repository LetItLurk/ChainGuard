# ChainGuard
<video src="https://github.com/LetItLurk/ChainGuard/blob/main/ChainGuard.mp4" controls width="100%"></video>
**AI-powered smart-contract security investigation and attack-chain reconstruction platform.**

ChainGuard does not just find vulnerabilities. It reconstructs how weaknesses across a repository can connect into a realistic attack path, validates the evidence behind each step, and shows developers exactly where they can break the chain.

> ChainGuard performs static reasoning only. Findings are potential issues that require manual verification and do not replace a professional security audit.

---

## What it does

Traditional scanners output disconnected findings. ChainGuard connects them:

```
SCAN → CONNECT → INVESTIGATE → VERIFY → BREAK
```

1. **Repository ingestion** — GitHub URL or ZIP upload, with path-traversal and size guards.
2. **Repository mapping** — Contracts, functions, external calls, state reads/writes, oracle dependencies.
3. **Static analysis** — Slither integration with normalised findings.
4. **Dependency mapping** — Call graph, state flow, trust boundaries.
5. **AI investigation** — Bounded context package sent to an LLM; structured output only.
6. **Evidence validation** — Every AI claim checked against the deterministic repository map.
7. **Attack-chain construction** — Validated findings connected into multi-step chains.
8. **Report** — Exportable Markdown/JSON report with evidence, confidence, and break points.

---

## Architecture

```
Frontend (Next.js / Vercel)
        │
        │ REST
        ▼
Backend (Python / FastAPI)
  ├── ingestion/         ZIP and GitHub repository ingestion
  ├── analysis/          Slither runner, lexical mapper, normalisation
  ├── chains/            Pattern engine, knowledge graph, chain builder
  ├── ai/                Context builder, AI client, candidate validator
  └── storage/           Filesystem analysis store
        │
        │ POST /api/internal/reason  (server-to-server, token-authenticated)
        ▼
AI layer (Vercel AI SDK, provider-agnostic)
```

The AI never receives raw results directly; it receives a bounded context package and returns structured candidates that are then validated against the deterministic map.

---

## Local setup

### Prerequisites

- Node.js 20+ (or use the pnpm lockfile)
- pnpm 12+
- Python 3.11+
- Slither (optional, for full static analysis)

### Frontend

```bash
cp .env.example .env.local
# Edit .env.local — at minimum set your AI provider key if you want AI investigation
pnpm install
pnpm dev
```

The application starts on <http://localhost:3000>. Without any environment variables, it runs in local/demo mode.

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Optional: full static analysis with Slither
pip install slither-analyzer solc-select
solc-select install 0.8.20
solc-select use 0.8.20

# Start the service
uvicorn app.main:app --reload --port 8000
```

Set `CHAINGUARD_API_URL=http://localhost:8000` in your frontend `.env.local` to connect.

### Docker (full stack)

```bash
cp .env.example .env
# Fill in CHAINGUARD_INTERNAL_TOKEN (min 24 chars) and your AI provider key
docker compose up --build
```

---

## Environment variables

| Variable | Where | Description |
|---|---|---|
| `CHAINGUARD_API_URL` | Frontend | URL of the FastAPI backend (e.g. `http://localhost:8000`) |
| `CHAINGUARD_INTERNAL_TOKEN` | Both | Shared secret for server-to-server auth. Min 24 chars. |
| `CHAINGUARD_AI_MODEL` | Frontend | AI model ID (default: `anthropic/claude-sonnet-5`) |
| `ANTHROPIC_API_KEY` | Frontend | Anthropic API key for AI investigation |
| `OPENAI_API_KEY` | Frontend | OpenAI API key (alternative provider) |
| `CHAINGUARD_MAX_UPLOAD_MB` | Frontend | Max ZIP size in MB (default: 20) |
| `CHAINGUARD_DATA_DIR` | Backend | Path to analysis data directory |
| `CHAINGUARD_AI_REASON_URL` | Backend | URL of the `/api/internal/reason` endpoint |
| `GITHUB_TOKEN` | Backend | GitHub PAT for private repo ingestion |

See [`.env.example`](.env.example) for the full list.

---

## API overview

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service health and capability flags |
| `POST` | `/analyze` | Start analysis from a GitHub URL |
| `POST` | `/analyze/upload` | Start analysis from a ZIP upload |
| `GET` | `/analysis/{id}` | Retrieve full analysis result |
| `GET` | `/analysis/{id}/status` | Retrieve pipeline stage status |
| `GET` | `/analysis/{id}/sources` | Retrieve source files for evidence viewer |

---

## Demo / fixture mode

The demo analysis at `/analyses/demo` uses the intentionally vulnerable contracts in `contracts/` and pre-recorded results in `fixtures/demo/`. It is labelled throughout the UI and never presented as live analysis.

---

## Security assumptions

- Uploaded repository code is **never executed**. Only Solidity source is extracted, read, and passed to Slither for compilation.
- Archive extraction enforces path-traversal, symlink, file-type, and size checks.
- AI provider keys are server-side only and never forwarded to the browser.
- The `/api/internal/reason` endpoint is authenticated with a shared token and is not intended to be public.
- Analysis workspaces are written to an isolated data directory and never overlap with application code.

---

## Known limitations

- Solidity support only in v1. No Vyper, Move, or Rust.
- Runtime exploitability is not confirmed. Chains are inferred from static structure.
- Slither requires a matching `solc` version; contracts with unusual pragma constraints may fall back to lexical analysis.
- Flash-loan and cross-protocol attack surfaces require external context that static analysis cannot fully model.

---

## Roadmap

- [ ] Full backend AI integration (live analysis end-to-end)
- [ ] Slither version management UI
- [ ] Multi-chain / multi-contract project support improvements
- [ ] Historical analysis comparison
- [ ] SARIF export
- [ ] CI/CD integration

---

*ChainGuard is an AI-assisted investigation tool, not a substitute for a complete human security audit.*
