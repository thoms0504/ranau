"""Vercel serverless entry point for the RANAU FastAPI app."""
import os
import sys
import shutil
from pathlib import Path

# Root of the monorepo is one level up from this api/ directory.
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))

# Vercel bundle filesystem is read-only, so SQLite WAL mode will fail unless
# the DB is on a writable path. Copy the pre-built DB to /tmp on cold start.
_db_src = ROOT / "data" / "ranau.db"
_db_tmp = Path("/tmp/ranau.db")
if _db_src.exists() and not _db_tmp.exists():
    shutil.copy2(_db_src, _db_tmp)
if _db_tmp.exists():
    os.environ.setdefault("RANAU_DB", str(_db_tmp))

# Allow the frontend URL to be injected via Vercel env var.
# Set RANAU_CORS=https://your-frontend.vercel.app in the Vercel project settings.
_frontend = os.environ.get("FRONTEND_URL", "")
if _frontend:
    existing = os.environ.get("RANAU_CORS", "")
    if _frontend not in existing:
        os.environ["RANAU_CORS"] = f"{existing},{_frontend}".lstrip(",")

from app.main import app  # noqa: E402
