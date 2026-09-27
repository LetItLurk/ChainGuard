"""Pytest configuration for ChainGuard backend tests."""
# Ensure backend/ is on sys.path so `from app...` imports work
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
