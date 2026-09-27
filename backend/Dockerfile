FROM python:3.13-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    # Tell solc-select to store binaries in a predictable location
    SOLC_SELECT_DIR=/opt/solc-select

# Install system dependencies (curl for healthcheck, git may be needed by some analysis tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Install Slither and solc-select (optional: comment out if not needed)
# Slither requires a specific solc binary; install the most common version.
RUN pip install --no-cache-dir "slither-analyzer>=0.10.0" solc-select && \
    solc-select install 0.8.20 && \
    solc-select use 0.8.20 && \
    # Also install 0.8.19 for contracts that pin to it
    solc-select install 0.8.19

COPY backend /app/backend

# Create a non-root user with a writable data directory
RUN useradd --create-home --uid 10001 appuser && \
    mkdir -p /app/.chainguard-data /opt/solc-select && \
    chown -R appuser:appuser /app /opt/solc-select

USER appuser

EXPOSE 8000

# Health check so Docker/Kubernetes knows when the service is ready
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
