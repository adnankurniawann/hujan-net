// Statistik deret waktu secukupnya. Sengaja tanpa pustaka luar: yang dibutuhkan
// hanya tiga fungsi dan semuanya pendek.

/** Median satu larik. Nol untuk larik kosong. Larik masukan tidak diubah. */
export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

/**
 * Kuantil satu larik dengan interpolasi linear.
 *
 * @param values larik nilai, tidak perlu terurut dan tidak akan diubah
 * @param q kuantil pada rentang 0 sampai 1
 */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.min(sorted.length - 1, Math.max(0, q * (sorted.length - 1)));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Simpangan baku populasi. Nol untuk larik berisi kurang dari dua nilai. */
export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return Math.sqrt(sq / values.length);
}
