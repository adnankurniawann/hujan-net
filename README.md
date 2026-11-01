# HujanNet

HujanNet membuat peta hujan dari sinyal menara telekomunikasi. Hujan meredam
sinyal gelombang mikro yang lewat di antara dua menara (CML, *commercial microwave
link*). Operator seluler sudah mencatat redaman itu untuk memantau jaringannya,
jadi satu kota bisa punya ratusan "penakar hujan" tanpa memasang alat baru.

HujanNet meraih juara 3 di BRIN AIDeaNation.

## Masalah yang dijawab

Hulu Ciliwung punya sedikit penakar hujan, dan radar cuaca melihat hujan dari
ketinggian beberapa kilometer. Padahal banjir Jakarta kerap dipicu hujan di hulu
itu. Jaringan seluler sudah menutup wilayah yang sama dengan rapat. HujanNet membaca jaringan tersebut sebagai sensor hujan, lalu
menjumlahkan hujannya per Daerah Aliran Sungai (DAS) supaya BPBD bisa bersiap
lebih awal.

Penggunanya operator BPBD atau BMKG. Sistem menyusun kandidat peringatan saat
akumulasi hujan sebuah DAS melewati ambang, lalu operator yang memutuskan.
Penerbitan informasi cuaca untuk publik tetap wewenang BMKG (UU 31/2009).

## Cara kerja

1. **Ambil redaman.** Setiap tautan melaporkan daya terima. Daya yang turun di bawah
   garis dasar keringnya adalah redaman.
2. **Basah atau kering.** Model LSTM membaca 120 menit terakhir dan memutuskan apakah
   tautan sedang kena hujan, supaya derau sinyal tidak terbaca sebagai hujan.
3. **Redaman jadi hujan.** Redaman dikurangi efek antena basah, lalu diubah ke mm/jam
   dengan rumus ITU-R P.838: γ = k · R^α.
4. **Angka per tautan jadi peta.** Hujan rata-rata tiap lintasan disebar ke grid
   40 × 30 sel (sekitar 550 m) dengan interpolasi IDW.
5. **Peta jadi peringatan.** Hujan dijumlahkan per DAS dalam jendela 1, 3, dan 6 jam.
   Kandidat peringatan muncul saat akumulasi melewati ambang.

## Isi dasbor

| Tab | Isi |
|---|---|
| Peta Operasi | Peta hujan hasil rekonstruksi, 50 tautan, batas tiga DAS, status DAS, antrean peringatan, dan detail tautan yang kamu klik |
| Perbandingan | Medan hujan simulasi di kiri, peta rekonstruksi di kanan, dengan RMSE dan selisih posisi puncak. Tombol Ridge menukar IDW dengan operator ridge |
| Laporan | Indeks kesesuaian, tren galat, rantai model, kondisi jaringan, akumulasi DAS, dan hasil uji pada data operator sungguhan |
| Rute Evakuasi | Lintasan dari DAS terdampak ke posko di jalan OpenStreetMap, dinilai dari hujan di sepanjang jalurnya |

Penggeser waktu di bawah memutar ulang satu kejadian badai selama 60 menit.

## Status data

| Lapisan | Sumber | Status |
|---|---|---|
| Badai dan redaman di dasbor | simulator di `lib/sim/` | simulasi |
| 50 tautan di hulu Ciliwung | `data/links.json` | sintetis |
| Batas DAS | DEM SRTM 30 m, `scripts/hydro/` | nyata |
| Jalan untuk rute evakuasi | OpenStreetMap | nyata |
| Posko evakuasi | `lib/evacuation/` | sintetis |
| Data latih model | OpenRainER (Italia), OpenMRG (Swedia) | nyata, belum Indonesia |

Dasbor selalu menampilkan penanda DATA SIMULASI selama sumbernya masih simulasi.

## Model AI dan hasilnya

| Langkah | Model | Dipakai dasbor |
|---|---|---|
| Basah/kering per tautan | LSTM, dilatih pada data operator Italia dan Swedia | Ya |
| Angka per tautan ke peta | IDW | Ya |
| Angka per tautan ke peta | Operator ridge, dilatih di simulator | Lewat tombol Ridge |
| Angka per tautan ke peta | MLP per sel, dilatih pada data Swedia | Tidak |

**Basah/kering pada data sungguhan.** Diuji pada bulan yang tidak pernah dipakai
melatih: 9,1 juta contoh di Italia (2022) dan 6,3 juta di Swedia (Agustus 2015).
Skornya MCC, makin tinggi makin baik.

| Metode | Italia | Swedia |
|---|---|---|
| Aturan ambang lama | 0,23 | 0,59 |
| Random Forest | 0,49 | 0,63 |
| 1D-CNN | 0,53 | 0,68 |
| LSTM (dipakai dasbor) | 0,54 | 0,64* |

\* LSTM masih memakai label Swedia lama yang telat sekitar 6 menit.

**Peta hujan pada data sungguhan.** Di Gothenburg (364 tautan, radar 2 km), RMSE
saat hujan sekitar 2,2 mm/jam untuk IDW, ridge, dan MLP. Dengan hujan per tautan
yang sempurna, angkanya turun ke 1,5. Sisa galat terbesar ada di taksiran per
tautan.

**Kalibrasi per iklim.** Pengali k hujan bernilai 2,0 di Italia dan 2,8 di Swedia.
Angka Swedia membuat total hujan Italia 34 % terlalu rendah. Jaringan Indonesia
perlu disetel dengan radar atau penakar hujan Indonesia.

**Di kejadian simulasi**, rekonstruksi mencapai RMSE rata-rata 3,51 mm/jam, CSI
basah/kering 88 %, dan galat posisi puncak 1,15 km saat hujan terkuat.

MLP peta hujan kalah dari IDW di badai simulasi (RMSE 5,0 lawan 3,5), jadi dasbor
tetap memakai IDW. Semua angka, cara ukur, dan batasnya ada di
[ARSITEKTUR.md](ARSITEKTUR.md) bagian 9.

## Menjalankan dasbor

Butuh Node.js 22 atau lebih baru.

```bash
npm install
npm run db:setup
npm run dev
```

Buka http://localhost:3000. Pemuatan pertama menghitung seluruh kejadian di
server dan butuh beberapa detik. Peta Operasi butuh peramban dengan WebGL2.

`npm run db:setup` membuat basis data SQLite di `prisma/dev.db` untuk menyimpan
keputusan operator.

Uji:

```bash
npm test
```

## Melatih ulang model

Pipeline Python ada di [`ml/`](ml/README.md) dan memakai [uv](https://docs.astral.sh/uv/).
Ia mengunduh data OpenMRG dan OpenRainER, membangun fitur, melatih model, lalu
menulis hasil uji ke `ml/results/`.

```bash
cd ml
uv sync
uv run python -m hujannet_ml.openmrg
uv run python -m hujannet_ml.cnn lstm
uv run python -m hujannet_ml.cnn export
```

`export` menulis bobot ke `data/ml-wetdry.json`, yang dibaca dasbor. Kartu hasil
uji di tab Laporan membaca `ml/results/*.json`, jadi angkanya ikut berubah setelah
model dilatih ulang. Urutan lengkap dan perkiraan waktunya ada di
[`ml/README.md`](ml/README.md).

Operator ridge dilatih dengan `node scripts/train-operator.ts`.

## Peta direktori

| Direktori | Isi |
|---|---|
| `app/` | Halaman Next.js dan API (`/api/sim`, `/api/catchments`, `/api/alerts`) |
| `components/` | Antarmuka dasbor |
| `lib/physics/` | Rumus ITU-R P.838 |
| `lib/sim/` | Simulator badai dan model maju redaman |
| `lib/inverse/` | Rekonstruksi peta dari redaman |
| `lib/ml/` | LSTM, operator ridge, dan MLP dalam TypeScript |
| `lib/catchment/`, `lib/alerts/` | Akumulasi DAS dan antrean peringatan |
| `lib/evacuation/` | Rute evakuasi dan penilaian hujan sepanjang rute |
| `data/` | Tautan sintetis, poligon DAS, jalan, rute, dan bobot model |
| `scripts/` | Pelatihan operator ridge, pembanding peta, pembangun rute dan DAS |
| `tests/` | Uji fisika, inversi, API, dan kesamaan model TS dengan PyTorch |
| `ml/` | Pipeline data sungguhan dan pelatihan model (Python) |

Modul di `lib/` tidak mengimpor React atau Next, jadi bisa diuji langsung dengan
`node --test`.

## Batasan

- Dasbor belum memakai data operator Indonesia. Badai dan tautannya simulasi.
- Model dilatih pada iklim Eropa. Hujan konvektif tropis belum pernah dilihatnya.
- Kalibrasi k dan antena basah berbeda per negara, jadi angka Eropa belum bisa
  dipakai langsung di sini.
- Ubin peta memakai layanan Esri tanpa kunci, yang bisa ditutup sewaktu-waktu.

## Dokumen lain

- [ARSITEKTUR.md](ARSITEKTUR.md): aliran data, modul, API, metode, dan semua temuan
- [DESIGN.md](DESIGN.md): aturan tampilan
- [docs/sumber-data.md](docs/sumber-data.md): sumber data
- [ml/README.md](ml/README.md): pipeline data dan pelatihan
