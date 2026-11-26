"use client";
import { useState } from "react";
import { Basemap, BASEMAPS } from "@/lib/basemaps";

export default function BasemapPicker({ value, onChange, compact = false }: { value: Basemap; onChange: (b: Basemap) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const current = BASEMAPS.find((b) => b.id === value);

  return (
    <details className="float bm-details" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="bm-summary" aria-label={`Peta dasar: ${current?.label ?? value}`}>
        <span aria-hidden className={`bm-sw bm-${value}`} />
        {!compact && <span className="bm-summary-label">{current?.label ?? value}</span>}
        <span aria-hidden className="bm-chevron">{open ? "▲" : "▼"}</span>
      </summary>
      <div className="bm-picker" role="radiogroup" aria-label="Pilih peta dasar">
        {BASEMAPS.map((b) => (
          <button key={b.id} role="radio" aria-checked={value === b.id} onClick={() => { onChange(b.id); setOpen(false); }} className={`bm-opt ${value === b.id ? "on" : ""}`} title={b.label}>
            <span aria-hidden className={`bm-sw bm-${b.id}`} />
            {!compact && <span>{b.label}</span>}
          </button>
        ))}
      </div>
    </details>
  );
}
