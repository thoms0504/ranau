export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
export const V1 = `${API}/api/v1`;

export type Level = "kabupaten" | "kecamatan" | "desa";
export type Mode = "actual" | "forecast" | "diff";
export const LEVELS: { id: Level; label: string }[] = [
  { id: "kabupaten", label: "Kabupaten/Kota" },
  { id: "kecamatan", label: "Kecamatan" },
  { id: "desa", label: "Desa/Kelurahan" },
];

export interface Indicator {
  id: string; name: string; theme: string; unit: string;
  direction: "low" | "high" | "neutral"; key: boolean; description: string; formula: string; aux?: boolean; agg?: string; real_share?: number; status?: "dummy" | "campuran" | "nyata"; sources?: string[];
}
export interface Meta {
  years: number[]; forecast_years: number[]; last_actual: number; levels: string[];
  counts: Record<string, number>; themes: string[]; n_indicators: number;
  status?: "dummy" | "campuran" | "nyata"; is_dummy?: boolean; real_indicators?: number;
  label: string; source: string; model_version: string | null; trained_at: string | null;
}
export interface Cell { value: number; kind: "actual" | "estimate" | "forecast"; lo80?: number; hi80?: number; lo95?: number; hi95?: number; base?: number; current?: number }
export interface DataResp {
  indicator: string; unit: string; direction: string; year: number; level: string; mode: string; is_forecast: boolean;
  stats: { min: number; max: number; mean: number } | null; values: Record<string, Cell>;
}

export async function get<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${V1}${path}`, init);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail ?? msg; } catch { /* abaikan */ }
    throw new Error(String(msg));
  }
  return r.json();
}

const memo = new Map<string, Promise<unknown>>();
export function cached<T>(path: string): Promise<T> {
  if (!memo.has(path)) memo.set(path, get<T>(path).catch((e) => { memo.delete(path); throw e; }));
  return memo.get(path) as Promise<T>;
}

/** Penanda asal data per indikator. */
export function provBadge(status?: string): { text: string; cls: string } {
  return status === "nyata" ? { text: "Data nyata", cls: "badge-real" } : status === "campuran" ? { text: "Campuran", cls: "badge-mix" } : { text: "Dummy", cls: "badge-dummy" };
}
