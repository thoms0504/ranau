"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import SearchPalette from "./SearchPalette";
import { cached, Meta } from "@/lib/api";

const NAV = [
  { href: "/", label: "Beranda" },
  { href: "/peta", label: "Peta Prediksi" },
  { href: "/bandingkan", label: "Bandingkan" },
  { href: "/metodologi", label: "Metodologi" },
  { href: "/unduh", label: "Unduh" },
  { href: "/tentang", label: "Tentang" },
];
type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const el = document.documentElement;
  el.classList.add("theme-anim");
  el.setAttribute("data-theme", dark ? "dark" : "light");
  window.setTimeout(() => el.classList.remove("theme-anim"), 450);
}

function Logo() {
  return (
    <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden>
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill="var(--brand)" />
      <path d="M8 27 L15 18 L21 23 L27 12 L32 19" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 31 H32" stroke="rgba(255,255,255,.55)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 3" />
      <circle cx="32" cy="19" r="3" fill="#5eead4" />
    </svg>
  );
}

export default function Header() {
  const path = usePathname();
  const [theme, setTheme] = useState<Theme>("system");
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => { cached<Meta>("/meta").then(setMeta).catch(() => undefined); }, []);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => { setTheme((localStorage.getItem("theme") as Theme) || "system"); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cycle = () => {
    const n: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(n); localStorage.setItem("theme", n); applyTheme(n);
  };

  return (
    <>
      <div role="note" className="ribbon">
        {meta?.status === "nyata" ? "◆ Data nyata. Proyeksi adalah penanda awal untuk ditelusuri, bukan penilaian kinerja." : meta?.status === "campuran" ? `◆ ${meta.label}. Lihat penanda sumber pada tiap indikator. Proyeksi adalah penanda awal, bukan penilaian kinerja.` : "◆ Data dummy untuk pengembangan — bukan data resmi. Proyeksi adalah penanda awal untuk ditelusuri, bukan penilaian kinerja."}
      </div>
    <header className={"site-header" + (scrolled ? " scrolled" : "")}>
      <div className="nav-row">
        <Link href="/" style={{ color: "inherit", textDecoration: "none" }} className="flex items-center gap-3" aria-label="RANAU – Beranda">
          <Logo />
          <span style={{ lineHeight: 1.1 }}>
            <strong style={{ fontFamily: "var(--font-display)", fontSize: 21, fontWeight: 800, letterSpacing: ".14em", display: "block", color: "var(--fg)" }}>RANAU</strong>
            <span className="nav-tag" style={{ fontSize: 11.5, color: "var(--muted)", letterSpacing: ".01em" }}>Prediksi &amp; Estimasi Kewilayahan · Provinsi Lampung</span>
          </span>
        </Link>
        <nav aria-label="Navigasi utama" className="nav-main">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return <Link key={n.href} href={n.href} className="nav-link" aria-current={active ? "page" : undefined}>{n.label}</Link>;
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setOpen(true)} className="hbtn" aria-label="Cari wilayah (Ctrl K)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            Cari <kbd style={{ fontSize: 10.5, opacity: .75, border: "1px solid rgba(255,255,255,.35)", borderRadius: 5, padding: "0 5px" }}>Ctrl K</kbd>
          </button>
          <button onClick={cycle} className="hbtn" aria-label={`Tema: ${theme}. Klik untuk mengganti`}>
            <span aria-hidden>{theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐"}</span> {theme === "light" ? "Terang" : theme === "dark" ? "Gelap" : "Sistem"}
          </button>
        </div>
      </div>
      {open && <SearchPalette onClose={() => setOpen(false)} />}
    </header>
    </>
  );
}
