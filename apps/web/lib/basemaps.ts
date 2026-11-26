import type { StyleSpecification } from "maplibre-gl";
// Peta dasar berbasis OpenStreetMap. Atribusi wajib tampil (ditangani kontrol atribusi MapLibre).
export type Basemap = "osm" | "terang" | "satelit" | "none";

const OSM_ATTR = "© <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\" rel=\"noopener\">OpenStreetMap</a> contributors";
const OFM_ATTR = `<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from ${OSM_ATTR}`;
const ESRI_ATTR = "Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics";

export const BASEMAPS: { id: Basemap; label: string; fill: number }[] = [
  { id: "osm", label: "OpenStreetMap", fill: 0.66 },
  { id: "terang", label: "Peta Terang", fill: 0.78 },
  { id: "satelit", label: "Satelit", fill: 0.6 },
  { id: "none", label: "Tanpa peta dasar", fill: 0.95 },
];
export const fillOpacity = (b: Basemap) => BASEMAPS.find((x) => x.id === b)?.fill ?? 0.8;

const raster = (id: string, tiles: string[], attribution: string, maxzoom = 19) => ({
  version: 8 as const,
  sources: { [id]: { type: "raster" as const, tiles, tileSize: 256, attribution, maxzoom } },
  layers: [{ id, type: "raster" as const, source: id }],
});

export function basemapStyle(b: Basemap): string | StyleSpecification {
  switch (b) {
    case "osm": return raster("osm", ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], OSM_ATTR);
    case "terang": return "https://tiles.openfreemap.org/styles/positron";   // vektor, tanpa kunci API
    case "satelit": return raster("esri", ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], ESRI_ATTR, 18);
    default: return { version: 8 as const, sources: {}, layers: [] };
  }
}

const KEY = "ranau_basemap";
export function loadBasemap(): Basemap {
  try { const v = localStorage.getItem(KEY) as Basemap | null; if (v && BASEMAPS.some((x) => x.id === v)) return v; } catch { /* abaikan */ }
  return "terang";
}
export function saveBasemap(b: Basemap) { try { localStorage.setItem(KEY, b); } catch { /* abaikan */ } }
