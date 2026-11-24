"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cached, Indicator, Meta } from "@/lib/api";
import { fmt, fmtDelta, titleCase, tone } from "@/lib/format";
import { THEME_COLOR, THEMES } from "@/lib/themes";
import ThemeIcon from "@/components/ThemeIcon";

interface HL { theme: string; indicator: string; name: string; unit: string; direction: string; last_year: number; last: number; year: number; projected: number | null; previous: number | null }
interface Att {
  year: number; method: string;
  regions: { id: string; name: string; count: number; indicators: string[] }[];
  per_indicator: { indicator: string; name: string; unit: string; direction: string; regions: { id: string; name: string; value: number }[] }[];
}


export default function Home() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [hl, setHl] = useState<HL[]>([]);
  const [att, setAtt] = useState<Att | null>(null);
  const [err, setErr] = useState("");
  const [inds, setInds] = useState<Indicator[]>([]);
  const [wt, setWt] = useState<string>(THEMES[0]);
  const [more, setMore] = useState(false);
  useEffect(() => {
    Promise.all([cached<Meta>("/meta"), cached<{ items: HL[] }>("/highlights"), cached<Att>("/attention?level=kabupaten"), cached<Indicator[]>("/indicators")])
      .then(([m, h, a, i]) => { setMeta(m); setHl(h.items); setAtt(a); setInds(i); })
      .catch((e) => setErr(e.message));
  }, []);

  const feat = hl.find((h) => h.indicator === "miskin") ?? hl[0];
  const stats: [string | number | undefined, string][] = meta ? [
    [meta.counts.kabupaten, "kabupaten/kota"], [meta.counts.kecamatan, "kecamatan"], [meta.counts.desa?.toLocaleString("id-ID"), "desa"],
    [meta.n_indicators, "indikator"], [meta.themes.length, "tema"], [`${meta.years[0]}–${String(meta.forecast_years.at(-1)).slice(2)}`, "rentang tahun"],
  ] : [];

  return (
    <div>
      <section className="hero">
        <div className="hero-grid" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-24 grid gap-10 items-center" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
          <div>
            <div className="eyebrow">Provinsi Lampung · Peta Prediksi Wilayah</div>
            <h1>Ke mana arah wilayah Lampung dalam tiga tahun ke depan?</h1>
            <p style={{ fontSize: 18, maxWidth: 560, margin: "0 0 26px" }}>
              Data historis lima tahun dipadukan dengan model prediksi untuk memproyeksikan indikator di tingkat kabupaten/kota, kecamatan, hingga desa —
              lengkap dengan interval ketidakpastian dan cara hitung yang terbuka.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link href="/peta" className="btn btn-gold btn-lg">Buka Peta Prediksi →</Link>
              <Link href="/metodologi" className="btn btn-lg">Lihat metodologi</Link>
            </div>
          </div>
          {feat && (
            <div className="float" style={{ padding: 22, color: "var(--fg)", maxWidth: 420, justifySelf: "end", width: "100%" }} aria-label="Contoh sorotan">
              <div className="eyebrow" style={{ marginBottom: 4 }}>Sorotan · {feat.theme}</div>
              <div style={{ fontWeight: 600 }}>{feat.name} (Provinsi Lampung)</div>
              <div className="flex items-end gap-6 flex-wrap" style={{ marginTop: 10 }}>
                <div><div style={{ fontSize: 12, color: "var(--muted)" }}>Aktual {feat.last_year}</div><div className="kpi">{fmt(feat.last, feat.unit)}</div></div>
                <div style={{ fontSize: 26, color: "var(--muted)", paddingBottom: 4 }} aria-hidden>→</div>
                <div><div style={{ fontSize: 12 }}><span className="badge badge-fc">Proyeksi {feat.year}</span></div><div className="kpi" style={{ color: "var(--accent)" }}>{fmt(feat.projected, feat.unit)}</div></div>
              </div>
              <div aria-hidden style={{ marginTop: 14, height: 56 }}>
                <svg viewBox="0 0 300 56" width="100%" height="56" preserveAspectRatio="none">
                  <path d="M0 40 C40 38 70 30 110 26 S170 22 200 20" fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
                  <path d="M200 20 C230 17 260 12 300 8" fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="6 5" strokeLinecap="round" />
                  <path d="M200 20 L300 0 L300 22 Z" fill="var(--accent)" opacity=".15" />
                  <line x1="200" y1="0" x2="200" y2="56" stroke="var(--muted)" strokeDasharray="3 3" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {err && <p role="alert" className="card" style={{ padding: 14, color: "var(--bad)", marginTop: 24 }}>Tidak dapat memuat data dari API: {err}. Pastikan backend berjalan di port 8000.</p>}

        <section aria-label="Angka ringkas" className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginTop: -56, position: "relative" }}>
          {stats.map(([n, l]) => (
            <div key={l} className="card stat-tile"><div className="stat-num">{n}</div><div style={{ color: "var(--muted)", fontSize: 13 }}>{l}</div></div>
          ))}
        </section>

        <section style={{ margin: "48px 0 40px" }}>
          <div className="eyebrow">Ringkasan provinsi</div>
          <h2 className="section-title">Sorotan lintas tema</h2>
          <p style={{ color: "var(--muted)", margin: "0 0 20px" }}>Satu indikator kunci per tema, tingkat provinsi: nilai {meta?.last_actual} dan proyeksi {meta?.forecast_years[0]}.</p>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
            {hl.map((h) => {
              const d = h.projected != null ? h.projected - h.last : 0;
              const t = tone(h.direction, d);
              const c = t === "good" ? "var(--good)" : t === "bad" ? "var(--bad)" : "var(--muted)";
              return (
                <Link key={h.indicator} href={`/peta?i=${h.indicator}&y=${h.year}&l=kabupaten`} className="card theme-card" style={{ textDecoration: "none", color: "var(--fg)", display: "block", ["--tc" as string]: THEME_COLOR[h.theme] }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em", color: THEME_COLOR[h.theme] }}>{h.theme}</div>
                  <div style={{ fontWeight: 600, margin: "3px 0 10px", minHeight: 44 }}>{h.name}</div>
                  <div className="kpi">{fmt(h.last, h.unit)} <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400, fontFamily: "inherit" }}>{h.last_year}</span></div>
                  <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 8, fontSize: 14 }}>
                    <span className="badge badge-fc">Proyeksi {h.year}</span>
                    <strong>{fmt(h.projected, h.unit)}</strong>
                    <span style={{ color: c, fontWeight: 600 }} aria-label={t === "good" ? "membaik" : t === "bad" ? "memburuk" : "netral"}>
                      {d > 0 ? "▲" : d < 0 ? "▼" : "■"} {fmtDelta(d, h.unit)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {att && (
          <section style={{ marginBottom: 24 }}>
            <div className="eyebrow">Penanda awal</div>
            <h2 className="section-title">Wilayah yang perlu perhatian</h2>
            <p style={{ color: "var(--muted)", margin: "0 0 20px" }}>Berdasarkan proyeksi {att.year} pada indikator berarah jelas. Bukan penilaian kinerja.</p>
            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 19 }}>Tiga kabupaten/kota teratas</h3>
                <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
                  {att.regions.map((r, i) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <span className="rank-no">{i + 1}</span>
                      <span><Link href={`/wilayah/${r.id}`} style={{ fontWeight: 700, fontSize: 16 }}>{titleCase(r.name)}</Link>
                        <span style={{ display: "block", color: "var(--muted)", fontSize: 13 }}>masuk 3 terburuk pada {r.count} indikator</span></span>
                    </li>
                  ))}
                </ol>
                <details style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>Cara hitung</summary>
                  <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 0 }}>{att.method}</p>
                </details>
              </div>
              <div className="card" style={{ padding: 20, minWidth: 0 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 19 }}>Terburuk per indikator</h3>
                <div role="tablist" aria-label="Tema" className="home-tabs">
                  {THEMES.map((th) => (
                    <button key={th} role="tab" aria-selected={wt === th} title={th} className="home-tab" style={{ ["--tc" as string]: THEME_COLOR[th] }} onClick={() => { setWt(th); setMore(false); }}>
                      <ThemeIcon theme={th} size={17} /><span>{th}</span>
                    </button>
                  ))}
                </div>
                {(() => {
                  const ids = new Set(inds.filter((i) => i.theme === wt).map((i) => i.id));
                  const rows = att.per_indicator.filter((p) => ids.has(p.indicator));
                  return rows.length === 0 ? <p style={{ color: "var(--muted)", margin: "14px 0 0", fontSize: 14 }}>Belum ada indikator berarah jelas pada tema ini.</p> : (
                    <ul className="worst-list">
                      {(more ? rows : rows.slice(0, 4)).map((p) => (
                        <li key={p.indicator}>
                          <div className="worst-name">{p.name}</div>
                          <div className="worst-regs">
                            {p.regions.map((r) => (
                              <Link key={r.id} href={`/wilayah/${r.id}?i=${p.indicator}`} className="worst-chip" style={{ ["--tc" as string]: THEME_COLOR[wt] }}>
                                {titleCase(r.name)} <b>{fmt(r.value, p.unit)}</b>
                              </Link>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
                {(() => {
                  const n = att.per_indicator.filter((p) => inds.find((i) => i.id === p.indicator)?.theme === wt).length;
                  return n > 4 ? <button className="btn" style={{ marginTop: 10, width: "100%" }} onClick={() => setMore((v) => !v)}>{more ? "Ringkas" : `Tampilkan semua (${n})`}</button> : null;
                })()}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
