// Enam tema indikator (mengikuti pembagian SIKOP) dan warna identitasnya.
export const THEMES = ["Pendidikan", "Kesehatan", "Ekonomi", "Infrastruktur", "Kebencanaan", "Tata Kelola"] as const;
export const THEME_COLOR: Record<string, string> = {
  Pendidikan: "#3b82c4", Kesehatan: "#2a9d8f", Ekonomi: "#d4a24c", Infrastruktur: "#7b6bc9", Kebencanaan: "#e07a4f", "Tata Kelola": "#4c6b8f", Kependudukan: "#64748b",
};
export const LEVEL_LABEL: Record<string, string> = { provinsi: "Provinsi", kabupaten: "Kabupaten/Kota", kecamatan: "Kecamatan", desa: "Desa/Kelurahan" };
export const CHILD_LEVEL: Record<string, string> = { provinsi: "kabupaten", kabupaten: "kecamatan", kecamatan: "desa" };
