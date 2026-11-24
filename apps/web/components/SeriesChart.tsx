"use client";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/lib/format";

export interface SeriesResp {
  region: { id: string; name: string; level: string; parent_id: string };
  indicator: { id: string; name: string; unit: string; direction: string };
  actual: { year: number; value: number; estimated: boolean }[];
  forecast: { year: number; yhat: number; lo80?: number; hi80?: number; lo95?: number; hi95?: number }[];
  comparison: { parent?: { name: string; series: { year: number; value: number }[] }; province?: { name: string; series: { year: number; value: number }[] } };
  ranks: { year: number; rank: number; of: number }[];
  is_dummy?: boolean; source?: string;
  model: null | {
    id: number; algo: string; label: string; version: string; trained_at: string; beats_baseline: boolean; baseline_name: string;
    metrics: { mae: number; rmse: number; smape: number }; baseline: { mae: number; rmse: number; smape: number };
    coverage80: number; coverage95: number; warnings: string[]; features: string[]; backtest: string;
  };
}

type Row = Record<string, number | number[] | boolean | null | undefined> & { year: number };

export default function SeriesChart({ s, height = 320, compact = false, showCompare = true }: { s: SeriesResp; height?: number; compact?: boolean; showCompare?: boolean }) {
  const unit = s.indicator.unit;
  const last = s.actual.at(-1)?.year ?? 2025;
  const rows: Record<number, Row> = {};
  const row = (y: number) => (rows[y] ??= { year: y });
  s.actual.forEach((a) => { row(a.year).actual = a.value; row(a.year).est = a.estimated; });
  const lastVal = s.actual.at(-1)?.value;
  if (lastVal != null && s.forecast.length) { row(last).fc = lastVal; row(last).b80 = [lastVal, lastVal]; row(last).b95 = [lastVal, lastVal]; }
  s.forecast.forEach((f) => {
    const r = row(f.year);
    r.fc = f.yhat;
    if (f.lo80 != null) { r.b80 = [f.lo80, f.hi80!]; r.b95 = [f.lo95!, f.hi95!]; }
  });
  if (showCompare) {
    s.comparison.parent?.series.forEach((p) => (row(p.year).parent = p.value));
    s.comparison.province?.series.forEach((p) => (row(p.year).prov = p.value));
  }
  const data = Object.values(rows).sort((a, b) => a.year - b.year);
  const tickFmt = (v: number) => fmt(v, unit, 0).replace(/\s?(ton|unit|jiwa)$/, "");

  return (
    <div><div style={{ width: "100%", height }} role="img" aria-label={`Grafik ${s.indicator.name} untuk ${s.region.name}, ${data[0]?.year}–${data.at(-1)?.year}`}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="year" tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} tickFormatter={tickFmt} width={compact ? 44 : 58} domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--fg)", borderRadius: 8 }}
            formatter={(v, n) => {
              const name = String(n);
              if (Array.isArray(v)) return [`${fmt(v[0], unit)} – ${fmt(v[1], unit)}`, name];
              return [fmt(Number(v), unit), name];
            }}
            labelFormatter={(y) => `${y}${Number(y) > last ? " (proyeksi)" : ""}`}
          />
          {!compact && <Legend wrapperStyle={{ fontSize: 12 }} />}
          <ReferenceLine x={last} stroke="var(--muted)" strokeDasharray="5 4" label={{ value: "Proyeksi →", position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} />
          <Area dataKey="b95" name="Interval 95%" stroke="none" fill="var(--accent)" fillOpacity={0.12} connectNulls isAnimationActive={false} />
          <Area dataKey="b80" name="Interval 80%" stroke="none" fill="var(--accent)" fillOpacity={0.25} connectNulls isAnimationActive={false} />
          {showCompare && s.comparison.province && <Line dataKey="prov" name="Provinsi" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="2 3" dot={false} isAnimationActive={false} />}
          {showCompare && s.comparison.parent && s.comparison.parent.name !== "LAMPUNG" && <Line dataKey="parent" name={s.comparison.parent.name.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase())} stroke="var(--warn)" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
          <Line dataKey="fc" name="Proyeksi" stroke="var(--accent)" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          <Line dataKey="actual" name="Aktual" stroke="var(--brand)" strokeWidth={2.5}
            dot={(p: { cx?: number; cy?: number; payload?: Row; index?: number }) => p.payload?.actual == null || p.cy == null ? <g key={p.index} /> : (
              <circle key={p.index} cx={p.cx} cy={p.cy} r={4} fill={p.payload?.est ? "var(--card)" : "var(--brand)"} stroke="var(--brand)" strokeWidth={2} />
            )}
            connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      </div>
      {!compact && s.actual.some((a) => a.estimated) && <div style={{ fontSize: 12, color: "var(--muted)" }}>Titik berongga = nilai estimasi (sel kosong pada data dummy diimputasi).</div>}
    </div>
  );
}
