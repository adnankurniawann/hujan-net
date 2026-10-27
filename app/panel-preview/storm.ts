/**
 * Badai sintetis untuk pratinjau panel C3.
 *
 * HANYA UNTUK PENGEMBANGAN. Ini bukan simulator sungguhan: A2 dan A3 milik Radit
 * yang mengerjakan itu, dan modul ini akan dibuang begitu A5 tersedia. Fungsinya
 * cuma satu, memberi `lib/catchment` masukan berbentuk `GridField` supaya panel C3
 * bisa dilihat, diuji, dan ditangkap layar sebelum lapisan simulasi selesai.
 *
 * Bentuknya sengaja sama dengan medan yang dipakai harness verifikasi C1 dan C2,
 * jadi angka yang muncul di layar bisa dicocokkan dengan hasil pengujian.
 */

import type { GridField } from "@/lib/types";

/** Kotak batas mengikuti cakupan data/links.json hasil T0. */
const BBOX: [number, number, number, number] = [106.87, -6.76, 107.05, -6.61];
const NX = 96;
const NY = 96;

/** Durasi kejadian, detik. Dua jam, cukup untuk mengisi jendela 1 jam. */
export const EVENT_DURATION_SEC = 7200;

/** Selang cuplikan, detik. Sesuai A3. */
const SAMPLE_STEP_SEC = 15;

/** Intensitas puncak sel hujan, mm/jam. */
const PEAK_MM_H = 85;

/** Kuadrat jari jari sel Gauss dalam km, dipakai sebagai 2*sigma^2. */
const CELL_SPREAD = 72;

/** Derajat lintang dan bujur ke km pada lintang hulu Ciliwung. */
const KM_PER_DEG_LON = 111;
const KM_PER_DEG_LAT = 110;

function fieldAt(t: number): GridField {
  const progress = t / EVENT_DURATION_SEC;
  // Sel bergerak dari timur laut ke barat daya, meniru arah angin muson barat.
  const centerLon = 107.03 - progress * 0.14;
  const centerLat = -6.66 - progress * 0.05;
  // Amplop waktu: kejadian punya awal, puncak, dan akhir.
  const envelope = Math.sin(Math.PI * progress) ** 2;

  const values = new Array<number>(NX * NY);
  const dLon = (BBOX[2] - BBOX[0]) / NX;
  const dLat = (BBOX[3] - BBOX[1]) / NY;

  for (let i = 0; i < values.length; i++) {
    const lon = BBOX[0] + ((i % NX) + 0.5) * dLon;
    const lat = BBOX[1] + (Math.floor(i / NX) + 0.5) * dLat;
    const dx = (lon - centerLon) * KM_PER_DEG_LON;
    const dy = (lat - centerLat) * KM_PER_DEG_LAT;
    values[i] = PEAK_MM_H * envelope * Math.exp(-(dx * dx + dy * dy) / CELL_SPREAD);
  }

  return { bbox: BBOX, nx: NX, ny: NY, values };
}

/** Seluruh bingkai kejadian. Deterministik, jadi id kandidat peringatan stabil. */
export function stormFrames(): { t: number; field: GridField }[] {
  const frames: { t: number; field: GridField }[] = [];
  for (let t = 0; t <= EVENT_DURATION_SEC; t += SAMPLE_STEP_SEC) {
    frames.push({ t, field: fieldAt(t) });
  }
  return frames;
}
