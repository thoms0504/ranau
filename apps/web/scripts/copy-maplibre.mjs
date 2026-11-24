// Menyalin worker MapLibre ke public/ agar tidak dirusak bundler (Turbopack mengubah import.meta.url).
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/maplibre", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre/maplibre-gl-worker.mjs");
console.log("maplibre worker disalin ke public/maplibre/");
