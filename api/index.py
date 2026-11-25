"""Vercel serverless entry point for the RANAU FastAPI app."""
import gzip
import logging
import os
import shutil
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ranau.boot")

# Root of the monorepo is one level up from this api/ directory.
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))

# ---------------------------------------------------------------------------
# Database bootstrap
# Vercel bundle filesystem is read-only; SQLite WAL mode needs a writable path.
#
# The DB is bundled as a gzip-compressed file (data/ranau.db.gz, ~34 MB) to
# stay within Vercel Hobby's 50 MB compressed-lambda limit.
# On first cold-start it is decompressed to /tmp/ranau.db (~115 MB, writable).
# Subsequent warm invocations skip this step entirely.
# ---------------------------------------------------------------------------
_db_gz  = ROOT / "data" / "ranau.db.gz"
_db_src = ROOT / "data" / "ranau.db"      # present only if NOT using compression
_db_tmp = Path("/tmp/ranau.db")

if not _db_tmp.exists():
    if _db_gz.exists():
        log.info("Decompressing DB from bundle (%s) to /tmp …", _db_gz.name)
        with gzip.open(_db_gz, "rb") as f_in, open(_db_tmp, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        log.info("Decompression complete.")
    elif _db_src.exists():
        log.info("Copying pre-built DB from bundle to /tmp …")
        shutil.copy2(_db_src, _db_tmp)
        log.info("DB copy complete.")
    else:
        log.info("No bundled DB found – generating dummy data + training models in /tmp …")
        os.environ["RANAU_DB"] = str(_db_tmp)
        try:
            from ml.generate_dummy import generate  # noqa: E402
            generate()
            log.info("Dummy data generated.")
            from ml.train import run as train_run   # noqa: E402
            n, ver = train_run(log=lambda s: None)
            log.info("Training complete: %d models, version %s", n, ver)
        except Exception as exc:                    # noqa: BLE001
            log.error("DB bootstrap failed: %s", exc)
            raise

os.environ.setdefault("RANAU_DB", str(_db_tmp))

# Allow the frontend URL to be injected via Vercel env var.
# Set FRONTEND_URL=https://your-frontend.vercel.app in Vercel project settings.
_frontend = os.environ.get("FRONTEND_URL", "")
if _frontend:
    existing = os.environ.get("RANAU_CORS", "")
    if _frontend not in existing:
        os.environ["RANAU_CORS"] = f"{existing},{_frontend}".lstrip(",")

from app.main import app  # noqa: E402
