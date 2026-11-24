"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import SeriesChart, { SeriesResp } from "@/components/SeriesChart";
import { cached, get, Indicator, Meta } from "@/lib/api";
import { fmt, fmtDelta, fmtNum, titleCase, tone } from "@/lib/format";
import { LEVEL_LABEL, THEME_COLOR, THEMES } from "@/lib/themes";
import ThemeIcon from "@/components/ThemeIcon";

const LocationMap = dynamic(() => import("@/components/LocationMap"), { ssr: false, loading: () => <div style={{ height: 340, display: "grid", placeItems: "center", color: "var(--muted)" }}>Memuat peta lokasi…</div> });

interface Region { id: string; name: string; level: string; parent_id: string; area_km2: number; centroid_lng: number; centroid_lat: number; parent: { id: string; name: string; level: string } | null; children: { id: string; name: string; level: string }[] }
interface PItem { indicator: string; value: number; previous?: number | null; rank?: number | null; of?: number; kind: string; aux?: boolean }
interface Rank { rank: number; id: string; name: string; value: number; rank_change: number | null }

export default function Wilayah() {
  const { id } = useParams<{ id: string }>();
  const [reg, setReg] = useState<Region | null>(null);
  const [inds, setInds] = useState<Indicator[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ind, setInd] = useState("miskin");
  const [s, setS] = useState<SeriesResp | null>(null);
  const [rk, setRk] = useState<Rank[] | null>(null);
  const [err, setErr] = useState("");
  const [prof, setProf] = useState<PItem[]>([]);
  const [theme, setTheme] = useState<string | null>(null);
  const [sub, setSub] = useState<"tren" | "banding" | "rank" | "model">("tren");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("i"); if (q) setInd(q);
    Promise.all([get<Region>(`/regions/${id}`), cached<Indicator[]>("/indicators"), cached<Meta>("/meta")]).then(([r, i, m]) => { setReg(r); setInds(i); setMeta(m); }).catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    setS(null); setRk(null); setErr("");
    get<SeriesResp>(`/regions/${id}/series?indicator=${ind}`).then(setS).catch((e) => setErr(e.message));
  }, [id, ind]);

  useEffect(() => {
    get<{ items: PItem[] }>(`/regions/${id}/profile?year=${meta?.forecast_years[0] ?? 2026}`).then((r) => setProf(r.items)).catch(() => setProf([]));
  }, [id, meta]);
  const cur = inds.find((i) => i.id === ind);
  const activeTheme = theme ?? cur?.theme ?? THEMES[0];
  const themeInds = inds.filter((i) => i.theme === activeTheme);
  const pick = (id: string) => { setInd(id); window.history.replaceState(null, "", `?i=${id}`); };
  // tautan ke Peta Prediksi dengan drill-down yang sesuai level wilayah ini
  let peta = "/peta";
  if (reg) {
    const kabId = reg.id.slice(0, 4), kecId = reg.id.slice(0, 7);
    if (reg.level === "desa") peta = `/peta?i=${ind}&k=${kabId}&c=${kecId}&s=${reg.id}`;
    else if (reg.level === "kecamatan") peta = `/peta?i=${ind}&k=${kabId}&c=${reg.id}&s=${reg.id}`;
    else if (reg.level === "kabupaten") peta = `/peta?i=${ind}&k=${reg.id}&s=${reg.id}`;
    else peta = `/peta?i=${ind}`;
  }
  const lvl = reg?.level;
  const last = meta?.last_actual ?? 2025;
  const y1 = (meta?.forecast_years[0] ?? 2026);

  // peringkat sekitar wilayah ini pada tahun proyeksi pertama
  useEffect(() => {
    if (!lvl || lvl === "provinsi") return;
    get<{ rows: Rank[] }>(`/rankings?indicator=${ind}&year=${y1}&level=${lvl}&limit=5000`).then((r) => setRk(r.rows)).catch(() => setRk(null));
  }, [lvl, ind, y1]);

  const me = rk?.find((r) => r.id === id);
  const around = rk && me ? rk.slice(Math.max(0, me.rank - 4), me.rank + 3) : [];
  const lastVal = s?.actual.at(-1)?.value, f1 = s?.forecast[0];
  const delta = lastVal != null && f1 ? f1.yhat - lastVal : null;
  const cmp = (c?: { series: { year: number; value: number }[] }) => c?.series.find((p) => p.year === y1)?.value;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav aria-label="Jejak" style={{ fontSize: 14, color: "var(--muted)" }}>
        <Link href="/peta">Peta</Link> / {reg?.parent && reg.parent.level !== "provinsi" && <><Link href={`/wilayah/${reg.parent.id}`}>{titleCase(reg.parent.name)}</Link> / </>}
        <strong style={{ color: "var(--fg)" }}>{reg ? titleCase(reg.name) : id}</strong>
      </nav>
      <h1 className="page-title">{reg ? titleCase(reg.name) : "Memuat…"}</h1>
      {reg && <p style={{ margin: 0, color: "var(--muted)" }}>{reg.level} · kode {reg.id}{reg.area_km2 ? ` · ±${fmtNum(reg.area_km2, 0)} km²` : ""} · {s ? <span className={`badge ${s.is_dummy ? "badge-dummy" : "badge-real"}`}>{s.is_dummy ? "Dummy / campuran" : "Data nyata"}</span> : <span className="badge badge-dummy">Dummy</span>}</p>}

      {reg && (
        <section className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", margin: "18px 0 4px" }} aria-label="Lokasi wilayah">
          <div className="card" style={{ padding: 8, gridColumn: "span 2", minWidth: 0 }}>
            <LocationMap id={reg.id} level={reg.level} parentId={reg.parent_id || null} lng={reg.centroid_lng} lat={reg.centroid_lat} />
          </div>
          <div className="card" style={{ padding: 18 }}>
            <div className="eyebrow">Lokasi</div>
            <h2 style={{ fontSize: 20, margin: "2px 0 10px" }}>{LEVEL_LABEL[reg.level] ?? reg.level} {titleCase(reg.name)}</h2>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 14 }}>
              {reg.parent && <><dt style={{ color: "var(--muted)" }}>Termasuk dalam</dt><dd style={{ margin: 0 }}><Link href={`/wilayah/${reg.parent.id}`}>{titleCase(reg.parent.name)}</Link> <span style={{ color: "var(--muted)" }}>({LEVEL_LABEL[reg.parent.level] ?? reg.parent.level})</span></dd></>}
              <dt style={{ color: "var(--muted)" }}>Kode BPS</dt><dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{reg.id}</dd>
              {reg.level !== "provinsi" && <><dt style={{ color: "var(--muted)" }}>Titik pusat</dt><dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{Math.abs(reg.centroid_lat).toFixed(4)}° {reg.centroid_lat < 0 ? "LS" : "LU"}, {reg.centroid_lng.toFixed(4)}° BT</dd></>}
              {reg.area_km2 > 0 && <><dt style={{ color: "var(--muted)" }}>Luas perkiraan</dt><dd style={{ margin: 0 }}>±{fmtNum(reg.area_km2, 0)} km²</dd></>}
              {reg.children.length > 0 && <><dt style={{ color: "var(--muted)" }}>Cakupan</dt><dd style={{ margin: 0 }}>{reg.children.length} {reg.level === "kabupaten" ? "kecamatan" : reg.level === "kecamatan" ? "desa/kelurahan" : "kabupaten/kota"}</dd></>}
            </dl>
            <div className="flex gap-2 flex-wrap" style={{ marginTop: 14 }}>
              <Link className="btn btn-primary" href={peta}>Buka di Peta Prediksi</Link>
              {reg.level !== "provinsi" && <a className="btn" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${reg.centroid_lat}&mlon=${reg.centroid_lng}#map=13/${reg.centroid_lat}/${reg.centroid_lng}`}>OpenStreetMap ↗</a>}
            </div>
          </div>
        </section>
      )}

      <div role="tablist" aria-label="Tema indikator" className="theme-tabs theme-tabs-row" style={{ margin: "20px 0 12px" }}>
        {THEMES.map((th) => (
          <button key={th} role="tab" aria-selected={activeTheme === th} className="theme-tab" style={{ ["--tc" as string]: THEME_COLOR[th] }}
            onClick={() => { setTheme(th); const first = inds.find((i) => i.theme === th); if (first && cur?.theme !== th) pick(first.id); }}>
            <ThemeIcon theme={th} size={19} /><span>{th}</span>
          </button>
        ))}
      </div>
      <div className="ind-grid" aria-label={`Indikator ${activeTheme}`}>
        {themeInds.map((i) => {
          const pi = prof.find((x) => x.indicator === i.id);
          const d = pi && pi.previous != null ? pi.value - pi.previous : null;
          const t = d != null ? tone(i.direction, d) : "neutral";
          const active = i.id === ind;
          const bar = pi && (i.unit === "%" || i.unit.startsWith("skor")) ? Math.min(100, Math.max(0, pi.value)) : null;
          return (
            <button key={i.id} className={`ig-card ${active ? "active" : ""}`} style={{ ["--tc" as string]: THEME_COLOR[i.theme] }} aria-pressed={active} onClick={() => { pick(i.id); setSub("tren"); }}>
              <span className="ig-top">
                <span className="ic-ico"><ThemeIcon theme={i.theme} size={17} /></span>
                {pi?.rank != null && <span className="rank-chip">#{pi.rank}<small>/{pi.of}</small></span>}
              </span>
              <span className="ig-name">{i.name}</span>
              <span className="ig-val">{pi ? (i.unit === "%" ? fmt(pi.value, "%") : fmt(pi.value, "")) : "–"}{pi && i.unit !== "%" && !i.unit.startsWith("skor") && <small>{i.unit}</small>}</span>
              {d != null && <span className="ig-delta" style={{ color: t === "good" ? "var(--good)" : t === "bad" ? "var(--bad)" : "var(--muted)" }}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {fmtDelta(d, i.unit)} <small>vs {last}</small></span>}
              <span aria-hidden className="ic-bar" style={bar == null ? { visibility: "hidden" } : undefined}><span style={{ width: `${bar ?? 0}%` }} /></span>
            </button>
          );
        })}
      </div>

      {err && <p role="alert" className="card" style={{ padding: 14, color: "var(--bad)" }}>{err}</p>}

      {s && cur && (
        <div className="grid gap-4">
          <section className="card" style={{ padding: 18, ["--tc" as string]: THEME_COLOR[cur.theme] }}>
            <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: 10 }}>
              <div>
                <div className="eyebrow" style={{ color: THEME_COLOR[cur.theme] }}>{cur.theme}</div>
                <h2 style={{ margin: "2px 0 0", fontSize: 20 }}>Detail: {cur.name}</h2>
              </div>
              <div role="tablist" aria-label="Rincian" className="seg" style={{ maxWidth: "100%", overflowX: "auto" }}>
                {([["tren", "Tren & proyeksi"], ["banding", "Perbandingan"], ["rank", "Peringkat"], ["model", "Model"]] as [typeof sub, string][]).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)} style={{ whiteSpace: "nowrap" }}>{l}</button>
                ))}
              </div>
            </div>

            <div className="flex gap-6 flex-wrap items-end" style={{ marginBottom: 12 }}>
              <div><div className="kpi-label">Aktual {last}</div><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>{fmt(lastVal, cur.unit)}</div></div>
              {f1 && <div><div className="kpi-label"><span className="badge badge-fc">Proyeksi {f1.year}</span></div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>{fmt(f1.yhat, cur.unit)}</div></div>}
              {delta != null && <div style={{ color: tone(cur.direction, delta) === "good" ? "var(--good)" : tone(cur.direction, delta) === "bad" ? "var(--bad)" : "var(--muted)", fontWeight: 700, paddingBottom: 4 }}>
                {delta > 0 ? "▲" : "▼"} {fmtDelta(delta, cur.unit)} <span style={{ fontWeight: 400, color: "var(--muted)" }}>{tone(cur.direction, delta) === "good" ? "membaik" : tone(cur.direction, delta) === "bad" ? "memburuk" : ""}</span></div>}
            </div>

            {sub === "tren" && (
              <div role="tabpanel">
                {f1?.lo80 != null && <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 6px" }}>Interval {f1.year}: 80% = {fmt(f1.lo80, cur.unit)} – {fmt(f1.hi80, cur.unit)} · 95% = {fmt(f1.lo95, cur.unit)} – {fmt(f1.hi95, cur.unit)}</p>}
                <SeriesChart s={s} height={340} />
                <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Cara hitung indikator</summary><p style={{ fontSize: 14, margin: "6px 0 0" }}>{cur.formula}</p></details>
                <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 0 }}>Sumber: {s.source ?? "dummy-v1"}{s.is_dummy ? " · mengandung data dummy untuk pengembangan" : ""}.</p>
              </div>
            )}

            {sub === "banding" && (
              <div role="tabpanel">
                <div className="tbl-wrap"><table className="tbl tbl-compact"><thead><tr><th>Wilayah ({y1})</th><th className="num">Nilai</th></tr></thead><tbody>
                  <tr><td><strong>{titleCase(s.region.name)}</strong></td><td className="num"><strong>{fmt(f1?.yhat ?? lastVal, cur.unit)}</strong></td></tr>
                  {s.comparison.parent && s.comparison.parent.name !== "LAMPUNG" && <tr><td>Rata-rata {titleCase(s.comparison.parent.name)}</td><td className="num">{fmt(cmp(s.comparison.parent), cur.unit)}</td></tr>}
                  <tr><td>Provinsi Lampung</td><td className="num">{fmt(cmp(s.comparison.province), cur.unit)}</td></tr>
                </tbody></table></div>
                <p className="tbl-note">Nilai induk/provinsi adalah agregat (penjumlahan atau rata-rata tertimbang penduduk), bukan rata-rata sederhana.</p>
              </div>
            )}

            {sub === "rank" && (
              <div role="tabpanel">
                {s.ranks.length === 0 ? <p style={{ color: "var(--muted)" }}>Peringkat tidak tersedia untuk level ini.</p> : (
                  <>
                    <div className="flex gap-1 flex-wrap mb-2">
                      {s.ranks.map((r) => <span key={r.year} className={`badge ${r.year > last ? "badge-fc" : ""}`} style={r.year > last ? undefined : { background: "var(--chip)" }}>{r.year}: #{r.rank}/{r.of}</span>)}
                    </div>
                    {me && <p style={{ margin: "4px 0 10px", fontSize: 14 }}>Pada {y1}: peringkat <strong>{me.rank}</strong> dari {rk?.length}{me.rank_change ? <> (<span style={{ color: me.rank_change > 0 ? "var(--good)" : "var(--bad)" }}>{me.rank_change > 0 ? "naik" : "turun"} {Math.abs(me.rank_change)}</span> dibanding {y1 - 1})</> : " (tetap)"}. 1 = terbaik menurut arah indikator.</p>}
                    <div className="tbl-wrap"><table className="tbl tbl-compact"><thead><tr><th>#</th><th>Wilayah</th><th className="num">Nilai</th></tr></thead><tbody>
                      {around.map((r) => (<tr key={r.id} style={r.id === id ? { background: "color-mix(in srgb, var(--accent) 10%, var(--card))", fontWeight: 700 } : undefined}><td>{r.rank}</td><td><Link href={`/wilayah/${r.id}`}>{titleCase(r.name)}</Link></td><td className="num">{fmt(r.value, cur.unit)}</td></tr>))}
                    </tbody></table></div>
                  </>
                )}
              </div>
            )}

            {sub === "model" && (
              <div role="tabpanel">
                {s.model ? (
                  <>
                    <p style={{ margin: "0 0 4px" }}>Model: <strong>{s.model.label}</strong> <span style={{ color: "var(--muted)" }}>({s.model.version})</span></p>
                    <p style={{ margin: "4px 0", fontSize: 14 }}>
                      {s.model.beats_baseline ? "Model ML mengalahkan baseline terbaik pada backtest, sehingga dipakai." : `Model ML tidak mengalahkan baseline, sehingga sistem memakai baseline (${s.model.baseline_name}).`}
                    </p>
                    <p style={{ margin: "4px 0 10px", fontSize: 14 }}>Fitur utama: {s.model.features.join(", ")}.</p>
                    <div className="tbl-wrap"><table className="tbl tbl-compact"><thead><tr><th>Metrik (backtest)</th><th className="num">Model</th><th className="num">Baseline</th></tr></thead><tbody>
                      <tr><td>MAE</td><td className="num">{fmtNum(s.model.metrics.mae, 2)}</td><td className="num">{fmtNum(s.model.baseline.mae, 2)}</td></tr>
                      <tr><td>RMSE</td><td className="num">{fmtNum(s.model.metrics.rmse, 2)}</td><td className="num">{fmtNum(s.model.baseline.rmse, 2)}</td></tr>
                      <tr><td>sMAPE</td><td className="num">{fmtNum(s.model.metrics.smape, 1)}%</td><td className="num">{fmtNum(s.model.baseline.smape, 1)}%</td></tr>
                    </tbody></table></div>
                    <p className="tbl-note">Cakupan interval 80% pada backtest: {Math.round(s.model.coverage80 * 100)}%. {s.model.backtest}.</p>
                    {s.model.warnings.map((w) => <p key={w} style={{ fontSize: 13, color: "var(--warn)", margin: "2px 0" }}>⚠ {w}</p>)}
                  </>
                ) : <p style={{ color: "var(--muted)", margin: 0 }}>Wilayah tingkat provinsi dihitung dari agregat kabupaten/kota.</p>}
              </div>
            )}
          </section>

          {reg && reg.children.length > 0 && (
            <details className="card" style={{ padding: "12px 16px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Wilayah di bawahnya ({reg.children.length})</summary>
              <div className="flex gap-2 flex-wrap" style={{ marginTop: 10 }}>{reg.children.map((c) => <Link key={c.id} href={`/wilayah/${c.id}?i=${ind}`} className="btn" style={{ fontWeight: 500 }}>{titleCase(c.name)}</Link>)}</div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
