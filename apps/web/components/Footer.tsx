import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer mt-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 grid gap-8" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", fontSize: 14 }}>
        <div>
          <h4>RANAU</h4>
          <p style={{ margin: 0 }}>Sistem Prediksi dan Estimasi Kewilayahan Provinsi Lampung: data historis lima tahun, proyeksi tiga tahun, dan cara hitung yang terbuka.</p>
        </div>
        <div>
          <h4>Jelajahi</h4>
          <div className="grid gap-1"><Link href="/peta">Peta Prediksi</Link><Link href="/metodologi">Metodologi &amp; Kualitas Model</Link><Link href="/unduh">Unduh data</Link><Link href="/tentang">Tentang &amp; kebijakan data</Link></div>
        </div>
        <div>
          <h4>Sumber &amp; catatan</h4>
          <p style={{ margin: 0 }}>Sumber angka: <strong>dummy-v1</strong>. Batas wilayah: Wilkerstat Lampung — 15 kab/kota, 231 kecamatan, 2.654 desa. Angka bukan data resmi dan tidak boleh dikutip sebagai statistik resmi.</p>
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--border)", fontSize: 12.5, padding: "12px 24px", textAlign: "center" }}>RANAU v0.1 (draf) · Bahasa Indonesia · Format angka id-ID</div>
    </footer>
  );
}
