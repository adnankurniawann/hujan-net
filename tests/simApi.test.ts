import test from "node:test";
import assert from "node:assert/strict";

import linksData from "../data/links.json" with { type: "json" };
import type { Link } from "../lib/types.ts";
import { reconstructEvent } from "../lib/inverse/index.ts";
import { loadOperator } from "../lib/ml/loadOperator.ts";
import {
  buildMeta,
  findSnapshot,
  GRID_DECIMALS,
  timeRange,
  toSnapshotPayload,
} from "../lib/sim/payload.ts";
import {
  EVENT_DURATION_S,
  SAMPLE_COUNT,
  SAMPLE_INTERVAL_S,
} from "../lib/sim/scenario.ts";

// Yang diuji di sini adalah pembentukan muatan JSON. Route handler di
// app/api/sim hanya menerjemahkan parameter menjadi kode status, dan itu
// diperiksa langsung dengan curl saat pengembangan.

const links = linksData as Link[];
const event = reconstructEvent(links);

test("bentuk Snapshot sesuai kontrak dan aman dijadikan JSON", () => {
  const snap = findSnapshot(event, 1800);
  assert.ok(snap, "t = 1800 seharusnya ada");

  assert.deepEqual(Object.keys(snap).sort(), [
    "links",
    "reconstruction",
    "rmse",
    "t",
    "truth",
  ]);
  assert.deepEqual(Object.keys(snap.links[0]).sort(), [
    "attenuationDb",
    "estRainMmH",
    "isWet",
    "linkId",
    "t",
  ]);
  assert.deepEqual(Object.keys(snap.truth).sort(), [
    "bbox",
    "nx",
    "ny",
    "values",
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
});

test("waktu di luar cuplikan tidak mengembalikan Snapshot", () => {
  const { min, max, step } = timeRange();
  assert.equal(min, 0);
  assert.equal(max, EVENT_DURATION_S);
  assert.equal(step, SAMPLE_INTERVAL_S);

  assert.equal(findSnapshot(event, 1807), null);
  assert.equal(findSnapshot(event, -15), null);
  assert.equal(findSnapshot(event, EVENT_DURATION_S + 15), null);
  assert.equal(findSnapshot(event, Number.NaN), null);
});

test("seluruh waktu cuplikan bisa diambil", () => {
  for (const t of event.times) {
    assert.ok(findSnapshot(event, t), `t = ${t} tidak ditemukan`);
  }
});

test("pembentukan muatan jauh di bawah 100 ms per permintaan", () => {
  const times = [0, 900, 1800, 2700, 3600];
  const started = performance.now();
  for (const t of times) findSnapshot(event, t);
  const perCallMs = (performance.now() - started) / times.length;
  assert.ok(perCallMs < 100, `rata rata ${perCallMs.toFixed(1)} ms per snapshot`);
});

test("nilai dibulatkan supaya muatan JSON tetap ringan", () => {
  const snap = findSnapshot(event, 1800)!;
  const bytes = JSON.stringify(snap).length;
  assert.ok(
    bytes < 60_000,
    `muatan ${bytes} bait terlalu besar untuk penggeser waktu`,
  );

  const factor = 10 ** GRID_DECIMALS;
  for (const v of snap.reconstruction.values) {
    assert.ok(
      Math.abs(v * factor - Math.round(v * factor)) < 1e-9,
      `nilai ${v} belum dibulatkan`,
    );
  }
});

test("pembulatan tidak mengubah nilai lebih dari setengah langkah", () => {
  const raw = event.snapshots[event.times.indexOf(1800)];
  const rounded = toSnapshotPayload(raw);
  const tolerance = 0.5 / 10 ** GRID_DECIMALS;

  raw.reconstruction.values.forEach((v, i) => {
    assert.ok(
      Math.abs(v - rounded.reconstruction.values[i]) <= tolerance,
      `sel ${i} bergeser lebih dari ${tolerance}`,
    );
  });
  assert.ok(Math.abs(raw.rmse - rounded.rmse) < 0.001);
});

test("bidang AI opsional ikut terbulatkan dan aman dijadikan JSON saat operator diberikan", () => {
  const withMl = reconstructEvent(links, { operator: loadOperator() });
  const raw = withMl.snapshots[withMl.times.indexOf(1800)];
  const payload = toSnapshotPayload(raw);

  assert.deepEqual(Object.keys(payload).sort(), [
    "links",
    "mlReconstruction",
    "mlRmse",
    "reconstruction",
    "rmse",
    "t",
    "truth",
  ]);

  const factor = 10 ** GRID_DECIMALS;
  for (const v of payload.mlReconstruction!.values) {
    assert.ok(
      Math.abs(v * factor - Math.round(v * factor)) < 1e-9,
      `nilai AI ${v} belum dibulatkan`,
    );
  }
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
});

test("meta memuat topologi, kotak batas, durasi, dan penanda simulasi", () => {
  const meta = buildMeta(event, links, 612.3);

  assert.equal(meta.dataSource, "SIMULASI");
  assert.ok(meta.links.length >= 40);
  assert.equal(meta.bbox.length, 4);
  assert.ok(meta.bbox[0] < meta.bbox[2] && meta.bbox[1] < meta.bbox[3]);
  assert.equal(meta.durationS, EVENT_DURATION_S);
  assert.equal(meta.intervalS, SAMPLE_INTERVAL_S);
  assert.equal(meta.times.length, SAMPLE_COUNT);
  assert.ok(meta.diagnostics.wetDryAccuracy > 0.85);
  assert.ok(meta.diagnostics.meanRmse < 8);
  assert.equal(meta.computeMs, 612.3);

  assert.deepEqual(JSON.parse(JSON.stringify(meta)), meta);
});

test("deret satu tautan panjangnya sama dengan jumlah cuplikan", () => {
  const series = event.series.get(links[0].id);
  assert.ok(series);
  assert.equal(series.t.length, SAMPLE_COUNT);
  assert.equal(series.rxPowerDbm.length, SAMPLE_COUNT);
  assert.equal(series.baselineEstDb.length, SAMPLE_COUNT);
  assert.equal(series.estRainMmH.length, SAMPLE_COUNT);
  assert.equal(series.isWet.length, SAMPLE_COUNT);

  assert.equal(event.series.get("LNK-999"), undefined);
});
