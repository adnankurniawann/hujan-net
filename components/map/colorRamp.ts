/**
 * Skala warna hujan, satu-satunya sumber kebenaran.
 *
 * Dipakai bersama oleh heatmap peta (B3) dan kedua kanvas perbandingan (B5).
 * Kriteria B5 "kedua peta memakai skala warna yang sama persis" dijamin oleh
 * fakta bahwa keduanya memanggil fungsi ini, bukan oleh kedisiplinan.
 *
 * Bentuknya sesuai bagian 6 Panduan.md: bening pada 0 mm/jam sampai biru
 * hujan pekat pada 60 mm/jam ke atas. Satu rona saja, berubah monoton pada
 * kecerahan dan alfa sekaligus, sehingga urutannya tetap terbaca pada cetak
 * abu-abu dan bagi mata yang lemah membedakan warna.
 *
 * ARAH KECERAHANNYA DIBALIK pada revisi terang. Di atas latar gelap, "makin
 * deras" berarti makin TERANG. Di atas peta dasar yang pucat, aturan itu
 * membuat hujan terlebat justru paling sulit dilihat — ia mendekati warna
 * kertasnya. Sekarang makin deras berarti makin GELAP, seperti tinta yang
 * menumpuk. Sifat monotonnya utuh, hanya arahnya yang mengikuti latar.
 */

export const RAIN_SCALE_MAX_MMH = 60;

interface Stop {
  v: number; // mm/jam
  r: number;
  g: number;
  b: number;
  a: number;
}

/* Perhentian skala: bening pada 0 mm/jam, lalu biru pucat menuju biru tinta.
   Satu rona, berpusat pada `--rain` (#1f6fd0) yang dipakai token warna di
   `globals.css`, sehingga hujan di peta dan angka hujan di panel memang
   berbicara dalam warna yang sama.

   KETIGA KANAL MENURUN DI SETIAP PERHENTIAN, dan alfanya menaik. Itu bukan
   kebetulan estetis melainkan syarat: karena tidak ada satu pun kanal yang
   sempat naik lagi, urutan skalanya tetap utuh setelah dikonversi ke abu-abu,
   dan tidak ada dua intensitas berbeda yang bisa mendarat pada kecerahan sama.

   Sebelum 31 Juli 2026 tempat ini memuat pelangi enam rona
   (sian -> hijau -> kuning -> oranye -> merah -> ungu) mengikuti konvensi peta
   radar. Pelangi itu menyalahi tiga hal sekaligus yang sudah tertulis: aturan
   Darker-Is-Heavier di DESIGN.md, "sampai --rain pekat" di Panduan bagian 6,
   dan komentar di kepala berkas ini sendiri. Pelangi juga tidak monoton pada
   kecerahan: kuning pada 20 mm/jam lebih terang daripada sian pada 3 mm/jam,
   sehingga hujan sedang tampak lebih ringan daripada gerimis di cetak
   abu-abu. */
const STOPS: Stop[] = [
  { v: 0, r: 124, g: 180, b: 236, a: 0 },
  { v: 3, r: 124, g: 180, b: 236, a: 0.4 },
  { v: 10, r: 90, g: 156, b: 228, a: 0.58 },
  { v: 20, r: 59, g: 130, b: 214, a: 0.72 },
  { v: 35, r: 31, g: 111, b: 208, a: 0.82 },
  { v: 50, r: 23, g: 82, b: 158, a: 0.89 },
  { v: 60, r: 15, g: 58, b: 112, a: 0.94 },
];

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Warna untuk satu intensitas hujan. Nilai 0 benar-benar transparan. */
export function rainColor(mmh: number): Rgba {
  if (!(mmh > 0)) return { r: 0, g: 0, b: 0, a: 0 };
  const v = Math.min(mmh, RAIN_SCALE_MAX_MMH);

  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1].v < v) i++;
  const lo = STOPS[i];
  const hi = STOPS[i + 1];
  const f = (v - lo.v) / (hi.v - lo.v || 1);

  return {
    r: Math.round(lo.r + f * (hi.r - lo.r)),
    g: Math.round(lo.g + f * (hi.g - lo.g)),
    b: Math.round(lo.b + f * (hi.b - lo.b)),
    a: lo.a + f * (hi.a - lo.a),
  };
}

export function rainCss(mmh: number): string {
  const c = rainColor(mmh);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a.toFixed(3)})`;
}

/**
 * Lukis satu `GridField` ke ImageData berukuran nx x ny.
 * Baris grid disusun dari lintang terkecil ke terbesar (urutan baris demi baris
 * pada kontrak `GridField`), sedangkan kanvas menaruh baris 0 di atas, sehingga
 * baris dibalik di sini.
 */
export function fieldToImageData(
  ctx: CanvasRenderingContext2D,
  values: number[],
  nx: number,
  ny: number,
): ImageData {
  const img = ctx.createImageData(nx, ny);
  const fadeMarginX = Math.max(4, Math.floor(nx * 0.28));
  const fadeMarginY = Math.max(4, Math.floor(ny * 0.28));

  for (let y = 0; y < ny; y++) {
    const srcRow = (ny - 1 - y) * nx;

    // Peluruhan tepi vertikal (smoothstep quadratic)
    let uY = 1;
    if (y < fadeMarginY) {
      uY = y / fadeMarginY;
    } else if (y >= ny - fadeMarginY) {
      uY = (ny - 1 - y) / fadeMarginY;
    }
    const fadeY = uY <= 0 ? 0 : uY * uY * (3 - 2 * uY);

    for (let x = 0; x < nx; x++) {
      // Peluruhan tepi horizontal (smoothstep quadratic)
      let uX = 1;
      if (x < fadeMarginX) {
        uX = x / fadeMarginX;
      } else if (x >= nx - fadeMarginX) {
        uX = (nx - 1 - x) / fadeMarginX;
      }
      const fadeX = uX <= 0 ? 0 : uX * uX * (3 - 2 * uX);

      const edgeFade = fadeX * fadeY;
      const c = rainColor(values[srcRow + x]);
      const o = (y * nx + x) * 4;
      img.data[o] = c.r;
      img.data[o + 1] = c.g;
      img.data[o + 2] = c.b;
      img.data[o + 3] = Math.round(c.a * edgeFade * 255);
    }
  }
  return img;
}

/** Nilai yang dipakai legenda; label terakhir ditandai "≥". */
export const LEGEND_STOPS = [0, 10, 20, 35, 50, 60] as const;
