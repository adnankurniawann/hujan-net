/**
 * Pembacaan operator rekonstruksi terlatih dari cakram.
 *
 * HANYA UNTUK SISI SERVER. Modul ini memakai `node:fs`, jadi tidak boleh diimpor
 * dari komponen klien.
 *
 * Berkasnya dihasilkan `scripts/train-operator.ts` dan dilatih pada topologi
 * `data/links.json` yang sama persis dengan yang dipakai `reconstructEvent`.
 * Bobotnya TIDAK bisa dipindahkan ke jaringan tautan lain: satu bobot berarti
 * "sumbangan tautan ke-l terhadap sel ke-c", dan pasangan (l, c) itu hanya
 * berarti untuk geometri yang dipakai melatihnya. Kalau `data/links.json`
 * berubah topologinya, operator harus dilatih ulang.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LinearOperator } from "./operator.ts";
import { deserializeOperator } from "./operator.ts";

const OPERATOR_PATH = ["data", "ml-operator.json"];

let cached: LinearOperator | null = null;

/**
 * Muat operator terlatih. Gagal keras kalau berkasnya tidak ada atau rusak,
 * sejalan dengan gaya proyek: konfigurasi hilang adalah galat pemuatan, bukan
 * keadaan yang didiamkan lalu jatuh diam diam ke IDW.
 */
export function loadOperator(): LinearOperator {
  if (cached) return cached;

  const path = join(process.cwd(), ...OPERATOR_PATH);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(
      `[ml] gagal membaca ${path}: ${(err as Error).message}. ` +
        `Jalankan "node scripts/train-operator.ts" untuk menghasilkannya.`,
    );
  }
  cached = deserializeOperator(raw);
  return cached;
}

/** Hanya untuk pengujian: kosongkan singgahan. */
export function clearOperatorCache(): void {
  cached = null;
}
