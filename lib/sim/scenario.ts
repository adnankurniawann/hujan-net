// Kejadian contoh yang dipakai dasbor dan demo.
//
// Satu kejadian, satu jam, badai konvektif bergerak dari tenggara ke barat laut
// melintasi hulu Ciliwung. Semua angka ajaib demo berkumpul di berkas ini,
// jadi menyetel demo tidak perlu menyentuh kode fisika.

import type { GridSpec } from "./grid.ts";
import { DEFAULT_EVENT_DURATION_S, type StormConfig } from "./rainField.ts";

/**
 * Kotak batas hulu Ciliwung: [lonMin, latMin, lonMax, latMax]. Kira kira 22 x 17 km.
 *
 * Diturunkan dari sebaran menara pada `data/links.json`, yang membentang
 * lon 106,8763 sampai 107,0483 dan lat -6,7525 sampai -6,6164, ditambah margin
 * sekitar 1 km di setiap sisi. Seluruh poligon DAS pada `data/catchments.geojson`
 * berada di dalam kotak ini, jadi akumulasi DAS pada C1 selalu mendapat sel grid.
 */
export const EVENT_BBOX: [number, number, number, number] = [
  106.86, -6.76, 107.06, -6.61,
];

/** Grid keluaran, resolusi kira kira 550 m per sel. */
export const EVENT_GRID: GridSpec = {
  bbox: EVENT_BBOX,
  nx: 40,
  ny: 30,
};

/** Panjang kejadian, detik. */
export const EVENT_DURATION_S = DEFAULT_EVENT_DURATION_S;

/** Jarak antar cuplikan, detik. Sesuai laju rekam manajemen jaringan operator. */
export const SAMPLE_INTERVAL_S = 15;

/** Jumlah cuplikan waktu sepanjang kejadian, termasuk t = 0. */
export const SAMPLE_COUNT = Math.floor(EVENT_DURATION_S / SAMPLE_INTERVAL_S) + 1;

/**
 * Badai contoh. Posisi sel adalah posisi pada t = 0, yaitu di tenggara kotak
 * batas. Pada pertengahan kejadian angin sudah membawanya ke tengah kotak,
 * tepat melintasi kumpulan tautan yang paling rapat.
 *
 * Ukuran sel dan intensitas puncaknya disetel ke apa yang benar benar bisa
 * dipulihkan oleh jaringan pada `data/links.json`. Jaringan itu membentang
 * 19 x 15 km dengan panjang lintasan 2,2 sampai 7,9 km, jadi ciri hujan yang
 * dapat dipisahkannya berada di orde 6 km. Sel yang jauh lebih kecil akan
 * terlanjur dikaburkan oleh proses rata rata lintasan, sedangkan sel yang jauh
 * lebih besar membuat seluruh tautan basah serentak sehingga tidak ada tautan
 * kering yang menambatkan tepi medan. Keduanya menaikkan RMSE tanpa menambah
 * satu pun informasi baru untuk demo.
 */
export const DEMO_STORM: StormConfig = {
  windBearingDeg: 320, // bergerak ke barat laut, menuruni lembah ke arah Jakarta
  windSpeedKmh: 18,
  durationS: EVENT_DURATION_S,
  cells: [
    { lat: -6.752, lon: 107.017, radiusKm: 3.0, peakMmH: 38 }, // sel utama
    { lat: -6.722, lon: 106.982, radiusKm: 2.2, peakMmH: 24 }, // sel pemuka
    { lat: -6.782, lon: 107.052, radiusKm: 2.6, peakMmH: 28 }, // sel pengekor
  ],
};

/** Daftar waktu cuplikan kejadian, detik. */
export function sampleTimes(): number[] {
  return Array.from({ length: SAMPLE_COUNT }, (_, i) => i * SAMPLE_INTERVAL_S);
}

/** Bulatkan waktu sembarang ke cuplikan terdekat, lalu jepit ke rentang kejadian. */
export function snapToSample(t: number): number {
  if (!Number.isFinite(t)) return 0;
  const clamped = Math.min(EVENT_DURATION_S, Math.max(0, t));
  return Math.round(clamped / SAMPLE_INTERVAL_S) * SAMPLE_INTERVAL_S;
}
