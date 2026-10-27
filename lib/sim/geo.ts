// Geometri bumi lokal, versi sederhana.
//
// Seluruh kotak batas proyek ini kurang dari 30 km, jadi proyeksi bidang datar
// dengan koreksi kosinus lintang sudah cukup. Galatnya di bawah satu meter
// pada jarak segini, jauh lebih kecil daripada ketidakpastian fisikanya.

import type { Coord } from "../types";

/** Panjang satu derajat lintang, km. */
export const KM_PER_DEG_LAT = 110.574;

const DEG = Math.PI / 180;

/** Panjang satu derajat bujur pada lintang tertentu, km. */
export function kmPerDegLon(lat: number): number {
  return 111.32 * Math.cos(lat * DEG);
}

/** Jarak antara dua koordinat, km. */
export function distanceKm(a: Coord, b: Coord): number {
  const dy = (b.lat - a.lat) * KM_PER_DEG_LAT;
  const dx = (b.lon - a.lon) * kmPerDegLon((a.lat + b.lat) / 2);
  return Math.hypot(dx, dy);
}

/**
 * Geser satu koordinat sejauh jarak tertentu menurut arah kompas.
 *
 * @param from titik awal
 * @param bearingDeg arah gerak, derajat dari utara searah jarum jam. 0 = utara, 90 = timur.
 * @param distKm jarak, km
 */
export function offsetKm(from: Coord, bearingDeg: number, distKm: number): Coord {
  const north = Math.cos(bearingDeg * DEG) * distKm;
  const east = Math.sin(bearingDeg * DEG) * distKm;
  const lat = from.lat + north / KM_PER_DEG_LAT;
  return { lat, lon: from.lon + east / kmPerDegLon(from.lat) };
}

/**
 * Titik titik cuplikan yang tersebar merata sepanjang lintasan dua menara.
 * Dipakai baik oleh model maju maupun model invers, supaya keduanya memakai
 * definisi "sepanjang lintasan" yang sama persis.
 *
 * @param a menara pertama
 * @param b menara kedua
 * @param n jumlah titik cuplikan, minimal 1
 */
export function pathSamplePoints(a: Coord, b: Coord, n: number): Coord[] {
  const count = Math.max(1, Math.floor(n));
  const points: Coord[] = new Array(count);
  for (let i = 0; i < count; i++) {
    // Titik tengah tiap segmen, bukan titik ujung, supaya integrasi lintasan
    // memakai aturan titik tengah dan tidak memberi bobot lebih pada ujung.
    const f = (i + 0.5) / count;
    points[i] = {
      lat: a.lat + (b.lat - a.lat) * f,
      lon: a.lon + (b.lon - a.lon) * f,
    };
  }
  return points;
}
