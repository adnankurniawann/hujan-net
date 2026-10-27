/**
 * Pendeteksian kandidat peringatan dari rangkaian status DAS.
 *
 * Seluruh berkas ini murni: tidak menyentuh basis data, tidak menyentuh jaringan.
 * Ini disengaja, supaya aturan tata kelola yang paling penting, yaitu bahwa sistem
 * tidak pernah menyiarkan apa pun sendiri, bisa dibuktikan dengan pengujian biasa.
 *
 * Keluaran fungsi di sini hanyalah deskripsi "ambang terlampaui pada detik ke sekian".
 * Tidak ada satu pun jalur di berkas ini yang bisa menghasilkan status selain
 * `menunggu`, karena berkas ini memang tidak pernah menulis status sama sekali.
 */

import type { CatchmentState } from "../types.ts";
import type { CatchmentConfig, WindowKey } from "../catchment/index.ts";
import { resolveStatus, thresholdsFor } from "../catchment/index.ts";
import type { AlertLevel, AlertSeed } from "./types.ts";

/** Urutan keparahan status DAS. Dipakai untuk mendeteksi tepi naik. */
const SEVERITY: Record<CatchmentState["status"], number> = {
  normal: 0,
  waspada: 1,
  siaga: 2,
};

/** Satu bingkai waktu: status seluruh DAS pada detik `t`. */
export interface CatchmentTimelineFrame {
  /** detik sejak awal kejadian */
  t: number;
  states: ReadonlyArray<CatchmentState>;
}

/** Bentuk id kandidat. Deterministik, sehingga pendeteksian ulang bersifat idempoten. */
export function alertId(
  eventId: string,
  catchmentId: string,
  level: AlertLevel,
  raisedAtSec: number,
): string {
  return `${eventId}:${catchmentId}:${level}:${raisedAtSec}`;
}

/** Akumulasi pada satu jendela, dibaca dari `CatchmentState`. */
function accumOf(state: CatchmentState, key: WindowKey): number {
  return key === "accum1h" ? state.accum1h : key === "accum3h" ? state.accum3h : state.accum6h;
}

/**
 * Cari seluruh tepi naik keparahan sepanjang rentang waktu kejadian.
 *
 * Kandidat dibuat hanya saat keparahan NAIK, bukan selama keparahan bertahan.
 * Tanpa aturan ini, cuplikan tiap 15 detik akan melahirkan ratusan kandidat kembar
 * untuk satu badai yang sama, dan antrean operator jadi tidak terpakai.
 *
 * Perilaku pada kasus yang perlu dijelaskan ke juri:
 * - `normal` langsung ke `siaga` menghasilkan satu kandidat siaga, bukan dua.
 * - `waspada` naik ke `siaga` menghasilkan kandidat siaga baru. Yang waspada
 *   dibiarkan apa adanya, karena operator mungkin sudah memutuskan sesuatu di sana.
 * - Turun ke `normal` lalu naik lagi menghasilkan kandidat baru, karena itu memang
 *   kejadian kedua, bukan kelanjutan kejadian pertama.
 *
 * @param timeline bingkai berurutan menaik menurut `t`
 * @param config konfigurasi DAS, dipakai untuk menentukan jendela penentu
 * @param eventId pengenal kejadian simulasi
 */
export function detectCandidates(
  timeline: ReadonlyArray<CatchmentTimelineFrame>,
  config: CatchmentConfig,
  eventId: string,
): AlertSeed[] {
  if (!eventId) throw new Error("[alerts] eventId wajib diisi");

  const seeds: AlertSeed[] = [];
  const lastSeverity = new Map<string, number>();

  for (const frame of timeline) {
    for (const state of frame.states) {
      const severity = SEVERITY[state.status];
      const previous = lastSeverity.get(state.id) ?? 0;
      lastSeverity.set(state.id, severity);

      if (severity <= previous || severity === 0) continue;

      const thresholds = thresholdsFor(config, state.id);
      const { governingWindow } = resolveStatus(
        { accum1h: state.accum1h, accum3h: state.accum3h, accum6h: state.accum6h },
        thresholds,
      );
      const level = state.status as AlertLevel;

      seeds.push({
        id: alertId(eventId, state.id, level, frame.t),
        eventId,
        catchmentId: state.id,
        level,
        windowKey: governingWindow,
        raisedAtSec: frame.t,
        accumMm: accumOf(state, governingWindow),
        /* Ambang yang BENAR BENAR dilewati kandidat ini, bukan selalu ambang siaga.
           `resolveStatus` memang melaporkan ambang siaga pada `CatchmentState`, dan di
           sana itu tepat: panel status menunjukkan sejauh mana sebuah DAS berjalan
           menuju siaga. Di sini artinya berbeda. Kartu antrean berbunyi "akumulasi X
           melewati ambang Y", dan untuk kandidat waspada ambang siaga membuat kalimat
           itu tidak benar: pada C-01 kandidat waspada lahir di 5,08 mm sementara
           ambang siaganya 10 mm, sehingga layar akan menyatakan 5,08 melewati 10.
           Yang dicatat adalah ambang tingkat kandidatnya sendiri. */
        thresholdMm:
          level === "siaga"
            ? thresholds[governingWindow].siagaMm
            : thresholds[governingWindow].waspadaMm,
      });
    }
  }

  return seeds;
}
