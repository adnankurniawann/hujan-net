/**
 * Pembacaan berkas data DAS dari cakram.
 *
 * HANYA UNTUK SISI SERVER. Modul ini memakai `node:fs`, jadi tidak boleh diimpor
 * dari komponen klien. Panel C3 mengambil datanya lewat endpoint API, bukan dari sini.
 *
 * `catchments.geojson` dibaca lewat `fs`, bukan `import`, karena TypeScript hanya
 * mengizinkan `resolveJsonModule` untuk berkas berakhiran `.json`, sedangkan Panduan
 * bagian 2 menetapkan nama berkasnya `.geojson`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatchmentConfig, CatchmentPolygon } from "./types.ts";
import { assertConfigCoversCatchments, parseCatchments, parseConfig } from "./config.ts";

const CATCHMENTS_PATH = ["data", "catchments.geojson"];
const CONFIG_PATH = ["data", "catchment-config.json"];

export interface CatchmentData {
  catchments: CatchmentPolygon[];
  config: CatchmentConfig;
}

let cached: CatchmentData | null = null;

function readJson(segments: string[]): unknown {
  const path = join(process.cwd(), ...segments);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`[catchment] gagal membaca ${path}: ${(err as Error).message}`);
  }
}

/**
 * Muat dan validasi data DAS. Hasilnya disinggahkan, karena berkasnya statis
 * sepanjang umur proses dan penguraian tidak perlu diulang tiap permintaan.
 */
export function loadCatchmentData(): CatchmentData {
  if (cached) return cached;

  const catchments = parseCatchments(readJson(CATCHMENTS_PATH));
  const config = parseConfig(readJson(CONFIG_PATH));
  assertConfigCoversCatchments(config, catchments);

  cached = { catchments, config };
  return cached;
}

/** Hanya untuk pengujian dan pemuatan ulang saat pengembangan. */
export function clearCatchmentDataCache(): void {
  cached = null;
}
