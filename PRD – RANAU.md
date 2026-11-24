# PRD – RANAU

*Sistem Prediksi dan Estimasi Kewilayahan Provinsi Lampung*

Versi 0.1 (Draft) · 23 November 2026 · Stack: FastAPI + Next.js

## 1. Ringkasan

RANAU adalah dasbor berbasis peta untuk memprediksi dan mengestimasi indikator wilayah (kecamatan dan desa) di Provinsi Lampung. Tampilannya memadukan dua referensi:

- **SIKOP Pesisir Barat**: gaya editorial yang bersih, beranda dengan angka ringkas, "sorotan lintas tema", daftar wilayah yang perlu perhatian, serta transparansi sumber dan cara hitung setiap angka.
- **SIGER Desaku Maju**: dasbor peta Lampung dengan kartu indikator yang bisa dipilih, gradasi warna per wilayah, filter gabungan (AND), pencarian cepat (Ctrl K), dan struktur data dari tingkat provinsi, kabupaten/kota, kecamatan, sampai desa.

Bedanya: kedua referensi hanya menampilkan data **saat ini**, sedangkan RANAU menambahkan dimensi **waktu** (data series 5 tahun) dan **model machine learning** untuk memproyeksikan nilai ke tahun/periode berikutnya.

## 2. Latar Belakang dan Masalah

- Perencana daerah butuh gambaran arah indikator (naik/turun) per wilayah, bukan hanya angka tahun berjalan.
- Data resmi (misalnya Podes) terbit periodik dan tidak tersedia untuk semua tahun; ada kebutuhan estimasi di antara dua periode pendataan.
- Belum ada satu tampilan peta yang menggabungkan data historis, proyeksi, dan penjelasan metode secara transparan.

## 3. Tujuan dan Non-Tujuan

**Tujuan**

1. Menampilkan indikator historis (5 tahun) dan proyeksi (1–3 tahun ke depan) di peta Lampung.
2. Menyediakan model prediksi per indikator dengan metrik akurasi dan interval ketidakpastian yang terbuka.
3. Menyediakan data dummy realistis agar sistem dapat dibangun dan diuji sebelum data resmi masuk.
4. Arsitektur modular agar dummy mudah diganti data BPS/OPD asli.

**Non-tujuan (MVP)**

- Bukan sistem pengambilan keputusan otomatis; hasil adalah penanda awal, bukan penilaian kinerja.
- Tidak ada pelatihan model *deep learning* di MVP.
- Tidak ada portal login multi-instansi (fase berikutnya).

## 4. Pengguna Sasaran

| Persona | Kebutuhan utama |
| --- | --- |
| Perencana (Bappeda/OPD) | Melihat wilayah dengan tren memburuk, membandingkan skenario, mengunduh data |
| Analis statistik (BPS) | Memeriksa kualitas model, metrik, dan asumsi; mengunggah data baru |
| Publik/akademisi | Menjelajah peta, memahami cara hitung, mengutip sumber |
| Admin sistem | Mengelola dataset, melatih ulang model, memantau job |

## 5. Ruang Lingkup

### 5.1 MVP

- Peta tematik Lampung (choropleth) per kabupaten/kota dan kecamatan; desa sebagai tahap lanjut jika GeoJSON desa tersedia.
- 6–8 indikator dummy lintas tema.
- Slider tahun: 5 tahun historis + proyeksi.
- Halaman detail wilayah: grafik time series, proyeksi dengan interval, peringkat, dan penjelasan metode.
- Filter gabungan (AND) dan pencarian wilayah.
- Halaman "Metodologi" dan "Kualitas Model".
- Ekspor CSV dan GeoJSON hasil.

### 5.2 Fase Berikutnya

- Level desa penuh, login & peran, unggah dataset sendiri, skenario *what-if*, notifikasi, API publik berkunci.

## 6. Indikator Dummy (Usulan)

Indikator dibuat agar mirip karakter data nyata Lampung (tema mengikuti SIKOP/SIGER).

| Tema | Indikator | Satuan | Arah baik |
| --- | --- | --- | --- |
| Ekonomi | Persentase penduduk miskin | % | Rendah |
| Ekonomi | Produksi padi | ton | Tinggi |
| Ekonomi | Jumlah usaha mikro-kecil | unit | Tinggi |
| Pendidikan | Angka partisipasi sekolah (SMA) | % | Tinggi |
| Kesehatan | Prevalensi stunting | % | Rendah |
| Infrastruktur | Persentase jalan kondisi baik | % | Tinggi |
| Kependudukan | Jumlah penduduk | jiwa | Netral |
| Kebencanaan | Indeks risiko banjir | skor 0–100 | Rendah |

Indikator berarah "Netral" tidak ikut perhitungan wilayah yang perlu perhatian, sama seperti prinsip pada SIKOP.

## 7. Kebutuhan Fungsional

### 7.1 Beranda

- Hero singkat dan tombol "Buka Peta Prediksi".
- Angka ringkas: jumlah kabupaten/kota, kecamatan, indikator, tema, rentang tahun.
- **Sorotan lintas tema**: satu indikator kunci per tema, memuat nilai terakhir dan proyeksi tahun depan.
- **Wilayah yang perlu perhatian**: tiga wilayah dengan proyeksi terburuk per indikator (hanya indikator berarah jelas), dijumlahkan per wilayah. Cara hitung ditulis eksplisit.

### 7.2 Peta Prediksi (halaman utama)

- Peta Lampung dengan gradasi warna berdasarkan indikator terpilih.
- Panel kiri: kartu indikator (pilih satu atau lebih), mode data (**Historis / Proyeksi / Selisih**), pilihan level wilayah.
- Slider tahun, dengan penanda jelas antara tahun aktual dan tahun proyeksi (misalnya garis putus-putus dan label "Proyeksi").
- Filter gabungan AND: contoh "stunting proyeksi > 20% DAN kemiskinan proyeksi > 12%".
- Pencarian global (Ctrl K) untuk wilayah dan menu.
- Tooltip saat hover dan panel detail saat klik wilayah.

### 7.3 Detail Wilayah

- Grafik garis: 5 tahun aktual + proyeksi dengan pita interval kepercayaan (80% dan 95%).
- Perbandingan dengan rata-rata kabupaten/kota dan provinsi.
- Peringkat wilayah dan perubahan peringkat.
- Kartu "Mengapa angka ini?": model yang dipakai, fitur utama, dan metrik akurasi.

### 7.4 Metodologi dan Kualitas Model

- Deskripsi sumber data (dummy ditandai jelas), cara hitung, dan keterbatasan.
- Tabel metrik per indikator: MAE, RMSE, MAPE, hasil *backtesting*, versi model, tanggal pelatihan.
- Peringatan otomatis jika akurasi di bawah ambang atau data terlalu sedikit.

### 7.5 Unduh dan Berbagi

- Ekspor CSV (tabel wilayah × tahun), GeoJSON berisi atribut proyeksi, dan gambar peta.
- Tautan yang menyimpan state (indikator, tahun, filter) pada URL.

### 7.6 Admin (MVP ringan)

- Endpoint dan halaman sederhana untuk membangkitkan data dummy, memicu pelatihan ulang, dan melihat status job.

## 8. Data

### 8.1 Sumber GeoJSON

Saat ini baru ada GeoJSON Lampung. Langkah yang perlu dilakukan:

1. **Audit**: cek level (provinsi / kabupaten / kecamatan / desa), CRS (harus EPSG:4326), validitas geometri, dan nama atribut.
2. **Normalisasi kode wilayah**: gunakan kode BPS/Kemendagri sebagai `region_id` (misalnya 2 digit provinsi, 4 digit kabupaten/kota, 7 digit kecamatan, 10 digit desa). Jangan hanya mengandalkan nama.
3. **Simplifikasi**: buat versi ringan (mapshaper atau `shapely.simplify`) untuk tampilan, dan simpan versi penuh untuk analisis.
4. **Konversi ke tabel referensi**: `regions.csv` berisi id, nama, level, parent\_id, centroid, luas.
5. Jika GeoJSON hanya sampai kabupaten/kota, MVP berjalan di level itu; kecamatan/desa menyusul saat batas wilayah tersedia (sumber umum: Wilkerstat BPS atau portal peta resmi).

### 8.2 Skema Data Series (Dummy)

Format *long* (satu baris per wilayah-indikator-tahun):

| Kolom | Tipe | Keterangan |
| --- | --- | --- |
| region\_id | string | Kode wilayah |
| indicator\_id | string | Kode indikator |
| year | int | 2021–2025 |
| value | float | Nilai |
| is\_dummy | bool | Selalu `true` pada MVP |
| source | string | Misalnya `dummy-v1` |

Catatan: periode 5 tahun terakhir dihitung dari tahun data terakhir yang dianggap lengkap, yaitu **2021–2025**; proyeksi mulai 2026.

### 8.3 Strategi Pembangkitan Data Dummy

Agar dummy tidak acak mentah dan tetap layak untuk pemodelan:

- **Nilai dasar per wilayah**: ditarik dari distribusi realistis (misalnya kemiskinan 8–16%), dengan kecenderungan spasial: wilayah bertetangga bernilai mirip.
- **Tren**: kombinasi tren linier landai per wilayah (naik/turun) ditambah efek tahun yang sama untuk semua wilayah (misalnya dampak ekonomi).
- **Noise**: galat Gaussian kecil, dengan beberapa lonjakan/anomali (misalnya satu tahun bencana) untuk menguji ketahanan model.
- **Korelasi antar indikator**: misalnya stunting berkorelasi positif dengan kemiskinan dan berkorelasi negatif dengan kondisi jalan.
- **Batas logis**: persentase di 0–100, produksi dan penduduk tidak negatif.
- **Reproduksibel**: seed tetap, skrip `generate_dummy.py` bisa dijalankan ulang dengan parameter.
- **Penanda jelas**: seluruh tampilan menampilkan label "Data dummy untuk pengembangan" selama `is_dummy = true`.

## 9. Pemodelan Machine Learning

### 9.1 Pendekatan Bertahap

| Tahap | Model | Fungsi |
| --- | --- | --- |
| Baseline | Naive (nilai terakhir), regresi linier tren, rata-rata bergerak | Pembanding wajib |
| Utama | Exponential Smoothing / Prophet per wilayah-indikator, atau regresi *global* (LightGBM/XGBoost) dengan fitur lag, tren, dan fitur spasial | Proyeksi 1–3 tahun |
| Lanjutan | Model hierarkis / *shrinkage* ke rata-rata kabupaten untuk wilayah dengan data tipis; fitur tetangga (spatial lag) | Estimasi wilayah kecil |

Dengan hanya 5 titik per deret, model per-deret sangat rapuh. Rekomendasi: **pooling** (satu model global per indikator yang belajar dari semua wilayah) ditambah baseline linier sebagai pembanding, serta interval prediksi yang jujur.

### 9.2 Evaluasi

- *Rolling-origin backtest*: latih 2021–2023 prediksi 2024, latih 2021–2024 prediksi 2025.
- Metrik: MAE, RMSE, sMAPE; cakupan interval (apakah 80% interval benar-benar memuat ±80% kenyataan).
- Model hanya dipakai di UI jika mengalahkan baseline; jika tidak, sistem otomatis jatuh ke baseline dan menampilkannya.

### 9.3 Estimasi vs Prediksi

- **Prediksi**: proyeksi ke tahun mendatang.
- **Estimasi**: pengisian nilai wilayah yang kosong atau tidak diamati pada tahun tertentu (imputasi/small-area estimation). Pada MVP disediakan fitur ini untuk data yang sengaja dikosongkan pada dummy (misalnya 5% sel).

### 9.4 Siklus Hidup Model

- Pelatihan lewat job terjadwal atau manual dari admin.
- Artefak model dan metrik disimpan dengan versi (`model_version`) dan jejak data pelatihan.
- Hasil proyeksi disimpan ke tabel sehingga frontend tidak menghitung ulang.

## 10. Arsitektur dan Tech Stack

### 10.1 Komponen

| Lapisan | Teknologi | Catatan |
| --- | --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind | Render halaman, state di URL |
| Peta | MapLibre GL JS (via react-map-gl) | Tanpa API key; mendukung choropleth dan vector tiles |
| Grafik | Recharts atau ECharts | Time series dan interval |
| Backend | FastAPI, Pydantic v2, SQLAlchemy 2, Alembic | REST API, dokumentasi OpenAPI otomatis |
| ML | pandas, scikit-learn, statsmodels, LightGBM, (opsional Prophet) | Dijalankan sebagai modul/job terpisah |
| Database | PostgreSQL + PostGIS | Geometri dan data series |
| Job | APScheduler awal, Celery/RQ bila perlu | Pelatihan dan pembangkitan data |
| Deploy | Docker Compose; frontend di Vercel/Cloudflare Pages, backend di VPS | Mengikuti pola referensi (pages.dev) |

### 10.2 Alur Data

1. GeoJSON diaudit lalu dimuat ke PostGIS (`regions`).
2. Skrip dummy mengisi `observations` (wilayah × indikator × tahun).
3. Job pelatihan membaca `observations`, menulis `models` dan `forecasts`.
4. FastAPI melayani GeoJSON ringan, nilai per tahun, dan detail wilayah.
5. Next.js menggabungkan geometri dengan nilai di sisi klien (join berdasarkan `region_id`).

### 10.3 Model Data (Ringkas)

- `regions(id, name, level, parent_id, geom, centroid)`
- `indicators(id, name, theme, unit, direction, description, formula)`
- `observations(region_id, indicator_id, year, value, is_dummy, source)`
- `models(id, indicator_id, algo, version, metrics_json, trained_at)`
- `forecasts(region_id, indicator_id, year, yhat, lo80, hi80, lo95, hi95, model_id)`

### 10.4 Rancangan API (Contoh)

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/v1/regions?level=kabupaten` | Daftar wilayah |
| `GET /api/v1/geo/{level}` | GeoJSON ringan (di-*cache*) |
| `GET /api/v1/indicators` | Daftar indikator dan metadata |
| `GET /api/v1/data?indicator=&year=&level=&mode=` | Nilai per wilayah (mode: actual/forecast/diff) |
| `GET /api/v1/regions/{id}/series?indicator=` | Deret waktu + proyeksi + interval |
| `GET /api/v1/rankings?indicator=&year=` | Peringkat wilayah |
| `GET /api/v1/attention?year=` | Wilayah yang perlu perhatian |
| `GET /api/v1/models/metrics` | Kualitas model |
| `GET /api/v1/export?...` | CSV/GeoJSON |
| `POST /api/v1/admin/generate-dummy` | Bangkitkan dummy |
| `POST /api/v1/admin/train` | Latih ulang model |

## 11. Struktur Halaman

| Rute | Isi |
| --- | --- |
| `/` | Beranda: ringkasan, sorotan, wilayah perhatian |
| `/peta` | Peta prediksi utama |
| `/wilayah/[id]` | Detail wilayah |
| `/metodologi` | Sumber, cara hitung, kualitas model |
| `/unduh` | Ekspor data |
| `/tentang` | Tentang dan kebijakan data |
| `/admin` | Pengelolaan dummy dan model (terbatas) |

## 12. Panduan Desain (Gabungan)

- **Dari SIKOP**: tipografi bersih, warna biru tua sebagai identitas, kartu sorotan, teks penjelasan "cara hitung", tautan *skip to content*, dan dukungan tema terang/gelap/sistem.
- **Dari SIGER**: layout peta penuh dengan panel kiri yang bisa diciutkan, kartu indikator berpersentase, filter AND, dan pencarian Ctrl K.
- **Baru**: kontrol tahun dengan pembeda aktual/proyeksi, pita interval pada grafik, badge "Dummy" dan "Proyeksi", dan legenda yang menyatakan skala warna.
- Aksesibilitas: kontras WCAG AA, skala warna ramah buta warna (misalnya viridis atau YlOrRd), navigasi keyboard.
- Responsif: panel peta menjadi *bottom sheet* di ponsel.

## 13. Kebutuhan Non-Fungsional

- **Kinerja**: peta tampil < 2 detik pada koneksi 4G; respons API data < 500 ms (dengan cache); GeoJSON tampilan < 2 MB per level.
- **Keandalan**: pelatihan ulang tidak mengganggu layanan; hasil proyeksi dibaca dari tabel.
- **Keamanan**: endpoint admin dilindungi token/JWT; CORS dibatasi; validasi input dengan Pydantic.
- **Transparansi**: setiap angka menyertakan sumber, versi model, dan label dummy.
- **Observabilitas**: *logging* terstruktur dan endpoint `/health`.
- **Lokalisasi**: Bahasa Indonesia sebagai bawaan; format angka id-ID.

## 14. Metrik Keberhasilan

| Metrik | Target MVP |
| --- | --- |
| Model terpilih mengalahkan baseline pada backtest | ≥ 70% indikator |
| Cakupan interval 80% | 70–90% |
| Waktu muat peta | < 2 detik |
| Seluruh wilayah di GeoJSON punya data | 100% |
| Demo dipakai pengguna uji tanpa panduan | ≥ 80% berhasil menemukan wilayah prioritas |

## 15. Rencana Pengembangan

| Fase | Durasi (perkiraan) | Keluaran |
| --- | --- | --- |
| 0. Persiapan | 1 minggu | Audit GeoJSON, tabel `regions`, penetapan indikator |
| 1. Data dummy | 1 minggu | Skrip generator, tabel observasi, validasi |
| 2. Backend dasar | 1–2 minggu | FastAPI, PostGIS, endpoint data dan geo |
| 3. Pemodelan | 2 minggu | Baseline, model utama, backtest, tabel forecast |
| 4. Frontend | 2–3 minggu | Beranda, peta, detail wilayah, metodologi |
| 5. Pengujian & rilis | 1 minggu | UAT, perbaikan, deploy |

## 16. Risiko dan Mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Data hanya 5 titik, model tidak stabil | Pooling lintas wilayah, baseline wajib, interval lebar, peringatan di UI |
| Dummy disalahartikan sebagai data resmi | Label "Dummy" permanen dan jelas di semua halaman dan ekspor |
| GeoJSON berat dan lambat | Simplifikasi, vector tiles, cache, pemisahan per level |
| Nama wilayah tidak konsisten | Gunakan kode wilayah sebagai kunci utama |
| Proyeksi dianggap penilaian kinerja | Teks "penanda awal untuk ditelusuri", bukan indeks komposit |
| Pergantian ke data asli merusak model | Skema data tetap sama; pelatihan ulang otomatis saat data baru masuk |

## 17. Pertanyaan Terbuka

1. GeoJSON yang dimiliki sampai level apa: kabupaten/kota, kecamatan, atau desa?
2. Indikator apa yang paling penting diprioritaskan dari daftar usulan?
3. Horizon proyeksi yang diinginkan: 1 tahun atau sampai 3 tahun?
4. Apakah perlu login dan peran pengguna sejak MVP?
5. Lokasi hosting: server sendiri, VPS, atau layanan awan?
6. Rencana sumber data asli (Podes, Susenas, data OPD) agar skema bisa disesuaikan sejak awal?

## 18. Lampiran: Struktur Repositori yang Disarankan

```
ranau/
├── apps/
│   ├── web/            # Next.js
│   └── api/            # FastAPI
│       ├── app/
│       │   ├── routers/
│       │   ├── models/ (SQLAlchemy)
│       │   ├── schemas/ (Pydantic)
│       │   └── services/
│       └── ml/
│           ├── generate_dummy.py
│           ├── train.py
│           └── evaluate.py
├── data/
│   ├── raw/            # GeoJSON asli
│   └── processed/
├── docker-compose.yml
└── README.md
```
