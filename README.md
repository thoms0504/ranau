# RANAU – Sistem Prediksi dan Estimasi Kewilayahan Lampung

Implementasi MVP sesuai `PRD – RANAU.md`. **Seluruh angka adalah data dummy (`dummy-v1`).**

```
apps/api   FastAPI + SQLite (sqlite3) + numpy  → REST /api/v1, OpenAPI di /docs
apps/web   Next.js (App Router) + Tailwind + MapLibre + Recharts
data/raw        GeoJSON asli (kabupaten, kecamatan, desa)
data/processed  GeoJSON ringan, regions.csv, audit_report.txt
```

## Menjalankan (lokal)
```bash
# 1) Backend
cd apps/api
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt     # Linux/Mac: .venv/bin/pip
.venv/Scripts/python -m ml.prepare_geo        # audit + normalisasi + simplifikasi GeoJSON (Fase 0)
.venv/Scripts/python -m ml.generate_dummy     # data dummy (seed 42)       (Fase 1)
.venv/Scripts/python -m ml.train              # estimasi, baseline, model, backtest, forecast (Fase 3)
.venv/Scripts/python -m uvicorn app.main:app --port 8000

# 2) Frontend
cd apps/web && npm install && npm run dev      # http://localhost:3000
```
Env: `RANAU_ADMIN_TOKEN` (default `ranau-dev-token`, **ganti di produksi**), `RANAU_CORS`, `RANAU_DB`, `NEXT_PUBLIC_API_URL`.
Docker: `docker compose up --build`.

## Catatan keputusan
- **SQLite, bukan PostgreSQL/PostGIS**: geometri dilayani dari berkas GeoJSON per level; skema tabel sama dengan PRD §10.3 sehingga mudah dipindah ke Postgres.
- **numpy murni untuk ML** (baseline, ridge pooled, ensemble): lingkungan pengembangan memblokir DLL scipy/pandas/scikit-learn. Tidak ada LightGBM/Prophet pada MVP.
- Audit GeoJSON: lihat `data/processed/audit_report.txt` (kecamatan Umpu Semenguk dibentuk dari gabungan desa; 2 kecamatan "Hutan" tanpa desa dikecualikan).
- Horizon proyeksi 3 tahun (2026–2028); login/peran belum ada (admin memakai token).

## Admin (tab Input data / Model & prediksi / Job)
- **Input manual**: per wilayah (PUT `/admin/observations`) atau impor CSV massal (`/admin/observations/bulk`). Nilai bersumber `manual`, `is_dummy=0`; agregat induk dihitung ulang otomatis. Membangkitkan ulang dummy menolak jalan bila ada data manual kecuali `force=true`.
- **Model**: `POST /admin/train?mode=train|predict&algo=auto|<model>&indicator=&level=&horizon=1..5`. `train` backtest semua kandidat lalu memilih; `predict` mempertahankan algoritma aktif dan memakai data terbaru.
- **Menambah model**: tambahkan satu entri di registri `MODELS` pada `apps/api/ml/train.py`; otomatis ikut backtest, seleksi, dan muncul di UI.

## Peta drill-down, peringkat, profil, perbandingan
- `/peta`: awal per kabupaten/kota → klik = zoom ke kecamatan → klik = zoom ke desa/kelurahan (breadcrumb di atas peta). Panel: tab **Indikator** (6 tema), **Peringkat** (wilayah yang tampil, terbaik/terburuk dulu), **Profil** (seluruh indikator wilayah terpilih; kab/kec = jumlah atau rata-rata tertimbang penduduk).
- `/bandingkan`: hingga 6 wilayah, per aspek (tema), tren + proyeksi, batang tahun terpilih, tabel aspek, tabel aktual/estimasi/proyeksi.
- API baru: `GET /regions/{id}/profile?year=`, `GET /rankings?...&parent=`.
- Legenda 5 kelas (kuantil; selisih = selang sama), palet teal→biru dan biru↔amber.

## Seed data nyata
Letakkan CSV di `data/real/` (panduan format: `data/real/README.md`, contoh berawalan `_`), lalu dari `apps/api`:
```powershell
.venv\Scripts\python -m ml.seed_real --dry-run     # cek pencocokan wilayah/indikator tanpa menulis
.venv\Scripts\python -m ml.seed_real --train       # tulis sebagai data nyata + latih & prediksi indikator terkait
```
Nilai nyata menimpa dummy pada sel yang sama; agregat kecamatan/kabupaten/provinsi dihitung ulang; tiap indikator ditandai Dummy / Campuran / Data nyata di UI, CSV, dan GeoJSON. Impor lewat Admin → Input data memakai logika yang sama.

## Tampilan & peta dasar
- Desain: tipografi Plus Jakarta Sans (judul) + Inter (isi), keduanya self-hosted lewat `@fontsource-variable`; token warna/komponen ada di `apps/web/app/globals.css`.
- Peta dasar bawaan **OpenStreetMap** (pilihan: OSM Terang, OSM Gelap, tanpa peta dasar; pilihan tersimpan di browser). Atribusi OSM/CARTO tampil otomatis. Server tile OSM publik cocok untuk pengembangan; untuk produksi berlalu lintas tinggi gunakan penyedia/tile server sendiri (ubah `apps/web/lib/basemaps.ts`).
