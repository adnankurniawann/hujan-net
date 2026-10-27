import test from "node:test";
import assert from "node:assert/strict";

import linksData from "../data/links.json" with { type: "json" };
import type { Link } from "../lib/types.ts";
import {
  allSamples,
  baselineAt,
  BASELINE_DRIFT_DB_PER_HOUR,
  NOISE_STD_DB,
  QUANT_STEP_DB,
  quantize,
  rainAttenuationOf,
  simulateEvent,
  WET_ANTENNA_DB,
} from "../lib/sim/forward.ts";
import {
  DEMO_STORM,
  EVENT_DURATION_S,
  SAMPLE_COUNT,
  sampleTimes,
} from "../lib/sim/scenario.ts";

const links = linksData as Link[];

test("data tautan memenuhi kontrak Link", () => {
  assert.ok(links.length >= 40, `hanya ${links.length} tautan, minimal 40`);
  assert.equal(
    new Set(links.map((l) => l.id)).size,
    links.length,
    "ada id tautan yang kembar",
  );
  for (const l of links) {
    assert.ok(l.id.length > 0, "ada tautan tanpa id");
    assert.ok(l.lengthKm >= 2 && l.lengthKm <= 8, `${l.id} panjang ${l.lengthKm} km`);
    assert.ok(l.freqGHz >= 15 && l.freqGHz <= 23, `${l.id} frekuensi ${l.freqGHz} GHz`);
    assert.ok(l.polarization === "H" || l.polarization === "V");
    assert.ok(Number.isFinite(l.txPowerDbm));
    assert.ok(Number.isFinite(l.siteA.lat) && Number.isFinite(l.siteA.lon));
    assert.ok(Number.isFinite(l.siteB.lat) && Number.isFinite(l.siteB.lon));
  }
});

test("menghasilkan cuplikan untuk seluruh tautan sepanjang kejadian", () => {
  const series = simulateEvent(links);
  assert.equal(series.times.length, SAMPLE_COUNT);
  assert.equal(series.times[0], 0);
  assert.equal(series.times[series.times.length - 1], EVENT_DURATION_S);
  assert.equal(series.samplesByLink.size, links.length);

  for (const link of links) {
    const samples = series.samplesByLink.get(link.id);
    assert.ok(samples, `${link.id} tidak punya cuplikan`);
    assert.equal(samples.length, SAMPLE_COUNT);
    samples.forEach((s, i) => {
      assert.equal(s.linkId, link.id);
      assert.equal(s.t, series.times[i]);
      assert.ok(Number.isFinite(s.rxPowerDbm));
      assert.ok(Number.isFinite(s.baselineDb));
      assert.ok(s.trueRainMmH >= 0);
    });
  }

  assert.equal(allSamples(series).length, links.length * SAMPLE_COUNT);
});

test("tautan yang dilewati hujan menunjukkan penurunan daya terima yang jelas", () => {
  const series = simulateEvent(links);
  let deepest = { linkId: "", dropDb: 0 };

  for (const link of links) {
    const samples = series.samplesByLink.get(link.id)!;
    for (const s of samples) {
      const drop = s.baselineDb - s.rxPowerDbm;
      if (drop > deepest.dropDb) deepest = { linkId: link.id, dropDb: drop };
    }
  }

  assert.ok(
    deepest.dropDb > 10,
    `penurunan terdalam hanya ${deepest.dropDb.toFixed(2)} dB pada ${deepest.linkId}`,
  );
});

test("tautan jauh dari sel hujan hanya menunjukkan derau", () => {
  const series = simulateEvent(links);

  // Cari tautan dengan hujan kebenaran dasar paling kecil sepanjang kejadian.
  let driest = { linkId: "", maxRain: Number.POSITIVE_INFINITY };
  for (const link of links) {
    const samples = series.samplesByLink.get(link.id)!;
    const maxRain = Math.max(...samples.map((s) => s.trueRainMmH));
    if (maxRain < driest.maxRain) driest = { linkId: link.id, maxRain };
  }

  const samples = series.samplesByLink.get(driest.linkId)!;
  const residuals = samples
    .filter((s) => s.trueRainMmH < 0.05)
    .map((s) => s.baselineDb - s.rxPowerDbm);

  assert.ok(residuals.length > 0, "tidak ada cuplikan kering untuk diperiksa");
  const worst = Math.max(...residuals.map(Math.abs));
  // Hanya derau dan kuantisasi: 3 sigma derau ditambah setengah langkah kuantisasi.
  const budget = 3 * NOISE_STD_DB + QUANT_STEP_DB / 2;
  assert.ok(
    worst <= budget,
    `sisa terbesar ${worst.toFixed(3)} dB melewati anggaran derau ${budget.toFixed(3)} dB`,
  );
});

test("redaman antena basah muncul tepat saat lintasan basah", () => {
  const link = links[0];
  const dry = rainAttenuationOf(link, DEMO_STORM, 0);
  assert.equal(dry.attenuationDb, 0);
  assert.equal(dry.meanRainMmH, 0);

  // Pada t = 0 tidak ada hujan sama sekali, jadi seluruh sisa adalah derau
  // dan kuantisasi, tanpa sumbangan antena basah.
  const series = simulateEvent([link]);
  const first = series.samplesByLink.get(link.id)![0];
  const residual = first.baselineDb - first.rxPowerDbm;
  assert.ok(
    Math.abs(residual) < WET_ANTENNA_DB,
    `sisa kering ${residual.toFixed(3)} dB tidak boleh memuat redaman antena basah`,
  );
});

test("daya terima dikuantisasi ke kelipatan langkah perangkat", () => {
  const series = simulateEvent(links.slice(0, 8));
  for (const samples of series.samplesByLink.values()) {
    for (const s of samples) {
      const steps = s.rxPowerDbm / QUANT_STEP_DB;
      assert.ok(
        Math.abs(steps - Math.round(steps)) < 1e-9,
        `${s.rxPowerDbm} bukan kelipatan ${QUANT_STEP_DB} dB`,
      );
    }
  }
  // Nilai di dalam satu langkah yang sama runtuh ke tingkat yang sama, dan
  // itulah sebabnya inversi tidak bisa lebih halus daripada 0,3 dB.
  assert.ok(Math.abs(quantize(-40.07) - -40.2) < 1e-9);
  assert.ok(Math.abs(quantize(-40.16) - -40.2) < 1e-9);
  assert.equal(quantize(1.5, 0), 1.5);
});

test("garis dasar menyimpang perlahan, orde setengah dB per jam", () => {
  for (const link of links.slice(0, 10)) {
    const values = sampleTimes().map((t) => baselineAt(link, t));
    const span = Math.max(...values) - Math.min(...values);
    assert.ok(
      span > 0,
      `${link.id} garis dasarnya datar, seharusnya melayang`,
    );
    // Kejadiannya satu jam, jadi rentang penyimpangan harus tetap di orde
    // laju penyimpangan per jam, bukan berkali kali lipat.
    assert.ok(
      span < BASELINE_DRIFT_DB_PER_HOUR * 2,
      `${link.id} melayang ${span.toFixed(3)} dB dalam satu jam, terlalu jauh`,
    );
  }
});

test("simulasi deterministik: dijalankan dua kali hasilnya identik", () => {
  const a = allSamples(simulateEvent(links.slice(0, 5)));
  const b = allSamples(simulateEvent(links.slice(0, 5)));
  assert.deepEqual(a, b);
});
