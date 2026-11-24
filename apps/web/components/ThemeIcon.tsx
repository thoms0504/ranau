// Ikon garis sederhana untuk enam tema indikator.
const P: Record<string, React.ReactNode> = {
  Pendidikan: <><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c3 2.2 9 2.2 12 0v-5" /></>,
  Kesehatan: <><path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z" /><path d="M12 9v5M9.5 11.5h5" /></>,
  Ekonomi: <><path d="M4 9h16l-1.5-5h-13L4 9Z" /><path d="M5 9v11h14V9" /><path d="M10 20v-6h4v6" /></>,
  Infrastruktur: <><path d="M12 12v9" /><path d="M8.5 21h7" /><circle cx="12" cy="10" r="2" /><path d="M7.8 5.8a6 6 0 0 0 0 8.4M16.2 5.8a6 6 0 0 1 0 8.4" /></>,
  Kebencanaan: <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17h.01" /></>,
  "Tata Kelola": <><path d="M3 10 12 4l9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 20h18" /></>,
};

export default function ThemeIcon({ theme, size = 18 }: { theme: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[theme] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
