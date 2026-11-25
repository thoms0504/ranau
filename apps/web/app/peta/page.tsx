"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoFC, MapHandle } from "@/components/MapView";
import SeriesChart, { SeriesResp } from "@/components/SeriesChart";
import YearSlider from "@/components/YearSlider";
import { cached, DataResp, get, Indicator, Level, Meta, provBadge } from "@/lib/api";
import { makeScale } from "@/lib/colors";
import { Basemap, loadBasemap, saveBasemap } from "@/lib/basemaps";
import BasemapPicker from "@/components/BasemapPicker";
import ThemeIcon from "@/components/ThemeIcon";
import { getCmp, toggleCmp, CMP_MAX } from "@/lib/compare";
import { fmt, fmtCompact, fmtDelta, titleCase, tone } from "@/lib/format";
import { CHILD_LEVEL, LEVEL_LABEL, THEME_COLOR, THEMES } from "@/lib/themes";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div style={{ padding: 20 }}>Memuat peta…</div> });
interface Cond { ind: string; op: "gt" | "gte" | "lt" | "lte"; val: string }
interface ProfItem { indicator: string; name: string; theme: string; unit: string; direction: string; aux: boolean; agg: string; value: number; kind: string; lo80?: number; hi80?: number; previous?: number | null; rank?: number; of?: number; parent_value?: number | null; province_value?: number | null }
interface Profile { region: { id: string; name: string; level: string; parent_id: string }; parent: { id: string; name: string; level: string } | null; year: number; is_forecast: boolean; items: ProfItem[] }
const OPS: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };
type View = "actual" | "forecast" | "diff";
type Tab = "layer" | "profil";


export default function PetaPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [inds, setInds] = useState<Indicator[]>([]);
  const [ind, setInd] = useState("miskin");
  const [extra, setExtra] = useState<string[]>([]);
  const [year, setYear] = useState(2026);
  const [diff, setDiff] = useState(false);
  const [kab, setKab] = useState<string | null>(null);
  const [kec, setKec] = useState<string | null>(null);
  const [conds, setConds] = useState<Cond[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("layer");
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("osm");
  const [basemapNote, setBasemapNote] = useState(false);
  const [themeTab, setThemeTab] = useState<string | null>(null);
  const [worstFirst, setWorstFirst] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showRank, setShowRank] = useState(false);

  const [geoAll, setGeoAll] = useState<GeoFC | null>(null);
  const [data, setData] = useState<DataResp | null>(null);
  const [extraData, setExtraData] = useState<Record<string, DataResp>>({});
  const [matched, setMatched] = useState<Set<string> | null>(null);
  const [nMatch, setNMatch] = useState<number | null>(null);
  const [prov, setProv] = useState<Record<string, SeriesResp>>({});
  const [detail, setDetail] = useState<SeriesResp | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [crumb, setCrumb] = useState<Record<string, string>>({});
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [cmp, setCmpState] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const mapRef = useRef<MapHandle>(null);

  const level: Level = kec ? "desa" : kab ? "kecamatan" : "kabupaten";
  const parentId = kec ?? kab;
  const last = meta?.last_actual ?? 2025;
  const years = useMemo(() => (meta ? [...meta.years, ...meta.forecast_years] : []), [meta]);
  const mode: View = diff ? "diff" : year > last ? "forecast" : "actual";
  const cur = inds.find((i) => i.id === ind);
  const activeTheme = themeTab ?? cur?.theme ?? THEMES[0];
  useEffect(() => { setThemeTab(null); }, [ind]);
  const cards = useMemo(() => inds.filter((i) => !i.aux), [inds]);

  // --- muat meta + baca state dari URL
  useEffect(() => {
    setCmpState(getCmp());
    setBasemap(loadBasemap());
    const onCmp = () => setCmpState(getCmp());
    window.addEventListener("ranau-cmp", onCmp);
    Promise.all([cached<Meta>("/meta"), cached<Indicator[]>("/indicators")]).then(async ([m, i]) => {
      setMeta(m); setInds(i);
      const p = new URLSearchParams(window.location.search);
      const pi = p.get("i"); if (pi && i.some((x) => x.id === pi && !x.aux)) setInd(pi);
      setExtra((p.get("x") ?? "").split(",").filter((x) => i.some((k) => k.id === x)));
      const y = Number(p.get("y")); if (y && [...m.years, ...m.forecast_years].includes(y)) setYear(y);
      setDiff(p.get("m") === "diff");
      let k = p.get("k"); const c = p.get("c");
      if (c && !k) { try { k = (await get<{ parent_id: string }>(`/regions/${c}`)).parent_id; } catch { /* abaikan */ } }
      setKab(k); setKec(k ? c : null);
      setConds((p.get("f") ?? "").split(",").filter(Boolean).map((s) => { const [a, b, c2] = s.split(":"); return { ind: a, op: b as Cond["op"], val: c2 }; }));
      setSel(p.get("s")); if (p.get("s")) setTab("profil");
      setReady(true);
    }).catch((e) => setErr(e.message));
    return () => window.removeEventListener("ranau-cmp", onCmp);
  }, []);

  // --- sinkron state ke URL
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams();
    p.set("i", ind); p.set("y", String(year));
    if (kab) p.set("k", kab);
    if (kec) p.set("c", kec);
    if (diff) p.set("m", "diff");
    if (extra.length) p.set("x", extra.join(","));
    const f = conds.filter((c) => c.val !== "" && !isNaN(Number(c.val))).map((c) => `${c.ind}:${c.op}:${c.val}`).join(",");
    if (f) p.set("f", f);
    if (sel) p.set("s", sel);
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [ready, ind, year, kab, kec, diff, extra, conds, sel]);

  // --- nama untuk breadcrumb
  useEffect(() => {
    [kab, kec].forEach((id) => { if (id && !crumb[id]) cached<{ name: string }>(`/regions/${id}`).then((r) => setCrumb((c) => ({ ...c, [id]: r.name }))).catch(() => undefined); });
  }, [kab, kec, crumb]);

  // --- geometri level aktif
  useEffect(() => {
    if (!ready) return;
    setGeoAll(null);
    cached<GeoFC>(`/geo/${level}`).then(setGeoAll).catch((e) => setErr(e.message));
  }, [ready, level]);

  const vis = useMemo<GeoFC | null>(() => {
    if (!geoAll) return null;
    if (!parentId) return geoAll;
    return { ...geoAll, features: geoAll.features.filter((f) => f.properties.parent_id === parentId) };
  }, [geoAll, parentId]);
  const names = useMemo(() => Object.fromEntries((geoAll?.features ?? []).map((f) => [f.properties.region_id, f.properties.name])), [geoAll]);

  // --- nilai indikator utama & tambahan (seluruh level, difilter ke wilayah tampil)
  const fetchData = useCallback((i: string) => cached<DataResp>(`/data?indicator=${i}&year=${year}&level=${level}&mode=${mode}&base=${last}`), [year, level, mode, last]);
  useEffect(() => {
    if (!ready) return;
    setData(null);
    fetchData(ind).then(setData).catch((e) => setErr(e.message));
  }, [ready, ind, fetchData]);
  useEffect(() => {
    if (!ready) return;
    Promise.all(extra.map((i) => fetchData(i).then((d) => [i, d] as const))).then((r) => setExtraData(Object.fromEntries(r))).catch(() => undefined);
  }, [ready, extra, fetchData]);

  const visValues = useMemo(() => {
    if (!data || !vis) return null;
    const o: Record<string, DataResp["values"][string]> = {};
    for (const f of vis.features) { const v = data.values[f.properties.region_id]; if (v) o[f.properties.region_id] = v; }
    return o;
  }, [data, vis]);
  const scale = useMemo(() => (visValues ? makeScale(Object.values(visValues).map((v) => v.value), mode === "diff") : null), [visValues, mode]);
  const noData = vis && visValues ? vis.features.length - Object.keys(visValues).length : 0;

  // --- kartu indikator: nilai provinsi
  useEffect(() => {
    if (!ready || !inds.length) return;
    Promise.all(cards.map((i) => cached<SeriesResp>(`/regions/18/series?indicator=${i.id}`).then((s) => [i.id, s] as const))).then((r) => setProv(Object.fromEntries(r))).catch(() => undefined);
  }, [ready, inds, cards]);

  // --- filter AND (server)
  useEffect(() => {
    const valid = conds.filter((c) => c.val !== "" && !isNaN(Number(c.val)));
    if (!ready || !valid.length) { setMatched(null); setNMatch(null); return; }
    const q = valid.map((c) => `c=${c.ind}:${c.op}:${c.val}`).join("&");
    const t = setTimeout(() => get<{ ids: string[] }>(`/filter?level=${level}&year=${year}&mode=${mode}&${q}`).then((r) => {
      const vs = new Set(vis?.features.map((f) => f.properties.region_id));
      const ids = r.ids.filter((x) => vs.has(x));
      setMatched(new Set(ids)); setNMatch(ids.length);
    }).catch((e) => setErr(e.message)), 250);
    return () => clearTimeout(t);
  }, [ready, conds, level, year, mode, vis]);

  // --- profil & seri wilayah terpilih
  useEffect(() => {
    if (!sel) { setDetail(null); setProfile(null); return; }
    cached<SeriesResp>(`/regions/${sel}/series?indicator=${ind}`).then(setDetail).catch(() => setDetail(null));
  }, [sel, ind]);
  useEffect(() => {
    if (!sel) return;
    cached<Profile>(`/regions/${sel}/profile?year=${year}`).then(setProfile).catch(() => setProfile(null));
  }, [sel, year]);

  // --- navigasi drill-down
  const activate = useCallback((id: string) => {
    setSel(id); setTab("profil"); setShowAll(false);
    if (level === "kabupaten") { setKab(id); setKec(null); }
    else if (level === "kecamatan") setKec(id);
  }, [level]);
  const goRoot = () => { setKab(null); setKec(null); setSel(null); setTab("layer"); };
  const goKab = () => { setKec(null); setSel(kab); setTab("profil"); };
  const goKec = () => { setSel(kec); setTab("profil"); };
  const goBack = () => { if (kec) goKab(); else goRoot(); };

  const setView = (v: View) => {
    if (v === "actual") { setDiff(false); if (year > last) setYear(last); }
    else { setDiff(v === "diff"); if (year <= last) setYear(last + 1); }
  };
  const toggleExtra = (id: string) => setExtra((x) => (x.includes(id) ? x.filter((k) => k !== id) : [...x, id]));

  // --- peringkat wilayah yang tampil (1 = terbaik menurut arah indikator)
  const ranking = useMemo(() => {
    if (!visValues || !cur) return [];
    const low = cur.direction === "low";
    const rows = Object.entries(visValues).map(([id, v]) => ({ id, name: names[id] ?? id, v }));
    rows.sort((a, b) => (low ? a.v.value - b.v.value : b.v.value - a.v.value));
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [visValues, cur, names]);
  const rankShown = useMemo(() => { const r = worstFirst ? [...ranking].reverse() : ranking; return showAll ? r : r.slice(0, 15); }, [ranking, worstFirst, showAll]);
  const rankMax = useMemo(() => Math.max(1e-9, ...ranking.map((r) => Math.abs(r.v.value))), [ranking]);

  const hovered = hover && data?.values[hover.id] && cur ? { name: titleCase(names[hover.id] ?? hover.id), v: data.values[hover.id] } : null;
  const shareLink = async () => { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const exportImg = async () => {
    if (!cur || !mapRef.current) return;
    const where = kec ? titleCase(crumb[kec] ?? "") : kab ? titleCase(crumb[kab] ?? "") : "Provinsi Lampung";
    const url = await mapRef.current.exportPng(
      [`RANAU – ${cur.name}`, `${where} · ${LEVEL_LABEL[level]} · ${year}${year > last ? " (proyeksi)" : ""}${diff ? ` · selisih terhadap ${last}` : ""}`, cur.status === "nyata" ? "Data nyata" : cur.status === "campuran" ? "Campuran data nyata dan dummy" : "Data dummy untuk pengembangan – bukan data resmi"],
      scale, diff ? "selisih" : cur.unit,
    );
    const a = document.createElement("a"); a.href = url; a.download = `ranau_${ind}_${level}_${year}.png`; a.click();
  };
  const editCond = (c: Cond, k: number) => setConds((x) => x.map((y, n) => (n === k ? { ...y, ...c } : y)));
  const selName = sel ? titleCase((profile?.region.id === sel ? profile.region.name : names[sel]) ?? crumb[sel] ?? sel) : "";
  const inCmp = !!sel && cmp.includes(sel);

  return (
    <div className="map-shell">
      <aside className={`map-panel ${collapsed ? "collapsed" : ""}`} aria-label="Panel kontrol peta">
        <div className="flex gap-2 mb-3 flex-wrap items-center">
          <button className="btn" onClick={() => setCollapsed(true)} aria-label="Ciutkan panel">« Ciutkan</button>
          <button className="btn" onClick={shareLink}>{copied ? "Tertaut ✓" : "Salin tautan"}</button>
          <button className="btn" onClick={exportImg}>Unduh gambar</button>
        </div>
        {err && <p role="alert" style={{ color: "var(--bad)" }}>{err}</p>}

        <div role="tablist" className="seg" style={{ width: "100%", marginBottom: 6 }}>
          {([["layer", "Indikator"], ["profil", "Profil"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ flex: 1 }}>{l}</button>
          ))}
        </div>

        {tab === "layer" && (
          <>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="panel-h">Mode data</legend>
              <div role="tablist" className="seg" style={{ width: "100%" }}>
                {([["actual", "Historis"], ["forecast", "Proyeksi"], ["diff", "Selisih"]] as [View, string][]).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={mode === k} onClick={() => setView(k)} style={{ flex: 1 }}>{l}</button>
                ))}
              </div>
              {diff && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Selisih = nilai {year} dikurangi nilai aktual {last}.</div>}
            </fieldset>

            <div className="panel-h">Indikator <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· klik kartu = warna peta</span></div>
            <div role="tablist" aria-label="Tema indikator" className="theme-tabs">
              {THEMES.map((th) => (
                <button key={th} role="tab" aria-selected={activeTheme === th} className="theme-tab" style={{ ["--tc" as string]: THEME_COLOR[th] }} onClick={() => setThemeTab(th)}>
                  <ThemeIcon theme={th} size={19} />
                  <span>{th}</span>
                </button>
              ))}
            </div>
            {(() => {
              const th = activeTheme;
              const list = cards.filter((i) => i.theme === th);
              return (
                <div role="tabpanel" style={{ margin: "12px 0 10px" }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px 2px" }}>{list.length} indikator · {th}</div>
                  <div className="grid gap-2">
                    {list.map((i) => {
                      const s = prov[i.id];
                      const pv = s ? [...s.actual, ...s.forecast.map((f) => ({ year: f.year, value: f.yhat }))].find((p) => p.year === year) : null;
                      const active = i.id === ind;
                      return (
                        <div key={i.id} className={`ic ${active ? "active" : ""}`} style={{ ["--tc" as string]: THEME_COLOR[th] }}>
                          <button className="ic-main" onClick={() => { setInd(i.id); setExtra((x) => x.filter((k) => k !== i.id)); }} aria-pressed={active}>
                            <span className="ic-ico"><ThemeIcon theme={th} size={18} /></span>
                            <span className="ic-body">
                              <span className="ic-name">{i.name} {i.status && i.status !== "dummy" && <span className={`badge ${provBadge(i.status).cls}`}>{provBadge(i.status).text}</span>}</span>
                              {pv && (i.unit === "%" || i.unit.startsWith("skor")) && <span aria-hidden className="ic-bar"><span style={{ width: `${Math.min(100, Math.max(0, pv.value))}%` }} /></span>}
                            </span>
                            {pv && (
                              <span className="ic-val">
                                <strong>{i.unit === "%" ? fmt(pv.value, "%") : fmt(pv.value, "")}</strong>
                                {i.unit !== "%" && !i.unit.startsWith("skor") && <small>{i.unit}</small>}
                              </span>
                            )}
                          </button>
                          <span className="ic-side">
                            <span className="ic-info" title={`${i.description} (${year}, nilai provinsi)`} aria-label={i.description} tabIndex={0}>i</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <details className="card-flat" style={{ padding: 12, margin: "14px 0" }} open={conds.length > 0}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Filter gabungan (DAN){nMatch != null && <span style={{ fontWeight: 400, color: "var(--muted)" }}> — {nMatch} wilayah cocok</span>}</summary>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0" }}>Berlaku pada wilayah yang tampil, tahun &amp; mode terpilih. Contoh: stunting &gt; 20 DAN miskin &gt; 12.</p>
              {conds.map((c, k) => (
                <div key={k} className="flex gap-1 mb-1 items-center">
                  <select className="field" style={{ flex: 1, minWidth: 0 }} aria-label="Indikator filter" value={c.ind} onChange={(e) => editCond({ ...c, ind: e.target.value }, k)}>{cards.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                  <select className="field" aria-label="Operator" value={c.op} onChange={(e) => editCond({ ...c, op: e.target.value as Cond["op"] }, k)}>{Object.entries(OPS).map(([o, s]) => <option key={o} value={o}>{s}</option>)}</select>
                  <input className="field" style={{ width: 70 }} inputMode="decimal" aria-label="Nilai" value={c.val} onChange={(e) => editCond({ ...c, val: e.target.value }, k)} />
                  <button className="btn" aria-label="Hapus kondisi" onClick={() => setConds((x) => x.filter((_, n) => n !== k))}>✕</button>
                </div>
              ))}
              <div className="flex gap-2 mt-2">
                <button className="btn" onClick={() => setConds((x) => [...x, { ind, op: "gt", val: "" }])}>+ Tambah kondisi</button>
                {conds.length > 0 && <button className="btn" onClick={() => setConds([])}>Reset</button>}
              </div>
            </details>
          </>
        )}


        {tab === "profil" && (
          <section aria-live="polite">
            {!sel && <p style={{ color: "var(--muted)" }}>Klik wilayah di peta untuk melihat profil lengkapnya. Klik kabupaten/kota untuk masuk ke kecamatannya, lalu kecamatan untuk masuk ke desa/kelurahan.</p>}
            {sel && (
              <>
                <div className="flex justify-between items-start gap-2" style={{ marginTop: 6 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22, color: "var(--brand)" }}>{selName}</h2>
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{profile ? LEVEL_LABEL[profile.region.level] : ""}{profile?.parent && profile.parent.level !== "provinsi" ? ` · ${titleCase(profile.parent.name)}` : ""} · {year}{year > last ? " (proyeksi)" : ""}</div>
                  </div>
                  <button className="btn" onClick={() => setSel(null)} aria-label="Tutup profil">✕</button>
                </div>
                <div className="flex gap-2 flex-wrap" style={{ margin: "10px 0" }}>
                  <button className="btn" onClick={() => setCmpState(toggleCmp(sel))} disabled={!inCmp && cmp.length >= CMP_MAX} title={`Maksimal ${CMP_MAX} wilayah`}>{inCmp ? "✓ Dalam perbandingan" : "＋ Bandingkan"}</button>
                  <Link href={`/wilayah/${sel}?i=${ind}`} className="btn btn-primary">Detail →</Link>
                </div>
                {profile && profile.region.id === sel && (
                  <>
                    {profile.region.level !== "desa" && <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 8px" }}>Nilai wilayah ini adalah <strong>akumulasi</strong> (jumlah, ditandai Σ) atau <strong>rata-rata tertimbang penduduk</strong> (x̄) dari seluruh desa di dalamnya.</p>}
                    {THEMES.map((th) => {
                      const rows = profile.items.filter((i) => i.theme === th);
                      if (!rows.length) return null;
                      return (
                        <div key={th} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: THEME_COLOR[th], margin: "4px 0" }}>{th}</div>
                          <div className="card-flat" style={{ overflow: "hidden" }}>
                            {rows.map((r) => {
                              const d = r.previous != null ? r.value - r.previous : null;
                              const t = d != null ? tone(r.direction, d) : "neutral";
                              return (
                                <button key={r.indicator} className="prof-row" onClick={() => { setInd(r.indicator); setTab("layer"); }} title="Tampilkan indikator ini di peta">
                                  <span style={{ flex: 1, textAlign: "left", fontSize: 13 }}>{r.name} <span style={{ color: "var(--muted)", fontSize: 11 }}>{r.agg === "jumlah" ? "Σ" : "x̄"}</span></span>
                                  <span style={{ textAlign: "right" }}>
                                    <strong style={{ fontSize: 14 }}>{fmt(r.value, r.unit)}</strong>
                                    {d != null && Math.abs(d) > 1e-9 && <span style={{ display: "block", fontSize: 11, color: t === "good" ? "var(--good)" : t === "bad" ? "var(--bad)" : "var(--muted)" }}>{d > 0 ? "▲" : "▼"} {fmtDelta(d, r.unit)}</span>}
                                  </span>
                                  {r.rank != null && <span className="rank-chip" title={`Peringkat ${r.rank} dari ${r.of} ${CHILD_LEVEL[profile.parent?.level ?? ""] ?? profile.region.level} di ${profile.parent ? titleCase(profile.parent.name) : "Lampung"}`}>#{r.rank}<small>/{r.of}</small></span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {profile.items.filter((i) => i.aux).map((r) => (
                      <div key={r.indicator} className="card-flat" style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span>{r.name} <span style={{ color: "var(--muted)", fontSize: 11 }}>{r.agg === "jumlah" ? "Σ" : "x̄"}</span></span><strong>{fmt(r.value, r.unit)}</strong>
                      </div>
                    ))}
                  </>
                )}
                {detail && cur && (
                  <div style={{ marginTop: 12 }}>
                    <div className="panel-h" style={{ marginTop: 0 }}>Tren · {cur.name}</div>
                    <SeriesChart s={detail} height={190} compact showCompare={false} />
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </aside>

      <div className="map-canvas">
        <div style={{ position: "absolute", left: 10, top: 10, zIndex: 5, display: "flex", gap: 8, flexWrap: "wrap", maxWidth: "calc(100% - 80px)" }}>
          {collapsed && <button className="btn float" onClick={() => setCollapsed(false)} aria-label="Buka panel">» Panel</button>}
          <nav className="float crumbs" aria-label="Posisi wilayah">
            {parentId && <button className="crumb" onClick={goBack} aria-label="Kembali satu tingkat">← Kembali</button>}
            <button className="crumb" onClick={goRoot} aria-current={!kab ? "page" : undefined}>Lampung</button>
            {kab && <><span aria-hidden>›</span><button className="crumb" onClick={goKab} aria-current={!kec ? "page" : undefined}>{titleCase(crumb[kab] ?? "…")}</button></>}
            {kec && <><span aria-hidden>›</span><button className="crumb" onClick={goKec} aria-current="page">{titleCase(crumb[kec] ?? "…")}</button></>}
            <span className="crumb-level">{LEVEL_LABEL[level]} ({vis?.features.length ?? "…"})</span>
          </nav>
          {cmp.length > 0 && <Link href={`/bandingkan?i=${ind}`} className="btn float">Bandingkan ({cmp.length}) →</Link>}
        </div>

        <MapView ref={mapRef} geo={vis} values={visValues} scale={scale} matched={matched} selected={sel} hovered={hover?.id ?? null} basemap={basemap} onBasemapFail={() => { setBasemap("terang"); setBasemapNote(true); }} onHover={setHover} onSelect={activate} />

        {hover && hover.x > 0 && hovered && cur && (
          <div role="tooltip" style={{ position: "absolute", left: hover.x + 14, top: hover.y + 14, pointerEvents: "none", zIndex: 6, maxWidth: 270 }} className="card">
            <div style={{ padding: "9px 11px" }}>
              <strong>{hovered.name}</strong>
              <div style={{ fontSize: 13 }}>{cur.name}: <strong>{fmt(hovered.v.value, diff ? "" : cur.unit)}</strong> {hovered.v.kind === "forecast" && !diff && <span className="badge badge-fc">Proyeksi</span>}</div>
              {hovered.v.lo80 != null && !diff && <div style={{ fontSize: 12, color: "var(--muted)" }}>80%: {fmt(hovered.v.lo80, cur.unit)} – {fmt(hovered.v.hi80, cur.unit)}</div>}
              {extra.map((x) => { const d = extraData[x]?.values[hover.id]; const xi = inds.find((i) => i.id === x); return d && xi ? <div key={x} style={{ fontSize: 12 }}>{xi.name}: {fmt(d.value, diff ? "" : xi.unit)}</div> : null; })}
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{level === "desa" ? "Klik untuk profil" : level === "kabupaten" ? "Klik untuk masuk ke kecamatan" : "Klik untuk masuk ke desa/kelurahan"}</div>
            </div>
          </div>
        )}

        {meta && (
          <div className="float" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 22, zIndex: 4, padding: "10px 18px 8px", width: "min(560px, calc(100% - 24px))" }}>
            <YearSlider years={years} lastActual={last} value={year} onChange={setYear} />
          </div>
        )}

        {scale && cur && (
          <div style={{ position: "absolute", right: 10, top: 76, zIndex: 4, width: 300, maxWidth: "calc(100% - 20px)", display: "flex", flexDirection: "column", gap: 8 }}>

            {/* Legenda */}
            <div className="float" style={{ padding: "11px 14px 10px" }} role="group" aria-label="Legenda">
              <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3 }}>{cur.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 7 }}>{year}{year > last ? " (proyeksi)" : ""}{diff ? ` · selisih vs ${last}` : ` · ${cur.unit}`}</div>
              <div aria-hidden style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", boxShadow: "inset 0 0 0 1px rgba(15,31,61,.12)" }}>
                {scale.colors.map((c) => <span key={c} style={{ flex: 1, background: c }} />)}
              </div>
              <div className="flex justify-between" style={{ fontSize: 10.5, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                {scale.breaks.map((b, i) => <span key={i}>{diff && b > 0 ? "+" : ""}{fmtCompact(b)}</span>)}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                5 kelas {diff ? "selang sama" : "kuantil (sebaran sama)"}; warna lebih gelap = nilai lebih tinggi{!diff && cur.direction !== "neutral" ? ` (${cur.direction === "low" ? "kurang baik" : "lebih baik"})` : ""}.
                {noData > 0 && <> Abu-abu = tanpa data ({noData}).</>}
              </div>
              <div style={{ marginTop: 5 }}><span className={`badge ${provBadge(cur.status).cls}`}>{provBadge(cur.status).text}</span> {year > last && <span className="badge badge-fc">Proyeksi</span>}</div>
            </div>

            {/* Peringkat — selalu tampil di bawah legenda */}
            {ranking.length > 0 && (
              <div className="float" style={{ padding: "10px 14px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>Peringkat {LEVEL_LABEL[level].toLowerCase()}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{ranking.length} wilayah</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>#1 = {cur.direction === "low" ? "nilai rendah lebih baik" : cur.direction === "high" ? "nilai tinggi lebih baik" : "nilai terbesar"}</div>
                <div className="flex gap-2 mb-2">
                  <div className="seg" role="tablist">
                    <button role="tab" aria-selected={!worstFirst} onClick={() => setWorstFirst(false)} style={{ flex: 1 }}>Terbaik</button>
                    <button role="tab" aria-selected={worstFirst} onClick={() => setWorstFirst(true)} style={{ flex: 1 }}>Terburuk</button>
                  </div>
                </div>
                <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4, maxHeight: 320, overflowY: "auto" }}>
                  {rankShown.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => activate(r.id)} onMouseEnter={() => setHover({ id: r.id, x: 0, y: 0 })} onMouseLeave={() => setHover(null)}
                        className="rank-row" aria-label={`Peringkat ${r.rank}: ${r.name}`}>
                        <span className="rank-badge">{r.rank}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 13.5 }}>
                            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titleCase(r.name)}</span>
                            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--muted)" }}>{fmt(r.v.value, diff ? "" : cur.unit)}</span>
                          </span>
                          <span aria-hidden style={{ display: "block", height: 5, background: "var(--chip)", borderRadius: 3, marginTop: 3 }}>
                            <span style={{ display: "block", height: 5, borderRadius: 3, width: `${Math.max(3, (Math.abs(r.v.value) / rankMax) * 100)}%`, background: scale?.color(r.v.value) ?? "var(--accent)" }} />
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                {ranking.length > 15 && <button className="btn" style={{ marginTop: 8, width: "100%" }} onClick={() => setShowAll((x) => !x)}>{showAll ? "Ringkas" : `Tampilkan semua (${ranking.length})`}</button>}
              </div>
            )}

          </div>
        )}
        {basemapNote && <div className="float" role="status" style={{ position: "absolute", left: "50%", top: 70, transform: "translateX(-50%)", padding: "8px 14px", fontSize: 13, zIndex: 5 }}>Tile OpenStreetMap tidak dapat dimuat, beralih ke Peta Terang. <button className="crumb" onClick={() => setBasemapNote(false)}>Tutup</button></div>}
        <div className="bm-wrap"><BasemapPicker value={basemap} onChange={(b) => { setBasemap(b); saveBasemap(b); }} /></div>
      </div>
    </div>
  );
}
