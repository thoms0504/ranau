"""Vercel serverless entry point for the RANAU FastAPI app."""
import gzip
import logging
import os
import shutil
import sys
import tempfile
from pathlib import Path

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ranau.boot")

# Current directory where this index.py lives (inside /var/task/api on Vercel)
API_DIR = Path(__file__).resolve().parent
ROOT = API_DIR.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))

# Configure data directory paths
_local_data = API_DIR / "data"
_root_data = ROOT / "data"
if _local_data.exists():
    os.environ.setdefault("RANAU_DATA", str(_local_data))
    os.environ.setdefault("RANAU_PROCESSED", str(_local_data / "processed"))
elif _root_data.exists():
    os.environ.setdefault("RANAU_DATA", str(_root_data))
    os.environ.setdefault("RANAU_PROCESSED", str(_root_data / "processed"))

# ---------------------------------------------------------------------------
# Database bootstrap
# Vercel bundle filesystem is read-only; SQLite WAL mode needs a writable path.
# We look for ranau.db.gz in API_DIR first, then ROOT/data.
# On first cold-start, it is decompressed to /tmp/ranau.db.
# ---------------------------------------------------------------------------
_candidates_gz = [
    API_DIR / "ranau.db.gz",
    _root_data / "ranau.db.gz",
    _local_data / "ranau.db.gz",
]
_db_gz = next((p for p in _candidates_gz if p.exists()), None)

_candidates_src = [
    _root_data / "ranau.db",
    _local_data / "ranau.db",
]
_db_src = next((p for p in _candidates_src if p.exists()), None)

_default_tmp = Path(tempfile.gettempdir()) / "ranau.db"
_db_tmp = Path(os.environ.get("RANAU_DB", str(_default_tmp)))
_db_tmp.parent.mkdir(parents=True, exist_ok=True)

if not _db_tmp.exists():
    if _db_gz is not None:
        log.info("Decompressing DB from %s to %s …", _db_gz, _db_tmp)
        with gzip.open(_db_gz, "rb") as f_in, open(_db_tmp, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        log.info("Decompression complete (size: %.1f MB).", _db_tmp.stat().st_size / 1024 / 1024)
    elif _db_src is not None:
        log.info("Copying DB from %s to %s …", _db_src, _db_tmp)
        shutil.copy2(_db_src, _db_tmp)
        log.info("DB copy complete.")
    else:
        log.error("No database file found! Checked paths: %s", [str(p) for p in _candidates_gz + _candidates_src])
        log.error("API_DIR contents: %s", [p.name for p in API_DIR.iterdir()] if API_DIR.exists() else "not found")
        raise FileNotFoundError(
            f"ranau.db.gz not found. Checked: {[str(p) for p in _candidates_gz]}"
        )

os.environ["RANAU_DB"] = str(_db_tmp)

# Allow the frontend URL to be injected via Vercel env var.
_frontend = os.environ.get("FRONTEND_URL", "")
if _frontend:
    existing = os.environ.get("RANAU_CORS", "")
    if _frontend not in existing:
        os.environ["RANAU_CORS"] = f"{existing},{_frontend}".lstrip(",")

from app.main import app  # noqa: E402
