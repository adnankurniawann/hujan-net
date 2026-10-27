import test from "node:test";
import assert from "node:assert/strict";

import linksData from "../data/links.json" with { type: "json" };
import type { GridField, Link } from "../lib/types.ts";
import {
  buildIdwKernel,
  computeRmse,
  correctWaa,
  estimateBaseline,
  kernelCoverage,
  reconstructEvent,
  reconstructField,
  retrieveRainRate,
  WAA_CORRECTION_DB,
} from "../lib/inverse/index.ts";
import { classifyWetDry } from "../lib/inverse/classify.ts";
import {
  ituCoefficients,
  specificAttenuation,
} from "../lib/physics/itu838.ts";
import { distanceKm } from "../lib/sim/geo.ts";
import { fieldPeakCenter } from "../lib/sim/grid.ts";
import { simulateEvent, WET_RAIN_MM_H } from "../lib/sim/forward.ts";
import { EVENT_GRID, SAMPLE_COUNT } from "../lib/sim/scenario.ts";
import { loadOperator } from "../lib/ml/loadOperator.ts";

const links = linksData as Link[];

// Satu rekonstruksi dipakai bersama oleh beberapa uji, supaya seluruh berkas uji
// tetap cepat. Jalur ini deterministik, jadi berbagi hasil tidak mengurangi
// ketelitian pengujian.
const run = reconstructEvent(links);

test("akurasi klasifikasi basah kering di atas 85 persen", () => {
  const accuracy = run.diagnostics.wetDryAccuracy;
  assert.ok(
    accuracy > 0.85,
    `akurasi hanya ${(accuracy * 100).toFixed(1)} persen`,
  );
});

test("RMSE rekonstruksi di bawah 8 mm/jam pada seluruh langkah waktu", () => {
  assert.ok(
    run.diagnostics.meanRmse < 8,
    `RMSE rata rata ${run.diagnostics.meanRmse.toFixed(2)} mm/jam`,
  );
  assert.ok(
    run.diagnostics.maxRmse < 8,
    `RMSE terburuk ${run.diagnostics.maxRmse.toFixed(2)} mm/jam`,
  );
});

test("posisi puncak rekonstruksi kurang dari 5 km dari puncak sebenarnya", () => {
  assert.ok(
    run.diagnostics.peakDistanceAtMaxKm < 5,
    `pada puncak kejadian melenceng ${run.diagnostics.peakDistanceAtMaxKm.toFixed(2)} km`,
  );
  assert.ok(
    run.diagnostics.maxPeakDistanceKm < 5,
    `melenceng terburuk ${run.diagnostics.maxPeakDistanceKm.toFixed(2)} km`,
  );
});

test("seluruh rentang waktu selesai di bawah 2 detik", () => {
  const started = performance.now();
  reconstructEvent(links);
  const elapsedMs = performance.now() - started;
  assert.ok(elapsedMs < 2000, `butuh ${elapsedMs.toFixed(0)} ms`);
});

test("Snapshot berbentuk sesuai kontrak untuk setiap langkah waktu", () => {
  assert.equal(run.snapshots.length, SAMPLE_COUNT);
  const cells = EVENT_GRID.nx * EVENT_GRID.ny;

  for (const snap of run.snapshots) {
    assert.ok(Number.isFinite(snap.t));
    assert.equal(snap.links.length, links.length);
    assert.equal(snap.truth.values.length, cells);
    assert.equal(snap.reconstruction.values.length, cells);
    assert.deepEqual(snap.truth.bbox, EVENT_GRID.bbox);
    assert.deepEqual(snap.reconstruction.bbox, EVENT_GRID.bbox);
    assert.ok(Number.isFinite(snap.rmse) && snap.rmse >= 0);

    for (const state of snap.links) {
      assert.equal(state.t, snap.t);
      assert.ok(Number.isFinite(state.attenuationDb) && state.attenuationDb >= 0);
      assert.ok(Number.isFinite(state.estRainMmH) && state.estRainMmH >= 0);
      assert.equal(typeof state.isWet, "boolean");
    }
  }
});

test("tanpa operator, Snapshot tidak punya bidang AI sama sekali", () => {
  // `mlReconstruction`/`mlRmse` HARUS tidak ada, bukan `undefined` yang masih
  // muncul di Object.keys. tests/simApi.test.ts mengunci ini lewat
  // Object.keys(snap).sort() atas payload JSON; di sini diuji pada objek
  // Snapshot murni sebelum dibulatkan toSnapshotPayload.
  const snap = run.snapshots[100];
  assert.equal("mlReconstruction" in snap, false);
  assert.equal("mlRmse" in snap, false);
});

test("dengan operator terlatih, mlReconstruction hidup berdampingan dengan IDW", () => {
  const operator = loadOperator();
  const withMl = reconstructEvent(links, { operator });
  const cells = EVENT_GRID.nx * EVENT_GRID.ny;

  // Ambil bingkai saat hujan sedang deras, supaya perbandingan tidak jatuh
  // pada medan yang seluruhnya nol dan bisa "kebetulan" identik.
  let peakIndex = 0;
  let peakValue = -Infinity;
  withMl.snapshots.forEach((s, i) => {
    const m = Math.max(...s.truth.values);
    if (m > peakValue) {
      peakValue = m;
      peakIndex = i;
    }
  });
  const snap = withMl.snapshots[peakIndex];

  assert.ok(snap.mlReconstruction, "mlReconstruction harus ada ketika operator diberikan");
  assert.equal(snap.mlReconstruction!.values.length, cells);
  assert.deepEqual(snap.mlReconstruction!.bbox, EVENT_GRID.bbox);
  assert.ok(Number.isFinite(snap.mlRmse) && snap.mlRmse! >= 0);
  // Tidak ada nilai negatif: applyLinearOperator menjepit di nol.
  assert.ok(snap.mlReconstruction!.values.every((v) => v >= 0));

  // Medan AI benar benar hasil hitungan berbeda dari IDW pada bingkai basah,
  // bukan salinan yang kebetulan lolos karena keduanya nol.
  const differs = snap.mlReconstruction!.values.some(
    (v, i) => Math.abs(v - snap.reconstruction.values[i]) > 1e-9,
  );
  assert.ok(differs, "mlReconstruction identik dengan reconstruction pada bingkai berhujan");

  // Jalur IDW (alerts, status DAS, KPI TopBar) tidak boleh berubah gara gara
  // operator diikutsertakan: reconstruction dan rmse tetap sama dengan
  // rekonstruksi tanpa operator sama sekali.
  const withoutMl = run.snapshots[peakIndex];
  assert.deepEqual(snap.reconstruction, withoutMl.reconstruction);
  assert.equal(snap.rmse, withoutMl.rmse);
});

test("pada t = 0 rekonstruksi kosong dan tidak ada tautan basah", () => {
  const first = run.snapshots[0];
  assert.equal(first.t, 0);
  assert.equal(Math.max(...first.reconstruction.values), 0);
  assert.equal(first.links.filter((l) => l.isWet).length, 0);
  assert.equal(first.rmse, 0);
});

test("penanda basah tidak tertinggal setelah hujan berhenti", () => {
  // Jendela ragam menoleh ke belakang, jadi tanpa penjagaan tambahan penanda
  // basah masih menyala beberapa menit setelah hujan berhenti dan peta terlihat
  // salah pada akhir demo.
  const last = run.snapshots[run.snapshots.length - 1];
  const stillWet = last.links.filter((l) => l.isWet).length;
  assert.ok(
    stillWet <= links.length * 0.1,
    `${stillWet} dari ${links.length} tautan masih ditandai basah pada akhir kejadian`,
  );
});

test("model invers tidak menyentuh kebenaran dasar garis dasar", () => {
  // Kalau garis dasar simulator dipakai diam diam, taksiran akan sama persis.
  // Taksiran yang benar boleh dekat, tetapi tidak boleh identik.
  const event = simulateEvent(links.slice(0, 6));
  let identical = 0;
  let compared = 0;
  for (const link of links.slice(0, 6)) {
    const samples = event.samplesByLink.get(link.id)!;
    const flags = classifyWetDry(samples);
    const estimated = estimateBaseline(samples, flags);
    samples.forEach((s, i) => {
      compared++;
      if (s.baselineDb === estimated[i]) identical++;
    });
  }
  assert.ok(compared > 0);
  assert.equal(identical, 0, "taksiran garis dasar identik dengan kebenaran dasar");
});

test("taksiran garis dasar mendekati garis dasar sebenarnya", () => {
  const event = simulateEvent(links);
  let worst = 0;
  for (const link of links) {
    const samples = event.samplesByLink.get(link.id)!;
    const flags = classifyWetDry(samples);
    const estimated = estimateBaseline(samples, flags);
    samples.forEach((s, i) => {
      const err = Math.abs(estimated[i] - s.baselineDb);
      if (err > worst) worst = err;
    });
  }
  // Kuantisasi 0,3 dB dan penyimpangan garis dasar sudah memakan sebagian
  // anggaran. Sisa galat ini tetap jauh lebih kecil daripada redaman hujan yang
  // dicari, yang pada puncak kejadian mencapai belasan dB.
  assert.ok(worst < 1.5, `galat garis dasar terburuk ${worst.toFixed(3)} dB`);
});

test("koreksi antena basah hanya berlaku saat basah", () => {
  assert.equal(correctWaa(5, false), 0);
  assert.equal(correctWaa(0, true), 0);
  assert.equal(correctWaa(-2, true), 0);
  assert.ok(Math.abs(correctWaa(5, true) - (5 - WAA_CORRECTION_DB)) < 1e-12);
  // Redaman yang lebih kecil daripada redaman antena basah tidak boleh menjadi negatif.
  assert.equal(correctWaa(WAA_CORRECTION_DB / 2, true), 0);
});

test("retrieveRainRate membalik model maju satu tautan", () => {
  const link = links[0];
  // Redaman yang setara hujan seragam 30 mm/jam sepanjang lintasan.
  const uniformRain = 30;
  const { k, alpha } = ituCoefficients(link.freqGHz, link.polarization);
  const attenDb = specificAttenuation(uniformRain, k, alpha) * link.lengthKm;
  const back = retrieveRainRate(attenDb, link);
  assert.ok(Math.abs(back - uniformRain) < 0.01, `kembali ${back}`);
});

test("setiap sel grid punya taksiran, bobot dalam jangkauan menjumlah satu", () => {
  const kernel = buildIdwKernel(links, EVENT_GRID);

  // Sel di luar jangkauan setiap lintasan tetap diberi taksiran dari tautan
  // terdekat, tetapi bobotnya kurang dari satu supaya nilainya meluruh. Yang
  // tidak boleh terjadi adalah sel tanpa penyumbang sama sekali.
  kernel.cellLinkIndices.forEach((idx, c) => {
    assert.ok(idx.length > 0, `sel ${c} tidak punya tautan penyumbang`);

    let sum = 0;
    for (const v of kernel.cellWeights[c]) sum += v;

    if (kernel.cellInRange[c]) {
      assert.ok(Math.abs(sum - 1) < 1e-9, `sel ${c} dalam jangkauan, bobot ${sum}`);
    } else {
      assert.equal(idx.length, 1, `sel ${c} di luar jangkauan tapi punya ${idx.length} penyumbang`);
      assert.ok(sum > 0 && sum <= 1, `sel ${c} di luar jangkauan, bobot ${sum}`);
    }
  });

  const coverage = kernelCoverage(kernel);
  assert.ok(
    coverage > 0.5 && coverage < 1,
    `cakupan ${(coverage * 100).toFixed(0)} persen, angka ini harus dilaporkan apa adanya`,
  );
});

test("medan seragam dipulihkan utuh di dalam jangkauan dan meluruh di luarnya", () => {
  const kernel = buildIdwKernel(links, EVENT_GRID);
  const field = reconstructField(
    kernel,
    links.map(() => 12),
  );

  field.values.forEach((v, c) => {
    if (kernel.cellInRange[c]) {
      assert.ok(Math.abs(v - 12) < 1e-9, `sel ${c} dalam jangkauan bernilai ${v}`);
    } else {
      // Di luar jangkauan taksirannya tidak boleh melebihi nilai tautan
      // terdekat, dan harus lebih rendah karena diluruhkan.
      assert.ok(v > 0 && v < 12, `sel ${c} di luar jangkauan bernilai ${v}`);
    }
  });
});

test("computeRmse nol untuk medan identik dan benar untuk selisih tetap", () => {
  const a: GridField = { bbox: EVENT_GRID.bbox, nx: 2, ny: 2, values: [1, 2, 3, 4] };
  const b: GridField = { bbox: EVENT_GRID.bbox, nx: 2, ny: 2, values: [1, 2, 3, 4] };
  assert.equal(computeRmse(a, b), 0);

  const c: GridField = { ...a, values: [3, 4, 5, 6] };
  assert.ok(Math.abs(computeRmse(a, c) - 2) < 1e-12);
  assert.equal(computeRmse({ ...a, values: [] }, { ...b, values: [] }), 0);
});

test("titik pusat puncak lebih tenang daripada sel pemenang tunggal", () => {
  // Dua sel bernilai hampir sama: titik beratnya berada di antara keduanya dan
  // tidak melompat ketika salah satu menang tipis.
  const base: GridField = {
    bbox: [0, 0, 1, 1],
    nx: 3,
    ny: 1,
    values: [10, 0, 9.99],
  };
  const flipped: GridField = { ...base, values: [9.99, 0, 10] };
  const d = distanceKm(fieldPeakCenter(base).at, fieldPeakCenter(flipped).at);
  assert.ok(d < 1, `titik pusat bergeser ${d.toFixed(3)} km`);
});

test("tautan yang diklasifikasi kering tidak pernah menyumbang hujan", () => {
  for (const snap of run.snapshots) {
    for (const state of snap.links) {
      if (!state.isWet) {
        assert.equal(state.estRainMmH, 0);
        assert.equal(state.attenuationDb, 0);
      }
    }
  }
});

test("klasifikasi mengikuti kebenaran dasar pada puncak kejadian", () => {
  const peak = run.snapshots.reduce((best, s) =>
    Math.max(...s.truth.values) > Math.max(...best.truth.values) ? s : best,
  );
  const index = run.times.indexOf(peak.t);
  let wetTruth = 0;
  let wetDetected = 0;
  for (const s of run.series.values()) {
    if (s.trueRainMmH[index] > WET_RAIN_MM_H) {
      wetTruth++;
      if (s.isWet[index]) wetDetected++;
    }
  }
  assert.ok(wetTruth > 0, "tidak ada tautan basah pada puncak kejadian");
  assert.ok(
    wetDetected / wetTruth > 0.9,
    `hanya ${wetDetected} dari ${wetTruth} tautan basah terdeteksi`,
  );
});
