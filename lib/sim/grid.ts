// Geometri grid untuk medan hujan.
//
// `GridSpec` adalah grid tanpa nilai, `GridField` dari lib/types.ts adalah grid
// beserta nilainya. Keduanya memakai urutan baris demi baris, indeks
// iy * nx + ix, dengan iy = 0 pada tepi lintang terkecil (paling selatan).

import type { Coord, GridField } from "../types";

export interface GridSpec {
  bbox: [number, number, number, number]; // [lonMin, latMin, lonMax, latMax]
  nx: number;
  ny: number;
}

/** Jumlah sel grid. */
export function cellCount(grid: GridSpec): number {
  return grid.nx * grid.ny;
}

/** Titik tengah satu sel grid. */
export function cellCenter(grid: GridSpec, ix: number, iy: number): Coord {
  const [lonMin, latMin, lonMax, latMax] = grid.bbox;
  return {
    lon: lonMin + ((ix + 0.5) / grid.nx) * (lonMax - lonMin),
    lat: latMin + ((iy + 0.5) / grid.ny) * (latMax - latMin),
  };
}

/** Titik tengah seluruh sel, urutan baris demi baris. Dihitung sekali lalu dipakai ulang. */
export function cellCenters(grid: GridSpec): Coord[] {
  const out: Coord[] = new Array(cellCount(grid));
  for (let iy = 0; iy < grid.ny; iy++) {
    for (let ix = 0; ix < grid.nx; ix++) {
      out[iy * grid.nx + ix] = cellCenter(grid, ix, iy);
    }
  }
  return out;
}

/** Bungkus larik nilai menjadi `GridField` dengan geometri grid ini. */
export function toField(grid: GridSpec, values: number[]): GridField {
  return { bbox: grid.bbox, nx: grid.nx, ny: grid.ny, values };
}

/** Grid kosong, seluruh nilai nol. */
export function emptyField(grid: GridSpec): GridField {
  return toField(grid, new Array(cellCount(grid)).fill(0));
}

/**
 * Baca nilai medan pada satu koordinat sembarang memakai interpolasi bilinear
 * antar titik tengah sel. Koordinat di luar kotak batas dijepit ke tepi.
 *
 * @returns nilai medan, satuannya mengikuti medan yang dibaca (mm/jam)
 */
export function sampleField(field: GridField, at: Coord): number {
  const [lonMin, latMin, lonMax, latMax] = field.bbox;
  const { nx, ny, values } = field;

  // Posisi dalam ruang indeks titik tengah sel.
  const fx = ((at.lon - lonMin) / (lonMax - lonMin)) * nx - 0.5;
  const fy = ((at.lat - latMin) / (latMax - latMin)) * ny - 0.5;

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;

  const clampX = (i: number) => Math.min(nx - 1, Math.max(0, i));
  const clampY = (i: number) => Math.min(ny - 1, Math.max(0, i));

  const x0c = clampX(x0);
  const x1c = clampX(x0 + 1);
  const y0c = clampY(y0);
  const y1c = clampY(y0 + 1);

  const v00 = values[y0c * nx + x0c];
  const v10 = values[y0c * nx + x1c];
  const v01 = values[y1c * nx + x0c];
  const v11 = values[y1c * nx + x1c];

  const bottom = v00 + (v10 - v00) * tx;
  const top = v01 + (v11 - v01) * tx;
  return bottom + (top - bottom) * ty;
}

/** Nilai terbesar dalam medan. Nol untuk medan kosong. */
export function fieldMax(field: GridField): number {
  let max = 0;
  for (const v of field.values) if (v > max) max = v;
  return max;
}

/** Batas keanggotaan puncak: sel di atas pecahan ini dari nilai puncak ikut dihitung. */
export const PEAK_MEMBERSHIP_FRACTION = 0.7;

/**
 * Titik pusat puncak medan, dihitung sebagai titik berat sel sel teratas.
 *
 * Sel tunggal bernilai terbesar bukan penaksir posisi yang stabil: di sekitar
 * puncak medannya hampir datar, sehingga sel pemenang bisa melompat beberapa
 * kilometer hanya karena selisih sepersepuluh mm/jam. Titik berat kumpulan sel
 * di atas pecahan tertentu dari nilai puncak jauh lebih tenang, dan itulah yang
 * dipakai untuk membandingkan posisi puncak medan sebenarnya dengan
 * rekonstruksi.
 *
 * @param field medan yang diperiksa
 * @param fraction pecahan nilai puncak sebagai batas keanggotaan, 0 sampai 1
 */
export function fieldPeakCenter(
  field: GridField,
  fraction = PEAK_MEMBERSHIP_FRACTION,
): { value: number; at: Coord } {
  const max = fieldMax(field);
  if (max <= 0) return { value: 0, at: cellCenter(field, 0, 0) };

  const threshold = max * fraction;
  let wSum = 0;
  let latSum = 0;
  let lonSum = 0;

  for (let i = 0; i < field.values.length; i++) {
    const v = field.values[i];
    if (v < threshold) continue;
    const c = cellCenter(field, i % field.nx, Math.floor(i / field.nx));
    wSum += v;
    latSum += c.lat * v;
    lonSum += c.lon * v;
  }

  if (wSum === 0) return fieldPeak(field);
  return { value: max, at: { lat: latSum / wSum, lon: lonSum / wSum } };
}

/** Indeks sel bernilai terbesar, beserta koordinat titik tengahnya. */
export function fieldPeak(field: GridField): { value: number; at: Coord } {
  let best = 0;
  for (let i = 1; i < field.values.length; i++) {
    if (field.values[i] > field.values[best]) best = i;
  }
  const ix = best % field.nx;
  const iy = Math.floor(best / field.nx);
  return {
    value: field.values[best] ?? 0,
    at: cellCenter(field, ix, iy),
  };
}
