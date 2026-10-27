import test from "node:test";
import assert from "node:assert/strict";

import type { GridSpec } from "../lib/sim/grid.ts";
import {
  applyLinearOperator,
  fitLinearOperator,
  type TrainingSample,
} from "../lib/ml/operator.ts";
import { mulberry32 } from "../lib/sim/random.ts";

// Grid kecil supaya uji tetap cepat. Geometrinya tidak diperiksa di sini,
// yang diuji adalah aljabar operatornya.
const GRID: GridSpec = { bbox: [106.9, -6.75, 107.0, -6.65], nx: 4, ny: 3 };
const N_CELLS = GRID.nx * GRID.ny;
const LINK_IDS = ["L-1", "L-2", "L-3"];
const N_LINKS = LINK_IDS.length;

/** Matriks sasaran yang dipakai membuat contoh sintetis, baris demi baris. */
function targetMatrix(): number[][] {
  const rnd = mulberry32(0xa5a5);
  return Array.from({ length: N_CELLS }, () =>
    Array.from({ length: N_LINKS }, () => rnd() * 2),
  );
}

function makeSamples(count: number, m: number[][]): TrainingSample[] {
  const rnd = mulberry32(0x1234);
  return Array.from({ length: count }, () => {
    const linkRain = Array.from({ length: N_LINKS }, () => rnd() * 30);
    const truth = m.map((row) =>
      row.reduce((acc, w, l) => acc + w * linkRain[l], 0),
    );
    return { linkRain, truth };
  });
}

test("operator memulihkan pemetaan linear yang diketahui", () => {
  const m = targetMatrix();
  const samples = makeSamples(200, m);
  const op = fitLinearOperator(samples, GRID, LINK_IDS, { lambda: 1e-9 });

  let maxErr = 0;
  for (let c = 0; c < N_CELLS; c++) {
    for (let l = 0; l < N_LINKS; l++) {
      maxErr = Math.max(maxErr, Math.abs(op.weights[c * N_LINKS + l] - m[c][l]));
    }
  }

  assert.ok(
    maxErr < 1e-6,
    `bobot meleset sampai ${maxErr}, seharusnya memulihkan matriks sasaran`,
  );
});

test("seluruh tautan kering menghasilkan medan kosong", () => {
  // Sifat wajib: tanpa suku intersep, sistem tidak boleh mengarang hujan
  // ketika seluruh jaringan melaporkan kering.
  const op = fitLinearOperator(makeSamples(80, targetMatrix()), GRID, LINK_IDS);
  const field = applyLinearOperator(op, new Array(N_LINKS).fill(0));

  assert.equal(field.values.length, N_CELLS);
  for (const v of field.values) assert.equal(v, 0);
});

test("keluaran tidak pernah negatif", () => {
  const m = targetMatrix();
  const op = fitLinearOperator(makeSamples(120, m), GRID, LINK_IDS, { lambda: 1e-6 });

  // Masukan yang tidak masuk akal secara fisis sekalipun tidak boleh
  // menghasilkan intensitas hujan negatif.
  const field = applyLinearOperator(op, [-50, 90, -10]);
  for (const v of field.values) assert.ok(v >= 0, `nilai negatif ${v}`);
});

test("pelatihan deterministik: dua kali latih menghasilkan bobot identik", () => {
  const samples = makeSamples(150, targetMatrix());
  const a = fitLinearOperator(samples, GRID, LINK_IDS, { lambda: 1e-3 });
  const b = fitLinearOperator(samples, GRID, LINK_IDS, { lambda: 1e-3 });

  assert.deepEqual(Array.from(a.weights), Array.from(b.weights));
});

test("lambda lebih besar memperkecil besar bobot", () => {
  const samples = makeSamples(150, targetMatrix());
  const norm = (lambda: number) => {
    const op = fitLinearOperator(samples, GRID, LINK_IDS, { lambda });
    let sq = 0;
    for (const w of op.weights) sq += w * w;
    return Math.sqrt(sq);
  };

  assert.ok(
    norm(1) < norm(1e-6),
    "regularisasi yang lebih kuat seharusnya menghasilkan bobot yang lebih kecil",
  );
});

test("panjang masukan yang tidak konsisten ditolak", () => {
  const good = makeSamples(10, targetMatrix());
  const bad: TrainingSample[] = [
    ...good,
    { linkRain: [1, 2], truth: new Array(N_CELLS).fill(0) },
  ];

  assert.throws(() => fitLinearOperator(bad, GRID, LINK_IDS));
  assert.throws(() => fitLinearOperator([], GRID, LINK_IDS));
});
