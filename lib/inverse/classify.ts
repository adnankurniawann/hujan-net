// Langkah 1 dari model invers: memutuskan kapan satu lintasan basah.
//
// Ini bagian yang paling sering diremehkan. Tanpa klasifikasi basah kering yang
// benar, setiap penyimpangan garis dasar akan dibaca sebagai hujan dan peta
// rekonstruksi akan penuh hujan hantu.
//
// Dipakai dua penanda yang saling melengkapi, dalam dua lintasan:
//
//   Lintasan 1. Ragam jangka pendek. Hujan membuat daya terima bergolak, jauh
//   di atas derau penerima. Ini gagasan Schleiss dan Berne, 2010. Jendelanya
//   sengaja hanya menoleh ke belakang, tidak ke depan, supaya penanda tidak
//   pernah menyala sebelum hujan datang. Sistem sungguhan juga tidak bisa
//   melihat masa depan.
//
//   Lintasan 2. Selisih tingkat terhadap acuan kering. Acuan keringnya diambil
//   dari median cuplikan yang lintasan pertama sebut kering, bukan dari kuantil
//   tetap. Ini penting untuk tautan yang basah hampir sepanjang kejadian, yang
//   kuantil atasnya sudah berada di dalam periode hujan.
//
// Terakhir ditambah pemeriksaan ketetanggaan: hujan bersifat menerus secara
// ruang, sedangkan lonjakan derau tidak. Penanda basah yang berdiri sendiri
// sementara seluruh tetangganya kering hampir selalu palsu.

import type { Link, LinkSample } from "../types";
import { distanceKm } from "../sim/geo.ts";
import { median, quantile, stdDev } from "./stats.ts";

export interface WetDryOptions {
  /** Lebar jendela ragam jangka pendek, jumlah cuplikan, menoleh ke belakang. */
  windowSamples?: number;
  /** Ambang simpangan baku jendela, dB. */
  stdThresholdDb?: number;
  /** Ambang selisih tingkat terhadap acuan kering, dB. */
  levelThresholdDb?: number;
  /** Selisih tingkat minimum yang harus menyertai penanda ragam, dB. */
  minDipWithVarianceDb?: number;
  /** Ambang selisih tingkat yang lebih longgar, dipakai saat tetangga sudah basah, dB. */
  softLevelThresholdDb?: number;
  /** Kuantil atas yang dipakai menemukan selubung kering. */
  upperQuantile?: number;
  /** Lebar jendela pencalonan di bawah selubung kering, dB. */
  candidateMarginDb?: number;
  /** Jumlah minimum calon cuplikan kering supaya mediannya dipakai. */
  minDrySamples?: number;
}

export interface NeighbourOptions {
  /** Jarak maksimum antar titik tengah lintasan supaya disebut tetangga, km. */
  radiusKm?: number;
  /** Pecahan tetangga basah yang diperlukan untuk mengangkat status menjadi basah. */
  promoteFraction?: number;
}

const DEFAULTS: Required<WetDryOptions> = {
  windowSamples: 21, // 21 cuplikan 15 detik, kira kira 5 menit ke belakang
  stdThresholdDb: 0.6, // tiga kali simpangan baku derau penerima
  levelThresholdDb: 0.9, // di bawah redaman antena basah 1,5 dB, di atas derau
  minDipWithVarianceDb: 0.3, // satu langkah kuantisasi perangkat
  softLevelThresholdDb: 0.45,
  upperQuantile: 0.98,
  candidateMarginDb: 0.9,
  minDrySamples: 5,
};

const NEIGHBOUR_DEFAULTS: Required<NeighbourOptions> = {
  radiusKm: 6,
  promoteFraction: 0.5,
};

/** Titik tengah satu lintasan. */
function midpoint(link: Link) {
  return {
    lat: (link.siteA.lat + link.siteB.lat) / 2,
    lon: (link.siteA.lon + link.siteB.lon) / 2,
  };
}

/**
 * Acuan tingkat kering satu tautan, dBm.
 *
 * Hujan hanya bisa menurunkan daya terima, jadi keadaan kering selalu berada di
 * bagian atas sebaran. Karena itu acuan dicari dua langkah:
 *
 *   1. ambil kuantil atas sebagai selubung kering, tahan terhadap tautan yang
 *      basah hampir sepanjang kejadian
 *   2. ambil median seluruh cuplikan yang berada dalam satu jendela sempit di
 *      bawah selubung itu, supaya derau penerima tidak ikut mengangkat acuan
 *
 * Langkah kedua penting. Kuantil atas saja akan condong ke atas sebesar dua kali
 * simpangan baku derau, dan kelebihan itu langsung menjadi hujan hantu.
 */
export function dryReferenceLevel(
  levels: readonly number[],
  options: WetDryOptions = {},
): number {
  const opt = { ...DEFAULTS, ...options };
  if (levels.length === 0) return 0;

  const envelope = quantile(levels, opt.upperQuantile);
  const candidates = levels.filter((v) => v >= envelope - opt.candidateMarginDb);
  return candidates.length >= opt.minDrySamples ? median(candidates) : envelope;
}

/**
 * Klasifikasi basah kering untuk satu tautan, tanpa melihat tetangga.
 *
 * @param samples deret cuplikan satu tautan, urut menurut waktu
 * @returns larik boolean sepanjang `samples`, true berarti basah
 */
export function classifyWetDry(
  samples: readonly LinkSample[],
  options: WetDryOptions = {},
): boolean[] {
  const opt = { ...DEFAULTS, ...options };
  const n = samples.length;
  if (n === 0) return [];

  const levels = samples.map((s) => s.rxPowerDbm);
  const width = Math.max(2, Math.floor(opt.windowSamples));
  const dryLevel = dryReferenceLevel(levels, options);

  return levels.map((level, i) => {
    const dip = dryLevel - level;

    // Penanda 1: ragam jangka pendek pada jendela yang menoleh ke belakang.
    // Karena jendelanya menoleh ke belakang, ragam masih tinggi beberapa menit
    // setelah hujan berhenti. Karena itu penanda ini baru berlaku kalau tingkat
    // daya terima memang masih tertekan, walau hanya satu langkah kuantisasi.
    const from = Math.max(0, i - width + 1);
    const varying =
      stdDev(levels.slice(from, i + 1)) > opt.stdThresholdDb &&
      dip > opt.minDipWithVarianceDb;

    // Penanda 2: tingkat yang jatuh jauh di bawah acuan kering.
    return varying || dip > opt.levelThresholdDb;
  });
}

/**
 * Pemeriksaan korelasi ruang antar tautan tetangga.
 *
 * Penanda basah yang tidak didukung tetangga mana pun diturunkan menjadi
 * kering. Sebaliknya, tautan yang tingkatnya turun sedikit tetapi mayoritas
 * tetangganya sudah basah diangkat menjadi basah, karena hujan yang menerus
 * secara ruang lebih mungkin daripada beberapa penurunan kebetulan yang
 * bersamaan.
 *
 * @param links seluruh tautan
 * @param flagsByLink hasil {@link classifyWetDry} per tautan
 * @param samplesByLink cuplikan per tautan, dipakai untuk uji tingkat longgar
 */
export function applyNeighbourConsistency(
  links: readonly Link[],
  flagsByLink: Map<string, boolean[]>,
  samplesByLink: Map<string, LinkSample[]>,
  options: WetDryOptions & NeighbourOptions = {},
): Map<string, boolean[]> {
  const opt = { ...DEFAULTS, ...NEIGHBOUR_DEFAULTS, ...options };

  const centers = new Map(links.map((l) => [l.id, midpoint(l)]));
  const neighbours = new Map<string, string[]>();
  for (const a of links) {
    const list: string[] = [];
    for (const b of links) {
      if (a.id === b.id) continue;
      if (distanceKm(centers.get(a.id)!, centers.get(b.id)!) <= opt.radiusKm) {
        list.push(b.id);
      }
    }
    neighbours.set(a.id, list);
  }

  // Acuan kering per tautan, dipakai untuk uji tingkat yang longgar.
  const dryLevels = new Map<string, number>();
  for (const link of links) {
    const samples = samplesByLink.get(link.id) ?? [];
    dryLevels.set(
      link.id,
      dryReferenceLevel(
        samples.map((s) => s.rxPowerDbm),
        options,
      ),
    );
  }

  const out = new Map<string, boolean[]>();
  for (const link of links) {
    const own = flagsByLink.get(link.id) ?? [];
    const samples = samplesByLink.get(link.id) ?? [];
    const list = neighbours.get(link.id) ?? [];
    const dryLevel = dryLevels.get(link.id) ?? 0;

    out.set(
      link.id,
      own.map((wet, i) => {
        if (list.length === 0) return wet;

        let wetNeighbours = 0;
        for (const id of list) {
          if (flagsByLink.get(id)?.[i]) wetNeighbours++;
        }

        // Turunkan penanda yang berdiri sendiri.
        if (wet) return wetNeighbours > 0;

        // Angkat kalau mayoritas tetangga basah dan tingkatnya sendiri sudah
        // turun melewati ambang longgar.
        const dip = dryLevel - (samples[i]?.rxPowerDbm ?? dryLevel);
        return (
          wetNeighbours / list.length >= opt.promoteFraction &&
          dip > opt.softLevelThresholdDb
        );
      }),
    );
  }

  return out;
}

/**
 * Klasifikasi lengkap untuk seluruh jaringan: per tautan lalu pemeriksaan
 * ketetanggaan. Ini yang dipakai jalur utama model invers.
 */
export function classifyNetwork(
  links: readonly Link[],
  samplesByLink: Map<string, LinkSample[]>,
  options: WetDryOptions & NeighbourOptions = {},
): Map<string, boolean[]> {
  const perLink = new Map<string, boolean[]>();
  for (const link of links) {
    perLink.set(
      link.id,
      classifyWetDry(samplesByLink.get(link.id) ?? [], options),
    );
  }
  return applyNeighbourConsistency(links, perLink, samplesByLink, options);
}
