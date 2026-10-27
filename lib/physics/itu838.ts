// Model redaman hujan ITU-R P.838.
//
// Hubungan dasarnya adalah hukum pangkat gamma = k * R^alpha, dengan gamma
// redaman spesifik dalam dB/km dan R intensitas hujan dalam mm/jam. Koefisien
// k dan alpha bergantung pada frekuensi dan polarisasi.
//
// Berkas ini murni: tidak ada efek samping, tidak ada impor dari React atau
// Next, dan hasilnya hanya bergantung pada argumen.

/** Batas bawah intensitas yang dianggap hujan, mm/jam. Di bawah ini hasil inversi dibulatkan ke nol. */
const MIN_RAIN_MM_H = 1e-6;

/** Koefisien satu baris tabel: satu frekuensi, dua polarisasi. */
interface CoefficientRow {
  freqGHz: number;
  kH: number;
  alphaH: number;
  kV: number;
  alphaV: number;
}

/**
 * Tabel koefisien Rekomendasi ITU-R P.838-3, Tabel 1 dan 2.
 * Sumber: ITU-R P.838-3, "Specific attenuation model for rain for use in
 * prediction methods", Jenewa, Maret 2005.
 * Berkas resmi: r-rec-p.838-3-200503-i!!pdf-e.pdf, unduhan langsung dari itu.int.
 *
 * DISALIN ULANG DARI DOKUMEN RESMI PADA 11 AGUSTUS 2026, TIAP 1 GHz.
 *
 * Versi sebelumnya hanya memuat sembilan baris pilihan dan mengandung EMPAT
 * angka yang salah salin:
 *
 *   18 GHz kV      0,07574  ->  0,07708   (meleset 1,8 persen)
 *   18 GHz alphaV  1,0022   ->  1,0025
 *   25 GHz alphaH  1,0      ->  0,9991
 *   35 GHz alphaH  0,904    ->  0,9047
 *
 * Kesalahan itu TIDAK PERNAH TERLIHAT pada angka mutu kami, karena model maju
 * dan model invers memanggil fungsi yang sama, sehingga kesalahannya saling
 * meniadakan dengan tepat. Itu wujud nyata inverse crime: galat yang hanya
 * muncul begitu bertemu data lapangan. Lihat PENJELASAN.md bagian 9.
 *
 * Rentangnya kini 7 sampai 40 GHz, bukan 10 sampai 40. Alasannya OpenMRG, yang
 * dipakai pada Lapis 3, memuat tautan mulai 7 GHz. Dengan tabel lama, tautan
 * 7 GHz akan dijepit menjadi 10 GHz dan hasilnya salah tanpa peringatan apa pun.
 *
 * Tabel per 1 GHz juga memperkecil galat interpolasi dibandingkan tabel jarang.
 */
const P838_TABLE: readonly CoefficientRow[] = [
  { freqGHz: 7, kH: 0.001915, alphaH: 1.481, kV: 0.001425, alphaV: 1.4745 },
  { freqGHz: 8, kH: 0.004115, alphaH: 1.3905, kV: 0.00345, alphaV: 1.3797 },
  { freqGHz: 9, kH: 0.007535, alphaH: 1.3155, kV: 0.006691, alphaV: 1.2895 },
  { freqGHz: 10, kH: 0.01217, alphaH: 1.2571, kV: 0.01129, alphaV: 1.2156 },
  { freqGHz: 11, kH: 0.01772, alphaH: 1.214, kV: 0.01731, alphaV: 1.1617 },
  { freqGHz: 12, kH: 0.02386, alphaH: 1.1825, kV: 0.02455, alphaV: 1.1216 },
  { freqGHz: 13, kH: 0.03041, alphaH: 1.1586, kV: 0.03266, alphaV: 1.0901 },
  { freqGHz: 14, kH: 0.03738, alphaH: 1.1396, kV: 0.04126, alphaV: 1.0646 },
  { freqGHz: 15, kH: 0.04481, alphaH: 1.1233, kV: 0.05008, alphaV: 1.044 },
  { freqGHz: 16, kH: 0.05282, alphaH: 1.1086, kV: 0.05899, alphaV: 1.0273 },
  { freqGHz: 17, kH: 0.06146, alphaH: 1.0949, kV: 0.06797, alphaV: 1.0137 },
  { freqGHz: 18, kH: 0.07078, alphaH: 1.0818, kV: 0.07708, alphaV: 1.0025 },
  { freqGHz: 19, kH: 0.08084, alphaH: 1.0691, kV: 0.08642, alphaV: 0.993 },
  { freqGHz: 20, kH: 0.09164, alphaH: 1.0568, kV: 0.09611, alphaV: 0.9847 },
  { freqGHz: 21, kH: 0.1032, alphaH: 1.0447, kV: 0.1063, alphaV: 0.9771 },
  { freqGHz: 22, kH: 0.1155, alphaH: 1.0329, kV: 0.117, alphaV: 0.97 },
  { freqGHz: 23, kH: 0.1286, alphaH: 1.0214, kV: 0.1284, alphaV: 0.963 },
  { freqGHz: 24, kH: 0.1425, alphaH: 1.0101, kV: 0.1404, alphaV: 0.9561 },
  { freqGHz: 25, kH: 0.1571, alphaH: 0.9991, kV: 0.1533, alphaV: 0.9491 },
  { freqGHz: 26, kH: 0.1724, alphaH: 0.9884, kV: 0.1669, alphaV: 0.9421 },
  { freqGHz: 27, kH: 0.1884, alphaH: 0.978, kV: 0.1813, alphaV: 0.9349 },
  { freqGHz: 28, kH: 0.2051, alphaH: 0.9679, kV: 0.1964, alphaV: 0.9277 },
  { freqGHz: 29, kH: 0.2224, alphaH: 0.958, kV: 0.2124, alphaV: 0.9203 },
  { freqGHz: 30, kH: 0.2403, alphaH: 0.9485, kV: 0.2291, alphaV: 0.9129 },
  { freqGHz: 31, kH: 0.2588, alphaH: 0.9392, kV: 0.2465, alphaV: 0.9055 },
  { freqGHz: 32, kH: 0.2778, alphaH: 0.9302, kV: 0.2646, alphaV: 0.8981 },
  { freqGHz: 33, kH: 0.2972, alphaH: 0.9214, kV: 0.2833, alphaV: 0.8907 },
  { freqGHz: 34, kH: 0.3171, alphaH: 0.9129, kV: 0.3026, alphaV: 0.8834 },
  { freqGHz: 35, kH: 0.3374, alphaH: 0.9047, kV: 0.3224, alphaV: 0.8761 },
  { freqGHz: 36, kH: 0.358, alphaH: 0.8967, kV: 0.3427, alphaV: 0.869 },
  { freqGHz: 37, kH: 0.3789, alphaH: 0.889, kV: 0.3633, alphaV: 0.8621 },
  { freqGHz: 38, kH: 0.4001, alphaH: 0.8816, kV: 0.3844, alphaV: 0.8552 },
  { freqGHz: 39, kH: 0.4215, alphaH: 0.8743, kV: 0.4058, alphaV: 0.8486 },
  { freqGHz: 40, kH: 0.4431, alphaH: 0.8673, kV: 0.4274, alphaV: 0.8421 },
];

const FREQ_MIN_GHZ = P838_TABLE[0].freqGHz;
const FREQ_MAX_GHZ = P838_TABLE[P838_TABLE.length - 1].freqGHz;

function pick(row: CoefficientRow, pol: "H" | "V"): { k: number; alpha: number } {
  return pol === "H"
    ? { k: row.kH, alpha: row.alphaH }
    : { k: row.kV, alpha: row.alphaV };
}

/**
 * Koefisien k dan alpha ITU-R P.838 untuk satu frekuensi dan polarisasi.
 *
 * Untuk frekuensi di antara baris tabel, k diinterpolasi secara logaritmik
 * (log k terhadap log f mendekati garis lurus) dan alpha diinterpolasi secara
 * linear. Ini persis prosedur yang dianjurkan Rekomendasi.
 *
 * @param freqGHz frekuensi pembawa, GHz. Di luar 10 sampai 40 GHz dijepit ke tepi tabel.
 * @param pol polarisasi, "H" atau "V"
 * @returns k tanpa satuan dan alpha tanpa satuan, dipakai pada gamma = k * R^alpha
 */
export function ituCoefficients(
  freqGHz: number,
  pol: "H" | "V",
): { k: number; alpha: number } {
  if (!Number.isFinite(freqGHz)) return pick(P838_TABLE[0], pol);

  const f = Math.min(FREQ_MAX_GHZ, Math.max(FREQ_MIN_GHZ, freqGHz));

  let hi = 1;
  while (hi < P838_TABLE.length - 1 && P838_TABLE[hi].freqGHz < f) hi++;
  const lower = P838_TABLE[hi - 1];
  const upper = P838_TABLE[hi];

  if (f === lower.freqGHz) return pick(lower, pol);
  if (f === upper.freqGHz) return pick(upper, pol);

  const a = pick(lower, pol);
  const b = pick(upper, pol);

  // Pecahan jarak dalam ruang logaritmik frekuensi.
  const w =
    (Math.log(f) - Math.log(lower.freqGHz)) /
    (Math.log(upper.freqGHz) - Math.log(lower.freqGHz));

  return {
    k: Math.exp(Math.log(a.k) + w * (Math.log(b.k) - Math.log(a.k))),
    alpha: a.alpha + w * (b.alpha - a.alpha),
  };
}

/**
 * Model maju: intensitas hujan menjadi redaman spesifik.
 *
 * @param rainMmH intensitas hujan, mm/jam. Nilai negatif diperlakukan sebagai nol.
 * @param k koefisien k dari {@link ituCoefficients}, tanpa satuan
 * @param alpha koefisien alpha dari {@link ituCoefficients}, tanpa satuan
 * @returns redaman spesifik, dB/km. Selalu nol atau positif, tidak pernah NaN.
 */
export function specificAttenuation(
  rainMmH: number,
  k: number,
  alpha: number,
): number {
  if (!Number.isFinite(rainMmH) || rainMmH <= 0) return 0;
  if (!Number.isFinite(k) || !Number.isFinite(alpha) || k <= 0 || alpha <= 0) {
    return 0;
  }
  return k * Math.pow(rainMmH, alpha);
}

/**
 * Model invers: redaman total sepanjang lintasan menjadi intensitas hujan
 * rata rata lintasan. Ini kebalikan tepat dari {@link specificAttenuation}
 * setelah redaman dibagi panjang lintasan.
 *
 * @param attenDb redaman hujan total sepanjang lintasan, dB. Nilai negatif dianggap nol.
 * @param lengthKm panjang lintasan, km. Nol atau negatif menghasilkan nol.
 * @param k koefisien k dari {@link ituCoefficients}, tanpa satuan
 * @param alpha koefisien alpha dari {@link ituCoefficients}, tanpa satuan
 * @returns intensitas hujan rata rata lintasan, mm/jam. Selalu nol atau positif, tidak pernah NaN.
 */
export function rainRateFromAttenuation(
  attenDb: number,
  lengthKm: number,
  k: number,
  alpha: number,
): number {
  if (!Number.isFinite(attenDb) || attenDb <= 0) return 0;
  if (!Number.isFinite(lengthKm) || lengthKm <= 0) return 0;
  if (!Number.isFinite(k) || !Number.isFinite(alpha) || k <= 0 || alpha <= 0) {
    return 0;
  }
  const gamma = attenDb / lengthKm; // dB/km
  const rain = Math.pow(gamma / k, 1 / alpha);
  return rain < MIN_RAIN_MM_H ? 0 : rain;
}

/**
 * Redaman ruang bebas Friis.
 *
 * Dipakai untuk menyusun anggaran daya tautan, bukan untuk inversi hujan.
 * Rumusnya: 92,45 + 20 log10(f) + 20 log10(d), dengan f dalam GHz dan d dalam km.
 *
 * @param lengthKm panjang lintasan, km. Nol atau negatif menghasilkan nol.
 * @param freqGHz frekuensi pembawa, GHz. Nol atau negatif menghasilkan nol.
 * @returns redaman ruang bebas, dB. Tidak pernah NaN.
 */
export function freeSpacePathLoss(lengthKm: number, freqGHz: number): number {
  if (!Number.isFinite(lengthKm) || lengthKm <= 0) return 0;
  if (!Number.isFinite(freqGHz) || freqGHz <= 0) return 0;
  return 92.45 + 20 * Math.log10(freqGHz) + 20 * Math.log10(lengthKm);
}
