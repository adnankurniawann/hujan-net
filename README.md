# HujanNet

HujanNet membangun peta hujan dari redaman sinyal tautan gelombang mikro
antarmenara telekomunikasi (CML). Hujan meredam sinyal itu, operator sudah
mencatatnya, jadi peta hujan bisa dibuat tanpa memasang alat baru.

Proyek ini lanjutan dari Ujan, juara 3 BRIN AIDeaNation. Versi ini mengganti
aturan buatan tangan dengan model yang dilatih pada data operator sungguhan.

## Yang ada di dasbor

- **Peta Operasi.** Badai simulasi di hulu Ciliwung, 50 tautan sintetis, status
  tiga DAS, dan antrean peringatan yang menunggu keputusan operator.
- **Perbandingan.** Medan hujan simulasi di kiri, peta hasil rekonstruksi di kanan,
  beserta galatnya.
- **Laporan.** Mutu rekonstruksi, rantai model, dan hasil uji pada data operator
  sungguhan.
- **Rute Evakuasi.** Lintasan dari DAS ke posko di jalan OpenStreetMap, dinilai dari
  hujan di sepanjang jalurnya.

Badai, tautan, dan posko di dasbor masih simulasi. Ubin peta dari Esri dan
OpenStreetMap.

## Model AI

| Langkah | Model | Dipakai dasbor |
|---|---|---|
| Basah/kering per tautan | LSTM, dilatih di OpenRainER (Italia) dan OpenMRG (Swedia) | Ya |
| Peta dari angka per tautan | IDW | Ya |
| Peta dari angka per tautan | Operator ridge, dilatih di simulator | Tombol Ridge di Perbandingan |
| Peta dari angka per tautan | MLP per sel, dilatih di OpenMRG | Tidak, kalah dari IDW di simulasi |

Hasil uji di bulan yang tidak pernah dipakai melatih (MCC basah/kering, makin
tinggi makin baik):

| | Italia | Swedia |
|---|---|---|
| Aturan ambang lama | 0,23 | 0,59 |
| Random Forest | 0,49 | 0,63 |
| 1D-CNN | 0,53 | 0,68 |
| LSTM (dasbor) | 0,54 | 0,64* |

\* LSTM masih dilatih dengan label Swedia lama yang telat 6 menit.

Pengali k hujan berbeda per iklim (2,0 di Italia, 2,8 di Swedia). Untuk jaringan
Indonesia, model dan kalibrasinya perlu disetel dengan radar atau penakar hujan
Indonesia. Rincian dan semua angka ada di [ARSITEKTUR.md](ARSITEKTUR.md) bagian 9.

## Menjalankan

```bash
npm install
npm run db:setup
npm run dev
```

Buka http://localhost:3000. Pemuatan pertama menghitung seluruh kejadian di server.
Peta Operasi butuh peramban dengan WebGL2.

Uji:

```bash
npm test
```

Melatih ulang model ada di [`ml/README.md`](ml/README.md). Bobot hasil latihan
ditulis ke `data/ml-*.json`, dan kartu hasil uji di Laporan membaca
`ml/results/*.json`, jadi keduanya ikut berubah setelah dilatih ulang.

## Peta direktori

| Direktori | Isi |
|---|---|
| `lib/physics/` | Model ITU-R P.838 |
| `lib/sim/` | Simulator medan hujan dan model maju |
| `lib/inverse/` | Rekonstruksi peta dari redaman |
| `lib/ml/` | LSTM, operator ridge, dan MLP peta hujan dalam TypeScript |
| `lib/catchment/`, `lib/alerts/` | Akumulasi DAS dan antrean peringatan |
| `lib/evacuation/` | Rute evakuasi |
| `components/` | Antarmuka dasbor |
| `data/` | Tautan sintetis, poligon DAS, jalan, dan bobot model |
| `scripts/` | Pelatihan operator ridge, pembanding peta, pembangun rute |
| `tests/` | Uji fisika, inversi, dan kesamaan model TS dengan PyTorch |
| `ml/` | Pipeline data asli dan pelatihan model (Python) |

Aturan tampilan ada di [DESIGN.md](DESIGN.md). Modul di `lib/` tidak mengimpor
React atau Next.
