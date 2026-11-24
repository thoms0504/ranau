"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Layer, Map, MapRef, NavigationControl, Source } from "react-map-gl/maplibre";
import type { FeatureCollection, Geometry } from "geojson";
import { NO_DATA, Scale } from "@/lib/colors";
import { mapLib } from "@/lib/maplib";
import { Basemap, basemapStyle, fillOpacity } from "@/lib/basemaps";

export type GeoFC = FeatureCollection<Geometry, { region_id: string; name: string; parent_id?: string }>;
export interface MapHandle { exportPng: (caption: string[], scale: Scale | null, unit: string) => Promise<string> }
interface Props {
  geo: GeoFC | null;
  values: Record<string, { value: number }> | null;
  scale: Scale | null;
  matched: Set<string> | null;           // null = tanpa filter
  selected: string | null;
  hovered: string | null;
  basemap: Basemap;
  onBasemapFail?: () => void;
  onHover: (h: { id: string; x: number; y: number } | null) => void;
  onSelect: (id: string) => void;
}


function bbox(fc: GeoFC): [number, number, number, number] {
  let a = 999, b = 999, c = -999, d = -999;
  const walk = (x: unknown) => {
    if (Array.isArray(x) && typeof x[0] === "number") { a = Math.min(a, x[0]); c = Math.max(c, x[0]); b = Math.min(b, x[1] as number); d = Math.max(d, x[1] as number); }
    else if (Array.isArray(x)) x.forEach(walk);
  };
  fc.features.forEach((f) => walk((f.geometry as { coordinates: unknown }).coordinates));
  return [a, b, c, d];
}

const MapView = forwardRef<MapHandle, Props>(function MapView({ geo, values, scale, matched, selected, hovered, basemap, onBasemapFail, onHover, onSelect }, ref) {
  const mapRef = useRef<MapRef>(null);
  const first = useRef(true);
  const fails = useRef(0);
  const [ready, setReady] = useState(false);
  const styleObj = useMemo(() => basemapStyle(basemap), [basemap]);
  const fo = fillOpacity(basemap);

  const data = useMemo(() => {
    if (!geo) return null;
    return {
      type: "FeatureCollection" as const,
      features: geo.features.map((f) => {
        const id = f.properties.region_id;
        const v = values?.[id];
        const has = !!v && !!scale;
        return { ...f, properties: { ...f.properties, color: has ? scale!.color(v!.value) : NO_DATA, dim: matched && !matched.has(id) ? 1 : 0, has: has ? 1 : 0 } };
      }),
    };
  }, [geo, values, scale, matched]);

  // zoom otomatis setiap kali himpunan wilayah yang tampil berubah (drill-down / kembali)
  useEffect(() => {
    if (!geo || !geo.features.length || !ready) return;
    const [a, b, c, d] = bbox(geo);
    const narrow = typeof window !== "undefined" && window.innerWidth < 800;
    mapRef.current?.fitBounds([[a, b], [c, d]], { padding: narrow ? 24 : { top: 70, bottom: 110, left: 40, right: 40 }, duration: first.current ? 0 : 900, maxZoom: 13 });
    first.current = false;
  }, [geo, ready]);

  useImperativeHandle(ref, () => ({
    exportPng: (caption, sc, unit) => new Promise((resolve, reject) => {
      const map = mapRef.current?.getMap();
      if (!map) return reject(new Error("peta belum siap"));
      map.once("render", () => {
        const src = map.getCanvas();
        const W = src.width, H = src.height, bar = Math.round(H * 0.18 + 40);
        const cv = document.createElement("canvas");
        cv.width = W; cv.height = H + bar;
        const g = cv.getContext("2d")!;
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        g.fillStyle = dark ? "#0d1829" : "#e4ecf5"; g.fillRect(0, 0, W, H);
        g.drawImage(src, 0, 0);
        g.fillStyle = dark ? "#111c31" : "#ffffff"; g.fillRect(0, H, W, bar);
        const ink = dark ? "#e7edf7" : "#0f1f3d";
        g.fillStyle = ink;
        const u = Math.max(14, Math.round(W / 60));
        g.font = `bold ${u * 1.2}px sans-serif`; g.fillText(caption[0] ?? "", 16, H + u * 1.8);
        g.font = `${u}px sans-serif`; caption.slice(1).forEach((t, i) => g.fillText(t, 16, H + u * 3.2 + i * u * 1.3));
        if (sc) {
          const w = Math.min(W * 0.4, u * 24), x0 = W - 16 - w, y0 = H + u * 1.1, sw = w / 5;
          sc.colors.forEach((c, i) => { g.fillStyle = c; g.fillRect(x0 + i * sw, y0, sw, u * 1.2); });
          g.fillStyle = ink; g.font = `${u * 0.75}px sans-serif`; g.textAlign = "center";
          sc.breaks.forEach((b, i) => g.fillText(b.toLocaleString("id-ID", { maximumFractionDigits: 1 }), x0 + i * sw, y0 + u * 2.4));
          g.textAlign = "right"; g.fillText(unit, W - 16, y0 + u * 3.6); g.textAlign = "left";
        }
        resolve(cv.toDataURL("image/png"));
      });
      map.triggerRepaint();
    }),
  }));

  return (
    <Map
      ref={mapRef}
      mapLib={mapLib}
      initialViewState={{ longitude: 105.2, latitude: -4.9, zoom: 7 }}
      mapStyle={styleObj}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
      interactiveLayerIds={["fill"]}
      cursor="pointer"
      onLoad={() => setReady(true)}
      onError={(e) => {
        // tile peta dasar gagal dimuat (diblokir/offline): pindah otomatis ke peta dasar alternatif
        const sid = (e as unknown as { sourceId?: string }).sourceId;
        if (sid && sid !== "regions" && basemap === "osm" && ++fails.current >= 3) onBasemapFail?.();
      }}
      onMouseMove={(e) => {
        const f = e.features?.[0];
        onHover(f ? { id: f.properties.region_id, x: e.point.x, y: e.point.y } : null);
      }}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => { const id = e.features?.[0]?.properties.region_id; if (id) onSelect(id); }}
    >
      <NavigationControl position="top-right" showCompass={false} />
      {data && (
        <Source id="regions" type="geojson" data={data} promoteId="region_id">
          <Layer id="fill" type="fill" paint={{ "fill-color": ["get", "color"], "fill-opacity": ["case", ["==", ["get", "dim"], 1], 0.12, fo] }} />
          <Layer id="line" type="line" paint={{ "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 12, 1.4], "line-opacity": 0.95 }} />
          <Layer id="hov" type="line" filter={["==", ["get", "region_id"], hovered ?? ""]} paint={{ "line-color": "#0f1f3d", "line-width": 2.2 }} />
          <Layer id="sel-halo" type="line" filter={["==", ["get", "region_id"], selected ?? ""]} paint={{ "line-color": "#ffffff", "line-width": 6 }} />
          <Layer id="sel" type="line" filter={["==", ["get", "region_id"], selected ?? ""]} paint={{ "line-color": "#0f3d7a", "line-width": 3 }} />
        </Source>
      )}
    </Map>
  );
});
export default MapView;
