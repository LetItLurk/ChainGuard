# scripts/dev.ps1 — ChainGuard local development launcher (PowerShell)
# Usage: .\scripts\dev.ps1
param()

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FrontendDir = $Root
$BackendDir = Join-Path $Root "backend"

function Write-Info  { param($msg) Write-Host "[chainguard] $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[chainguard] $msg" -ForegroundColor Yellow }

# ── Frontend ──────────────────────────────────────────────────────────────────
if (-not (Test-Path "$FrontendDir\.env.local")) {
    Write-Warn "No .env.local found; copying .env.example → .env.local"
    Copy-Item "$FrontendDir\.env.example" "$FrontendDir\.env.local" -ErrorAction SilentlyContinue
}

Write-Info "Starting Next.js frontend on http://localhost:3000 ..."
$FrontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    pnpm dev
} -ArgumentList $FrontendDir

# ── Backend ───────────────────────────────────────────────────────────────────
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Warn "No virtual environment found. Creating .venv and installing requirements..."
    python -m venv "$BackendDir\.venv"
    & "$BackendDir\.venv\Scripts\pip.exe" install --quiet -r "$BackendDir\requirements.txt"
}

Write-Info "Starting FastAPI backend on http://localhost:8000 ..."
$BackendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    & ".venv\Scripts\uvicorn.exe" app.main:app --host 0.0.0.0 --port 8000 --reload
} -ArgumentList $BackendDir

Write-Info ""
Write-Info "ChainGuard is starting up."
Write-Info "  Frontend: http://localhost:3000"
Write-Info "  Backend:  http://localhost:8000"
Write-Info "  API docs: http://localhost:8000/docs"
Write-Info "  Demo:     http://localhost:3000/analyses/demo"
Write-Info ""
Write-Info "Press Ctrl+C to stop."

try {
    while ($true) {
        Receive-Job -Job $FrontendJob, $BackendJob
        Start-Sleep 1
    }
} finally {
    Stop-Job -Job $FrontendJob, $BackendJob -ErrorAction SilentlyContinue
    Remove-Job -Job $FrontendJob, $BackendJob -Force -ErrorAction SilentlyContinue
    Write-Info "Services stopped."
}
