export default function Tentang() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 prose-page">
      <h1 className="page-title">Tentang RANAU</h1>
      <p><strong>RANAU</strong> (Sistem Prediksi dan Estimasi Kewilayahan Provinsi Lampung) adalah dasbor berbasis peta untuk memproyeksikan dan mengestimasi indikator wilayah di tingkat kabupaten/kota, kecamatan, dan desa. Berbeda dari dasbor yang hanya menampilkan data saat ini, RANAU menambahkan dimensi waktu (data historis lima tahun) dan model prediksi.</p>
      <h2>Kebijakan data</h2>
      <ul>
        <li><strong>Data dummy dan data nyata.</strong> Selama label “Dummy” tampil, angka dibangkitkan untuk pengembangan dan pengujian. Saat data nyata di-seed, tiap indikator ditandai <em>Dummy</em>, <em>Campuran</em>, atau <em>Data nyata</em>.</li>
        <li><strong>Transparansi.</strong> Setiap angka menyertakan sumber, versi model, dan penanda aktual/estimasi/proyeksi.</li>
        <li><strong>Bukan penilaian kinerja.</strong> Wilayah yang disorot hanyalah penanda awal untuk ditelusuri lebih lanjut.</li>
        <li><strong>Penggantian ke data asli.</strong> Skema data (wilayah–indikator–tahun) tetap; data asli (Podes, Susenas, data OPD) cukup menggantikan dummy lalu model dilatih ulang.</li>
        <li><strong>Batas wilayah.</strong> Kunci wilayah adalah kode BPS/Kemendagri, bukan nama.</li>
      </ul>
      <h2>Cakupan versi ini</h2>
      <p>Peta tematik dengan drill-down 15 kabupaten/kota → 231 kecamatan → 2.654 desa/kelurahan, peringkat dan profil per wilayah, perbandingan antarwilayah; 42 indikator lintas 6 tema (Pendidikan, Kesehatan, Ekonomi, Infrastruktur, Kebencanaan, Tata Kelola); proyeksi 3 tahun dengan interval 80% dan 95%; filter gabungan; pencarian Ctrl K; ekspor CSV/GeoJSON/gambar. Belum tersedia: login multi-instansi (admin tunggal sudah ada), unggah dataset, skenario <em>what-if</em>, API publik berkunci.</p>
    </div>
  );
}
