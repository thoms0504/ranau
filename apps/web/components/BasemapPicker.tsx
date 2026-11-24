"use client";
import { Basemap, BASEMAPS } from "@/lib/basemaps";

export default function BasemapPicker({ value, onChange, compact = false }: { value: Basemap; onChange: (b: Basemap) => void; compact?: boolean }) {
  return (
    <div className="float bm-picker" role="radiogroup" aria-label="Peta dasar">
      {!compact && <span className="bm-title">Peta dasar</span>}
      {BASEMAPS.map((b) => (
        <button key={b.id} role="radio" aria-checked={value === b.id} onClick={() => onChange(b.id)} className={`bm-opt ${value === b.id ? "on" : ""}`} title={b.label}>
          <span aria-hidden className={`bm-sw bm-${b.id}`} />
          {!compact && <span>{b.label}</span>}
        </button>
      ))}
    </div>
  );
}
