"""Pembangkit data dummy reproduksibel.   python -m ml.generate_dummy --seed 42"""
import argparse
import csv
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import PROCESSED, YEARS  # noqa: E402
from app.db import SCHEMA, connect  # noqa: E402
from app.indicators import INDICATORS, PCT_TYPE, SUM_TYPE  # noqa: E402

SOURCE = "dummy-v1"


def zs(x):
    return (x - x.mean()) / (x.std() + 1e-9)


def spatial_field(rng, lng, lat, n=6):
    """Medan halus (jumlah RBF acak): wilayah bertetangga bernilai mirip."""
    f = np.zeros_like(lng)
    for _ in range(n):
        cx, cy = rng.uniform(lng.min(), lng.max()), rng.uniform(lat.min(), lat.max())
        w = rng.uniform(0.25, 0.9)
        f += rng.normal() * np.exp(-((lng - cx) ** 2 + (lat - cy) ** 2) / (2 * w ** 2))
    return zs(f)


def build(seed=42, missing=0.05):
    rng = np.random.default_rng(seed)
    regs = list(csv.DictReader(open(PROCESSED / "regions.csv", encoding="utf8")))
    desa = [r for r in regs if r["level"] == "desa"]
    ids = [r["id"] for r in desa]
    n, T = len(desa), len(YEARS)
    lng = np.array([float(r["centroid_lng"]) for r in desa])
    lat = np.array([float(r["centroid_lat"]) for r in desa])
    kab_of = np.array([i[:4] for i in ids])
    kabs = sorted(set(kab_of))
    kab_eff = {k: rng.normal() for k in kabs}
    kab_e = np.array([kab_eff[k] for k in kab_of])

    L = zs(0.6 * spatial_field(rng, lng, lat) + 0.5 * kab_e + 0.55 * rng.normal(size=n))   # keterpencilan/kemiskinan
    W = zs(spatial_field(rng, lng, lat, 5) + 0.5 * rng.normal(size=n))                      # faktor air
    yrs = np.arange(T)
    macro = rng.normal(0, 1, T)                                                             # efek tahun bersama

    def trend(mean, sd_kab, sd_reg):
        m = {k: rng.normal(0, sd_kab) for k in kabs}
        return mean + np.array([m[k] for k in kab_of]) + rng.normal(0, sd_reg, n)

    def finish(base, slope, yearfx, noise, shock_p=0.03, shock_sd=3.0):
        v = base[:, None] + slope[:, None] * yrs[None, :] + yearfx[None, :] + rng.normal(0, noise, (n, T))
        hit = rng.random(n) < shock_p                                                      # anomali satu tahun
        yr = rng.integers(0, T, n)
        v[hit, yr[hit]] += rng.normal(0, shock_sd, hit.sum()) * np.sign(rng.normal(size=hit.sum()))
        return v

    g = np.clip(rng.normal(0.008, 0.012, n), -0.02, 0.04)
    pop = np.exp(rng.normal(8.0, 0.55, n))[:, None] * (1 + g[:, None]) ** yrs[None, :] * np.exp(rng.normal(0, 0.006, (n, T)))
    D = {"penduduk": pop}
    D["miskin"] = finish(12 + 2.6 * L, trend(-0.35, 0.15, 0.2), 0.35 * macro, 0.35)
    agri = np.exp(rng.normal(-0.3, 0.8, n) + 0.3 * W)
    D["padi"] = pop * agri[:, None] * 0.35 * np.exp(0.03 * yrs[None, :] + rng.normal(0, 0.06, (n, T)) + 0.04 * macro[None, :])
    gagal = rng.random(n) < 0.05
    D["padi"][gagal, 2] *= rng.uniform(0.45, 0.7, gagal.sum())                              # gagal panen 2023
    D["umk"] = pop * np.exp(rng.normal(-1.9, 0.35, n))[:, None] * (1 + 0.035 * yrs[None, :]) * np.exp(rng.normal(0, 0.03, (n, T)))
    D["jalan"] = finish(62 - 7 * L, trend(1.0, 0.3, 0.4), 0.2 * macro, 0.9)
    D["aps"] = finish(76 - 3.5 * L, trend(0.7, 0.2, 0.25), 0.15 * macro, 0.6)
    D["stunting"] = finish(21 + 0.8 * (D["miskin"][:, 0] - 12) - 0.05 * (D["jalan"][:, 0] - 60),
                           trend(-0.9, 0.25, 0.3), 0.2 * macro, 0.7)
    D["banjir"] = finish(40 + 11 * W + 3 * L, trend(0.2, 0.3, 0.3), 0 * macro, 1.5, 0.04, 8)
    basah = (rng.random(n) < 0.4) & (W > 0.2)
    D["banjir"][basah, 2] += rng.uniform(4, 10, basah.sum())                                # tahun basah 2023

    W2 = zs(spatial_field(rng, lng, lat, 5) + 0.5 * rng.normal(size=n))                     # faktor lereng/longsor
    D["rls"] = finish(8.6 - 0.55 * L, trend(0.08, 0.03, 0.03), 0.02 * macro, 0.08, 0.02, 0.3)
    D["imunisasi"] = finish(83 - 4 * L, trend(0.6, 0.2, 0.25), 0.2 * macro, 0.9)
    D["air"] = finish(74 - 6 * L - 1.5 * W, trend(0.8, 0.25, 0.3), 0.15 * macro, 0.8)
    D["longsor"] = finish(34 + 10 * W2 + 2 * L, trend(0.15, 0.25, 0.25), 0 * macro, 1.3, 0.04, 7)
    D["tatakelola"] = finish(62 - 3 * L + 2 * kab_e, trend(1.1, 0.3, 0.35), 0.25 * macro, 1.0)
    D["apbdes"] = finish(88 - 2 * L, trend(0.3, 0.4, 0.4), 0.8 * macro, 1.8, 0.05, 6)

    # ---- variabel tambahan: (dasar, koef. L, faktor, kemiringan tahunan, derau) ----
    W3 = zs(-0.6 * W + spatial_field(rng, lng, lat, 5) + 0.5 * rng.normal(size=n))           # faktor kering
    W4 = zs(spatial_field(rng, lng, lat, 4) + 0.5 * rng.normal(size=n))                      # faktor gempa
    W5 = zs(spatial_field(rng, lng, lat, 5) + 0.5 * rng.normal(size=n))                      # faktor karhutla
    F = {"W": W, "W3": W3, "W4": W4, "W5": W5, "0": 0 * W}
    SPEC = {
        "aps_sd": (98.5, -0.9, "0", 0.04, 0.25), "aps_smp": (93, -2.4, "0", 0.25, 0.4), "paud": (60, -6, "0", 1.0, 0.8),
        "buta_huruf": (3.6, 1.1, "0", -0.12, 0.15), "murid_guru": (17, 1.4, "0", -0.08, 0.3),
        "gizi_kurang": (8.2, 0.9, "0", -0.1, 0.25), "akses_faskes": (82, -6, "0", 0.5, 0.6), "jkn": (86, -3.5, "0", 1.2, 0.6),
        "persalinan_nakes": (91, -3, "0", 0.4, 0.5), "posyandu": (77, -4, "0", 0.6, 0.8), "sanitasi": (71, -6, "W", 0.9, 0.7),
        "pengangguran": (4.4, 0.6, "0", -0.05, 0.15), "pengeluaran": (1250, -140, "0", 35, 18),
        "listrik": (97.5, -1.8, "0", 0.15, 0.2), "internet": (68, -9, "0", 3.0, 1.2), "jalan_aspal": (54, -8, "0", 1.1, 0.8),
        "waktu_tempuh": (26, 6, "0", -0.35, 0.8), "rumah_layak": (79, -5, "0", 0.7, 0.6),
        "kekeringan": (38, 2, "W3", 0.1, 1.3), "gempa": (42, 1, "W4", 0.0, 1.0), "karhutla": (30, 2, "W5", 0.1, 1.3),
        "kesiapsiagaan": (48, -4, "0", 1.6, 1.0),
        "keterbukaan": (55, -3, "0", 1.4, 1.0), "musdes": (72, -3, "0", 0.5, 1.2), "dok_rencana": (80, -3, "0", 0.8, 1.0),
    }
    for k, (b, cl, fac, sl, nz) in SPEC.items():
        cw = 8 if fac in ("W3", "W4", "W5") else (-1.5 if fac == "W" else 0)
        sd = abs(sl) * 0.4 + 0.02
        D[k] = finish(b + cl * L + cw * F[fac], trend(sl, sd, sd), 0.1 * macro * nz, nz)
    D["bumdes"] = np.round(np.exp(rng.normal(-0.4, 0.5, n))[:, None] * (1 + 0.08 * yrs[None, :]) * np.exp(rng.normal(0, 0.05, (n, T))))
    D["koperasi"] = np.round(pop * np.exp(rng.normal(-6.4, 0.4, n))[:, None] * (1 + 0.04 * yrs[None, :]))
    D["pades"] = pop * np.exp(rng.normal(-5.6, 0.5, n))[:, None] * (1 + 0.07 * yrs[None, :]) * np.exp(rng.normal(0, 0.05, (n, T)))
    D["kejadian_bencana"] = rng.poisson(np.exp(-0.7 + 0.35 * W + 0.15 * W2 + 0.1 * L)[:, None], (n, T)).astype(float)
    for k, v in D.items():                                                                  # batas logis
        D[k] = np.clip(v, 0.5, 99.5) if k in PCT_TYPE else np.maximum(v, 0)
    D["rls"] = np.round(np.clip(D["rls"], 2, 14), 2)
    D["penduduk"], D["umk"] = np.round(D["penduduk"]), np.round(D["umk"])
    D["padi"] = np.round(D["padi"], 1)
    for k in ("pengeluaran", "murid_guru", "waktu_tempuh", "pades"):
        D[k] = np.round(D[k], 1)
    D["bumdes"], D["koperasi"], D["kejadian_bencana"] = np.round(D["bumdes"]), np.round(D["koperasi"]), np.round(D["kejadian_bencana"])
    for k in PCT_TYPE:
        D[k] = np.round(D[k], 2)

    rows = []
    for ind in INDICATORS:
        k, V = ind["id"], D[ind["id"]]
        for i, rid in enumerate(ids):
            rows += [(rid, k, t, float(V[i, t])) for t in range(T)]
        for cut in (7, 4, 2):          # kecamatan, kabupaten, provinsi
            groups = {}
            for i, rid in enumerate(ids):
                groups.setdefault(rid[:cut], []).append(i)
            for gid, ix in groups.items():
                for t in range(T):
                    val = V[ix, t].sum() if k in SUM_TYPE else np.average(V[ix, t], weights=pop[ix, t])
                    rows.append((gid, k, t, round(float(val), 2)))
    m = rng.random(len(rows)) < missing
    out = []
    for (rid, k, t, v), blank in zip(rows, m):
        blank = blank and len(rid) == 10 and k != "penduduk"   # hanya level desa dikosongkan
        out.append((rid, k, YEARS[t], None if blank else v, 1, SOURCE))
    return regs, out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--missing", type=float, default=0.05)
    a = ap.parse_args(argv)
    return generate(a.seed, a.missing)


def generate(seed=42, missing=0.05):
    regs, obs = build(seed, missing)
    c = connect()
    c.executescript("DROP TABLE IF EXISTS observations; DROP TABLE IF EXISTS regions; DROP TABLE IF EXISTS indicators;"
                    "DROP TABLE IF EXISTS estimates; DROP TABLE IF EXISTS forecasts; DROP TABLE IF EXISTS models;")
    c.executescript(SCHEMA)
    c.executemany("INSERT INTO regions VALUES(?,?,?,?,?,?,?)",
                  [(r["id"], r["name"], r["level"], r["parent_id"], float(r["centroid_lng"]), float(r["centroid_lat"]), float(r["area_km2"])) for r in regs])
    c.executemany("INSERT INTO indicators VALUES(?,?,?,?,?,?,?,?)",
                  [(i["id"], i["name"], i["theme"], i["unit"], i["direction"], i["key"], i["description"], i["formula"]) for i in INDICATORS])
    c.executemany("INSERT INTO observations VALUES(?,?,?,?,?,?)", obs)
    c.commit()
    blank = sum(1 for o in obs if o[3] is None)
    c.close()
    msg = f"regions={len(regs)} observations={len(obs)} kosong={blank} ({blank / len(obs):.1%}) seed={seed}"
    print(msg)
    return msg


if __name__ == "__main__":
    main()
