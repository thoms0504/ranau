"""Input data manual (admin): validasi, upsert, agregasi ulang ke level induk."""
import csv
import io

from .config import YEARS
from .indicators import BY_ID, INDICATORS, PCT_TYPE, SUM_TYPE

MANUAL = "manual"


def validate(ind: str, year: int, value):
    if ind not in BY_ID:
        raise ValueError(f"indikator '{ind}' tidak dikenal")
    if year not in YEARS:
        raise ValueError(f"tahun harus {YEARS[0]}–{YEARS[-1]} (data aktual)")
    if value is None:
        return None
    v = float(value)
    if v != v or v in (float("inf"), float("-inf")):
        raise ValueError("nilai tidak valid")
    if ind in PCT_TYPE and not (0 <= v <= 100):
        raise ValueError(f"{BY_ID[ind]['name']} harus 0–100")
    if v < 0:
        raise ValueError("nilai tidak boleh negatif")
    return v


def _val(c, rid, ind, year):
    r = c.execute("SELECT value, is_dummy FROM observations WHERE region_id=? AND indicator_id=? AND year=?", (rid, ind, year)).fetchone()
    if r and r["value"] is not None:
        return r["value"], r["is_dummy"]
    e = c.execute("SELECT value FROM estimates WHERE region_id=? AND indicator_id=? AND year=?", (rid, ind, year)).fetchone()
    return (e["value"], 1) if e else (None, 1)


def ancestors(c, rid):
    chain, cur = [], c.execute("SELECT parent_id FROM regions WHERE id=?", (rid,)).fetchone()
    while cur and cur["parent_id"]:
        chain.append(cur["parent_id"])
        cur = c.execute("SELECT parent_id FROM regions WHERE id=?", (cur["parent_id"],)).fetchone()
    return chain


def _is_real(c, rid, ind, year):
    r = c.execute("SELECT is_dummy, source, value FROM observations WHERE region_id=? AND indicator_id=? AND year=?", (rid, ind, year)).fetchone()
    return bool(r) and r["value"] is not None and r["is_dummy"] == 0 and r["source"] != "agregat"


def agg_node(c, anc, year, ind):
    """Hitung agregat satu wilayah dari anak-anaknya: jumlah (padi, usaha, penduduk) atau rata-rata tertimbang penduduk.
    Nilai yang diinput langsung (nyata/manual) pada wilayah itu tidak ditimpa."""
    if _is_real(c, anc, ind, year):
        return
    kids = [r["id"] for r in c.execute("SELECT id FROM regions WHERE parent_id=?", (anc,))]
    vals = []
    for k in kids:
        v, d = _val(c, k, ind, year)
        if v is None:
            continue
        w, _ = _val(c, k, "penduduk", year)
        vals.append((v, w, d))
    if not vals:
        return
    if ind in SUM_TYPE:
        agg = sum(v for v, _, _ in vals)
    else:
        ws = [w for _, w, _ in vals]
        agg = (sum(v * (w or 0) for v, w, _ in vals) / sum(ws)) if all(w for w in ws) and sum(ws) > 0 else sum(v for v, _, _ in vals) / len(vals)
    dummy = 1 if any(d for _, _, d in vals) else 0
    c.execute("INSERT OR REPLACE INTO observations VALUES(?,?,?,?,?,?)", (anc, ind, year, round(agg, 2), dummy, "agregat"))


def recompute(c, rid, year, inds):
    for anc in ancestors(c, rid):
        for ind in inds:
            agg_node(c, anc, year, ind)


def recompute_nodes(c, nodes):
    """nodes: himpunan (region_id_induk, tahun, indikator). Dihitung dari bawah ke atas (kecamatan → kabupaten → provinsi)."""
    for _, anc, year, ind in sorted(((-len(a), a, y, i) for a, y, i in nodes)):
        agg_node(c, anc, year, ind)


def upsert(c, rid, ind, year, value, recalc=True):
    reg = c.execute("SELECT id, level FROM regions WHERE id=?", (rid,)).fetchone()
    if not reg:
        raise ValueError(f"wilayah '{rid}' tidak ditemukan")
    if reg["level"] == "provinsi":
        raise ValueError("level provinsi dihitung otomatis dari agregat; ubah data kabupaten/kota")
    v = validate(ind, year, value)
    if v is None:
        c.execute("INSERT OR REPLACE INTO observations VALUES(?,?,?,?,?,?)", (rid, ind, year, None, 0, MANUAL))
    else:
        c.execute("INSERT OR REPLACE INTO observations VALUES(?,?,?,?,?,?)", (rid, ind, year, v, 0, MANUAL))
    if recalc:
        recompute(c, rid, year, [i["id"] for i in INDICATORS] if ind == "penduduk" else [ind])


def parse_csv(text: str):
    """Kolom: region_id, indicator_id, year, value (pemisah , ; atau tab; header opsional)."""
    text = text.strip()
    if not text:
        return []
    delim = "\t" if "\t" in text.splitlines()[0] else (";" if text.splitlines()[0].count(";") > text.splitlines()[0].count(",") else ",")
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    if rows and rows[0] and rows[0][0].strip().lower() in ("region_id", "id", "wilayah"):
        rows = rows[1:]
    return rows


def bulk(c, text: str, recalc=True):
    ok, errors, touched = 0, [], set()
    for n, r in enumerate(parse_csv(text), start=1):
        try:
            if len(r) < 4:
                raise ValueError("butuh 4 kolom: region_id, indicator_id, year, value")
            rid, ind, year, val = r[0].strip(), r[1].strip(), int(r[2]), r[3].strip().replace(",", ".")
            upsert(c, rid, ind, year, None if val == "" else float(val), recalc=False)
            touched.add((rid, ind, year))
            ok += 1
        except (ValueError, TypeError) as e:
            errors.append(dict(row=n, data=",".join(r)[:120], error=str(e)))
    if recalc:   # agregasi sekali per (wilayah, tahun, indikator) di akhir
        done = set()
        for rid, ind, year in touched:
            inds = tuple(i["id"] for i in INDICATORS) if ind == "penduduk" else (ind,)
            key = (rid, year, inds)
            if key not in done:
                recompute(c, rid, year, inds)
                done.add(key)
    return dict(applied=ok, failed=len(errors), errors=errors[:50])
