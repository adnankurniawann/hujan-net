// Langkah 3 dari model invers: koreksi redaman antena basah.
//
// Lapisan air di kubah antena menambah redaman yang tidak berasal dari hujan
// sepanjang lintasan. Kalau tidak dikurangi, seluruh taksiran hujan akan
// berlebih, dan pada tautan pendek kelebihannya bisa berkali kali lipat karena
// redaman antena tidak ikut dibagi panjang lintasan.

/**
 * Konstanta koreksi redaman antena basah, dB.
 *
 * Nilai ini adalah parameter kalibrasi model invers, bukan angka yang dibaca
 * dari simulator. Di lapangan ia ditera dari kejadian hujan ringan yang
 * redaman lintasannya hampir nol. Kebetulan nilainya sama dengan yang dipakai
 * model maju, dan memang harus begitu supaya rekonstruksi tidak berbias.
 */
export const WAA_CORRECTION_DB = 1.5;

/**
 * Kurangi redaman antena basah dari redaman total.
 *
 * @param totalAttenDb redaman total terukur, dB
 * @param isWet status basah hasil klasifikasi
 * @param waaDb konstanta redaman antena basah, dB
 * @returns redaman yang tersisa untuk hujan sepanjang lintasan, dB, tidak pernah negatif
 */
export function correctWaa(
  totalAttenDb: number,
  isWet: boolean,
  waaDb: number = WAA_CORRECTION_DB,
): number {
  if (!Number.isFinite(totalAttenDb) || totalAttenDb <= 0) return 0;
  if (!isWet) return 0;
  return Math.max(0, totalAttenDb - waaDb);
}
