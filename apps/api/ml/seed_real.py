"""Seeder data nyata.
   python -m ml.seed_real                       # semua *.csv di data/real/ (kecuali yang diawali _)
   python -m ml.seed_real berkas.csv --dry-run  # cek saja, tanpa menulis
   python -m ml.seed_real --train               # sesudah seed: latih model & prediksi indikator yang tersentuh
   python -m ml.seed_real --drop-dummy-below    # hapus dummy di level yang lebih rinci dari data nyata
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA  # noqa: E402
from app.db import connect, init  # noqa: E402
from app.seeding import seed_text  # noqa: E402

REAL_DIR = DATA / "real"


def fmt_report(r) -> str:
    L = [f"== {r['source']}  [{r['format']}]{'  (DRY RUN)' if r['dry_run'] else ''}",
         f"   baris dibaca {r['rows']}, rekaman valid {r['records']}, bermasalah {r['n_errors']}"]
    for ind, lv in r["indicators"].items():
        L.append(f"   - {ind:11s} " + ", ".join(f"{l}: {v['regions']} wilayah ({v['coverage']:.0%})" for l, v in lv.items()))
    L += [f"   ! {w}" for w in r["warnings"]]
    L += [f"   x baris {e['row']}: {e['error']}" for e in r["errors"][:15]]
    if r["n_errors"] > 15:
        L.append(f"   … dan {r['n_errors'] - 15} masalah lain (lihat seed_report.txt)")
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="*")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--train", action="store_true")
    ap.add_argument("--drop-dummy-below", action="store_true")
    ap.add_argument("--no-recalc", action="store_true", help="jangan hitung ulang agregat kecamatan/kabupaten/provinsi")
    a = ap.parse_args(argv)
    files = [Path(f) for f in a.files] or sorted(p for p in REAL_DIR.glob("*.csv") if not p.name.startswith("_"))
    if not files:
        print(f"Tidak ada berkas. Letakkan CSV di {REAL_DIR} (lihat README.md di sana).")
        return 1
    init()
    c = connect()
    touched, lines = set(), []
    for f in files:
        text = f.read_text(encoding="utf-8-sig", errors="replace")
        rep = seed_text(c, text, f.stem, recalc=not a.no_recalc, drop_dummy_below=a.drop_dummy_below, dry=a.dry_run)
        touched |= set(rep.get("touched_indicators", []))
        lines.append(fmt_report(rep))
        print(lines[-1])
        if rep["n_errors"]:
            lines += [f"   x baris {e['row']}: {e['error']}" for e in rep["errors"][15:]]
    if not a.dry_run:
        c.commit()
    c.close()
    REAL_DIR.mkdir(parents=True, exist_ok=True)
    (REAL_DIR / "seed_report.txt").write_text("\n".join(lines), encoding="utf8")
    if a.train and not a.dry_run and touched:
        from ml.train import run
        n, v = run(indicators=sorted(touched))
        print(f"model dilatih ulang: {n} model, versi {v}")
    elif touched and not a.dry_run:
        print("Selesai. Jalankan `python -m ml.train` (atau Admin → Latih ulang) agar proyeksi memakai data nyata.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
