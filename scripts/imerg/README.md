# Medan hujan tropis nyata dari satelit

**Tujuan:** mengganti tiga gumpalan Gauss buatan kita dengan medan hujan tropis
**sungguhan**, supaya rantai invers diuji pada struktur yang benar benar akan
ditemuinya di Indonesia.

Ini menutup satu kelemahan dasbor simulasi (lihat [`ARSITEKTUR.md`](../../ARSITEKTUR.md)
bagian 7): medan Gauss kita halus, dan interpolasi kita mengasumsikan hujan itu
halus, jadi kita menguji metode pada medan yang paling ramah terhadap asumsinya
sendiri.

---

## Yang HARUS dipahami sebelum memakai

| | IMERG | HujanNet |
|---|---|---|
| Ukuran kotak | 0,1° ≈ **11 km** | **550 m** |
| Selang waktu | **30 menit** | 15 menit (operator) |

**IMERG 20 kali lebih kasar daripada grid kita.**

Artinya:

- ✅ **BOLEH**: dipakai sebagai **bentuk medan hujan** yang dilewatkan ke model maju
- ✅ **BOLEH**: dibandingkan pada **total akumulasi per DAS**
- ❌ **JANGAN**: dipakai sebagai kebenaran dasar untuk menilai ketajaman 550 m

Yang terakhir itu kesalahan metodologi — menguji yang halus dengan yang kasar.
Penguji akan langsung melihatnya.

Dan **jangan pernah** mengaku ini data operator Indonesia. Yang nyata di sini
hanya **medan hujannya**. Redaman tautannya tetap simulasi.

---

## Jalur A — NASA Earthdata (skrip di folder ini)

**Butuh akun gratis.** Tanpa itu, servernya menjawab `HTTP Basic: Access denied`.

1. Daftar: https://urs.earthdata.nasa.gov/users/new
2. Simpan kredensial sekali saja:

   | Sistem | Berkas |
   |---|---|
   | Windows | `C:\Users\<nama>\_netrc` |
   | Linux/Mac | `~/.netrc` lalu `chmod 600 ~/.netrc` |

   Isinya satu baris:
   ```
   machine urs.earthdata.nasa.gov login NAMA_ANDA password SANDI_ANDA
   ```

3. Pasang pustaka:

```bash
pip install requests h5py numpy
```

4. Jalankan:

```bash
python scripts/imerg/fetch_imerg_indonesia.py --start 2026-02-01 --end 2026-02-02 --wilayah ciliwung
```

### Pilihan produk

| Produk | Jeda | Untuk apa |
|---|---|---|
| `GPM_3IMERGHH.07` | ~3,5 bulan | **Paling akurat**, dipakai untuk riset (bawaan) |
| `GPM_3IMERGHHL.07` | ~14 jam | Kalau butuh kejadian baru |
| `GPM_3IMERGHHE.07` | ~4 jam | Paling cepat, paling kasar |

Wilayah yang tersedia: `ciliwung` (sama dengan `EVENT_BBOX`), `batanghari`, `jakarta`.

---

## Jalur B — Google Earth Engine (lebih mudah)

Tidak perlu mengunduh HDF5 sama sekali. Butuh akun GEE (gratis untuk riset).

Tempel di https://code.earthengine.google.com

```javascript
// Medan hujan IMERG di atas hulu Ciliwung
var bbox = ee.Geometry.Rectangle([106.86, -6.76, 107.06, -6.61]);

var imerg = ee.ImageCollection('NASA/GPM_L3/IMERG_V07')
  .filterDate('2026-02-01', '2026-02-03')
  .filterBounds(bbox)
  .select('precipitation');          // mm/jam

// Cari potret paling deras
var terderas = imerg.map(function (img) {
  var m = img.reduceRegion({
    reducer: ee.Reducer.max(), geometry: bbox, scale: 11000, maxPixels: 1e9
  }).get('precipitation');
  return img.set('puncak', m);
}).sort('puncak', false).first();

print('Puncak tertinggi, mm/jam:', terderas.get('puncak'));
Map.centerObject(bbox, 10);
Map.addLayer(terderas.clip(bbox), {min: 0, max: 30,
  palette: ['ffffff', '9ecae1', '3182bd', '08519c', '54278f']}, 'IMERG');

// Ekspor ke Google Drive sebagai GeoTIFF
Export.image.toDrive({
  image: terderas.clip(bbox), description: 'imerg_ciliwung',
  scale: 11000, region: bbox, fileFormat: 'GeoTIFF'
});
```

**Soal poligon DAS asli — sudah selesai, dan BUKAN lewat HydroSHEDS.**

Cuplikan GEE di bawah pernah dianjurkan di sini sebagai pengganti langsung
`data/catchments.geojson`:

```javascript
var das = ee.FeatureCollection('WWF/HydroSHEDS/v1/Basins/hybas_10')
            .filterBounds(bbox);
```

**Jangan dipakai untuk itu.** Sudah dicoba sampai level 12 yang terhalus: Cisarua,
Megamendung, dan Gadog semuanya jatuh di dalam satu poligon HydroSHEDS seluas
161 km2, karena HydroSHEDS meratakan SRTM ke 15 arcsec (~460 m) sedangkan seluruh
kotak kejadian kita hanya 22 x 17 km. Tiga DAS bernama itu tidak bisa dibuat
daripadanya.

Yang dipakai sekarang adalah delineasi sendiri dari SRTM 1 arcsec (~30 m):
lihat [`scripts/hydro/README.md`](../hydro/README.md). Cuplikan di atas tetap berguna
untuk satu hal, yaitu sebagai **pembanding** batas hasil delineasi kita.

---

## Setelah datanya ada

Keluaran Jalur A adalah `imerg_field.json` berisi urutan medan hujan. Untuk
memakainya, model maju perlu membaca medan dari berkas alih alih dari
`rainRateAt()` di [`lib/sim/rainField.ts`](../../lib/sim/rainField.ts).

Yang perlu diingat saat melaporkan hasilnya: **angka RMSE dari percobaan ini
tidak sebanding dengan 3,41 mm/jam.** Medannya beda, grid-nya beda, dan
kebenaran dasarnya jauh lebih kasar. Laporkan sebagai percobaan terpisah,
jangan digabung ke tabel angka utama.
