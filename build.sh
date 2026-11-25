#!/bin/bash
# ---------------------------------------------------------------------------
# Vercel build script for RANAU API  (Hobby-plan compatible)
#
# Strategy to stay within Vercel Hobby's 50 MB compressed lambda limit:
#
#   1. Install ALL deps (incl. numpy/shapely) for the build steps.
#   2. Generate dummy data + train ML models → produces data/ranau.db (~115 MB).
#   3. Gzip-compress the DB → data/ranau.db.gz (~34 MB).
#   4. Remove data/ranau.db so only the .gz file is bundled.
#
#   At cold-start, api/index.py decompresses ranau.db.gz to /tmp/ranau.db.
#
# Vercel uses a uv-managed Python environment (PEP 668).
# Plain `pip install` raises "externally-managed-environment".
# Fix: use `uv pip install --system` when available, otherwise
#      fall back to `pip install --break-system-packages`.
# ---------------------------------------------------------------------------
set -e

echo "=== [1/4] Installing Python dependencies (build + runtime) ==="
if command -v uv &>/dev/null; then
  echo "Using: uv pip install --system"
  uv pip install --system -r apps/api/requirements.txt
else
  echo "uv not found – using: pip install --break-system-packages"
  pip install --break-system-packages -r apps/api/requirements.txt
fi

echo "=== [2/4] Generating dummy data (seed=42) ==="
(cd apps/api && python -m ml.generate_dummy)

echo "=== [3/4] Training ML models ==="
(cd apps/api && python -m ml.train)

echo "=== [4/4] Compressing DB for bundle ==="
python -c "
import gzip, shutil, os
src, dst = 'data/ranau.db', 'data/ranau.db.gz'
orig = os.path.getsize(src)
with open(src,'rb') as fi, gzip.open(dst,'wb',compresslevel=9) as fo:
    shutil.copyfileobj(fi, fo)
comp = os.path.getsize(dst)
print(f'  {src}: {orig/1024/1024:.1f} MB  →  {dst}: {comp/1024/1024:.1f} MB  ({comp/orig:.0%})')
os.remove(src)
print(f'  Removed {src} (only .gz will be bundled)')
"

echo "=== Build complete ==="
