// Langkah 6 dari model invers: mengukur galat.
//
// Ini yang tidak bisa dilakukan tim yang memakai data acak. Karena medan
// sebenarnya kita ketahui, galat rekonstruksi bisa dinyatakan sebagai satu angka
// dengan satuan yang jelas.

import type { GridField } from "../types";

/**
 * Akar rata rata kuadrat galat antara dua medan pada grid yang sama.
 *
 * @param truth medan sebenarnya, mm/jam
 * @param estimate medan hasil rekonstruksi, mm/jam
 * @returns RMSE, mm/jam. Nol untuk medan kosong.
 */
export function computeRmse(truth: GridField, estimate: GridField): number {
  const n = Math.min(truth.values.length, estimate.values.length);
  if (n === 0) return 0;

  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = truth.values[i] - estimate.values[i];
    sq += d * d;
  }
  return Math.sqrt(sq / n);
}

/**
 * Bias rata rata rekonstruksi terhadap kebenaran dasar.
 * Negatif berarti rekonstruksi cenderung menaksir terlalu rendah.
 *
 * @returns bias, mm/jam
 */
export function computeBias(truth: GridField, estimate: GridField): number {
  const n = Math.min(truth.values.length, estimate.values.length);
  if (n === 0) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) sum += estimate.values[i] - truth.values[i];
  return sum / n;
}
