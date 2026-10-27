/**
 * Lapisan peringatan (tugas C2).
 *
 * Alur pemakaian dari sisi server:
 *
 *   const timeline = ...;                                   // dari C1
 *   const seeds = detectCandidates(timeline, config, eventId);
 *   await syncCandidates(seeds);                            // selalu lahir "menunggu"
 *   const queue = await listAlerts({ status: "menunggu" });
 *
 * Sistem tidak pernah menyiarkan peringatan. Lihat catatan tata kelola di `store.ts`.
 */

export { alertId, detectCandidates } from "./detect.ts";
export type { CatchmentTimelineFrame } from "./detect.ts";
export {
  confirmAlert,
  dismissAlert,
  getAlert,
  listAlerts,
  publishableAlerts,
  resetAlertsForTest,
  syncCandidates,
} from "./store.ts";
export type { ListAlertsFilter } from "./store.ts";
export { AlertError } from "./types.ts";
export type { AlertErrorCode, AlertLevel, AlertRecord, AlertSeed } from "./types.ts";
