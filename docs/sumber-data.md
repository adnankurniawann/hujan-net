# Sumber Data untuk HujanNet

Disusun 27 Oktober 2026. Fokusnya data yang bisa dipakai untuk **melatih dan menguji model AI sungguhan**, bukan simulasi.

Fakta yang membentuk strategi: **tidak ada data CML (redaman tautan operator) Indonesia yang terbuka.** Jadi model belajar sinyal CML dari data luar negeri. Bentuk hujan tropis diambil dari satelit, lalu kalibrasi lokal memakai penakar BMKG.

---

## 1. Data CML terbuka (sinyal tautan + kebenaran dasar)

Ini bahan utama untuk dua komponen AI di proposal: klasifikasi basah/kering dan rekonstruksi peta.

| Dataset | Isi | Resolusi | Kebenaran dasar | Lisensi | Akses |
|---|---|---|---|---|---|
| **Four-year CML Netherlands** (Overeem dkk., 2024) | ~3.070 sub-link, ~1.818 lintasan, T-Mobile NL, 2011–2015 | **15 menit, RSL min/maks** | Radar terkoreksi penakar, dataset terpisah tapi terbuka | CC BY 4.0 | [4TU](https://data.4tu.nl/datasets/be252844-b672-471e-8d69-27269a862ec1) |
| **OpenMRG** (Andersson dkk., 2022) | 364 link bi-arah, Gothenburg, Jun–Agu 2015 | 10 detik, RSL + TSL | Radar C-band + 11 penakar | CC BY-SA 4.0 | [Zenodo](https://zenodo.org/records/7107689), satu zip 318 MB |
| **OpenRainER** (Emilia-Romagna, Italia) | ~151 link Lepida, 2021–2022, **sudah dipakai di `ml/`** | 1 menit, RSL + TSL, kuantisasi 1 dB | Radar terkoreksi penakar 15 menit, ~1 km | CC BY 4.0 | [Zenodo v2.0.3](https://zenodo.org/records/22829808), paper [ESSD preprint](https://essd.copernicus.org/preprints/essd-2026-160/) |
| CML NL lama | ~2.500 link, 2011–2012 | 15 menit | Radar | terbuka | [4TU](https://data.4tu.nl/datasets/7a692e36-c32f-4916-813b-c62d2566e8d8) |
| **Sri Lanka** (Overeem dkk., 2021) | **Hanya peta hujan hasil CML**, bukan sinyal mentah, Sep–Des 2019 | 15 menit, grid ~4 km | — | CC BY 4.0 | [4TU](https://data.4tu.nl/datasets/01608fb8-a996-467c-b0e9-c0bd4524e0f8) |

Catatan:

- **Dataset NL paling penting.** Formatnya (RSL min/maks per 15 menit) sama dengan yang menurut proposal direkam NMS operator Indonesia. Model yang dilatih di sini paling mudah dipindah ke data operator Indonesia nanti.
- OpenMRG sudah pernah dipakai tim, tetapi file antaranya (`cml_ev.npz`, `R_crop.npy`, `events.json`) tidak bisa dibuat ulang dari repo. Pemrosesannya harus ditulis ulang supaya bisa direproduksi.
- Sri Lanka satu-satunya data CML tropis yang terbuka, tetapi isinya keluaran, bukan masukan. Hanya berguna sebagai pembanding.
- Perkakas: [poligrain](https://poligrain.readthedocs.io/en/latest/notebooks/Explore_example_data.html) (loader OpenMRG), pycomlink, dan [kode CNN basah/kering Polz](https://github.com/jpolz/cnn_cml_wet-dry_example) sebagai baseline pembanding.

## 2. Hujan Indonesia di Google Earth Engine

Dipakai sebagai **bentuk medan hujan tropis nyata** untuk menggantikan gumpalan Gauss, dan untuk studi kasus (misalnya banjir Sumatra Nov 2025). Resolusinya kasar (~11 km), jadi **jangan dipakai sebagai kebenaran dasar 550 m.** Peringatan ini sudah ada di `scripts/imerg/README.md`.

| Dataset | ID Earth Engine | Resolusi | Catatan |
|---|---|---|---|
| **GSMaP v8** (JAXA) | `JAXA/GPM_L3/GSMaP/v8/operational` | per jam, 0,1° | Ada pita terkoreksi penakar `hourlyPrecipRateGC`. Kuat di Asia |
| **IMERG V07** (NASA) | `NASA/GPM_L3/IMERG_V07` | 30 menit, 0,1° | Bebas dipakai |
| CHIRPS | `UCSB-CHG/CHIRPS/DAILY` | harian, 0,05° | Akumulasi DAS harian |
| ERA5-Land | `ECMWF/ERA5_LAND/HOURLY` | per jam, ~9 km | Suhu, kelembapan, untuk fitur tambahan |

Katalog: [IMERG](https://developers.google.com/earth-engine/datasets/catalog/NASA_GPM_L3_IMERG_V07), [GSMaP](https://developers.google.com/earth-engine/datasets/catalog/JAXA_GPM_L3_GSMaP_v8_operational). ID CHIRPS dan ERA5-Land belum dicek ulang di katalog.

## 3. Data BMKG (kalibrasi lokal, Lapis 4 proposal)

| Sumber | Isi | Akses |
|---|---|---|
| **SACA&D** | ~10.000 stasiun Asia Tenggara, **harian**, diperbarui sampai 31 Des 2025. Hanya ~17 % seri yang publik. Grid SA-OBS 1981–2017 | [sacad.bmkg.go.id](https://sacad.bmkg.go.id/), riset non-komersial |
| Data Online BMKG | Harian/per jam, AWS/ARG | Wajib registrasi, tarif PNBP bisa Rp0 untuk riset kebencanaan (PP 47/2018, Perka BMKG 12/2019) |
| Radar BMKG (CMAX, 10 menit) | Satu-satunya kebenaran resolusi tinggi di Indonesia | **Tidak terbuka.** Harus minta langsung ke BMKG (puslitbang@bmkg.go.id) |

## 4. Distribusi ukuran butir hujan tropis (untuk k dan α)

k dan α bisa **dihitung** dari distribusi ukuran butir (DSD) lewat hamburan T-matrix/Mie (misalnya `pytmatrix`). Jadi koefisien tropis bisa diturunkan sebelum ada instrumen Ku-band sendiri. Instrumen tetap perlu untuk memvalidasinya.

| Sumber | Isi | Akses |
|---|---|---|
| ARM Darwin (C3), disdrometer impak | Australia utara, tropis maritim, 2006–2015 | Terbuka, DOI [10.5439/1025181](https://www.archive.arm.gov/metadata/html/twpdisdrometerC3.b1.html) |
| ARM Manus & Darwin, VDISQUANTS | DSD terkontrol mutu dari disdrometer video, rilis Nov 2025 | Terbuka lewat [ARM Data Discovery](https://armgov.svcs.arm.gov/news/data/post/106103), perlu akun gratis |
| Jaringan Parsivel Indonesia (Marzuki dkk.) | Kototabang, Pontianak, Manado, Biak. 2DVD Kototabang 2003–2010 | **Tidak terbuka.** Minta ke grup Marzuki (Univ. Andalas) / RISH Kyoto. Paper: [Ann. Geophys. 2013](https://angeo.copernicus.org/articles/31/1941/2013/) |
| GPM DPR 2A (Dm, Nw) | DSD dari radar satelit, mencakup seluruh Indonesia | Terbuka (NASA GES DISC). Dm cenderung terlalu besar pada hujan konvektif, perlu koreksi |
| Tautan 15 GHz Malaysia | Koefisien atenuasi tropis dari 6 link DiGi | [Paper](https://jwcn-eurasipjournals.springeropen.com/articles/10.1186/1687-1499-2012-189), sebagai pembanding hasil |

## 5. Lain-lain

| Sumber | Kegunaan | Akses |
|---|---|---|
| Himawari-8/9 AHI | Citra awan 10 menit, 2 km, sejak 2015. Fitur tambahan untuk rekonstruksi di sela tautan | Terbuka di AWS (NOAA). **Tidak ada di katalog Earth Engine** |
| DSDA Jakarta | Pos hujan + tinggi muka air realtime Ciliwung | [dsda.jakarta.go.id](https://dsda.jakarta.go.id/layanan?eksternal), belum jelas ada arsip yang bisa diunduh |
| data.go.id | Curah hujan bulanan per kabupaten | Kasar, mutu tidak seragam. Kurang berguna |

## 6. Geospasial pendukung

| Data | Sumber | Kegunaan |
|---|---|---|
| Lokasi menara BTS | [OpenCelliD](https://source.coop/smartmaps/opencellid) (filter MCC 510), OSM `tower:type=communication` | Topologi tautan realistis untuk DAS Batanghari/Musi. Bukan data backhaul sungguhan |
| DEM | `COPERNICUS/DEM/GLO30`, SRTM, DEMNAS (BIG) | Delineasi DAS. Skrip sudah ada di `scripts/hydro/` |
| Batas DAS | HydroBASINS `WWF/HydroSHEDS/v1/Basins/hybas_*` | Sub-DAS Batanghari/Musi |
| Kejadian banjir | [Global Flood Database](https://developers.google.com/earth-engine/datasets/catalog/GLOBAL_FLOOD_DB_MODIS_EVENTS_V1) (2000–2018, CC BY-NC), Sentinel-1 `COPERNICUS/S1_GRD`, DIBI BNPB | Label kejadian untuk menguji ambang peringatan |

---

## Pemetaan ke komponen AI di proposal

| Komponen | Latih pakai | Uji pakai |
|---|---|---|
| Klasifikasi basah/kering (RF → 1D-CNN → LSTM) | OpenMRG + OpenRainER, label dari radar. NL jika 4TU bisa dijangkau | Kejadian yang ditahan, dan lintas dataset: latih di satu negara, uji di negara lain |
| Rekonstruksi peta (pengganti IDW/ridge) | Pasangan CML → grid radar dari NL/OpenMRG, ditambah medan GSMaP/IMERG di atas topologi menara Indonesia | Kejadian yang ditahan, pemisahan per kejadian |
| Adaptasi tropis, koefisien k dan α | Hitung dari DSD tropis (ARM Darwin/Manus, GPM DPR, Parsivel Indonesia jika diizinkan) | Instrumen Ku-band (Lapis 2) + penakar BMKG / SACA&D |

## Yang sudah dicari dan memang tidak ada

- Data CML operator Indonesia yang terbuka.
- Arsip radar BMKG yang terbuka.
- Dataset radar Indonesia untuk deep learning di Zenodo atau tempat lain.
- Data CML mentah dari daerah tropis mana pun. Sri Lanka hanya merilis peta hasilnya.
