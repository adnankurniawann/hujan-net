// Peta hujan dengan MLP per sel, dilatih di ml/hujannet_ml/rainmap.py pada data
// sungguhan OpenMRG (364 CML, kebenaran radar 2 km). Bobotnya ditulis
// `uv run python -m hujannet_ml.rainmap export` ke data/ml-rainmap.json.
//
// Berbeda dengan operator ridge (lib/ml/operator.ts), jaringan ini tidak terikat
// topologi: masukannya hanya hujan, jarak, dan ada/tidaknya K tautan terdekat
// tiap sel, plus taksiran IDW. Jadi bobot dari Swedia bisa dijalankan pada jaringan mana pun.
//
// TIDAK dipasang di dasbor: pada badai demo ia lebih buruk dari IDW, bahkan dengan
// masukan sempurna (ARSITEKTUR.md 9.7, scripts/compare-rainmap.ts).
//
// Masukan satu sel, sama persis dengan `mlp_inputs` di rainmap.py:
//   [log1p(hujan) x K, jarak/5 km x K, ada x K, log1p(IDW)]
//
// shortcut: sel latih radar 2 km, sel dasbor sekitar 0,55 km, jadi keluarannya
// lebih halus dari yang bisa dibedakan grid dasbor. Latih ulang di grid halus
// kalau ada radar beresolusi lebih tinggi.

import type { GridField, Link } from "../types";
import { distanceKm, pathSamplePoints } from "../sim/geo.ts";
import { cellCenters, type GridSpec, toField } from "../sim/grid.ts";
import { buildIdwKernel, reconstructField, type IdwKernel } from "../inverse/field.ts";

const HIDDEN = 64;
const PATH_POINTS = 20; // rainmap.py PATH_POINTS

export interface RainMapModel {
  neighbours: number;
  /** Jangkauan IDW yang dipakai sebagai masukan, km, disetel saat latih. */
  idwCutoffKm: number;
  /** Sel lebih jauh dari ini ke lintasan mana pun tidak pernah dilihat saat latih. */
  coverKm: number;
  w0: Float64Array; // [64, 3K + 1]
  b0: Float64Array;
  w1: Float64Array; // [64, 64]
  b1: Float64Array;
  w2: Float64Array; // [64]
  b2: number;
}

function numbers(raw: Record<string, unknown>, key: string, length: number): Float64Array {
  const v = raw[key];
  if (!Array.isArray(v) || v.length !== length || !v.every(Number.isFinite)) {
    throw new Error(`[ml] model peta hujan: "${key}" harus ${length} angka`);
  }
  return Float64Array.from(v as number[]);
}

export function deserializeRainMap(raw: unknown): RainMapModel {
  if (typeof raw !== "object" || raw === null) throw new Error("[ml] model peta hujan bukan objek");
  const r = raw as Record<string, unknown>;
  const { neighbours, idwCutoffKm, coverKm, b2 } = r;
  if (![neighbours, idwCutoffKm, coverKm, b2].every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error("[ml] model peta hujan: neighbours, idwCutoffKm, coverKm, b2 harus angka");
  }
  const K = neighbours as number;
  return {
    neighbours: K,
    idwCutoffKm: idwCutoffKm as number,
    coverKm: coverKm as number,
    w0: numbers(r, "w0", HIDDEN * (3 * K + 1)),
    b0: numbers(r, "b0", HIDDEN),
    w1: numbers(r, "w1", HIDDEN * HIDDEN),
    b1: numbers(r, "b1", HIDDEN),
    w2: numbers(r, "w2", HIDDEN),
    b2: b2 as number,
  };
}

/** Dua lapis terakhir, dari pra-aktivasi lapis pertama. */
function tail(m: RainMapModel, pre0: Float64Array): number {
  let out = m.b2;
  for (let j = 0; j < HIDDEN; j++) {
    let v = m.b1[j];
    const row = j * HIDDEN;
    for (let k = 0; k < HIDDEN; k++) v += m.w1[row + k] * Math.max(0, pre0[k]);
    out += m.w2[j] * Math.max(0, v);
  }
  return Math.max(0, out);
}

/** Keluaran untuk satu vektor masukan [3K + 1]. Dipakai uji kesamaan dengan PyTorch. */
export function rainMapForward(m: RainMapModel, x: readonly number[]): number {
  const n = 3 * m.neighbours + 1;
  const pre0 = new Float64Array(HIDDEN);
  for (let j = 0; j < HIDDEN; j++) {
    let v = m.b0[j];
    for (let i = 0; i < n; i++) v += m.w0[j * n + i] * x[i];
    pre0[j] = v;
  }
  return tail(m, pre0);
}

/** Bagian yang hanya bergantung pada geometri, dihitung sekali per topologi. */
export interface RainMapKernel {
  grid: GridSpec;
  idw: IdwKernel;
  /** Per sel: indeks K tautan terdekat, atau null kalau sel di luar `coverKm`. */
  neighbours: (Int32Array | null)[];
  /** Per sel: pra-aktivasi lapis pertama dari bias, jarak, dan topeng ada. */
  base: (Float64Array | null)[];
  /** Per sel: keluaran saat semua tautan kering, karena paling sering terjadi. */
  dry: Float64Array;
}

export function buildRainMapKernel(links: readonly Link[], grid: GridSpec, m: RainMapModel): RainMapKernel {
  const K = m.neighbours;
  if (links.length < K) throw new Error(`[ml] model peta hujan butuh paling sedikit ${K} tautan`);
  const n = 3 * K + 1;
  const points = links.map((l) => pathSamplePoints(l.siteA, l.siteB, PATH_POINTS));
  const centers = cellCenters(grid);
  const neighbours: (Int32Array | null)[] = [];
  const base: (Float64Array | null)[] = [];
  const dry = new Float64Array(centers.length);

  centers.forEach((c, ci) => {
    const near = points.map((ps) => Math.min(...ps.map((p) => distanceKm(c, p))));
    const order = near.map((_, i) => i).sort((a, b) => near[a] - near[b]).slice(0, K);
    if (near[order[0]] > m.coverKm) {
      neighbours.push(null);
      base.push(null);
      return;
    }
    const b = new Float64Array(HIDDEN);
    for (let j = 0; j < HIDDEN; j++) {
      let v = m.b0[j];
      for (let k = 0; k < K; k++) v += m.w0[j * n + K + k] * (near[order[k]] / 5) + m.w0[j * n + 2 * K + k];
      b[j] = v;
    }
    neighbours.push(Int32Array.from(order));
    base.push(b);
    dry[ci] = tail(m, b);
  });

  return { grid, idw: buildIdwKernel(links, grid, { cutoffKm: m.idwCutoffKm }), neighbours, base, dry };
}

/**
 * Medan hujan dari intensitas rata rata lintasan, mm/jam, sejajar urutan tautan kernel.
 * Sel di luar `coverKm` mengambil nilai `fallback` (IDW dasbor), karena di sana
 * jaringan tidak pernah dilatih.
 */
export function reconstructFieldMl(
  kernel: RainMapKernel,
  m: RainMapModel,
  rainByLink: readonly number[],
  fallback: GridField,
): GridField {
  const K = m.neighbours;
  const n = 3 * K + 1;
  const idw = reconstructField(kernel.idw, rainByLink).values;
  const logRain = rainByLink.map((r) => Math.log1p(Math.max(0, r)));
  const pre0 = new Float64Array(HIDDEN);

  const values = kernel.neighbours.map((idx, c) => {
    const b = kernel.base[c];
    if (!idx || !b) return fallback.values[c];
    const logIdw = Math.log1p(Math.max(0, idw[c]));
    if (logIdw === 0 && idx.every((l) => logRain[l] === 0)) return kernel.dry[c];
    for (let j = 0; j < HIDDEN; j++) {
      let v = b[j] + m.w0[j * n + 3 * K] * logIdw;
      for (let k = 0; k < K; k++) v += m.w0[j * n + k] * logRain[idx[k]];
      pre0[j] = v;
    }
    return tail(m, pre0);
  });
  return toField(kernel.grid, values);
}
