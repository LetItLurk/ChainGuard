#!/usr/bin/env bash
# scripts/dev.sh — ChainGuard local development launcher
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd .. && pwd)"
FRONTEND_DIR="$ROOT"
BACKEND_DIR="$ROOT/backend"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info() { echo -e "${GREEN}[chainguard]${NC} $*"; }
warn() { echo -e "${YELLOW}[chainguard]${NC} $*"; }
err()  { echo -e "${RED}[chainguard]${NC} $*"; }

cleanup() {
  info "Stopping services…"
  kill "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Frontend ──────────────────────────────────────────────────────────────────
if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
  warn "No .env.local found; copying .env.example → .env.local (edit before production use)"
  cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env.local" || true
fi

info "Starting Next.js frontend on http://localhost:3000 …"
cd "$FRONTEND_DIR"
pnpm dev &
FRONTEND_PID=$!

# ── Backend ───────────────────────────────────────────────────────────────────
if [ ! -d "$BACKEND_DIR/.venv" ]; then
  warn "No virtual environment found. Creating .venv and installing requirements…"
  python3 -m venv "$BACKEND_DIR/.venv"
  "$BACKEND_DIR/.venv/bin/pip" install --quiet -r "$BACKEND_DIR/requirements.txt"
fi

info "Starting FastAPI backend on http://localhost:8000 …"
cd "$BACKEND_DIR"
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# ── Wait ──────────────────────────────────────────────────────────────────────
info "ChainGuard is starting up."
info "  Frontend: http://localhost:3000"
info "  Backend:  http://localhost:8000"
info "  API docs: http://localhost:8000/docs"
info "  Demo:     http://localhost:3000/analyses/demo"
info ""
info "Press Ctrl+C to stop all services."

wait "$FRONTEND_PID" "$BACKEND_PID"
