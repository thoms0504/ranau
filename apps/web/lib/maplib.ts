// MapLibre dimuat sekali; worker disalin ke public/maplibre oleh scripts/copy-maplibre.mjs
export const mapLib = import("maplibre-gl").then((m) => { m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs"); return m; });
