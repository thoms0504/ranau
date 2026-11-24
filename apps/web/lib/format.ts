const nf = (d: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d, minimumFractionDigits: 0 });

export function fmt(v: number | null | undefined, unit = "", digits?: number): string {
  if (v == null || Number.isNaN(v)) return "–";
  const big = Math.abs(v) >= 1000;
  const d = digits ?? (unit === "%" || unit.startsWith("skor") ? 1 : big ? 0 : 1);
  const s = nf(d).format(v);
  return unit === "%" ? `${s}%` : unit === "jiwa" || unit === "unit" || unit === "ton" ? `${s} ${unit}` : unit.startsWith("skor") ? s : `${s} ${unit}`.trim();
}
export function fmtNum(v: number, d = 1) { return nf(d).format(v); }
export function fmtDelta(v: number, unit = ""): string {
  const s = fmt(Math.abs(v), unit === "%" ? "pp" : unit);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s}`;
}
export function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
/** Apakah perubahan `delta` baik, buruk, atau netral menurut arah indikator. */
export function tone(direction: string, delta: number): "good" | "bad" | "neutral" {
  if (direction === "neutral" || Math.abs(delta) < 1e-9) return "neutral";
  return (direction === "low") === (delta < 0) ? "good" : "bad";
}

export function fmtCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(v / 1e9) + " M";
  if (a >= 1e6) return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(v / 1e6) + " jt";
  if (a >= 1e4) return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(v / 1e3) + " rb";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: a < 10 ? 1 : 0 }).format(v);
}
