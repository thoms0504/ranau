import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = Path(os.environ.get("RANAU_DATA", ROOT / "data"))
PROCESSED = Path(os.environ.get("RANAU_PROCESSED", DATA / "processed"))
DB_PATH = Path(os.environ.get("RANAU_DB", DATA / "ranau.db"))
ADMIN_TOKEN = os.environ.get("RANAU_ADMIN_TOKEN", "ranau-dev-token")
ADMIN_USER = os.environ.get("RANAU_ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("RANAU_ADMIN_PASSWORD", "ranau-admin")   # ganti di produksi
SESSION_SECRET = os.environ.get("RANAU_SECRET", "") or ADMIN_TOKEN + "|" + ADMIN_PASSWORD
SESSION_HOURS = int(os.environ.get("RANAU_SESSION_HOURS", "8"))
CORS_ORIGINS = os.environ.get("RANAU_CORS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
YEARS = list(range(2021, 2026))      # historis
HORIZON = 3                          # proyeksi 2026-2028
LEVELS = ["kabupaten", "kecamatan", "desa"]
