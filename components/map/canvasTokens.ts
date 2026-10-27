/**
 * Token warna untuk lapisan yang digambar sendiri di atas kanvas.
 *
 * Kanvas tidak bisa membaca `var()`, jadi setiap lapisan yang menggambar harus
 * mengambil nilai tokennya lebih dulu. Sebelumnya tiga berkas menyelesaikannya
 * sendiri-sendiri: `map/RainMap.tsx` dan `evacuation/safety.ts` masing-masing
 * memegang satu salinan pembaca token beserta singgahannya, sedangkan
 * `panels/ComparisonView.tsx` tidak membaca token sama sekali dan menuliskan
 * heks Tailwind langsung ke dalam kode gambar.
 *
 * Tiga salinan berarti tiga tempat yang bisa tertinggal saat palet berganti,
 * dan satu di antaranya memang sudah tertinggal: menara di peta dan di kedua
 * panel perbandingan digambar dengan slate `#0f172a`, bukan tinta konsol
 * `#0f2033`. Dua biru tua yang berbeda tipis untuk benda yang sama.
 *
 * Sekarang satu berkas ini yang membacanya, pola yang sama dengan
 * `map/colorRamp.ts`: satu fungsi, jadi tidak ada dua tempat yang bisa
 * berbeda warna tanpa mengubah berkas ini.
 */

export type CanvasToken = "ink" | "rain" | "signal" | "alert" | "ok";

/** Token kanal RGB, satu-satunya yang boleh disisipi alfa (lihat DESIGN.md). */
const CHANNEL_VAR: Record<CanvasToken, string> = {
  ink: "--text-rgb",
  rain: "--rain-rgb",
  signal: "--signal-rgb",
  alert: "--alert-rgb",
  ok: "--ok-rgb",
};

/** Hanya dipakai saat render di server, ketika `document` belum ada. */
const FALLBACK: Record<CanvasToken, string> = {
  ink: "15 32 51",
  rain: "31 111 208",
  signal: "184 114 13",
  alert: "195 63 38",
  ok: "13 125 100",
};

const PAPER_FALLBACK = "#ffffff";

let CACHE: Partial<Record<CanvasToken | "paper", string>> = {};

function read(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Kanal mentah sebuah token, mis. `"15 32 51"`. */
export function canvasChannels(token: CanvasToken): string {
  const hit = CACHE[token];
  if (hit) return hit;
  const v = read(CHANNEL_VAR[token], FALLBACK[token]);
  CACHE[token] = v;
  return v;
}

/** Warna kanvas siap pakai, dengan alfa opsional. */
export function canvasColor(token: CanvasToken, alpha = 1): string {
  return `rgb(${canvasChannels(token)} / ${alpha})`;
}

/** Tinta konsol — untuk penanda yang bukan pengukuran dan bukan status. */
export function inkCanvasColor(alpha = 1): string {
  return canvasColor("ink", alpha);
}

/**
 * Kertas konsol, dipakai sebagai garis luar penanda di atas peta.
 *
 * `--surface` ditulis sebagai heks, bukan kanal, jadi ia tidak menerima alfa.
 * Itu memang sengaja: kertas di sini selalu pekat — gunanya justru memisahkan
 * penanda dari apa pun yang ada di belakangnya.
 */
export function paperCanvasColor(): string {
  const hit = CACHE.paper;
  if (hit) return hit;
  const v = read("--surface", PAPER_FALLBACK);
  CACHE.paper = v;
  return v;
}

/** Hanya untuk pengujian: paksa baca ulang setelah tema berganti. */
export function resetCanvasTokens(): void {
  CACHE = {};
}
