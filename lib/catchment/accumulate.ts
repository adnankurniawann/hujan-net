/**
 * Akumulasi hujan per DAS dan penentuan status.
 *
 * Seluruh fungsi di berkas ini murni: masukan sama selalu menghasilkan keluaran sama,
 * tidak ada state tersembunyi, tidak menyentuh berkas maupun jaringan.
 */

import type { CatchmentState, GridField } from "../types.ts";
import type {
  CatchmentConfig,
  CatchmentMembership,
  CatchmentPolygon,
  CatchmentRainSample,
  CatchmentRainSeries,
  CatchmentThresholds,
  WindowKey,
} from "./types.ts";
import { WINDOW_SECONDS, thresholdsFor } from "./config.ts";
import { catchmentMeanRain, computeMembership } from "./membership.ts";

const SECONDS_PER_HOUR = 3600;
const WINDOW_KEYS: readonly WindowKey[] = ["accum1h", "accum3h", "accum6h"];

/** Urutan keparahan, dipakai untuk memilih status terburuk antar jendela. */
const STATUS_RANK: Record<CatchmentState["status"], number> = {
  normal: 0,
  waspada: 1,
  siaga: 2,
};

/**
 * Bangun deret waktu rata rata hujan per DAS dari urutan medan hujan.
 *
 * @param frames medan hujan berurutan menaik menurut `t`, satuan nilai mm/jam
 * @param catchments poligon DAS hasil `parseCatchments`
 * @param config konfigurasi, dipakai untuk arah baris grid
 */
export function buildRainSeries(
  frames: ReadonlyArray<{ t: number; field: GridField }>,
  catchments: CatchmentPolygon[],
  config: CatchmentConfig,
): CatchmentRainSeries[] {
  if (frames.length === 0) {
    return catchments.map((c) => ({ catchmentId: c.id, name: c.name, samples: [] }));
  }

  const southToNorth = config.gridRowOrder === "south-to-north";
  const memberships = computeMembership(catchments, frames[0].field, southToNorth);
  const byId = new Map<string, CatchmentMembership>(memberships.map((m) => [m.catchmentId, m]));

  return catchments.map((c) => {
    const membership = byId.get(c.id)!;
    const samples: CatchmentRainSample[] = frames.map((f) => ({
      t: f.t,
      meanMmH: catchmentMeanRain(f.field, membership),
    }));
    return { catchmentId: c.id, name: c.name, samples };
  });
}

/**
 * Integrasikan intensitas hujan menjadi kedalaman hujan pada jendela bergerak.
 *
 * Antar dua cuplikan berturutan intensitas dianggap berubah linear, sehingga
 * integralnya memakai aturan trapesium. Potongan interval yang berada di luar
 * jendela dipangkas, jadi jendela bergerak mulus dan bukan meloncat per cuplikan.
 *
 * Awal jendela dijepit di `t = 0`. Ini penting: tanpa penjepitan, akumulasi 6 jam
 * pada menit kelima akan menghitung waktu sebelum kejadian dimulai sebagai kering,
 * yang secara angka sama saja, tetapi penjepitan membuat sifat menaiknya jelas
 * selama `tNow` masih lebih kecil daripada panjang jendela.
 *
 * @param samples deret cuplikan, wajib menaik menurut `t`, `meanMmH` dalam mm/jam
 * @param tNow detik sejak awal kejadian
 * @param windowSec panjang jendela, detik
 * @returns kedalaman hujan, mm
 */
export function accumulateWindow(
  samples: ReadonlyArray<CatchmentRainSample>,
  tNow: number,
  windowSec: number,
): number {
  if (samples.length < 2 || windowSec <= 0) return 0;

  const from = Math.max(0, tNow - windowSec);
  if (tNow <= from) return 0;

  let mm = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (b.t <= from) continue;
    if (a.t >= tNow) break;

    const span = b.t - a.t;
    if (span <= 0) continue;

    // Potong interval [a.t, b.t] ke jendela [from, tNow].
    const lo = Math.max(a.t, from);
    const hi = Math.min(b.t, tNow);
    if (hi <= lo) continue;

    // Intensitas di ujung potongan, hasil interpolasi linear.
    const rateAt = (t: number) => a.meanMmH + ((t - a.t) / span) * (b.meanMmH - a.meanMmH);
    const meanRate = (rateAt(lo) + rateAt(hi)) / 2;
    mm += (meanRate * (hi - lo)) / SECONDS_PER_HOUR;
  }
  return mm;
}

/** Status satu jendela terhadap ambangnya. */
function statusForWindow(accumMm: number, thresholds: CatchmentThresholds[WindowKey]) {
  if (accumMm >= thresholds.siagaMm) return "siaga" as const;
  if (accumMm >= thresholds.waspadaMm) return "waspada" as const;
  return "normal" as const;
}

/**
 * Tentukan status DAS dari tiga jendela sekaligus.
 *
 * `CatchmentState` hanya menyediakan satu bidang `thresholdMm`, sedangkan ada tiga
 * jendela dengan ambang masing masing. Aturan yang dipakai:
 *   1. Status DAS adalah status terburuk di antara ketiga jendela.
 *   2. Jendela penentu adalah jendela dengan rasio akumulasi terhadap ambang siaga
 *      yang paling besar. Rasio, bukan nilai mutlak, supaya 30 mm dalam 1 jam bisa
 *      mengalahkan 60 mm dalam 6 jam.
 *   3. `thresholdMm` yang dilaporkan adalah ambang siaga jendela penentu itu,
 *      sehingga panel C3 bisa menampilkan "akumulasi X dari ambang Y" yang konsisten.
 */
export function resolveStatus(
  accums: Record<WindowKey, number>,
  thresholds: CatchmentThresholds,
): { status: CatchmentState["status"]; governingWindow: WindowKey; thresholdMm: number } {
  let status: CatchmentState["status"] = "normal";
  let governingWindow: WindowKey = "accum1h";
  let bestRatio = -Infinity;

  for (const key of WINDOW_KEYS) {
    const windowStatus = statusForWindow(accums[key], thresholds[key]);
    if (STATUS_RANK[windowStatus] > STATUS_RANK[status]) status = windowStatus;

    const siaga = thresholds[key].siagaMm;
    const ratio = siaga > 0 ? accums[key] / siaga : 0;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      governingWindow = key;
    }
  }

  return { status, governingWindow, thresholdMm: thresholds[governingWindow].siagaMm };
}

/**
 * Hitung `CatchmentState` satu DAS pada waktu `tNow`.
 *
 * @param tNow detik sejak awal kejadian
 */
export function catchmentStateAt(
  series: CatchmentRainSeries,
  tNow: number,
  config: CatchmentConfig,
): CatchmentState {
  const thresholds = thresholdsFor(config, series.catchmentId);
  const accums = {
    accum1h: accumulateWindow(series.samples, tNow, WINDOW_SECONDS.accum1h),
    accum3h: accumulateWindow(series.samples, tNow, WINDOW_SECONDS.accum3h),
    accum6h: accumulateWindow(series.samples, tNow, WINDOW_SECONDS.accum6h),
  };
  const { status, thresholdMm } = resolveStatus(accums, thresholds);

  return {
    id: series.catchmentId,
    name: series.name,
    accum1h: accums.accum1h,
    accum3h: accums.accum3h,
    accum6h: accums.accum6h,
    thresholdMm,
    status,
  };
}

/** Versi banyak DAS dari `catchmentStateAt`, urutannya mengikuti urutan `seriesList`. */
export function catchmentStatesAt(
  seriesList: ReadonlyArray<CatchmentRainSeries>,
  tNow: number,
  config: CatchmentConfig,
): CatchmentState[] {
  return seriesList.map((s) => catchmentStateAt(s, tNow, config));
}
