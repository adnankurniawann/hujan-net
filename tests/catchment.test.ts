// Uji lapisan DAS, tugas C1.
//
// Menggantikan harness sementara yang sebelumnya hidup di luar repo. Seluruh uji
// di berkas ini murni: tidak menyentuh basis data, tidak menyentuh jaringan.

import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import configJson from "../data/catchment-config.json" with { type: "json" };
import type { GridField } from "../lib/types.ts";
import {
  accumulateWindow,
  buildRainSeries,
  catchmentMeanRain,
  catchmentStatesAt,
  cellCenter,
  clearMembershipCache,
  computeMembership,
  findEmptyMemberships,
  parseCatchments,
  parseConfig,
  pointInPolygon,
  resolveStatus,
  thresholdsFor,
  WINDOW_SECONDS,
} from "../lib/catchment/index.ts";
import { assertConfigCoversCatchments, operationalThresholdsFor } from "../lib/catchment/config.ts";
import { EVENT_BBOX, EVENT_GRID } from "../lib/sim/scenario.ts";

// `catchments.geojson` dibaca lewat fs, bukan diimpor, karena atribut impor
// `with { type: "json" }` hanya berlaku untuk berkas berakhiran `.json`.
const catchmentsJson = JSON.parse(readFileSync("data/catchments.geojson", "utf8"));
const catchments = parseCatchments(catchmentsJson);
const config = parseConfig(configJson);

/** Grid uji memakai bentuk yang sama dengan kejadian sungguhan. */
function makeField(fn: (lon: number, lat: number) => number): GridField {
  const { nx, ny } = EVENT_GRID;
  const [lonMin, latMin, lonMax, latMax] = EVENT_BBOX;
  const values = new Array<number>(nx * ny);
  for (let i = 0; i < values.length; i++) {
    const lon = lonMin + ((i % nx) + 0.5) * ((lonMax - lonMin) / nx);
    const lat = latMin + ((Math.floor(i / nx) + 0.5) * (latMax - latMin)) / ny;
    values[i] = fn(lon, lat);
  }
  return { bbox: EVENT_BBOX, nx, ny, values };
}

test("konfigurasi mengenali seluruh DAS di geojson", () => {
  assert.doesNotThrow(() => assertConfigCoversCatchments(config, catchments));
  assert.equal(catchments.length, 3);
});

/**
 * Cari bukti kecekungan pada sebuah DAS, DITURUNKAN DARI DATANYA.
 *
 * Menyapu garis-garis lintang di dalam kotak batas dan mencari pola
 * dalam -> luar -> dalam pada satu garis yang sama. Pola itulah yang salah
 * dihitung oleh algoritma yang hanya benar untuk poligon cembung: sinar ujinya
 * memotong tepi dengan jumlah genap, dan titik di celah dikira berada di dalam.
 *
 * Versi sebelumnya memaku koordinat takik yang digambar tangan di C-03. Takik
 * itu ada justru karena ketiga DAS T0 adalah persegi panjang. Sejak batasnya
 * diturunkan dari topografi asli, kecekungan datang dari bentuk lembah yang
 * sebenarnya, jadi ujinya harus menemukannya sendiri, bukan menghafal titik.
 */
function findConcavity(
  c: (typeof catchments)[number],
): { lat: number; leftLon: number; gapLon: number; rightLon: number } | null {
  const [lonMin, latMin, lonMax, latMax] = c.bbox;
  const steps = 300;
  for (let iy = 0; iy < steps; iy++) {
    const lat = latMin + ((iy + 0.5) / steps) * (latMax - latMin);
    const lons: number[] = [];
    const inside: boolean[] = [];
    for (let ix = 0; ix < steps; ix++) {
      const lon = lonMin + ((ix + 0.5) / steps) * (lonMax - lonMin);
      lons.push(lon);
      inside.push(pointInPolygon(lon, lat, c));
    }
    const first = inside.indexOf(true);
    const last = inside.lastIndexOf(true);
    if (first < 0) continue;
    for (let i = first + 1; i < last; i++) {
      if (!inside[i]) {
        return { lat, leftLon: lons[first], gapLon: lons[i], rightLon: lons[last] };
      }
    }
  }
  return null;
}

test("titik dalam poligon benar untuk poligon cekung", () => {
  const probes = catchments
    .map((c) => ({ c, probe: findConcavity(c) }))
    .filter((x) => x.probe !== null);

  assert.ok(
    probes.length > 0,
    "tidak ada satu pun DAS yang cekung, jadi jalur kode cekung tidak teruji",
  );

  for (const { c, probe } of probes) {
    const p = probe!;
    assert.equal(pointInPolygon(p.leftLon, p.lat, c), true, `${c.id} tepi barat`);
    assert.equal(pointInPolygon(p.rightLon, p.lat, c), true, `${c.id} tepi timur`);
    // Celah di antara keduanya: DI LUAR. Inilah yang gagal kalau algoritmanya
    // hanya benar untuk poligon cembung.
    assert.equal(pointInPolygon(p.gapLon, p.lat, c), false, `${c.id} celah`);
    // Jauh di luar kotak batas.
    assert.equal(pointInPolygon(c.bbox[2] + 1, p.lat, c), false, `${c.id} jauh di timur`);
  }
});

test("tidak ada dua DAS yang mengklaim sel yang sama", () => {
  // `computeMembership` berhenti pada DAS pertama yang cocok dan mencatat
  // alasannya: "poligon DAS tidak saling tumpang tindih". Kalau suatu saat
  // batasnya dibangun ulang dan ternyata beririsan, sel yang sama akan dihitung
  // untuk dua DAS tanpa satu pun tanda di layar. Uji ini yang menandainya.
  const [lonMin, latMin, lonMax, latMax] = EVENT_BBOX;
  const { nx, ny } = EVENT_GRID;
  const bentrok: string[] = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const lon = lonMin + ((ix + 0.5) * (lonMax - lonMin)) / nx;
      const lat = latMin + ((iy + 0.5) * (latMax - latMin)) / ny;
      const owners = catchments.filter((c) => pointInPolygon(lon, lat, c)).map((c) => c.id);
      if (owners.length > 1) bentrok.push(`${lon.toFixed(4)},${lat.toFixed(4)}: ${owners.join("+")}`);
    }
  }
  assert.deepEqual(bentrok, []);
});

test("seluruh DAS berada di dalam kotak kejadian", () => {
  // Janji yang ditulis di lib/sim/scenario.ts dan diandalkan computeMembership:
  // setiap DAS pasti kebagian sel grid karena tidak ada bagiannya yang jatuh
  // di luar grid.
  const [lonMin, latMin, lonMax, latMax] = EVENT_BBOX;
  for (const c of catchments) {
    for (const ring of c.rings) {
      for (const [lon, lat] of ring) {
        assert.ok(
          lon >= lonMin - 1e-9 && lon <= lonMax + 1e-9 && lat >= latMin - 1e-9 && lat <= latMax + 1e-9,
          `${c.id} punya verteks di luar kotak kejadian: ${lon}, ${lat}`,
        );
      }
    }
  }
});

test("setiap DAS mendapat sel pada grid kejadian", () => {
  clearMembershipCache();
  const memberships = computeMembership(catchments, makeField(() => 0), true);
  assert.deepEqual(findEmptyMemberships(memberships), []);
  const total = memberships.reduce((a, m) => a + m.cellIndices.length, 0);
  assert.ok(total <= EVENT_GRID.nx * EVENT_GRID.ny, "satu sel tidak boleh dipakai dua DAS");
});

test("baris grid dihitung dari selatan, sesuai lib/sim/grid", () => {
  const field = makeField(() => 0);
  const first = cellCenter(field, 0, true);
  const nextRow = cellCenter(field, field.nx, true);
  assert.ok(nextRow.lat > first.lat, "indeks baris naik berarti lintang naik ke utara");
  assert.equal(config.gridRowOrder, "south-to-north");
});

test("rata rata DAS mengabaikan nilai rusak alih alih menghasilkan NaN", () => {
  clearMembershipCache();
  const field = makeField(() => Number.NaN);
  const membership = computeMembership(catchments, field, true)[0];
  assert.equal(catchmentMeanRain(field, membership), 0);
});

test("hujan tetap R mm/jam selama D detik menghasilkan R*D/3600 mm", () => {
  const samples = [];
  for (let t = 0; t <= 3600; t += 15) samples.push({ t, meanMmH: 24 });

  assert.ok(Math.abs(accumulateWindow(samples, 3600, WINDOW_SECONDS.accum1h) - 24) < 1e-9);
  assert.ok(Math.abs(accumulateWindow(samples, 1800, WINDOW_SECONDS.accum1h) - 12) < 1e-9);
  // Jendela lebih pendek daripada data harus terpangkas, bukan diabaikan.
  assert.ok(Math.abs(accumulateWindow(samples, 3600, 1800) - 12) < 1e-9);
});

test("kasus batas akumulasi tidak menghasilkan NaN", () => {
  const samples = [{ t: 0, meanMmH: 50 }];
  assert.equal(accumulateWindow(samples, 100, 3600), 0, "cuplikan tunggal");
  assert.equal(accumulateWindow([], 100, 3600), 0, "tanpa cuplikan");
  assert.equal(accumulateWindow(samples, 0, 3600), 0, "t di awal kejadian");
  assert.equal(accumulateWindow(samples, 100, 0), 0, "jendela nol");
});

test("akumulasi tidak pernah turun selama jendela belum bergeser", () => {
  const series = buildRainSeries(syntheticFrames(), catchments, config);
  for (const s of series) {
    let previous = -1;
    for (let t = 0; t <= 3600; t += 60) {
      const value = accumulateWindow(s.samples, t, WINDOW_SECONDS.accum6h);
      assert.ok(value >= previous - 1e-9, `${s.catchmentId} turun pada t=${t}`);
      previous = value;
    }
  }
});

test("status berpindah normal ke waspada ke siaga", () => {
  const series = buildRainSeries(syntheticFrames(), catchments, config);
  const seen = new Map<string, Set<string>>();
  for (let t = 0; t <= 3600; t += 60) {
    for (const state of catchmentStatesAt(series, t, config)) {
      if (!seen.has(state.id)) seen.set(state.id, new Set());
      seen.get(state.id)!.add(state.status);
    }
  }
  const gadog = seen.get("C-03");
  assert.ok(gadog?.has("normal"));
  assert.ok(gadog?.has("waspada"));
  assert.ok(gadog?.has("siaga"));
});

test("ambang operasional dari T0 tidak berubah", () => {
  assert.equal(operationalThresholdsFor(config, "C-01").accum1h.siagaMm, 50);
  assert.equal(operationalThresholdsFor(config, "C-02").accum1h.siagaMm, 45);
  assert.equal(operationalThresholdsFor(config, "C-03").accum1h.siagaMm, 40);
});

test("demoScale menskalakan ambang efektif, bukan mengubah angka operasional", () => {
  for (const id of ["C-01", "C-02", "C-03"]) {
    const operational = operationalThresholdsFor(config, id);
    const effective = thresholdsFor(config, id);
    for (const key of ["accum1h", "accum3h", "accum6h"] as const) {
      assert.ok(
        Math.abs(effective[key].siagaMm - operational[key].siagaMm * config.demoScale) < 1e-9,
        `${id} ${key}`,
      );
    }
  }
});

test("menaikkan ambang di konfigurasi menekan status jadi normal", () => {
  const strict = parseConfig({
    ...configJson,
    demoScale: 1,
    perCatchment: {
      "C-03": {
        accum1h: { waspadaMm: 900, siagaMm: 999 },
        accum3h: { waspadaMm: 900, siagaMm: 999 },
        accum6h: { waspadaMm: 900, siagaMm: 999 },
      },
    },
  });
  const series = buildRainSeries(syntheticFrames(), catchments, strict);
  for (let t = 0; t <= 3600; t += 300) {
    const state = catchmentStatesAt(series, t, strict).find((s) => s.id === "C-03");
    assert.equal(state?.status, "normal");
  }
});

test("jendela penentu dipilih menurut rasio terhadap ambang siaga", () => {
  const thresholds = {
    accum1h: { waspadaMm: 10, siagaMm: 20 },
    accum3h: { waspadaMm: 40, siagaMm: 80 },
    accum6h: { waspadaMm: 60, siagaMm: 120 },
  };
  // 30 mm dalam 1 jam lebih parah daripada 60 mm dalam 6 jam.
  const resolved = resolveStatus({ accum1h: 30, accum3h: 60, accum6h: 60 }, thresholds);
  assert.equal(resolved.status, "siaga");
  assert.equal(resolved.governingWindow, "accum1h");
  assert.equal(resolved.thresholdMm, 20);
});

test("geojson tidak lagi memuat thresholdMm inline", () => {
  const features = (catchmentsJson as { features: { properties: Record<string, unknown> }[] })
    .features;
  assert.ok(features.every((f) => !("thresholdMm" in f.properties)));
});

test("berkas rusak ditolak dengan pesan jelas", () => {
  assert.throws(() => parseCatchments({ type: "Polygon" }), /FeatureCollection/);
  assert.throws(
    () =>
      parseCatchments({
        type: "FeatureCollection",
        features: [
          {
            properties: { id: "x", name: "X" },
            geometry: { type: "MultiPolygon", coordinates: [] },
          },
        ],
      }),
    /MultiPolygon/,
  );
  assert.throws(() => parseConfig({ ...configJson, gridRowOrder: "sideways" }), /gridRowOrder/);
  assert.throws(() => parseConfig({ ...configJson, demoScale: 0 }), /demoScale/);
  assert.throws(() => parseConfig({ ...configJson, demoScale: 2 }), /demoScale/);
  assert.throws(
    () => assertConfigCoversCatchments(parseConfig({ ...configJson, perCatchment: { "C-99": {} } }), catchments),
    /C-99/,
  );
});

test("seluruh rentang waktu selesai jauh di bawah dua detik", () => {
  clearMembershipCache();
  const started = performance.now();
  const series = buildRainSeries(syntheticFrames(), catchments, config);
  for (let t = 0; t <= 3600; t += 15) catchmentStatesAt(series, t, config);
  assert.ok(performance.now() - started < 2000);
});

/**
 * Badai sintetis untuk uji yang tidak perlu menjalankan model invers.
 * Sengaja lebih kuat daripada DEMO_STORM supaya perpindahan status bisa diuji
 * tanpa bergantung pada penyetelan `demoScale`.
 */
function syntheticFrames(): { t: number; field: GridField }[] {
  const frames: { t: number; field: GridField }[] = [];
  for (let t = 0; t <= 3600; t += 15) {
    const progress = t / 3600;
    const centreLon = 107.03 - progress * 0.14;
    const centreLat = -6.66 - progress * 0.05;
    const envelope = Math.sin(Math.PI * progress) ** 2;
    frames.push({
      t,
      field: makeField((lon, lat) => {
        const dx = (lon - centreLon) * 111;
        const dy = (lat - centreLat) * 110;
        return 120 * envelope * Math.exp(-(dx * dx + dy * dy) / 72);
      }),
    });
  }
  return frames;
}
