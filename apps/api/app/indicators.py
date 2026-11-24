"""Definisi indikator (sumber tunggal untuk generator, model, dan API).
Enam tema mengikuti pembagian SIKOP: Pendidikan, Kesehatan, Ekonomi, Infrastruktur, Kebencanaan, Tata Kelola.
`aux` = data pendukung (bobot agregasi), tidak tampil sebagai kartu tema."""

THEMES = ["Pendidikan", "Kesehatan", "Ekonomi", "Infrastruktur", "Kebencanaan", "Tata Kelola"]
W = "Agregat wilayah = rata-rata tertimbang jumlah penduduk."
S = "Agregat wilayah = penjumlahan."


def _i(id, name, theme, unit, direction, key, desc, formula, aux=False):
    return dict(id=id, name=name, theme=theme, unit=unit, direction=direction, key=key, description=desc, formula=formula, aux=aux)


INDICATORS = [
    # Pendidikan
    _i("aps", "Angka partisipasi sekolah (SMA)", "Pendidikan", "%", "high", 1, "Persentase penduduk usia 16–18 tahun yang bersekolah.", f"Penduduk 16–18 yang bersekolah / penduduk 16–18 × 100. {W}"),
    _i("rls", "Rata-rata lama sekolah", "Pendidikan", "tahun", "high", 0, "Rata-rata tahun pendidikan formal penduduk usia 25 tahun ke atas.", f"Total tahun sekolah / jumlah penduduk 25+. {W}"),
    # Kesehatan
    _i("stunting", "Prevalensi stunting", "Kesehatan", "%", "low", 1, "Persentase balita bertinggi badan di bawah standar usianya.", f"Balita stunting / balita terukur × 100. {W}"),
    _i("imunisasi", "Cakupan imunisasi dasar lengkap", "Kesehatan", "%", "high", 0, "Persentase bayi yang mendapat imunisasi dasar lengkap.", f"Bayi imunisasi lengkap / seluruh bayi × 100. {W}"),
    # Ekonomi
    _i("miskin", "Persentase penduduk miskin", "Ekonomi", "%", "low", 1, "Persentase penduduk di bawah garis kemiskinan.", f"Penduduk miskin / total penduduk × 100. {W}"),
    _i("padi", "Produksi padi", "Ekonomi", "ton", "high", 0, "Produksi padi (gabah kering giling) per tahun.", f"Luas panen × produktivitas. {S}"),
    _i("umk", "Jumlah usaha mikro-kecil", "Ekonomi", "unit", "high", 0, "Banyaknya unit usaha mikro dan kecil.", f"Cacah unit usaha. {S}"),
    # Infrastruktur
    _i("jalan", "Persentase jalan kondisi baik", "Infrastruktur", "%", "high", 1, "Persentase panjang jalan dengan kondisi baik.", f"Panjang jalan baik / panjang jalan total × 100. {W}"),
    _i("air", "Akses air minum layak", "Infrastruktur", "%", "high", 0, "Persentase rumah tangga dengan akses sumber air minum layak.", f"Rumah tangga akses air layak / seluruh rumah tangga × 100. {W}"),
    # Kebencanaan
    _i("banjir", "Indeks risiko banjir", "Kebencanaan", "skor 0–100", "low", 1, "Skor komposit bahaya, kerentanan, dan kapasitas banjir (0–100).", f"Skor tertimbang. {W}"),
    _i("longsor", "Indeks risiko longsor", "Kebencanaan", "skor 0–100", "low", 0, "Skor komposit bahaya, kerentanan, dan kapasitas tanah longsor (0–100).", f"Skor tertimbang. {W}"),
    # Tata kelola
    _i("tatakelola", "Indeks tata kelola pemerintahan desa", "Tata Kelola", "skor 0–100", "high", 1, "Skor komposit kelengkapan perencanaan, pelaporan, dan partisipasi masyarakat.", f"Skor tertimbang. {W}"),
    _i("apbdes", "Realisasi anggaran pendapatan dan belanja desa", "Tata Kelola", "%", "high", 0, "Persentase realisasi belanja terhadap anggaran tahun berjalan.", f"Realisasi / anggaran × 100. {W}"),
    # Pendukung
    _i("penduduk", "Jumlah penduduk", "Kependudukan", "jiwa", "neutral", 0, "Jumlah penduduk pertengahan tahun (bobot agregasi).", f"Proyeksi penduduk. {S}", aux=True),
]

# ---- Variabel tambahan, disusun dari standar desa (Indeks Desa Membangun/IDM, PODES, SDGs Desa) ----
# Catatan: ini usulan kerangka, bukan daftar resmi SIKOP. Ubah/tambah di sini; seluruh sistem mengikuti.
EXTRA = [
    # Pendidikan
    _i("aps_sd", "Angka partisipasi sekolah (SD)", "Pendidikan", "%", "high", 0, "Persentase penduduk usia 7–12 tahun yang bersekolah.", f"Penduduk 7–12 yang bersekolah / penduduk 7–12 × 100. {W}"),
    _i("aps_smp", "Angka partisipasi sekolah (SMP)", "Pendidikan", "%", "high", 0, "Persentase penduduk usia 13–15 tahun yang bersekolah.", f"Penduduk 13–15 yang bersekolah / penduduk 13–15 × 100. {W}"),
    _i("paud", "Partisipasi pendidikan anak usia dini", "Pendidikan", "%", "high", 0, "Persentase anak usia 3–6 tahun yang mengikuti PAUD/TK.", f"Anak 3–6 mengikuti PAUD / anak 3–6 × 100. {W}"),
    _i("buta_huruf", "Angka buta huruf (usia 15+)", "Pendidikan", "%", "low", 0, "Persentase penduduk usia 15 tahun ke atas yang tidak dapat membaca dan menulis.", f"Penduduk 15+ buta huruf / penduduk 15+ × 100. {W}"),
    _i("murid_guru", "Rasio murid per guru (SD)", "Pendidikan", "murid/guru", "low", 0, "Banyaknya murid SD yang dilayani setiap guru.", f"Murid SD / guru SD. {W}"),
    # Kesehatan
    _i("gizi_kurang", "Prevalensi balita gizi kurang (wasting)", "Kesehatan", "%", "low", 0, "Persentase balita dengan berat badan kurang menurut tinggi badan.", f"Balita wasting / balita terukur × 100. {W}"),
    _i("akses_faskes", "Akses ke fasilitas kesehatan (≤ 5 km)", "Kesehatan", "%", "high", 0, "Persentase penduduk yang tinggal ≤ 5 km dari puskesmas/pustu/klinik.", f"Penduduk dalam jangkauan / total penduduk × 100. {W}"),
    _i("jkn", "Kepesertaan jaminan kesehatan", "Kesehatan", "%", "high", 0, "Persentase penduduk yang terdaftar dalam jaminan kesehatan (JKN-KIS).", f"Peserta JKN / total penduduk × 100. {W}"),
    _i("persalinan_nakes", "Persalinan oleh tenaga kesehatan", "Kesehatan", "%", "high", 0, "Persentase persalinan yang ditolong tenaga kesehatan terlatih.", f"Persalinan nakes / seluruh persalinan × 100. {W}"),
    _i("posyandu", "Posyandu aktif", "Kesehatan", "%", "high", 0, "Persentase posyandu yang beroperasi rutin tiap bulan.", f"Posyandu aktif / seluruh posyandu × 100. {W}"),
    _i("sanitasi", "Akses sanitasi layak", "Kesehatan", "%", "high", 0, "Persentase rumah tangga dengan jamban layak milik sendiri atau bersama.", f"Rumah tangga sanitasi layak / seluruh rumah tangga × 100. {W}"),
    # Ekonomi
    _i("pengangguran", "Tingkat pengangguran terbuka", "Ekonomi", "%", "low", 0, "Persentase angkatan kerja yang tidak bekerja dan mencari kerja.", f"Penganggur / angkatan kerja × 100. {W}"),
    _i("pengeluaran", "Pengeluaran per kapita", "Ekonomi", "ribu Rp/bulan", "high", 0, "Rata-rata pengeluaran per kapita sebulan (indikator daya beli).", f"Total pengeluaran rumah tangga / anggota rumah tangga. {W}"),
    _i("bumdes", "Jumlah BUMDes aktif", "Ekonomi", "unit", "high", 0, "Banyaknya badan usaha milik desa yang aktif beroperasi.", f"Cacah BUMDes aktif. {S}"),
    _i("koperasi", "Jumlah koperasi aktif", "Ekonomi", "unit", "high", 0, "Banyaknya koperasi yang aktif.", f"Cacah koperasi aktif. {S}"),
    # Infrastruktur
    _i("listrik", "Akses listrik", "Infrastruktur", "%", "high", 0, "Persentase rumah tangga yang menggunakan listrik (PLN dan non-PLN).", f"Rumah tangga berlistrik / seluruh rumah tangga × 100. {W}"),
    _i("internet", "Akses internet (sinyal 4G)", "Infrastruktur", "%", "high", 0, "Persentase penduduk yang tinggal di area dengan sinyal 4G kuat.", f"Penduduk area sinyal 4G / total penduduk × 100. {W}"),
    _i("jalan_aspal", "Jalan permukaan aspal/beton", "Infrastruktur", "%", "high", 0, "Persentase panjang jalan desa dengan permukaan aspal atau beton.", f"Panjang jalan aspal+beton / panjang jalan × 100. {W}"),
    _i("waktu_tempuh", "Waktu tempuh ke ibu kota kecamatan", "Infrastruktur", "menit", "low", 0, "Rata-rata waktu tempuh kendaraan bermotor ke ibu kota kecamatan.", f"Rata-rata waktu tempuh. {W}"),
    _i("rumah_layak", "Rumah layak huni", "Infrastruktur", "%", "high", 0, "Persentase rumah dengan atap, dinding, dan lantai layak serta luas memadai.", f"Rumah layak huni / seluruh rumah × 100. {W}"),
    # Kebencanaan
    _i("kekeringan", "Indeks risiko kekeringan", "Kebencanaan", "skor 0–100", "low", 0, "Skor komposit bahaya, kerentanan, dan kapasitas kekeringan (0–100).", f"Skor tertimbang. {W}"),
    _i("gempa", "Indeks risiko gempa bumi", "Kebencanaan", "skor 0–100", "low", 0, "Skor komposit bahaya, kerentanan, dan kapasitas gempa bumi (0–100).", f"Skor tertimbang. {W}"),
    _i("karhutla", "Indeks risiko kebakaran hutan dan lahan", "Kebencanaan", "skor 0–100", "low", 0, "Skor komposit bahaya, kerentanan, dan kapasitas kebakaran hutan dan lahan (0–100).", f"Skor tertimbang. {W}"),
    _i("kesiapsiagaan", "Indeks kesiapsiagaan bencana desa", "Kebencanaan", "skor 0–100", "high", 0, "Skor ketersediaan sistem peringatan dini, jalur evakuasi, relawan, dan rencana kontinjensi.", f"Skor tertimbang. {W}"),
    _i("kejadian_bencana", "Jumlah kejadian bencana", "Kebencanaan", "kejadian", "low", 0, "Banyaknya kejadian bencana alam yang tercatat dalam setahun.", f"Cacah kejadian. {S}"),
    # Tata kelola
    _i("keterbukaan", "Indeks keterbukaan informasi desa", "Tata Kelola", "skor 0–100", "high", 0, "Skor ketersediaan informasi publik desa (APBDes, laporan, profil) yang dipublikasikan.", f"Skor tertimbang. {W}"),
    _i("musdes", "Partisipasi dalam musyawarah desa", "Tata Kelola", "%", "high", 0, "Persentase undangan musyawarah desa yang dihadiri unsur masyarakat.", f"Kehadiran / undangan × 100. {W}"),
    _i("dok_rencana", "Kelengkapan dokumen perencanaan desa", "Tata Kelola", "%", "high", 0, "Persentase dokumen wajib (RPJMDes, RKPDes, APBDes) yang lengkap dan tepat waktu.", f"Dokumen lengkap / dokumen wajib × 100. {W}"),
    _i("pades", "Pendapatan asli desa", "Tata Kelola", "juta Rp", "high", 0, "Pendapatan asli desa (hasil usaha, aset, swadaya) setahun.", f"Total pendapatan asli desa. {S}"),
]
INDICATORS = INDICATORS[:-1] + EXTRA + INDICATORS[-1:]   # 'penduduk' (aux) tetap terakhir
BY_ID = {i["id"]: i for i in INDICATORS}
SUM_TYPE = {"padi", "umk", "penduduk", "bumdes", "koperasi", "kejadian_bencana", "pades"}                                  # agregasi penjumlahan
PCT_TYPE = {"miskin", "aps", "stunting", "jalan", "banjir", "imunisasi", "air", "longsor", "tatakelola", "apbdes", "aps_sd", "aps_smp", "paud", "buta_huruf", "gizi_kurang", "akses_faskes", "jkn", "persalinan_nakes", "posyandu", "sanitasi", "pengangguran", "listrik", "internet", "jalan_aspal", "rumah_layak", "kekeringan", "gempa", "karhutla", "kesiapsiagaan", "keterbukaan", "musdes", "dok_rencana"}   # dibatasi 0-100
