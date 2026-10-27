/**
 * Pemformat angka untuk panel operator.
 *
 * Panduan bagian 6: satuan selalu ditulis, dan setiap angka memakai monospace.
 * Kelas `font-mono` dipasang di komponen, fungsi di sini hanya mengurus teksnya.
 */

/** Kedalaman hujan, mm, satu angka di belakang koma. */
export function mm(value: number): string {
  return `${value.toFixed(1)} mm`;
}

/** Ambang, mm, tanpa angka di belakang koma karena selalu bilangan bulat di config. */
export function mmWhole(value: number): string {
  return `${Math.round(value)} mm`;
}

/** Persentase terhadap ambang. Di atas 999 persen dipotong supaya tata letak tidak pecah. */
export function percentOf(value: number, threshold: number): string {
  if (!Number.isFinite(threshold) || threshold <= 0) return "-";
  const pct = Math.round((value / threshold) * 100);
  return `${Math.min(pct, 999)} %`;
}

/**
 * Waktu simulasi dalam format `mm:ss`, sesuai kesepakatan B6.
 * Ini BUKAN waktu dinding. Lihat catatan dua sumbu waktu di `lib/alerts/README.md`.
 */
export function simClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Waktu dinding `HH:MM:SS` dari milidetik epoch, untuk cap waktu keputusan operator. */
export function wallClock(epochMs: number): string {
  const d = new Date(epochMs);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

/** Nama jendela akumulasi yang bisa dibaca operator. */
export function windowLabel(key: "accum1h" | "accum3h" | "accum6h"): string {
  return key === "accum1h" ? "1 JAM" : key === "accum3h" ? "3 JAM" : "6 JAM";
}
