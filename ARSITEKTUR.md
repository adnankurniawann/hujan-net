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
| `lib/ml/` | `fitLinearOperator`, `applyLinearOperator`, `loadOperator` | operator ridge, bobot di `data/ml-operator.json` |
| `lib/catchment/` | `loadCatchmentData`, `buildRainSeries`, `catchmentStatesAt` | C-01 70 sel, C-02 70, C-03 116 |
| `lib/alerts/` | `detectCandidates`, penyimpanan Prisma | konfirmasi/abaikan lewat API |
| `lib/evacuation/` | `lookupRoute`, `sampleRainAt` | |

Model invers **tidak boleh** membaca `LinkSample.baselineDb` atau `trueRainMmH`.
Keduanya kebenaran dasar yang tidak ada di lapangan, dan ada uji yang gagal kalau
dilanggar.

Bobot IDW hanya bergantung geometri, jadi dibangun sekali sebagai matriks jarang lalu
dipakai ulang untuk 241 langkah waktu. Satu kejadian selesai di bawah satu detik.

`data/ml-operator.json` terikat ke topologi `data/links.json`. Kalau topologinya berubah,
latih ulang dengan `node scripts/train-operator.ts`.

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

1. **Basah/kering**: ragam jangka pendek di atas 0,6 dB (jendela 21 cuplikan, hanya menoleh
   ke belakang) atau selisih tingkat di atas 0,9 dB, ditambah konsistensi tetangga dalam
   radius 6 km. **Ambang tangan, bukan model belajar.**
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

Angka dari repo pada 11 Agustus 2026, kejadian demo.

| Ukuran | Nilai |
|---|---|
| RMSE rata-rata / terburuk | 3,41 / 7,44 mm/jam |
| Bias | +1,57 mm/jam |
| POD / FAR / CSI basah-kering | 99,99 % / 0,45 % / 99,54 % |
| Galat posisi puncak (puncak / terburuk) | 1,15 / 2,73 km |
| Cakupan grid dalam jangkauan IDW | 74 % |

### 9.1 Hampir semua galat berasal dari IDW

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

### 9.5 Badai demo sengaja tidak dibuat lebih kuat

Jaringan 50 tautan ini hanya bisa memisahkan ciri hujan berorde 6 km. Menaikkan `peakMmH`
di `scenario.ts` menaikkan RMSE terburuk melewati 8 mm/jam (puncak 46 → 8,4, puncak 53 → 9,6)
dan membuat angka di bagian ini tidak berlaku lagi. Kalau ambang peringatan perlu muncul di
demo, yang diskalakan adalah ambangnya (`demoScale` di `catchment-config.json`).

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
