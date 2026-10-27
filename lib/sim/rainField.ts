// Simulator medan hujan.
//
// Medan dibangun dari beberapa sel Gauss yang bergerak mengikuti vektor angin.
// Intensitas seluruh badai dikalikan satu amplop waktu, sehingga kejadiannya
// punya awal yang tenang, puncak, dan akhir yang kembali tenang.
//
// Fungsi murni: hasil hanya bergantung pada argumen, tidak ada keadaan tersimpan.

import type { Coord, GridField } from "../types";
import { distanceKm, offsetKm } from "./geo.ts";
import { cellCenters, type GridSpec, toField } from "./grid.ts";

export interface RainCell {
  lat: number;
  lon: number;
  radiusKm: number; // jarak dari pusat tempat intensitas turun menjadi separuh puncak
  peakMmH: number; // intensitas di pusat sel pada puncak amplop waktu, mm/jam
}

export interface StormConfig {
  cells: RainCell[];
  windBearingDeg: number; // arah gerak sel, derajat dari utara searah jarum jam
  windSpeedKmh: number;
  durationS?: number; // panjang kejadian, detik. Bawaan DEFAULT_EVENT_DURATION_S
}

/** Panjang kejadian bawaan, detik. Satu jam adalah lamanya hujan konvektif khas Bogor. */
export const DEFAULT_EVENT_DURATION_S = 3600;

const SECONDS_PER_HOUR = 3600;
const HALF_PEAK_DECAY = Math.LN2; // supaya nilai pada d = radiusKm tepat separuh puncak

/**
 * Amplop waktu badai, tanpa satuan, rentang 0 sampai 1.
 *
 * Bentuknya kosinus terangkat: tepat nol pada awal dan akhir kejadian, satu di
 * tengah. Karena nol di t = 0, dasbor selalu terbuka dalam keadaan cerah.
 *
 * @param t detik sejak awal kejadian
 * @param durationS panjang kejadian, detik
 */
export function stormEnvelope(t: number, durationS = DEFAULT_EVENT_DURATION_S): number {
  if (!Number.isFinite(t) || durationS <= 0) return 0;
  if (t <= 0 || t >= durationS) return 0;
  return 0.5 * (1 - Math.cos((2 * Math.PI * t) / durationS));
}

/**
 * Posisi satu sel hujan pada waktu t, setelah digeser oleh angin.
 *
 * @param t detik sejak awal kejadian
 */
export function cellPositionAt(cell: RainCell, cfg: StormConfig, t: number) {
  const travelKm = (cfg.windSpeedKmh * t) / SECONDS_PER_HOUR;
  return offsetKm({ lat: cell.lat, lon: cell.lon }, cfg.windBearingDeg, travelKm);
}

/** Di luar tiga kali radius, sumbangan satu sel di bawah 0,04 persen puncaknya. */
const CUTOFF_RADII = 3;

/**
 * Intensitas hujan pada satu titik sembarang, tanpa melewati grid.
 *
 * Model maju memakai fungsi ini supaya pencuplikan sepanjang lintasan memakai
 * medan analitik, bukan medan yang sudah didiskretkan. Dengan begitu galat
 * diskretisasi grid tidak ikut masuk ke redaman "sebenarnya".
 *
 * @param cfg konfigurasi badai
 * @param t detik sejak awal kejadian
 * @param at koordinat yang ditanya
 * @returns intensitas hujan, mm/jam
 */
export function rainRateAt(cfg: StormConfig, t: number, at: Coord): number {
  const env = stormEnvelope(t, cfg.durationS ?? DEFAULT_EVENT_DURATION_S);
  if (env <= 0) return 0;

  let sum = 0;
  for (const cell of cfg.cells) {
    if (cell.peakMmH <= 0 || cell.radiusKm <= 0) continue;
    const center = cellPositionAt(cell, cfg, t);
    const d = distanceKm(at, center);
    if (d > cell.radiusKm * CUTOFF_RADII) continue;
    const r = d / cell.radiusKm;
    sum += cell.peakMmH * env * Math.exp(-HALF_PEAK_DECAY * r * r);
  }
  return sum;
}

/**
 * Medan hujan pada satu waktu.
 *
 * @param cfg konfigurasi badai
 * @param t detik sejak awal kejadian
 * @param grid geometri grid keluaran
 * @returns medan intensitas hujan, mm/jam, urutan baris demi baris
 */
export function rainFieldAt(cfg: StormConfig, t: number, grid: GridSpec): GridField {
  const env = stormEnvelope(t, cfg.durationS ?? DEFAULT_EVENT_DURATION_S);
  const centers = cellCenters(grid);
  const values = new Array<number>(centers.length).fill(0);

  if (env <= 0) return toField(grid, values);

  for (const cell of cfg.cells) {
    if (cell.peakMmH <= 0 || cell.radiusKm <= 0) continue;
    const center = cellPositionAt(cell, cfg, t);
    const peak = cell.peakMmH * env;
    const cutoffKm = cell.radiusKm * CUTOFF_RADII;

    for (let i = 0; i < centers.length; i++) {
      const d = distanceKm(centers[i], center);
      if (d > cutoffKm) continue;
      const r = d / cell.radiusKm;
      values[i] += peak * Math.exp(-HALF_PEAK_DECAY * r * r);
    }
  }

  return toField(grid, values);
}
