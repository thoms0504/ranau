import csv
import io
import json
import logging
import hashlib
import hmac
import secrets
import threading
import time
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import JSONResponse, Response

from . import services as S
from .config import ADMIN_PASSWORD, ADMIN_TOKEN, ADMIN_USER, CORS_ORIGINS, SESSION_HOURS, SESSION_SECRET, HORIZON, LEVELS, YEARS
from . import admin_data
from .db import db, init
from .indicators import BY_ID, INDICATORS, SUM_TYPE, THEMES

logging.basicConfig(level=logging.INFO, format='{"ts":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}')
log = logging.getLogger("ranau")
LAST = YEARS[-1]
def fcy():
    a, b = S.forecast_years()
    return list(range(a, b + 1))

LABEL = "Data dummy untuk pengembangan"

app = FastAPI(title="RANAU API", version="0.1.0", description="Sistem Prediksi dan Estimasi Kewilayahan Provinsi Lampung")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET", "POST", "PUT"], allow_headers=["*"])
init()
with db() as _c:   # job menggantung karena server berhenti
    _c.execute("UPDATE jobs SET status='failed', message='terhenti (server restart)' WHERE status='running'")
V1 = "/api/v1"


def check_level(level):
    if level not in LEVELS:
        raise HTTPException(400, f"level harus salah satu dari {LEVELS}")


def check_ind(ind):
    if ind not in BY_ID:
        raise HTTPException(404, f"indikator '{ind}' tidak ada")


def check_year(year, mode):
    if not (YEARS[0] <= year <= fcy()[-1]):
        raise HTTPException(400, f"tahun harus {YEARS[0]}–{fcy()[-1]}")
    if mode == "actual" and year > LAST:
        raise HTTPException(400, f"mode 'actual' hanya sampai {LAST}; gunakan 'forecast'")


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "RANAU API",
        "version": "0.1.0",
        "health": "/health",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    with db() as c:
        n = c.execute("SELECT COUNT(*) n FROM observations").fetchone()["n"]
        m = c.execute("SELECT COUNT(*) n FROM models WHERE is_active=1").fetchone()["n"]
    return dict(status="ok", observations=n, active_models=m)


def _meta_label():
    prov = S.provenance()
    shares = [x["real_share"] for k, x in prov.items() if k in BY_ID]
    n_real = sum(1 for s in shares if s > 0)
    if not n_real:
        return dict(is_dummy=True, status="dummy", label=LABEL, source="dummy-v1", real_indicators=0)
    status = "nyata" if all(s >= 0.9999 for s in shares) and len(shares) == len(BY_ID) else "campuran"
    label = "Data nyata" if status == "nyata" else f"Campuran data nyata dan dummy ({n_real} dari {len(BY_ID)} indikator memuat data nyata)"
    srcs = sorted({s for x in prov.values() for s in x["sources"]})
    return dict(is_dummy=status != "nyata", status=status, label=label, source=", ".join(srcs + (["dummy-v1"] if status != "nyata" else [])) or "dummy-v1", real_indicators=n_real)


@app.get(V1 + "/meta")
def meta():
    with db() as c:
        counts = {r["level"]: r["n"] for r in c.execute("SELECT level, COUNT(*) n FROM regions GROUP BY level")}
        trained = c.execute("SELECT MAX(trained_at) t, MAX(version) v FROM models WHERE is_active=1").fetchone()
    return dict(years=YEARS, forecast_years=fcy(), last_actual=LAST, levels=LEVELS, counts=counts,
                themes=THEMES, n_indicators=sum(1 for i in INDICATORS if not i["aux"]),
                **_meta_label(), model_version=trained["v"], trained_at=trained["t"])


@app.get(V1 + "/regions")
def regions(level: str | None = None, parent: str | None = None, q: str | None = None, limit: int = Query(500, le=5000)):
    sql, args = "SELECT id, name, level, parent_id, centroid_lng, centroid_lat, area_km2 FROM regions WHERE 1=1", []
    if level: sql += " AND level=?"; args.append(level)
    if parent: sql += " AND parent_id=?"; args.append(parent)
    if q: sql += " AND name LIKE ?"; args.append(f"%{q}%")
    with db() as c:
        return [dict(r) for r in c.execute(sql + " ORDER BY id LIMIT ?", (*args, limit))]


@app.get(V1 + "/search")
def search(q: str = Query(min_length=1), limit: int = 20):
    """Pencarian wilayah (semua level) untuk Ctrl K."""
    with db() as c:
        rows = c.execute("""SELECT r.id, r.name, r.level, r.parent_id, p.name AS parent_name FROM regions r LEFT JOIN regions p ON p.id=r.parent_id
                            WHERE r.name LIKE ? OR r.id LIKE ? ORDER BY CASE r.level WHEN 'kabupaten' THEN 0 WHEN 'kecamatan' THEN 1 ELSE 2 END,
                            r.name LIMIT ?""", (f"%{q}%", f"{q}%", limit)).fetchall()
    return [dict(r) for r in rows]


@app.get(V1 + "/geo/{level}")
def geo(level: str):
    check_level(level)
    return Response(S.geo_bytes(level), media_type="application/geo+json", headers={"Cache-Control": "public, max-age=3600"})


@app.get(V1 + "/indicators")
def indicators():
    with db() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM indicators")]
    for r in rows:
        r["key"] = bool(r.pop("key_indicator"))
        r["aux"] = BY_ID[r["id"]]["aux"]
        r["agg"] = "jumlah" if r["id"] in SUM_TYPE else "rata-rata"
        pv = S.provenance().get(r["id"], dict(real_share=0.0, sources=[]))
        r["real_share"], r["sources"], r["status"] = round(pv["real_share"], 4), pv["sources"], S.status_label(pv["real_share"])
    return rows


@app.get(V1 + "/data")
def data(indicator: str, year: int, level: str = "kabupaten", mode: str = "actual", base: int = LAST):
    check_ind(indicator); check_level(level)
    if mode not in ("actual", "forecast", "diff"):
        raise HTTPException(400, "mode: actual | forecast | diff")
    check_year(year, "actual" if mode == "actual" else "forecast")
    vals = S.region_values(indicator, level, year, mode, base)
    nums = [v["value"] for v in vals.values()]
    ind = BY_ID[indicator]
    return JSONResponse(dict(indicator=indicator, unit=ind["unit"], direction=ind["direction"], year=year, level=level, mode=mode,
                             is_forecast=year > LAST, is_dummy=True, label=LABEL, source="dummy-v1",
                             stats=dict(min=min(nums), max=max(nums), mean=sum(nums) / len(nums)) if nums else None,
                             values=vals), headers={"Cache-Control": "public, max-age=300"})


@app.get(V1 + "/filter")
def filter_(level: str, year: int, mode: str = "forecast", c: list[str] = Query(default=[])):
    """Filter gabungan AND. c = indikator:op:nilai (op: gt, gte, lt, lte). Contoh: c=stunting:gt:20&c=miskin:gt:12"""
    check_level(level)
    if not c:
        raise HTTPException(400, "minimal satu kondisi 'c'")
    try:
        ids = S.filter_regions(level, year, mode, c)
    except (ValueError, KeyError) as e:
        raise HTTPException(400, f"kondisi tidak valid: {e}")
    return dict(level=level, year=year, mode=mode, conditions=c, count=len(ids), ids=ids)


@app.get(V1 + "/regions/{rid}")
def region(rid: str):
    with db() as c:
        r = S.region_meta(c, rid)
        if not r:
            raise HTTPException(404, "wilayah tidak ditemukan")
        r["parent"] = S.region_meta(c, r["parent_id"]) if r["parent_id"] else None
        r["children"] = [dict(x) for x in c.execute("SELECT id, name, level FROM regions WHERE parent_id=? ORDER BY name", (rid,))]
    return r


@app.get(V1 + "/regions/{rid}/profile")
def profile(rid: str, year: int | None = None):
    """Seluruh indikator satu wilayah pada satu tahun (akumulasi/rata-rata tertimbang untuk kabupaten & kecamatan), dengan peringkat di antara saudara sewilayah induk."""
    year = year or LAST
    if not (YEARS[0] <= year <= fcy()[-1]):
        raise HTTPException(400, "tahun di luar rentang")
    mode = "forecast" if year > LAST else "actual"
    with db() as c:
        r = S.region_meta(c, rid)
    if not r:
        raise HTTPException(404, "wilayah tidak ditemukan")
    level, parent = r["level"], r["parent_id"]
    parent_level = {"desa": "kecamatan", "kecamatan": "kabupaten"}.get(level)
    items = []
    for i in INDICATORS:
        ind = i["id"]
        prov = {p["year"]: p["value"] for p in S.province_series(ind)}
        base = dict(indicator=ind, name=i["name"], theme=i["theme"], unit=i["unit"], direction=i["direction"], aux=i["aux"],
                    agg="jumlah" if ind in SUM_TYPE else "rata-rata", province_value=prov.get(year))
        if level == "provinsi":
            if year in prov:
                items.append(base | dict(value=prov[year], kind=mode, previous=prov.get(year - 1)))
            continue
        ys = S.series_all(ind, level).get(rid, {})
        cell = ys.get(year)
        if not cell:
            continue
        rk = S.ranking(ind, level, year, mode, parent)
        pv = None
        if parent_level:
            pv = S.series_all(ind, parent_level).get(parent, {}).get(year, {}).get("value")
        items.append(base | dict(value=cell["value"], kind=cell["kind"], lo80=cell.get("lo80"), hi80=cell.get("hi80"),
                                 previous=ys.get(year - 1, {}).get("value"), rank=rk.get(rid), of=len(rk), parent_value=pv))
    nm = S.names()
    return dict(region=r, parent=nm.get(parent), year=year, is_forecast=year > LAST, items=items, is_dummy=True, label=LABEL, source="dummy-v1")



@app.get(V1 + "/regions/{rid}/series")
def series(rid: str, indicator: str):
    check_ind(indicator)
    with db() as c:
        r = S.region_meta(c, rid)
        if not r:
            raise HTTPException(404, "wilayah tidak ditemukan")
        level = r["level"]
        parent = S.region_meta(c, r["parent_id"]) if r["parent_id"] else None
        model = S.model_info(c, indicator, level) if level in LEVELS else None
    if level == "provinsi":
        ps = S.province_series(indicator)
        return dict(region=r, indicator=BY_ID[indicator], actual=[dict(year=p["year"], value=p["value"], estimated=False) for p in ps if p["kind"] == "actual"],
                    forecast=[dict(year=p["year"], yhat=p["value"]) for p in ps if p["kind"] == "forecast"], model=None, comparison={}, ranks=[],
                    is_dummy=True, label=LABEL, source="dummy-v1")
    ys = S.series_all(indicator, level).get(rid)
    if not ys:
        raise HTTPException(404, "wilayah ini tidak memiliki data indikator (mis. kawasan hutan tanpa desa)")
    _flags = S.region_flags(ys)
    actual = [dict(year=y, value=v["value"], estimated=v["kind"] == "estimate", real=v.get("dummy") is False) for y, v in sorted(ys.items()) if v["kind"] != "forecast"]
    fc = [dict(year=y, yhat=v["value"], lo80=v["lo80"], hi80=v["hi80"], lo95=v["lo95"], hi95=v["hi95"]) for y, v in sorted(ys.items()) if v["kind"] == "forecast"]
    comp = {}
    if parent and parent["level"] in LEVELS:
        pys = S.series_all(indicator, parent["level"]).get(parent["id"], {})
        comp["parent"] = dict(id=parent["id"], name=parent["name"], series=[dict(year=y, value=v["value"]) for y, v in sorted(pys.items())])
    elif parent and parent["level"] == "provinsi":
        comp["parent"] = dict(id=parent["id"], name=parent["name"], series=[dict(year=p["year"], value=p["value"]) for p in S.province_series(indicator)])
    comp["province"] = dict(id="18", name="LAMPUNG", series=[dict(year=p["year"], value=p["value"]) for p in S.province_series(indicator)])
    ranks, n = [], len(S.region_values(indicator, level, LAST))
    for y in YEARS + fcy():
        rk = S.ranking(indicator, level, y, "actual" if y <= LAST else "forecast")
        if rid in rk:
            ranks.append(dict(year=y, rank=rk[rid], of=len(rk)))
    return dict(region=r, indicator=BY_ID[indicator], actual=actual, forecast=fc, model=model, comparison=comp, ranks=ranks,
                is_dummy=_flags[0], label=LABEL if _flags[0] else "Data nyata", source=_flags[1])


@app.get(V1 + "/rankings")
def rankings(indicator: str, year: int, level: str = "kabupaten", parent: str | None = None, limit: int = 50):
    check_ind(indicator); check_level(level)
    check_year(year, "forecast")
    vals = S.region_values(indicator, level, year, "forecast" if year > LAST else "actual")
    rk = S.ranking(indicator, level, year, "forecast" if year > LAST else "actual", parent)
    prev = S.ranking(indicator, level, year - 1, "forecast" if year - 1 > LAST else "actual", parent) if year > YEARS[0] else {}
    nm = S.names(level)
    rows = [dict(rank=n, id=r, name=nm[r]["name"], value=vals[r]["value"], kind=vals[r]["kind"], rank_change=(prev[r] - n) if r in prev else None)
            for r, n in sorted(rk.items(), key=lambda kv: kv[1])]
    return dict(indicator=indicator, year=year, level=level, total=len(rows), rows=rows[:limit], note="Peringkat 1 = terbaik menurut arah indikator.")


@app.get(V1 + "/attention")
def attention(year: int | None = None, level: str = "kabupaten"):
    year = year or fcy()[0]
    check_level(level)
    return S.attention(level, year) | dict(is_dummy=True, label=LABEL)


@app.get(V1 + "/highlights")
def highlights(year: int | None = None):
    year = year or fcy()[0]
    """Satu indikator kunci per tema: nilai terakhir provinsi dan proyeksi."""
    out, seen = [], set()
    for i in INDICATORS:
        if not i["key"] or i["theme"] in seen:
            continue
        seen.add(i["theme"])
        ps = {p["year"]: p for p in S.province_series(i["id"])}
        out.append(dict(theme=i["theme"], indicator=i["id"], name=i["name"], unit=i["unit"], direction=i["direction"],
                        last_year=LAST, last=ps[LAST]["value"], year=year, projected=ps.get(year, {}).get("value"),
                        previous=ps.get(LAST - 1, {}).get("value")))
    return dict(items=out, is_dummy=True, label=LABEL)


@app.get(V1 + "/models/metrics")
def model_metrics():
    with db() as c:
        rows = c.execute("SELECT * FROM models WHERE is_active=1 ORDER BY indicator_id, level").fetchall()
    out = []
    for r in rows:
        m = json.loads(r["metrics_json"], parse_constant=lambda _c: None)
        ch = m["candidates"][m["chosen"]]
        bs = m["candidates"][m["baseline_best"]]
        out.append(dict(model_id=r["id"], indicator=r["indicator_id"], indicator_name=BY_ID[r["indicator_id"]]["name"], level=r["level"], algo=m["chosen"],
                        label=m["chosen_label"], version=r["version"], trained_at=r["trained_at"], mae=ch["mae"], rmse=ch["rmse"], smape=ch["smape"],
                        backtest_folds=ch["folds"], backtest=m["backtest"], baseline=m["baseline_best"], baseline_mae=bs["mae"], beats_baseline=m["beats_baseline"],
                        coverage80=m["coverage80"], coverage95=m["coverage95"], n_regions=m["n_regions"], n_estimated=m.get("n_estimated", 0),
                        imputation=m.get("imputation"), candidates=m["candidates"], warnings=m["warnings"]))
    n = len(out)
    summary = dict(models=n, beat_baseline=sum(1 for o in out if o["beats_baseline"]),
                   coverage80_in_range=sum(1 for o in out if 0.7 <= o["coverage80"] <= 0.9))
    return dict(items=out, summary=summary, is_dummy=True, label=LABEL)


def _csv_rows(indicator, level, mode):
    ys = YEARS + fcy()
    nm = S.names(level)
    ser = S.series_all(indicator, level)
    for rid in sorted(ser):
        row = dict(region_id=rid, name=nm[rid]["name"], level=level, parent_id=nm[rid]["parent_id"], indicator=indicator)
        for y in ys:
            v = ser[rid].get(y)
            row[str(y)] = None if not v else round(v["value"], 3)
            row[f"{y}_jenis"] = "" if not v else {"actual": "aktual", "estimate": "estimasi", "forecast": "proyeksi"}[v["kind"]]
            if v and v["kind"] == "forecast":
                row[f"{y}_lo80"], row[f"{y}_hi80"] = round(v["lo80"], 3), round(v["hi80"], 3)
        row["is_dummy"], row["source"] = S.region_flags(ser[rid])
        yield row


@app.get(V1 + "/export")
def export(indicator: str, level: str = "kabupaten", format: str = "csv", year: int | None = None):
    year = year or fcy()[0]
    check_ind(indicator); check_level(level)
    if format == "csv":
        rows = list(_csv_rows(indicator, level, "all"))
        cols = list(rows[0].keys()) if rows else []
        for r in rows:
            for k in r:
                if k not in cols: cols.append(k)
        buf = io.StringIO()
        ml_ = _meta_label()
        buf.write(f"# {ml_['label']}. Sumber: {ml_['source']}. Indikator: {BY_ID[indicator]['name']} ({BY_ID[indicator]['unit']})\n")
        w = csv.DictWriter(buf, fieldnames=cols)
        w.writeheader(); w.writerows(rows)
        return Response(buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="ranau_{indicator}_{level}.csv"'})
    if format == "geojson":
        gj = json.loads(S.geo_bytes(level))
        ser = S.series_all(indicator, level)
        for f in gj["features"]:
            ys = ser.get(f["properties"]["region_id"], {})
            for y in YEARS + fcy():
                v = ys.get(y)
                f["properties"][f"v{y}"] = v["value"] if v else None
            fv = ys.get(year)
            if fv and fv["kind"] == "forecast":
                f["properties"].update(yhat=fv["value"], lo80=fv["lo80"], hi80=fv["hi80"], lo95=fv["lo95"], hi95=fv["hi95"])
            fl = S.region_flags(ys) if ys else (True, "")
            f["properties"].update(indicator=indicator, is_dummy=fl[0], source=fl[1])
        gj["metadata"] = dict(label=_meta_label()["label"], indicator=indicator, forecast_year=year)
        return Response(json.dumps(gj, ensure_ascii=False, separators=(",", ":")), media_type="application/geo+json",
                        headers={"Content-Disposition": f'attachment; filename="ranau_{indicator}_{level}.geojson"'})
    raise HTTPException(400, "format: csv | geojson")


# ---------- Admin ----------
def _sign(payload: str) -> str:
    return hmac.new(SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _make_session(user: str) -> str:
    payload = f"{user}.{int(time.time()) + SESSION_HOURS * 3600}"
    return f"{payload}.{_sign(payload)}"


def _valid_session(tok: str) -> bool:
    try:
        user, exp, sig = tok.rsplit(".", 2)
        return secrets.compare_digest(sig, _sign(f"{user}.{exp}")) and int(exp) > time.time()
    except Exception:  # noqa: BLE001
        return False


_fails: dict[str, list[float]] = {}


class LoginIn(BaseModel):
    username: str
    password: str


@app.post("/api/v1/admin/login")
def admin_login(body: LoginIn, request: Request):
    ip = request.client.host if request.client else "?"
    now = time.time()
    recent = [t for t in _fails.get(ip, []) if now - t < 600]
    if len(recent) >= 5:
        raise HTTPException(429, "terlalu banyak percobaan gagal, coba lagi beberapa menit lagi")
    ok = secrets.compare_digest(body.username.encode(), ADMIN_USER.encode()) & secrets.compare_digest(body.password.encode(), ADMIN_PASSWORD.encode())
    if not ok:
        _fails[ip] = recent + [now]
        time.sleep(0.6)
        raise HTTPException(401, "nama pengguna atau kata sandi salah")
    _fails.pop(ip, None)
    return dict(token=_make_session(body.username), expires_in=SESSION_HOURS * 3600, user=body.username)


def admin(authorization: str = Header(default=""), x_admin_token: str = Header(default="")):
    tok = x_admin_token or authorization.removeprefix("Bearer ").strip()
    if not (_valid_session(tok) or (tok and secrets.compare_digest(tok, ADMIN_TOKEN))):
        raise HTTPException(401, "sesi admin tidak valid atau kedaluwarsa, silakan masuk lagi")


@app.get("/api/v1/admin/me")
def admin_me(_: None = Depends(admin)):
    return dict(ok=True)


def _run_job(kind, fn):
    with db() as c:
        jid = c.execute("INSERT INTO jobs(kind,status,message,started_at) VALUES(?,?,?,?)", (kind, "running", "", datetime.now(timezone.utc).isoformat(timespec="seconds"))).lastrowid
    def work():
        try:
            msg = fn()
            status = "done"
        except Exception as e:  # noqa: BLE001
            log.exception("job gagal")
            msg, status = str(e), "failed"
        S.clear_cache()
        with db() as c:
            c.execute("UPDATE jobs SET status=?, message=?, finished_at=? WHERE id=?", (status, str(msg), datetime.now(timezone.utc).isoformat(timespec="seconds"), jid))
    threading.Thread(target=work, daemon=True).start()
    return jid


def _running():
    with db() as c:
        return c.execute("SELECT COUNT(*) n FROM jobs WHERE status='running'").fetchone()["n"] > 0


def _manual_count():
    with db() as c:
        return c.execute("SELECT COUNT(*) n FROM observations WHERE is_dummy=0 AND source<>'agregat'").fetchone()["n"]


@app.post(V1 + "/admin/generate-dummy", dependencies=[Depends(admin)])
def gen_dummy(seed: int = 42, missing: float = Query(0.05, ge=0, le=0.3), force: bool = False):
    if _running():
        raise HTTPException(409, "masih ada job berjalan")
    n = _manual_count()
    if n and not force:
        raise HTTPException(409, f"Ada {n} nilai data nyata/manual yang akan TERHAPUS. Ulangi dengan force=true bila yakin.")
    from ml.generate_dummy import generate
    return dict(job_id=_run_job("generate-dummy", lambda: generate(seed, missing)))


@app.get(V1 + "/admin/algos", dependencies=[Depends(admin)])
def algos():
    from ml.train import MODELS
    return [dict(id=k, label=v["label"], kind=v["kind"]) for k, v in MODELS.items()]


@app.post(V1 + "/admin/train", dependencies=[Depends(admin)])
def train(mode: str = "train", algo: str = "auto", indicator: str = "", level: str = "", horizon: int = Query(3, ge=1, le=5)):
    """mode=train: pilih model (algo=auto → terakurat menurut backtest; atau nama model tertentu) lalu prediksi.
    mode=predict: prediksi ulang dengan model yang sedang aktif (algoritma dipertahankan, data terbaru dipakai)."""
    if mode not in ("train", "predict"):
        raise HTTPException(400, "mode: train | predict")
    from ml.train import MODELS, run
    if algo != "auto" and algo not in MODELS:
        raise HTTPException(400, f"algo tidak dikenal; pilih auto atau {list(MODELS)}")
    inds = [x for x in indicator.split(",") if x]
    lvls = [x for x in level.split(",") if x]
    for x in inds:
        check_ind(x)
    for x in lvls:
        check_level(x)
    if _running():
        raise HTTPException(409, "masih ada job berjalan")

    def go():
        n, v = run(log=lambda s: None, indicators=inds or None, levels=lvls or None, algo=algo, horizon=horizon, mode=mode)
        return f"{n} model {'diprediksi ulang' if mode == 'predict' else 'dilatih'}, versi {v}, horizon {horizon} tahun"
    return dict(job_id=_run_job(mode, go))


class ObsIn(BaseModel):
    region_id: str
    indicator_id: str
    year: int
    value: float | None = None       # null = kosongkan (akan diestimasi)
    recompute: bool = True


class BulkIn(BaseModel):
    csv: str
    recompute: bool = True
    drop_dummy_below: bool = False


@app.get(V1 + "/admin/observations", dependencies=[Depends(admin)])
def get_obs(region_id: str, indicator_id: str):
    check_ind(indicator_id)
    with db() as c:
        r = S.region_meta(c, region_id)
        if not r:
            raise HTTPException(404, "wilayah tidak ditemukan")
        obs = {x["year"]: x for x in c.execute("SELECT year, value, is_dummy, source FROM observations WHERE region_id=? AND indicator_id=?", (region_id, indicator_id))}
        est = {x["year"]: x["value"] for x in c.execute("SELECT year, value FROM estimates WHERE region_id=? AND indicator_id=?", (region_id, indicator_id))}
    rows = []
    for y in YEARS:
        o = obs.get(y)
        rows.append(dict(year=y, value=o["value"] if o else None, source=o["source"] if o else None, is_dummy=bool(o["is_dummy"]) if o else None,
                         estimate=est.get(y), editable=r["level"] != "provinsi"))
    return dict(region=r, indicator=BY_ID[indicator_id], rows=rows)


@app.put(V1 + "/admin/observations", dependencies=[Depends(admin)])
def put_obs(b: ObsIn):
    with db() as c:
        try:
            admin_data.upsert(c, b.region_id, b.indicator_id, b.year, b.value, b.recompute)
        except ValueError as e:
            raise HTTPException(400, str(e))
    S.clear_cache()
    return dict(ok=True, note="Jalankan 'Latih ulang' atau 'Prediksi ulang' agar proyeksi memakai data ini.")


@app.post(V1 + "/admin/observations/bulk", dependencies=[Depends(admin)])
def bulk_obs(b: BulkIn):
    from .seeding import seed_text
    with db() as c:
        res = seed_text(c, b.csv, "unggah-admin", recalc=b.recompute, drop_dummy_below=b.drop_dummy_below)
    S.clear_cache()
    return dict(applied=res["records"], failed=res["n_errors"], errors=[dict(row=e["row"], data="", error=e["error"]) for e in res["errors"]],
                format=res["format"], warnings=res["warnings"], indicators=res["indicators"], note="Jalankan 'Latih ulang' atau 'Prediksi ulang' agar proyeksi memakai data ini.")


@app.get(V1 + "/admin/summary", dependencies=[Depends(admin)])
def admin_summary():
    with db() as c:
        manual = c.execute("SELECT COUNT(*) n FROM observations WHERE is_dummy=0 AND source<>'agregat'").fetchone()["n"]
        latest = c.execute("SELECT MAX(trained_at) t FROM models WHERE is_active=1").fetchone()["t"]
    return dict(manual_observations=manual, last_trained=latest)


@app.get(V1 + "/admin/jobs", dependencies=[Depends(admin)])
def jobs():
    with db() as c:
        return [dict(r) for r in c.execute("SELECT * FROM jobs ORDER BY id DESC LIMIT 20")]
