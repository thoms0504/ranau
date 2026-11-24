"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesResp } from "@/components/SeriesChart";
import { cached, get, Indicator, Meta } from "@/lib/api";
import { CMP_MAX, getCmp, setCmp } from "@/lib/compare";
import { fmt, fmtDelta, titleCase, tone } from "@/lib/format";
import { LEVEL_LABEL, THEME_COLOR, THEMES } from "@/lib/themes";

const PALETTE = ["#1d5084", "#d98f43", "#2a9d8f", "#7b6bc9", "#c4566a", "#6b8e23"];
interface Found { id: string; name: string; level: string; parent_name?: string }
interface PItem { indicator: string; name: string; theme: string; unit: string; direction: string; value: number; kind: string; lo80?: number; hi80?: number; aux: boolean }
interface Profile { region: { id: string; name: string; level: string }; parent: { name: string } | null; items: PItem[] }

export default function Bandingkan() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [inds, setInds] = useState<Indicator[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [theme, setTheme] = useState<string>("Kesehatan");
  const [ind, setInd] = useState("stunting");
  const [year, setYear] = useState(2026);
  const [series, setSeries] = useState<Record<string, SeriesResp>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([cached<Meta>("/meta"), cached<Indicator[]>("/indicators")]).then(([m, i]) => {
      setMeta(m); setInds(i);
      const p = new URLSearchParams(window.location.search);
      const r = (p.get("r") ?? "").split(",").filter(Boolean);
      setIds((r.length ? r : getCmp()).slice(0, CMP_MAX));
      const pi = p.get("i"); const cur = i.find((x) => x.id === pi && !x.aux);
      if (cur) { setInd(cur.id); setTheme(cur.theme); }
      const y = Number(p.get("y")); if (y && [...m.years, ...m.forecast_years].includes(y)) setYear(y); else setYear(m.forecast_years[0]);
      setReady(true);
    }).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams(); if (ids.length) p.set("r", ids.join(",")); p.set("i", ind); p.set("y", String(year));
    window.history.replaceState(null, "", `?${p.toString()}`);
    setCmp(ids);
  }, [ready, ids, ind, year]);

  useEffect(() => {
    if (!ready || !ids.length) { setSeries({}); return; }
    Promise.all(ids.map((id) => cached<SeriesResp>(`/regions/${id}/series?indicator=${ind}`).then((s) => [id, s] as const))).then((r) => setSeries(Object.fromEntries(r))).catch((e) => setErr(e.message));
  }, [ready, ids, ind]);
  useEffect(() => {
    if (!ready || !ids.length) { setProfiles({}); return; }
    Promise.all(ids.map((id) => cached<Profile>(`/regions/${id}/profile?year=${year}`).then((s) => [id, s] as const))).then((r) => setProfiles(Object.fromEntries(r))).catch((e) => setErr(e.message));
  }, [ready, ids, year]);

  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => get<Found[]>(`/search?q=${encodeURIComponent(q)}&limit=10`).then(setFound).catch(() => setFound([])), 200);
    return () => clearTimeout(t);
  }, [q]);

  const cards = useMemo(() => inds.filter((i) => !i.aux), [inds]);
  const themeInds = cards.filter((i) => i.theme === theme);
  const cur = inds.find((i) => i.id === ind);
  const last = meta?.last_actual ?? 2025;
  const years = meta ? [...meta.years, ...meta.forecast_years] : [];
  const nm = (id: string) => titleCase(series[id]?.region.name ?? profiles[id]?.region.name ?? id);
  const sub = (id: string) => { const p = profiles[id]; return p ? `${LEVEL_LABEL[p.region.level]}${p.parent ? " · " + titleCase(p.parent.name) : ""}` : ""; };

  // data grafik tren
  const lineData = useMemo(() => {
    const rows: Record<number, Record<string, number>> = {};
    ids.forEach((id, k) => {
      const s = series[id]; if (!s) return;
      s.actual.forEach((a) => { (rows[a.year] ??= { year: a.year })[`a${k}`] = a.value; });
      const lastA = s.actual.at(-1);
      if (lastA && s.forecast.length) (rows[lastA.year] ??= { year: lastA.year })[`f${k}`] = lastA.value;
      s.forecast.forEach((f) => { (rows[f.year] ??= { year: f.year })[`f${k}`] = f.yhat; });
    });
    return Object.values(rows).sort((a, b) => a.year - b.year);
  }, [ids, series]);

  // data batang pada tahun terpilih
  const barData = useMemo(() => ids.map((id, k) => {
    const s = series[id]; if (!s) return null;
    const v = s.actual.find((a) => a.year === year)?.value ?? s.forecast.find((f) => f.year === year)?.yhat;
    return v == null ? null : { name: nm(id), value: v, color: PALETTE[k % PALETTE.length] };
  }).filter(Boolean) as { name: string; value: number; color: string }[], [ids, series, year]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (f: Found) => { if (f.level !== "provinsi" && !ids.includes(f.id) && ids.length < CMP_MAX) setIds([...ids, f.id]); setQ(""); setFound([]); };
  const bestOf = (vals: { id: string; v: number }[], dir: string) => {
    if (vals.length < 2 || dir === "neutral") return null;
    return vals.reduce((a, b) => ((dir === "low" ? b.v < a.v : b.v > a.v) ? b : a)).id;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <div className="eyebrow">Analisis</div>
      <h1 className="page-title">Bandingkan wilayah</h1>
      <p className="lead" style={{ marginTop: 0 }}>Bandingkan beberapa desa/kelurahan, kecamatan, atau kabupaten/kota berdasarkan aspek tertentu — hasil aktual, estimasi, dan proyeksi berdampingan.</p>
      {err && <p role="alert" style={{ color: "var(--bad)" }}>{err}</p>}

      <section className="card" style={{ padding: 18, margin: "18px 0" }}>
        <div className="flex gap-2 flex-wrap items-center">
          {ids.map((id, k) => (
            <span key={id} className="chip-region" style={{ ["--rc" as string]: PALETTE[k % PALETTE.length] }}>
              <span aria-hidden className="dot" />
              <span><strong>{nm(id)}</strong><small>{sub(id)}</small></span>
              <button aria-label={`Hapus ${nm(id)}`} onClick={() => setIds(ids.filter((x) => x !== id))}>✕</button>
            </span>
          ))}
          {ids.length === 0 && <span style={{ color: "var(--muted)" }}>Belum ada wilayah. Cari di bawah atau klik “＋ Bandingkan” pada profil wilayah di peta.</span>}
        </div>
        <div style={{ position: "relative", marginTop: 14, maxWidth: 460 }}>
          <label style={{ fontSize: 13, fontWeight: 700 }}>Tambah wilayah ({ids.length}/{CMP_MAX})<br />
            <input className="field" style={{ width: "100%" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama desa, kecamatan, atau kabupaten…" disabled={ids.length >= CMP_MAX} /></label>
          {found.length > 0 && (
            <ul className="card" style={{ position: "absolute", zIndex: 20, left: 0, right: 0, margin: "4px 0 0", padding: 0, listStyle: "none", maxHeight: 260, overflowY: "auto" }}>
              {found.filter((f) => f.level !== "provinsi").map((f) => (
                <li key={f.id}><button className="btn" style={{ width: "100%", border: 0, borderRadius: 0, justifyContent: "space-between", fontWeight: 500 }} onClick={() => add(f)} disabled={ids.includes(f.id)}>
                  <span>{titleCase(f.name)}</span><span style={{ color: "var(--muted)", fontSize: 12 }}>{LEVEL_LABEL[f.level]}{f.parent_name ? ` · ${titleCase(f.parent_name)}` : ""}</span></button></li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {ids.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>Pilih minimal dua wilayah untuk mulai membandingkan. <br /><Link href="/peta" className="btn btn-primary" style={{ marginTop: 12 }}>Buka peta →</Link></div>
      ) : (
        <>
          <section className="flex gap-4 flex-wrap items-end" style={{ marginBottom: 14 }}>
            <div>
              <div className="panel-h" style={{ margin: "0 0 6px" }}>Aspek</div>
              <div className="seg" role="tablist" style={{ flexWrap: "wrap" }}>
                {THEMES.map((t) => <button key={t} role="tab" aria-selected={theme === t} onClick={() => { setTheme(t); const f = cards.find((i) => i.theme === t); if (f) setInd(f.id); }}>
                  <span aria-hidden style={{ display: "inline-block", width: 8, height: 8, borderRadius: 3, background: THEME_COLOR[t], marginRight: 6 }} />{t}</button>)}
              </div>
            </div>
            <label style={{ fontSize: 13, fontWeight: 700 }}>Tahun<br /><select className="field" value={year} onChange={(e) => setYear(+e.target.value)}>{years.map((y) => <option key={y} value={y}>{y}{y > last ? " (proyeksi)" : ""}</option>)}</select></label>
          </section>

          <section className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div className="flex gap-2 flex-wrap" style={{ marginBottom: 12 }}>
              {themeInds.map((i) => <button key={i.id} className="btn" aria-pressed={i.id === ind} onClick={() => setInd(i.id)} style={i.id === ind ? { background: "var(--brand)", color: "var(--brand-fg)", borderColor: "var(--brand)" } : undefined}>{i.name}</button>)}
            </div>
            <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>{cur?.name} <span style={{ fontSize: 13, color: "var(--muted)", fontFamily: "inherit" }}>({cur?.unit})</span></h2>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px" }}>Garis tegas = aktual/estimasi, putus-putus = proyeksi. {cur?.direction === "low" ? "Nilai lebih rendah lebih baik." : cur?.direction === "high" ? "Nilai lebih tinggi lebih baik." : ""}</p>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
              <div style={{ height: 320 }} role="img" aria-label={`Grafik tren ${cur?.name} untuk ${ids.length} wilayah`}>
                <ResponsiveContainer>
                  <ComposedChart data={lineData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={{ fill: "var(--muted)", fontSize: 12 }} />
                    <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} domain={["auto", "auto"]} width={54} tickFormatter={(v) => fmt(v, cur?.unit ?? "", 0).replace(/\s?(ton|unit|jiwa|tahun)$/, "")} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--fg)", borderRadius: 10 }}
                      formatter={(v, n) => [fmt(Number(v), cur?.unit ?? ""), String(n)]} labelFormatter={(y) => `${y}${Number(y) > last ? " (proyeksi)" : ""}`} />
                    <ReferenceLine x={last} stroke="var(--muted)" strokeDasharray="5 4" />
                    {ids.map((id, k) => <Line key={`f${id}`} dataKey={`f${k}`} name={`${nm(id)} (proyeksi)`} stroke={PALETTE[k % PALETTE.length]} strokeWidth={2.4} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls isAnimationActive={false} legendType="none" />)}
                    {ids.map((id, k) => <Line key={`a${id}`} dataKey={`a${k}`} name={nm(id)} stroke={PALETTE[k % PALETTE.length]} strokeWidth={2.6} dot={{ r: 3.5 }} connectNulls isAnimationActive={false} />)}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ height: 320 }} role="img" aria-label={`Grafik batang ${cur?.name} tahun ${year}`}>
                <div style={{ fontSize: 13, fontWeight: 700, margin: "0 0 4px" }}>Tahun {year}{year > last ? " (proyeksi)" : ""}</div>
                <ResponsiveContainer height={290}>
                  <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "var(--muted)", fontSize: 12 }} tickFormatter={(v) => fmt(v, cur?.unit ?? "", 0).replace(/\s?(ton|unit|jiwa|tahun)$/, "")} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fill: "var(--fg)", fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "var(--chip)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--fg)", borderRadius: 10 }} formatter={(v) => [fmt(Number(v), cur?.unit ?? ""), cur?.name ?? ""]} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>{barData.map((b) => <Cell key={b.name} fill={b.color} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="card" style={{ padding: 18, marginBottom: 18 }}>
            <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>Aspek {theme} · {year}{year > last ? " (proyeksi)" : ""}</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px" }}>Tanda ✓ = nilai terbaik di antara wilayah yang dibandingkan (menurut arah indikator).</p>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr><th>Indikator</th>{ids.map((id, k) => <th key={id} className="num" style={{ color: PALETTE[k % PALETTE.length] }}>{nm(id)}</th>)}</tr></thead>
                <tbody>
                  {themeInds.map((i) => {
                    const vals = ids.map((id) => ({ id, it: profiles[id]?.items.find((x) => x.indicator === i.id) })).filter((x) => x.it).map((x) => ({ id: x.id, v: x.it!.value }));
                    const best = bestOf(vals, i.direction);
                    return (
                      <tr key={i.id}>
                        <td style={{ fontWeight: 600 }}>{i.name}</td>
                        {ids.map((id) => {
                          const it = profiles[id]?.items.find((x) => x.indicator === i.id);
                          return <td key={id} className="num" style={best === id ? { background: "color-mix(in srgb, var(--good) 12%, transparent)", fontWeight: 800 } : undefined}>
                            {it ? <>{fmt(it.value, i.unit)}{best === id && " ✓"}{it.kind === "forecast" && it.lo80 != null && <small style={{ display: "block", color: "var(--muted)", fontWeight: 400 }}>80%: {fmt(it.lo80, i.unit)}–{fmt(it.hi80, i.unit)}</small>}</> : "–"}
                          </td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>Hasil aktual, estimasi, dan proyeksi · {cur?.name}</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px" }}>
              <span className="badge badge-dummy">estimasi</span> = sel kosong yang diisi model; <span className="badge badge-fc">proyeksi</span> = hasil prediksi dengan interval 80%.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead><tr><th>Wilayah</th>{years.map((y) => <th key={y} className="num">{y}</th>)}<th className="num">Δ {last}→{years.at(-1)}</th></tr></thead>
                <tbody>
                  {ids.map((id, k) => {
                    const s = series[id]; if (!s) return null;
                    const get1 = (y: number) => { const a = s.actual.find((x) => x.year === y); if (a) return { v: a.value, est: a.estimated, fc: false as const }; const f = s.forecast.find((x) => x.year === y); return f ? { v: f.yhat, est: false, fc: true as const, lo: f.lo80, hi: f.hi80 } : null; };
                    const a0 = get1(last)?.v, aN = get1(years.at(-1) ?? last)?.v;
                    const d = a0 != null && aN != null ? aN - a0 : null;
                    return (
                      <tr key={id}>
                        <td><span aria-hidden className="dot" style={{ background: PALETTE[k % PALETTE.length], display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 6 }} /><strong>{nm(id)}</strong><small style={{ display: "block", color: "var(--muted)" }}>{sub(id)}</small></td>
                        {years.map((y) => { const c = get1(y); return <td key={y} className="num" style={c?.fc ? { background: "color-mix(in srgb, var(--accent) 7%, transparent)" } : undefined}>
                          {c ? <>{fmt(c.v, cur?.unit ?? "")}{c.est && <small style={{ display: "block", color: "var(--warn)" }}>estimasi</small>}{c.fc && c.lo != null && <small style={{ display: "block", color: "var(--muted)" }}>{fmt(c.lo, cur?.unit ?? "")}–{fmt(c.hi, cur?.unit ?? "")}</small>}</> : "–"}</td>; })}
                        <td className="num" style={{ fontWeight: 700, color: d != null && cur ? (tone(cur.direction, d) === "good" ? "var(--good)" : tone(cur.direction, d) === "bad" ? "var(--bad)" : "var(--muted)") : undefined }}>{d != null && cur ? fmtDelta(d, cur.unit) : "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
