
# HujanNet Dashboard — Panduan Kerja Tim

> Dokumen ini mengatur **proses**: lingkup, aturan git, aturan desain, daftar tugas, skenario demo.
> Setiap orang dan setiap agen **wajib membaca bagian 1 sampai 6** sebelum menulis satu baris kode.
>
> Untuk hal **teknis** — bentuk arsitektur, kontrak API, batas antar modul, status tiap tugas,
> dan aturan menghindari tabrakan berkas — lihat **[ARSITEKTUR.md](ARSITEKTUR.md)**.
> Kalau keduanya bertentangan soal kode, ARSITEKTUR.md yang menang, karena isinya diambil dari
> keadaan repo yang sekarang.
>
> **Status singkat:** T0, A1 sampai A5, dan C1 sudah selesai dan tergabung. Jalur pengukuran
> sudah utuh dari ujung ke ujung, jadi seluruh tugas B dan C berikutnya bisa jalan bersamaan
> tanpa menunggu apa pun. Rinciannya di ARSITEKTUR.md bagian 1.

---

## 0. Apa yang kita bangun

Dasbor operator yang memperagakan satu klaim: **redaman sinyal antar menara telekomunikasi dapat dibaca sebagai peta curah hujan resolusi tinggi, tanpa memasang sensor baru.**

Pada fase ini kita **tidak memakai data operator asli**. Kita membangun simulator yang menghasilkan medan hujan sintetis, menurunkan redaman tiap tautan dari medan itu memakai fisika ITU-R P.838, lalu **membalik arahnya** untuk merekonstruksi peta hujan.

Inilah inti demonstrasinya, dan ini yang dinilai juri:

```
medan hujan sebenarnya  →  redaman tiap tautan  →  rekonstruksi kita
      (simulasi)              (model maju)          (model invers)
         └──────────── dibandingkan berdampingan ────────────┘
```

Kalau rekonstruksi menyerupai medan aslinya, kita membuktikan metodenya bekerja tanpa perlu satu byte pun data Telkomsel. Dan karena kita punya kebenaran dasarnya, kita bisa menampilkan **angka galat**, sesuatu yang tidak bisa dilakukan tim yang cuma memakai data acak.

**Label kejujuran:** setiap tampilan yang memakai data simulasi wajib memuat penanda `DATA SIMULASI` yang terlihat jelas. Ini bukan kelemahan, ini yang membuat juri percaya pada sisa presentasi kita.

---

## 1. Keputusan lingkup

### 1.1 Yang DIBANGUN

| Prioritas | Fitur | Kenapa ada |
|---|---|---|
| P0 | Peta dengan lintasan tautan dan lapisan heatmap hujan hasil rekonstruksi | Ini produknya. Tanpa ini tidak ada apa apa |
| P0 | Simulator medan hujan bergerak, dengan model maju ke redaman tiap tautan | Sumber seluruh data. Membuktikan kita paham fisikanya dua arah |
| P0 | Panel detail satu tautan: deret waktu daya terima, garis dasar, redaman, hasil inversi | Bukti fisis untuk juri peneliti |
| P0 | Perbandingan berdampingan: medan asli versus rekonstruksi, plus RMSE | Pembeda utama kita dari tim lain |
| P1 | Akumulasi hujan per Daerah Aliran Sungai dan ambang batas | Menyambungkan hujan ke banjir |
| P1 | Antrean rekomendasi peringatan dengan konfirmasi operator | Tata kelola. Sistem tidak pernah menyiarkan sendiri |
| P1 | Pemutar ulang kejadian, penggeser waktu | Supaya demo bisa dijalankan berulang tanpa menunggu |
| P2 | Panel perbandingan kerapatan: penakar hujan versus tautan | Slide celah, versi interaktif |
| P2 | Penanda status basah atau kering per tautan | Memperlihatkan lapisan klasifikasi |

### 1.2 Yang SENGAJA TIDAK DIBANGUN

Baca daftar ini baik baik. Semuanya ada di Noah.ai, dan justru karena itu **kita tidak membuatnya.**

| Tidak dibangun | Alasan |
|---|---|
| Analisis CCTV, deteksi objek | Lapisan orang lain. Menambah ini membuat kita jadi Noah.ai versi lebih buruk |
| Rute evakuasi, daftar pengungsian | Sama. Sudah ada yang mengerjakan |
| Langganan SMS, notifikasi warga | Kita bukan lapisan distribusi. Secara hukum juga bukan kewenangan kita |
| Laporan warga | Bukan lapisan kita |
| Chatbot LLM | Ini jebakan "AI generik" yang justru tidak disukai BRIN |
| Agregasi berita, data gempa, widget cuaca dan kualitas udara | Hiasan. Memakan waktu, tidak menambah nilai |
| Login, peran pengguna, manajemen akun | Nol nilai untuk demo 5 menit |
| Model hidrologi, prediksi kedalaman genangan | Di luar lingkup, dan kita nyatakan begitu di proposal |

**Prinsipnya:** kekuatan Noah.ai adalah integrasi, kekuatan kita adalah pengukuran. Kalau kita menambah fitur integrasi, kita bertanding di lapangan mereka dan satu satunya hal yang hanya kita punya jadi tenggelam.

Kalau ada yang bertanya "kenapa tidak ada fitur X", jawabannya sudah disiapkan di bagian 11.

---

## 2. Arsitektur dan tumpukan teknologi

Satu repo, satu bahasa. Tidak ada layanan Python terpisah, karena 2 hari terlalu pendek untuk mengurus dua runtime.

Versi yang **sudah terpasang dan dipatok**. Jangan naikkan versi mayor selama sprint.

| Lapisan | Pilihan |
|---|---|
| Kerangka | Next.js **14.2.35** App Router, React **18**, TypeScript strict |
| Gaya | Tailwind CSS 3.4 |
| Peta | MapLibre GL JS 6 dengan ubin dasar gratis |
| Grafik | Recharts 3 |
| State klien | Zustand 5 |
| Basis data | SQLite melalui Prisma 6, hanya untuk log peringatan dan kejadian tersimpan |
| Fisika dan simulasi | Modul TypeScript murni di `lib/physics`, `lib/sim`, `lib/inverse` |
| Uji | `node --test` bawaan Node, **tanpa Jest, tanpa Vitest** |

**Aturan penting:** modul fisika harus **fungsi murni tanpa efek samping** dan tidak boleh mengimpor apa pun dari React atau Next. Ini supaya bisa diuji sendiri dan supaya nanti mudah dipindah ke layanan terpisah.

Karena uji dijalankan `node --test` langsung atas berkas TypeScript, **impor antar modul di dalam `lib/` memakai ekstensi `.ts` eksplisit**, misalnya `from "./geo.ts"`. Itu disengaja, bukan kekeliruan.

Isi repo sekarang. Tanda ✅ berarti sudah ada, ⬜ berarti belum dibuat.

```
app/
  page.tsx                  ✅ MILIK SULTAN   halaman sementara, diganti pada B1
  layout.tsx                ✅ DIPAKAI BERSAMA  sebut di grup dulu
  globals.css               ✅ MILIK SULTAN   token Panduan bagian 6 sudah terpasang
  api/
    sim/route.ts            ✅ MILIK RADIT    GET /api/sim?t=
    sim/meta/route.ts       ✅ MILIK RADIT    GET /api/sim/meta
    sim/link/[id]/route.ts  ✅ MILIK RADIT    GET /api/sim/link/<id>, untuk B4
    sim/store.ts            ✅ MILIK RADIT    simpanan kejadian di memori
    alerts/                 ⬜ MILIK ADNAN    C2
components/
  map/ panels/ ui/          ⬜ MILIK SULTAN
lib/
  types.ts                  ✅ MILIK RADIT, DIKUNCI
  physics/itu838.ts         ✅ MILIK RADIT    A1
  sim/                      ✅ MILIK RADIT    A2, A3, dan seluruh angka demo di scenario.ts
  inverse/                  ✅ MILIK RADIT    A4, enam langkah enam berkas
  catchment/                ✅ MILIK ADNAN    C1
  alerts/                   ⬜ MILIK ADNAN    C2
data/
  links.json                ✅ MILIK ADNAN    50 tautan, id L-001 sampai L-050
  catchments.geojson        ✅ MILIK ADNAN    3 poligon, C-01 sampai C-03
  catchment-config.json     ✅ MILIK ADNAN    ambang per DAS per jendela
prisma/schema.prisma        ✅ MILIK ADNAN
tests/                      ✅ MILIK RADIT    49 uji, lima berkas
ARSITEKTUR.md               ✅ DIPAKAI BERSAMA  arsitektur, kontrak API, aturan tabrakan
```

Rincian pintu masuk tiap modul dan bentuk balasan tiap endpoint ada di
[ARSITEKTUR.md](ARSITEKTUR.md) bagian 3 dan 4.

---

## 3. Kontrak data

**Ini ditulis Radit pada tugas T0 dan dikunci.** Setelah T0 digabung, siapa pun yang ingin mengubah `lib/types.ts` harus bilang di grup dulu, karena semua orang membangun di atasnya.

```ts
// lib/types.ts

export type Coord = { lat: number; lon: number };

export interface Link {
  id: string;
  siteA: Coord;
  siteB: Coord;
  lengthKm: number;
  freqGHz: number;              // rentang tropis realistis: 15 sampai 23
  polarization: "H" | "V";
  txPowerDbm: number;
}

export interface LinkSample {
  linkId: string;
  t: number;                    // detik sejak awal kejadian
  rxPowerDbm: number;           // sudah termasuk derau dan kuantisasi
  baselineDb: number;           // kebenaran dasar, hanya untuk evaluasi
  trueRainMmH: number;          // kebenaran dasar rata rata lintasan
}

export interface LinkState {
  linkId: string;
  t: number;
  isWet: boolean;               // hasil klasifikasi
  attenuationDb: number;        // A_hujan setelah koreksi
  estRainMmH: number;           // hasil inversi
}

export interface GridField {
  bbox: [number, number, number, number];  // [lonMin, latMin, lonMax, latMax]
  nx: number;
  ny: number;
  values: number[];             // panjang nx*ny, mm/jam, urutan baris demi baris
}

export interface Snapshot {
  t: number;
  links: LinkState[];
  truth: GridField;             // medan simulasi
  reconstruction: GridField;    // hasil rekonstruksi kita
  rmse: number;
}

export interface CatchmentState {
  id: string;
  name: string;
  accum1h: number;              // mm
  accum3h: number;
  accum6h: number;
  thresholdMm: number;
  status: "normal" | "waspada" | "siaga";
}

export type AlertStatus = "menunggu" | "dikonfirmasi" | "diabaikan";

export interface AlertCandidate {
  id: string;
  catchmentId: string;
  raisedAt: number;
  accumMm: number;
  thresholdMm: number;
  status: AlertStatus;
  confirmedBy?: string;
  confirmedAt?: number;
}
```

---

## 4. Pembagian wilayah file

Ini yang mencegah tiga agen saling menimpa pekerjaan.

| Orang | Direktori yang boleh diubah | Tidak boleh menyentuh |
|---|---|---|
| **Radit** | `lib/physics/`, `lib/sim/`, `lib/inverse/`, `lib/types.ts`, `app/api/sim/`, `tests/` | `components/`, `data/`, `lib/catchment/` |
| **Sultan** | `components/`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts` | `lib/`, `data/`, `app/api/` |
| **Adnan** | `lib/catchment/`, `lib/alerts/`, `app/api/alerts/`, `prisma/`, `data/` | `lib/physics/`, `lib/sim/`, `lib/inverse/`, `components/` |

Kalau butuh perubahan di wilayah orang lain, **jangan diubah sendiri**. Buat issue atau bilang di grup. Satu konflik gabungan bisa memakan satu jam, dan kita cuma punya dua hari.

### 4.1 Berkas yang dipakai bersama

Berkas berikut **tidak punya pemilik tunggal** dan dibaca semua orang. Kirim satu pesan di grup
sebelum mengubahnya, dan gabungkan sebagai commit tersendiri, jangan diselipkan ke PR fitur:

`package.json` · `package-lock.json` · `tsconfig.json` · `next.config.mjs` ·
`postcss.config.mjs` · `.eslintrc.json` · `app/layout.tsx` · `Panduan.md` · `ARSITEKTUR.md`

Inilah penyebab tabrakan terbesar hari pertama: dua orang menambah dependensi pada waktu yang
sama, dan `package-lock.json` yang bertabrakan tidak bisa diselesaikan dengan memilih satu
sisi, harus `npm install` ulang.

### 4.2 Kerangka proyek sudah ada, jangan dibuat lagi

Jangan menjalankan `create-next-app` untuk alasan apa pun. Kalau `npm run dev` gagal, itu
masalah pemasangan:

```bash
rm -rf node_modules .next && npm install && npm run dev
```

### 4.3 Catatan tentang `data/`

`data/` adalah wilayah Adnan. Tugas T0 memang menyuruh Radit membuat `links.json` dan
`catchments.geojson` sebagai isi awal, dan sesudah itu kepemilikannya pindah ke Adnan. Radit
hanya membaca. `lib/sim/scenario.ts` menurunkan kotak batas dan grid dari sebaran menara di
`links.json`, jadi **kalau topologi tautan berubah, kabari Radit** karena seluruh angka mutu
rekonstruksi ikut berubah.

Aturan tabrakan yang lebih rinci, termasuk alur git harian, ada di
[ARSITEKTUR.md](ARSITEKTUR.md) bagian 6.

---

## 5. Aturan Git

### Format nama branch

```
feat/<kode-tugas>-<slug-singkat>
```

Contoh nyata:

```
feat/t0-data-contracts
feat/a1-itu-p838-model
feat/a2-rain-field-simulator
feat/b1-map-shell
feat/c1-catchment-accumulation
fix/b3-heatmap-opacity
```

Aturannya:

- **Satu fitur, satu branch, satu PR.** Jangan menumpuk dua fitur di satu branch.
- Selalu bercabang dari `main` yang terbaru: `git checkout main && git pull && git checkout -b feat/...`
- Jangan pernah dorong langsung ke `main`.
- Sebelum membuka PR, gabungkan `main` terbaru ke branch kalian dan pastikan tidak ada konflik.

### Format pesan commit

```
<tipe>(<lingkup>): <apa yang dilakukan>
```

Tipe yang dipakai: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

```
feat(physics): tambah tabel koefisien k dan alpha ITU-R P.838
feat(map): render lintasan tautan sebagai garis di MapLibre
fix(inverse): perbaiki pembagian nol saat panjang lintasan nol
test(physics): uji inversi mengembalikan intensitas hujan masukan
```

### Format PR

Judul PR sama dengan nama branch tanpa awalan. Isi badan PR dengan ini:

```markdown
## Apa
Satu kalimat.

## Kode tugas
T0 / A1 / B2 / C3

## Kriteria diterima
- [ ] salin dari daftar tugas di bawah
- [ ] semuanya tercentang

## Cara menguji
Langkah persis untuk memverifikasi.

## Tangkapan layar
Wajib untuk semua perubahan yang terlihat di layar.
```

### Aturan untuk agen

Kalau kalian memakai agen AI untuk mengerjakan tugas:

1. **Berikan agen seluruh isi blok tugasnya**, jangan hanya judulnya.
2. Sertakan `lib/types.ts` sebagai konteks.
3. Tegaskan ke agen: dilarang membuat berkas di luar direktori milik kalian.
4. Tegaskan juga: dilarang menambah pustaka baru tanpa izin. Setiap pustaka tambahan adalah risiko yang tidak sempat kita uji.
5. **Selalu baca sendiri kode yang dihasilkan sebelum commit.** Kalau kalian tidak bisa menjelaskan satu fungsi ke juri, fungsi itu tidak boleh masuk.

---

## 6. Panduan desain

Radit sudah bilang: jangan terlihat seperti hasil vibe coding. Karena itu, ini bukan saran, ini aturan.

> **Revisi terang (30 Juli).** Bagian ini ditulis ulang mengikuti kulit yang
> benar-benar dikirim. Versi sebelumnya menjelaskan konsol gelap biru-kehijauan,
> sedangkan yang berjalan sekarang adalah konsol terang. Nama tokennya tetap
> sama, nilainya yang berganti. Dokumen ini menyusul kode, bukan sebaliknya —
> aturan yang tidak menggambarkan barangnya bukan aturan, cuma harapan.

### Kenapa terang

Dipilih dari tempat pemakaian, bukan dari kebiasaan kategori: ruang operasi BPBD
pada siang hari, dan aula juri dengan lampu menyala dan proyektor. Tema gelap
luntur pada dua-duanya.

### Palet

```css
--bg:        #e4ebf2   /* latar ruang, siang mendung */
--bg-deep:   #d3dce6   /* latar terluar */
--shell:     #f7fafc   /* jendela konsol */
--surface:   #ffffff   /* kartu dan panel */
--surface-2: #f2f6fa
--surface-3: #e8eef5   /* dasar kanvas medan */
--border:    rgba(15, 32, 51, 0.12)
--text:      #0f2033
--text-mute: #47617a
--text-dim:  #546a7e
--rain:      #1f6fd0   /* skala hujan, biru */
--signal:    #b8720d   /* aksen sinyal dan redaman, ambar */
--alert:     #c33f26   /* status siaga */
--ok:        #0d7d64
```

Dua warna aksen data saja: `--rain` untuk besaran cuaca yang disimpulkan, dan
`--signal` untuk besaran yang diukur radio. `--alert` dan `--ok` adalah status,
bukan hiasan. Kalau ada yang menambah warna kelima, hapus.

**`--violet` sudah dihapus dan tidak boleh kembali.** Warna itu dulu dipakai
untuk keadaan "kontrol aktif" supaya tidak bertabrakan dengan warna data —
lalu ia bocor menjadi isian radar, busur pengukur, dan batang waktu, sehingga
berarti "kendali" sekaligus "data". Warna yang berarti dua hal tidak berarti
apa-apa. Keadaan aktif sekarang memakai tinta (`--text`), yang memang bukan
besaran apa pun.

Setiap warna teks pada palet ini sudah diperiksa terhadap keempat latar kartu
dan lulus WCAG AA (>= 4,5:1). Kalau menambah warna teks baru, periksa dulu.

### Tipografi

- Antarmuka: **Inter**
- Semua angka, satuan, ID tautan, koordinat: **JetBrains Mono**

Aturan yang tidak boleh dilanggar: **setiap angka memakai monospace.** Ini satu perubahan kecil yang langsung membuat tampilan terasa seperti perkakas teknik, bukan seperti templat.

### Skala jarak

Hanya boleh memakai kelipatan 4px: `4, 8, 12, 16, 24, 32, 48`. Setengah langkah
(2, 6, 10, 14) ada di `tailwind.config.ts` untuk jarak dalam komponen rapat
seperti pil dan keping; jangan dipakai untuk jarak antar bagian. Tidak ada
`13px`, tidak ada `17px`.

### Kaca: bahan, bukan hiasan

Larangan "efek kaca buram" dicabut, dan diganti aturan yang lebih ketat, karena
produk ini memang membaca cuaca lewat kaca:

**Kelas `.glass` hanya boleh dipakai kalau yang ada di belakangnya peta atau
kanvas medan hujan.** Di atas warna rata ia bukan kaca, cuma kabur. Saat ini ia
dipakai tepat di tiga tempat: keping statistik di atas peta, legenda hujan, dan
kendali zum MapLibre. Kerangka konsol dan semua kartu memakai kertas buram.

Yang membedakannya dari kaca hasil generate: saturasi latar dinaikkan (kaca
basah memekatkan warna di baliknya), sorot satu piksel di tepi atas, bayangan
kontak berarah, dan buram yang kecil serta seragam — setebal jendela, bukan
kabut.

### Yang dilarang

Daftar ini spesifik karena semuanya adalah ciri khas tampilan hasil generate:

- Gradien latar berwarna dan blob berwarna. Satu sapuan langit vertikal di
  `body::before` adalah satu-satunya gradien latar yang boleh ada
- `.glass` di atas apa pun selain peta dan kanvas medan
- Radius lebih besar dari 14px. Skala radius berhenti di `rounded-xl` = 14px
- Emoji di dalam antarmuka
- Bayangan berwarna dan pendar tanpa offset. Semua bayangan memakai tinta
  `rgba(15,32,51,...)` dengan offset dan sebaran
- Animasi masuk pada setiap elemen. Gerakan hanya untuk hal yang memang berubah, misalnya sel hujan yang bergeser
- Kartu statistik besar berjejer tanpa fungsi
- Ikon dekoratif yang tidak menjelaskan apa apa
- Menampilkan metrik yang sama dalam lebih dari dua encoding di satu layar

### Yang dianjurkan

- Kepadatan informasi tinggi. Ini konsol operator, bukan halaman pemasaran
- Garis pemisah tipis satu piksel, bukan bayangan
- Label kecil huruf kapital dengan jarak huruf renggang untuk judul bagian
- Satuan selalu ditulis: `dB`, `mm/jam`, `GHz`, `km`
- Keadaan kosong dan keadaan memuat dibuat serius, jangan diisi lelucon
- Metrik yang tidak terdefinisi ditulis `—`, bukan `0` dan bukan `100 %`

---

## 7. Daftar tugas

Setiap blok di bawah dirancang untuk bisa disalin langsung sebagai perintah ke agen.

---

### T0 — Kontrak data dan kerangka proyek
**Branch:** `feat/t0-data-contracts` · **Pemilik:** Radit · **Menghambat semua tugas lain**

> ✅ **SELESAI dan sudah tergabung ke `main`.** kerangka Next.js, `lib/types.ts`, token desain.
> Jangan dikerjakan ulang. Rinciannya di [ARSITEKTUR.md](ARSITEKTUR.md).

Buat proyek Next.js dengan TypeScript dan Tailwind. Tulis `lib/types.ts` persis seperti bagian 3 dokumen ini. Buat `data/links.json` berisi 40 sampai 60 tautan sintetis di sekitar kotak batas hulu Ciliwung, dengan panjang 2 sampai 8 km, frekuensi 15 sampai 23 GHz, arah acak. Buat `data/catchments.geojson` berisi 3 poligon DAS sederhana. Terapkan token warna dan tipografi bagian 6 ke `globals.css` dan `tailwind.config.ts`.

**Kriteria diterima**
- [ ] `npm run dev` berjalan tanpa galat
- [ ] `lib/types.ts` lengkap dan diekspor
- [ ] `data/links.json` berisi minimal 40 tautan dengan bidang lengkap sesuai antarmuka `Link`
- [ ] `data/catchments.geojson` valid dan bisa dibuka di geojson.io
- [ ] Token warna tersedia sebagai kelas Tailwind
- [ ] Halaman kosong menampilkan latar `--bg` dengan teks monospace percobaan

---

### A1 — Model ITU-R P.838
**Branch:** `feat/a1-itu-p838-model` · **Pemilik:** Radit · **Butuh:** T0

> ✅ **SELESAI dan sudah tergabung ke `main`.** `lib/physics/itu838.ts`, uji bolak balik galat di bawah 0,01.
> Jangan dikerjakan ulang. Rinciannya di [ARSITEKTUR.md](ARSITEKTUR.md).

Implementasikan `lib/physics/itu838.ts`.

```ts
export function ituCoefficients(freqGHz: number, pol: "H" | "V"): { k: number; alpha: number };
export function specificAttenuation(rainMmH: number, k: number, alpha: number): number; // dB/km
export function rainRateFromAttenuation(attenDb: number, lengthKm: number, k: number, alpha: number): number; // mm/jam
export function freeSpacePathLoss(lengthKm: number, freqGHz: number): number; // dB
```

Tabel koefisien disalin dari Rekomendasi ITU-R P.838-3 untuk 10, 12, 15, 18, 20, 25, 30, 35, 40 GHz, polarisasi H dan V. Untuk frekuensi di antaranya, pakai interpolasi logaritmik pada k dan interpolasi linear pada alpha. Sertakan komentar sumber di atas tabel.

**Kriteria diterima**
- [ ] `tests/physics.test.ts` membuktikan bolak balik: `rainRateFromAttenuation(specificAttenuation(R,k,a) * L, L, k, a)` mengembalikan `R` dengan galat di bawah 0,01
- [ ] Pada 20 GHz, curah hujan 25 mm/jam menghasilkan redaman spesifik dalam rentang wajar 1 sampai 4 dB/km
- [ ] Panjang lintasan nol atau redaman negatif tidak menghasilkan `NaN`
- [ ] Setiap fungsi punya komentar satuan pada parameter dan nilai kembalian

---

### A2 — Simulator medan hujan
**Branch:** `feat/a2-rain-field-simulator` · **Pemilik:** Radit · **Butuh:** T0

> ✅ **SELESAI dan sudah tergabung ke `main`.** `lib/sim/rainField.ts`, puncak 40,8 mm/jam pada t = 1800.
> Jangan dikerjakan ulang. Rinciannya di [ARSITEKTUR.md](ARSITEKTUR.md).

Implementasikan `lib/sim/rainField.ts`. Medan hujan dibangun dari 2 sampai 4 sel Gauss yang bergerak.

```ts
export interface RainCell { lat: number; lon: number; radiusKm: number; peakMmH: number; }
export interface StormConfig { cells: RainCell[]; windBearingDeg: number; windSpeedKmh: number; }
export function rainFieldAt(cfg: StormConfig, t: number, grid: GridSpec): GridField;
```

Sel bergeser mengikuti vektor angin seiring `t`. Intensitas puncak naik lalu turun mengikuti amplop waktu, supaya kejadiannya punya awal, puncak, dan akhir.

**Kriteria diterima**
- [ ] Pada `t = 0` medan bernilai nol atau mendekati nol di seluruh grid
- [ ] Ada `t` di mana intensitas puncak berada di rentang 40 sampai 90 mm/jam
- [ ] Posisi sel bergeser secara konsisten sesuai arah dan kecepatan angin
- [ ] Fungsi murni, hasil sama untuk masukan sama

---

### A3 — Model maju: dari medan hujan ke redaman tautan
**Branch:** `feat/a3-forward-model` · **Pemilik:** Radit · **Butuh:** A1, A2

> ✅ **SELESAI dan sudah tergabung ke `main`.** `lib/sim/forward.ts`, 50 tautan kali 241 cuplikan.
> Jangan dikerjakan ulang. Rinciannya di [ARSITEKTUR.md](ARSITEKTUR.md).

Implementasikan `lib/sim/forward.ts`. Untuk setiap tautan, cuplik medan hujan pada 20 titik sepanjang lintasan, hitung redaman spesifik di tiap titik, integrasikan sepanjang lintasan, lalu tambahkan gangguan realistis:

- Garis dasar yang menyimpang perlahan, orde 0,5 dB per jam
- Redaman antena basah konstan 1,5 dB saat basah
- Derau Gauss 0,2 dB
- Kuantisasi ke kelipatan 0,3 dB
- Cuplikan tiap 15 detik

**Kriteria diterima**
- [ ] Menghasilkan larik `LinkSample` untuk seluruh tautan pada rentang waktu kejadian
- [ ] Tautan yang jauh dari sel hujan menunjukkan redaman mendekati nol, hanya derau
- [ ] Tautan yang dilewati sel hujan menunjukkan penurunan daya terima yang jelas
- [ ] Nilai `trueRainMmH` tersimpan sebagai kebenaran dasar untuk evaluasi

---

### A4 — Model invers: dari redaman ke peta hujan
**Branch:** `feat/a4-inverse-reconstruction` · **Pemilik:** Radit · **Butuh:** A3

> ✅ **SELESAI dan sudah tergabung ke `main`.** `lib/inverse/`, akurasi 99,6 %, RMSE 3,41 mm/jam, 0,50 detik.
> Jangan dikerjakan ulang. Rinciannya di [ARSITEKTUR.md](ARSITEKTUR.md).

Implementasikan `lib/inverse/`. Enam langkah, masing masing fungsi terpisah:

1. `classifyWetDry` — jendela bergerak, ambang berdasarkan simpangan baku, ditambah pemeriksaan korelasi dengan tautan tetangga
2. `estimateBaseline` — median periode kering pada jendela bergerak
3. `correctWaa` — kurangi konstanta redaman antena basah
4. `retrieveRainRate` — panggil `rainRateFromAttenuation` dari A1
5. `reconstructField` — sebarkan nilai rata rata lintasan ke 20 titik sepanjang lintasan, lalu interpolasi ke grid memakai inverse distance weighting dengan pangkat 2
6. `computeRmse` — bandingkan hasil rekonstruksi dengan `truth`

Kembalikan `Snapshot` lengkap.

**Kriteria diterima**
- [ ] Akurasi klasifikasi basah kering di atas 85 persen terhadap kebenaran dasar
- [ ] RMSE rekonstruksi di bawah 8 mm/jam pada kejadian contoh
- [ ] Posisi puncak hasil rekonstruksi berjarak kurang dari 5 km dari puncak sebenarnya
- [ ] Berjalan untuk seluruh rentang waktu dalam waktu di bawah 2 detik

---

### A5 — Endpoint API simulasi
**Branch:** `feat/a5-sim-api` · **Pemilik:** Radit · **Butuh:** A4

> ✅ **SELESAI dan sudah tergabung ke `main`.** `app/api/sim/`, 3 sampai 6 ms setelah pemanasan.
> Jangan dikerjakan ulang. Rinciannya di [ARSITEKTUR.md](ARSITEKTUR.md).

`GET /api/sim?t=<detik>` mengembalikan satu `Snapshot`. `GET /api/sim/meta` mengembalikan daftar tautan, kotak batas, dan durasi kejadian. Hasil simulasi dihitung sekali lalu disimpan di memori, jangan dihitung ulang tiap permintaan.

**Kriteria diterima**
- [ ] Waktu tanggap di bawah 100 ms setelah pemanasan pertama
- [ ] Bentuk JSON persis sesuai antarmuka `Snapshot`
- [ ] `t` di luar rentang dikembalikan dengan kode 400 dan pesan yang jelas

---

### B1 — Kerangka tata letak dasbor
**Branch:** `feat/b1-dashboard-shell` · **Pemilik:** Sultan · **Butuh:** T0

Tata letak tiga bagian: bilah atas ramping, peta besar di tengah, panel kanan selebar 380px. Terapkan seluruh aturan bagian 6. Bilah atas memuat nama sistem, jam simulasi, dan penanda `DATA SIMULASI`.

**Kriteria diterima**
- [ ] Tidak ada gradien, blob, efek kaca, atau emoji
- [ ] Seluruh angka memakai JetBrains Mono
- [ ] Jarak antar elemen hanya kelipatan 4px
- [ ] Penanda `DATA SIMULASI` selalu terlihat
- [ ] Tampil rapi pada lebar 1440px, tidak perlu responsif untuk ponsel

---

### B2 — Peta dan lintasan tautan
**Branch:** `feat/b2-map-links` · **Pemilik:** Sultan · **Butuh:** B1, A5

Pasang MapLibre. Gambar setiap tautan sebagai garis antara dua menara. Warnai garis menurut `isWet` dan tebalnya menurut `attenuationDb`. Klik garis memilih tautan tersebut dan menyimpannya ke state.

**Kriteria diterima**
- [ ] 40 sampai 60 tautan tampil tanpa penurunan kelancaran
- [ ] Tautan basah terlihat jelas berbeda dari tautan kering
- [ ] Klik memilih tautan dan tampak jelas mana yang terpilih
- [ ] Peta terpusat otomatis pada kotak batas dari `/api/sim/meta`

---

### B3 — Lapisan heatmap hujan
**Branch:** `feat/b3-rain-heatmap` · **Pemilik:** Sultan · **Butuh:** B2

Render `reconstruction` sebagai lapisan heatmap di atas peta, di bawah garis tautan. Skala warna dari bening pada 0 mm/jam sampai `--rain` pekat pada 60 mm/jam ke atas. Sertakan legenda dengan satuan.

**Kriteria diterima**
- [ ] Heatmap berubah mengikuti perubahan `t`
- [ ] Garis tautan tetap terbaca di atas heatmap
- [ ] Legenda menampilkan angka dan satuan mm/jam
- [ ] Nilai nol benar benar transparan, bukan biru pucat

---

### B4 — Panel detail tautan
**Branch:** `feat/b4-link-detail-panel` · **Pemilik:** Sultan · **Butuh:** B2

Ketika satu tautan terpilih, panel kanan menampilkan metadata tautan, lalu grafik deret waktu daya terima dengan garis dasar sebagai garis putus putus, area redaman diarsir, dan grafik kedua berisi intensitas hujan hasil inversi.

**Kriteria diterima**
- [ ] Grafik menampilkan penurunan daya terima secara jelas saat hujan
- [ ] Garis dasar terlihat sebagai garis putus putus terpisah
- [ ] Ditampilkan nilai berjalan: `A = ... dB`, `R = ... mm/jam`, `f = ... GHz`, `L = ... km`
- [ ] Keadaan kosong ketika belum ada tautan terpilih dibuat rapi

---

### B5 — Perbandingan kebenaran dasar versus rekonstruksi
**Branch:** `feat/b5-truth-vs-recon` · **Pemilik:** Sultan · **Butuh:** B3

Dua peta kecil berdampingan: kiri medan simulasi, kanan hasil rekonstruksi. Di bawahnya tampilkan RMSE berjalan.

**Ini slide penentu di depan juri. Kerjakan dengan serius.**

**Kriteria diterima**
- [ ] Kedua peta memakai skala warna yang sama persis
- [ ] Angka RMSE tampil besar dengan satuan mm/jam
- [ ] Keduanya bergerak bersamaan saat waktu diubah
- [ ] Ada label jelas: kiri `MEDAN SEBENARNYA (SIMULASI)`, kanan `HASIL REKONSTRUKSI KAMI`

---

### B6 — Penggeser waktu dan pemutar ulang
**Branch:** `feat/b6-timeline-scrubber` · **Pemilik:** Sultan · **Butuh:** B3

Penggeser waktu di bawah peta dengan tombol putar, jeda, dan atur ulang. Kecepatan pemutaran 1x, 5x, dan 20x.

**Kriteria diterima**
- [ ] Pemutaran berjalan lancar tanpa tersendat
- [ ] Menggeser secara manual langsung memperbarui seluruh panel
- [ ] Tombol atur ulang mengembalikan ke `t = 0`
- [ ] Waktu ditampilkan dalam format `mm:ss` dengan monospace

---

### C1 — Akumulasi per Daerah Aliran Sungai
**Branch:** `feat/c1-catchment-accumulation` · **Pemilik:** Adnan · **Butuh:** A5

> ✅ **SELESAI dan sudah tergabung ke `main`.** `lib/catchment/`, tiap DAS dapat sel grid.
> Jangan dikerjakan ulang. Rinciannya di [ARSITEKTUR.md](ARSITEKTUR.md).

Implementasikan `lib/catchment/`. Untuk tiap poligon DAS, hitung sel grid mana yang berada di dalamnya, lalu akumulasikan curah hujan sepanjang waktu menjadi jendela 1 jam, 3 jam, dan 6 jam. Kembalikan `CatchmentState`.

**Kriteria diterima**
- [ ] Uji titik dalam poligon benar untuk poligon cekung
- [ ] Akumulasi bersifat menaik dan tidak pernah turun kecuali jendela bergeser
- [ ] Status berubah dari normal ke waspada ke siaga saat ambang terlewati
- [ ] Ambang dapat diatur lewat berkas konfigurasi, bukan ditanam di kode

---

### C2 — Mesin peringatan dan antrean konfirmasi
**Branch:** `feat/c2-alert-engine` · **Pemilik:** Adnan · **Butuh:** C1

Ketika akumulasi DAS melewati ambang, buat `AlertCandidate` berstatus `menunggu`. Endpoint `POST /api/alerts/:id/confirm` dan `POST /api/alerts/:id/dismiss` mengubah statusnya. Simpan ke SQLite lewat Prisma.

**Sistem tidak boleh menerbitkan peringatan secara otomatis dalam keadaan apa pun.** Ini bukan sekadar fitur, ini poin tata kelola yang akan kita sampaikan ke juri.

**Kriteria diterima**
- [ ] Kandidat muncul otomatis saat ambang terlewati
- [ ] Konfirmasi dan pengabaian tersimpan lengkap dengan cap waktu
- [ ] Tidak ada jalur kode yang menerbitkan peringatan tanpa konfirmasi
- [ ] Riwayat peringatan bertahan setelah server dimuat ulang

---

### C3 — Panel status DAS dan antrean peringatan
**Branch:** `feat/c3-catchment-panel` · **Pemilik:** Adnan, dibantu Sultan untuk gaya · **Butuh:** C2

Panel kanan bagian bawah: daftar DAS dengan akumulasi dan status, lalu antrean peringatan dengan tombol Konfirmasi dan Abaikan.

**Kriteria diterima**
- [ ] Status memakai warna sesuai token, siaga memakai `--alert`
- [ ] Tombol konfirmasi memunculkan dialog penegasan singkat
- [ ] Peringatan yang sudah dikonfirmasi pindah ke daftar riwayat
- [ ] Antrean kosong menampilkan keadaan kosong yang rapi

---

### C4 — Panel perbandingan kerapatan
**Branch:** `feat/c4-density-comparison` · **Pemilik:** Adnan · **Butuh:** B2 · **Prioritas P2**

Panel kecil yang menampilkan jumlah penakar hujan versus jumlah tautan pada kotak batas yang sama, beserta rasionya. Angka penakar hujan diambil dari berkas konfigurasi.

**Kriteria diterima**
- [ ] Rasio ditampilkan besar, misalnya `1 : 47`
- [ ] Ada catatan sumber di bawahnya
- [ ] Dapat dimatikan tampilannya supaya tidak mengganggu demo utama

---

## 8. Jadwal 2 hari

> **Keadaan sekarang:** seluruh jalur pengukuran, yaitu T0 dan A1 sampai A5, sudah selesai,
> begitu juga C1. Jadwal di bawah adalah rencana awal dan disimpan sebagai catatan.
> **Sisa pekerjaan yang berlaku sekarang, beserta urutan yang paling sedikit membuang waktu,
> ada di [ARSITEKTUR.md](ARSITEKTUR.md) bagian 7.**
>
> Yang berubah dari rencana: B1 sampai B6 tidak lagi harus menunggu apa pun, dan C2 juga tidak.
> `/api/sim` sudah mengembalikan `Snapshot` yang benar, jadi Sultan dan Adnan bisa jalan penuh
> secara bersamaan.

### Hari 1

| Waktu | Radit | Sultan | Adnan |
|---|---|---|---|
| Pagi | **T0** lalu langsung gabung ke `main` | Menunggu T0, sementara siapkan referensi desain | Menunggu T0, sementara siapkan `catchments.geojson` |
| Siang | A1, A2 | B1 | Pelajari kontrak data, siapkan skema Prisma |
| Sore | A3 | B2 | C1 |
| Malam | A4 | B3 | C2 |

**Target akhir hari 1:** peta menampilkan tautan dan heatmap dari data simulasi, meskipun masih kasar.

### Hari 2

| Waktu | Radit | Sultan | Adnan |
|---|---|---|---|
| Pagi | A5, perbaiki RMSE | B4 | C3 |
| Siang | Bantu B5, tuning parameter simulasi | **B5**, prioritas tertinggi hari ini | C4 kalau sempat |
| Sore | **Bekukan kode.** Tidak ada fitur baru | Rapikan tampilan, isi keadaan kosong | Uji seluruh alur dari awal sampai akhir |
| Malam | Latihan demo bersama, rekam video cadangan | Latihan demo | Latihan demo |

**Pembekuan kode pukul 16.00 hari kedua.** Setelah itu hanya boleh perbaikan bug yang merusak demo. Fitur yang belum selesai dibuang, bukan dipaksakan. Demo yang lancar dengan lima fitur mengalahkan demo yang tersendat dengan sembilan fitur.

---

## 9. Definition of Done

Sebuah PR baru boleh digabung kalau semuanya terpenuhi:

- [ ] Seluruh kriteria diterima pada blok tugas tercentang
- [ ] `main` terbaru sudah digabung ke cabang ini, dan tidak ada tabrakan tersisa
- [ ] `npm test` lulus semua
- [ ] `npm run build` berhasil tanpa galat TypeScript
- [ ] `npm run lint` bersih
- [ ] Tidak ada `console.log` yang tertinggal
- [ ] Tidak ada nilai ajaib yang ditanam di kode, pindahkan ke konstanta bernama
- [ ] Perubahan yang terlihat di layar disertai tangkapan layar di PR
- [ ] Tidak ada berkas yang diubah di luar wilayah pemilik
- [ ] Berkas yang dipakai bersama, misalnya `package.json`, tidak ikut berubah tanpa diumumkan lebih dulu
- [ ] Ditinjau oleh minimal satu orang lain, walau hanya sekilas

---

## 10. Skenario demo 3 menit

Latih persis urutan ini. Jangan berimprovisasi di depan juri.

**0:00** Dasbor terbuka pada `t = 0`. Cuaca cerah. Seluruh tautan hijau. Tunjuk penanda `DATA SIMULASI` sambil bilang: *"Ini simulasi, dan justru karena simulasi kami tahu jawaban sebenarnya, sehingga kami bisa menunjukkan angka galatnya."*

**0:20** Tekan putar pada kecepatan 20x. Sel hujan bergerak masuk. Tautan berubah warna satu per satu saat dilewati hujan.

**0:50** Jeda saat puncak. Klik satu tautan yang sedang basah. Panel kanan menampilkan penurunan daya terima terhadap garis dasar. Ucapkan: *"Ini yang direkam operator setiap hari, lalu dibuang sebagai gangguan."*

**1:20** Buka perbandingan berdampingan. Tunjuk keduanya. *"Kiri adalah hujan sebenarnya. Kanan hanya dari sinyal, tanpa satu pun penakar hujan. RMSE sekian mm per jam."*

**1:50** Beralih ke panel DAS. Akumulasi hulu melewati ambang, kandidat peringatan muncul.

**2:15** Tunjuk tombol konfirmasi tanpa menekannya. *"Sistem tidak pernah menyiarkan sendiri. Operator BPBD yang memutuskan. Alarm palsu pukul dua pagi akan membunuh kepercayaan pada sistem ini dalam sebulan."*

**2:40** Kembali ke tampilan peta penuh. Tutup dengan kalimat penutup presentasi.

**Rekam video cadangan malam sebelumnya.** Kalau laptop bermasalah atau server tidak jalan di lokasi, video menyelamatkan presentasi.

---

## 11. Jawaban untuk pertanyaan juri tentang fitur yang tidak ada

Hafalkan yang ini, karena pasti ditanya.

**"Kenapa tidak ada aplikasi untuk warga?"**
Secara hukum, pelayanan informasi meteorologi adalah kewenangan BMKG menurut UU 31 Tahun 2009. Kami memasok data ke lembaga berwenang lewat API, bukan menyiarkan sendiri.

**"Kenapa tidak ada peta evakuasi atau integrasi CCTV?"**
Lapisan itu sudah dikerjakan platform lain, termasuk oleh rekan kami sendiri. Yang belum ada di Indonesia justru lapisan pengukurannya, dan itu yang kami bangun.

**"Kenapa datanya simulasi?"**
Karena akses data tautan dari operator adalah hambatan kelembagaan yang diakui di seluruh literatur bidang ini. Kami memakai simulasi supaya bisa membuktikan algoritmanya benar dengan kebenaran dasar yang diketahui, sesuatu yang justru tidak bisa dilakukan dengan data lapangan. Rencana akses data nyata ada di bagian Rencana Eksekusi proposal.

**"Mana kecerdasan artifisialnya?"**
Ada di dua tempat. Klasifikasi basah kering pada deret waktu yang berderau, dan rekonstruksi medan hujan dari pengukuran integral garis, yang merupakan persoalan invers ill-posed. Tak berhingga banyak medan hujan bisa menghasilkan pengukuran yang identik, sehingga penyelesaiannya menuntut pengetahuan awal yang dipelajari model. Persoalan ini secara matematis lebih sulit daripada deteksi objek.

---

## 12. Checklist sebelum tidur di hari kedua

- [ ] `main` bisa di-build dan dijalankan dari repositori bersih
- [ ] README berisi cara menjalankan dalam 3 perintah
- [ ] Video demo sudah direkam dan tersimpan di dua tempat
- [ ] Tangkapan layar terbaik sudah dimasukkan ke slide
- [ ] Semua orang sudah mencoba menjalankan demo sendiri minimal sekali
- [ ] Laptop untuk presentasi sudah diuji dengan proyektor
