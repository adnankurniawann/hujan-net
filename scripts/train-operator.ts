// Melatih operator rekonstruksi, lalu membandingkannya dengan IDW.
//
// Jalankan:  node scripts/train-operator.ts
//
// Menulis data/ml-operator.json, yang dibaca lib/ml/loadOperator.ts di sisi
// server dan disambungkan reconstructEvent sebagai medan rekonstruksi kedua
// (Snapshot.mlReconstruction), berdampingan dengan IDW. Jalankan ulang skrip
// ini kapan pun data/links.json berubah topologinya — bobotnya terikat pada
// geometri persis yang dipakai melatih.
//
// PROTOKOL YANG DIPAKAI, DAN KENAPA
//
// Pemisahan dilakukan PER BADAI, bukan per langkah waktu. Ini bukan detail
// kecil. Badai contoh bergerak 18 km/jam, jadi dalam 15 detik ia hanya berpindah
// 75 meter sementara satu sel grid lebarnya 550 meter. Medan pada langkah ke-900
// dan ke-915 nyaris identik. Kalau pemisahannya diacak per langkah waktu,
// tetangga langsung sebuah cuplikan latih akan muncul di himpunan uji, dan
// angkanya menjadi bohong. Itu kebocoran data, dan itu kesalahan paling umum
// pada pekerjaan semacam ini.
//
// Ada tiga himpunan, seluruhnya berisi badai yang berbeda:
//
//   latih     -> menghitung bobot operator
//   validasi  -> memilih lambda, tidak pernah ikut menghitung bobot
//   uji       -> hanya dilaporkan sekali di akhir, tidak pernah menyetel apa pun
//
// Ditambah empat badai bernama yang disimpan terpisah, termasuk DEMO_STORM yang
// dipakai dasbor. Tak satu pun pernah dilihat saat melatih.
//
// Seluruh keacakan berasal dari mulberry32 dengan benih tetap, sejalan dengan
// aturan proyek: tidak ada Math.random. Jalankan di mesin mana pun, angkanya sama.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import linksData from "../data/links.json" with { type: "json" };
import type { GridField, Link } from "../lib/types.ts";
import { simulateEvent } from "../lib/sim/forward.ts";
import { invertSeries } from "../lib/inverse/index.ts";
import {
  buildIdwKernel,
  kernelCoverage,
  reconstructField,
} from "../lib/inverse/field.ts";
import { computeBias, computeRmse } from "../lib/inverse/rmse.ts";
import { rainFieldAt, type StormConfig } from "../lib/sim/rainField.ts";
import { DEMO_STORM, EVENT_GRID, EVENT_DURATION_S } from "../lib/sim/scenario.ts";
import { fieldPeakCenter } from "../lib/sim/grid.ts";
import { distanceKm } from "../lib/sim/geo.ts";
import { mulberry32 } from "../lib/sim/random.ts";
import {
  applyLinearOperator,
  fitLinearOperator,
  serializeOperator,
  type LinearOperator,
  type TrainingSample,
} from "../lib/ml/operator.ts";

const links = linksData as Link[];

// --- pengaturan percobaan -------------------------------------------------

const TRAIN_STORMS = 260;
const VAL_STORMS = 60;
const TEST_STORMS = 80;
/** Ambil satu cuplikan tiap sekian langkah waktu, supaya contoh tidak terlalu berulang. */
const TIME_STRIDE = 8;
/** Hanya cuplikan yang benar benar berhujan yang dipakai melatih. */
const MIN_TRUTH_PEAK_MM_H = 0.5;
const LAMBDA_GRID = [1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1, 3e-1, 1];

// --- pembangkit badai -----------------------------------------------------

const [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX] = EVENT_GRID.bbox;

/**
 * Badai acak yang dapat diulang.
 *
 * Sel diletakkan di dalam kotak yang sedikit diperlebar, lalu angin membawanya
 * melintasi wilayah selama satu jam. Rentang tiap besaran dipilih supaya
 * keluarganya jauh lebih luas daripada DEMO_STORM: jumlah sel 1 sampai 4,
 * intensitas puncak 8 sampai 55 mm/jam, radius 1,2 sampai 4,5 km, dan arah
 * angin bebas ke segala penjuru.
 */
function randomStorm(seed: number): StormConfig {
  const rnd = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);

  const margin = 0.02; // derajat, kira kira 2 km
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

/** Empat badai bernama yang tidak pernah ikut melatih. */
const NAMED_STORMS: { name: string; storm: StormConfig }[] = [
  { name: "DEMO_STORM (dipakai dasbor)", storm: DEMO_STORM },
  {
    name: "satu sel besar lambat",
    storm: {
      cells: [{ lat: -6.745, lon: 107.01, radiusKm: 4.2, peakMmH: 34 }],
      windBearingDeg: 315,
      windSpeedKmh: 9,
      durationS: EVENT_DURATION_S,
    },
  },
  {
    name: "dua sel kecil cepat",
    storm: {
      cells: [
        { lat: -6.75, lon: 107.03, radiusKm: 1.6, peakMmH: 30 },
        { lat: -6.73, lon: 107.05, radiusKm: 1.4, peakMmH: 26 },
      ],
      windBearingDeg: 300,
      windSpeedKmh: 28,
      durationS: EVENT_DURATION_S,
    },
  },
  {
    name: "hujan ringan merata",
    storm: {
      cells: [
        { lat: -6.72, lon: 106.95, radiusKm: 4.4, peakMmH: 9 },
        { lat: -6.68, lon: 106.99, radiusKm: 4.0, peakMmH: 7 },
      ],
      windBearingDeg: 340,
      windSpeedKmh: 12,
      durationS: EVENT_DURATION_S,
    },
  },
];

// --- membangun contoh -----------------------------------------------------

const kernel = buildIdwKernel(links, EVENT_GRID);
const coverage = kernelCoverage(kernel);

/** Satu cuplikan siap pakai: taksiran per tautan, medan kebenaran, dan indeks waktu. */
interface Frame {
  linkRain: number[];
  truth: GridField;
  t: number;
}

/**
 * Jalankan model maju lalu langkah 1 sampai 4 model invers untuk satu badai,
 * kemudian ambil cuplikan tiap `TIME_STRIDE` langkah waktu.
 *
 * Yang menjadi masukan operator adalah `estRainMmH`, yaitu keluaran rantai
 * invers yang sesungguhnya. Bukan kebenaran dasar per tautan. Jadi operator
 * belajar menghadapi galat inversi juga, bukan cuma geometri.
 */
function framesOf(
  storm: StormConfig,
  opts: { stride?: number; minPeak?: number } = {},
): Frame[] {
  const stride = opts.stride ?? TIME_STRIDE;
  const minPeak = opts.minPeak ?? MIN_TRUTH_PEAK_MM_H;

  const event = simulateEvent(links, { storm });
  const series = invertSeries(event);

  const out: Frame[] = [];
  for (let i = 0; i < event.times.length; i += stride) {
    const t = event.times[i];
    const truth = rainFieldAt(storm, t, EVENT_GRID);

    let peak = 0;
    for (const v of truth.values) if (v > peak) peak = v;
    if (peak < minPeak) continue;

    const linkRain = links.map((l) => series.get(l.id)?.estRainMmH[i] ?? 0);
    out.push({ linkRain, truth, t });
  }
  return out;
}

/**
 * Seluruh langkah waktu tanpa penyaringan apa pun.
 *
 * Ini protokol yang sama persis dengan `Diagnostics.meanRmse` pada
 * `lib/inverse/index.ts`, yaitu 241 langkah waktu termasuk awal dan akhir yang
 * cerah. Dipakai untuk badai bernama supaya angka IDW yang dilaporkan di sini
 * bisa langsung dicocokkan dengan angka pada PENJELASAN.md.
 */
function framesOfFullEvent(storm: StormConfig): Frame[] {
  return framesOf(storm, { stride: 1, minPeak: -1 });
}

function samplesOf(frames: Frame[]): TrainingSample[] {
  return frames.map((f) => ({ linkRain: f.linkRain, truth: f.truth.values }));
}

// --- penilaian ------------------------------------------------------------

interface Score {
  rmse: number;
  rmseCovered: number;
  bias: number;
  peakKm: number;
  peakCount: number;
}

/** Batas intensitas puncak supaya posisi puncak layak dinilai, mm/jam. */
const PEAK_MIN_MM_H = 10;

/**
 * RMSE dirata ratakan secara ARITMETIK antar langkah waktu, persis seperti
 * `Diagnostics.meanRmse` pada `lib/inverse/index.ts`. Bukan rata rata kuadrat.
 * Ini penting: kalau agregasinya berbeda, angka IDW di sini tidak akan cocok
 * dengan angka pada PENJELASAN.md dan seluruh perbandingan jadi tidak sah.
 */
function score(frames: Frame[], predict: (f: Frame) => GridField): Score {
  let rmseSum = 0;
  let rmseCoveredSum = 0;
  let frameCount = 0;
  let coveredCount = 0;
  let biasSum = 0;
  let peakSum = 0;
  let peakCount = 0;

  for (const f of frames) {
    const est = predict(f);
    rmseSum += computeRmse(f.truth, est);
    biasSum += computeBias(f.truth, est);
    frameCount++;

    // RMSE hanya pada sel yang tercakup jaringan.
    let sq = 0;
    let n = 0;
    for (let i = 0; i < f.truth.values.length; i++) {
      if (!kernel.cellInRange[i]) continue;
      const d = f.truth.values[i] - est.values[i];
      sq += d * d;
      n++;
    }
    if (n > 0) {
      rmseCoveredSum += Math.sqrt(sq / n);
      coveredCount++;
    }

    const truePeak = fieldPeakCenter(f.truth);
    if (truePeak.value >= PEAK_MIN_MM_H) {
      const estPeak = fieldPeakCenter(est);
      peakSum += distanceKm(truePeak.at, estPeak.at);
      peakCount++;
    }
  }

  return {
    rmse: rmseSum / Math.max(1, frameCount),
    rmseCovered: rmseCoveredSum / Math.max(1, coveredCount),
    bias: biasSum / Math.max(1, frameCount),
    peakKm: peakCount > 0 ? peakSum / peakCount : Number.NaN,
    peakCount,
  };
}

const idwPredict = (f: Frame) => reconstructField(kernel, f.linkRain);
const learnedPredict = (op: LinearOperator) => (f: Frame) =>
  applyLinearOperator(op, f.linkRain);

// --- jalankan -------------------------------------------------------------

function fmt(v: number, digits = 2): string {
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

const started = Date.now();

console.log("Membangkitkan badai. Ini bagian yang paling lama.\n");

// Benih tetap. Diambil dari nama proyek supaya jelas bahwa angkanya tidak dipetik.
let seed = 0x48554a41; // "HUJA"
const nextSeed = () => (seed = (seed + 0x9e3779b1) >>> 0);

const trainFrames: Frame[] = [];
for (let i = 0; i < TRAIN_STORMS; i++) trainFrames.push(...framesOf(randomStorm(nextSeed())));
console.log(`  latih    : ${TRAIN_STORMS} badai -> ${trainFrames.length} cuplikan`);

// Validasi dan uji TIDAK disaring: seluruh langkah waktu ikut dinilai, termasuk
// awal dan akhir yang cerah, sama seperti protokol PENJELASAN.md. Penyaringan
// hanya berlaku untuk contoh latih, dan di sana pun hanya demi kecepatan:
// karena operatornya tanpa intersep, cuplikan yang seluruh tautannya nol tidak
// menyumbang apa pun ke matriks Gram.
const EVAL_STRIDE = 4;
const evalFrames = (s: StormConfig) => framesOf(s, { stride: EVAL_STRIDE, minPeak: -1 });

const valFrames: Frame[] = [];
for (let i = 0; i < VAL_STORMS; i++) valFrames.push(...evalFrames(randomStorm(nextSeed())));
console.log(`  validasi : ${VAL_STORMS} badai -> ${valFrames.length} cuplikan`);

const testFrames: Frame[] = [];
for (let i = 0; i < TEST_STORMS; i++) testFrames.push(...evalFrames(randomStorm(nextSeed())));
console.log(`  uji      : ${TEST_STORMS} badai -> ${testFrames.length} cuplikan`);

const trainSamples = samplesOf(trainFrames);

console.log(`\nMemilih lambda pada himpunan validasi (${VAL_STORMS} badai yang tidak ikut melatih):\n`);
console.log("  lambda      RMSE validasi");

let best: { lambda: number; op: LinearOperator; rmse: number } | null = null;
for (const lambda of LAMBDA_GRID) {
  const op = fitLinearOperator(trainSamples, EVENT_GRID, links.map((l) => l.id), { lambda });
  const s = score(valFrames, learnedPredict(op));
  const mark = !best || s.rmse < best.rmse ? " <-" : "";
  if (!best || s.rmse < best.rmse) best = { lambda, op, rmse: s.rmse };
  console.log(`  ${lambda.toExponential(0).padEnd(10)}  ${fmt(s.rmse)}${mark}`);
}

if (!best) throw new Error("tidak ada lambda yang berhasil");
console.log(`\nLambda terpilih: ${best.lambda}`);

const op = best.op;

console.log("\n" + "=".repeat(72));
console.log("HASIL PADA HIMPUNAN UJI — badai yang tidak pernah dilihat sama sekali");
console.log("=".repeat(72) + "\n");

const idwTest = score(testFrames, idwPredict);
const mlTest = score(testFrames, learnedPredict(op));

console.log(`  ${TEST_STORMS} badai, ${testFrames.length} cuplikan\n`);
console.log("                          IDW      terlatih   perubahan");
console.log(
  `  RMSE seluruh grid     ${fmt(idwTest.rmse).padStart(6)}   ${fmt(mlTest.rmse).padStart(8)}   ` +
    `${(((mlTest.rmse - idwTest.rmse) / idwTest.rmse) * 100).toFixed(1)} %`,
);
console.log(
  `  RMSE sel tercakup     ${fmt(idwTest.rmseCovered).padStart(6)}   ${fmt(mlTest.rmseCovered).padStart(8)}   ` +
    `${(((mlTest.rmseCovered - idwTest.rmseCovered) / idwTest.rmseCovered) * 100).toFixed(1)} %`,
);
console.log(
  `  Bias                  ${fmt(idwTest.bias).padStart(6)}   ${fmt(mlTest.bias).padStart(8)}`,
);
console.log(
  `  Galat posisi puncak   ${fmt(idwTest.peakKm).padStart(6)}   ${fmt(mlTest.peakKm).padStart(8)}   km` +
    `   (${idwTest.peakCount} cuplikan)`,
);

console.log("\n" + "=".repeat(72));
console.log("BADAI BERNAMA — tidak satu pun ikut melatih");
console.log("=".repeat(72) + "\n");

console.log("  Dinilai pada SELURUH 241 langkah waktu, protokol sama dengan PENJELASAN.md,");
console.log("  sehingga kolom IDW di bawah bisa langsung dicocokkan dengan dokumen itu.\n");
console.log("  skenario                        IDW    terlatih   perubahan");
for (const { name, storm } of NAMED_STORMS) {
  const frames = framesOfFullEvent(storm);
  const a = score(frames, idwPredict);
  const b = score(frames, learnedPredict(op));
  const delta = ((b.rmse - a.rmse) / a.rmse) * 100;
  console.log(
    `  ${name.padEnd(30)} ${fmt(a.rmse).padStart(5)}   ${fmt(b.rmse).padStart(8)}   ${delta.toFixed(1)} %`,
  );
}

console.log("\n" + "=".repeat(72));
console.log("CATATAN YANG HARUS DISEBUT KE JURI");
console.log("=".repeat(72) + "\n");
console.log(`  Cakupan jaringan IDW              : ${(coverage * 100).toFixed(0)} %`);
console.log(`  Contoh latih                      : ${trainSamples.length}`);
console.log(`  Parameter operator                : ${op.nCells * op.nLinks} bobot`);
console.log(`  Lambda                            : ${op.lambda}`);
console.log(`  Waktu total                       : ${((Date.now() - started) / 1000).toFixed(1)} detik`);
console.log(`
  Operator terlatih mengisi SELURUH grid, termasuk sel di luar jangkauan
  jaringan, memakai korelasi ruang yang dipelajarinya. IDW sengaja meluruhkan
  sel di luar jangkauan menuju nol. Karena itu dua baris RMSE dilaporkan
  terpisah, dan angka "sel tercakup" adalah perbandingan yang paling adil.

  Operator ini dilatih pada badai sintetis dari pembangkit yang sama. Yang
  dipelajarinya adalah keluarga badai itu, bukan hujan Indonesia. Ini bukti
  konsep bahwa prior terlatih memperbaiki langkah yang anggaran galat kami
  tunjuk, bukan klaim bahwa sistemnya siap dipakai di lapangan.`);

// --- simpan --------------------------------------------------------------
//
// Ditulis ke data/, dibaca `lib/ml/loadOperator.ts` di sisi server. Bobotnya
// terikat pada topologi data/links.json PERSIS seperti dipakai melatih di
// atas; kalau berkas tautan berubah, jalankan ulang skrip ini.

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(HERE, "..", "data", "ml-operator.json");
writeFileSync(OUT_PATH, JSON.stringify(serializeOperator(op)) + "\n");
console.log(`\nOperator ditulis ke ${OUT_PATH}`);
