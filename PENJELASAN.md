# Penjelasan HujanNet — Standar Kesuksesan dan Cara Menghitungnya

> **Untuk siapa:** seluruh anggota tim, sebelum presentasi.
> **Aturan pemakaian:** semua orang menyebut angka dari berkas ini, bukan dari ingatan
> dan bukan dari komentar di dalam kode. Kalau ada yang menyebut angka berbeda di depan
> juri, kredibilitas seluruh tim ikut jatuh.
>
> Angka di bawah diukur ulang langsung dari repo pada **11 Agustus 2026**.
> Cara memverifikasi ulang ada di **bagian 10**.

> **Kalau lombanya bertema AI, baca [bagian 12](#12-operator-rekonstruksi-terlatih) lebih dulu.**
> Di situ ada satu satunya model yang benar benar kami latih, beserta protokol uji dan
> batasannya. Jangan menyebut kata "AI" di luar apa yang tertulis di bagian itu.

**Yang berubah pada 11 Agustus 2026:**

- Bagian 3 kini memuat matriks konfusi lengkap. Akurasi 99,63 % ternyata berdiri di atas
  kejadian yang **79,71 % cuplikannya basah** — penebak yang selalu menjawab "basah" sudah
  dapat 79,7 %. Metrik yang benar untuk bidang ini POD, FAR, dan CSI.
- Angka **3,72** diperbaiki di **dua tempat**, bagian 7 dan bagian 9. Angka itu tidak
  pernah ada di tabel sapuan antena basah dan salah. Yang benar: 3,41 → **4,35** kalau
  koreksinya kurang, → **3,18** kalau berlebih. Kalau ada yang sudah menghafal 3,72, ralat.
- Bagian 12 baru: operator rekonstruksi terlatih.
- **Bagian 13 baru: empat angka salah salin ditemukan di tabel ITU kami sendiri**, plus
  pengukuran yang membuktikan kenapa kesalahan itu tidak pernah terlihat. Ini bahan
  jawaban terkuat untuk pertanyaan "bagaimana kalian tahu angkanya benar".
- **Bagian 14 baru — INI YANG TERBESAR: Lapis 3 tercapai.** Model dilatih dan diuji pada
  **data tautan operator sungguhan** (OpenMRG, Gothenburg) dengan **radar cuaca** sebagai
  kebenaran dasar. Bukan simulasi lagi. Galat turun **3,64 → 2,89 mm/jam** pada lima
  kejadian hujan asli yang tidak pernah dilatih.
- `npm test` sekarang **86 dari 86**, bukan 79.

---

## 1. Klaim tunggal yang kita buktikan

> **Redaman sinyal antar menara telekomunikasi dapat dibaca sebagai peta curah hujan
> resolusi tinggi, tanpa memasang satu pun sensor baru.**

Standar kesuksesan kita **bukan** "aplikasinya lengkap", **bukan** "fiturnya banyak",
**bukan** "UI-nya bagus". Standarnya satu:

> **Peta hasil rekonstruksi menyerupai medan hujan sebenarnya, dan kemiripan itu
> dinyatakan dalam angka galat yang bisa dipertanggungjawabkan.**

Kita bisa menyebutkan angka galat justru **karena** datanya simulasi — kebenaran dasarnya
diketahui. Tim yang memakai data lapangan tanpa label tidak punya pembanding, jadi tidak
bisa menunjukkan galat sama sekali. Itu keunggulan kita, bukan kelemahan.

---

## 2. Tiga angka utama — hafalkan ini saja

| Yang disebut | Angka | Cara mengucapkannya |
|---|---|---|
| **Galat peta** | **3,41 mm/jam** | "puncak hujan 40,8 mm/jam, meleset kami 3,4 — sekitar 8 persen" |
| **Letak pusat hujan** | **meleset 1,15 km** | "kami menunjuk lokasi hujan terderas, melesetnya satu kilometer" |
| **Deteksi basah/kering** | **CSI 99,54 %** | "dari 12.050 pengecekan, salah 44 kali" |

Jangan membawa lebih dari tiga angka ke panggung. Juri tidak akan mengingat yang keempat.

**Sebut CSI, bukan akurasi.** Akurasi 99,63 % berdiri di atas kejadian yang 79,71 %
cuplikannya basah, jadi penebak yang selalu menjawab "basah" sudah dapat 79,7 %. CSI tidak
punya kelemahan itu. Rinciannya di bagian 3.

**Kalau lombanya bertema AI**, angka utamanya berubah menjadi **3,41 → 1,35 mm/jam**,
yaitu galat peta sebelum dan sesudah operator terlatih pada badai demo. Lihat bagian 12.

**Pembanding yang membuat 3,41 berarti:** BMKG memisahkan hujan lebat dan sangat lebat
di 20 mm/jam. Galat kita lebih kecil daripada satu lebar kategori, jadi rekonstruksi
hampir tidak pernah salah kategori.

---

## 3. Angka lengkap (untuk sesi tanya jawab)

### Diagnostik kejadian demo

| Besaran | Nilai |
|---|---|
| Akurasi klasifikasi basah/kering | 99,63 % (**baca peringatan di bawah**) |
| RMSE rata-rata | 3,41 mm/jam |
| RMSE terburuk | 7,44 mm/jam |
| Bias rata-rata | **+1,57 mm/jam** (cenderung melebihkan) |
| Cakupan grid oleh jaringan | 74 % |
| Galat posisi puncak saat hujan terkuat | 1,15 km |
| Galat posisi puncak terburuk | 2,73 km |
| Waktu hitung satu kejadian penuh | 0,46 detik |
| Hasil `npm test` | **86 dari 86 lulus** |

### Matriks konfusi basah/kering — dan kenapa akurasi menyesatkan

|  | Kebenaran basah | Kebenaran kering |
|---|---|---|
| **Ditandai basah** | 9.604 (TP) | 43 (FP) |
| **Ditandai kering** | 1 (FN) | 2.402 (TN) |

| Besaran | Nilai |
|---|---|
| Total cuplikan | 12.050 |
| **Fraksi basah** | **79,71 %** |
| Akurasi | 99,63 % |
| **POD** (peluang deteksi) | **99,99 %** |
| **FAR** (rasio alarm palsu) | **0,45 %** |
| **CSI** (indeks sukses kritis) | **99,54 %** |

**Kenapa akurasi tidak boleh jadi angka utama.** Kejadian demo ini 79,71 % cuplikannya
basah. Penebak bodoh yang menjawab "basah" untuk semuanya sudah mendapat **79,7 %**. Jadi
99,63 % naik dari basis 79,7, bukan dari 50. Juri peneliti akan menghitung ini sendiri.

**Dan fraksi basah 79,7 % itu sendiri tidak realistis.** Pada data tautan operator
sungguhan, hujan adalah kejadian langka: fraksi basah biasanya di bawah 5 %. Justru
ketidakseimbangan kelas itulah yang membuat klasifikasi basah/kering sulit di lapangan.
Amplop badai kami menutupi hampir seluruh jam, sehingga kesulitan itu hilang.

**Yang harus diucapkan:** sebut POD, FAR, dan CSI — itu metrik baku bidang ini. Lalu
tambahkan sendiri bahwa fraksi basahnya 79,7 % dan di lapangan persoalan ini jauh lebih
sulit. Menyebutkannya duluan mengubah kelemahan menjadi bukti bahwa kita paham bidangnya.

### Susunan kejadian

| Besaran | Nilai |
|---|---|
| Jumlah tautan | **50** (bukan 52 — komentar di kode masih salah, lihat bagian 8) |
| Frekuensi tautan | 15 – 23 GHz |
| Panjang lintasan | 2,21 – 7,92 km |
| Grid keluaran | 40 × 30 = 1.200 sel, ± 550 m per sel |
| Durasi kejadian | 3.600 detik (1 jam) |
| Jarak antar cuplikan | 15 detik → 241 langkah waktu |
| Puncak hujan sebenarnya | 40,8 mm/jam pada detik ke-1.800 |
| Cuplikan yang diuji klasifikasinya | 50 × 241 = 12.050 |

---

## 4. Gerbang yang dikunci di dalam test

Ini standar kesuksesan yang sesungguhnya: bukan opini, tapi test yang membuat build gagal.
Semuanya di [`tests/inverse.test.ts`](tests/inverse.test.ts).

| Gerbang | Ambang | Hasil sekarang |
|---|---|---|
| Akurasi klasifikasi basah/kering | > 85 % | 99,63 % |
| RMSE rata-rata | < 8 mm/jam | 3,41 |
| RMSE terburuk | < 8 mm/jam | 7,44 |
| Galat posisi puncak | < 5 km | 1,15 / 2,73 |
| Deteksi tautan basah saat puncak | > 90 % | lulus |
| Waktu hitung kejadian penuh | < 2 detik | 0,46 |
| Cakupan grid | 50 – 100 % | 74 % |
| Taksiran garis dasar identik dengan kebenaran dasar | harus 0 | 0 (anti-curang) |
| Penanda basah tertinggal di akhir kejadian | ≤ 10 % tautan | lulus |

Kalimat untuk juri:
> *"Standar sukses kami bukan penilaian subjektif. Kalau RMSE tembus 8 mm/jam atau
> akurasi turun di bawah 85 persen, build kami langsung gagal."*

---

## 5. Cara kerja simulasinya — empat langkah

```
        HUJAN ASLI (kita yang membuat)
              |
              |  rumus ITU-R P.838
              v
        REDAMAN TIAP TAUTAN  --> + derau + pembulatan + hanyutan
              |
              |  X  <-- di sini jawabannya DIBUANG
              v
        MODEL INVERS (hanya melihat daya terima yang kotor)
              |
              v
        PETA HASIL REKONSTRUKSI
              |
              +---- dibandingkan ----> RMSE 3,41 mm/jam
                         ^
        HUJAN ASLI ------+
```

### Langkah 1 — Membangun medan hujan
[`lib/sim/rainField.ts`](lib/sim/rainField.ts), [`lib/sim/scenario.ts`](lib/sim/scenario.ts)

Tiga sel Gauss bergerak di kotak batas hulu Ciliwung (106,86–107,06 BT / −6,76 s.d. −6,61 LS,
± 22 × 17 km):

| Sel | Puncak | Radius |
|---|---|---|
| Utama | 38 mm/jam | 3,0 km |
| Pemuka | 24 mm/jam | 2,2 km |
| Pengekor | 28 mm/jam | 2,6 km |

Digerakkan angin 320° (barat laut, menuruni lembah ke arah Jakarta) pada 18 km/jam,
dikalikan amplop waktu kosinus-terangkat selama 1 jam — sehingga demo **selalu dibuka
dalam keadaan cerah**, memuncak di tengah, dan berakhir cerah lagi.

### Langkah 2 — Model maju: dari hujan ke redaman
[`lib/physics/itu838.ts`](lib/physics/itu838.ts), [`lib/sim/forward.ts`](lib/sim/forward.ts)

Hukum pangkat **ITU-R P.838-3** (Rekomendasi resmi ITU, Jenewa 2005):

```
gamma = k * R^alpha        [dB/km]
```

`k` dan `alpha` disalin apa adanya dari Tabel 1 dan 2 Rekomendasi, rentang 10–40 GHz.
Frekuensi kerja kita 15–23 GHz, jadi semua nilai adalah hasil **interpolasi di dalam
tabel, bukan ekstrapolasi**. `k` diinterpolasi logaritmik, `alpha` linear — persis
prosedur yang dianjurkan Rekomendasi.

Redaman total adalah **integral sepanjang lintasan**, dihitung dengan aturan titik tengah
di 20 titik.

Lalu sinyalnya dikotori seperti perangkat sungguhan:

| Gangguan | Nilai |
|---|---|
| Redaman antena basah | 1,50 dB |
| Hanyutan garis dasar | 0,50 dB/jam |
| Derau penerima (1σ) | 0,20 dB |
| Kuantisasi perangkat | 0,30 dB |

**Perbandingan penting:** redaman hujan puncak terbesar mencapai **24,75 dB** — yaitu
**124 kali** simpangan baku derau dan **83 kali** langkah kuantisasi. Sinyalnya dua orde
magnitudo di atas gangguannya. Itulah alasan fundamental metode ini bekerja.

### Langkah 3 — Model invers: menebak dari nol
[`lib/inverse/`](lib/inverse/index.ts)

**Aturan yang tidak boleh dilanggar:** model invers hanya boleh menyentuh `rxPowerDbm`.
Bidang `baselineDb` dan `trueRainMmH` adalah kebenaran dasar, dipakai **semata** untuk
menghitung galat. Ada test yang membuktikan taksiran garis dasar tidak pernah identik
dengan garis dasar simulator — kalau ada yang menyontek, test langsung merah.

Enam langkah:

1. **Klasifikasi basah/kering** — dua penanda: ragam jangka pendek (ambang 0,6 dB = 3σ derau,
   jendela 21 cuplikan yang **hanya menoleh ke belakang** karena sistem sungguhan tidak
   bisa melihat masa depan) dan selisih tingkat terhadap acuan kering (0,9 dB). Ditambah
   pemeriksaan konsistensi ruang antar tautan tetangga dalam radius 6 km.
2. **Taksir garis dasar** — median bergerak atas cuplikan kering, jendela ±15 menit.
   Median, bukan rerata, supaya tahan terhadap cuplikan basah yang lolos klasifikasi.
3. **Koreksi antena basah** — kurangi 1,5 dB saat basah.
4. **Balik ITU-R P.838** — `R = (gamma / k)^(1/alpha)`.
5. **Sebar ke grid** — interpolasi pembobotan jarak balik, jangkauan 2 km, pangkat 2.
6. **Hitung RMSE** terhadap kebenaran dasar.

### Langkah 4 — Mengukur galat
[`lib/inverse/rmse.ts`](lib/inverse/rmse.ts)

```
RMSE = sqrt( (1/N) * sum( (asli_i - rekonstruksi_i)^2 ) )
```

`N` = 1.200 sel grid, dihitung ulang di 241 langkah waktu. Angka 3,41 adalah rata-rata
dari 241 nilai RMSE — totalnya **289.200 perbandingan sel**.

Tiga pilihan yang membuat angka kita lebih ketat, bukan lebih longgar:

- **Kebenaran dasar diambil dari medan analitik**, bukan dari grid, sehingga galat
  diskretisasi grid tidak ikut terhitung sebagai galat metode.
- **RMSE dihitung di seluruh grid**, termasuk 26 % sel yang tidak tercakup jaringan.
  Kita bisa saja menghitungnya hanya di daerah tercakup dan mendapat angka lebih bagus.
- **Posisi puncak memakai titik berat** sel-sel di atas 70 % nilai puncak, bukan sel
  pemenang tunggal, supaya penaksirnya tidak melompat ketika medan hampir datar.

---

## 6. Dari mana galatnya berasal (anggaran galat)

Ini temuan paling berguna untuk sesi tanya jawab.

| Tahap | RMSE | Sumbangan |
|---|---|---|
| **Lantai interpolasi** — andai hujan tiap tautan diketahui **sempurna** | 3,35 mm/jam | **98 %** |
| **Pipeline penuh** — dari sinyal kotor | 3,41 mm/jam | + 2 % |

Selisihnya hanya **0,06 mm/jam**. Galat inversi per tautan (sebelum disebar ke peta)
cuma **0,73 mm/jam** dengan bias **−0,00**.

```
Fisika ITU-R P.838 ...................... galat ~0
Bias nonlinear (alpha ~ 1) .............. 0,06 mm/jam rata-rata
Derau + kuantisasi (24,75 dB vs 0,3) .... terserap
Taksiran garis dasar (< 1,5 dB) ......... terserap
Klasifikasi basah/kering ................ 0,37 % salah
   `-> GALAT INVERSI PER TAUTAN ......... 0,73 mm/jam   <-- fisika + sinyal
Penyebaran garis ke bidang (IDW) ........ 3,35 mm/jam   <-- geometri, 98 %
   `-> GALAT PETA AKHIR ................. 3,41 mm/jam
```

**Kesimpulannya: fisikanya sudah selesai; yang tersisa adalah geometri.**

Kenapa geometri sulit? Karena **50 pengukuran untuk mencari 1.200 nilai** — nisbah
kurang-tentu **1 : 24**. Secara matematis ada tak berhingga banyak medan hujan yang
menghasilkan 50 angka redaman identik. Menyelesaikannya menuntut pengetahuan awal dari
luar data, yaitu bahwa hujan bersifat menerus secara ruang.

> **Analogi yang paling mudah dipahami:** ini seperti CT scan. Mesin CT menembakkan sinar X
> menembus tubuh, dan setiap sinar hanya memberi satu angka — total kepadatan sepanjang
> garis itu. Dari ribuan garis direkonstruksi gambar irisan tubuh. Kita persis begitu,
> bedanya kita hanya punya 50 garis dan garisnya tidak bisa diputar — posisinya sudah
> dipatok di mana menaranya berdiri.

---

## 7. Faktor yang menentukan akurasi

### Jangkauan interpolasi — trade-off yang harus bisa dijelaskan

| Jangkauan | 1 km | 1,5 | **2 km** | 3 | 4 | 6 |
|---|---|---|---|---|---|---|
| RMSE | 3,18 | 3,32 | **3,41** | 3,70 | 3,98 | 4,42 |
| Cakupan | 53 % | 65 % | **74 %** | 87 % | 94 % | 99 % |

RMSE lebih kecil dibayar dengan peta lebih bolong. 2 km adalah kompromi yang dipilih.

### Jumlah tautan — menentukan CAKUPAN, bukan ketepatan

| Tautan | 50 | 40 | 30 | 20 | 12 | 6 |
|---|---|---|---|---|---|---|
| RMSE | 3,41 | 3,38 | 3,36 | 3,71 | 3,67 | 3,74 |
| Cakupan | 74 % | 70 % | 69 % | 55 % | 48 % | **37 %** |

**JANGAN pernah bilang "makin banyak tautan makin akurat".** Data kita tidak mendukung itu,
dan juri yang jeli bisa membantah dengan angka kita sendiri. Yang benar: jumlah tautan
menentukan seberapa **luas** wilayah yang bisa diukur, bukan seberapa **tepat** nilainya.

### Ketahanan terhadap salah kalibrasi

Model invers diberi nilai antena basah yang salah, sementara model maju tetap 1,5 dB:

| WAA di invers | 0 dB | 0,75 | **1,5 (benar)** | 1,8 | 2,25 |
|---|---|---|---|---|---|
| RMSE rata-rata | 5,57 | 4,35 | **3,41** | 3,25 | 3,18 |

Salah kalibrasi 50 % menggeser RMSE dari 3,41 ke **4,35** kalau koreksinya kurang (0,75 dB),
dan ke **3,18** kalau berlebih (2,25 dB). Tanpa koreksi sama sekali pun masih 5,57, di bawah
ambang 8. **Galat kita didominasi geometri, bukan penyetelan parameter.**

> ⚠️ Berkas ini sebelumnya menulis "3,41 ke 3,72" di sini dan di bagian 9. Angka 3,72 itu
> **salah** — tidak ada di tabel di atas. Baca angkanya dari tabel, jangan dari ingatan.

Perhatikan arah yang berlawanan dengan dugaan: koreksi yang **berlebih** justru menurunkan
RMSE. Sebabnya bias rekonstruksi kita +1,57 mm/jam, yaitu cenderung melebihkan, sehingga
mengurangi lebih banyak dB kebetulan menutupi sebagian bias itu. Itu kompensasi kebetulan,
bukan perbaikan yang sah, dan jangan disebut sebagai keunggulan.

### Ketahanan terhadap badai lain

Tiga badai yang tidak pernah dipakai menyetel apa pun:

| Skenario | Akurasi | RMSE | Galat puncak |
|---|---|---|---|
| Demo (baseline) | 99,6 % | 3,41 | 1,15 km |
| 1 sel besar lambat | 99,8 % | 3,68 | 1,20 km |
| 2 sel kecil cepat | 99,1 % | 2,30 | 1,99 km |
| Hujan ringan merata | 99,7 % | 0,83 | 1,57 km |

Semuanya lulus gerbang.

---

## 8. Yang TIDAK boleh disebut

| Jangan | Sebab | Ganti dengan |
|---|---|---|
| "Sistem kami berbasis AI" | Jalur utama dasbor tetap IDW, prior geometrik tetap. Yang dilatih hanya satu operator rekonstruksi, dan itu belum tersambung ke dasbor | "Kami melatih satu operator rekonstruksi untuk menggantikan interpolasi klasik pada langkah yang anggaran galat kami tunjuk. Rinciannya bagian 12." Sebut namanya: **operator rekonstruksi terlatih**, bukan "AI" |
| "Kami pakai deep learning / jaringan saraf" | Metodenya regresi ridge, model linear. Bukan jaringan saraf | "Regresi ridge, setara Tikhonov yang matriks regularisasinya dipelajari dari data" |
| "Akurasi kami 99,6 persen" sebagai angka utama | Itu akurasi deteksi basah/kering, dan **79,71 % cuplikannya memang basah** — penebak yang selalu menjawab basah sudah dapat 79,7 %. Juri peneliti akan menghitung ini sendiri | Sebut **CSI 99,54 %**, lalu pindah ke 3,41 mm/jam dan 1,15 km. Tambahkan sendiri bahwa fraksi basahnya 79,7 % |
| "52 tautan" | Isi `data/links.json` adalah **50**. Komentar di [`lib/sim/forward.ts:181`](lib/sim/forward.ts:181) dan [`lib/inverse/index.ts:176`](lib/inverse/index.ts:176) masih menulis 52 dan belum diperbaiki | **50 tautan** |
| "Menaikkan jangkauan 2 ke 4 km menaikkan RMSE 3,4 jadi 6,4" | Komentar di [`lib/inverse/field.ts:30-35`](lib/inverse/field.ts:30) sudah usang. Pengukuran hari ini: 3,41 → **3,98** | 3,41 → 3,98 |
| "3 penakar hujan" sebagai fakta | [`data/density-config.json`](data/density-config.json) menandainya `verified: false` — masih perkiraan kerja, belum dicek ke basis data BMKG | Jangan sebut sampai ada yang memverifikasi |
| "Sistem kami sudah lengkap" | Banyak hal sengaja tidak dibangun. Itu keputusan, bukan kekurangan | "Kami sengaja tidak membangun lapisan integrasi. Yang belum ada di Indonesia adalah lapisan pengukurannya." |

### Tiga hal yang justru harus disebut duluan sebelum ditanya

- **Cakupan 74 %.** Seperempat grid berada di luar jangkauan jaringan dan sengaja diluruhkan
  ke nol, bukan dipoles supaya peta terlihat penuh.
- **Ambang demo diskalakan 0,2×.** [`data/catchment-config.json`](data/catchment-config.json)
  memakai `demoScale: 0.2`, karena kejadian yang diperagakan jauh lebih ringan daripada
  banjir sungguhan. Ambang operasionalnya tetap tertulis utuh di berkas itu.
- **Fraksi basah 79,7 %.** Klasifikasi basah/kering kami mudah karena hampir seluruh jam
  memang hujan. Di lapangan fraksi basah di bawah 5 %, dan di situlah persoalan ini
  sebenarnya sulit.

---

## 9. Jawaban untuk pertanyaan yang pasti muncul

**"Kenapa datanya simulasi?"**
Akses data tautan operator adalah hambatan kelembagaan yang diakui di seluruh literatur
bidang ini. Justru dengan simulasi kami bisa membuktikan algoritmanya benar terhadap
kebenaran dasar yang diketahui — sesuatu yang tidak bisa dilakukan dengan data lapangan
tanpa label.

**"Model maju dan invers pakai konstanta yang sama, bukankah itu curang?"**
Benar, dan istilah teknisnya **inverse crime**: model maju dan model invers berbagi
koefisien ITU-R P.838 dan diskretisasi lintasan yang sama, sehingga galat model kami nol
menurut konstruksi — bukan karena modelnya benar.

Kami sudah menguji satu jenis salah model, yaitu nilai antena basah yang keliru. Salah
kalibrasi 50 persen menggeser RMSE dari 3,41 ke **antara 3,18 dan 4,35**, tergantung arah
kesalahannya (lihat tabel bagian 7). Tanpa koreksi sama sekali pun masih 5,57, di bawah
ambang 8. Galat kami didominasi geometri, bukan penyetelan parameter.

**Yang belum kami uji, dan sebutkan sendiri:** kesalahan pada `k` dan `alpha`. Tabel ITU-R
P.838 diturunkan dari distribusi ukuran butir hujan lintang menengah, sedangkan hujan
konvektif tropis punya DSD berbeda. Overeem dkk. (2021) menutup studi validasi tropis
mereka di Sri Lanka dengan rekomendasi persis itu: sesuaikan koefisien hukum pangkat dan
DSD untuk iklim tropis, jangan pakai bawaan ITU-R P.838. Belum dikerjakan untuk Indonesia.

> ⚠️ Berkas ini sebelumnya menulis "3,41 ke 3,72". Angka itu **salah** dan tidak ada di
> tabel bagian 7. Kalau ada anggota tim yang sudah terlanjur menghafalnya, perbaiki.

**"Kalau datanya simulasi, bagaimana kami tahu angkanya berlaku di lapangan?"**
Tidak berlaku, dan kami tidak mengklaim begitu. Sebagai pembanding jujur, validasi lapangan
tropis untuk metode ini sudah ada: Overeem dkk. (2021) di Sri Lanka, ~1.140 lintasan
sungguhan, r² **0,79** untuk hujan harian dan **0,57** untuk per jam, dengan kurang taksir
**17,6 %**. Itu angka dunia nyata. Angka kami jauh lebih rapi karena datanya simulasi, dan
angka kami tidak boleh disandingkan langsung dengan itu.

Perhatikan arah biasnya: Sri Lanka **kurang** taksir 17,6 %, kami **lebih** taksir
+1,57 mm/jam. Berlawanan. Itu petunjuk bahwa simulasi kami belum memuat mekanisme yang
menyebabkan kurang taksir di lapangan, kemungkinan besar antena basah yang sesungguhnya
lebih besar dan lebih bervariasi daripada 1,5 dB konstan.

**"Angkanya cuma bagus untuk badai yang kalian setel sendiri?"**
Tiga badai lain yang tidak pernah dipakai menyetel apa pun: RMSE 0,83 / 2,30 / 3,68.
Semuanya lulus gerbang.

**"Bagaimana kami tahu angka ini benar?"**
Tidak ada `Math.random` di mana pun di `lib/`. Derau dibangkitkan dari hash id tautan
di-XOR dengan detik ke berapa, lalu mulberry32 dan Box-Muller. Jalankan di laptop mana pun,
angkanya persis sama. Silakan `npm test`.

**"Mana kecerdasan artifisialnya?"**
Anggaran galat kami menunjuk tempatnya, jadi jawabannya bukan tebakan. Galat inversi per
tautan hanya 0,73 mm/jam, sedangkan galat peta akhir 3,41 — artinya 98 persen galat lahir
di satu langkah, yaitu penyebaran nilai rata-rata lintasan menjadi bidang. Itu persis
langkah yang prior terlatih gantikan.

Kami melatihnya. Operator rekonstruksi terlatih, regresi ridge, 60.000 bobot, dilatih pada
260 badai sintetis dan diuji pada 80 badai yang tidak pernah dilihat. Pada badai demo,
RMSE turun dari **3,41 ke 1,35**. **Rinciannya, protokolnya, dan batasannya ada di bagian 12,
dan jangan menyebut apa pun soal AI di luar yang tertulis di sana.**

Jalur utama dasbor tetap memakai IDW. Operator terlatih adalah bukti konsep terpisah,
bukan komponen yang sudah tersambung.

**"Kenapa tidak ada aplikasi untuk warga?"**
Pelayanan informasi meteorologi adalah kewenangan BMKG menurut UU 31 Tahun 2009. Kami
memasok data ke lembaga berwenang lewat API, bukan menyiarkan sendiri.

---

## 10. Cara memverifikasi ulang angka di berkas ini

```bash
npm test
```

Harus **85 dari 85 lulus**. Test inilah yang menjaga seluruh gerbang di bagian 4.
Enam uji terakhir menjaga aljabar operator terlatih di bagian 12.

Untuk mengukur ulang angka operator terlatih:

```bash
node scripts/train-operator.ts
```

Kira kira 150 detik, deterministik. Baris `DEMO_STORM` kolom IDW **harus keluar 3,41** —
itu yang membuktikan protokol penilaian di skrip itu identik dengan protokol berkas ini.
Kalau angkanya bukan 3,41, ada yang berubah dan seluruh perbandingan di bagian 12 batal.

Kalau ada yang mengubah `lib/sim/scenario.ts`, `data/links.json`, atau parameter di
`lib/inverse/field.ts`, **seluruh angka di berkas ini harus diukur ulang** dan tanggal di
kepala berkas diperbarui. Angka yang basah di dokumen lebih berbahaya daripada tidak ada
angka sama sekali.

---

## 11. Naskah 30 detik untuk slide akurasi

> *"Kiri adalah hujan yang sebenarnya. Kanan adalah rekonstruksi kami — murni dari sinyal,
> tanpa satu pun penakar hujan.*
>
> *Galat rata-ratanya 3,4 milimeter per jam, dari puncak hujan 40,8. Sekitar 8 persen.
> BMKG memisahkan hujan lebat dan sangat lebat di 20 milimeter per jam, jadi galat kami
> lebih kecil daripada satu lebar kategori.*
>
> *Dan kami bisa menyebut angka ini justru karena datanya simulasi. Tim yang memakai data
> lapangan tanpa label tidak punya pembanding — mereka tidak bisa menunjukkan galat sama
> sekali. Kami bisa."*

Kalau juri menekan lebih dalam, buka bagian 6 dan 7. Jangan buka kalau tidak ditanya.

---

## 12. Operator rekonstruksi terlatih

> **Ini satu satunya model yang benar benar kami latih.** Segala kalimat tentang AI,
> machine learning, atau model terlatih harus berasal dari bagian ini dan tidak boleh
> melebihinya. Kalau ragu, jangan tambahkan apa apa.

Berkasnya: [`lib/ml/operator.ts`](lib/ml/operator.ts),
[`scripts/train-operator.ts`](scripts/train-operator.ts),
[`tests/mlOperator.test.ts`](tests/mlOperator.test.ts).
Tidak satu baris pun di `lib/inverse/` diubah. Jalur utama dasbor tetap IDW.

### 12.1 Kenapa dilatih di langkah itu, bukan di tempat lain

Anggaran galat bagian 6 menunjuk satu langkah dengan sangat spesifik:

```
galat inversi per tautan (fisika + sinyal) ... 0,73 mm/jam
penyebaran garis ke bidang (IDW, geometri) ... 3,35 mm/jam   <-- 98 %
galat peta akhir ............................. 3,41 mm/jam
```

Sebabnya bukan pengukuran yang buruk, melainkan **informasi**. Satu tautan memberi satu
angka, yaitu rata rata hujan sepanjang lintasannya, dan rata rata garis tidak memuat
keterangan di mana sepanjang garis itu hujannya paling deras. IDW menempelkan nilai itu
rata ke seluruh lintasan, sehingga puncak hujan tergerus dan tepinya terangkat.

IDW tidak mungkin memperbaikinya, karena IDW hanya mengetahui jarak. Yang bisa
memperbaikinya adalah operator yang **pernah melihat banyak medan hujan** dan mempelajari
polanya. Jadi kami tidak menempelkan model karena lombanya meminta — kami menempelkannya
di tempat yang ditunjuk data kami sendiri.

### 12.2 Metodenya

Bentuk operatornya **sama persis** dengan IDW, yaitu satu matriks bobot 1.200 × 50. Yang
berubah hanya dari mana bobotnya berasal: dirancang tangan dari geometri, atau dipelajari.

```
IDW      :  x = W_idw   · r      W dirancang tangan
Terlatih :  x = W_learn · r      W = X Rᵀ (R Rᵀ + lambda I)⁻¹
```

Regresi ridge, solusi bentuk tertutup lewat faktorisasi Cholesky. **Bukan jaringan saraf.**
Namanya di literatur: penaksir linear ridge, setara Tikhonov yang matriks regularisasinya
dipelajari dari data.

**Tidak ada suku intersep, dan itu disengaja.** Tanpa intersep, seluruh tautan bernilai nol
menghasilkan medan nol. Sistem tidak boleh mengarang hujan ketika jaringan melaporkan
kering. Ada uji yang menjaga sifat ini.

### 12.3 Protokol uji

| | |
|---|---|
| Badai latih | **260** → 6.100 cuplikan |
| Badai validasi (memilih lambda) | **60**, tidak pernah ikut menghitung bobot |
| Badai uji (dilaporkan sekali) | **80**, tidak pernah menyetel apa pun |
| **Pemisahan** | **per badai, bukan per langkah waktu** |
| Lambda terpilih | 0,03 |
| Parameter | 60.000 bobot |
| Waktu latih | 152 detik, deterministik |

**Kenapa pemisahannya per badai.** Badai bergerak 18 km/jam, jadi dalam 15 detik ia hanya
berpindah 75 meter sementara satu sel grid lebarnya 550 meter. Medan pada langkah ke-900
dan ke-915 nyaris identik. Kalau pemisahannya diacak per langkah waktu, tetangga langsung
sebuah cuplikan latih akan muncul di himpunan uji dan angkanya menjadi bohong. Itu
kebocoran data, dan itu kesalahan paling umum pada pekerjaan semacam ini. **Sebut ini
duluan** — juri peneliti akan menanyakannya.

### 12.4 Hasil

**Badai bernama, dinilai pada seluruh 241 langkah waktu, protokol sama dengan berkas ini:**

| Skenario | IDW | Terlatih | Perubahan |
|---|---|---|---|
| **DEMO_STORM** (dipakai dasbor) | **3,41** | **1,35** | **−60,5 %** |
| Satu sel besar lambat | 2,20 | 1,11 | −49,7 % |
| Dua sel kecil cepat | 1,80 | 1,53 | −15,2 % |
| Hujan ringan merata | 0,89 | 0,85 | −4,8 % |

Baris DEMO_STORM kolom IDW keluar **tepat 3,41**, sama dengan angka utama berkas ini. Itu
yang membuktikan harness penilaiannya sah, bukan diatur supaya bagus.

**Himpunan uji, 80 badai yang tidak pernah dilihat sama sekali:**

| Besaran | IDW | Terlatih | Perubahan |
|---|---|---|---|
| RMSE seluruh grid | 1,96 | 1,36 | −30,8 % |
| **RMSE sel tercakup** | 1,68 | **0,97** | **−42,3 %** |
| Bias | −0,02 | +0,09 | — |
| Galat posisi puncak | 3,49 km | 2,75 km | −21 % |

**Pola perbaikannya masuk akal secara fisis, dan itu layak dijelaskan.** Perbaikan terbesar
pada badai bersel tunggal kuat (−60 %), terkecil pada hujan ringan merata (−4,8 %). Galat
IDW lahir dari penggerusan puncak; kalau medannya sudah datar, tidak ada puncak yang
tergerus, jadi tidak ada yang bisa diperbaiki. Operator terlatih memperbaiki persis
kerusakan yang anggaran galat kami tunjuk, bukan perbaikan acak.

### 12.5 Batasan yang WAJIB disebut

| Batasan | Kenapa harus disebut |
|---|---|
| **Dilatih pada badai sintetis dari generator kami sendiri** | Yang dipelajarinya keluarga badai itu, bukan hujan Indonesia. Generalisasi ke hujan nyata belum terbukti |
| **Mengisi seluruh grid**, termasuk 26 % sel di luar jangkauan | IDW sengaja meluruhkan sel itu ke nol. Operator terlatih mengisinya memakai korelasi ruang yang dipelajari. Sah, tetapi harus dikatakan — karena itu dua baris RMSE dilaporkan terpisah, dan baris "sel tercakup" adalah perbandingan yang paling adil |
| **Model linear**, bukan deep learning | Jangan dibesarkan. Sebut namanya: regresi ridge |
| **Belum tersambung ke dasbor** | Jalur utama demo tetap IDW |
| Bias bergeser −0,02 → +0,09 | Sedikit lebih cenderung melebihkan |

### 12.6 Naskah 45 detik

> *"Anggaran galat kami menunjukkan 98 persen galat lahir di satu langkah: penyebaran
> nilai rata-rata lintasan menjadi bidang. Sebabnya informasi, bukan pengukuran — satu
> tautan memberi satu angka, dan rata-rata garis tidak memuat keterangan di mana sepanjang
> garis itu hujannya paling deras.*
>
> *Interpolasi klasik tidak mungkin memperbaikinya, karena ia hanya tahu jarak. Jadi kami
> melatih operator rekonstruksi untuk menggantikannya. Regresi ridge, 60 ribu bobot,
> dilatih pada 260 badai sintetis, lambda dipilih pada 60 badai validasi terpisah, lalu
> dilaporkan sekali pada 80 badai uji yang tidak pernah dilihat. Pemisahannya per badai,
> bukan per langkah waktu — kalau diacak per langkah waktu, cuplikan yang berjarak 15 detik
> nyaris identik dan angkanya jadi bohong.*
>
> *Pada badai demo, galat peta turun dari 3,41 ke 1,35 milimeter per jam. Pada 80 badai
> yang belum pernah dilihat, di dalam wilayah tercakup jaringan, dari 1,68 ke 0,97.*
>
> *Dua batasan yang harus saya sebut. Operator ini mengisi seluruh grid termasuk seperempat
> sel di luar jangkauan jaringan, sementara interpolasi klasik kami sengaja meluruhkannya
> ke nol — karena itu kami laporkan dua angka terpisah. Dan ia dilatih pada badai sintetis
> dari generator kami sendiri, jadi yang dipelajarinya keluarga badai itu, bukan hujan
> Indonesia.*
>
> *Jadi ini bukti konsep: prior terlatih memang memperbaiki langkah yang data kami tunjuk
> sebagai sumber 98 persen galat. Membuatnya berlaku untuk hujan nyata butuh data tautan
> operator sungguhan — dan datanya sudah ada. OpenMRG dari Gothenburg, 364 tautan resolusi
> 10 detik dengan koordinat menara asli, lengkap dengan radar dan penakar hujan."*

---

## 13. Empat angka yang salah di tabel ITU kami sendiri

> Ini bagian yang paling berharga untuk sesi tanya jawab, dan satu satunya bagian
> di berkas ini yang lahir dari **kesalahan kami sendiri yang kami temukan sendiri**.

### 13.1 Apa yang terjadi

Pada 11 Agustus 2026 tabel `lib/physics/itu838.ts` dibandingkan baris demi baris dengan
dokumen resmi **ITU-R P.838-3** (`r-rec-p.838-3-200503-i!!pdf-e.pdf`, unduhan langsung
dari itu.int). Ditemukan **empat angka yang salah salin**:

| Frekuensi | Tertulis di kode | Resmi ITU | Meleset |
|---|---|---|---|
| **18 GHz `kV`** | 0,07574 | **0,07708** | **1,8 %** |
| 18 GHz `alphaV` | 1,0022 | 1,0025 | 0,03 % |
| 25 GHz `alphaH` | 1,0 | 0,9991 | 0,09 % |
| 35 GHz `alphaH` | 0,904 | 0,9047 | 0,08 % |

Tabelnya sudah diperbaiki, sekaligus diperpanjang menjadi **7 sampai 40 GHz per 1 GHz**
(dari sebelumnya sembilan baris pilihan 10 sampai 40 GHz). Rentang 7 GHz diperlukan karena
OpenMRG pada Lapis 3 memuat tautan mulai 7 GHz; dengan tabel lama, tautan 7 GHz akan
**dijepit menjadi 10 GHz tanpa peringatan apa pun**.

Ada uji baru di `tests/physics.test.ts` yang mengunci dua belas nilai terhadap dokumen
resmi, supaya kesalahan seperti ini tidak bisa masuk lagi diam diam.

### 13.2 Yang membuat temuan ini penting

Angka mutu kami **diukur ulang sebelum dan sesudah perbaikan**:

| Besaran | Tabel salah | Tabel benar | Selisih |
|---|---|---|---|
| **RMSE rata-rata** | **3,41** | **3,4127** | **0,08 %** |
| RMSE terburuk | 7,44 | 7,4613 | 0,3 % |
| Bias | +1,57 | +1,5655 | ~0 |
| Akurasi basah/kering | 99,63 % | 99,63 % | 0 |
| Galat posisi puncak | 1,15 km | 1,1477 km | ~0 |

**Salah 1,8 persen pada konstanta fisika mengubah angka utama kami sebesar 0,08 persen.**

Sebabnya: model maju dan model invers memanggil **fungsi koefisien yang sama**. Ketika
`k` terlalu kecil, sinyal buatan menjadi terlalu lemah **dan** penebaknya membagi dengan
angka yang sama sama kecil. Kesalahannya **saling meniadakan dengan tepat**.

> **Inilah wujud nyata *inverse crime*, dan sekarang kami punya angkanya.**
> Bukan istilah yang kami kutip dari buku, tetapi sesuatu yang kami ukur di sistem kami
> sendiri: angka mutu kami hampir **tidak peka** terhadap benar tidaknya konstanta fisika
> yang kami pakai. Galat semacam ini baru muncul ketika bertemu data lapangan, karena di
> sana alamlah yang memakai konstanta yang sebenarnya, bukan program kami.

### 13.3 Naskah panggung

> *"Boleh saya sebut satu kesalahan yang kami temukan sendiri kemarin?*
>
> *Kami membandingkan tabel koefisien ITU di program kami dengan dokumen resmi ITU-R
> P.838-3, baris demi baris. Ternyata ada empat angka yang salah salin. Yang terbesar di
> 18 gigahertz polarisasi vertikal: kami menulis 0,07574, yang benar 0,07708. Meleset
> 1,8 persen.*
>
> *Yang menarik bukan kesalahannya, tapi akibatnya. Kami ukur ulang seluruh angka mutu
> sebelum dan sesudah diperbaiki. RMSE kami bergerak dari 3,41 menjadi 3,4127. Berubah
> nol koma nol delapan persen.*
>
> *Artinya angka mutu kami hampir tidak peka terhadap benar tidaknya fisika yang kami
> pakai — karena model maju dan model invers kami memakai konstanta yang sama, jadi
> kesalahannya saling meniadakan. Itulah inverse crime, dan sekarang kami punya angkanya,
> bukan sekadar istilahnya.*
>
> *Dan itu justru menegaskan kenapa Lapis 3 di rencana kami penting. Di data lapangan,
> alam yang memakai konstanta sebenarnya, bukan program kami. Di situ kesalahan seperti
> ini tidak bisa bersembunyi."*

### 13.4 Yang harus dijawab kalau juri menekan

**"Kalau begitu angka 3,41 kalian tidak ada artinya?"**
Punya arti, tetapi artinya terbatas dan kami sebut batasnya. 3,41 membuktikan **rantai
algoritmanya benar**: klasifikasi, taksiran garis dasar, inversi, dan penyebaran ke peta
bekerja sesuai rancangan. Yang **tidak** dibuktikannya adalah bahwa konstanta fisikanya
tepat untuk atmosfer Indonesia. Justru itu yang jadi kebaruan usulan kami, yaitu
kalibrasi ulang `k` dan `alpha` untuk hujan konvektif tropis.

**"Kenapa kalian sebutkan kesalahan sendiri?"**
Karena kalau tidak kami sebut, kami tidak akan pernah tahu seberapa jauh angka kami bisa
dipercaya. Menemukannya justru memberi kami satu satunya pengukuran langsung tentang
seberapa peka sistem kami terhadap kesalahan fisika, dan jawabannya: hampir tidak peka —
selama datanya masih simulasi.

---

## 14. Lapis 3 tercapai: dilatih dan diuji pada DATA OPERATOR ASLI

> **Ini bukan lagi simulasi.** Data tautan gelombang mikro operator sungguhan,
> kebenaran dasar dari radar cuaca sungguhan, diuji pada kejadian hujan yang tidak
> pernah dipakai melatih.
>
> Diselesaikan 11 Agustus 2026. Berkas: [`scripts/openmrg/`](scripts/openmrg/).

### 14.1 Datanya

**OpenMRG**, Gothenburg, Swedia — https://doi.org/10.5281/zenodo.7107689, CC-BY-SA 4.0.
Andersson dkk. (2022), *Earth System Science Data* 14, 5411–5426.

| | |
|---|---|
| Sub-link | **728** (364 link, 418 menara), koordinat asli |
| Frekuensi | 7,46 – 38,68 GHz |
| Panjang lintasan | 0,142 – 15,228 km, median **2,28 km** |
| Polarisasi | 722 vertikal, 6 horizontal |
| Resolusi waktu | **10 detik** (kami rata ratakan ke 1 menit) |
| Periode | 1 Juni – 1 September 2015 |
| Kebenaran dasar | Komposit radar C-band NORDRAD, 5 menit, sel 2 km |

**Kejadian hujan yang dipakai: 14**, dipilih otomatis sebagai periode dengan hujan
rata rata wilayah di atas 0,5 mm/jam selama minimal 30 menit. Menghasilkan **602 pasang
contoh**: 728 angka taksiran tautan → 1.271 sel radar.

### 14.2 Yang berubah di kode kami supaya bisa membacanya

| Masalah nyata | Yang kami lakukan |
|---|---|
| Daya pancar **tidak tetap** — 137 dari 714 sub-link berubah sampai 3,9 dB | Memakai **TSL − RSL**, bukan menganggap daya pancar konstan |
| Ada tautan **7,46 GHz**, tabel ITU kami mulai 10 GHz | Tabel diperpanjang ke 7–40 GHz (lihat bagian 13) |
| **2–3 % data hilang** (tautan padam) | Ditangani sebagai NaN, bukan nol |
| Cuplikan 10 detik, bukan 15 detik | Jendela klasifikasi dan garis dasar diskalakan ke **waktu** yang sama (5 menit dan 15 menit), bukan jumlah cuplikan yang sama |

Tiga baris pertama adalah hal yang **tidak ada sama sekali di simulasi kami**.

### 14.3 Hasil

Pemisahan **per kejadian hujan**, bukan per potret: 6 kejadian melatih, 3 memilih lambda,
**5 kejadian uji yang tidak pernah disentuh**. Lambda terpilih 100.

| Besaran | IDW | **Terlatih** | Perubahan |
|---|---|---|---|
| RMSE seluruh grid | 3,814 | **3,263** | **−14,4 %** |
| **RMSE sel tercakup jaringan** | 3,643 | **2,889** | **−20,7 %** |
| Korelasi terhadap radar | 0,559 | **0,598** | — |
| Bias | −0,076 | −0,470 mm/jam | — |

**Per kejadian uji:**

| Kejadian (UTC) | Potret | IDW | Terlatih | Perubahan |
|---|---|---|---|---|
| 2015-08-25 05:05 | 71 | 4,272 | 3,512 | −17,8 % |
| 2015-08-27 01:25 | 13 | 5,692 | 4,359 | −23,4 % |
| 2015-06-13 17:15 | 50 | 1,744 | 1,287 | −26,2 % |
| 2015-07-26 02:25 | 49 | 3,826 | 2,561 | −33,1 % |
| 2015-08-27 18:00 | 18 | 4,459 | 4,718 | **+5,8 %** |

**Menang di 4 dari 5 kejadian.** Yang satu kalah **tetap dilaporkan**; hasil yang menang
di semua kejadian justru patut dicurigai.

### 14.4 Batasan — WAJIB disebut

| Batasan | Kenapa penting |
|---|---|
| **Perbaikannya lebih kecil daripada di simulasi** (−20,7 % vs −42,3 %) | Data asli memang lebih sulit. Kalau angkanya sama bagusnya, justru mencurigakan |
| **Korelasi hanya 0,60** | Ini perbandingan per sel radar tiap 5 menit — jauh lebih ketat daripada per jam. Overeem dkk. mendapat r² 0,57 untuk akumulasi **per jam**, bukan per 5 menit |
| **Parameter belum disetel untuk jaringan ini** | Ambang klasifikasi dan jangkauan IDW masih bawaan hulu Ciliwung. Belum dioptimalkan sama sekali |
| **Cakupan hanya 45 %** | Kotak radar lebih luas daripada jaringan CML yang berkerumun di pusat kota |
| **Gothenburg, bukan Indonesia** | Hujan lintang menengah. Kebaruan usulan kami, kalibrasi ulang k dan alpha untuk tropis, tetap belum dikerjakan |
| **Pengolahan sinyalnya di Python** | Rantai invers disalin ke Python untuk membaca NetCDF. Belum menyatu dengan `lib/inverse/` |

### 14.5 Naskah panggung

> *"Kami tidak berhenti di simulasi. Kami ambil OpenMRG — data tautan operator sungguhan
> dari Gothenburg, 364 link dengan koordinat menara asli, resolusi 10 detik, lengkap
> dengan radar cuaca sebagai kebenaran dasar.*
>
> *Kami pilih 14 kejadian hujan sungguhan, latih pada enam kejadian, dan uji pada lima
> kejadian yang tidak pernah kami sentuh. Kebenaran dasarnya radar, bukan buatan kami.*
>
> *Hasilnya: di dalam wilayah tercakup jaringan, galat turun dari 3,64 ke 2,89 milimeter
> per jam. Turun 21 persen. Menang di empat dari lima kejadian — yang satu kalah 5,8
> persen, dan itu kami laporkan juga.*
>
> *Tiga hal yang kami temukan begitu bertemu data asli, dan tidak satu pun ada di
> simulasi kami. Daya pancar operator tidak tetap; 137 sub-link berubah sampai 3,9
> desibel. Ada tautan 7,46 gigahertz, di bawah batas tabel koefisien kami — jadi tabelnya
> harus kami perpanjang. Dan 2 sampai 3 persen datanya hilang karena tautan padam.*
>
> *Perbaikannya lebih kecil daripada di simulasi, 21 persen dibanding 42 persen. Itu
> memang seharusnya begitu. Kalau data asli sama mudahnya dengan simulasi kami, berarti
> simulasi kami yang salah.*
>
> *Yang belum: ini Gothenburg, hujan lintang menengah. Kalibrasi ulang k dan alpha untuk
> hujan konvektif tropis — kebaruan yang kami usulkan — masih di depan."*
