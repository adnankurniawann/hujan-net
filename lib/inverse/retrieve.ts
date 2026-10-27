// Langkah 4 dari model invers: dari redaman hujan menjadi intensitas hujan.
//
// Di sini fisika A1 dipakai terbalik. Hasilnya adalah satu angka per tautan per
// waktu, yaitu intensitas hujan rata rata sepanjang lintasan.

import type { Link } from "../types";
import {
  ituCoefficients,
  rainRateFromAttenuation,
} from "../physics/itu838.ts";

/**
 * Intensitas hujan rata rata lintasan dari redaman hujan.
 *
 * @param rainAttenDb redaman hujan sepanjang lintasan setelah koreksi antena basah, dB
 * @param link tautan, dipakai untuk panjang lintasan, frekuensi, dan polarisasi
 * @returns intensitas hujan rata rata lintasan, mm/jam
 */
export function retrieveRainRate(rainAttenDb: number, link: Link): number {
  const { k, alpha } = ituCoefficients(link.freqGHz, link.polarization);
  return rainRateFromAttenuation(rainAttenDb, link.lengthKm, k, alpha);
}
