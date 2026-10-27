# Batas DAS dari topografi sungguhan

Yang dihasilkan folder ini adalah [`data/catchments.geojson`](../../data/catchments.geojson):
batas tiga daerah aliran sungai di hulu Ciliwung, **diturunkan dari elevasi**, bukan
digambar tangan.

Sebelum ini isinya tiga persegi panjang dengan sudut di garis bujur bulat, warisan
T0. Persegi panjang bukan DAS. Batas DAS ditentukan punggungan, dan punggungan tidak
pernah lurus.

```bash
python scripts/hydro/fetch_dem.py            # sekali saja, ~20 MB
python scripts/hydro/delineate_catchments.py # ~3 menit, menulis data/catchments.geojson
node scripts/build-evacuation-routes.mjs     # WAJIB menyusul, lihat bagian bawah
npm test
```

## Datanya

| | |
|---|---|
| DEM | SRTM 1 arcsec (~30 m), ubin `S07E106` dan `S07E107` |
| Sumber | cermin terbuka AWS "Terrain Tiles", format skadi — **tanpa akun, tanpa kunci API** |
| Jendela kerja | lon 106,74–107,14, lat -6,88 sampai -6,56, yaitu 1441 x 1153 sel |

Jendela sengaja jauh lebih lebar daripada kotak kejadian: batas selatannya harus
melewati massif Gede-Pangrango dan batas timurnya melewati Puncak, karena di
situlah punggungan pemisah hulu Ciliwung berada. Kalau punggungannya terpotong
jendela, DAS-nya ikut terpotong dan luasnya salah.

## Rantai perhitungannya

1. **Tambal lubang** SRTM dengan rata-rata tetangga.
2. **Isi cekungan**, priority-flood + epsilon (Barnes, Lehman, Mulla 2014). Setiap
   sel dijamin punya tetangga yang benar-benar lebih rendah, jadi arah aliran selalu
   terdefinisi dan tidak ada aliran melingkar.
3. **Arah aliran D8**: tiap sel mengalir ke tetangga dengan kemiringan turun terbesar.
4. **Akumulasi aliran**: jumlah sel hulu tiap sel, dihitung sekali lewat urutan
   topologis dari elevasi tinggi ke rendah.
5. **Titik tuang**: koordinat pusat tiap kota ditempelkan ke sel berakumulasi
   tertinggi dalam radius 1200 m, yaitu alur sungai terdekat yang berarti.
6. **Delineasi hulu**: seluruh sel yang alirannya melewati titik tuang itu.
7. **Pengurangan serakah**: DAS yang hulunya paling kecil mengambil bagiannya lebih
   dulu, yang lebih besar hanya mendapat sisanya.
8. **Vektorisasi**: rusuk batas raster disusun menjadi cincin, disederhanakan
   Douglas-Peucker dengan toleransi ~50 m.

## Hasilnya

```
C-01 DAS Cisarua      titik tuang 106,94167  -6,69361   hulu  15,5 km2
C-02 DAS Megamendung  titik tuang 106,92417  -6,66139   hulu  43,6 km2
C-03 DAS Gadog        titik tuang 106,86111  -6,64833   hulu 134,1 km2
```

C-01 dan C-02 keduanya mengalir ke C-03, jadi setelah pengurangan:

| | sub-DAS | verteks | sel grid kejadian |
|---|---|---|---|
| C-01 Cisarua | 15,5 km2 | 67 | 47 |
| C-02 Megamendung | 43,6 km2 | 109 | 141 |
| C-03 Gadog | 75,0 km2 | 192 | 242 |

15,5 + 43,6 + 75,0 = 134,1 km2, tepat sama dengan hulu di Gadog. Angka itu juga
sejalan dengan besaran baku DAS Ciliwung di bendung Katulampa, ~150 km2, yang
letaknya persis di hilir Gadog.

**C-01 dan C-02 adalah DAS penuh; C-03 inkremental.** Cisarua duduk di anak sungainya
sendiri, sedangkan Megamendung di batang Ciliwung, dan keduanya bermuara di hulu
Gadog. Jadi C-03 adalah luasan yang mengalir ke Gadog TETAPI tidak lewat kedua titik
tuang di hulunya. Bentuknya karena itu cekung, dengan gigitan besar di sisi timurnya.

## Yang perlu diketahui sebelum mengubah

**Radius penempelan menentukan sungai mana yang dipilih.** Diuji pada 800, 1200,
1500, dan 2000 m:

| Radius | C-01 | Sifat |
|---|---|---|
| 800 m | 15,2 km2 | anak sungai sendiri |
| 1200 m (bawaan) | 15,5 km2 | anak sungai sendiri |
| 1500 m | 15,8 km2 | anak sungai sendiri |
| **2000 m** | **23,3 km2** | **melompat ke batang Ciliwung** |

Jadi hasilnya stabil di pita 800–1500 m, dan bawaannya duduk di tengah pita itu.
Pada 2 km, Cisarua nyantol ke batang utama dan ketiga DAS berubah menjadi tiga
penggal sungai yang sama — masih sah secara hidrologi, tetapi ceritanya lain.
Ubah lewat `--snap`, jangan diam-diam.

**Poligonnya dipotong ke `EVENT_BBOX`.** `lib/sim/scenario.ts` menjanjikan setiap DAS
berada di dalam kotak kejadian, dan `computeMembership` bergantung pada itu.
Pemotongan dikerjakan pada raster sebelum divektorkan, jadi tidak ada operasi boolean
poligon yang bisa menghasilkan geometri rusak. Hanya C-01 yang benar-benar terpotong,
0,6 km2 di lereng selatan. `properties.subCatchmentAreaKm2` adalah luas SEBELUM
dipotong — itu yang boleh disebut sebagai luas DAS. Pakai `--full` untuk melihat
bentuk utuhnya.

**Rute evakuasi harus dibangun ulang.** Titik asal lintasan adalah titik berat DAS.
Titik berat DAS asli tidak sama dengan titik berat persegi panjang, dan
`lib/evacuation/routes.ts` menolak `data/evacuation-routes.json` yang selisihnya lebih
dari 25 m. Jalankan `node scripts/build-evacuation-routes.mjs` setelah setiap
pembangunan ulang.

## Kenapa bukan HydroSHEDS langsung

Sudah dicoba lebih dulu, dan gagal karena resolusinya. HydroBASINS v1c level 12
(yang terhalus) untuk region `au` — Jawa ada di region Australasia, bukan `as` yang
berhenti di 1,17° LU — menaruh **Cisarua, Megamendung, dan Gadog di dalam SATU
poligon**, `HYBAS_ID` 5120668250 seluas 161 km2. Seluruh hulu Ciliwung masih satu
basin di sana. Dua belas basin lain hanya menyerempet sudut kotak kejadian.

Sebabnya HydroSHEDS meratakan SRTM ke 15 arcsec (~460 m) sebelum menurunkan arah
aliran, sedangkan skrip ini memakai 1 arcsec (~30 m) — 15 kali lebih halus, dan
memang harus, karena seluruh kotak kejadian hanya 22 x 17 km.

HydroBASINS tetap berguna sebagai pembanding: hulu Ciliwung versi mereka 161 km2
di level 12, versi kita 134,1 km2 di Gadog yang letaknya lebih ke hulu. Keduanya
sejalan.

## Catatan kejujuran

Yang nyata di sini adalah **batas DAS dan topografinya**. Redaman tautan, medan
hujan, dan jaringan menara tetap simulasi — lihat `ARSITEKTUR.md` bagian 2. Mengganti batas DAS
tidak membuat satu pun angka RMSE menjadi hasil pengukuran lapangan.
