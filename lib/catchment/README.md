# `lib/catchment` — C1, akumulasi per Daerah Aliran Sungai

Pemilik: Adnan. Konsumen: C2 (mesin peringatan) dan C3 (panel DAS).

## Alur

```ts
const { catchments, config } = loadCatchmentData();          // sisi server saja
const series = buildRainSeries(frames, catchments, config);  // frames dari /api/sim
const states = catchmentStatesAt(series, tNow, config);      // CatchmentState[]
```

`frames` adalah urutan `{ t, field }` dengan `field` = `Snapshot.reconstruction`,
**bukan** `Snapshot.truth`. Peringatan harus lahir dari angka yang benar benar bisa
kita hasilkan di dunia nyata. Memakai `truth` akan membuat panel DAS terlihat sempurna
karena alasan yang salah, dan itu justru pertanyaan pertama yang akan diajukan juri.

## Keputusan yang diambil, dan alasannya

**Sel dihitung masuk kalau titik pusatnya di dalam poligon.** Sederhana, deterministik,
dan mudah dijelaskan. Alternatifnya, pembobotan menurut luas irisan, lebih akurat tetapi
tidak sebanding dengan waktu yang tersedia.

Pada grid kejadian sungguhan, `EVENT_GRID` 40x30 sama dengan 1200 sel, pembagiannya
C-01 70 sel, C-02 70 sel, dan C-03 116 sel. Cukup jauh dari kasus batas, tetapi perlu
diingat kalau resolusi grid nanti diturunkan: DAS yang lebih kecil daripada satu sel
akan mendapat nol sel, dan itu terdeteksi lewat `findEmptyMemberships`.

**Poligon DAS dianggap tidak saling tumpang tindih.** Satu sel jatuh ke DAS pertama yang
memuatnya, lalu pencarian berhenti. Kalau nanti ada DAS bersarang, aturan ini harus diubah.

**Uji titik dalam poligon memakai ray casting**, bukan uji tanda hasil kali silang.
Ray casting benar untuk poligon cekung, dan `C-03 DAS Gadog` memang sengaja dibuat
cekung supaya jalur kode itu benar benar teruji, bukan cuma ada.

**Akumulasi memakai jendela bergerak dengan integrasi trapesium.** Intensitas antar dua
cuplikan dianggap berubah linear, dan potongan interval di luar jendela dipangkas, supaya
jendela bergerak mulus dan tidak meloncat per cuplikan. Awal jendela dijepit di `t = 0`.

**Status DAS adalah status terburuk di antara tiga jendela.** `CatchmentState` hanya punya
satu bidang `thresholdMm`, jadi yang dilaporkan adalah ambang siaga dari jendela penentu,
yaitu jendela dengan rasio akumulasi terhadap ambang siaga paling besar. Rasio, bukan nilai
mutlak, supaya 30 mm dalam 1 jam bisa mengalahkan 60 mm dalam 6 jam.

**Ambang ada di `data/catchment-config.json`.** Tidak ada satu pun angka ambang di berkas
`.ts`. Nilai per DAS menimpa nilai bawaan per jendela.

**Ambang di berkas itu adalah besaran OPERASIONAL, lalu dikalikan `demoScale`.**
`thresholdsFor()` mengembalikan ambang efektif, `operationalThresholdsFor()`
mengembalikan angka aslinya. Kejadian simulasi sekarang jauh lebih ringan daripada
banjir sungguhan: akumulasi 1 jam tertinggi hanya 12,4 mm, sedangkan ambang siaga
operasional 40 sampai 50 mm. Tanpa penskalaan, tidak ada satu pun peringatan yang
muncul dan babak antrean peringatan pada demo kosong. Faktornya dipisah, bukan
angkanya diturunkan, supaya ambang operasional tetap terbaca dan supaya pertanyaan
"kenapa siaga pada 8 mm" punya jawaban jujur. Set `demoScale` ke 1 begitu kejadiannya
sekuat banjir sungguhan.

## Hubungan dengan T0

T0 sudah menetapkan `data/catchments.geojson` berisi tiga DAS: C-01 Cisarua, C-02
Megamendung, C-03 Gadog. **Id dan namanya dipertahankan apa adanya**, karena keduanya
dipakai `data/catchment-config.json`, antrean peringatan, dan `data/evacuation-routes.json`.

Tiga hal diubah:

1. **Poligonnya bukan lagi persegi panjang.** T0 menggambar tiga kotak dengan sudut di
   garis bujur bulat. Sekarang batasnya diturunkan dari DEM SRTM 30 m lewat arah aliran
   D8 dan akumulasi aliran — lihat [`scripts/hydro/README.md`](../../scripts/hydro/README.md).
   Luasnya 15,5 / 43,6 / 75,0 km2, dan C-01 serta C-02 keduanya bermuara ke hulu C-03.
2. **Kecekungan datang dengan sendirinya.** Sebelumnya sisi utara C-03 ditakik manual,
   semata supaya kriteria "uji titik dalam poligon benar untuk poligon cekung" benar-benar
   dijalankan dan tidak lolos hanya karena semua poligon kebetulan cembung. Batas DAS asli
   memang cekung, jadi takik buatan itu dibuang. Ujinya sekarang MENCARI kecekungan di
   dalam data, bukan menghafal koordinat takik.
3. **`thresholdMm` pindah dari `properties` ke `data/catchment-config.json`.** Satu angka
   per DAS tidak bisa menyatakan ambang untuk tiga jendela sekaligus. Nilai aslinya
   (C-01 = 50, C-02 = 45, C-03 = 40) dipertahankan sebagai ambang siaga jendela 1 jam,
   jadi urutan keketatan antar DAS yang ditetapkan T0 tidak berubah.

**Akibat yang harus diketahui saat menyetel demo.** Luas DAS berubah, jadi rata-rata
hujan per DAS ikut berubah. Diukur pada kejadian demo yang sama dengan `demoScale` 0,2,
puncak akumulasi 1 jam bergeser begini:

| | kotak T0 | DAS asli | ambang siaga efektif |
|---|---|---|---|
| C-01 Cisarua | 5,40 mm | 7,64 mm | 10,0 |
| C-02 Megamendung | 12,37 mm | 11,26 mm | 9,0 |
| C-03 Gadog | 8,56 mm | **6,44 mm** | 8,0 |

C-02 masih menembus siaga, jadi antrean peringatan tetap terisi. **C-03 tidak lagi**,
karena DAS Gadog yang sebenarnya jauh lebih luas daripada kotaknya sehingga sel hujan
yang sama tersebar di lebih banyak sel. Kalau demo memang menuntut dua DAS siaga,
turunkan `demoScale` ke 0,15; itu satu baris di `data/catchment-config.json` dan tidak
menyentuh satu pun angka operasional.

## Yang sudah terjawab

| Pertanyaan | Jawaban |
|---|---|
| Arah baris `GridField.values` | **Terkonfirmasi `south-to-north`.** `lib/sim/grid.ts` menulis `iy = 0` pada tepi lintang terkecil, dan ada uji di `tests/catchment.test.ts` yang akan gagal kalau itu berubah |
| Durasi kejadian | `EVENT_DURATION_S = 3600`, tepat satu jam. Akibatnya **`accum1h`, `accum3h`, dan `accum6h` selalu bernilai sama**, dan jendela penentu selalu `accum1h`. Bukan bug, tetapi jendela 3 jam dan 6 jam praktis tidak berguna sampai durasinya diperpanjang. Ada uji yang akan gagal kalau Radit mengubah durasi, supaya ambangnya ditinjau ulang |

## Verifikasi

Uji otomatis ada di `tests/catchment.test.ts`, dijalankan `npm test` bersama uji tim.
17 uji: titik dalam poligon cekung termasuk tepat di kedua sisi dasar takik, arah baris
grid, kekekalan integrasi `R mm/jam selama D detik = R*D/3600 mm`, kasus batas yang
tidak boleh menghasilkan `NaN`, sifat menaik akumulasi, perpindahan status, pemisahan
ambang operasional dan efektif, pemilihan jendela penentu menurut rasio, dan penolakan
berkas rusak.

Impor relatif di direktori ini memakai ekstensi `.ts` eksplisit. Ini yang diminta
catatan ARSITEKTUR bagian 8.4: tanpa ekstensi, modulnya tidak bisa dimuat oleh
`node --test` yang memakai pengupasan tipe bawaan Node.
