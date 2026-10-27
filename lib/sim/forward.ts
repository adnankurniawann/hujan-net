// Model maju: dari medan hujan ke daya terima tiap tautan.
//
// Ini bagian yang membuat data simulasi kita bukan sekadar angka acak. Urutannya
// persis urutan fisis yang terjadi di lapangan:
//
//   1. hujan sepanjang lintasan  ->  redaman spesifik ITU-R P.838 di tiap titik
//   2. integrasi sepanjang lintasan  ->  redaman hujan total, dB
//   3. tambahkan redaman antena basah, yang selalu dilupakan orang
//   4. kurangkan dari garis dasar yang menyimpang perlahan
//   5. tambahkan derau penerima, lalu kuantisasi seperti perangkat sungguhan
//
// Model invers pada lib/inverse/ hanya boleh melihat hasil langkah 5. Nilai
// kebenaran dasar dibawa terpisah di `baselineDb` dan `trueRainMmH`, dan hanya
// dipakai untuk mengukur galat.

import type { Link, LinkSample } from "../types";
import {
  freeSpacePathLoss,
  ituCoefficients,
  specificAttenuation,
} from "../physics/itu838.ts";
import { pathSamplePoints } from "./geo.ts";
import { rainRateAt, type StormConfig } from "./rainField.ts";
import { gaussian, hashString, seedOf } from "./random.ts";
import {
  DEMO_STORM,
  EVENT_DURATION_S,
  SAMPLE_INTERVAL_S,
  sampleTimes,
} from "./scenario.ts";

/** Jumlah titik cuplikan sepanjang satu lintasan. */
export const PATH_SAMPLES = 20;

/** Redaman antena basah saat lintasan basah, dB. Konstan, sesuai kesepakatan tim. */
export const WET_ANTENNA_DB = 1.5;

/** Simpangan baku derau penerima, dB. */
export const NOISE_STD_DB = 0.2;

/** Langkah kuantisasi perangkat, dB. */
export const QUANT_STEP_DB = 0.3;

/** Laju penyimpangan garis dasar, dB per jam. */
export const BASELINE_DRIFT_DB_PER_HOUR = 0.5;

/** Batas intensitas hujan yang dianggap membasahi antena, mm/jam. */
export const WET_RAIN_MM_H = 0.2;

/** Rugi tetap perangkat di luar ruang bebas: konektor, pemandu gelombang, kubah antena. Diserap ke garis dasar. */
const FIXED_LOSS_DB = 3;

/** Perolehan antena gabungan kedua sisi, dB. Angka khas antena parabola 0,3 m pada pita 18 GHz. */
const ANTENNA_GAIN_DB = 68;

const SECONDS_PER_HOUR = 3600;

export interface ForwardOptions {
  storm?: StormConfig;
  durationS?: number;
  intervalS?: number;
  pathSamples?: number;
}

/** Deret waktu satu kejadian untuk seluruh tautan. */
export interface EventSeries {
  links: Link[];
  times: number[]; // detik, panjang sama dengan tiap deret cuplikan
  samplesByLink: Map<string, LinkSample[]>;
}

/**
 * Garis dasar tautan pada waktu t, dBm.
 *
 * Garis dasar sungguhan tidak pernah datar: suhu perangkat, kelembapan, dan
 * pemuaian menara membuatnya melayang perlahan. Di sini penyimpangan dibuat
 * dari dua sinusoida berperiode panjang dengan fase yang diambil dari id
 * tautan, jadi setiap tautan melayang berbeda tetapi tetap dapat diulang.
 *
 * @param link tautan
 * @param t detik sejak awal kejadian
 * @returns tinggi garis dasar, dBm
 */
export function baselineAt(link: Link, t: number): number {
  const dryLevel =
    link.txPowerDbm +
    ANTENNA_GAIN_DB -
    freeSpacePathLoss(link.lengthKm, link.freqGHz) -
    FIXED_LOSS_DB;

  const rnd = hashString(link.id);
  const phaseA = ((rnd % 1000) / 1000) * 2 * Math.PI;
  const phaseB = (((rnd >>> 10) % 1000) / 1000) * 2 * Math.PI;
  const hours = t / SECONDS_PER_HOUR;

  // Amplitudo dipilih supaya laju perubahan puncaknya tepat sebesar
  // BASELINE_DRIFT_DB_PER_HOUR. Turunan sin(2*pi*h) adalah 2*pi per jam,
  // jadi amplitudo dibagi 2*pi.
  const amp = BASELINE_DRIFT_DB_PER_HOUR / (2 * Math.PI);
  const drift =
    amp * 0.7 * Math.sin(2 * Math.PI * hours + phaseA) +
    amp * 0.3 * Math.sin(2 * Math.PI * hours * 2.7 + phaseB);

  return dryLevel + drift;
}

/**
 * Redaman hujan satu tautan pada waktu t, hasil integrasi sepanjang lintasan.
 *
 * @returns `attenuationDb` redaman hujan total dB, dan `meanRainMmH` intensitas
 *          rata rata lintasan mm/jam sebagai kebenaran dasar
 */
export function rainAttenuationOf(
  link: Link,
  storm: StormConfig,
  t: number,
  pathSamples = PATH_SAMPLES,
): { attenuationDb: number; meanRainMmH: number } {
  const { k, alpha } = ituCoefficients(link.freqGHz, link.polarization);
  const points = pathSamplePoints(link.siteA, link.siteB, pathSamples);
  const segmentKm = link.lengthKm / points.length;

  let attenuationDb = 0;
  let rainSum = 0;
  for (const p of points) {
    const rain = rainRateAt(storm, t, p);
    rainSum += rain;
    attenuationDb += specificAttenuation(rain, k, alpha) * segmentKm;
  }

  return { attenuationDb, meanRainMmH: rainSum / points.length };
}

/** Kuantisasi ke kelipatan langkah perangkat, dB. */
export function quantize(valueDb: number, stepDb = QUANT_STEP_DB): number {
  if (stepDb <= 0) return valueDb;
  return Math.round(valueDb / stepDb) * stepDb;
}

/**
 * Cuplikan satu tautan pada satu waktu, sudah berisi seluruh gangguan.
 *
 * @param link tautan
 * @param storm konfigurasi badai
 * @param t detik sejak awal kejadian
 */
export function sampleLinkAt(
  link: Link,
  storm: StormConfig,
  t: number,
  pathSamples = PATH_SAMPLES,
): LinkSample {
  const { attenuationDb, meanRainMmH } = rainAttenuationOf(
    link,
    storm,
    t,
    pathSamples,
  );
  const baselineDb = baselineAt(link, t);
  const wetAntennaDb = meanRainMmH > WET_RAIN_MM_H ? WET_ANTENNA_DB : 0;
  const noiseDb = gaussian(seedOf(link.id, t)) * NOISE_STD_DB;

  const rxPowerDbm = quantize(
    baselineDb - attenuationDb - wetAntennaDb + noiseDb,
  );

  return {
    linkId: link.id,
    t,
    rxPowerDbm,
    baselineDb,
    trueRainMmH: meanRainMmH,
  };
}

/**
 * Jalankan model maju untuk seluruh tautan sepanjang kejadian.
 *
 * Fungsi murni dan deterministik. Untuk 52 tautan dengan cuplikan tiap 15 detik
 * selama satu jam, hasilnya 241 titik waktu per tautan.
 */
export function simulateEvent(
  links: Link[],
  options: ForwardOptions = {},
): EventSeries {
  const storm = options.storm ?? DEMO_STORM;
  const durationS = options.durationS ?? EVENT_DURATION_S;
  const intervalS = options.intervalS ?? SAMPLE_INTERVAL_S;
  const pathSamples = options.pathSamples ?? PATH_SAMPLES;

  const times =
    durationS === EVENT_DURATION_S && intervalS === SAMPLE_INTERVAL_S
      ? sampleTimes()
      : Array.from(
          { length: Math.floor(durationS / intervalS) + 1 },
          (_, i) => i * intervalS,
        );

  const samplesByLink = new Map<string, LinkSample[]>();
  for (const link of links) {
    samplesByLink.set(
      link.id,
      times.map((t) => sampleLinkAt(link, storm, t, pathSamples)),
    );
  }

  return { links, times, samplesByLink };
}

/** Seluruh cuplikan sebagai satu larik datar, urut menurut tautan lalu waktu. */
export function allSamples(series: EventSeries): LinkSample[] {
  const out: LinkSample[] = [];
  for (const link of series.links) {
    const samples = series.samplesByLink.get(link.id);
    if (samples) out.push(...samples);
  }
  return out;
}
