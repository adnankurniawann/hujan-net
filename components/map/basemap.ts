/**
 * Ubin peta dasar, dan perlakuan warnanya.
 *
 * ============================================================================
 * KENAPA PETA DASARNYA DIBUAT TAK BERWARNA
 * ============================================================================
 * Aturan pertama palet konsol ini: setiap piksel bersaturasi di layar adalah
 * sebuah pengukuran atau sebuah status. Ada tepat dua warna data — `--rain`
 * untuk cuaca yang disimpulkan, `--signal` untuk yang diukur radio — ditambah
 * `--alert` dan `--ok` untuk status.
 *
 * CARTO Voyager membawa empat rona lagi yang tidak mematuhi aturan itu: perairan
 * dan tanda jalan besar berwarna biru, taman hijau, jalan arteri kuning-jingga,
 * bangunan cokelat. Biru perairan itu duduk persis di rentang yang sama dengan
 * `--rain`, sehingga di panggung peta ada dua biru yang berarti dua hal berbeda
 * dan tidak ada cara membedakannya; di panel perbandingan, kedua medan hujan
 * dinilai mata di atas alas berwarna, padahal seluruh gunanya adalah
 * membandingkan dua medan yang sama perlakuannya.
 *
 * Peta dasar tetap harus terbaca — lintasan evakuasi mengikuti jalan sungguhan
 * dan harus bisa dibaca DI ATAS jalan itu — jadi yang dibuang saturasinya, bukan
 * ubinnya. Jalan tetap ada sebagai beda terang-gelap, sungai tetap ada sebagai
 * bentuk, dan satu-satunya yang berwarna kembali menjadi hujan, redaman, dan
 * status.
 *
 * ---------------------------------------------------------------------------
 * SATU BERKAS, KARENA SEBELUMNYA ADA TIGA DAN KETIGANYA BERBEDA
 * ---------------------------------------------------------------------------
 * `map/RainMap.tsx` menulis `raster-saturation: 0` — dan 0 di MapLibre berarti
 * "jangan ubah apa pun", jadi komentar di atasnya yang menjanjikan saturasi
 * turun kuat tidak pernah benar sekali pun sejak ditulis.
 * `modals/EvacuationRouteModal.tsx` tidak menyetel saturasi sama sekali.
 * `panels/ComparisonView.tsx` menggambar ubinnya sendiri, dengan subdomain `a.`
 * yang dipaku, juga tanpa perlakuan apa pun.
 *
 * Tiga peta di satu produk, tiga peta dasar yang berbeda rupa. Sekarang
 * ketiganya membaca berkas ini.
 */

/** Tiga subdomain dipakai bergiliran: batas sambungan serentak per host. */
export const BASEMAP_TILES = [
  "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
];

export const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; &copy; <a href="https://carto.com/attributions">CARTO</a>';

/**
 * Alas kertas terang di bawah ubin, sewarna dengan puncak sapuan langit di
 * `globals.css`, supaya ubin yang belum termuat tidak berkedip gelap — dan
 * supaya kepudaran di bawah ini memudar ke arah kertas, bukan ke arah putih.
 */
export const BASEMAP_GROUND = "#eef3f8";

/**
 * Kepekatan ubin di atas alas kertas.
 *
 * Sempat disetel 0,82 dengan alasan "memundurkan peta dasar", dan itu keliru —
 * dilihat langsung di layar, jalannya nyaris hilang. Yang seharusnya mundur
 * adalah WARNANYA, bukan keberadaannya: lintasan evakuasi mengikuti jalan
 * sungguhan, jadi jalan itu justru harus terbaca. Membuang saturasi sudah
 * cukup untuk itu; meredupkan di atasnya hanya membuang keterbacaan tanpa
 * menambah kepatuhan pada aturan palet.
 */
export const BASEMAP_ALPHA = 1;

/**
 * Kontras DINAIKKAN, bukan diturunkan.
 *
 * Pada Voyager, jalan arteri dibedakan dari daratan lewat rona kuning-jingga.
 * Begitu saturasinya dibuang, pembeda itu ikut hilang dan jalan melebur ke
 * daratan. Kontras mengembalikan pemisahnya sebagai beda terang-gelap — satu-
 * satunya saluran yang tersisa setelah warna tidak lagi boleh dipakai.
 */
const BASEMAP_CONTRAST = 0.15;

/** Cat lapisan raster MapLibre. Dipakai peta utama dan jendela tinjauan rute. */
export const BASEMAP_PAINT = {
  "raster-opacity": BASEMAP_ALPHA,
  "raster-saturation": -1,
  "raster-contrast": BASEMAP_CONTRAST,
} as const;

/**
 * Padanan `BASEMAP_PAINT` untuk kanvas 2D, dipakai panel perbandingan yang
 * menggambar ubinnya sendiri. Kepekatannya disetel lewat `globalAlpha`, bukan
 * di sini, supaya nilainya tetap satu: `BASEMAP_ALPHA`.
 *
 * Saturasinya benar-benar sama — nol di kedua sisi. Kontrasnya mendekati, tidak
 * identik: `raster-contrast` MapLibre dan `contrast()` CSS memakai rumus yang
 * berbeda. Pada besaran sekecil ini selisihnya tidak terlihat, dan yang penting
 * di sini adalah tidak ada rona yang tersisa.
 */
export const BASEMAP_CANVAS_FILTER = `grayscale(1) contrast(${(1 + BASEMAP_CONTRAST).toFixed(2)})`;

/**
 * Sebanyak apa jaringan tautan disurutkan ketika lintasan evakuasi tergambar.
 *
 * Status lintasan memakai token status, dan salah satunya — `--signal` untuk
 * WASPADA — adalah warna yang sama dengan tautan basah. Itu bukan kesalahan
 * penamaan: keduanya memang memakai token yang benar masing-masing. Tetapi di
 * atas satu kanvas, satu lintasan kuning harus terbaca di antara lima puluh
 * garis kuning lain.
 *
 * Rona kelima dilarang, jadi yang dipakai bukan warna melainkan penekanan:
 * selama operator sedang menimbang sebuah rute, jaringan tautan adalah konteks,
 * bukan pokok. Ia disurutkan, lalu kembali penuh begitu rutenya dilepas.
 */
export const LINK_DIM_WITH_ROUTE = 0.4;

/** Satu ubin, subdomain dipilih dari koordinatnya supaya beban terbagi rata. */
export function basemapTileUrl(z: number, x: number, y: number): string {
  const host = ["a", "b", "c"][Math.abs(x + y) % 3];
  return `https://${host}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`;
}
