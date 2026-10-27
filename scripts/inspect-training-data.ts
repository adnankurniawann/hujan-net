// Membongkar isi data latih, supaya bisa dijelaskan ke juri tanpa mengarang.
//
// Jalankan:  node scripts/inspect-training-data.ts
//
// Skrip ini TIDAK melatih apa pun. Ia hanya membangkitkan beberapa badai dengan
// benih yang sama seperti scripts/train-operator.ts, lalu memperlihatkan isi
// satu contoh latih apa adanya: apa yang masuk, apa yang keluar, dan seperti apa
// sebarannya.

import linksData from "../data/links.json" with { type: "json" };
import type { Link } from "../lib/types.ts";
import { simulateEvent } from "../lib/sim/forward.ts";
import { invertSeries } from "../lib/inverse/index.ts";
import { rainFieldAt, type StormConfig } from "../lib/sim/rainField.ts";
import { EVENT_GRID, EVENT_DURATION_S } from "../lib/sim/scenario.ts";
import { mulberry32 } from "../lib/sim/random.ts";

const links = linksData as Link[];
const [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX] = EVENT_GRID.bbox;

// Sama persis dengan train-operator.ts.
function randomStorm(seed: number): StormConfig {
  const rnd = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const margin = 0.02;
  const cellCount = 1 + Math.floor(rnd() * 4);
  const cells = Array.from({ length: cellCount }, () => ({
    lat: between(LAT_MIN - margin, LAT_MAX + margin),
    lon: between(LON_MIN - margin, LON_MAX + margin),
    radiusKm: between(1.2, 4.5),
    peakMmH: between(8, 55),
  }));
  return {
    cells,
    windBearingDeg: between(0, 360),
    windSpeedKmh: between(4, 32),
    durationS: EVENT_DURATION_S,
  };
}

let seed = 0x48554a41;
const nextSeed = () => (seed = (seed + 0x9e3779b1) >>> 0);

const line = (c = "=") => console.log(c.repeat(74));

// --- 1. Seperti apa badai yang dibangkitkan ------------------------------

line();
console.log("1. SEBARAN BADAI YANG DIBANGKITKAN (260 badai latih)");
line();

const storms = Array.from({ length: 260 }, () => randomStorm(nextSeed()));

const cellCounts = new Map<number, number>();
let peakMin = Infinity, peakMax = -Infinity, peakSum = 0, peakN = 0;
let radMin = Infinity, radMax = -Infinity;
let spdMin = Infinity, spdMax = -Infinity;
for (const s of storms) {
  cellCounts.set(s.cells.length, (cellCounts.get(s.cells.length) ?? 0) + 1);
  for (const c of s.cells) {
    peakMin = Math.min(peakMin, c.peakMmH);
    peakMax = Math.max(peakMax, c.peakMmH);
    peakSum += c.peakMmH; peakN++;
    radMin = Math.min(radMin, c.radiusKm);
    radMax = Math.max(radMax, c.radiusKm);
  }
  spdMin = Math.min(spdMin, s.windSpeedKmh);
  spdMax = Math.max(spdMax, s.windSpeedKmh);
}

console.log(`\n  Jumlah gumpalan hujan per badai:`);
for (const n of [...cellCounts.keys()].sort()) {
  const c = cellCounts.get(n)!;
  console.log(`    ${n} gumpalan : ${String(c).padStart(3)} badai  ${"#".repeat(Math.round(c / 3))}`);
}
console.log(`\n  Intensitas puncak gumpalan : ${peakMin.toFixed(1)} - ${peakMax.toFixed(1)} mm/jam (rata rata ${(peakSum / peakN).toFixed(1)})`);
console.log(`  Ukuran gumpalan (radius)   : ${radMin.toFixed(1)} - ${radMax.toFixed(1)} km`);
console.log(`  Kecepatan angin            : ${spdMin.toFixed(1)} - ${spdMax.toFixed(1)} km/jam`);
console.log(`  Arah angin                 : 0 - 360 derajat (bebas)`);
console.log(`  Lama tiap badai            : ${EVENT_DURATION_S} detik = 1 jam`);

// --- 2. Isi satu contoh latih -------------------------------------------

line();
console.log("2. ISI SATU CONTOH LATIH, APA ADANYA");
line();

const demo = storms[0];
const event = simulateEvent(links, { storm: demo });
const series = invertSeries(event);

// Ambil langkah waktu dengan hujan paling deras, supaya contohnya jelas.
let bestI = 0, bestPeak = 0;
for (let i = 0; i < event.times.length; i += 8) {
  const f = rainFieldAt(demo, event.times[i], EVENT_GRID);
  let p = 0; for (const v of f.values) if (v > p) p = v;
  if (p > bestPeak) { bestPeak = p; bestI = i; }
}

const t = event.times[bestI];
const truth = rainFieldAt(demo, t, EVENT_GRID);
const linkRain = links.map((l) => series.get(l.id)?.estRainMmH[bestI] ?? 0);

console.log(`\n  Badai #1, detik ke-${t}\n`);
console.log(`  MASUKAN  (x) : ${linkRain.length} angka  = taksiran hujan tiap tautan, mm/jam`);
console.log(`  KELUARAN (y) : ${truth.values.length} angka = peta hujan SEBENARNYA, mm/jam`);
console.log(`                 (grid ${EVENT_GRID.nx} x ${EVENT_GRID.ny}, tiap kotak ~550 m)`);

console.log(`\n  --- MASUKAN: 10 tautan pertama dari 50 ---`);
console.log(`  tautan   frek   panjang   taksiran hujan`);
for (let i = 0; i < 10; i++) {
  const l = links[i];
  console.log(
    `  ${l.id}   ${String(l.freqGHz).padStart(2)} GHz  ${l.lengthKm.toFixed(2).padStart(5)} km   ` +
      `${linkRain[i].toFixed(2).padStart(6)} mm/jam`,
  );
}
const wet = linkRain.filter((v) => v > 0.2).length;
console.log(`  ... (40 tautan lagi)`);
console.log(`\n  Dari 50 tautan: ${wet} basah, ${50 - wet} kering pada detik ini.`);

console.log(`\n  --- KELUARAN: peta 40 x 30, ditampilkan sebagai gambar ---`);
console.log(`      (spasi = kering, angka = mm/jam dibulatkan, X = di atas 9)\n`);
for (let iy = EVENT_GRID.ny - 1; iy >= 0; iy--) {
  let row = "      ";
  for (let ix = 0; ix < EVENT_GRID.nx; ix++) {
    const v = truth.values[iy * EVENT_GRID.nx + ix];
    row += v < 0.5 ? " " : v > 9.5 ? "X" : String(Math.round(v));
  }
  console.log(row);
}

let tMin = Infinity, tMax = -Infinity, tSum = 0, tWet = 0;
for (const v of truth.values) {
  tMin = Math.min(tMin, v); tMax = Math.max(tMax, v); tSum += v;
  if (v > 0.2) tWet++;
}
console.log(`\n  Peta ini: puncak ${tMax.toFixed(1)} mm/jam, rata rata ${(tSum / truth.values.length).toFixed(2)},`);
console.log(`  ${tWet} dari ${truth.values.length} kotak berhujan (${((tWet / truth.values.length) * 100).toFixed(0)} %).`);

// --- 2b. Seberapa sering badai benar benar mengenai jaringan -------------

line();
console.log("2b. SEBERAPA BANYAK TAUTAN YANG BASAH DI TIAP CONTOH LATIH");
line();
console.log("\n  (dihitung dari 60 badai contoh, supaya tidak lama)\n");

const buckets = [0, 0, 0, 0, 0, 0]; // 0, 1-5, 6-10, 11-20, 21-35, 36-50
let frames = 0;
let bestFrame: { linkRain: number[]; truth: number[]; wet: number } | null = null;

let s2 = 0x48554a41;
const nextSeed2 = () => (s2 = (s2 + 0x9e3779b1) >>> 0);

for (let n = 0; n < 60; n++) {
  const st = randomStorm(nextSeed2());
  const ev = simulateEvent(links, { storm: st });
  const sr = invertSeries(ev);
  for (let i = 0; i < ev.times.length; i += 8) {
    const f = rainFieldAt(st, ev.times[i], EVENT_GRID);
    let p = 0; for (const v of f.values) if (v > p) p = v;
    if (p < 0.5) continue;

    const lr = links.map((l) => sr.get(l.id)?.estRainMmH[i] ?? 0);
    const w = lr.filter((v) => v > 0.2).length;
    frames++;

    if (w === 0) buckets[0]++;
    else if (w <= 5) buckets[1]++;
    else if (w <= 10) buckets[2]++;
    else if (w <= 20) buckets[3]++;
    else if (w <= 35) buckets[4]++;
    else buckets[5]++;

    if (!bestFrame || w > bestFrame.wet) bestFrame = { linkRain: lr, truth: f.values, wet: w };
  }
}

const labels = ["0 tautan", "1-5", "6-10", "11-20", "21-35", "36-50"];
for (let i = 0; i < buckets.length; i++) {
  const pct = (buckets[i] / frames) * 100;
  console.log(
    `  ${labels[i].padEnd(10)} : ${String(buckets[i]).padStart(4)} potret ` +
      `(${pct.toFixed(1).padStart(5)} %)  ${"#".repeat(Math.round(pct / 2))}`,
  );
}
console.log(`\n  Total ${frames} potret dari 60 badai.`);

if (bestFrame) {
  console.log(`\n  --- Contoh yang jaringannya kena penuh: ${bestFrame.wet} tautan basah ---\n`);
  for (let iy = EVENT_GRID.ny - 1; iy >= 0; iy -= 2) {
    let row = "      ";
    for (let ix = 0; ix < EVENT_GRID.nx; ix++) {
      const v = bestFrame.truth[iy * EVENT_GRID.nx + ix];
      row += v < 0.5 ? " " : v > 9.5 ? "X" : String(Math.round(v));
    }
    console.log(row);
  }
}

// --- 3. Yang TIDAK ikut dilatih -----------------------------------------

line();
console.log("3. YANG TIDAK PERNAH DILIHAT MODEL");
line();
console.log(`
  Model TIDAK pernah melihat:
    - daya terima mentah (rxPowerDbm)
    - garis dasar sebenarnya (baselineDb)
    - hujan sebenarnya per tautan (trueRainMmH)
    - posisi, ukuran, atau arah gerak gumpalan hujan

  Model HANYA melihat:
    - 50 angka taksiran hujan per tautan  -> hasil rantai invers langkah 1-4
    - 1200 angka peta hujan sebenarnya    -> hanya sebagai kunci jawaban saat latih

  Waktu dipakai nanti, model cuma dikasih 50 angka itu. Tidak ada yang lain.`);

line();
console.log("4. RINGKASAN UNTUK DIUCAPKAN");
line();
console.log(`
  260 badai latih  x  ~24 potret per badai  =  6.100 pasang contoh
  Tiap pasang: 50 angka masuk  ->  1.200 angka keluar

  Yang dipelajari model: bagaimana mengubah 50 angka garis
  menjadi 1.200 angka peta, sebaik mungkin.
`);
