/**
 * Status keamanan rute evakuasi — satu-satunya sumber kebenaran warnanya.
 *
 * Dipakai bersama oleh panel kanan, peta utama, dan jendela tinjauan rute.
 * Ketiganya memanggil fungsi ini, jadi ketiganya tidak bisa berbeda warna
 * tanpa mengubah berkas ini — pola yang sama dengan `map/colorRamp.ts`.
 *
 * TIDAK ADA RONA BARU DI SINI. Sebelumnya rute digambar dengan emerald, amber,
 * dan red bawaan Tailwind — tiga warna yang tidak ada di bahasa visual konsol
 * ini. Status rute adalah status, jadi ia memakai token status yang sudah ada:
 * `ok`, `signal`, `alert`. Ketiganya kebetulan juga merupakan tangga galat
 * rendah -> tinggi (`--scale-low` / `--scale-mid` / `--scale-high`) yang sudah
 * dipakai GradientMeter, jadi arah "makin ke kanan makin buruk" konsisten.
 */

import type { Tone } from "@/components/ui/primitives";
import { canvasColor, type CanvasToken } from "@/components/map/canvasTokens";

export type SafetyStatus = "AMAN" | "WASPADA" | "BAHAYA";

/**
 * Nada komponen untuk sebuah status rute. Dipakai `Chip`, `StatusDot`, dan
 * setiap teks yang menyebut status.
 */
export function safetyTone(status: SafetyStatus): Tone {
  if (status === "BAHAYA") return "alert";
  if (status === "WASPADA") return "signal";
  return "ok";
}

/**
 * Token kanvas untuk tiap status. Pembacaan dan singgahannya sendiri sudah
 * pindah ke `map/canvasTokens.ts` — dulu berkas ini memegang salinan keduanya,
 * dan dua salinan berarti dua tempat yang bisa tertinggal saat palet berganti.
 */
const SAFETY_TOKEN: Record<SafetyStatus, CanvasToken> = {
  AMAN: "ok",
  WASPADA: "signal",
  BAHAYA: "alert",
};

/** Warna garis rute untuk sebuah status, dengan alfa opsional. */
export function safetyCanvasColor(status: SafetyStatus, alpha = 1): string {
  return canvasColor(SAFETY_TOKEN[status], alpha);
}

/* Tinta dan kertas kanvas diteruskan dari sini supaya pemanggil di sekitar
   evakuasi tidak perlu tahu dua berkas sekaligus. */
export { inkCanvasColor, paperCanvasColor } from "@/components/map/canvasTokens";

/**
 * Kalimat penjelas status. Warna tidak pernah menjadi satu-satunya pembawa
 * arti, jadi setiap tempat yang menggambar status juga menuliskannya.
 */
export function safetyDescription(status: SafetyStatus): string {
  if (status === "BAHAYA") return "Hujan di sepanjang lintasan melewati 35 mm/jam";
  if (status === "WASPADA") return "Hujan di sepanjang lintasan melewati 15 mm/jam";
  return "Hujan di sepanjang lintasan di bawah 15 mm/jam";
}
