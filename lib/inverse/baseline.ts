// Langkah 2 dari model invers: menaksir garis dasar kering.
//
// Garis dasar adalah tinggi daya terima seandainya tidak ada hujan. Kita tidak
// boleh memakai `baselineDb` dari simulator, karena itu kebenaran dasar yang di
// lapangan tidak pernah tersedia. Yang boleh dipakai hanya daya terima terukur
// dan hasil klasifikasi basah kering.
//
// Cara yang dipakai: median cuplikan kering pada jendela bergerak. Median dipilih
// karena tahan terhadap satu dua cuplikan basah yang lolos klasifikasi.

import type { LinkSample } from "../types";
import { dryReferenceLevel } from "./classify.ts";
import { median } from "./stats.ts";

export interface BaselineOptions {
  /** Setengah lebar jendela bergerak, jumlah cuplikan. */
  halfWindowSamples?: number;
}

const DEFAULTS: Required<BaselineOptions> = {
  halfWindowSamples: 60, // 60 cuplikan 15 detik, kira kira 15 menit ke tiap arah
};

/**
 * Taksiran garis dasar untuk setiap cuplikan satu tautan.
 *
 * Kalau di dalam jendela tidak ada satu pun cuplikan kering, misalnya di tengah
 * hujan panjang, dipakai acuan kering seluruh deret dari
 * {@link dryReferenceLevel}. Acuan itu dicari dari selubung atas sebaran, jadi
 * ia tetap sahih walau tautannya basah hampir sepanjang kejadian.
 *
 * @param samples deret cuplikan satu tautan, urut menurut waktu
 * @param isWet hasil klasifikasi, sepanjang `samples`
 * @returns taksiran garis dasar, dBm, sepanjang `samples`
 */
export function estimateBaseline(
  samples: readonly LinkSample[],
  isWet: readonly boolean[],
  options: BaselineOptions = {},
): number[] {
  const opt = { ...DEFAULTS, ...options };
  const n = samples.length;
  if (n === 0) return [];

  const levels = samples.map((s) => s.rxPowerDbm);
  const fallback = dryReferenceLevel(levels);

  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - opt.halfWindowSamples);
    const to = Math.min(n - 1, i + opt.halfWindowSamples);

    const dry: number[] = [];
    for (let j = from; j <= to; j++) {
      if (!isWet[j]) dry.push(levels[j]);
    }

    out[i] = dry.length > 0 ? median(dry) : fallback;
  }

  return out;
}

/**
 * Redaman total terukur: selisih garis dasar taksiran terhadap daya terima.
 *
 * @returns redaman total, dB, tidak pernah negatif
 */
export function totalAttenuation(
  samples: readonly LinkSample[],
  baseline: readonly number[],
): number[] {
  return samples.map((s, i) => Math.max(0, (baseline[i] ?? s.rxPowerDbm) - s.rxPowerDbm));
}
