// Jalur lengkap model invers, dari cuplikan daya terima sampai Snapshot.
//
// Urutan enam langkah, masing masing di berkasnya sendiri:
//
//   1. classifyWetDry + pemeriksaan ketetanggaan   classify.ts
//   2. estimateBaseline                            baseline.ts
//   3. correctWaa                                  waa.ts
//   4. retrieveRainRate                            retrieve.ts
//   5. reconstructField                            field.ts
//   6. computeRmse                                 rmse.ts
//
// Model invers hanya boleh menyentuh `rxPowerDbm`. Bidang `baselineDb` dan
// `trueRainMmH` pada cuplikan adalah kebenaran dasar dan dipakai semata untuk
// menghitung angka galat yang ditampilkan ke juri.

import type { GridField, Link, LinkState, Snapshot } from "../types";
import { simulateEvent, WET_RAIN_MM_H, type EventSeries } from "../sim/forward.ts";
import { distanceKm } from "../sim/geo.ts";
import { rainFieldAt, type StormConfig } from "../sim/rainField.ts";
import { DEMO_STORM, EVENT_GRID } from "../sim/scenario.ts";
import { fieldPeakCenter, type GridSpec } from "../sim/grid.ts";
import { estimateBaseline, totalAttenuation } from "./baseline.ts";
import { classifyNetwork, type NeighbourOptions, type WetDryOptions } from "./classify.ts";
import {
  buildIdwKernel,
  kernelCoverage,
  reconstructField,
  type IdwKernel,
  type IdwOptions,
} from "./field.ts";
import { computeBias, computeRmse } from "./rmse.ts";
import { retrieveRainRate } from "./retrieve.ts";
import { correctWaa } from "./waa.ts";
import { applyLinearOperator, type LinearOperator } from "../ml/operator.ts";
import type { WetDryModel } from "../ml/wetdry.ts";

/** Deret diagnostik satu tautan sepanjang kejadian. Dipakai panel detail tautan. */
export interface LinkSeries {
  linkId: string;
  t: number[];
  rxPowerDbm: number[];
  baselineEstDb: number[]; // hasil taksiran, bukan kebenaran dasar
  totalAttenuationDb: number[];
  rainAttenuationDb: number[]; // setelah koreksi antena basah
  estRainMmH: number[];
  isWet: boolean[];
  trueRainMmH: number[]; // kebenaran dasar, hanya untuk evaluasi
}

/** Ringkasan mutu rekonstruksi sepanjang kejadian. */
export interface Diagnostics {
  /** Akurasi klasifikasi basah kering terhadap kebenaran dasar, pecahan 0 sampai 1. */
  wetDryAccuracy: number;
  /** RMSE rata rata seluruh langkah waktu, mm/jam. */
  meanRmse: number;
  /** RMSE terbesar sepanjang kejadian, mm/jam. */
  maxRmse: number;
  /** Bias rata rata, mm/jam. Negatif berarti rekonstruksi terlalu rendah. */
  meanBias: number;
  /** Pecahan sel grid yang tercakup operator interpolasi. */
  coverage: number;
  /** Jarak puncak rekonstruksi ke puncak sebenarnya pada saat hujan terkuat, km. */
  peakDistanceAtMaxKm: number;
  /** Jarak puncak terburuk selama hujan sedang atau lebih, km. */
  maxPeakDistanceKm: number;
}

/** Batas intensitas puncak yang dianggap hujan sungguhan saat menilai posisi puncak, mm/jam. */
const PEAK_EVALUATION_MIN_MM_H = 10;

export interface EventReconstruction {
  links: Link[];
  times: number[];
  snapshots: Snapshot[];
  series: Map<string, LinkSeries>;
  diagnostics: Diagnostics;
}

export interface ReconstructOptions {
  storm?: StormConfig;
  grid?: GridSpec;
  wetDry?: WetDryOptions & NeighbourOptions;
  idw?: IdwOptions;
  /** Deret cuplikan yang sudah ada. Kalau kosong, model maju dijalankan sendiri. */
  event?: EventSeries;
  /**
   * Operator rekonstruksi terlatih, opsional. Kalau diberikan, tiap Snapshot
   * juga mendapat `mlReconstruction`/`mlRmse` berdampingan dengan hasil IDW.
   * `reconstructEvent` sendiri tidak pernah memuatnya dari cakram — itu
   * melanggar aturan lib/ tidak boleh menyentuh fs. Pemanggil yang berjalan
   * di server memuatnya lewat `lib/ml/loadOperator.ts`.
   */
  operator?: LinearOperator;
  /**
   * LSTM basah/kering terlatih, opsional, dimuat pemanggil lewat
   * `lib/ml/loadOperator.ts`. Tanpa ini dipakai aturan ambang lama.
   */
  wetDryModel?: WetDryModel;
}

/**
 * Langkah 1 sampai 4 untuk seluruh tautan: dari cuplikan menjadi deret
 * intensitas hujan rata rata lintasan.
 */
export function invertSeries(
  event: EventSeries,
  options: ReconstructOptions = {},
): Map<string, LinkSeries> {
  const flags = classifyNetwork(event.links, event.samplesByLink, options.wetDry, options.wetDryModel);
  const out = new Map<string, LinkSeries>();

  for (const link of event.links) {
    const samples = event.samplesByLink.get(link.id) ?? [];
    const isWet = flags.get(link.id) ?? samples.map(() => false);

    const baselineEstDb = estimateBaseline(samples, isWet);
    const totalAttenuationDb = totalAttenuation(samples, baselineEstDb);
    const rainAttenuationDb = totalAttenuationDb.map((a, i) =>
      correctWaa(a, isWet[i]),
    );
    const estRainMmH = rainAttenuationDb.map((a) => retrieveRainRate(a, link));

    out.set(link.id, {
      linkId: link.id,
      t: samples.map((s) => s.t),
      rxPowerDbm: samples.map((s) => s.rxPowerDbm),
      baselineEstDb,
      totalAttenuationDb,
      rainAttenuationDb,
      estRainMmH,
      isWet,
      trueRainMmH: samples.map((s) => s.trueRainMmH),
    });
  }

  return out;
}

/** Akurasi klasifikasi basah kering terhadap kebenaran dasar. */
export function wetDryAccuracy(series: Map<string, LinkSeries>): number {
  let total = 0;
  let correct = 0;
  for (const s of series.values()) {
    for (let i = 0; i < s.isWet.length; i++) {
      total++;
      const truth = s.trueRainMmH[i] > WET_RAIN_MM_H;
      if (truth === s.isWet[i]) correct++;
    }
  }
  return total === 0 ? 0 : correct / total;
}

/** Satu Snapshot pada indeks waktu tertentu. */
function snapshotAt(
  index: number,
  event: EventSeries,
  series: Map<string, LinkSeries>,
  kernel: IdwKernel,
  truth: GridField,
  operator: LinearOperator | undefined,
): Snapshot {
  const links: LinkState[] = [];
  const rainByLink: number[] = new Array(event.links.length).fill(0);
  // Terpisah dari `rainByLink`, karena urutan tautan operator (dari saat
  // dilatih) belum tentu sama dengan urutan `event.links` sekarang, walau
  // pada praktiknya keduanya berasal dari data/links.json yang sama.
  const rainByOperatorLink: number[] | null = operator
    ? new Array(operator.nLinks).fill(0)
    : null;
  const operatorIndexOf = operator
    ? new Map(operator.linkIds.map((id, i) => [id, i]))
    : null;

  event.links.forEach((link, l) => {
    const s = series.get(link.id);
    if (!s) return;
    const rain = s.estRainMmH[index] ?? 0;
    rainByLink[l] = rain;
    if (rainByOperatorLink && operatorIndexOf) {
      const oi = operatorIndexOf.get(link.id);
      if (oi !== undefined) rainByOperatorLink[oi] = rain;
    }
    links.push({
      linkId: link.id,
      t: event.times[index],
      isWet: s.isWet[index] ?? false,
      attenuationDb: s.rainAttenuationDb[index] ?? 0,
      estRainMmH: rain,
    });
  });

  const reconstruction = reconstructField(kernel, rainByLink);

  const snap: Snapshot = {
    t: event.times[index],
    links,
    truth,
    reconstruction,
    rmse: computeRmse(truth, reconstruction),
  };

  if (operator && rainByOperatorLink) {
    const mlReconstruction = applyLinearOperator(operator, rainByOperatorLink);
    snap.mlReconstruction = mlReconstruction;
    snap.mlRmse = computeRmse(truth, mlReconstruction);
  }

  return snap;
}

/**
 * Jalankan model maju lalu model invers untuk seluruh kejadian.
 *
 * Untuk 52 tautan dan 241 langkah waktu, seluruhnya selesai jauh di bawah dua
 * detik karena operator interpolasi hanya dibangun sekali.
 */
export function reconstructEvent(
  links: Link[],
  options: ReconstructOptions = {},
): EventReconstruction {
  const storm = options.storm ?? DEMO_STORM;
  const grid = options.grid ?? EVENT_GRID;

  const event = options.event ?? simulateEvent(links, { storm });
  const series = invertSeries(event, options);
  const kernel = buildIdwKernel(links, grid, options.idw);

  const snapshots: Snapshot[] = [];
  let rmseSum = 0;
  let maxRmse = 0;
  let biasSum = 0;
  let maxPeakDistanceKm = 0;
  let peakDistanceAtMaxKm = 0;
  let strongestTruthPeak = 0;

  for (let i = 0; i < event.times.length; i++) {
    const truth = rainFieldAt(storm, event.times[i], grid);
    const snap = snapshotAt(i, event, series, kernel, truth, options.operator);
    snapshots.push(snap);
    rmseSum += snap.rmse;
    if (snap.rmse > maxRmse) maxRmse = snap.rmse;
    biasSum += computeBias(truth, snap.reconstruction);

    const truthPeak = fieldPeakCenter(truth);
    if (truthPeak.value <= PEAK_EVALUATION_MIN_MM_H) continue;

    const distanceKmToPeak = distanceKm(
      truthPeak.at,
      fieldPeakCenter(snap.reconstruction).at,
    );
    if (distanceKmToPeak > maxPeakDistanceKm) {
      maxPeakDistanceKm = distanceKmToPeak;
    }
    if (truthPeak.value > strongestTruthPeak) {
      strongestTruthPeak = truthPeak.value;
      peakDistanceAtMaxKm = distanceKmToPeak;
    }
  }

  const steps = Math.max(1, event.times.length);

  return {
    links,
    times: event.times,
    snapshots,
    series,
    diagnostics: {
      wetDryAccuracy: wetDryAccuracy(series),
      meanRmse: rmseSum / steps,
      maxRmse,
      meanBias: biasSum / steps,
      coverage: kernelCoverage(kernel),
      peakDistanceAtMaxKm,
      maxPeakDistanceKm,
    },
  };
}

export { classifyWetDry, classifyNetwork } from "./classify.ts";
export { estimateBaseline, totalAttenuation } from "./baseline.ts";
export { correctWaa, WAA_CORRECTION_DB } from "./waa.ts";
export { retrieveRainRate } from "./retrieve.ts";
export { buildIdwKernel, reconstructField, kernelCoverage } from "./field.ts";
export { computeRmse, computeBias } from "./rmse.ts";
