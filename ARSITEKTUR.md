# HujanNet — Arsitektur dan Alur Kerja

> **Panduan.md** mengatur *proses*: aturan git, aturan desain, daftar tugas, skenario demo.
> **Berkas ini** mengatur *kode*: bentuk arsitektur, batas antar modul, kontrak antar orang,
> dan urutan kerja supaya tiga orang bisa jalan bersamaan tanpa saling menimpa.
>
> Kalau dua dokumen ini bertentangan, yang menang adalah berkas ini untuk hal teknis,
> dan Panduan.md untuk hal proses.

Baca bagian 1, 6, dan 7 sebelum menulis kode. Sisanya boleh dibuka saat dibutuhkan.

---

## 0. Kenapa berkas ini ada

Pada hari pertama, dua orang membuat kerangka proyek secara terpisah. Hasilnya 13 berkas
bertabrakan add/add: dua `package.json`, dua `tailwind.config.ts`, dua `lib/types.ts`, dua
`data/links.json` dengan skema id berbeda. Semuanya sudah diselesaikan, tetapi memakan waktu
yang seharusnya dipakai membangun fitur.

Penyebabnya bukan kelalaian. Penyebabnya dokumen lama tidak menyebut tiga hal:

1. siapa yang menyentuh berkas yang dipakai bersama, seperti `package.json`
2. berkas mana yang sudah ada, sehingga orang kedua tahu tidak perlu membuatnya lagi
3. bentuk data di setiap sambungan antar orang, sehingga bisa dibangun tanpa menunggu

Bagian 6 dan 7 berkas ini menutup ketiganya.

---

## 1. Status: apa yang sudah ada, apa yang belum

| Tugas | Pemilik | Status | Bukti |
|---|---|---|---|
| T0 kontrak data dan kerangka | Radit | **selesai** | `lib/types.ts`, `data/`, token Tailwind |
| A1 model ITU-R P.838 | Radit | **selesai** | `lib/physics/itu838.ts`, uji bolak balik |
| A2 simulator medan hujan | Radit | **selesai** | `lib/sim/rainField.ts` |
| A3 model maju | Radit | **selesai** | `lib/sim/forward.ts` |
| A4 model invers | Radit | **selesai** | `lib/inverse/`, 4 kriteria terukur |
| A5 endpoint API simulasi | Radit | **selesai** | `app/api/sim/` |
| C1 akumulasi DAS | Adnan | **selesai** | `lib/catchment/` |
| B1 kerangka tata letak | Sultan | **belum** | — |
| B2 peta dan lintasan tautan | Sultan | **belum** | — |
| B3 lapisan heatmap hujan | Sultan | **belum** | — |
| B4 panel detail tautan | Sultan | **belum** | — |
| B5 perbandingan kebenaran versus rekonstruksi | Sultan | **belum** | — |
| B6 penggeser waktu | Sultan | **belum** | — |
| C2 mesin peringatan | Adnan | **belum** | — |
| C3 panel DAS dan antrean | Adnan + Sultan | **belum** | — |
| C4 panel kerapatan | Adnan | **belum**, P2 | — |

**Jalur pengukuran sudah utuh dari ujung ke ujung.** Artinya Sultan dan Adnan tidak perlu
menunggu apa pun lagi dari sisi fisika: `/api/sim` sudah mengembalikan `Snapshot` yang benar.

Angka mutu kejadian contoh saat ini, bisa dibaca langsung dari `/api/sim/meta`:

| Ukuran | Nilai |
|---|---|
| Akurasi klasifikasi basah kering | 99,6 % |
| RMSE rata rata | 3,41 mm/jam |
| RMSE terburuk satu langkah waktu | 7,44 mm/jam |
| Bias rata rata | +1,57 mm/jam |
| Jarak puncak pada puncak kejadian | 1,15 km |
| Jarak puncak terburuk | 2,73 km |
| Cakupan dalam jangkauan | 74 % |
| Waktu hitung seluruh kejadian | 0,50 detik |

---

## 2. Aliran data, satu arah

Panah hanya ke bawah. Tidak ada modul yang memanggil ke atas, dan tidak ada modul di `lib/`
yang tahu tentang React.

```
data/links.json            data/catchments.geojson + data/catchment-config.json
  50 tautan sintetis                  3 poligon DAS + ambang
        │                                        │
        ▼                                        │
lib/sim/scenario.ts                              │
  EVENT_BBOX, EVENT_GRID, DEMO_STORM             │
  diturunkan dari sebaran menara                 │
        │                                        │
        ▼                                        │
lib/sim/rainField.ts   ── medan hujan sebenarnya │
        │                  GridField, mm/jam     │
        ▼                                        │
lib/physics/itu838.ts  ── gamma = k * R^alpha    │
        │                                        │
        ▼                                        │
lib/sim/forward.ts     ── LinkSample[]           │
        │                  rxPowerDbm berderau   │
        ▼                                        │
lib/inverse/           ── Snapshot               │
        │                  truth, reconstruction,│
        │                  links, rmse           │
        ├────────────────────────────────────────┤
        ▼                                        ▼
app/api/sim/                              lib/catchment/
  GET /api/sim?t=                           CatchmentState[]
  GET /api/sim/meta                         dari Snapshot.reconstruction
  GET /api/sim/link/<id>                           │
        │                                          ▼
        │                                   lib/alerts/  (C2, belum ada)
        │                                     AlertCandidate
        │                                          │
        ▼                                          ▼
                        components/  +  app/page.tsx
                          MapLibre, Recharts, Zustand
```

**Satu aturan yang tidak boleh dilanggar:** `lib/catchment` dan seluruh peringatan memakai
`Snapshot.reconstruction`, **bukan** `Snapshot.truth`. Peringatan harus lahir dari angka yang
benar benar bisa kita hasilkan di dunia nyata. `truth` hanya untuk perbandingan berdampingan
B5 dan untuk menghitung RMSE.

---

## 3. Peta modul: pemilik dan pintu masuk

Kolom "pintu masuk" adalah satu satunya yang perlu dipanggil dari luar modul. Sisanya detail
dalam yang boleh berubah tanpa mengabari siapa pun.

### 3.1 `lib/physics/` — Radit

Fungsi murni, tidak menyimpan keadaan, tidak mengimpor apa pun dari React atau Next.

| Fungsi | Masukan | Keluaran |
|---|---|---|
| `ituCoefficients(freqGHz, pol)` | GHz, `"H"` \| `"V"` | `{ k, alpha }` |
| `specificAttenuation(rainMmH, k, alpha)` | mm/jam | dB/km |
| `rainRateFromAttenuation(attenDb, lengthKm, k, alpha)` | dB, km | mm/jam |
| `freeSpacePathLoss(lengthKm, freqGHz)` | km, GHz | dB |

Tabel koefisien dari ITU-R P.838-3 untuk 10 sampai 40 GHz. Frekuensi di antaranya
diinterpolasi logaritmik pada `k` dan linear pada `alpha`. Tidak ada masukan yang bisa
menghasilkan `NaN`.

### 3.2 `lib/sim/` — Radit

| Berkas | Isi | Pintu masuk |
|---|---|---|
| `geo.ts` | geometri bumi lokal | `distanceKm`, `offsetKm`, `pathSamplePoints` |
| `grid.ts` | geometri grid | `GridSpec`, `cellCenter`, `sampleField`, `fieldMax`, `fieldPeakCenter` |
| `rainField.ts` | sel Gauss bergerak | `rainFieldAt(cfg, t, grid)`, `rainRateAt(cfg, t, at)` |
| `scenario.ts` | **seluruh angka demo** | `EVENT_BBOX`, `EVENT_GRID`, `DEMO_STORM`, `sampleTimes()` |
| `forward.ts` | model maju | `simulateEvent(links)` |
| `random.ts` | PRNG berbenih | `mulberry32`, `gaussian`, `seedOf` |
| `payload.ts` | bentuk JSON API | `findSnapshot`, `buildMeta`, `timeRange` |

`scenario.ts` adalah satu satunya tempat angka penyetelan demo berada. Kalau demo terasa
kurang dramatis atau terlalu ramai, yang diubah berkas itu, bukan kode fisika.

### 3.3 `lib/inverse/` — Radit

Enam langkah, enam berkas, urutannya tetap:

| # | Berkas | Fungsi | Apa yang dikerjakan |
|---|---|---|---|
| 1 | `classify.ts` | `classifyNetwork` | basah atau kering, dua penanda plus korelasi tetangga |
| 2 | `baseline.ts` | `estimateBaseline` | median periode kering pada jendela bergerak |
| 3 | `waa.ts` | `correctWaa` | kurangi redaman antena basah 1,5 dB |
| 4 | `retrieve.ts` | `retrieveRainRate` | balik ke mm/jam lewat A1 |
| 5 | `field.ts` | `buildIdwKernel` + `reconstructField` | sebar ke grid, IDW pangkat 2 |
| 6 | `rmse.ts` | `computeRmse` | bandingkan dengan `truth` |

Pintu masuk gabungan: `reconstructEvent(links, options?) → EventReconstruction`, berisi
`snapshots`, `series` per tautan, dan `diagnostics`.

Model invers **tidak boleh** menyentuh `LinkSample.baselineDb` atau `LinkSample.trueRainMmH`.
Ada uji yang gagal kalau itu terjadi. Keduanya kebenaran dasar yang di lapangan tidak ada.

Bobot IDW hanya bergantung geometri menara, dan geometri tidak berubah sepanjang kejadian.
Karena itu operatornya dibangun sekali menjadi matriks jarang lalu dipakai ulang untuk 241
langkah waktu. Inilah sebabnya seluruh kejadian selesai di bawah satu detik. Jangan diubah
menjadi hitung ulang tiap frame.

### 3.4 `lib/catchment/` — Adnan

| Pintu masuk | Kegunaan |
|---|---|
| `loadCatchmentData()` | baca `catchments.geojson` + `catchment-config.json` |
| `buildRainSeries(frames, catchments, config)` | `frames` = `{ t, field }[]` dari `Snapshot.reconstruction` |
| `catchmentStatesAt(series, tNow, config)` | `CatchmentState[]` |
| `computeMembership(catchment, grid)` | sel grid mana yang ada di dalam poligon |

Sudah diuji cocok dengan grid sekarang: C-01 dapat 70 sel, C-02 70 sel, C-03 116 sel.

### 3.5 `app/api/sim/` — Radit

`store.ts` satu satunya tempat di jalur simulasi yang menyimpan keadaan: kejadian dihitung
sekali pada permintaan pertama, lalu disimpan di memori. Route handler hanya menerjemahkan
parameter menjadi kode status.

### 3.6 `components/` dan `app/page.tsx` — Sultan

Belum ada isinya. Bebas disusun, dengan dua syarat: seluruh aturan Panduan bagian 6, dan
tidak ada pengambilan data selain lewat tiga endpoint di bagian 4 berkas ini.

---

## 4. Kontrak API

Semua di bawah `/api/sim`. Bentuk `Snapshot`, `LinkState`, dan `GridField` persis seperti
`lib/types.ts`.

### `GET /api/sim?t=<detik>`

`t` harus kelipatan 15 antara 0 dan 3600. Bawaan 0 kalau tidak diberikan.

```jsonc
{
  "t": 1800,
  "links": [
    { "linkId": "L-001", "t": 1800, "isWet": true,
      "attenuationDb": 4.212, "estRainMmH": 12.874 }
    // ... 50 tautan
  ],
  "truth":          { "bbox": [106.86, -6.76, 107.06, -6.61], "nx": 40, "ny": 30, "values": [/* 1200 */] },
  "reconstruction": { "bbox": [106.86, -6.76, 107.06, -6.61], "nx": 40, "ny": 30, "values": [/* 1200 */] },
  "rmse": 7.099
}
```

Muatan 8,6 kB pada `t = 0` sampai 16,3 kB pada puncak. Waktu tanggap 3 sampai 6 ms setelah
permintaan pertama, permintaan pertama 0,6 detik karena menghitung seluruh kejadian.

Galat, semuanya 400 dengan pesan yang menyebut rentang sah:

| Permintaan | Balasan |
|---|---|
| `t=9999` | di luar rentang kejadian |
| `t=-5` | di luar rentang kejadian |
| `t=abc` | bukan angka |
| `t=1807` | bukan waktu cuplikan, pakai kelipatan 15 |

### `GET /api/sim/meta`

Dipanggil sekali saat dasbor dimuat. 9,7 kB.

```jsonc
{
  "dataSource": "SIMULASI",       // penanda kejujuran, tampilkan di bilah atas
  "links": [ /* 50 objek Link lengkap, untuk menggambar lintasan */ ],
  "bbox": [106.86, -6.76, 107.06, -6.61],
  "grid": { "nx": 40, "ny": 30 },
  "durationS": 3600,
  "intervalS": 15,
  "times": [0, 15, 30, /* ... */ 3600],
  "diagnostics": {
    "wetDryAccuracy": 0.996, "meanRmse": 3.41, "maxRmse": 7.44,
    "meanBias": 1.57, "coverage": 0.74,
    "peakDistanceAtMaxKm": 1.15, "maxPeakDistanceKm": 2.73
  },
  "computeMs": 501.3
}
```

`bbox` dipakai memusatkan peta. `times` dipakai penggeser waktu B6, jadi tidak perlu
menghitung sendiri kelipatan 15.

### `GET /api/sim/link/<id>`

Deret waktu satu tautan untuk panel detail B4. 21 kB. Semua larik panjangnya 241 dan
sejajar dengan `t`.

```jsonc
{
  "linkId": "L-001",
  "t": [0, 15, /* ... */],
  "rxPowerDbm": [/* garis utama grafik */],
  "baselineEstDb": [/* garis putus putus, ini TAKSIRAN bukan kebenaran dasar */],
  "totalAttenuationDb": [],
  "rainAttenuationDb": [/* setelah koreksi antena basah, area diarsir */],
  "estRainMmH": [/* grafik kedua */],
  "isWet": [],
  "trueRainMmH": [/* kebenaran dasar, hanya untuk pembanding */]
}
```

404 kalau id tidak ada.

---

## 5. Konvensi yang dibekukan

Ubah salah satu dari ini dan pekerjaan orang lain rusak diam diam. Bilang di grup lebih dulu.

| Hal | Nilai | Kenapa penting |
|---|---|---|
| Urutan baris grid | selatan ke utara, `iy = 0` paling selatan | indeks `iy * nx + ix`. Kalau dibalik, peta terbalik dan akumulasi DAS salah sel. Sudah dicatat sebagai `gridRowOrder` di `catchment-config.json` |
| Basis waktu | detik sejak awal kejadian, 0 sampai 3600 | bukan jam dinding, bukan milidetik |
| Langkah waktu | 15 detik, 241 cuplikan | sama dengan laju rekam manajemen jaringan operator |
| Satuan hujan | mm/jam | jangan pernah mm per langkah waktu |
| Satuan daya | dBm untuk tingkat, dB untuk selisih | `rxPowerDbm` tingkat, `attenuationDb` selisih |
| Next dan React | Next 14.2.35, React 18 | jangan naikkan mayor selama sprint |
| Skema id tautan | `L-001` sampai `L-050` | dipakai di state klien dan URL endpoint |
| Skema id DAS | `C-01`, `C-02`, `C-03` | kunci di `catchment-config.json` |
| Palet dan skala jarak | Panduan bagian 6 | skala Tailwind sudah dibatasi ke kelipatan 4px |

Skala Tailwind memang sengaja dipersempit: sudut lebih besar dari `rounded-md` dan seluruh
bayangan sudah dihapus dari tema, jadi `rounded-2xl` dan `shadow-lg` tidak menghasilkan apa
apa. Itu bukan bug.

---

## 6. Aturan menghindari tabrakan

### 6.1 Satu berkas, satu pemilik

| Direktori atau berkas | Pemilik | Orang lain |
|---|---|---|
| `lib/physics/`, `lib/sim/`, `lib/inverse/` | Radit | jangan sentuh |
| `lib/types.ts` | Radit, **dikunci** | usul di grup dulu |
| `app/api/sim/` | Radit | jangan sentuh |
| `tests/physics.test.ts`, `tests/rainField.test.ts`, `tests/forward.test.ts`, `tests/inverse.test.ts`, `tests/simApi.test.ts` | Radit | boleh tambah berkas uji baru dengan nama lain |
| `components/`, `app/page.tsx` | Sultan | jangan sentuh |
| `app/globals.css`, `tailwind.config.ts` | Sultan setelah T0 | Radit hanya kalau token rusak |
| `lib/catchment/`, `lib/alerts/`, `app/api/alerts/`, `prisma/` | Adnan | jangan sentuh |
| `data/` | Adnan | Radit hanya baca |

### 6.2 Berkas yang dipakai bersama: sebut dulu, baru ubah

Berkas berikut dibaca oleh semua orang dan tidak punya pemilik tunggal. **Kirim satu pesan
di grup sebelum mengubahnya, dan gabungkan sebagai commit tersendiri, jangan diselipkan ke
PR fitur.**

- `package.json` dan `package-lock.json`
- `tsconfig.json`
- `next.config.mjs`, `postcss.config.mjs`, `.eslintrc.json`
- `app/layout.tsx`
- `Panduan.md`, `ARSITEKTUR.md`

Ini penyebab terbesar tabrakan kemarin. Dua orang menambah dependensi pada waktu yang sama
menghasilkan `package-lock.json` yang tidak bisa digabung otomatis, dan menyelesaikannya
memerlukan `npm install` ulang, bukan sekadar memilih satu sisi.

### 6.3 Menambah pustaka

Pustaka yang sudah disetujui dan sudah terpasang: `maplibre-gl`, `recharts`, `zustand`,
`@prisma/client`, `prisma`, `tailwindcss`. **Tidak ada tambahan lain tanpa izin di grup.**

Uji berjalan dengan `node --test` memakai pengupasan tipe bawaan Node, jadi **tidak ada
Jest, tidak ada Vitest.** Konsekuensinya: impor antar modul di dalam `lib/` memakai ekstensi
`.ts` eksplisit, misalnya `from "./geo.ts"`. Kalau menulis berkas uji baru, ikuti pola yang
sudah ada di `tests/`.

### 6.4 Jangan pernah dua orang membuat kerangka

Kerangka sudah ada. Jangan menjalankan `create-next-app` lagi untuk alasan apa pun. Kalau
`npm run dev` gagal, itu masalah pemasangan, bukan alasan membuat proyek baru:

```bash
rm -rf node_modules .next && npm install && npm run dev
```

### 6.5 Alur git harian

```bash
# sebelum mulai
git checkout main && git pull

# satu tugas satu cabang
git checkout -b feat/b2-map-links

# ... kerja, commit kecil kecil ...

# sebelum buka PR, WAJIB
git checkout main && git pull
git checkout feat/b2-map-links
git merge main          # selesaikan tabrakan di sini, bukan di GitHub
npm test && npm run build && npm run lint
```

PR yang dibuka tanpa langkah `git merge main` akan menumpuk tabrakan sampai tidak bisa
ditinjau. Cabang yang umurnya lebih dari setengah hari harus digabung ulang dengan `main`
walau belum selesai.

### 6.6 Jangan memformat ulang berkas yang bukan milik sendiri

Menjalankan pemformat otomatis pada seluruh repo membuat diff seratus berkas dan menutupi
perubahan yang sesungguhnya. Format hanya berkas yang sedang dikerjakan.

---

## 7. Apa yang harus dikerjakan sekarang

Jalur pengukuran sudah utuh, jadi **B dan C bisa jalan bersamaan tanpa saling menunggu.**

### 7.1 Sultan — mulai dari B1, lalu B2

Semua yang dibutuhkan sudah tersedia. Urutan yang paling sedikit membuang waktu:

1. **B1 kerangka tata letak.** Bilah atas, peta di tengah, panel kanan 380px. Ambil
   `dataSource` dari `/api/sim/meta` untuk penanda `DATA SIMULASI`. Belum perlu peta
   sungguhan, kotak kosong dulu.
2. **B2 peta dan lintasan.** `meta.links` memberi `siteA` dan `siteB` tiap tautan, `meta.bbox`
   untuk memusatkan peta. Warna garis dari `snapshot.links[i].isWet`, ketebalan dari
   `attenuationDb`.
3. **B3 heatmap.** `snapshot.reconstruction` adalah 1200 nilai baris demi baris, `iy = 0`
   paling selatan. Nol harus benar benar bening. Skala warna bening sampai `--rain` pekat
   pada 60 mm/jam.
4. **B6 penggeser waktu.** Pakai `meta.times` apa adanya. Muat ulang `/api/sim?t=` tiap
   langkah; 3 sampai 6 ms per permintaan, cukup cepat untuk pemutaran 20x.
5. **B4 panel detail.** Satu permintaan ke `/api/sim/link/<id>` memberi seluruh deret. Garis
   dasar digambar sebagai garis putus putus, dan sebutkan bahwa itu **taksiran**.
6. **B5 perbandingan berdampingan.** `snapshot.truth` di kiri, `snapshot.reconstruction` di
   kanan, **skala warna harus sama persis**, RMSE dari `snapshot.rmse`.

Simpan `t` terpilih dan `linkId` terpilih di satu store Zustand. Jangan menyimpan seluruh
`Snapshot` di store, cukup yang sedang ditampilkan.

### 7.2 Adnan — C2, lalu C3

1. **C2 mesin peringatan.** `catchmentStatesAt` dari C1 sudah memberi `status`. Yang belum
   ada: pembuatan `AlertCandidate` saat ambang terlewat, dua endpoint konfirmasi dan
   pengabaian, dan penyimpanan Prisma. Ingat poin tata kelola: **tidak boleh ada jalur kode
   yang menerbitkan peringatan tanpa konfirmasi operator.**
2. **C3 panel DAS dan antrean.** Bagian tampilannya minta gaya ke Sultan supaya tidak
   melahirkan komponen bergaya sendiri.
3. **C4** hanya kalau waktu tersisa.

Sumber hujan untuk akumulasi adalah `Snapshot.reconstruction`, bukan `truth`. Ini akan
ditanya juri.

### 7.3 Radit — penyetelan dan sisa hari kedua

1. Bantu B5, karena itu slide penentu.
2. Dua keputusan terbuka di bagian 8 berkas ini.
3. Setelah pembekuan kode: rekam video cadangan, latihan demo.

---

## 8. Batas yang diketahui dan keputusan terbuka

Sebut apa adanya kalau ditanya juri. Angka yang jujur lebih kuat daripada angka yang mulus.

**8.1 Cakupan dalam jangkauan 74 persen.** Sekitar seperempat sel grid berada di luar
jangkauan pembobotan 2 km dari setiap lintasan, umumnya di tepi kotak batas. Sel itu tetap
diberi taksiran dari tautan terdekat, tetapi diluruhkan dengan hukum 1/d², jadi peta memudar
ke arah tepi. Itu memang keadaan sebenarnya di pinggir jaringan. Justru ini memperkuat
argumen kerapatan: cakupan adalah fungsi dari kerapatan jaringan, dan itu tepat isi C4.

**8.2 Puncak kejadian contoh 40,8 mm/jam, tepat di atas batas bawah kriteria A2.** Jaringan
50 tautan ini membentang 19 x 15 km dengan panjang lintasan 2,2 sampai 7,9 km, jadi ciri
hujan yang bisa dipisahkannya ada di orde 6 km. Badai yang lebih kuat pada jaringan ini
menaikkan RMSE terburuk melewati 8 mm/jam: puncak 46 memberi 8,4 dan puncak 53 memberi 9,6.

Keputusan terbuka: kalau demo dirasa perlu badai yang lebih dramatis, jalan yang benar
**bukan** menaikkan `peakMmH` di `scenario.ts`, melainkan menambah satu lintasan penghalusan
proyeksi balik di atas medan IDW. Itu tugas terpisah dan harus ditinjau sendiri. Menaikkan
`peakMmH` saja akan membuat angka RMSE yang kita sebutkan tidak lagi benar.

**8.3 Bias +1,57 mm/jam.** Rekonstruksi sedikit berlebih secara rata rata. Sebabnya proses
rata rata sepanjang lintasan: satu tautan hanya memberi satu bilangan, dan menyebarkannya ke
sekitar lintasan membuat medan lebih rata daripada aslinya, terlalu rendah di puncak dan
terlalu tinggi di sekelilingnya. Ini watak persoalan invers integral garis, bukan bug.

**8.4 `lib/catchment/` memakai impor tanpa ekstensi**, jadi modul itu tidak bisa dijalankan
langsung oleh `node --test`. Berjalan normal di dalam Next. Kalau Adnan mau menulis uji
otomatis, ekstensinya perlu ditambahkan lebih dulu.

---

## 9. Perintah harian

```bash
npm install          # sekali, atau setelah package.json berubah
npm run dev          # http://localhost:3000
npm test             # 49 uji, sekitar 3 detik
npm run build        # wajib hijau sebelum PR
npm run lint         # wajib bersih sebelum PR
```

Memeriksa API dengan cepat:

```bash
curl -s "http://localhost:3000/api/sim/meta" | head -c 300
curl -s "http://localhost:3000/api/sim?t=1800" | head -c 300
curl -i -s "http://localhost:3000/api/sim?t=9999" | head -1
```
