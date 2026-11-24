# Data nyata (seed)

Letakkan berkas **CSV** di folder ini (nama berkas = nama sumber; berkas berawalan `_` diabaikan), lalu jalankan dari `apps/api`:

```powershell
.venv\Scripts\python -m ml.seed_real --dry-run      # cek dulu, tidak menulis apa pun
.venv\Scripts\python -m ml.seed_real --train        # tulis sebagai data nyata, lalu latih model & prediksi
```

## Bentuk yang dikenali
| Bentuk | Kolom |
|---|---|
| Panjang | `region_id, indikator, tahun, nilai` |
| Lebar per tahun | `region_id, indikator, 2021, 2022, 2023, 2024, 2025` |
| Lebar per indikator | `region_id, tahun, miskin, stunting, jalan, …` |

**Wilayah**: kolom kode (`region_id`/`kode`/`iddesa`/`kode_kec`, kode BPS 10 digit untuk desa, 7 kecamatan, 4 kabupaten) *atau* kolom nama
(`desa`/`kelurahan`, `kecamatan`, `kabupaten`). Nama dicocokkan tanpa awalan Kab./Kota/Kec./Desa/Kel.; bila ada nama desa kembar, tambahkan kolom kecamatan/kabupaten.
**Indikator**: id (`miskin`, `stunting`, `aps`, `rls`, `imunisasi`, `padi`, `umk`, `jalan`, `air`, `banjir`, `longsor`, `tatakelola`, `apbdes`, `penduduk`) atau nama/alias umum.
**Tahun** 2021–2025. **Angka**: `12.5`, `12,5`, `1.234,5` dan `1,234.5` dikenali; kosong, `-`, `NA` dilewati. Pemisah kolom `,` `;` tab atau `|`.

## Yang terjadi
- Nilai ditulis sebagai **data nyata** (`is_dummy=0`, sumber = nama berkas) dan menimpa dummy pada sel yang sama.
- Agregat kecamatan/kabupaten/provinsi dihitung ulang dari data di bawahnya (kecuali nilai yang memang Anda berikan di level itu).
- Indikator yang belum Anda berikan tetap dummy; UI menandai tiap indikator sebagai **Dummy / Campuran / Data nyata**.
- Data hanya sampai level kabupaten? Pakai `--drop-dummy-below` agar dummy di kecamatan/desa dihapus (tampil "tanpa data") alih-alih tidak konsisten.
- Laporan lengkap: `seed_report.txt`.
