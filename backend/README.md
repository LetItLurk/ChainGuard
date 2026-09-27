# ChainGuard backend

FastAPI service for repository ingestion, Solidity mapping, Slither analysis, evidence validation, and attack-chain construction.

## Local development

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
PYTHONPATH=backend uvicorn app.main:app --reload --port 8000
```

The Next.js app can call the service with `CHAINGUARD_API_URL=http://localhost:8000`.

## Endpoints

- `GET /health` — service and capability status
- `POST /analyze` — start a GitHub analysis with `{ "source_type": "github", "github_url": "..." }`
- `POST /analyze/upload` — start an analysis from a `.zip` upload
- `GET /analysis/{id}/status` — poll stage progress
- `GET /analysis/{id}` — retrieve the completed analysis
- `GET /analysis/{id}/sources?path=contracts/Foo.sol` — retrieve validated source excerpts

Analyses are persisted under `CHAINGUARD_DATA_DIR` (default `.chainguard-data`). Set `CHAINGUARD_AI_REASON_URL` and `CHAINGUARD_INTERNAL_TOKEN` to enable the optional AI investigation stage. If unavailable, deterministic analysis still completes.

## Docker

From the project root:

```bash
docker build -f backend/Dockerfile -t chainguard-backend .
docker run --rm -p 8000:8000 -v "$PWD/.chainguard-data:/app/.chainguard-data" chainguard-backend
```
