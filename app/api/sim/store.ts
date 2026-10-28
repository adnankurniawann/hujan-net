// Simpanan kejadian di memori.
//
// Seluruh kejadian dihitung sekali pada permintaan pertama, lalu dipakai ulang.
// Menghitung ulang tiap permintaan akan membuat penggeser waktu tersendat, dan
// penggeser waktu yang tersendat merusak demo.
//
// Berkas ini satu satunya tempat di jalur simulasi yang menyimpan keadaan.
// Seluruh isi lib/ tetap murni. Pembentukan muatan JSON ada di lib/sim/payload.

import linksData from "@/data/links.json";
import type { Link, Snapshot } from "@/lib/types";
import {
  reconstructEvent,
  type EventReconstruction,
  type LinkSeries,
} from "@/lib/inverse";
import { loadOperator, loadWetDryModel } from "@/lib/ml/loadOperator";
import {
  buildMeta,
  findSnapshot,
  timeRange,
  type SimMeta,
} from "@/lib/sim/payload";

const links = linksData as Link[];

let cached: EventReconstruction | null = null;
let computeMs = 0;

/** Kejadian lengkap, dihitung sekali lalu disimpan. */
export function getEvent(): EventReconstruction {
  if (!cached) {
    const started = performance.now();
    // Operator terlatih dimuat di sini, bukan di lib/inverse: itu yang
    // menyentuh cakram, dan lib/ tidak boleh melakukannya sendiri. Kalau
    // berkasnya belum ada (belum pernah "node scripts/train-operator.ts"),
    // loadOperator melempar galat jelas dan itu sengaja bukan didiamkan.
    cached = reconstructEvent(links, { operator: loadOperator(), wetDryModel: loadWetDryModel() });
    computeMs = performance.now() - started;
  }
  return cached;
}

/** Snapshot pada satu waktu cuplikan, atau null kalau waktunya tidak sah. */
export function getSnapshot(t: number): Snapshot | null {
  return findSnapshot(getEvent(), t);
}

/** Daftar tautan, kotak batas, durasi kejadian, dan angka mutu rekonstruksi. */
export function getMeta(): SimMeta {
  return buildMeta(getEvent(), links, computeMs);
}

/** Deret waktu lengkap satu tautan, untuk panel detail tautan. */
export function getLinkSeries(linkId: string): LinkSeries | null {
  return getEvent().series.get(linkId) ?? null;
}

export { timeRange };
