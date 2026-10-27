// Bentuk muatan JSON untuk endpoint simulasi.
//
// Dipisahkan dari route handler supaya bisa diuji sendiri, dan supaya route
// handler benar benar hanya mengurus kode status. Seluruh fungsi di sini murni.
//
// Nilai dibulatkan sebelum dikirim. Satu Snapshot memuat dua medan berisi 2112
// sel; tanpa pembulatan muatannya membengkak menjadi ratusan kilobait dan
// penggeser waktu ikut tersendat. Ketelitian 0,01 mm/jam jauh lebih halus
// daripada ketidakpastian metodenya, jadi tidak ada yang hilang.

import type { EventReconstruction } from "../inverse/index.ts";
import type { Link, Snapshot } from "../types";
import {
  EVENT_BBOX,
  EVENT_DURATION_S,
  EVENT_GRID,
  SAMPLE_INTERVAL_S,
} from "./scenario.ts";

/** Ketelitian nilai grid, angka di belakang koma. */
export const GRID_DECIMALS = 2;

/** Ketelitian nilai per tautan, angka di belakang koma. */
export const LINK_DECIMALS = 3;

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Bulatkan seluruh nilai satu Snapshot tanpa mengubah bentuknya.
 *
 * `mlReconstruction`/`mlRmse` HANYA disalin kalau sumbernya benar benar
 * punya keduanya. Menyalin `undefined` secara eksplisit membuat kuncinya
 * tetap muncul di `Object.keys`, dan kontrak Snapshot ("bentuk Snapshot
 * sesuai kontrak" di tests/simApi.test.ts) menguji persis itu.
 */
export function toSnapshotPayload(snapshot: Snapshot): Snapshot {
  const base: Snapshot = {
    t: snapshot.t,
    links: snapshot.links.map((l) => ({
      linkId: l.linkId,
      t: l.t,
      isWet: l.isWet,
      attenuationDb: round(l.attenuationDb, LINK_DECIMALS),
      estRainMmH: round(l.estRainMmH, LINK_DECIMALS),
    })),
    truth: {
      ...snapshot.truth,
      values: snapshot.truth.values.map((v) => round(v, GRID_DECIMALS)),
    },
    reconstruction: {
      ...snapshot.reconstruction,
      values: snapshot.reconstruction.values.map((v) => round(v, GRID_DECIMALS)),
    },
    rmse: round(snapshot.rmse, LINK_DECIMALS),
  };

  if (snapshot.mlReconstruction && snapshot.mlRmse !== undefined) {
    base.mlReconstruction = {
      ...snapshot.mlReconstruction,
      values: snapshot.mlReconstruction.values.map((v) => round(v, GRID_DECIMALS)),
    };
    base.mlRmse = round(snapshot.mlRmse, LINK_DECIMALS);
  }

  return base;
}

/**
 * Snapshot pada waktu tertentu, atau null kalau waktu itu bukan waktu cuplikan.
 *
 * @param t detik sejak awal kejadian
 */
export function findSnapshot(
  event: EventReconstruction,
  t: number,
): Snapshot | null {
  const index = event.times.indexOf(t);
  if (index < 0) return null;
  return toSnapshotPayload(event.snapshots[index]);
}

export interface SimMeta {
  /** Penanda kejujuran. Seluruh angka pada API ini berasal dari simulasi. */
  dataSource: "SIMULASI";
  links: Link[];
  bbox: [number, number, number, number];
  grid: { nx: number; ny: number };
  durationS: number;
  intervalS: number;
  times: number[];
  diagnostics: EventReconstruction["diagnostics"];
  /** Lama perhitungan seluruh kejadian, ms. Hanya untuk keperluan diagnosis. */
  computeMs: number;
}

/** Metadata kejadian: topologi, kotak batas, durasi, dan angka mutu. */
export function buildMeta(
  event: EventReconstruction,
  links: Link[],
  computeMs: number,
): SimMeta {
  return {
    dataSource: "SIMULASI",
    links,
    bbox: EVENT_BBOX,
    grid: { nx: EVENT_GRID.nx, ny: EVENT_GRID.ny },
    durationS: EVENT_DURATION_S,
    intervalS: SAMPLE_INTERVAL_S,
    times: event.times,
    diagnostics: event.diagnostics,
    computeMs: round(computeMs, 1),
  };
}

/** Rentang waktu kejadian yang sah, detik. */
export function timeRange(): { min: number; max: number; step: number } {
  return { min: 0, max: EVENT_DURATION_S, step: SAMPLE_INTERVAL_S };
}
