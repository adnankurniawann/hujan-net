/**
 * Geometri dasar untuk lapisan DAS: uji titik dalam poligon dan pemetaan sel grid
 * ke koordinat. Fungsi murni, tanpa efek samping, tanpa impor React atau Next.
 *
 * ASUMSI YANG PERLU DIKONFIRMASI KE RADIT
 * `GridField.values` disebut "urutan baris demi baris" di Panduan bagian 3, tetapi
 * arah barisnya tidak dinyatakan. Modul ini memakai `south-to-north`, artinya
 * indeks baris 0 berada di `latMin`. Kalau ternyata sebaliknya, ubah
 * `gridRowOrder` di `data/catchment-config.json`, tidak perlu menyentuh kode.
 */

import type { GridField } from "../types.ts";
import type { CatchmentPolygon, Ring } from "./types.ts";

/** Jari jari bumi rata rata, km. Dipakai untuk perkiraan luas sel. */
const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Uji titik dalam satu cincin dengan algoritma ray casting.
 *
 * Sinar ditembakkan ke arah +lon. Untuk tiap rusuk, kalau rusuk itu memotong
 * garis lintang titik uji, potongan dihitung. Ganjil berarti di dalam.
 * Perbandingan `>` dan `<=` dipakai asimetris supaya verteks yang tepat berada
 * pada garis lintang uji tidak terhitung dua kali. Algoritma ini benar untuk
 * poligon cekung, bukan hanya cembung.
 *
 * @param lon derajat
 * @param lat derajat
 * @param ring cincin tertutup, pasangan [lon, lat]
 */
export function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = yi > lat !== yj > lat;
    if (!straddles) continue;
    // Garis lintang perpotongan rusuk (j -> i) pada `lat`.
    const xCross = xj + ((lat - yj) / (yi - yj)) * (xi - xj);
    if (lon < xCross) inside = !inside;
  }
  return inside;
}

/**
 * Uji titik dalam poligon: di dalam cincin luar dan tidak di dalam lubang mana pun.
 *
 * @param lon derajat
 * @param lat derajat
 */
export function pointInPolygon(
  lon: number,
  lat: number,
  polygon: CatchmentPolygon,
): boolean {
  const [lonMin, latMin, lonMax, latMax] = polygon.bbox;
  // Penyaring murah dulu. Sebagian besar sel grid tersingkir di sini.
  if (lon < lonMin || lon > lonMax || lat < latMin || lat > latMax) return false;

  if (!pointInRing(lon, lat, polygon.rings[0])) return false;
  for (let h = 1; h < polygon.rings.length; h++) {
    if (pointInRing(lon, lat, polygon.rings[h])) return false;
  }
  return true;
}

/** Hitung [lonMin, latMin, lonMax, latMax] dari sebuah cincin. */
export function ringBbox(ring: Ring): [number, number, number, number] {
  let lonMin = Infinity;
  let latMin = Infinity;
  let lonMax = -Infinity;
  let latMax = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < lonMin) lonMin = lon;
    if (lon > lonMax) lonMax = lon;
    if (lat < latMin) latMin = lat;
    if (lat > latMax) latMax = lat;
  }
  return [lonMin, latMin, lonMax, latMax];
}

/**
 * Koordinat pusat sel grid pada indeks datar `index`.
 *
 * @param index indeks ke `GridField.values`, 0 sampai nx*ny-1
 * @param southToNorth true kalau baris 0 berada di latMin
 */
export function cellCenter(
  field: GridField,
  index: number,
  southToNorth: boolean,
): { lon: number; lat: number } {
  const [lonMin, latMin, lonMax, latMax] = field.bbox;
  const ix = index % field.nx;
  const iyRaw = Math.floor(index / field.nx);
  const iy = southToNorth ? iyRaw : field.ny - 1 - iyRaw;

  const dLon = (lonMax - lonMin) / field.nx;
  const dLat = (latMax - latMin) / field.ny;
  return {
    lon: lonMin + (ix + 0.5) * dLon,
    lat: latMin + (iy + 0.5) * dLat,
  };
}

/**
 * Luas perkiraan satu sel grid, km persegi. Memakai pendekatan bidang datar dengan
 * koreksi kosinus lintang, cukup akurat untuk kotak batas sekecil hulu Ciliwung.
 *
 * Belum dipakai C1 karena akumulasi memakai rata rata sel, bukan jumlah berbobot luas.
 * Disediakan untuk C2 kalau nanti butuh volume, bukan kedalaman.
 */
export function cellAreaKm2(field: GridField): number {
  const [lonMin, latMin, lonMax, latMax] = field.bbox;
  const latMid = (latMin + latMax) / 2;
  const heightKm = ((latMax - latMin) / field.ny) * DEG_TO_RAD * EARTH_RADIUS_KM;
  const widthKm =
    ((lonMax - lonMin) / field.nx) *
    DEG_TO_RAD *
    EARTH_RADIUS_KM *
    Math.cos(latMid * DEG_TO_RAD);
  return widthKm * heightKm;
}
