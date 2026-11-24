"""Seeder data nyata: baca CSV (tiga bentuk), cocokkan wilayah & indikator, tulis sebagai data nyata (is_dummy=0).

Bentuk yang dikenali (otomatis):
  A. panjang   : wilayah, indikator, tahun, nilai
  B. lebar-th  : wilayah, indikator, 2021, 2022, ...            (kolom tahun)
  C. lebar-ind : wilayah, tahun, <kolom indikator>, ...         (kolom = id/nama indikator)
Wilayah: kolom kode (region_id/kode/iddesa/kode_kec/…) ATAU kolom nama (desa/kelurahan, kecamatan, kabupaten) —
nama dicocokkan tanpa awalan "Kab./Kota/Kec./Desa/Kel." dan dipersempit memakai kolom induknya bila ada.
"""
import csv
import io
import re
from collections import defaultdict

from . import admin_data
from .config import YEARS
from .indicators import BY_ID, INDICATORS

LEVEL_ORDER = {"provinsi": 0, "kabupaten": 1, "kecamatan": 2, "desa": 3}
ID_COLS = ["region_id", "regionid", "id", "kode", "kode_wilayah", "kodewilayah", "iddesa", "id_desa", "kode_desa", "kodedesa",
           "kode_kec", "kodekec", "kode_kecamatan", "kode_kab", "kodekab", "kode_kabupaten", "kode_bps", "kode_kemendagri"]
DESA_COLS = ["desa", "kelurahan", "desa_kelurahan", "desa_kel", "nmdesa", "nama_desa", "nama_kelurahan"]
KEC_COLS = ["kecamatan", "kec", "nmkec", "nama_kecamatan"]
KAB_COLS = ["kabupaten", "kab", "kabkot", "kab_kota", "kabupaten_kota", "nmkab", "nama_kabupaten", "kota"]
ANY_NAME = ["wilayah", "nama", "name", "nama_wilayah", "daerah"]
IND_COLS = ["indikator", "indicator", "indicator_id", "indikator_id", "variabel", "variable"]
YEAR_COLS = ["tahun", "year", "thn"]
VAL_COLS = ["nilai", "value", "val", "angka"]
ALIASES = {  # kata kunci umum -> id indikator
    "penduduk miskin": "miskin", "kemiskinan": "miskin", "angka kemiskinan": "miskin", "p0": "miskin",
    "apk sma": "aps", "aps sma": "aps", "partisipasi sekolah": "aps", "lama sekolah": "rls", "rata rata lama sekolah": "rls", "rls": "rls",
    "imunisasi": "imunisasi", "imunisasi dasar lengkap": "imunisasi", "air minum layak": "air", "akses air minum": "air", "air layak": "air",
    "jalan baik": "jalan", "kondisi jalan baik": "jalan", "produksi padi": "padi", "usaha mikro": "umk", "umkm": "umk", "usaha mikro kecil": "umk",
    "jumlah penduduk": "penduduk", "populasi": "penduduk", "risiko banjir": "banjir", "risiko longsor": "longsor",
    "tata kelola": "tatakelola", "idm": "tatakelola", "realisasi apbdes": "apbdes", "apbdes": "apbdes", "stunting": "stunting",
}


def _hdr(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.strip().lower()).strip("_")


def _norm_name(s: str) -> str:
    s = re.sub(r"[^A-Z0-9 ]+", " ", s.upper())
    s = re.sub(r"^(KABUPATEN|KAB|KOTA|KECAMATAN|KEC|DESA|KELURAHAN|KEL|PEKON|TIYUH)\s+", "", s.strip())
    return re.sub(r"\s+", " ", s).strip()


def _norm_ind(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", s.lower())).strip()


def parse_number(x):
    """'1.234,5' -> 1234.5 ; '12,5' -> 12.5 ; '1,234.5' -> 1234.5 ; kosong/'-'/'NA' -> None."""
    if x is None:
        return None
    s = str(x).strip().replace(" ", "").replace("%", "")
    if s in ("", "-", "--", "na", "n/a", "NA", "N/A", "null", "NULL", "nan"):
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    elif s.count(".") > 1:
        s = s.replace(".", "")
    return float(s)


def read_table(text: str):
    text = text.lstrip("﻿").strip()
    if not text:
        return [], []
    first = text.splitlines()[0]
    delim = max([",", ";", "\t", "|"], key=first.count)
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    header = [_hdr(h) for h in rows[0]]
    return header, [dict(zip(header, r)) | {"__line": i + 2} for i, r in enumerate(rows[1:]) if any(c.strip() for c in r)]


class Resolver:
    def __init__(self, c):
        self.regs = {r["id"]: dict(r) for r in c.execute("SELECT id, name, level, parent_id FROM regions")}
        self.by_name = defaultdict(list)
        for r in self.regs.values():
            self.by_name[(r["level"], _norm_name(r["name"]))].append(r["id"])
        self.ind_ids = {i["id"] for i in INDICATORS}
        self.ind_names = {_norm_ind(i["name"]): i["id"] for i in INDICATORS}

    def _anc_name(self, rid, level):
        cur = self.regs.get(rid)
        while cur and cur["level"] != level:
            cur = self.regs.get(cur["parent_id"])
        return _norm_name(cur["name"]) if cur else None

    def region(self, row):
        for col in ID_COLS:
            v = (row.get(col) or "").strip()
            if v:
                digits = re.sub(r"\D", "", v.split(".0")[0] if re.fullmatch(r"\d+\.0", v) else v)
                if digits in self.regs:
                    return digits, None
                return None, f"kode wilayah '{v}' tidak dikenal"
        pick = lambda cols: next(((row.get(c) or "").strip() for c in cols if (row.get(c) or "").strip()), "")
        desa, kec, kab, anyn = pick(DESA_COLS), pick(KEC_COLS), pick(KAB_COLS), pick(ANY_NAME)
        if desa:
            level, name = "desa", desa
        elif kec:
            level, name = "kecamatan", kec
        elif kab:
            level, name = "kabupaten", kab
        elif anyn:
            level, name = None, anyn
        else:
            return None, "tidak ada kolom kode atau nama wilayah"
        levels = [level] if level else ["desa", "kecamatan", "kabupaten"]
        cands = [r for lv in levels for r in self.by_name.get((lv, _norm_name(name)), [])]
        if level == "desa" and kec:
            cands = [r for r in cands if self._anc_name(r, "kecamatan") == _norm_name(kec)] or cands
        if level in ("desa", "kecamatan") and kab:
            cands = [r for r in cands if self._anc_name(r, "kabupaten") == _norm_name(kab)] or cands
        if len(cands) == 1:
            return cands[0], None
        if not cands:
            return None, f"wilayah '{name}' tidak ditemukan"
        return None, f"nama '{name}' ambigu ({len(cands)} wilayah); tambahkan kolom kecamatan/kabupaten atau pakai kode"

    def indicator(self, s):
        s0 = (s or "").strip()
        if s0.lower() in self.ind_ids:
            return s0.lower()
        n = _norm_ind(s0)
        if n in self.ind_names:
            return self.ind_names[n]
        if n in ALIASES:
            return ALIASES[n]
        for k, v in ALIASES.items():
            if k in n:
                return v
        return None


def to_records(header, rows, rs: Resolver):
    """-> (records[(rid, ind, year, value, line)], errors[list], format_name)"""
    errors, recs = [], []
    hs = set(header)
    ind_col = next((c for c in IND_COLS if c in hs), None)
    year_col = next((c for c in YEAR_COLS if c in hs), None)
    val_col = next((c for c in VAL_COLS if c in hs), None)
    year_cols = [h for h in header if re.fullmatch(r"(19|20)\d\d", h)]

    def err(r, msg):
        errors.append(dict(row=r["__line"], error=msg))

    if ind_col and year_col and val_col:
        fmt = "panjang"
        for r in rows:
            rid, e = rs.region(r)
            ind = rs.indicator(r.get(ind_col))
            if e or not ind:
                err(r, e or f"indikator '{r.get(ind_col)}' tidak dikenal"); continue
            try:
                recs.append((rid, ind, int(float(r[year_col])), parse_number(r[val_col]), r["__line"]))
            except (ValueError, TypeError) as ex:
                err(r, f"nilai/tahun tidak valid: {ex}")
    elif ind_col and year_cols:
        fmt = "lebar per tahun"
        for r in rows:
            rid, e = rs.region(r)
            ind = rs.indicator(r.get(ind_col))
            if e or not ind:
                err(r, e or f"indikator '{r.get(ind_col)}' tidak dikenal"); continue
            for y in year_cols:
                try:
                    recs.append((rid, ind, int(y), parse_number(r.get(y)), r["__line"]))
                except ValueError as ex:
                    err(r, f"nilai tahun {y} tidak valid: {ex}")
    else:
        cols = {h: rs.indicator(h) for h in header if h not in set(ID_COLS + DESA_COLS + KEC_COLS + KAB_COLS + ANY_NAME + YEAR_COLS + ["__line"])}
        cols = {h: i for h, i in cols.items() if i}
        if not (year_col and cols):
            return [], [dict(row=0, error="format tidak dikenali: butuh (indikator+tahun+nilai), (indikator+kolom tahun), atau (tahun+kolom indikator)")], "?"
        fmt = "lebar per indikator"
        for r in rows:
            rid, e = rs.region(r)
            if e:
                err(r, e); continue
            try:
                y = int(float(r[year_col]))
            except (ValueError, TypeError):
                err(r, "tahun tidak valid"); continue
            for h, ind in cols.items():
                try:
                    recs.append((rid, ind, y, parse_number(r.get(h)), r["__line"]))
                except ValueError as ex:
                    err(r, f"nilai '{h}' tidak valid: {ex}")
    return recs, errors, fmt


def seed_text(c, text: str, source: str, recalc=True, drop_dummy_below=False, dry=False):
    """Terapkan satu berkas CSV. Mengembalikan laporan (dict)."""
    header, rows = read_table(text)
    rs = Resolver(c)
    recs, errors, fmt = to_records(header, rows, rs)
    good, per = [], defaultdict(lambda: defaultdict(set))   # per[ind][level] -> {region_id}
    for rid, ind, year, val, line in recs:
        if val is None:
            continue
        try:
            admin_data.validate(ind, year, val)
        except ValueError as ex:
            errors.append(dict(row=line, error=str(ex))); continue
        if rs.regs[rid]["level"] == "provinsi":
            errors.append(dict(row=line, error="level provinsi dihitung otomatis dari kabupaten; baris dilewati")); continue
        good.append((rid, ind, year, val))
        per[ind][rs.regs[rid]["level"]].add(rid)
    report = dict(format=fmt, source=source, rows=len(rows), records=len(good), errors=errors[:100], n_errors=len(errors), indicators={}, warnings=[], dry_run=dry)
    totals = {lv: sum(1 for r in rs.regs.values() if r["level"] == lv) for lv in LEVEL_ORDER}
    for ind, lv in per.items():
        report["indicators"][ind] = {l: dict(regions=len(ids), coverage=round(len(ids) / totals[l], 3)) for l, ids in lv.items()}
        finest = max(lv, key=lambda l: LEVEL_ORDER[l])
        for l, ids in lv.items():
            if len(ids) < totals[l]:
                report["warnings"].append(f"{BY_ID[ind]['name']}: level {l} baru {len(ids)}/{totals[l]} wilayah bernilai nyata; sisanya tetap dummy (atau diestimasi bila dikosongkan).")
        if finest != "desa" and not drop_dummy_below:
            report["warnings"].append(f"{BY_ID[ind]['name']}: data nyata hanya sampai level {finest}; level di bawahnya masih dummy dan bisa tidak konsisten. Gunakan --drop-dummy-below untuk menghapusnya.")
    if dry or not good:
        return report
    for rid, ind, year, val in good:
        c.execute("INSERT OR REPLACE INTO observations VALUES(?,?,?,?,0,?)", (rid, ind, year, val, source))
    if recalc:
        nodes = set()
        for rid, ind, year, _ in good:
            inds = [i["id"] for i in INDICATORS] if ind == "penduduk" else [ind]
            for anc in admin_data.ancestors(c, rid):
                for i in inds:
                    nodes.add((anc, year, i))
        admin_data.recompute_nodes(c, nodes)
    if drop_dummy_below:
        for ind, lv in per.items():
            finest = max(LEVEL_ORDER[l] for l in lv)
            below = [l for l, o in LEVEL_ORDER.items() if o > finest]
            for l in below:
                c.execute("DELETE FROM observations WHERE indicator_id=? AND is_dummy=1 AND region_id IN (SELECT id FROM regions WHERE level=?)", (ind, l))
    report["touched_indicators"] = sorted(per)
    return report
