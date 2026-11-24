"use client";
import { useEffect, useState } from "react";
import { cached, Indicator, Level, LEVELS, Meta, V1 } from "@/lib/api";

export default function Unduh() {
  const [inds, setInds] = useState<Indicator[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ind, setInd] = useState("miskin");
  const [level, setLevel] = useState<Level>("kabupaten");
  const [year, setYear] = useState(2026);
  useEffect(() => { Promise.all([cached<Indicator[]>("/indicators"), cached<Meta>("/meta")]).then(([i, m]) => { setInds(i); setMeta(m); }); }, []);
  const base = `${V1}/export?indicator=${ind}&level=${level}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="page-title">Unduh data</h1>
      <p style={{ color: "var(--muted)" }}>Setiap berkas memuat penanda <strong>is_dummy = true</strong> dan sumber <strong>dummy-v1</strong>. Jangan mengutipnya sebagai statistik resmi.</p>
      <div className="card" style={{ padding: 18 }}>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          <label>Indikator<br /><select className="field" style={{ width: "100%" }} value={ind} onChange={(e) => setInd(e.target.value)}>{inds.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
          <label>Level<br /><select className="field" style={{ width: "100%" }} value={level} onChange={(e) => setLevel(e.target.value as Level)}>{LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
          <label>Tahun proyeksi (GeoJSON)<br /><select className="field" style={{ width: "100%" }} value={year} onChange={(e) => setYear(+e.target.value)}>{meta?.forecast_years.map((y) => <option key={y}>{y}</option>)}</select></label>
        </div>
        <div className="flex gap-3 flex-wrap" style={{ marginTop: 18 }}>
          <a className="btn btn-primary" href={`${base}&format=csv`}>Unduh CSV (wilayah × tahun)</a>
          <a className="btn btn-primary" href={`${base}&format=geojson&year=${year}`}>Unduh GeoJSON (atribut proyeksi)</a>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 0 }}>CSV: kolom per tahun {meta?.years[0]}–{meta?.forecast_years.at(-1)}, kolom <code>_jenis</code> (aktual/estimasi/proyeksi) dan interval 80% untuk proyeksi. Gambar peta dapat diunduh dari halaman Peta Prediksi (tombol “Unduh gambar”).</p>
      </div>
    </div>
  );
}
