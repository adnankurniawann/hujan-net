/**
 * Perhitungan perbandingan kerapatan pengamatan (tugas C4).
 *
 * Fungsi murni, tanpa efek samping. Jumlah tautan dihitung dari `data/links.json`
 * dan bukan diambil dari konfigurasi, supaya angkanya tidak pernah basi ketika
 * topologi tautan berubah. Satu satunya angka yang datang dari berkas konfigurasi
 * adalah jumlah penakar hujan, sesuai bunyi tugas C4.
 */

import type { Link } from "@/lib/types";

export interface DensityConfig {
  enabled: boolean;
  rainGaugeCount: number;
  verified: boolean;
  sourceLabel: string;
  bboxLabel: string;
}

export interface DensityStats {
  linkCount: number;
  rainGaugeCount: number;
  /** Berapa tautan per satu penakar hujan, dibulatkan. */
  ratio: number;
  /** Rasio siap tampil, mis. "1 : 17". */
  ratioLabel: string;
  /** Jumlah panjang seluruh lintasan tautan, km. */
  totalPathKm: number;
  /** [lonMin, latMin, lonMax, latMax] dihitung dari ujung ujung tautan. */
  bbox: [number, number, number, number];
}

/** Kotak batas yang benar benar dicakup daftar tautan. */
export function linksBbox(links: ReadonlyArray<Link>): [number, number, number, number] {
  let lonMin = Infinity;
  let latMin = Infinity;
  let lonMax = -Infinity;
  let latMax = -Infinity;
  for (const link of links) {
    for (const site of [link.siteA, link.siteB]) {
      if (site.lon < lonMin) lonMin = site.lon;
      if (site.lon > lonMax) lonMax = site.lon;
      if (site.lat < latMin) latMin = site.lat;
      if (site.lat > latMax) latMax = site.lat;
    }
  }
  return [lonMin, latMin, lonMax, latMax];
}

/**
 * Hitung statistik kerapatan.
 *
 * @param links daftar tautan, biasanya seluruh isi `data/links.json`
 * @param config isi `data/density-config.json`
 */
export function densityStats(
  links: ReadonlyArray<Link>,
  config: DensityConfig,
): DensityStats {
  const linkCount = links.length;
  const gauges = Math.max(0, Math.floor(config.rainGaugeCount));

  // Nol penakar hujan bukan pembagian nol yang boleh menghasilkan Infinity di layar.
  const ratio = gauges > 0 ? Math.round(linkCount / gauges) : 0;
  const ratioLabel = gauges > 0 ? `1 : ${ratio}` : "-";

  const totalPathKm = links.reduce((sum, l) => sum + (Number.isFinite(l.lengthKm) ? l.lengthKm : 0), 0);

  return {
    linkCount,
    rainGaugeCount: gauges,
    ratio,
    ratioLabel,
    totalPathKm,
    bbox: linksBbox(links),
  };
}
