"use client";

export default function YearSlider({ years, lastActual, value, onChange }: { years: number[]; lastActual: number; value: number; onChange: (y: number) => void }) {
  const idx = years.indexOf(value);
  const isFc = value > lastActual;
  const split = years.indexOf(lastActual) + 0.5;
  const pctSplit = (split / (years.length - 1)) * 100;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <label htmlFor="yr" style={{ fontWeight: 700, fontSize: 13 }}>Tahun</label>
        <span>
          <strong style={{ fontSize: 18 }}>{value}</strong>{" "}
          {isFc ? <span className="badge badge-fc">Proyeksi</span> : <span className="badge" style={{ background: "var(--chip)" }}>Aktual</span>}
        </span>
      </div>
      <div style={{ position: "relative", padding: "0 2px" }}>
        <div aria-hidden style={{ position: "absolute", left: `${pctSplit}%`, top: -4, bottom: 18, borderLeft: "2px dashed var(--muted)" }} />
        <input id="yr" type="range" className="range" min={0} max={years.length - 1} step={1} value={idx} onChange={(e) => onChange(years[+e.target.value])}
          aria-valuetext={`${value}${isFc ? " (proyeksi)" : " (aktual)"}`} />
        <div className="flex justify-between" style={{ fontSize: 11, color: "var(--muted)" }}>
          {years.map((y) => <span key={y} style={{ fontWeight: y === value ? 800 : 400, color: y > lastActual ? "var(--accent)" : undefined }}>{String(y).slice(2)}</span>)}
        </div>
        <div className="flex justify-between" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          <span>◀ Aktual (s.d. {lastActual})</span><span style={{ color: "var(--accent)" }}>Proyeksi ▶</span>
        </div>
      </div>
    </div>
  );
}
