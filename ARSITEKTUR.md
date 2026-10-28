# HujanNet — Produk, Arsitektur, dan Temuan

Satu dokumen untuk produk, kode, dan angka yang sudah diukur. Aturan tampilan ada
di [DESIGN.md](DESIGN.md). Pipeline data dan model AI ada di [ml/](ml/README.md),
sumber datanya di [docs/sumber-data.md](docs/sumber-data.md).

---

## 1. Produk

**Klaim:** redaman sinyal tautan gelombang mikro antar menara BTS bisa dibaca sebagai
peta curah hujan resolusi tinggi, tanpa memasang sensor baru.

**Pengguna:** operator BPBD/BMKG. Mereka memantau hujan dan akumulasi per DAS,
lalu meninjau kandidat peringatan yang muncul otomatis.

**Tata kelola, tidak boleh dilanggar:**

- **Tidak ada jalur kode yang menerbitkan peringatan tanpa konfirmasi operator.**
- Penerbitan informasi meteorologi untuk publik adalah kewenangan BMKG (UU 31/2009).
  HujanNet lapisan pengukuran untuk lembaga berwenang, bukan lapisan siaran publik.

**Sengaja tidak dibangun:** analisis CCTV, notifikasi atau laporan warga, chatbot LLM,
widget berita/gempa/kualitas udara, login dan manajemen akun, model hidrologi atau
kedalaman genangan. Kekuatan HujanNet ada di lapisan pengukuran, bukan integrasi.

**Rute evakuasi** hanya dalam bentuk sempit: operator memilih posko untuk DAS terdampak.
Keamanan rute dinilai dengan mencuplik medan hujan rekonstruksi sepanjang lintasan
(`sampleRainAt()`). Tidak ada navigasi belokan dan tidak ada tampilan untuk warga.

---

## 2. Status data

| Lapisan | Sumber | Nyata? |
|---|---|---|
| Medan hujan dan redaman di dasbor | simulator `lib/sim/` | **simulasi** |
| Topologi 50 tautan, hulu Ciliwung | `data/links.json` | **sintetis** |
| Batas DAS | DEM SRTM 30 m, `scripts/hydro/` | nyata |
| CML + radar Gothenburg | OpenMRG, `ml/` | nyata, bukan Indonesia |

Selama dasbor masih memakai simulasi, penanda **DATA SIMULASI** wajib terlihat di setiap
tampilan yang bersangkutan.

---

## 3. Aliran data

Panah hanya ke bawah. Modul di `lib/` tidak mengimpor React atau Next.

```
data/links.json            data/catchments.geojson + data/catchment-config.json
        │                                        │
lib/sim/scenario.ts   EVENT_BBOX, EVENT_GRID, DEMO_STORM
        │                                        │
lib/sim/rainField.ts  medan hujan sebenarnya     │
        │                                        │
lib/physics/itu838.ts gamma = k R^alpha          │
        │                                        │
lib/sim/forward.ts    LinkSample[], rxPowerDbm berderau
        │                                        │
lib/inverse/ (+ lib/ml/operator.ts)  Snapshot    │
        ├────────────────────────────────────────┤
        ▼                                        ▼
app/api/sim/                              lib/catchment/  CatchmentState[]
        │                                        │
        │                                 lib/alerts/     AlertCandidate
        ▼                                        ▼
                 components/ + app/page.tsx
```

**Akumulasi DAS dan peringatan memakai `Snapshot.reconstruction`, bukan `truth`.**
Peringatan harus lahir dari angka yang bisa dihasilkan di dunia nyata. `truth` hanya
untuk tampilan perbandingan dan RMSE.

---

## 4. Modul dan pintu masuk

| Modul | Pintu masuk | Catatan |
|---|---|---|
| `lib/types.ts` | `Link`, `LinkSample`, `LinkState`, `GridField`, `Snapshot`, `CatchmentState`, `AlertCandidate` | kontrak data bersama |
| `lib/physics/itu838.ts` | `ituCoefficients`, `specificAttenuation`, `rainRateFromAttenuation`, `freeSpacePathLoss` | tabel ITU-R P.838-3, 7–40 GHz |
| `lib/sim/` | `rainFieldAt`, `simulateEvent`, `findSnapshot`, `buildMeta` | **semua angka penyetelan demo hanya di `scenario.ts`** |
| `lib/inverse/` | `reconstructEvent(links, options?)` | klasifikasi → garis dasar → WAA → inversi → IDW → RMSE |
| `lib/ml/` | `fitLinearOperator`, `applyLinearOperator`, `loadOperator`, `classifyWetDryModel`, `loadWetDryModel` | operator ridge di `data/ml-operator.json`, LSTM basah/kering di `data/ml-wetdry.json` |
| `lib/catchment/` | `loadCatchmentData`, `buildRainSeries`, `catchmentStatesAt` | C-01 70 sel, C-02 70, C-03 116 |
| `lib/alerts/` | `detectCandidates`, penyimpanan Prisma | konfirmasi/abaikan lewat API |
| `lib/evacuation/` | `lookupRoute`, `sampleRainAt` | |

Model invers **tidak boleh** membaca `LinkSample.baselineDb` atau `trueRainMmH`.
Keduanya kebenaran dasar yang tidak ada di lapangan, dan ada uji yang gagal kalau
dilanggar.

Bobot IDW hanya bergantung geometri, jadi dibangun sekali sebagai matriks jarang lalu
dipakai ulang untuk 241 langkah waktu. Satu kejadian selesai di bawah satu detik.

`data/ml-operator.json` terikat ke topologi `data/links.json`. Kalau topologinya berubah,
latih ulang dengan `node scripts/train-operator.ts`. `data/ml-wetdry.json` tidak terikat
topologi; buat ulang dengan `uv run python -m hujannet_ml.cnn export` di `ml/`.

---

## 5. API

| Endpoint | Isi |
|---|---|
| `GET /api/sim?t=<detik>` | satu `Snapshot`. `t` kelipatan 15 di 0–3600, selain itu 400 |
| `GET /api/sim/meta` | `dataSource`, seluruh `Link`, `bbox`, `grid`, `times`, `diagnostics` |
| `GET /api/sim/event` | seluruh kejadian `{ times, snapshots }`, untuk pemutar ulang |
| `GET /api/sim/link/<id>` | deret waktu satu tautan, 241 titik. 404 kalau id tidak ada |
| `GET /api/catchments` | status DAS |
| `GET /api/alerts`, `GET /api/alerts/event` | antrean peringatan |
| `POST /api/alerts/refresh` | deteksi ulang kandidat |
| `POST /api/alerts/<id>/confirm`, `/dismiss` | keputusan operator |

`baselineEstDb` pada `/api/sim/link` adalah **taksiran**, bukan kebenaran dasar, dan
harus ditampilkan begitu.

---

## 6. Konvensi

| Hal | Nilai |
|---|---|
| Urutan baris grid | selatan ke utara, `iy = 0` paling selatan, indeks `iy * nx + ix` |
| Grid | 40 × 30 sel, ± 550 m, bbox `[106.86, -6.76, 107.06, -6.61]` |
| Waktu simulasi | detik sejak awal kejadian, 0–3600, langkah 15 detik, 241 cuplikan |
| Satuan | hujan mm/jam, tingkat daya dBm, selisih daya dB |
| Id | tautan `L-001`…`L-050`, DAS `C-01`…`C-03` |
| Versi | Next 14.2.35, React 18 |
| Uji TypeScript | `node --test` dengan pengupasan tipe bawaan Node, impor di `lib/` pakai ekstensi `.ts` |

`lib/catchment/` masih memakai impor tanpa ekstensi, jadi belum bisa diuji langsung oleh
`node --test`.

---

## 7. Metode di dasbor (simulasi)

**Simulator.** Tiga sel Gauss bergerak di atas hulu Ciliwung: puncak 38, 24, dan 28 mm/jam,
radius 3,0, 2,2, dan 2,6 km. Angin 320° pada 18 km/jam, dikalikan amplop kosinus 1 jam,
jadi kejadian selalu dibuka dan ditutup dalam keadaan cerah. Puncak medan 40,8 mm/jam
pada detik ke-1.800.

**Model maju.** Redaman sepanjang lintasan dihitung dengan aturan titik tengah di 20 titik,
lalu dikotori: antena basah 1,5 dB, hanyutan garis dasar 0,5 dB/jam, derau penerima
σ 0,2 dB, kuantisasi 0,3 dB. Redaman puncak 24,75 dB, 124 kali σ derau.

**Model invers**, `lib/inverse/`:

1. **Basah/kering**: LSTM yang dilatih pada data operator sungguhan (`lib/ml/wetdry.ts`,
   lihat 9.5), satu keputusan per menit dari 120 menit sebelumnya, ditambah konsistensi
   tetangga dalam radius 6 km. Aturan ambang lama (ragam > 0,6 dB atau selisih > 0,9 dB)
   tetap ada di `classify.ts` dan hanya dipakai kalau model tidak diberikan.
2. **Garis dasar**: median bergerak atas cuplikan kering, ±15 menit.
3. **Antena basah**: kurangi 1,5 dB saat basah.
4. **Inversi**: `R = (A / L / k)^(1/alpha)`.
5. **Ke grid**: IDW pangkat 2, jangkauan 2 km. Operator ridge sebagai alternatif.
6. **RMSE** terhadap kebenaran dasar.

---

## 8. Metrik

**RMSE** dihitung di seluruh 1.200 sel per langkah waktu, lalu dirata-rata atas 241
langkah. Kebenaran dasar diambil dari medan analitik, bukan dari grid. Sel di luar
cakupan jaringan ikut dihitung. Posisi puncak memakai titik berat sel di atas 70 %
nilai puncak.

**Basah/kering dilaporkan dengan POD, FAR, dan CSI, bukan akurasi.** Kejadian demo 79,7 %
cuplikannya basah, jadi penebak yang selalu menjawab "basah" sudah dapat 79,7 % akurasi.
Pada data operator sungguhan fraksi basah biasanya di bawah 5 %: di OpenMRG, 7,4 % pasangan
CML-potret radar di atas 0,1 mm/jam. Ketidakseimbangan kelas inilah yang membuat
klasifikasi sulit di lapangan.

**Pemisahan latih/uji wajib per kejadian hujan, bukan per langkah waktu.** Medan pada
langkah yang berdekatan hampir identik. Pemisahan acak membocorkan tetangga cuplikan latih
ke himpunan uji.

---

## 9. Temuan dan batas yang diketahui

Angka dari repo pada 28 Oktober 2026, kejadian demo, basah/kering dengan LSTM.

| Ukuran | Nilai |
|---|---|
| RMSE rata-rata / terburuk | 3,51 / 7,46 mm/jam |
| Bias | +1,32 mm/jam |
| POD / FAR / CSI basah-kering | 96,4 % / 8,6 % / 88,3 % |
| Galat posisi puncak (puncak / terburuk) | 1,15 / 2,73 km |
| Cakupan grid dalam jangkauan IDW | 74 % |

### 9.1 Hampir semua galat berasal dari IDW

Angka 9.1 sampai 9.4 diukur saat basah/kering masih memakai aturan ambang (RMSE 3,41).

| Tahap | RMSE |
|---|---|
| Inversi per tautan, dari sinyal kotor | 0,73 mm/jam |
| IDW dengan hujan per tautan yang diketahui **sempurna** | 3,35 mm/jam |
| Pipeline penuh | 3,41 mm/jam |

98 % galat lahir di langkah penyebaran garis ke bidang. Ada 50 pengukuran untuk 1.200
nilai, jadi persoalannya kurang tentu 1 : 24, dan satu tautan hanya memberi rata-rata
lintasannya. **Langkah inilah yang paling layak diganti model belajar.**

Bias +1,57 juga berasal dari sini: menyebarkan rata-rata lintasan meratakan medan,
puncak terlalu rendah dan sekelilingnya terlalu tinggi.

### 9.2 Faktor akurasi

| Jangkauan IDW | 1 km | 2 km | 4 km | 6 km |
|---|---|---|---|---|
| RMSE | 3,18 | 3,41 | 3,98 | 4,42 |
| Cakupan | 53 % | 74 % | 94 % | 99 % |

| Jumlah tautan | 50 | 30 | 20 | 6 |
|---|---|---|---|---|
| RMSE | 3,41 | 3,36 | 3,71 | 3,74 |
| Cakupan | 74 % | 69 % | 55 % | 37 % |

Jumlah tautan menentukan **luas** wilayah terukur, bukan **ketepatan** nilainya.

Salah kalibrasi antena basah di invers: 0 dB → 5,57, 0,75 dB → 4,35, 1,5 dB (benar) → 3,41,
2,25 dB → 3,18. Koreksi berlebih "membaik" hanya karena menutupi bias positif.

### 9.3 Inverse crime: simulasi tidak bisa menguji fisikanya sendiri

Empat koefisien di tabel ITU kode ternyata salah salin. Yang terbesar `kV` 18 GHz meleset
1,8 %. Setelah diperbaiki, RMSE hanya bergeser 0,08 %, karena model maju dan invers
memakai koefisien yang sama sehingga kesalahannya saling meniadakan. **Angka dari simulasi
membuktikan rantai algoritmanya benar, tetapi tidak membuktikan konstanta fisikanya tepat
untuk atmosfer Indonesia.** Itu hanya bisa diuji dengan data lapangan. Uji di
`tests/physics.test.ts` mengunci dua belas nilai terhadap dokumen resmi.

### 9.4 Operator ridge, `lib/ml/operator.ts`

Regresi ridge linear tanpa intersep: `W = X Rᵀ (R Rᵀ + λI)⁻¹`, matriks 1.200 × 50. Tanpa
intersep, jaringan yang seluruhnya kering menghasilkan medan nol.

| | IDW | Ridge |
|---|---|---|
| Simulasi, 80 badai uji, RMSE sel tercakup | 1,68 | 0,97 |
| Simulasi, DEMO_STORM | 3,41 | 1,35 |
| OpenMRG, 5 kejadian uji, RMSE sel tercakup | 3,64 | 2,89 |

Batasnya:

- Versi simulasi hanya mempelajari keluarga badai dari generator sendiri.
- Hasil OpenMRG berasal dari skrip lama yang file antaranya tidak bisa dibuat ulang. Angkanya
  harus diukur ulang lewat `ml/`.
- Masih model linear.

### 9.5 Basah/kering pada data operator sungguhan

`ml/hujannet_ml/wetdry.py`, hasil lengkap di [ml/results/wetdry.md](ml/results/wetdry.md).
Label dari radar sepanjang lintasan (> 0,1 mm/jam), uji pada bulan yang tidak pernah
dipakai melatih: OpenRainER 2022 (9,1 juta contoh) dan OpenMRG Agustus 2015 (6,3 juta).

| MCC pada data uji | OpenRainER | OpenMRG |
|---|---|---|
| Aturan ambang dasbor (`classify.ts`) | 0,226 | 0,546 |
| Random Forest, dilatih pada kedua dataset | 0,486 | 0,580 |
| Random Forest, dilatih hanya pada dataset lain | 0,335 | 0,556 |
| 1D-CNN pada deret mentah 120 menit, kedua dataset | 0,536 | 0,629 |
| LSTM pada deret mentah 120 menit, kedua dataset | **0,540** | **0,638** |

- Aturan dasbor runtuh di OpenRainER: FAR 88 %, CSI 0,11. Ambangnya disetel untuk
  simulasi berderau 0,2 dB, sedangkan data ini dikuantisasi 1 dB.
- Random Forest menaikkan CSI OpenRainER dari 0,11 ke 0,34. Model gabungan hampir sama
  baiknya dengan model khusus tiap dataset.
- Model yang dilatih di satu negara tetap mengalahkan aturan di negara lain, tetapi
  kehilangan sebagian mutunya. Kalibrasi pada data Indonesia tetap diperlukan.
- Fitur terpenting: selisih redaman terhadap median 24 jam (`dip_mean`, `dip_max`),
  lalu ragam 60 menit.
- 1D-CNN (`ml/hujannet_ml/cnn.py`, hasil di [ml/results/wetdry_cnn.md](ml/results/wetdry_cnn.md))
  mengalahkan RF di kedua dataset pada baris uji yang sama, padahal hanya dilatih pada
  10 % contoh latih: CSI 0,39 vs 0,34 (OpenRainER) dan 0,49 vs 0,44 (OpenMRG).
  Jaringan belajar sendiri dari deret redaman, tanpa fitur rancangan tangan.
- LSTM (`cnn.py lstm`, hasil di [ml/results/wetdry_lstm.md](ml/results/wetdry_lstm.md))
  butuh lebih banyak epoch: setelah 6 epoch ia masih di bawah CNN (MCC 0,507 / 0,616).
  Dengan berhenti dini (terbaik di epoch 9, berhenti di 12) ia sedikit melampaui CNN:
  MCC 0,540 vs 0,536 dan 0,638 vs 0,629. Selisih sekecil ini belum diuji dengan seed lain,
  jadi CNN dan LSTM dianggap setara. CNN lebih murah dilatih (6 epoch vs 12).

**Di dasbor dipakai LSTM**, bukan CNN: menit kosong sebelum kejadian sama untuk semua
jendela, jadi keadaan LSTM-nya bisa dihitung sekali. Satu kejadian 50 tautan butuh sekitar
2,5 detik di JavaScript. Lintasan majunya di TS diuji sama dengan PyTorch.

Pada kejadian demo, LSTM **lebih buruk** daripada aturan lama:

| Kejadian demo | CSI | MCC | RMSE peta |
|---|---|---|---|
| Aturan ambang + tetangga | 0,995 | 0,989 | 3,41 mm/jam |
| LSTM + tetangga | 0,883 | 0,666 | 3,51 mm/jam |

Ini wajar. Aturan itu disetel pada simulator yang sama (kejahatan invers, 9.3), sedangkan
LSTM tidak pernah melihat simulasi. Galatnya dua jenis: telat menyala di 20 menit pertama
(tidak ada riwayat sebelum kejadian) dan terus menyala 15 menit setelah badai lewat (di
data sungguhan hujan jarang berhenti semendadak di simulasi). Angka yang menentukan adalah
data sungguhan, dan di sana LSTM menang jauh: MCC 0,540 vs 0,226 di OpenRainER.

### 9.6 Badai demo sengaja tidak dibuat lebih kuat

Jaringan 50 tautan ini hanya bisa memisahkan ciri hujan berorde 6 km. Menaikkan `peakMmH`
di `scenario.ts` menaikkan RMSE terburuk melewati 8 mm/jam (puncak 46 → 8,4, puncak 53 → 9,6)
dan membuat angka di bagian ini tidak berlaku lagi. Kalau ambang peringatan perlu muncul di
demo, yang diskalakan adalah ambangnya (`demoScale` di `catchment-config.json`).

### 9.7 Peta hujan pada data operator sungguhan

`ml/hujannet_ml/rainmap.py`, hasil lengkap di [ml/results/rainmap.md](ml/results/rainmap.md).
OpenMRG (364 CML, Gothenburg), dinilai pada 582 sel radar 2 km yang berjarak paling jauh
2 km dari suatu lintasan, uji Agustus 2015. Hujan per tautan ditaksir dari CML saja:
basah/kering CNN, antena basah 1,5 dB, ITU k-alpha.

| RMSE waktu basah (mm/jam) | Masukan dari CML | Masukan sempurna |
|---|---|---|
| IDW, seperti dasbor | 2,75 | 1,59 |
| Ridge tautan → sel, terikat topologi | **2,33** | **1,48** |
| MLP per sel, 8 tautan terdekat + IDW | 2,48 | 1,54 |

- **Sebagian besar galat datang dari taksiran per tautan, bukan dari interpolasi.** Dengan
  hujan per tautan yang sempurna, RMSE turun dari 2,3–2,8 ke 1,5–1,6 untuk ketiga metode.
  Yang paling perlu diperbaiki berikutnya adalah kalibrasi antena basah dan k-alpha.
- MLP mengalahkan IDW dengan masukan dari CML: RMSE 2,48 vs 2,75, CSI ≥ 1 mm/jam
  0,53 vs 0,48. Biasnya negatif (−0,49 mm/jam), jadi puncak hujan masih teredam.
- Ridge paling rendah RMSE-nya, tetapi bobotnya hanya berlaku untuk 364 tautan itu.
  MLP hanya melihat jarak dan hujan tetangga, jadi bisa dipakai pada jaringan dasbor tanpa
  dilatih ulang.

### 9.8 Kalibrasi taksiran per tautan

`ml/hujannet_ml/calibrate.py`, hasil lengkap di [ml/results/calibrate.md](ml/results/calibrate.md).

- **Tautan di bawah 1 km adalah sumber galat utama.** Dengan angka dasbor (ITU, antena
  basah 1,5 dB), tautan ≤ 1 km menaksir 2–10 kali hujan radar dan menyumbang 84 % galat
  kuadrat di OpenMRG, 62 % di OpenRainER. Satu langkah kuantisasi pada lintasan 300 m sudah
  terbaca puluhan mm/jam. Tautan 4 km ke atas sudah hampir tanpa bias tanpa kalibrasi.
- **Meminimalkan RMSE langsung adalah sasaran yang salah.** Hasilnya menyusutkan semua
  taksiran ke 16–26 % total radar, dan akumulasi DAS ikut terlalu rendah. Yang dipakai:
  per WAA, pengali k dipilih supaya total taksiran sama dengan radar di bulan latih.
- Setelah tautan < 1 km dibuang, kalibrasi menurunkan RMSE basah per tautan dari 3,8 ke
  2,7–2,8 mm/jam. Angkanya berbeda per iklim: pengali k 2,8 di Swedia, 2,1 di Italia.
  Angka Swedia yang dipakai di Italia membuat total hujan 31 % terlalu rendah, jadi
  **jaringan Indonesia perlu disetel dengan radar atau penakar Indonesia sendiri.**
- Pada peta OpenMRG (RMSE waktu basah): IDW turun dari 2,75 ke 2,61 setelah tautan pendek
  dibuang, lalu ke 2,41 setelah kalibrasi. MLP 2,48 → 2,45 dan ridge tetap sekitar 2,32.
  Dengan masukan terkalibrasi, keunggulan MLP atas IDW hilang; perbaikan masukan lebih
  berguna daripada interpolator yang lebih pintar.
- Galat masih jauh dari masukan sempurna (1,5–1,6), karena korelasi per tautan hanya
  sekitar 0,5. Itu batas berikutnya.

---

## 10. Cara kerja

```bash
npm install && npm run dev   # http://localhost:3000
npm test                     # butuh Node dengan dukungan TypeScript
npm run build && npm run lint
cd ml && uv sync && uv run pytest
```

- **Commit:** `<tipe>(<lingkup>): <apa>`, dengan tipe `feat`, `fix`, `refactor`, `test`,
  `docs`, `chore`. Contoh: `fix(inverse): perbaiki pembagian nol saat panjang lintasan nol`.
- **Branch:** `feat/<slug>` atau `fix/<slug>`.
- Fungsi di `lib/physics`, `lib/sim`, `lib/inverse`, dan `lib/ml` murni: tanpa efek samping,
  tanpa `Math.random`, karena keacakan memakai `mulberry32` berbenih. Tanpa impor React atau Next.
- Jangan menjalankan pemformat otomatis ke seluruh repo.
