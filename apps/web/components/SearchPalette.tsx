"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { get } from "@/lib/api";
import { titleCase } from "@/lib/format";

interface R { id: string; name: string; level: string; parent_name?: string }
const MENU = [
  { label: "Beranda", href: "/" }, { label: "Peta Prediksi", href: "/peta" }, { label: "Bandingkan wilayah", href: "/bandingkan" }, { label: "Metodologi & Kualitas Model", href: "/metodologi" },
  { label: "Unduh data", href: "/unduh" }, { label: "Tentang & kebijakan data", href: "/tentang" },
];

export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<R[]>([]);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    if (!q.trim()) { setRes([]); return; }
    const t = setTimeout(() => get<R[]>(`/search?q=${encodeURIComponent(q)}&limit=12`).then(setRes).catch(() => setRes([])), 150);
    return () => clearTimeout(t);
  }, [q]);

  const menu = MENU.filter((m) => m.label.toLowerCase().includes(q.toLowerCase()));
  const items = [
    ...res.map((r) => ({ key: r.id, label: `${titleCase(r.name)}`, sub: `${r.level}${r.parent_name ? " · " + titleCase(r.parent_name) : ""}`, href: `/wilayah/${r.id}` })),
    ...menu.map((m) => ({ key: m.href, label: m.label, sub: "Menu", href: m.href })),
  ];
  const go = (href: string) => { onClose(); router.push(href); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Pencarian" onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(5,12,30,.55)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh" }}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: "min(620px, 92vw)", color: "var(--fg)", overflow: "hidden" }}>
        <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Cari kabupaten, kecamatan, desa, atau menu…"
          aria-label="Kata kunci" className="field" style={{ width: "100%", borderRadius: 0, border: 0, borderBottom: "1px solid var(--border)", padding: 14, fontSize: 16 }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
            if (e.key === "Enter" && items[i]) go(items[i].href);
          }} />
        <ul role="listbox" style={{ maxHeight: "50vh", overflowY: "auto", margin: 0, padding: 0, listStyle: "none" }}>
          {items.length === 0 && <li style={{ padding: 14, color: "var(--muted)" }}>Tidak ada hasil.</li>}
          {items.map((it, n) => (
            <li key={it.key + n} role="option" aria-selected={n === i} onMouseEnter={() => setI(n)} onClick={() => go(it.href)}
              style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", background: n === i ? "var(--chip)" : "transparent" }}>
              <span>{it.label}</span><span style={{ color: "var(--muted)", fontSize: 12 }}>{it.sub}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
