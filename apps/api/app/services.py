"""Akses data & perhitungan turunan (peringkat, perhatian, filter)."""
import json
from functools import lru_cache

from .config import PROCESSED, YEARS
from .db import db
from .indicators import BY_ID, INDICATORS, SUM_TYPE

LAST = YEARS[-1]
_cache: dict = {}


def clear_cache():
    _cache.clear()
    geo_bytes.cache_clear()


def indicator_or_404(ind):
    if ind not in BY_ID:
        raise KeyError(f"indikator '{ind}' tidak dikenal")
    return BY_ID[ind]


def series_all(ind, level):
    """{region_id: {year: dict(value, lo80, hi80, lo95, hi95, kind)}} untuk semua tahun (aktual+estimasi+proyeksi)."""
    key = (ind, level)
    if key in _cache:
        return _cache[key]
    out: dict = {}
    with db() as c:
        for r in c.execute("SELECT o.region_id rid, o.year, o.value, o.is_dummy, o.source FROM observations o JOIN regions g ON g.id=o.region_id "
                           "WHERE o.indicator_id=? AND g.level=? AND o.value IS NOT NULL", (ind, level)):
            out.setdefault(r["rid"], {})[r["year"]] = dict(value=r["value"], kind="actual", dummy=bool(r["is_dummy"]), source=r["source"])
        for r in c.execute("SELECT e.region_id rid, e.year, e.value FROM estimates e JOIN regions g ON g.id=e.region_id "
                           "WHERE e.indicator_id=? AND g.level=?", (ind, level)):
            out.setdefault(r["rid"], {})[r["year"]] = dict(value=r["value"], kind="estimate")
        for r in c.execute("SELECT f.region_id rid, f.year, f.yhat, f.lo80, f.hi80, f.lo95, f.hi95 FROM forecasts f "
                           "JOIN models m ON m.id=f.model_id WHERE m.is_active=1 AND f.indicator_id=? AND m.level=?", (ind, level)):
            out.setdefault(r["rid"], {})[r["year"]] = dict(value=r["yhat"], lo80=r["lo80"], hi80=r["hi80"], lo95=r["lo95"], hi95=r["hi95"], kind="forecast")
    _cache[key] = out
    return out


def forecast_years():
    if "fy" in _cache:
        return _cache["fy"]
    with db() as c:
        r = c.execute("SELECT MIN(year) a, MAX(year) b FROM forecasts").fetchone()
    _cache["fy"] = (r["a"], r["b"]) if r["a"] else (LAST + 1, LAST + 1)
    return _cache["fy"]


def region_values(ind, level, year, mode="actual", base=LAST):
    """{region_id: dict(value, kind, lo80, hi80)} untuk satu tahun dan mode."""
    S = series_all(ind, level)
    out = {}
    for rid, ys in S.items():
        cur = ys.get(year)
        if not cur:
            continue
        if mode == "diff":
            b = ys.get(base)
            if not b:
                continue
            out[rid] = dict(value=round(cur["value"] - b["value"], 4), kind=cur["kind"], base=b["value"], current=cur["value"])
        else:
            out[rid] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in cur.items()}
    return out


def province_series(ind):
    """Deret provinsi: dari agregat kabupaten (proyeksi ditimbang proyeksi penduduk)."""
    S, P = series_all(ind, "kabupaten"), series_all("penduduk", "kabupaten")
    years = sorted({y for v in S.values() for y in v})
    out = []
    for y in years:
        vals = [(S[r][y]["value"], P[r][y]["value"]) for r in S if y in S[r] and r in P and y in P[r]]
        if not vals:
            continue
        v = sum(a for a, _ in vals) if ind in SUM_TYPE else sum(a * w for a, w in vals) / sum(w for _, w in vals)
        kinds = {S[r][y]["kind"] for r in S if y in S[r]}
        out.append(dict(year=y, value=round(v, 4), kind="forecast" if "forecast" in kinds else "actual"))
    return out


def ranking(ind, level, year, mode="actual", parent=None):
    """Peringkat 1 = terbaik menurut arah indikator (neutral: nilai terbesar = 1). parent: batasi pada anak wilayah tertentu."""
    d = region_values(ind, level, year, mode)
    if parent:
        nm = names(level)
        d = {r: x for r, x in d.items() if nm[r]["parent_id"] == parent}
    low_good = BY_ID[ind]["direction"] == "low"
    ordered = sorted(d.items(), key=lambda kv: kv[1]["value"], reverse=not low_good)
    return {rid: i + 1 for i, (rid, _) in enumerate(ordered)}


def region_meta(c, rid):
    r = c.execute("SELECT * FROM regions WHERE id=?", (rid,)).fetchone()
    return dict(r) if r else None


def names(level=None):
    with db() as c:
        q = "SELECT id, name, level, parent_id FROM regions" + (" WHERE level=?" if level else "")
        return {r["id"]: dict(r) for r in c.execute(q, (level,) if level else ())}


def attention(level, year, per=3):
    """Per indikator berarah jelas: `per` wilayah dengan nilai proyeksi terburuk; dijumlahkan per wilayah."""
    nm = names(level)
    per_ind, count = [], {}
    for i in INDICATORS:
        if i["direction"] == "neutral":
            continue
        d = region_values(i["id"], level, year, "forecast" if year > LAST else "actual")
        worst = sorted(d.items(), key=lambda kv: kv[1]["value"], reverse=(i["direction"] == "low"))[:per]
        per_ind.append(dict(indicator=i["id"], name=i["name"], unit=i["unit"], direction=i["direction"],
                            regions=[dict(id=r, name=nm[r]["name"], value=v["value"]) for r, v in worst]))
        for r, _ in worst:
            count.setdefault(r, []).append(i["id"])
    top = sorted(count.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:per]
    return dict(year=year, level=level, regions=[dict(id=r, name=nm[r]["name"], parent_id=nm[r]["parent_id"], count=len(v), indicators=v) for r, v in top],
                per_indicator=per_ind,
                method=f"Untuk setiap indikator berarah jelas (rendah-baik atau tinggi-baik), diambil {per} wilayah dengan nilai proyeksi terburuk "
                       f"pada tahun {year}. Jumlah kemunculan tiap wilayah dihitung lintas indikator; indikator netral tidak ikut. "
                       "Ini penanda awal untuk ditelusuri, bukan penilaian kinerja.")


OPS = {"gt": lambda a, b: a > b, "gte": lambda a, b: a >= b, "lt": lambda a, b: a < b, "lte": lambda a, b: a <= b}


def filter_regions(level, year, mode, conds):
    """conds: daftar 'indikator:op:nilai' digabung AND. Mengembalikan id wilayah yang memenuhi semuanya."""
    result = None
    for cond in conds:
        ind, op, val = cond.split(":")
        indicator_or_404(ind)
        d = region_values(ind, level, year, mode)
        ok = {r for r, v in d.items() if OPS[op](v["value"], float(val))}
        result = ok if result is None else result & ok
    return sorted(result or [])


@lru_cache(maxsize=8)
def geo_bytes(level):
    return (PROCESSED / f"{level}.geojson").read_bytes()


def model_info(c, ind, level):
    r = c.execute("SELECT * FROM models WHERE indicator_id=? AND level=? AND is_active=1", (ind, level)).fetchone()
    if not r:
        return None
    m = json.loads(r["metrics_json"], parse_constant=lambda _c: None)
    return dict(id=r["id"], algo=r["algo"], label=m.get("chosen_label"), version=r["version"], trained_at=r["trained_at"],
                metrics=m["candidates"][m["chosen"]], baseline=m["candidates"][m["baseline_best"]], baseline_name=m["baseline_best"],
                beats_baseline=m["beats_baseline"], coverage80=m["coverage80"], coverage95=m["coverage95"], warnings=m["warnings"],
                features=m["features"], backtest=m["backtest"])


def provenance():
    """Asal data per indikator: porsi nilai nyata (bukan dummy) dan daftar sumber nyata. Agregat turunan tidak dihitung."""
    if "prov" in _cache:
        return _cache["prov"]
    out = {}
    with db() as c:
        for r in c.execute("SELECT indicator_id i, SUM(CASE WHEN is_dummy=0 THEN 1 ELSE 0 END) real, COUNT(*) n FROM observations "
                           "WHERE value IS NOT NULL AND source<>'agregat' GROUP BY indicator_id"):
            out[r["i"]] = dict(real_share=(r["real"] / r["n"]) if r["n"] else 0.0, sources=[])
        for r in c.execute("SELECT DISTINCT indicator_id i, source s FROM observations WHERE is_dummy=0 AND source<>'agregat'"):
            out.setdefault(r["i"], dict(real_share=0.0, sources=[]))["sources"].append(r["s"])
    _cache["prov"] = out
    return out


def status_label(share: float) -> str:
    return "dummy" if share <= 0 else "nyata" if share >= 0.9999 else "campuran"


def region_flags(ys: dict):
    """(is_dummy, sumber) untuk satu deret wilayah-indikator dari sel aktualnya."""
    act = [c for c in ys.values() if c.get("kind") == "actual"]
    dummy = any(c.get("dummy") for c in act) if act else True
    srcs = sorted({c["source"] for c in act if c.get("source")})
    return dummy, ", ".join(srcs) or "dummy-v1"
