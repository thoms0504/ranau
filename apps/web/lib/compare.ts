// Daftar wilayah yang dibandingkan (disimpan di localStorage, maksimal 6).
export const CMP_KEY = "ranau_cmp";
export const CMP_MAX = 6;

export function getCmp(): string[] {
  try { return JSON.parse(localStorage.getItem(CMP_KEY) || "[]"); } catch { return []; }
}
export function setCmp(ids: string[]) {
  localStorage.setItem(CMP_KEY, JSON.stringify(ids.slice(0, CMP_MAX)));
  window.dispatchEvent(new Event("ranau-cmp"));
}
export function toggleCmp(id: string): string[] {
  const cur = getCmp();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-CMP_MAX);
  setCmp(next);
  return next;
}
