"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { cached, Indicator, LEVELS, V1 } from "@/lib/api";
import { fmtNum, titleCase } from "@/lib/format";

interface Job { id: number; kind: string; status: string; message: string; started_at: string; finished_at: string | null }
interface Algo { id: string; label: string; kind: string }
interface Found { id: string; name: string; level: string; parent_name?: string }
interface ObsRow { year: number; value: number | null; source: string | null; is_dummy: boolean | null; estimate: number | null; editable: boolean }
interface ObsResp { region: { id: string; name: string; level: string }; indicator: Indicator; rows: ObsRow[] }
interface MM {
  model_id: number; indicator: string; indicator_name: string; level: string; algo: string; label: string; version: string; trained_at: string;
  mae: number; baseline: string; baseline_mae: number; beats_baseline: boolean; candidates: Record<string, { mae: number }>; warnings: string[];
}
type Tab = "input" | "model" | "job";

export default function Admin() {
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<Tab>("input");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inds, setInds] = useState<Indicator[]>([]);
  const [algos, setAlgos] = useState<Algo[]>([]);
  const [models, setModels] = useState<MM[]>([]);
  const [dirty, setDirty] = useState<{ ind: string; level: string } | null>(null);

  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginErr, setLoginErr] = useState("");

  useEffect(() => {
    const t = sessionStorage.getItem("ranau_admin") ?? "";
    cached<Indicator[]>("/indicators").then(setInds);
    if (!t) { setChecked(true); return; }
    fetch(`${V1}/admin/me`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => { if (r.ok) { setToken(t); setAuthed(true); } else sessionStorage.removeItem("ranau_admin"); })
      .catch(() => undefined).finally(() => setChecked(true));
  }, []);
  const call = useCallback(async (path: string, method = "GET", body?: unknown) => {
    const r = await fetch(`${V1}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { sessionStorage.removeItem("ranau_admin"); setToken(""); setAuthed(false); }
    if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? r.statusText));
    return j;
  }, [token]);
  const loadJobs = useCallback(() => call("/admin/jobs").then(setJobs).catch((e) => { setJobs([]); setMsg({ ok: false, text: e.message }); }), [call]);
  const loadModels = useCallback(() => fetch(`${V1}/models/metrics`).then((r) => r.json()).then((j) => setModels(j.items)).catch(() => undefined), []);

  useEffect(() => { if (!token) return; loadJobs(); loadModels(); call("/admin/algos").then(setAlgos).catch(() => undefined); }, [token, loadJobs, loadModels, call]);
  const running = jobs.some((j) => j.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => { loadJobs(); }, 1500);
    return () => clearInterval(t);
  }, [running, loadJobs]);
  useEffect(() => { if (!running && jobs.length) loadModels(); }, [running, jobs.length, loadModels]);

  const startJob = async (path: string, label: string) => {
    setMsg(null);
    try { const r = await call(path, "POST"); setMsg({ ok: true, text: `${label}: job #${r.job_id} dimulai.` }); setDirty(null); setTab("job"); loadJobs(); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };

  const logout = () => { sessionStorage.removeItem("ranau_admin"); setToken(""); setAuthed(false); setMsg(null); };
  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setLoginErr("");
    try {
      const r = await fetch(`${V1}/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "gagal masuk");
      sessionStorage.setItem("ranau_admin", j.token); setToken(j.token); setAuthed(true); setPass("");
    } catch (er) { setLoginErr((er as Error).message === "Failed to fetch" ? "Tidak dapat menghubungi server API." : (er as Error).message); }
    setBusy(false);
  };

  if (!checked) return <div className="mx-auto max-w-5xl px-4 py-8" style={{ color: "var(--muted)" }}>Memeriksa sesi…</div>;
  if (!authed) return (
    <div className="mx-auto px-4 py-16" style={{ maxWidth: 400 }}>
      <form onSubmit={login} className="card" style={{ padding: 28 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Area terbatas</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>Masuk pengelola</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 18px" }}>Khusus pengelola data dan model RANAU.</p>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Nama pengguna
          <input className="field" style={{ width: "100%", marginTop: 4, marginBottom: 12 }} autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} required autoFocus /></label>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Kata sandi
          <input type="password" className="field" style={{ width: "100%", marginTop: 4 }} autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required /></label>
        {loginErr && <p role="alert" style={{ color: "var(--bad)", fontSize: 13, margin: "12px 0 0" }}>{loginErr}</p>}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 18, justifyContent: "center" }} disabled={busy}>{busy ? "Memeriksa…" : "Masuk"}</button>
      </form>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-3">
        <h1 className="page-title" style={{ margin: 0 }}>Admin</h1>
        <button className="btn" onClick={logout}>Keluar</button>
      </div>
      <div role="tablist" className="flex gap-2 mb-3">
        {([["input", "Input data"], ["model", "Model & prediksi"], ["job", `Job${running ? " ⏳" : ""}`]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className="btn" onClick={() => setTab(k)} style={tab === k ? { background: "var(--brand)", color: "var(--brand-fg)", borderColor: "var(--brand)" } : undefined}>{l}</button>
        ))}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className="card" style={{ padding: 10, color: msg.ok ? "var(--good)" : "var(--bad)" }}>{msg.text}</p>}
      {dirty && (
        <div role="status" className="card" style={{ padding: 12, marginBottom: 12, borderColor: "var(--warn)" }}>
          <strong style={{ color: "var(--warn)" }}>Data berubah.</strong> Proyeksi belum memakainya.{" "}
          <button className="btn btn-primary" disabled={running} onClick={() => startJob(`/admin/train?mode=predict&indicator=${dirty.ind}`, "Prediksi ulang")}>Prediksi ulang indikator ini</button>{" "}
          <button className="btn" disabled={running} onClick={() => startJob("/admin/train?mode=predict", "Prediksi ulang semua")}>Semua indikator</button>
        </div>
      )}

      {tab === "input" && <InputTab call={call} inds={inds} setMsg={setMsg} onChanged={(ind, level) => setDirty({ ind, level })} />}
      {tab === "model" && <ModelTab algos={algos} inds={inds} models={models} running={running} startJob={startJob} />}
      {tab === "job" && (
        <div className="card" style={{ padding: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Status job</h2>
          <table className="tbl"><thead><tr><th>#</th><th>Jenis</th><th>Status</th><th>Mulai</th><th>Pesan</th></tr></thead><tbody>
            {jobs.map((j) => <tr key={j.id}><td>{j.id}</td><td>{j.kind}</td><td style={{ fontWeight: 700, color: j.status === "done" ? "var(--good)" : j.status === "failed" ? "var(--bad)" : "var(--warn)" }}>{j.status}</td><td style={{ fontSize: 12 }}>{j.started_at}</td><td style={{ fontSize: 12 }}>{j.message}</td></tr>)}
            {jobs.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>Belum ada job.</td></tr>}
          </tbody></table>
          <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "16px 0" }} />
          <h3 style={{ margin: "0 0 6px" }}>Data dummy</h3>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>Membangkitkan ulang menghapus seluruh data (termasuk input manual) serta model &amp; proyeksi; lanjutkan dengan pelatihan.</p>
          <button className="btn" disabled={running} onClick={() => { if (confirm("Data input manual akan terhapus dan diganti dummy baru. Lanjutkan?")) startJob("/admin/generate-dummy?force=true", "Bangkitkan dummy"); }}>Bangkitkan ulang data dummy</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Input data ---------------- */
function InputTab({ call, inds, setMsg, onChanged }: { call: (p: string, m?: string, b?: unknown) => Promise<any>; inds: Indicator[]; setMsg: (m: { ok: boolean; text: string } | null) => void; onChanged: (ind: string, level: string) => void }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [region, setRegion] = useState<Found | null>(null);
  const [ind, setInd] = useState("miskin");
  const [obs, setObs] = useState<ObsResp | null>(null);
  const [edit, setEdit] = useState<Record<number, string>>({});
  const [recompute, setRecompute] = useState(true);
  const [csv, setCsv] = useState("");
  const [dropBelow, setDropBelow] = useState(false);
  const [bulkRes, setBulkRes] = useState<{ applied: number; failed: number; format?: string; warnings?: string[]; errors: { row: number; data: string; error: string }[] } | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => fetch(`${V1}/search?q=${encodeURIComponent(q)}&limit=10`).then((r) => r.json()).then(setFound).catch(() => setFound([])), 200);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    if (!region) return;
    call(`/admin/observations?region_id=${region.id}&indicator_id=${ind}`).then((o) => { setObs(o); setEdit({}); }).catch((e) => setMsg({ ok: false, text: e.message }));
  }, [region, ind, call, setMsg]);
  useEffect(load, [load]);

  const save = async () => {
    const changes = Object.entries(edit).filter(([, v]) => v !== "");
    if (!region || !changes.length) return;
    try {
      for (const [y, v] of changes) await call("/admin/observations", "PUT", { region_id: region.id, indicator_id: ind, year: Number(y), value: v === "__null" ? null : Number(String(v).replace(",", ".")), recompute });
      setMsg({ ok: true, text: `${changes.length} nilai disimpan${recompute ? "; agregat kecamatan/kabupaten/provinsi dihitung ulang" : ""}.` });
      onChanged(ind, region.level); load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const importCsv = async () => {
    try { const r = await call("/admin/observations/bulk", "POST", { csv, recompute, drop_dummy_below: dropBelow }); setBulkRes(r); if (r.applied) { setMsg({ ok: true, text: `${r.applied} baris diterapkan, ${r.failed} gagal.` }); onChanged("", ""); } }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const tpl = "region_id,indicator_id,year,value\n1801040001,miskin,2025,15.4\n1801040001,penduduk,2025,3120\n";

  return (
    <div className="grid gap-4">
      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Input satu wilayah</h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          <div style={{ position: "relative" }}>
            <label>Wilayah (cari nama/kode, kab/kec/desa)<br /><input className="field" style={{ width: "100%" }} value={region ? `${titleCase(region.name)} (${region.id})` : q} onChange={(e) => { setRegion(null); setObs(null); setQ(e.target.value); }} placeholder="mis. Kubu Perahu" /></label>
            {!region && found.length > 0 && (
              <ul className="card" style={{ position: "absolute", zIndex: 10, left: 0, right: 0, margin: 0, padding: 0, listStyle: "none", maxHeight: 240, overflowY: "auto" }}>
                {found.filter((f) => f.level !== "provinsi").map((f) => (
                  <li key={f.id}><button className="btn" style={{ width: "100%", border: 0, borderRadius: 0, justifyContent: "space-between", fontWeight: 500 }} onClick={() => { setRegion(f); setFound([]); }}>
                    <span>{titleCase(f.name)}</span><span style={{ color: "var(--muted)", fontSize: 12 }}>{f.level}{f.parent_name ? ` · ${titleCase(f.parent_name)}` : ""}</span></button></li>
                ))}
              </ul>
            )}
          </div>
          <label>Indikator<br /><select className="field" style={{ width: "100%" }} value={ind} onChange={(e) => setInd(e.target.value)}>{inds.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></label>
        </div>

        {obs && (
          <>
            <table className="tbl" style={{ marginTop: 12 }}><thead><tr><th>Tahun</th><th className="num">Nilai saat ini</th><th>Sumber</th><th>Nilai baru ({obs.indicator.unit})</th><th /></tr></thead><tbody>
              {obs.rows.map((r) => (
                <tr key={r.year}>
                  <td>{r.year}</td>
                  <td className="num">{r.value != null ? fmtNum(r.value, 2) : r.estimate != null ? <em style={{ color: "var(--muted)" }}>{fmtNum(r.estimate, 2)} (estimasi)</em> : "–"}</td>
                  <td>{r.source ? <span className={`badge ${r.is_dummy ? "badge-dummy" : "badge-fc"}`}>{r.is_dummy ? "dummy" : r.source}</span> : "kosong"}</td>
                  <td><input className="field" style={{ width: 130 }} inputMode="decimal" aria-label={`Nilai ${r.year}`} disabled={!r.editable} value={edit[r.year] === "__null" ? "" : edit[r.year] ?? ""} placeholder="tidak diubah" onChange={(e) => setEdit((x) => ({ ...x, [r.year]: e.target.value }))} /></td>
                  <td><button className="btn" onClick={() => setEdit((x) => ({ ...x, [r.year]: "__null" }))} title="Kosongkan (nanti diestimasi)">Kosongkan</button></td>
                </tr>
              ))}
            </tbody></table>
            <div className="flex gap-3 items-center flex-wrap" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" disabled={!Object.values(edit).some((v) => v !== "")} onClick={save}>Simpan perubahan</button>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={recompute} onChange={(e) => setRecompute(e.target.checked)} /> Hitung ulang agregat induk (kecamatan → kabupaten → provinsi)</label>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 0 }}>Nilai manual ditandai sumber “manual” (bukan dummy). Persentase/skor harus 0–100; jumlah tidak boleh negatif. Mengosongkan sel membuatnya diestimasi saat pelatihan.</p>
          </>
        )}
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Impor data nyata (CSV)</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>Tiga bentuk dikenali otomatis: <code>region_id, indikator, tahun, nilai</code> · <code>region_id, indikator, 2021…2025</code> · <code>region_id, tahun, miskin, stunting, …</code>. Wilayah bisa berupa kode BPS atau nama (kolom <code>desa</code>, <code>kecamatan</code>, <code>kabupaten</code>). Angka <code>12,5</code> dan <code>1.234,5</code> dikenali. Nilai ditulis sebagai <strong>data nyata</strong> (menimpa dummy) dan agregat induk dihitung ulang. ID indikator: {inds.map((i) => i.id).join(", ")}. Untuk berkas besar gunakan CLI <code>python -m ml.seed_real</code>.</p>
        <textarea className="field" style={{ width: "100%", minHeight: 130, fontFamily: "ui-monospace, monospace" }} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={tpl} aria-label="Isi CSV" />
        <div className="flex gap-2 flex-wrap items-center" style={{ marginTop: 8 }}>
          <input type="file" accept=".csv,.txt" aria-label="Pilih berkas CSV" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
          <a className="btn" href={`data:text/csv;charset=utf-8,${encodeURIComponent(tpl)}`} download="template_input_ranau.csv">Unduh templat</a>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={dropBelow} onChange={(e) => setDropBelow(e.target.checked)} /> Hapus dummy di level yang lebih rinci</label>
          <button className="btn btn-primary" disabled={!csv.trim()} onClick={importCsv}>Impor</button>
        </div>
        {bulkRes && (
          <div style={{ marginTop: 10 }}>
            <strong>{bulkRes.applied} nilai diterapkan{bulkRes.format ? ` (bentuk: ${bulkRes.format})` : ""}, {bulkRes.failed} bermasalah.</strong>
            {bulkRes.warnings?.map((w) => <div key={w} style={{ fontSize: 13, color: "var(--warn)" }}>⚠ {w}</div>)}
            {bulkRes.applied > 0 && <div style={{ fontSize: 13, marginTop: 4 }}>Selanjutnya buka tab <em>Model &amp; prediksi</em> → “Latih ulang” agar proyeksi memakai data nyata.</div>}
            {bulkRes.errors.length > 0 && <table className="tbl"><thead><tr><th>Baris</th><th>Data</th><th>Kesalahan</th></tr></thead><tbody>{bulkRes.errors.map((e) => <tr key={e.row}><td>{e.row}</td><td style={{ fontFamily: "monospace", fontSize: 12 }}>{e.data}</td><td style={{ color: "var(--bad)" }}>{e.error}</td></tr>)}</tbody></table>}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Model & prediksi ---------------- */
function ModelTab({ algos, inds, models, running, startJob }: { algos: Algo[]; inds: Indicator[]; models: MM[]; running: boolean; startJob: (p: string, l: string) => void }) {
  const [algo, setAlgo] = useState("auto");
  const [selInd, setSelInd] = useState<string[]>([]);
  const [selLvl, setSelLvl] = useState<string[]>([]);
  const [horizon, setHorizon] = useState(3);
  const [open, setOpen] = useState<number | null>(null);
  const tog = (arr: string[], v: string, set: (a: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const qs = (mode: string) => `/admin/train?mode=${mode}&algo=${algo}&horizon=${horizon}&indicator=${selInd.join(",")}&level=${selLvl.join(",")}`;
  const scope = `${selInd.length || "semua"} indikator × ${selLvl.length || "semua"} level`;

  return (
    <div className="grid gap-4">
      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Jalankan model</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          <label>Algoritma<br />
            <select className="field" style={{ width: "100%" }} value={algo} onChange={(e) => setAlgo(e.target.value)}>
              <option value="auto">Otomatis — model terakurat menurut backtest</option>
              <optgroup label="Baseline">{algos.filter((a) => a.kind === "baseline").map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</optgroup>
              <optgroup label="Machine learning">{algos.filter((a) => a.kind === "ml").map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</optgroup>
            </select>
          </label>
          <label>Horizon proyeksi<br /><select className="field" style={{ width: "100%" }} value={horizon} onChange={(e) => setHorizon(+e.target.value)}>{[1, 2, 3, 4, 5].map((h) => <option key={h} value={h}>{h} tahun</option>)}</select></label>
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: "12px 0 0" }}><legend style={{ fontWeight: 700, fontSize: 13 }}>Indikator <span style={{ fontWeight: 400, color: "var(--muted)" }}>(kosong = semua)</span></legend>
          <div className="flex gap-3 flex-wrap">{inds.map((i) => <label key={i.id} style={{ fontSize: 14 }}><input type="checkbox" checked={selInd.includes(i.id)} onChange={() => tog(selInd, i.id, setSelInd)} /> {i.name}</label>)}</div>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: "10px 0 0" }}><legend style={{ fontWeight: 700, fontSize: 13 }}>Level <span style={{ fontWeight: 400, color: "var(--muted)" }}>(kosong = semua)</span></legend>
          <div className="flex gap-3 flex-wrap">{LEVELS.map((l) => <label key={l.id} style={{ fontSize: 14 }}><input type="checkbox" checked={selLvl.includes(l.id)} onChange={() => tog(selLvl, l.id, setSelLvl)} /> {l.label}</label>)}</div>
        </fieldset>
        <div className="flex gap-3 flex-wrap" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" disabled={running} onClick={() => startJob(qs("train"), "Latih & prediksi")}>Latih ulang &amp; prediksi ({scope})</button>
          <button className="btn" disabled={running} onClick={() => startJob(qs("predict"), "Prediksi ulang")}>Prediksi ulang dengan model aktif ({scope})</button>
        </div>
        <ul style={{ fontSize: 13, color: "var(--muted)", marginBottom: 0 }}>
          <li><strong>Latih ulang</strong>: estimasi sel kosong, backtest semua kandidat model, lalu memilih sesuai algoritma di atas. Otomatis: model ML dipakai hanya bila mengalahkan baseline terbaik.</li>
          <li><strong>Prediksi ulang</strong>: algoritma tiap indikator-level yang sedang aktif <em>dipertahankan</em>; hanya data terbaru (mis. hasil input manual) yang dipakai untuk menghitung ulang proyeksi dan intervalnya.</li>
          <li>Pelatihan berjalan di latar belakang; layanan tetap membaca proyeksi lama sampai selesai.</li>
        </ul>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Model aktif ({models.length})</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl"><thead><tr><th>Indikator</th><th>Level</th><th>Model</th><th className="num">MAE</th><th className="num">MAE baseline</th><th>Versi</th><th /></tr></thead><tbody>
            {models.map((m) => (
              <Fragment key={m.model_id}>
                <tr>
                  <td>{m.indicator_name}</td><td>{m.level}</td>
                  <td>{m.label} {!m.beats_baseline && <span className="badge badge-dummy">baseline</span>}</td>
                  <td className="num">{fmtNum(m.mae, 2)}</td><td className="num">{fmtNum(m.baseline_mae, 2)}</td>
                  <td style={{ fontSize: 12 }}>{m.version}</td>
                  <td><button className="btn" aria-expanded={open === m.model_id} onClick={() => setOpen(open === m.model_id ? null : m.model_id)}>Kandidat</button></td>
                </tr>
                {open === m.model_id && (
                  <tr><td colSpan={7} style={{ background: "var(--chip)" }}>
                    <div className="flex gap-4 flex-wrap" style={{ fontSize: 13 }}>
                      {Object.entries(m.candidates).sort((a, b) => a[1].mae - b[1].mae).map(([k, v]) => <span key={k} style={{ fontWeight: k === m.algo ? 800 : 400 }}>{algos.find((a) => a.id === k)?.label ?? k}: {fmtNum(v.mae, 3)}{k === m.algo ? " ✓" : ""}</span>)}
                    </div>
                    {m.warnings.filter((w) => !w.startsWith("Hanya 5")).map((w) => <div key={w} style={{ fontSize: 12, color: "var(--warn)" }}>⚠ {w}</div>)}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody></table>
        </div>
      </section>
    </div>
  );
}
