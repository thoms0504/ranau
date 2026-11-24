"""Fase 0: audit, normalisasi kode wilayah, simplifikasi GeoJSON -> data/processed."""
import csv, json, sys
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.validation import explain_validity

ROOT = Path(__file__).resolve().parents[3]
RAW, OUT = ROOT / "data" / "raw", ROOT / "data" / "processed"
TOL = {"kabupaten": 0.0008, "kecamatan": 0.0006, "desa": 0.0008}
PROV_ID, PROV_NAME = "18", "LAMPUNG"


def load(name):
    return json.loads((RAW / f"1800_per_{name}.geojson").read_text(encoding="utf8"))["features"]


def simplify(geom, tol):
    g = shape(geom)
    if not g.is_valid:
        g = g.buffer(0)
    s = g.simplify(tol, preserve_topology=True)
    if s.is_empty:
        s = g
    m = mapping(s)
    def r(c):
        return [round(c[0], 5), round(c[1], 5)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    return {"type": m["type"], "coordinates": r(m["coordinates"])}, g


def main():
    report, regions = [], []
    kab_name_to_id = {}
    kec = load("kecamatan")
    desa = load("desa")
    # kecamatan ada di data desa tetapi tidak di batas kecamatan: bentuk dari gabungan desa
    from shapely.ops import unary_union
    have = {f["properties"]["KODE_KEC"] for f in kec}
    miss = {}
    for f in desa:
        if f["properties"]["kodekec"] not in have:
            miss.setdefault(f["properties"]["kodekec"], []).append(f)
    for kc, fs_ in miss.items():
        p0 = fs_[0]["properties"]
        u = unary_union([shape(x["geometry"]).buffer(0) for x in fs_])
        kec.append({"type": "Feature", "geometry": mapping(u), "properties": {"KODE_KEC": kc, "provinsi": p0["nmprov"], "kabkot": p0["nmkab"], "kecamatan": p0["nmkec"]}})
        report.append(f"[kecamatan] {kc} ({p0['nmkec']}) tidak ada di file kecamatan; dibentuk dari gabungan {len(fs_)} desa")
    for f in kec:
        kab_name_to_id[f["properties"]["kabkot"]] = f["properties"]["KODE_KEC"][:4]

    def emit(level, feats, getid, getname, getparent, extra=lambda p: {}):
        out, seen, bad = [], set(), 0
        for f in feats:
            p = f["properties"]
            rid = getid(p)
            if rid in seen:
                report.append(f"[{level}] duplikat id {rid}")
            seen.add(rid)
            geom, g = simplify(f["geometry"], TOL[level])
            if not shape(f["geometry"]).is_valid:
                bad += 1
            c = g.representative_point()
            cen = g.centroid
            area = round(g.area * (111.32 ** 2) * 0.9948, 2)  # km2 perkiraan di lintang ~-5
            props = {"region_id": rid, "name": getname(p), "level": level, "parent_id": getparent(p)}
            out.append({"type": "Feature", "properties": props, "geometry": geom})
            regions.append([rid, getname(p), level, getparent(p), round(cen.x, 5), round(cen.y, 5), area])
        (OUT / f"{level}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": out}, separators=(",", ":")), encoding="utf8")
        size = (OUT / f"{level}.geojson").stat().st_size / 1e6
        report.append(f"[{level}] {len(out)} fitur, id unik {len(seen)}, geometri tidak valid (diperbaiki) {bad}, ukuran tampilan {size:.2f} MB")

    OUT.mkdir(parents=True, exist_ok=True)
    regions.append([PROV_ID, PROV_NAME, "provinsi", "", 105.1, -4.9, 0])
    emit("kabupaten", load("kabupaten"), lambda p: kab_name_to_id[p["kabkot"]], lambda p: p["kabkot"], lambda p: PROV_ID)
    emit("kecamatan", kec, lambda p: p["KODE_KEC"], lambda p: p["kecamatan"], lambda p: p["KODE_KEC"][:4])
    emit("desa", desa, lambda p: p["iddesa"], lambda p: p["nmdesa"], lambda p: p["kodekec"])

    ids = {r[0] for r in regions}
    orphan = [r[0] for r in regions if r[2] != "provinsi" and r[3] not in ids]
    report.append(f"Wilayah tanpa induk: {len(orphan)}")
    with open(OUT / "regions.csv", "w", newline="", encoding="utf8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "name", "level", "parent_id", "centroid_lng", "centroid_lat", "area_km2"])
        w.writerows(regions)
    report.insert(0, "CRS sumber: CRS84 (= EPSG:4326, urutan lng,lat)")
    (OUT / "audit_report.txt").write_text("\n".join(report), encoding="utf8")
    print("\n".join(report))


if __name__ == "__main__":
    sys.exit(main())
