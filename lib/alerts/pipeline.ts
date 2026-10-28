/**
 * Perangkaian C1 dan C2: dari medan hujan hasil rekonstruksi menjadi antrean kandidat.
 *
 * HANYA UNTUK SISI SERVER.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GridField, Link } from "../types.ts";
import { buildRainSeries, catchmentStatesAt, loadCatchmentData } from "../catchment/index.ts";
import { reconstructEvent } from "../inverse/index.ts";
import { loadWetDryModel } from "../ml/loadOperator.ts";
import {
  DEMO_STORM,
  EVENT_DURATION_S,
  EVENT_GRID,
  SAMPLE_INTERVAL_S,
} from "../sim/scenario.ts";
import { detectCandidates } from "./detect.ts";
import type { CatchmentTimelineFrame } from "./detect.ts";
import { syncCandidates } from "./store.ts";

/** Langkah waktu evaluasi status DAS, detik. */
const EVAL_STEP_SEC = 60;

/**
 * Bingkai medan hujan yang menjadi masukan lapisan DAS.
 *
 * `field` HARUS `Snapshot.reconstruction`, bukan `Snapshot.truth`. Peringatan wajib
 * lahir dari angka yang benar benar bisa kita hasilkan tanpa kebenaran dasar.
 */
export interface SimFrame {
  t: number;
  field: GridField;
}

/**
 * Hitung ulang antrean kandidat dari satu kejadian simulasi, lalu simpan.
 *
 * Aman dipanggil berulang: id kandidat bersifat deterministik dan `syncCandidates`
 * tidak pernah menyentuh baris yang sudah ada, jadi keputusan operator tidak hilang.
 *
 * Evaluasi status dilakukan tiap `EVAL_STEP_SEC`, bukan tiap cuplikan 15 detik.
 * Tepi naik keparahan tidak berubah oleh pilihan ini, sementara jumlah perhitungan
 * turun empat kali lipat.
 */
export async function refreshAlertsFromFrames(
  frames: ReadonlyArray<SimFrame>,
  eventId: string,
): Promise<{ created: number; existing: number; detected: number }> {
  const { catchments, config } = loadCatchmentData();
  const series = buildRainSeries(frames, catchments, config);

  const lastT = frames.length > 0 ? frames[frames.length - 1].t : 0;
  const timeline: CatchmentTimelineFrame[] = [];
  for (let t = 0; t <= lastT; t += EVAL_STEP_SEC) {
    timeline.push({ t, states: catchmentStatesAt(series, t, config) });
  }

  const seeds = detectCandidates(timeline, config, eventId);
  const result = await syncCandidates(seeds);
  return { ...result, detected: seeds.length };
}

/**
 * Sidik jari kejadian simulasi.
 *
 * FNV-1a 32 bit atas seluruh tetapan yang menentukan medan hujan. Dipakai sebagai
 * bagian `eventId`, sehingga kalau Radit menyetel `DEMO_STORM`, durasi, grid, atau
 * topologi tautan, id kandidat ikut berubah. Tanpa ini, kandidat dari kejadian lama
 * akan tetap duduk di antrean dengan angka akumulasi yang sudah tidak berlaku,
 * karena `syncCandidates` memang tidak pernah menyentuh baris yang sudah ada.
 */
function fingerprint(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

interface LoadedEvent {
  frames: SimFrame[];
  eventId: string;
}

/**
 * Baca topologi tautan dari cakram.
 *
 * Memakai `fs`, bukan `import ... from "../../data/links.json"`, karena berkas ini
 * harus bisa dimuat oleh dua pemuat sekaligus: bundel Next, dan `node --test` yang
 * memakai pengupasan tipe bawaan Node. Yang kedua menuntut atribut impor
 * `with { type: "json" }`, yang belum aman di sisi bundel. Membacanya lewat `fs`
 * bekerja sama di keduanya, dan `loadSimFrames` memang hanya untuk sisi server.
 */
function loadLinks(): Link[] {
  const path = join(process.cwd(), "data", "links.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Link[];
  } catch (err) {
    throw new Error(`[alerts] gagal membaca ${path}: ${(err as Error).message}`);
  }
}

let cachedEvent: LoadedEvent | null = null;

/**
 * Sambungan ke lapisan simulasi.
 *
 * Memanggil `reconstructEvent` dari `lib/inverse` secara langsung, BUKAN mengambil
 * lewat HTTP ke `/api/sim`, dan bukan lewat `app/api/sim/store`. Alasannya aturan
 * arsitektur bagian 2: tidak ada modul di `lib/` yang boleh memanggil ke atas.
 * Pada diagram aliran data, `lib/inverse` menyuapi `app/api/sim` dan `lib/catchment`
 * sebagai dua cabang sejajar, dan inilah cabang yang kedua.
 *
 * Konsekuensinya kejadian dihitung dua kali per proses, sekali di `app/api/sim/store`
 * dan sekali di sini, masing masing sekitar 0,5 detik. Itu harga yang dibayar untuk
 * menjaga arah ketergantungan tetap satu arah. Kalau nanti terasa, jalan keluarnya
 * memindahkan penyinggahan ke `lib/`, dan itu wilayah Radit.
 *
 * Hanya `frames` yang ditahan di memori, bukan seluruh `EventReconstruction`. Medan
 * `truth` tiap snapshot jadi sampah yang bisa dipungut, karena peringatan sama sekali
 * tidak boleh melihatnya.
 */
export async function loadSimFrames(): Promise<LoadedEvent> {
  if (cachedEvent) return cachedEvent;

  const links = loadLinks();
  // Model basah/kering yang sama dengan app/api/sim/store, supaya peta dan peringatan sepakat.
  const event = reconstructEvent(links, { wetDryModel: loadWetDryModel() });

  const frames: SimFrame[] = event.times.map((t, i) => ({
    t,
    // WAJIB reconstruction, bukan truth. Lihat aturan di kepala berkas ini.
    field: event.snapshots[i].reconstruction,
  }));

  const signature = JSON.stringify({
    storm: DEMO_STORM,
    durationS: EVENT_DURATION_S,
    intervalS: SAMPLE_INTERVAL_S,
    grid: { nx: EVENT_GRID.nx, ny: EVENT_GRID.ny, bbox: EVENT_GRID.bbox },
    linkIds: links.map((l) => l.id),
  });

  if (frames.length === 0) {
    throw new Error("[alerts] kejadian simulasi tidak menghasilkan satu pun bingkai");
  }

  cachedEvent = { frames, eventId: `sim-${fingerprint(signature)}` };
  return cachedEvent;
}

/** Hanya untuk pengujian: paksa kejadian dihitung ulang. */
export function clearSimFramesCache(): void {
  cachedEvent = null;
}
