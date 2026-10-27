import test from "node:test";
import assert from "node:assert/strict";

import { distanceKm } from "../lib/sim/geo.ts";
import { fieldMax, fieldPeak, type GridSpec } from "../lib/sim/grid.ts";
import {
  cellPositionAt,
  rainFieldAt,
  rainRateAt,
  stormEnvelope,
  type StormConfig,
} from "../lib/sim/rainField.ts";
import {
  DEMO_STORM,
  EVENT_DURATION_S,
  EVENT_GRID,
  sampleTimes,
} from "../lib/sim/scenario.ts";

const GRID: GridSpec = EVENT_GRID;

test("pada t = 0 seluruh grid bernilai nol", () => {
  const field = rainFieldAt(DEMO_STORM, 0, GRID);
  assert.equal(field.values.length, GRID.nx * GRID.ny);
  assert.equal(fieldMax(field), 0);
});

test("pada akhir kejadian medan kembali nol", () => {
  assert.equal(fieldMax(rainFieldAt(DEMO_STORM, EVENT_DURATION_S, GRID)), 0);
});

test("ada waktu dengan intensitas puncak 40 sampai 90 mm/jam", () => {
  const peaks = sampleTimes().map((t) => fieldMax(rainFieldAt(DEMO_STORM, t, GRID)));
  const max = Math.max(...peaks);
  assert.ok(
    max >= 40 && max <= 90,
    `puncak tertinggi sepanjang kejadian ${max.toFixed(1)} mm/jam, di luar 40 sampai 90`,
  );
});

test("amplop waktu punya awal, puncak, dan akhir", () => {
  assert.equal(stormEnvelope(0, EVENT_DURATION_S), 0);
  assert.equal(stormEnvelope(EVENT_DURATION_S, EVENT_DURATION_S), 0);
  assert.ok(Math.abs(stormEnvelope(EVENT_DURATION_S / 2, EVENT_DURATION_S) - 1) < 1e-12);
  // Menaik sebelum puncak, menurun sesudahnya.
  assert.ok(stormEnvelope(600, EVENT_DURATION_S) < stormEnvelope(1200, EVENT_DURATION_S));
  assert.ok(stormEnvelope(2400, EVENT_DURATION_S) > stormEnvelope(3000, EVENT_DURATION_S));
  // Di luar rentang kejadian tetap nol, tidak pernah NaN.
  assert.equal(stormEnvelope(-100, EVENT_DURATION_S), 0);
  assert.equal(stormEnvelope(EVENT_DURATION_S + 100, EVENT_DURATION_S), 0);
});

test("sel bergeser sesuai arah dan kecepatan angin", () => {
  const cell = DEMO_STORM.cells[0];
  const start = cellPositionAt(cell, DEMO_STORM, 0);
  const after = cellPositionAt(cell, DEMO_STORM, 1800); // setengah jam

  const travelled = distanceKm(start, after);
  const expected = (DEMO_STORM.windSpeedKmh * 1800) / 3600; // 12,5 km
  assert.ok(
    Math.abs(travelled - expected) < 0.05,
    `bergeser ${travelled.toFixed(3)} km, seharusnya ${expected} km`,
  );

  // Arah 320 derajat berarti ke utara dan ke barat.
  assert.ok(after.lat > start.lat, "seharusnya bergerak ke utara");
  assert.ok(after.lon < start.lon, "seharusnya bergerak ke barat");

  // Pergeseran sebanding lurus dengan waktu.
  const quarter = cellPositionAt(cell, DEMO_STORM, 900);
  assert.ok(Math.abs(distanceKm(start, quarter) - expected / 2) < 0.05);
});

test("puncak medan ikut berpindah bersama sel", () => {
  const a = fieldPeak(rainFieldAt(DEMO_STORM, 900, GRID));
  const b = fieldPeak(rainFieldAt(DEMO_STORM, 2700, GRID));
  assert.ok(b.at.lat > a.at.lat, "puncak seharusnya bergeser ke utara");
  assert.ok(b.at.lon < a.at.lon, "puncak seharusnya bergeser ke barat");
});

test("radiusKm adalah jarak tempat intensitas turun menjadi separuh", () => {
  const cfg: StormConfig = {
    windBearingDeg: 0,
    windSpeedKmh: 0,
    durationS: 1000,
    cells: [{ lat: -6.66, lon: 106.91, radiusKm: 4, peakMmH: 50 }],
  };
  const t = 500; // puncak amplop
  const center = { lat: -6.66, lon: 106.91 };
  const atCenter = rainRateAt(cfg, t, center);
  const atRadius = rainRateAt(cfg, t, { lat: -6.66 + 4 / 110.574, lon: 106.91 });
  assert.ok(Math.abs(atCenter - 50) < 1e-9, `pusat ${atCenter}`);
  assert.ok(Math.abs(atRadius / atCenter - 0.5) < 1e-3, `pada radius ${atRadius}`);
});

test("fungsi murni: masukan sama memberi hasil sama", () => {
  const a = rainFieldAt(DEMO_STORM, 1234, GRID);
  const b = rainFieldAt(DEMO_STORM, 1234, GRID);
  assert.deepEqual(a, b);
  assert.equal(rainRateAt(DEMO_STORM, 1234, { lat: -6.66, lon: 106.91 }),
    rainRateAt(DEMO_STORM, 1234, { lat: -6.66, lon: 106.91 }));
});

test("medan grid dan medan analitik sepakat pada titik tengah sel", () => {
  const t = 1800;
  const field = rainFieldAt(DEMO_STORM, t, GRID);
  const peak = fieldPeak(field);
  const analytic = rainRateAt(DEMO_STORM, t, peak.at);
  assert.ok(
    Math.abs(analytic - peak.value) < 1e-9,
    `grid ${peak.value} versus analitik ${analytic}`,
  );
});
