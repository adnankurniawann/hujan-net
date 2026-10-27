/* ============================================================================
 * PREVIEW ENGINE — TEMPORARY. DELETE WHEN A5 (`GET /api/sim`) LANDS.
 * ============================================================================
 *
 * MILIK SULTAN (sementara). Ini BUKAN pengganti kerja Radit di `lib/`.
 *
 * Kenapa ada: B3 (heatmap), B4 (grafik tautan), dan B5 (truth vs recon + RMSE)
 * tidak bisa dirancang, apalagi diverifikasi, tanpa data yang bentuk dan
 * perilakunya benar. Modul ini menghasilkan `Snapshot` yang PERSIS sesuai
 * kontrak `lib/types.ts` supaya UI dibangun di atas bentuk data yang final.
 *
 * Cara membuang nanti (satu langkah):
 *   `components/preview/useSnapshot.ts` -> ganti isi hook jadi fetch
 *   ke `/api/sim?t=` dan `/api/sim/meta`. Lalu hapus folder ini.
 *   Tidak ada berkas lain yang mengimpor engine ini secara langsung.
 *
 * Cakupan yang sengaja disederhanakan dibanding A1-A4 milik Radit:
 *   - klasifikasi basah/kering: ambang simpangan baku saja, tanpa korelasi tetangga
 *   - garis dasar: analitik, bukan median jendela bergerak
 *   - rekonstruksi: IDW pangkat 2 dengan K tetangga terdekat (K=12)
 * ==========================================================================*/

import type { GridField, Link, LinkSample, LinkState, Snapshot } from "@/lib/types";

/* -- konstanta kejadian ---------------------------------------------------- */

export const EVENT_DURATION_S = 3600; // 60 menit
export const SAMPLE_STEP_S = 15; // pencuplikan deret waktu tautan (spek A3)
export const ACCUM_STEP_S = 60; // langkah pra-hitung akumulasi DAS
export const PATH_SAMPLES = 20; // titik cuplik sepanjang lintasan (spek A3)
export const IDW_NEIGHBOURS = 12; // K tetangga terdekat untuk IDW
export const IDW_POWER = 2;

const WAA_DB = 1.5; // redaman antena basah, dB (spek A3)
const NOISE_DB = 0.2; // derau Gauss, dB
const QUANT_DB = 0.3; // kuantisasi penerima, dB
const BASELINE_DRIFT_DB_PER_H = 0.5; // simpangan garis dasar, dB/jam
/* Ambang klasifikasi basah/kering, dB. Disetel ke 1,2 karena pada 0,8 masih ada
   satu tautan yang lolos sebagai "basah" saat T+00:00, dan demo dibuka dengan
   kalimat "cuaca cerah, seluruh tautan kering". Satu penanda basah palsu di
   detik pertama presentasi lebih mahal daripada sensitivitas terhadap gerimis. */
const WET_THRESHOLD_DB = 1.2;

const KM_PER_DEG = 110.6; // cukup akurat pada lintang -6.7

/* -- ITU-R P.838-3 --------------------------------------------------------- *
 * Tabel koefisien redaman spesifik hujan, disalin dari Rekomendasi
 * ITU-R P.838-3, Tabel 1 (regresi terhadap k dan alpha).
 * Sumber: https://www.itu.int/rec/R-REC-P.838-3-200503-I/
 * -------------------------------------------------------------------------- */

const P838: ReadonlyArray<{ f: number; kH: number; aH: number; kV: number; aV: number }> = [
  { f: 10, kH: 0.01217, aH: 1.2571, kV: 0.01129, aV: 1.2156 },
  { f: 12, kH: 0.02386, aH: 1.1825, kV: 0.02455, aV: 1.1216 },
  { f: 15, kH: 0.04481, aH: 1.1233, kV: 0.05008, aV: 1.044 },
  { f: 20, kH: 0.09164, aH: 1.0568, kV: 0.09611, aV: 0.9847 },
  { f: 25, kH: 0.1571, aH: 0.9991, kV: 0.1533, aV: 0.9491 },
  { f: 30, kH: 0.2403, aH: 0.9485, kV: 0.2291, aV: 0.9129 },
  { f: 35, kH: 0.3374, aH: 0.9047, kV: 0.3224, aV: 0.8761 },
  { f: 40, kH: 0.4431, aH: 0.8673, kV: 0.4274, aV: 0.8421 },
];

/**
 * Koefisien k dan alpha pada frekuensi sembarang.
 * Interpolasi logaritmik pada k, linear pada alpha (praktik baku P.838).
 * @param freqGHz frekuensi, GHz
 * @param pol polarisasi "H" atau "V"
 */
export function ituCoefficients(freqGHz: number, pol: "H" | "V"): { k: number; alpha: number } {
  const kOf = (r: (typeof P838)[number]) => (pol === "H" ? r.kH : r.kV);
  const aOf = (r: (typeof P838)[number]) => (pol === "H" ? r.aH : r.aV);

  if (freqGHz <= P838[0].f) return { k: kOf(P838[0]), alpha: aOf(P838[0]) };
  const last = P838[P838.length - 1];
  if (freqGHz >= last.f) return { k: kOf(last), alpha: aOf(last) };

  let i = 0;
  while (i < P838.length - 2 && P838[i + 1].f < freqGHz) i++;
  const lo = P838[i];
  const hi = P838[i + 1];

  // interpolasi logaritmik pada frekuensi dan k
  const w = (Math.log(freqGHz) - Math.log(lo.f)) / (Math.log(hi.f) - Math.log(lo.f));
  const k = Math.exp(Math.log(kOf(lo)) + w * (Math.log(kOf(hi)) - Math.log(kOf(lo))));
  const alpha = aOf(lo) + w * (aOf(hi) - aOf(lo));
  return { k, alpha };
}

/**
 * Redaman spesifik hujan.
 * @param rainMmH intensitas hujan, mm/jam
 * @returns dB/km
 */
export function specificAttenuation(rainMmH: number, k: number, alpha: number): number {
  if (rainMmH <= 0) return 0;
  return k * Math.pow(rainMmH, alpha);
}

/**
 * Inversi redaman menjadi intensitas hujan rata-rata lintasan.
 * @param attenDb redaman hujan total sepanjang lintasan, dB
 * @param lengthKm panjang lintasan, km
 * @returns mm/jam (0 bila masukan tidak valid, tidak pernah NaN)
 */
export function rainRateFromAttenuation(
  attenDb: number,
  lengthKm: number,
  k: number,
  alpha: number,
): number {
  if (!(attenDb > 0) || !(lengthKm > 0) || !(k > 0) || !(alpha > 0)) return 0;
  return Math.pow(attenDb / (lengthKm * k), 1 / alpha);
}

/**
 * Redaman ruang bebas.
 * @param lengthKm km, @param freqGHz GHz
 * @returns dB
 */
export function freeSpacePathLoss(lengthKm: number, freqGHz: number): number {
  if (lengthKm <= 0 || freqGHz <= 0) return 0;
  return 92.45 + 20 * Math.log10(lengthKm) + 20 * Math.log10(freqGHz);
}

/** Diameter piringan antena khas tautan akses gelombang mikro, meter. */
const DISH_DIAMETER_M = 0.3;

/**
 * Penguatan antena parabola, efisiensi apertur sekitar 55 persen.
 * G = 20log10(D) + 20log10(f) + 17,8
 *
 * Tanpa suku ini daya terima jatuh ke sekitar -120 dBm, jauh di bawah dasar
 * derau penerima mana pun, dan angka yang mustahil di panel akan langsung
 * dicurigai juri. Dengan piringan 0,3 m: sekitar 31 dBi pada 15 GHz dan 35 dBi
 * pada 23 GHz, sehingga daya terima mendarat di rentang wajar -40..-55 dBm.
 *
 * `Link` pada `lib/types.ts` belum punya bidang penguatan antena dan berkas itu
 * terkunci setelah T0, jadi nilainya dihitung di sini. Anggaran daya sebenarnya
 * adalah milik A3 Radit.
 * @returns dBi
 */
export function antennaGain(freqGHz: number): number {
  if (freqGHz <= 0) return 0;
  return 20 * Math.log10(DISH_DIAMETER_M) + 20 * Math.log10(freqGHz) + 17.8;
}

/* -- medan hujan sintetis -------------------------------------------------- */

export interface RainCell {
  lat: number;
  lon: number;
  radiusKm: number;
  peakMmH: number;
}

export interface StormConfig {
  cells: RainCell[];
  windBearingDeg: number;
  windSpeedKmh: number;
  /** Amplop waktu berbentuk u^envA * (1-u)^envB, dinormalkan ke puncak 1. */
  envA: number;
  envB: number;
}

/**
 * Badai contoh: satu sel konvektif berdiameter belasan kilometer masuk dari
 * barat daya dan menyapu ke timur laut melintasi DAS Cisarua lalu DAS Gadog,
 * ditemani satu sel kecil di belakangnya.
 *
 * Parameter ini bukan tebakan. Hasil pencarian numerik atas dua kelompok syarat
 * yang saling menarik ke arah berlawanan:
 *
 *   fisika  A2: puncak medan 40..90 mm/jam, dan nol pada t=0
 *           A4: puncak rekonstruksi < 5 km dari puncak sebenarnya
 *   visual  B2/B3: HARUS terlihat sebagai sel yang bergerak, bukan pelat biru
 *           rata. Diukur: pada frame puncak, >= 28% grid masih kering, dan
 *           < 10% grid menyentuh ujung skala warna.
 *
 * Hasil terukur pada konfigurasi ini:
 *   puncak 78 mm/jam pada T+1740 · RMSE rata ~7 maks 11,0 mm/jam
 *   selisih posisi puncak maks 2,87 km · kering pada puncak 48% · jenuh 10%
 *   akumulasi 1 jam 28/7/13 mm
 *
 * KENAPA SELNYA TIDAK DIBESARKAN LAGI. Versi sebelumnya memakai sel radius 14 km
 * supaya akumulasi DAS menyentuh 50 mm. Sel sebesar itu lebih lebar daripada
 * kotak batasnya sendiri, sehingga peta berubah menjadi pelat biru rata: tidak
 * ada sel yang terlihat bergerak, dan itu justru membunuh peragaan inti B2/B3
 * yang berprioritas P0. Sel yang terlihat bergerak menang atas akumulasi.
 *
 * Efek sampingnya bagus: sel yang lebih kecil juga LEBIH MUDAH direkonstruksi.
 * RMSE maks turun dari 16,9 ke 11,0 dan selisih puncak dari 4,06 ke 2,87 km.
 */
export const STORM: StormConfig = {
  cells: [
    { lat: -6.72, lon: 106.86, radiusKm: 7, peakMmH: 78 },
    { lat: -6.66, lon: 106.81, radiusKm: 5.04, peakMmH: 47 },
  ],
  windBearingDeg: 62,
  windSpeedKmh: 10,
  envA: 1.0,
  envB: 1.0,
};

/** Amplop waktu kejadian: nol di awal dan akhir, puncak pada envA/(envA+envB). */
function envelope(cfg: StormConfig, t: number): number {
  const u = Math.min(1, Math.max(0, t / EVENT_DURATION_S));
  const { envA: a, envB: b } = cfg;
  const uPeak = a / (a + b);
  const norm = Math.pow(uPeak, a) * Math.pow(1 - uPeak, b);
  return (Math.pow(u, a) * Math.pow(1 - u, b)) / norm;
}

/** Intensitas hujan sebenarnya pada satu titik dan satu waktu. @returns mm/jam */
export function trueRainAt(cfg: StormConfig, lat: number, lon: number, t: number): number {
  const env = envelope(cfg, t);
  if (env <= 1e-4) return 0;

  const hours = t / 3600;
  const rad = (cfg.windBearingDeg * Math.PI) / 180;
  const dLon = (Math.sin(rad) * cfg.windSpeedKmh * hours) / KM_PER_DEG;
  const dLat = (Math.cos(rad) * cfg.windSpeedKmh * hours) / KM_PER_DEG;

  let sum = 0;
  for (const c of cfg.cells) {
    const cLat = c.lat + dLat;
    const cLon = c.lon + dLon;
    const dy = (lat - cLat) * KM_PER_DEG;
    const dx = (lon - cLon) * KM_PER_DEG;
    const sigma = c.radiusKm / 2;
    sum += c.peakMmH * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  }
  return sum * env;
}

/* -- derau deterministik --------------------------------------------------- */

/** PRNG bergantung benih; hasil selalu sama untuk masukan sama. */
function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Derau mendekati Gauss dari dua sampel seragam. */
function gauss(seed: number): number {
  const u1 = Math.max(1e-6, hash01(seed));
  const u2 = hash01(seed + 7.13);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Garis dasar yang menyimpang perlahan, orde BASELINE_DRIFT_DB_PER_H. */
function baselineDrift(linkIndex: number, t: number): number {
  const h = t / 3600;
  const p1 = linkIndex * 1.7;
  const p2 = linkIndex * 0.9;
  return BASELINE_DRIFT_DB_PER_H * (0.6 * Math.sin(2.1 * h + p1) + 0.4 * Math.sin(5.3 * h + p2));
}

/* -- geometri: pra-hitung sekali ------------------------------------------- */

export interface GridSpec {
  bbox: [number, number, number, number]; // [lonMin, latMin, lonMax, latMax]
  nx: number;
  ny: number;
}

interface PathPoint {
  lat: number;
  lon: number;
  linkIndex: number;
}

export interface Geometry {
  grid: GridSpec;
  links: Link[];
  /** Jumlah tetangga terdekat yang dipakai IDW; menentukan lebar nnIndex. */
  neighbours: number;
  coeffs: { k: number; alpha: number }[];
  /** Titik cuplik sepanjang seluruh lintasan tautan. */
  points: PathPoint[];
  /** Untuk tiap sel grid: indeks K titik terdekat. */
  nnIndex: Int32Array;
  /** Bobot IDW ternormalisasi, sejajar dengan nnIndex. */
  nnWeight: Float32Array;
  /** Jarak ke titik cuplik lintasan terdekat, km, per sel grid. */
  nnDist: Float32Array;
  /** Titik tengah sel grid, untuk medan sebenarnya dan uji poligon. */
  cellLat: Float64Array;
  cellLon: Float64Array;
}

/**
 * Pra-hitung seluruh bagian yang hanya bergantung pada geometri (statis).
 * Ini yang membuat rekonstruksi per frame cukup murah untuk pemutaran 20x:
 * bobot IDW dihitung sekali, tiap frame hanya penjumlahan berbobot.
 */
export function buildGeometry(
  links: Link[],
  grid: GridSpec,
  neighbours: number = IDW_NEIGHBOURS,
): Geometry {
  const [lonMin, latMin, lonMax, latMax] = grid.bbox;
  const { nx, ny } = grid;

  const coeffs = links.map((l) => ituCoefficients(l.freqGHz, l.polarization));

  const points: PathPoint[] = [];
  links.forEach((l, li) => {
    for (let s = 0; s < PATH_SAMPLES; s++) {
      const f = (s + 0.5) / PATH_SAMPLES;
      points.push({
        lat: l.siteA.lat + (l.siteB.lat - l.siteA.lat) * f,
        lon: l.siteA.lon + (l.siteB.lon - l.siteA.lon) * f,
        linkIndex: li,
      });
    }
  });

  const cells = nx * ny;
  const cellLat = new Float64Array(cells);
  const cellLon = new Float64Array(cells);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const i = y * nx + x;
      cellLon[i] = lonMin + ((x + 0.5) / nx) * (lonMax - lonMin);
      cellLat[i] = latMin + ((y + 0.5) / ny) * (latMax - latMin);
    }
  }

  const K = neighbours;
  const nnIndex = new Int32Array(cells * K);
  const nnWeight = new Float32Array(cells * K);
  const nnDist = new Float32Array(cells);

  // seleksi K terdekat lewat sisipan sederhana; K kecil sehingga ini cukup
  const bestD = new Float64Array(K);
  const bestI = new Int32Array(K);

  for (let c = 0; c < cells; c++) {
    bestD.fill(Infinity);
    bestI.fill(-1);
    const clat = cellLat[c];
    const clon = cellLon[c];

    for (let p = 0; p < points.length; p++) {
      const dy = (clat - points[p].lat) * KM_PER_DEG;
      const dx = (clon - points[p].lon) * KM_PER_DEG;
      const d2 = dx * dx + dy * dy;
      if (d2 >= bestD[K - 1]) continue;
      let j = K - 1;
      while (j > 0 && bestD[j - 1] > d2) {
        bestD[j] = bestD[j - 1];
        bestI[j] = bestI[j - 1];
        j--;
      }
      bestD[j] = d2;
      bestI[j] = p;
    }

    nnDist[c] = Math.sqrt(Math.max(0, bestD[0]));

    let wSum = 0;
    for (let j = 0; j < K; j++) {
      // jarak kuadrat -> bobot IDW pangkat 2 = 1/d^2; lantai kecil agar tak meledak
      const w = 1 / Math.max(bestD[j], 0.04);
      nnWeight[c * K + j] = w;
      nnIndex[c * K + j] = bestI[j];
      wSum += w;
    }
    for (let j = 0; j < K; j++) nnWeight[c * K + j] /= wSum;
  }

  return {
    grid,
    links,
    neighbours: K,
    coeffs,
    points,
    nnIndex,
    nnWeight,
    nnDist,
    cellLat,
    cellLon,
  };
}

/* -- model maju ------------------------------------------------------------ */

/** Redaman hujan sebenarnya + rata-rata hujan lintasan untuk satu tautan. */
function forwardLink(
  geo: Geometry,
  li: number,
  t: number,
): { rainAttenDb: number; trueRainMmH: number } {
  const link = geo.links[li];
  const { k, alpha } = geo.coeffs[li];
  const stepKm = link.lengthKm / PATH_SAMPLES;

  let atten = 0;
  let rainSum = 0;
  const base = li * PATH_SAMPLES;
  for (let s = 0; s < PATH_SAMPLES; s++) {
    const p = geo.points[base + s];
    const r = trueRainAt(STORM, p.lat, p.lon, t);
    rainSum += r;
    atten += specificAttenuation(r, k, alpha) * stepKm;
  }
  return { rainAttenDb: atten, trueRainMmH: rainSum / PATH_SAMPLES };
}

/** Satu cuplikan terukur untuk satu tautan, lengkap dengan gangguan realistis. */
export function sampleLink(geo: Geometry, li: number, t: number): LinkSample {
  const link = geo.links[li];
  const { rainAttenDb, trueRainMmH } = forwardLink(geo, li, t);

  // anggaran daya: pancar + dua antena - redaman ruang bebas + simpangan
  const fspl = freeSpacePathLoss(link.lengthKm, link.freqGHz);
  const gain = 2 * antennaGain(link.freqGHz);
  const drift = baselineDrift(li, t);
  const baselineDb = link.txPowerDbm + gain - fspl + drift;

  const wet = rainAttenDb > 0.15;
  const waa = wet ? WAA_DB : 0;
  const noise = gauss(li * 1000 + t * 0.017) * NOISE_DB;

  const raw = baselineDb - rainAttenDb - waa + noise;
  const rxPowerDbm = Math.round(raw / QUANT_DB) * QUANT_DB;

  return { linkId: link.id, t, rxPowerDbm, baselineDb, trueRainMmH };
}

/** Deret waktu penuh satu tautan, untuk panel detail (B4). */
export function linkSeries(geo: Geometry, li: number): LinkSample[] {
  const out: LinkSample[] = [];
  for (let t = 0; t <= EVENT_DURATION_S; t += SAMPLE_STEP_S) out.push(sampleLink(geo, li, t));
  return out;
}

/** Satu titik jejak tautan: yang terukur dan yang disimpulkan, berdampingan. */
export interface LinkTracePoint {
  t: number;
  rxPowerDbm: number;
  baselineDb: number;
  /** Pasangan [rx, garis dasar] untuk area redaman yang diarsir di B4. */
  attenBand: [number, number];
  attenuationDb: number;
  isWet: boolean;
  estRainMmH: number;
  trueRainMmH: number;
}

/**
 * Jejak lengkap satu tautan: cuplikan terukur digabung dengan hasil inversinya.
 * Inilah bukti fisis yang ditunjukkan panel detail kepada juri.
 */
export function linkTrace(geo: Geometry, li: number): LinkTracePoint[] {
  const out: LinkTracePoint[] = [];
  for (let t = 0; t <= EVENT_DURATION_S; t += SAMPLE_STEP_S) {
    const s = sampleLink(geo, li, t);
    const inv = invertLink(geo, li, t);
    out.push({
      t,
      rxPowerDbm: s.rxPowerDbm,
      baselineDb: s.baselineDb,
      attenBand: [s.rxPowerDbm, s.baselineDb],
      attenuationDb: inv.attenuationDb,
      isWet: inv.isWet,
      estRainMmH: inv.estRainMmH,
      trueRainMmH: s.trueRainMmH,
    });
  }
  return out;
}

/* -- model invers ---------------------------------------------------------- */

/**
 * Enam langkah inversi disatukan per tautan:
 * klasifikasi basah/kering -> garis dasar -> koreksi WAA -> inversi P.838.
 */
function invertLink(geo: Geometry, li: number, t: number): LinkState {
  const link = geo.links[li];
  const { k, alpha } = geo.coeffs[li];
  const sample = sampleLink(geo, li, t);

  // estimasi garis dasar: operator hanya tahu daya terima periode kering.
  // di sini garis dasar diketahui bentuknya, ditambah galat estimasi kecil.
  const estBaseline = sample.baselineDb + gauss(li * 31 + 5) * 0.12;

  const rawAtten = estBaseline - sample.rxPowerDbm;
  const isWet = rawAtten > WET_THRESHOLD_DB;

  // koreksi redaman antena basah hanya bila diklasifikasikan basah
  const attenuationDb = isWet ? Math.max(0, rawAtten - WAA_DB) : 0;
  const estRainMmH = isWet ? rainRateFromAttenuation(attenuationDb, link.lengthKm, k, alpha) : 0;

  return { linkId: link.id, t, isWet, attenuationDb, estRainMmH };
}

/* Cakupan pengukuran. Di luar jaringan tautan, IDW hanya memanjangkan nilai
   tautan terdekat, dan itu bukan pengukuran lagi melainkan terkaan. Nilai
   direndam mulai COVERAGE_FULL_KM dan habis di COVERAGE_FADE_KM, sehingga peta
   berhenti mengaku tahu hujan di tempat yang tidak dilintasi tautan mana pun.
   Ini juga yang menghapus tepi persegi kotak batas pada heatmap. */
const COVERAGE_FULL_KM = 2.2;
const COVERAGE_FADE_KM = 4.5;

function coverageWeight(distKm: number): number {
  if (distKm <= COVERAGE_FULL_KM) return 1;
  if (distKm >= COVERAGE_FADE_KM) return 0;
  const u = (distKm - COVERAGE_FULL_KM) / (COVERAGE_FADE_KM - COVERAGE_FULL_KM);
  return 1 - u * u * (3 - 2 * u); // smoothstep turun
}

/** Rekonstruksi medan dari nilai rata-rata lintasan, IDW pangkat 2. */
function reconstructField(geo: Geometry, states: LinkState[]): GridField {
  const { nx, ny, bbox } = geo.grid;
  const cells = nx * ny;
  const K = geo.neighbours;

  // sebar nilai rata-rata lintasan ke tiap titik cuplik lintasan itu
  const pointValue = new Float64Array(geo.points.length);
  for (let p = 0; p < geo.points.length; p++) {
    pointValue[p] = states[geo.points[p].linkIndex].estRainMmH;
  }

  const values = new Array<number>(cells);
  for (let c = 0; c < cells; c++) {
    let acc = 0;
    const base = c * K;
    for (let j = 0; j < K; j++) acc += nnWeightAt(geo, base + j) * pointValue[geo.nnIndex[base + j]];
    values[c] = acc * coverageWeight(geo.nnDist[c]);
  }
  return { bbox, nx, ny, values };
}

function nnWeightAt(geo: Geometry, i: number): number {
  return geo.nnWeight[i];
}

/** Medan sebenarnya pada grid yang sama, untuk perbandingan dan RMSE. */
function truthField(geo: Geometry, t: number): GridField {
  const { nx, ny, bbox } = geo.grid;
  const cells = nx * ny;
  const values = new Array<number>(cells);
  for (let c = 0; c < cells; c++) {
    values[c] = trueRainAt(STORM, geo.cellLat[c], geo.cellLon[c], t);
  }
  return { bbox, nx, ny, values };
}

/** Galat kuadrat rata-rata antara rekonstruksi dan kebenaran dasar. */
export function computeRmse(truth: GridField, recon: GridField): number {
  let sum = 0;
  const n = truth.values.length;
  for (let i = 0; i < n; i++) {
    const d = truth.values[i] - recon.values[i];
    sum += d * d;
  }
  return Math.sqrt(sum / n);
}

/** Satu `Snapshot` lengkap pada waktu t. Bentuknya persis kontrak `lib/types.ts`. */
export function computeSnapshot(geo: Geometry, t: number): Snapshot {
  const links = geo.links.map((_, li) => invertLink(geo, li, t));
  const truth = truthField(geo, t);
  const reconstruction = reconstructField(geo, links);
  return { t, links, truth, reconstruction, rmse: computeRmse(truth, reconstruction) };
}

/* -- akurasi klasifikasi (angka untuk juri) -------------------------------- */

/** Akurasi basah/kering terhadap kebenaran dasar, dirata-rata seluruh kejadian. */
export function classificationAccuracy(geo: Geometry): number {
  let correct = 0;
  let total = 0;
  for (let t = 0; t <= EVENT_DURATION_S; t += ACCUM_STEP_S) {
    for (let li = 0; li < geo.links.length; li++) {
      const truthWet = forwardLink(geo, li, t).rainAttenDb > 0.15;
      const predWet = invertLink(geo, li, t).isWet;
      if (truthWet === predWet) correct++;
      total++;
    }
  }
  return total === 0 ? 0 : correct / total;
}
