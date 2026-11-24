"use client";
import { useEffect, useMemo, useState } from "react";
import { cached, Indicator, LEVELS, Meta } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { THEME_COLOR, THEMES } from "@/lib/themes";
import ThemeIcon from "@/components/ThemeIcon";

interface M {
  model_id: number; indicator: string; indicator_name: string; level: string; algo: string; label: string; version: string; trained_at: string;
  mae: number; rmse: number; smape: number; backtest_folds: number[]; backtest: string; baseline: string; baseline_mae: number; beats_baseline: boolean;
  coverage80: number; coverage95: number; n_regions: number; n_estimated: number; imputation?: { n: number; mae: number | null; mae_baseline: number | null }; warnings: string[];
}
type Tab = "cara" | "indikator" | "batas";
const NOISE = "Hanya 5 titik";

export default function Metodologi() {
  const [inds, setInds] = useState<Indicator[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [m, setM] = useState<{ items: M[]; summary: { models: number; beat_baseline: number; coverage80_in_range: number } } | null>(null);
  const [tab, setTab] = useState<Tab>("cara");
  const [theme, setTheme] = useState<string>(THEMES[0]);
  const [sel, setSel] = useState<string>("");
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([cached<Indicator[]>("/indicators"), cached<Meta>("/meta"), cached<typeof m>("/models/metrics")])
      .then(([i, mt, mm]) => { setInds(i); setMeta(mt); setM(mm); }).catch((e) => setErr(e.message));
    const h = window.location.hash.replace("#", "");
    if (h === "indikator" || h === "batas" || h === "cara") setTab(h);
  }, []);

  const list = useMemo(() => inds.filter((i) => i.theme === theme), [inds, theme]);
  const cur = list.find((i) => i.id === sel) ?? list[0];
  const models = (m?.items ?? []).filter((x) => x.indicator === cur?.id);
  const warn = (m?.items ?? []).filter((x) => x.warnings.some((w) => !w.startsWith(NOISE)));
  const switchTab = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 prose-page">
      <h1 className="page-title">Metodologi dan Kualitas Model</h1>
      <p className="lead" style={{ marginBottom: 18 }}>Cara data dibentuk, dihitung, dan diprediksi, serta seberapa andal tiap model per indikator.</p>
      {err && <p role="alert" style={{ color: "var(--bad)" }}>{err}</p>}

      <div role="tablist" className="seg" style={{ marginBottom: 20, maxWidth: "100%", overflowX: "auto" }}>
        {([["cara", "Sumber & cara hitung"], ["indikator", "Indikator & kualitas model"], ["batas", "Keterbatasan"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => switchTab(k)} style={{ whiteSpace: "nowrap" }}>{l}</button>
        ))}
      </div>

      {tab === "cara" && (
        <div className="grid gap-4">
          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Sumber data</h2>
            <p><span className="badge badge-dummy">Dummy</span> Seluruh angka pada versi ini adalah <strong>data dummy (dummy-v1)</strong> yang dibangkitkan dengan skrip reproduksibel (seed tetap) agar sistem dapat dibangun dan diuji. Angka meniru karakter data nyata Lampung (wilayah bertetangga bernilai mirip, tren landai, efek tahun bersama, korelasi antar indikator, dan beberapa anomali satu tahun), tetapi <strong>bukan data resmi</strong>.</p>
            <p style={{ marginBottom: 0 }}>Batas wilayah: {meta ? `${meta.counts.kabupaten} kabupaten/kota, ${meta.counts.kecamatan} kecamatan, ${meta.counts.desa} desa` : "…"} (WGS84/EPSG:4326, kunci wilayah = kode BPS/Kemendagri). Data historis {meta?.years[0]}–{meta?.last_actual}; proyeksi {meta?.forecast_years[0]}–{meta?.forecast_years.at(-1)}. Sekitar 5% sel level desa sengaja dikosongkan untuk menguji fitur <em>estimasi</em>.</p>
          </section>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
            {[
              ["Agregasi ke atas", <>Indikator jumlah (penduduk, padi, usaha, BUMDes, dan sejenisnya) dijumlahkan. Indikator persentase, skor, dan rata-rata dirata-ratakan dengan bobot jumlah penduduk.</>],
              ["Estimasi sel kosong", <>Garis tren per wilayah dari sel yang teramati ditambah efek tahun bersama seluruh wilayah, diiterasi beberapa kali. Akurasinya diuji dengan menyembunyikan 5% sel teramati.</>],
              ["Prediksi 1–3 tahun", <>Satu model global per indikator dan level (<em>pooling</em>), bukan model per desa, karena lima titik per deret terlalu rapuh. Model mempelajari seberapa jauh wilayah mengikuti tren sendiri versus tren induknya.</>],
              ["Baseline dan kandidat ML", <>Baseline wajib: naive, regresi linier tren, rata-rata bergerak 3 tahun. Kandidat ML: tren teredam, ridge pooled, gradient boosting pooled, ensemble linier+ridge, dan ensemble ML. Model ML hanya dipakai bila mengalahkan baseline terbaik. Admin dapat memaksa algoritma tertentu dan mengubah horizon (1–5 tahun).</>],
              ["Backtest rolling-origin", <>Latih 2021–2023 lalu uji 2024; latih 2021–2024 lalu uji 2025. Metrik: MAE, RMSE, sMAPE.</>],
              ["Interval prediksi", <>Lebar dari galat backtest (simpangan baku dan MAD), diperlebar dengan √horizon. Cakupan 80% diuji jujur: sigma lipatan pertama diterapkan pada lipatan kedua.</>],
              ["Wilayah perlu perhatian", <>Per indikator berarah jelas diambil 3 wilayah proyeksi terburuk, lalu kemunculannya dijumlahkan per wilayah. Ini penanda awal, bukan indeks komposit atau penilaian kinerja.</>],
            ].map(([t, body], k) => (
              <section key={k} className="card" style={{ padding: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 4 }}>{String(k + 1).padStart(2, "0")}</div>
                <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{t as string}</h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>{body as React.ReactNode}</p>
              </section>
            ))}
          </div>

          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 20 }}>Model yang dibandingkan</h2>
            <div className="tbl-wrap">
              <table className="tbl tbl-compact">
                <thead><tr><th>Model</th><th>Jenis</th><th>Cara kerja singkat</th></tr></thead>
                <tbody>
                  <tr><td>Naive</td><td><span className="badge badge-fc">Baseline</span></td><td>Nilai tahun terakhir diteruskan.</td></tr>
                  <tr><td>Regresi linier tren</td><td><span className="badge badge-fc">Baseline</span></td><td>Garis tren per wilayah dari lima titik.</td></tr>
                  <tr><td>Rata-rata bergerak 3 tahun</td><td><span className="badge badge-fc">Baseline</span></td><td>Rata-rata tiga tahun terakhir.</td></tr>
                  <tr><td>Tren teredam</td><td><span className="badge badge-mix">ML</span></td><td>Tren linier yang melandai seiring horizon.</td></tr>
                  <tr><td>Ridge pooled</td><td><span className="badge badge-mix">ML</span></td><td>Satu model untuk semua wilayah dengan penyusutan ke tren induk.</td></tr>
                  <tr><td>Gradient boosting pooled</td><td><span className="badge badge-mix">ML</span></td><td>Pohon keputusan bertahap (stump) pada fitur tren dan konteks wilayah.</td></tr>
                  <tr><td>Ensemble linier+ridge, ensemble ML</td><td><span className="badge badge-mix">ML</span></td><td>Rata-rata beberapa model; dipakai bila MAE backtest lebih rendah.</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "indikator" && (
        <div>
          {m && <p style={{ marginTop: 0 }}>Model terpilih mengalahkan baseline pada <strong>{m.summary.beat_baseline} dari {m.summary.models}</strong> model ({Math.round(m.summary.beat_baseline / m.summary.models * 100)}%; target ≥ 70%). Cakupan interval 80% berada di rentang 70–90% pada <strong>{m.summary.coverage80_in_range} dari {m.summary.models}</strong> model.</p>}

          <div role="tablist" aria-label="Tema indikator" className="theme-tabs" style={{ marginBottom: 14 }}>
            {THEMES.map((th) => (
              <button key={th} role="tab" aria-selected={theme === th} className="theme-tab" style={{ ["--tc" as string]: THEME_COLOR[th] }} onClick={() => { setTheme(th); setSel(""); }}>
                <ThemeIcon theme={th} size={19} /><span>{th}</span>
              </button>
            ))}
          </div>

          <div className="mt-grid">
            <nav aria-label="Indikator" className="mt-list" style={{ ["--tc" as string]: THEME_COLOR[theme] }}>
              {list.map((i) => (
                <button key={i.id} className={`mt-item ${cur?.id === i.id ? "on" : ""}`} aria-current={cur?.id === i.id} onClick={() => setSel(i.id)}>{i.name}</button>
              ))}
            </nav>

            {cur && (
              <article className="card mt-detail" style={{ ["--tc" as string]: THEME_COLOR[theme] }}>
                <div className="flex items-start gap-3">
                  <span className="ic-ico" style={{ ["--tc" as string]: THEME_COLOR[theme] }}><ThemeIcon theme={theme} size={20} /></span>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ margin: 0, fontSize: 20 }}>{cur.name}</h2>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 14 }}>{cur.description}</p>
                  </div>
                </div>
                <table className="tbl tbl-kv" style={{ marginTop: 14 }}><tbody>
                  <tr><th>Satuan</th><td>{cur.unit}</td><th>Arah baik</th><td>{cur.direction === "low" ? "Rendah" : cur.direction === "high" ? "Tinggi" : "Netral"}</td></tr>
                  <tr><th>Agregasi</th><td colSpan={3}>{cur.agg === "jumlah" ? "Penjumlahan seluruh desa di dalam wilayah" : "Rata-rata tertimbang jumlah penduduk"}</td></tr>
                </tbody></table>
                <div className="mt-formula"><strong>Cara hitung:</strong> {cur.formula}</div>

                <h3 style={{ margin: "20px 0 8px", fontSize: 15 }}>Kualitas model per level</h3>
                <div className="tbl-wrap">
                  <table className="tbl tbl-compact">
                    <thead><tr><th>Level</th><th>Model dipakai</th><th>Status</th><th className="num">MAE</th><th className="num">MAE baseline</th><th className="num">RMSE</th><th className="num">sMAPE</th><th className="num">Cakupan 80%</th><th>Backtest 2024 / 2025</th></tr></thead>
                    <tbody>
                      {LEVELS.map((l) => {
                        const r = models.find((x) => x.level === l.id);
                        if (!r) return <tr key={l.id}><td>{l.label}</td><td colSpan={8} style={{ color: "var(--muted)" }}>Belum ada model</td></tr>;
                        const okCov = r.coverage80 >= 0.7 && r.coverage80 <= 0.9;
                        return (
                          <tr key={l.id}>
                            <td><strong>{l.label}</strong></td>
                            <td>{r.label}</td>
                            <td><span className={`badge ${r.beats_baseline ? "badge-real" : "badge-dummy"}`}>{r.beats_baseline ? "Lebih baik dari baseline" : "Baseline dipakai"}</span></td>
                            <td className="num">{fmtNum(r.mae, 2)}</td><td className="num">{fmtNum(r.baseline_mae, 2)}</td>
                            <td className="num">{fmtNum(r.rmse, 2)}</td><td className="num">{fmtNum(r.smape, 1)}%</td>
                            <td className="num" style={{ color: okCov ? undefined : "var(--warn)", fontWeight: okCov ? undefined : 700 }}>{Math.round(r.coverage80 * 100)}%</td>
                            <td style={{ whiteSpace: "nowrap" }}>{r.backtest_folds.map((x) => fmtNum(x, 2)).join(" / ")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {models.some((r) => r.n_estimated > 0 && r.imputation && r.imputation.mae != null && r.imputation.mae_baseline != null) && (
                  <p className="tbl-note">Estimasi sel kosong: {models.filter((r) => r.n_estimated > 0 && r.imputation?.mae != null && r.imputation?.mae_baseline != null).map((r) => `${LEVELS.find((l) => l.id === r.level)?.label} ${r.n_estimated} sel (MAE ${fmtNum(r.imputation!.mae!, 2)} vs ${fmtNum(r.imputation!.mae_baseline!, 2)} rata-rata wilayah)`).join("; ")}.</p>
                )}
                {models.some((r) => r.warnings.some((w) => !w.startsWith(NOISE))) && (
                  <ul className="tbl-note" style={{ color: "var(--warn)", paddingLeft: 18, margin: "6px 0 0" }}>
                    {models.flatMap((r) => r.warnings.filter((w) => !w.startsWith(NOISE)).map((w, k) => <li key={r.model_id + "-" + k}>{LEVELS.find((l) => l.id === r.level)?.label}: {w}</li>))}
                  </ul>
                )}
                <p className="tbl-note">MAE/RMSE memakai satuan indikator ({cur.unit}); sMAPE dalam persen. Cakupan 80% idealnya 70–90%. Versi model {models[0]?.version ?? "–"}{models[0] ? `, dilatih ${models[0].trained_at.slice(0, 10)}` : ""}.</p>
              </article>
            )}
          </div>

          {warn.length > 0 && (
            <details className="card-flat" style={{ padding: 12, marginTop: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--warn)" }}>Peringatan otomatis ({warn.length} model)</summary>
              <ul style={{ margin: "8px 0 0" }}>{warn.map((w) => <li key={w.model_id} style={{ fontSize: 13.5 }}>{w.indicator_name} ({w.level}): {w.warnings.filter((x) => !x.startsWith(NOISE)).join(" ")}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      {tab === "batas" && (
        <section className="card" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Keterbatasan</h2>
          <ul>
            <li>Hanya lima titik waktu per deret; proyeksi 2–3 tahun semakin tidak pasti (interval melebar).</li>
            <li>Model tidak mengenal sebab (kebijakan, bencana, program); lonjakan satu tahun dapat memengaruhi tren.</li>
            <li>Kabupaten/kota hanya 15 wilayah sehingga uji cakupan interval di level ini kurang stabil.</li>
            <li>Dua kecamatan “Hutan” (kode 999) tidak memiliki desa dan dikecualikan dari data indikator.</li>
            <li>Kecamatan Umpu Semenguk batasnya dibentuk dari gabungan desa karena tidak ada pada berkas kecamatan.</li>
            <li>Daftar indikator adalah usulan berdasarkan standar desa (IDM, PODES), bukan daftar resmi SIKOP.</li>
            <li>Hasil adalah penanda awal untuk ditelusuri, bukan penilaian kinerja daerah.</li>
          </ul>
        </section>
      )}
    </div>
  );
}
