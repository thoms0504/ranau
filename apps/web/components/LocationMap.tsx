"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Map, MapRef, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import type { GeoFC } from "@/components/MapView";
import { cached } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { mapLib } from "@/lib/maplib";
import { Basemap, basemapStyle, fillOpacity, loadBasemap, saveBasemap } from "@/lib/basemaps";
import BasemapPicker from "@/components/BasemapPicker";

interface Props { id: string; level: string; parentId: string | null; lng: number; lat: number; height?: number }
type Scope = "sekitar" | "provinsi";

function bbox(fc: GeoFC): [number, number, number, number] {
  let a = 999, b = 999, c = -999, d = -999;
  const walk = (x: unknown) => {
    if (Array.isArray(x) && typeof x[0] === "number") { a = Math.min(a, x[0]); c = Math.max(c, x[0]); b = Math.min(b, x[1] as number); d = Math.max(d, x[1] as number); }
    else if (Array.isArray(x)) x.forEach(walk);
  };
  fc.features.forEach((f) => walk((f.geometry as { coordinates: unknown }).coordinates));
  return [a, b, c, d];
}

/** Peta lokasi: poligon wilayah disorot di antara wilayah sekelompok (induk yang sama) atau di seluruh Lampung. */
export default function LocationMap({ id, level, parentId, lng, lat, height = 340 }: Props) {
  const router = useRouter();
  const mapRef = useRef<MapRef>(null);
  const [scope, setScope] = useState<Scope>("sekitar");
  const [geo, setGeo] = useState<GeoFC | null>(null);
  const [ready, setReady] = useState(false);
  const [bm, setBm] = useState<Basemap>("osm");
  useEffect(() => setBm(loadBasemap()), []);
  const styleObj = useMemo(() => basemapStyle(bm), [bm]);
  const [hover, setHover] = useState<string | null>(null);

  const isProv = level === "provinsi";
  const geoLevel = isProv || scope === "provinsi" ? "kabupaten" : level;
  const highlight = isProv ? "" : scope === "provinsi" ? id.slice(0, 4) : id;

  useEffect(() => { setGeo(null); cached<GeoFC>(`/geo/${geoLevel}`).then(setGeo).catch(() => setGeo(null)); }, [geoLevel]);

  const shown = useMemo<GeoFC | null>(() => {
    if (!geo) return null;
    const keep = !isProv && scope === "sekitar" && parentId && parentId !== "18" ? geo.features.filter((f) => f.properties.parent_id === parentId) : geo.features;
    return { ...geo, features: keep.map((f) => ({ ...f, properties: { ...f.properties, hl: f.properties.region_id === highlight ? 1 : 0 } })) };
  }, [geo, scope, parentId, highlight, isProv]);

  useEffect(() => {
    if (!shown || !shown.features.length || !ready) return;
    const [a, b, c, d] = bbox(shown);
    mapRef.current?.fitBounds([[a, b], [c, d]], { padding: 28, duration: 700, maxZoom: 13 });
  }, [shown, ready]);

  const names = useMemo(() => Object.fromEntries((shown?.features ?? []).map((f) => [f.properties.region_id, f.properties.name])), [shown]);

  return (
    <div style={{ position: "relative", height, borderRadius: 12, overflow: "hidden", background: "var(--map-bg)" }}>
      <Map
        ref={mapRef}
        mapLib={mapLib}
        initialViewState={{ longitude: lng, latitude: lat, zoom: 9 }}
        mapStyle={styleObj}
        style={{ width: "100%", height: "100%" }}
        scrollZoom={false}
        attributionControl={{ compact: true }}
        interactiveLayerIds={["ctx"]}
        cursor={hover && hover !== highlight ? "pointer" : "grab"}
        onLoad={() => { setReady(true); window.setTimeout(() => mapRef.current?.resize(), 60); }}
        onMouseMove={(e) => setHover(e.features?.[0]?.properties.region_id ?? null)}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => { const rid = e.features?.[0]?.properties.region_id; if (rid && rid !== id) router.push(`/wilayah/${rid}`); }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {shown && (
          <Source id="loc" type="geojson" data={shown} promoteId="region_id">
            <Layer id="ctx" type="fill" paint={{ "fill-color": ["case", ["==", ["get", "hl"], 1], "#1d6fd1", "#c9d5e4"], "fill-opacity": ["case", ["==", ["get", "hl"], 1], 0.78, Math.min(0.9, fillOpacity(bm) + 0.08)] }} />
            <Layer id="ctx-line" type="line" paint={{ "line-color": "#ffffff", "line-width": 1.1 }} />
            <Layer id="hl-halo" type="line" filter={["==", ["get", "hl"], 1]} paint={{ "line-color": "#ffffff", "line-width": 6 }} />
            <Layer id="hl-line" type="line" filter={["==", ["get", "hl"], 1]} paint={{ "line-color": "#0b2a5b", "line-width": 2.6 }} />
            <Layer id="hov" type="line" filter={["==", ["get", "region_id"], hover ?? ""]} paint={{ "line-color": "#0f1f3d", "line-width": 2 }} />
          </Source>
        )}
        {!isProv && (
          <Marker longitude={lng} latitude={lat} anchor="bottom">
            <svg width="26" height="34" viewBox="0 0 26 34" aria-label="Titik pusat wilayah" role="img">
              <path d="M13 33C13 33 2 21 2 12.5a11 11 0 0 1 22 0C24 21 13 33 13 33Z" fill="#c8963e" stroke="#0b2a5b" strokeWidth="2" />
              <circle cx="13" cy="12.5" r="4.2" fill="#fff" />
            </svg>
          </Marker>
        )}
      </Map>

      {!isProv && (
        <div className="float seg" role="tablist" aria-label="Cakupan peta lokasi" style={{ position: "absolute", left: 10, top: 10, padding: 3 }}>
          <button role="tab" aria-selected={scope === "sekitar"} onClick={() => setScope("sekitar")}>Sekitar</button>
          <button role="tab" aria-selected={scope === "provinsi"} onClick={() => setScope("provinsi")}>Lampung</button>
        </div>
      )}
      <div style={{ position: "absolute", left: 10, bottom: 10 }}><BasemapPicker compact value={bm} onChange={(b) => { setBm(b); saveBasemap(b); }} /></div>
      {hover && hover !== highlight && names[hover] && (
        <div className="float" style={{ position: "absolute", right: 10, bottom: 10, padding: "4px 10px", fontSize: 12.5, fontWeight: 600 }}>{titleCase(names[hover])} · klik untuk membuka</div>
      )}
    </div>
  );
}
