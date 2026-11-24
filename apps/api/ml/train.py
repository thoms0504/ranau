"""Pelatihan: estimasi sel kosong, baseline, model pooled ridge, backtest, interval, forecast.
   python -m ml.train
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import HORIZON, LEVELS, YEARS  # noqa: E402
from app.db import connect  # noqa: E402
from app.indicators import INDICATORS, PCT_TYPE, SUM_TYPE  # noqa: E402

Z80, Z95 = 1.2816, 1.96
SMAPE_WARN, COV_LO, COV_HI = 15.0, 0.70, 0.90
RIDGE = 1.0
T = len(YEARS)


# ---------- util metrik ----------
def _finite(o):
    """Ganti NaN/Inf dengan None agar JSON valid."""
    if isinstance(o, float):
        return o if np.isfinite(o) else None
    if isinstance(o, dict):
        return {k: _finite(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_finite(v) for v in o]
    return o


def mae(a, b): return float(np.mean(np.abs(a - b)))
def rmse(a, b): return float(np.sqrt(np.mean((a - b) ** 2)))
def smape(a, b): return float(np.mean(2 * np.abs(a - b) / (np.abs(a) + np.abs(b) + 1e-9)) * 100)


def to_space(Y, ind):   # model dikerjakan di ruang log untuk besaran count
    return np.log1p(Y) if ind in SUM_TYPE else Y


def from_space(Y, ind):
    if ind in SUM_TYPE: return np.maximum(np.expm1(Y), 0)
    if ind in PCT_TYPE: return np.clip(Y, 0, 100)
    return Y


# ---------- estimasi (imputasi) ----------
def impute(Y, iters=4):
    """Y [n,T] dengan NaN. Model: efek tahun bersama + garis tren per wilayah (fit pada sel teramati)."""
    obs = ~np.isnan(Y)
    if obs.all():
        return Y.copy(), obs
    F = np.where(obs, Y, np.nanmean(Y, axis=1, keepdims=True))
    F = np.where(np.isnan(F), np.nanmean(Y), F)
    x = np.arange(T, dtype=float)
    yfx = np.zeros(T)
    for _ in range(iters):
        R = np.where(obs, Y - yfx[None, :], np.nan)
        w = obs.astype(float)
        xm = (w * x).sum(1, keepdims=True) / w.sum(1, keepdims=True)
        ym = np.nansum(R, 1, keepdims=True) / w.sum(1, keepdims=True)
        sxx = (w * (x - xm) ** 2).sum(1, keepdims=True)
        sxy = (w * (x - xm) * np.nan_to_num(R - ym)).sum(1, keepdims=True)
        slope = np.where(sxx > 1e-9, sxy / np.maximum(sxx, 1e-9), 0)
        fit = ym + slope * (x[None, :] - xm)
        resid = np.where(obs, Y - fit, np.nan)
        yfx = np.nan_to_num(np.nanmean(resid, axis=0))
        yfx -= yfx.mean()
    pred = fit + yfx[None, :]
    return np.where(obs, Y, pred), obs


def impute_quality(Y, rng):
    """Sembunyikan 5% sel teramati, imputasi, bandingkan dengan nilai sebenarnya dan baseline (rata-rata wilayah)."""
    obs = ~np.isnan(Y)
    hide = obs & (rng.random(Y.shape) < 0.05)
    Y2 = np.where(hide, np.nan, Y)
    est, _ = impute(Y2)
    base = np.where(np.isnan(Y2), np.nanmean(Y2, axis=1, keepdims=True), Y2)
    return dict(n=int(hide.sum()), mae=mae(Y[hide], est[hide]), mae_baseline=mae(Y[hide], base[hide]))


# ---------- model ----------
def ols_forecast(S, t, H):
    """Regresi tren linier pada S[:, :t+1] -> prediksi t+1..t+H."""
    x = np.arange(t + 1, dtype=float)
    xm, Ym = x.mean(), S[:, :t + 1].mean(1, keepdims=True)
    slope = ((x - xm) * (S[:, :t + 1] - Ym)).sum(1, keepdims=True) / ((x - xm) ** 2).sum()
    steps = np.arange(1, H + 1)[None, :]
    return S[:, t:t + 1] * 0 + Ym + slope * (t + steps - xm)


def naive_forecast(S, t, H): return np.repeat(S[:, t:t + 1], H, 1)


def ma_forecast(S, t, H): return np.repeat(S[:, max(0, t - 2):t + 1].mean(1, keepdims=True), H, 1)


def feats(S, t, parent):
    """Fitur pada origin t (t>=1): beda terakhir, tren sejak awal, tren rata-rata induk (shrinkage/spasial)."""
    d1 = S[:, t] - S[:, t - 1]
    x = np.arange(t + 1, dtype=float)
    sl = ((x - x.mean()) * (S[:, :t + 1] - S[:, :t + 1].mean(1, keepdims=True))).sum(1) / ((x - x.mean()) ** 2).sum()
    pm = np.zeros_like(sl)
    for g in np.unique(parent):
        ix = parent == g
        pm[ix] = sl[ix].mean()
    pd1 = np.zeros_like(d1)
    for g in np.unique(parent):
        ix = parent == g
        pd1[ix] = d1[ix].mean()
    return np.stack([d1, sl, pm, pd1], 1)


def fit_ridge(S, parent, tmax):
    """Latih pada origin 1..tmax-1 dengan semua horizon yang targetnya <= tmax. Target = (y_{t+h}-y_t)/h."""
    X, y = [], []
    for t in range(1, tmax):
        Ft = feats(S, t, parent)
        for h in range(1, tmax - t + 1):
            X.append(Ft); y.append((S[:, t + h] - S[:, t]) / h)
    X, y = np.vstack(X), np.concatenate(y)
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Xs = np.c_[np.ones(len(X)), (X - mu) / sd]
    P = np.eye(Xs.shape[1]) * RIDGE; P[0, 0] = 0
    beta = np.linalg.solve(Xs.T @ Xs + P, Xs.T @ y)
    return dict(beta=beta, mu=mu, sd=sd)


def ridge_forecast(S, t, H, parent, tmax):
    m = fit_ridge(S, parent, tmax)
    step = np.c_[np.ones(S.shape[0]), (feats(S, t, parent) - m["mu"]) / m["sd"]] @ m["beta"]
    return S[:, t:t + 1] + step[:, None] * np.arange(1, H + 1)[None, :], m


def damped_forecast(S, t, H, phi=0.8):
    """Tren linier teredam: level = campuran nilai terakhir & garis OLS, kemiringan diredam phi^k."""
    x = np.arange(t + 1, dtype=float)
    Ym = S[:, :t + 1].mean(1, keepdims=True)
    slope = ((x - x.mean()) * (S[:, :t + 1] - Ym)).sum(1, keepdims=True) / ((x - x.mean()) ** 2).sum()
    level = 0.5 * S[:, t:t + 1] + 0.5 * (Ym + slope * (t - x.mean()))
    cum = np.cumsum(phi ** np.arange(1, H + 1))[None, :]
    return level + slope * cum


def _xy(S, parent, tmax):
    X, y = [], []
    for t in range(1, tmax):
        Ft = feats(S, t, parent)
        for h in range(1, tmax - t + 1):
            X.append(Ft); y.append((S[:, t + h] - S[:, t]) / h)
    return np.vstack(X), np.concatenate(y)


def gbm_forecast(S, t, H, parent, tmax, rounds=60, lr=0.1):
    """Gradient boosting dengan decision stump (numpy murni) pada fitur yang sama dengan ridge."""
    X, y = _xy(S, parent, tmax)
    if len(y) > 20000:
        ix = np.random.default_rng(0).choice(len(y), 20000, replace=False); X, y = X[ix], y[ix]
    base = y.mean(); r = y - base
    cuts = [np.unique(np.quantile(X[:, j], np.linspace(0.1, 0.9, 9))) for j in range(X.shape[1])]
    stumps = []
    for _ in range(rounds):
        best = None
        for j, cs in enumerate(cuts):
            for c in cs:
                m = X[:, j] <= c
                nl, nr = m.sum(), (~m).sum()
                if nl < 5 or nr < 5: continue
                ml, mr = r[m].mean(), r[~m].mean()
                gain = nl * ml ** 2 + nr * mr ** 2
                if best is None or gain > best[0]: best = (gain, j, c, ml, mr)
        if best is None: break
        _, j, c, ml, mr = best
        stumps.append((j, c, lr * ml, lr * mr))
        r = r - np.where(X[:, j] <= c, lr * ml, lr * mr)
    F = feats(S, t, parent)
    step = np.full(F.shape[0], base)
    for j, c, a, b in stumps:
        step += np.where(F[:, j] <= c, a, b)
    return S[:, t:t + 1] + step[:, None] * np.arange(1, H + 1)[None, :]


# ---------- registri model: tambahkan model baru cukup dengan satu entri ----------
# fn(S, t, H, parent, tmax, done) -> prediksi [n,H]; `done` berisi keluaran model sebelumnya (untuk ensemble).
MODELS = {
    "naive":        dict(kind="baseline", label="Naive (nilai terakhir)", fn=lambda S, t, H, p, tm, d: naive_forecast(S, t, H)),
    "linear":       dict(kind="baseline", label="Regresi linier tren", fn=lambda S, t, H, p, tm, d: ols_forecast(S, t, H)),
    "ma3":          dict(kind="baseline", label="Rata-rata bergerak 3 tahun", fn=lambda S, t, H, p, tm, d: ma_forecast(S, t, H)),
    "damped":       dict(kind="ml", label="Tren teredam (damped)", fn=lambda S, t, H, p, tm, d: damped_forecast(S, t, H)),
    "pooled_ridge": dict(kind="ml", label="Ridge pooled (tren + shrinkage induk)", fn=lambda S, t, H, p, tm, d: ridge_forecast(S, t, H, p, tm)[0]),
    "pooled_gbm":   dict(kind="ml", label="Gradient boosting pooled", fn=lambda S, t, H, p, tm, d: gbm_forecast(S, t, H, p, tm)),
    "ensemble":     dict(kind="ml", label="Ensemble linier + ridge pooled", fn=lambda S, t, H, p, tm, d: 0.5 * d["linear"] + 0.5 * d["pooled_ridge"]),
    "ensemble_ml":  dict(kind="ml", label="Ensemble ML (ridge + GBM + damped + linier)",
                         fn=lambda S, t, H, p, tm, d: (d["pooled_ridge"] + d["pooled_gbm"] + d["damped"] + d["linear"]) / 4),
}
CANDS = {k: v["label"] for k, v in MODELS.items()}
BASELINES = tuple(k for k, v in MODELS.items() if v["kind"] == "baseline")
ML_MODELS = tuple(k for k, v in MODELS.items() if v["kind"] == "ml")


def run_all(S, t, H, parent, tmax):
    out = {}
    for k, m in MODELS.items():          # urutan definisi: ensemble dihitung setelah komponennya
        out[k] = m["fn"](S, t, H, parent, tmax, out)
    return out, ridge_forecast(S, t, 1, parent, tmax)[1]


def backtest(S, parent, ind):
    """Rolling origin: latih 2021-23 -> 2024 ; latih 2021-24 -> 2025. Mengembalikan galat per model per fold (ruang asli)."""
    res = {k: [] for k in CANDS}
    actual = []
    for t in (2, 3):
        fc, _ = run_all(S, t, 1, parent, t)
        a = from_space(S[:, t + 1], ind)
        actual.append(a)
        for k in CANDS:
            res[k].append(from_space(fc[k][:, 0], ind) - a)
    return res, actual


def metrics_block(res, actual):
    A = np.concatenate(actual)
    out = {}
    for k, r in res.items():
        E = np.concatenate(r)
        out[k] = dict(mae=float(np.mean(np.abs(E))), rmse=float(np.sqrt(np.mean(E ** 2))),
                      smape=float(np.mean(2 * np.abs(E) / (np.abs(A + E) + np.abs(A) + 1e-9)) * 100),
                      folds=[float(np.mean(np.abs(x))) for x in r])
    return out


def train_one(Yfull, parent, ind, level, rng, algo="auto", horizon=HORIZON):
    """Yfull: matriks lengkap (teramati + estimasi) [n,T]. algo='auto' memilih model terakurat (ML hanya bila
    mengalahkan baseline terbaik); nama model memaksa model tersebut. Kembalikan metrik, forecast & interval."""
    S = to_space(Yfull, ind)
    res, actual = backtest(S, parent, ind)
    mets = metrics_block(res, actual)
    base_best = min(BASELINES, key=lambda k: mets[k]["mae"])
    ml_best = min(ML_MODELS, key=lambda k: mets[k]["mae"])
    beats = mets[ml_best]["mae"] < mets[base_best]["mae"]
    if algo != "auto" and algo in MODELS:
        chosen = algo
        beats = MODELS[algo]["kind"] == "ml" and mets[algo]["mae"] < mets[base_best]["mae"]
    else:
        chosen = ml_best if beats else base_best
    # cakupan interval jujur: sigma dari fold-1 dipakai pada fold-2
    r1, r2 = res[chosen]
    s1 = _robust_sigma(r1, actual[0], ind)
    cover80 = float(np.mean(np.abs(r2) <= Z80 * s1 * _scale(actual[1], r2.shape)))
    cover95 = float(np.mean(np.abs(r2) <= Z95 * s1 * _scale(actual[1], r2.shape)))
    sigma = _robust_sigma(np.concatenate([r1, r2]), np.concatenate(actual), ind)
    # forecast final dari origin 2025
    fc, model = run_all(S, T - 1, horizon, parent, T - 1)
    pred = from_space(fc[chosen], ind)
    h = np.arange(1, horizon + 1)[None, :]
    sc = _scale(Yfull[:, T - 1:T], (Yfull.shape[0], 1)) if ind in SUM_TYPE else 1.0   # galat count proporsional
    width = sigma * np.sqrt(h) * sc
    out = {}
    for name, z in (("80", Z80), ("95", Z95)):
        lo, hi = pred - z * width, pred + z * width
        if ind in PCT_TYPE: lo, hi = np.clip(lo, 0, 100), np.clip(hi, 0, 100)
        else: lo = np.maximum(lo, 0)
        out[name] = (lo, hi)
    warn = []
    if algo != "auto" and algo in MODELS:
        warn.append(f"Algoritma dipilih manual: {MODELS[algo]['label']}.")
        if MODELS[algo]["kind"] == "ml" and not beats:
            warn.append("Model pilihan manual tidak mengalahkan baseline terbaik pada backtest.")
    elif not beats: warn.append("Model ML tidak mengalahkan baseline pada backtest; baseline dipakai.")
    if mets[chosen]["smape"] > SMAPE_WARN: warn.append(f"sMAPE {mets[chosen]['smape']:.1f}% di atas ambang {SMAPE_WARN:.0f}%.")
    if not (COV_LO <= cover80 <= COV_HI): warn.append(f"Cakupan interval 80% = {cover80:.0%} di luar rentang {COV_LO:.0%}–{COV_HI:.0%}.")
    warn.append("Hanya 5 titik waktu per deret; interpretasikan proyeksi sebagai penanda awal.")
    metrics = dict(candidates=mets, chosen=chosen, chosen_label=CANDS[chosen], baseline_best=base_best, beats_baseline=bool(beats),
                   coverage80=cover80, coverage95=cover95, sigma=float(sigma), n_regions=int(Yfull.shape[0]),
                   train_years=[YEARS[0], YEARS[-1]], backtest="latih 2021–2023→2024; latih 2021–2024→2025",
                   warnings=warn, features=["beda terakhir", "tren OLS riwayat", "tren rata-rata induk", "beda terakhir induk"],
                   horizon=horizon, forced=algo != "auto" and algo in MODELS,
                   coefficients=None if chosen not in ("pooled_ridge", "ensemble", "ensemble_ml") else [float(b) for b in model["beta"]])
    return metrics, pred, out


def _scale(A, shape):
    return 1.0


def _robust_sigma(R, A, ind):
    return float(np.sqrt(0.5 * np.mean(R ** 2) + 0.5 * (1.4826 * np.median(np.abs(R - np.median(R)))) ** 2))


# ---------- orkestrasi ----------
def load_matrix(c, ind, level):
    regs = c.execute("SELECT id, parent_id FROM regions WHERE level=? ORDER BY id", (level,)).fetchall()
    idx = {r["id"]: i for i, r in enumerate(regs)}
    Y = np.full((len(regs), T), np.nan)
    for r in c.execute("SELECT o.region_id, o.year, o.value FROM observations o JOIN regions g ON g.id=o.region_id WHERE o.indicator_id=? AND g.level=?", (ind, level)):
        if r["value"] is not None: Y[idx[r["region_id"]], r["year"] - YEARS[0]] = r["value"]
    keep = ~np.isnan(Y).all(1)   # kawasan hutan (kode 999) tanpa desa/penduduk: dikecualikan
    return [r["id"] for r, k in zip(regs, keep) if k], np.array([r["parent_id"] for r, k in zip(regs, keep) if k]), Y[keep]


def run(log=print, seed=7, indicators=None, levels=None, algo="auto", horizon=HORIZON, mode="train"):
    """mode='train'  : pilih model (sesuai `algo`) lalu prediksi.
       mode='predict': prediksi ulang dengan algoritma model yang SEDANG AKTIF per indikator-level (data terbaru, model dipertahankan)."""
    horizon = int(min(max(horizon, 1), 5))
    rng = np.random.default_rng(seed)
    c = connect()
    ver = "v" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + ("p" if mode == "predict" else "")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    n_models = 0
    for ind in INDICATORS:
        if indicators and ind["id"] not in indicators:
            continue
        for level in LEVELS:
            if levels and level not in levels:
                continue
            use_algo = algo
            if mode == "predict":
                row = c.execute("SELECT algo FROM models WHERE indicator_id=? AND level=? AND is_active=1", (ind["id"], level)).fetchone()
                use_algo = row["algo"] if row else "auto"
            c.execute("UPDATE models SET is_active=0 WHERE indicator_id=? AND level=? AND is_active=1", (ind["id"], level))
            c.execute("DELETE FROM estimates WHERE indicator_id=? AND region_id IN (SELECT id FROM regions WHERE level=?)", (ind["id"], level))
            ids, parent, Y = load_matrix(c, ind["id"], level)
            Yf, obs = impute(Y)
            est = []
            for i, t in zip(*np.where(~obs)):
                v = float(np.clip(Yf[i, t], 0, 100)) if ind["id"] in PCT_TYPE else max(float(Yf[i, t]), 0)
                Yf[i, t] = v
                est.append((ids[i], ind["id"], YEARS[t], round(v, 2), "tren-wilayah+efek-tahun"))
            if est: c.executemany("INSERT OR REPLACE INTO estimates VALUES(?,?,?,?,?)", est)
            metrics, pred, bands = train_one(Yf, parent, ind["id"], level, rng, use_algo, horizon)
            metrics["mode"] = mode
            if est:
                metrics["imputation"] = impute_quality(Y, rng)
            metrics["n_estimated"] = len(est)
            cur = c.execute("INSERT INTO models(indicator_id, level, algo, version, metrics_json, trained_at, is_active) VALUES(?,?,?,?,?,?,1)",
                            (ind["id"], level, metrics["chosen"], ver, json.dumps(_finite(metrics), ensure_ascii=False), now))
            mid = cur.lastrowid
            rows = []
            for i, rid in enumerate(ids):
                for h in range(horizon):
                    rows.append((rid, ind["id"], YEARS[-1] + 1 + h, float(pred[i, h]), float(bands["80"][0][i, h]), float(bands["80"][1][i, h]),
                                 float(bands["95"][0][i, h]), float(bands["95"][1][i, h]), mid))
            c.executemany("INSERT INTO forecasts VALUES(?,?,?,?,?,?,?,?,?)", rows)
            n_models += 1
            log(f"{ind['id']:9s} {level:10s} -> {metrics['chosen']:13s} MAE={metrics['candidates'][metrics['chosen']]['mae']:.3f} "
                f"base={metrics['candidates'][metrics['baseline_best']]['mae']:.3f} cov80={metrics['coverage80']:.0%} est={len(est)}")
    c.execute("DELETE FROM forecasts WHERE model_id NOT IN (SELECT id FROM models WHERE is_active=1)")
    c.commit()
    c.close()
    return n_models, ver


if __name__ == "__main__":
    n, v = run()
    print(f"selesai: {n} model, versi {v}")
