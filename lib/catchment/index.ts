/**
 * Lapisan DAS (tugas C1).
 *
 * Alur pemakaian dari sisi server:
 *
 *   const { catchments, config } = loadCatchmentData();
 *   const series = buildRainSeries(frames, catchments, config);   // frames dari /api/sim
 *   const states = catchmentStatesAt(series, tNow, config);       // CatchmentState[]
 *
 * `frames` adalah urutan `{ t, field }` dengan `field` berupa `Snapshot.reconstruction`,
 * yaitu hasil rekonstruksi kita, bukan `Snapshot.truth`. Peringatan harus lahir dari
 * angka yang benar benar bisa kita hasilkan di dunia nyata, bukan dari kebenaran dasar
 * yang hanya ada karena datanya simulasi.
 */

export { WINDOW_SECONDS, parseCatchments, parseConfig, thresholdsFor } from "./config.ts";
export { cellAreaKm2, cellCenter, pointInPolygon, pointInRing, ringBbox } from "./geo.ts";
export {
  catchmentMeanRain,
  clearMembershipCache,
  computeMembership,
  findEmptyMemberships,
} from "./membership.ts";
export {
  accumulateWindow,
  buildRainSeries,
  catchmentStateAt,
  catchmentStatesAt,
  resolveStatus,
} from "./accumulate.ts";
export { clearCatchmentDataCache, loadCatchmentData } from "./loader.ts";
export type { CatchmentData } from "./loader.ts";
export type {
  CatchmentConfig,
  CatchmentMembership,
  CatchmentPolygon,
  CatchmentRainSample,
  CatchmentRainSeries,
  CatchmentThresholds,
  Ring,
  WindowKey,
  WindowThresholds,
} from "./types.ts";
