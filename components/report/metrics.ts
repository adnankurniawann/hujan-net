/**
 * Metrik laporan rekonstruksi.
 *
 * Setiap angka di halaman laporan berasal dari berkas ini, dan setiap angka di
 * berkas ini dihitung dari `Snapshot` — medan sebenarnya, medan rekonstruksi,
 * dan keadaan tautan. Tidak ada nilai contoh, tidak ada nilai yang ditanam.
 * Kalau sebuah angka tidak bisa dihitung dari snapshot, angka itu tidak tampil.
 *
 * Fungsi murni, tanpa impor dari React/Next, mengikuti aturan yang sama dengan
 * `lib/physics` dan `lib/sim` (bagian 5 PRD).
 */

import type { GridField, LinkState, Snapshot } from "@/lib/types";

/** Di bawah nilai ini satu sel grid dianggap kering, bukan hujan lemah. */
const WET_CELL_MMH = 0.2;

export interface ReportMetrics {
  /** Galat kuadrat rata-rata akar, mm/jam. Langsung dari snapshot. */
  rmse: number;
  /** Galat mutlak rata-rata, mm/jam. */
  mae: number;
  /**
   * Indeks kesesuaian Willmott (d), 0..1. Angka utama laporan.
   *
   * `null` ketika medan sebenarnya masih kosong. Pada medan kosong penyebut
   * rumus Willmott ikut nol, dan rumusnya secara harfiah mengembalikan 1 —
   * angka sempurna yang tidak mengukur apa pun. Menampilkannya sebagai
   * "100 %" membuat juri peneliti curiga kebenaran dasarnya bocor, bukan
   * yakin. Metrik yang menolak menilai medan kosong lebih meyakinkan
   * daripada metrik yang menilainya sempurna.
   */
  agreement: number | null;
  /** Korelasi Pearson antara medan sebenarnya dan rekonstruksi, -1..1. `null` saat cerah. */
  correlation: number | null;
  /** Selisih rata-rata rekonstruksi terhadap sebenarnya, mm/jam. */
  bias: number;
  meanTruth: number;
  meanRecon: number;
  peakTruth: number;
  peakRecon: number;
  /** Bagian grid yang terisi hujan pada medan sebenarnya, 0..1. */
  wetAreaTruth: number;
  /** Bagian grid yang terisi hujan pada rekonstruksi, 0..1. */
  wetAreaRecon: number;
  /** Bagian sel yang status basah/keringnya sama di kedua medan, 0..1. `null` saat cerah. */
  cellHitRate: number | null;
  /** Jumlah tautan basah dan totalnya. */
  wetLinks: number;
  totalLinks: number;
  /** Redaman rata-rata dan puncak di antara tautan yang basah, dB. */
  meanAttenWet: number;
  peakAtten: number;
  /** Benar ketika memang sedang hujan; di bawah ini metrik bentuk tidak berarti. */
  raining: boolean;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function peak(values: number[]): number {
  let hi = 0;
  for (const v of values) if (v > hi) hi = v;
  return hi;
}

/** Korelasi Pearson. 0 ketika salah satu deret tidak punya ragam. */
export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  if (saa <= 0 || sbb <= 0) return 0;
  return sab / Math.sqrt(saa * sbb);
}

/**
 * Indeks kesesuaian Willmott (d).
 *
 *   d = 1 - Σ(o-p)² / Σ(|p-ō| + |o-ō|)²
 *
 * Dipakai sebagai angka utama, bukan RMSE, karena d tidak bersatuan dan
 * terbatas 0..1 sehingga bisa dibaca sebagai "seberapa cocok bentuk medannya".
 * RMSE tetap ditampilkan di sebelahnya sebagai galat dalam mm/jam — angka yang
 * bisa dibantah, jadi tidak boleh disembunyikan.
 */
export function willmottAgreement(truth: number[], recon: number[]): number {
  const n = Math.min(truth.length, recon.length);
  if (n === 0) return 0;
  const mo = mean(truth);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const d = truth[i] - recon[i];
    num += d * d;
    const s = Math.abs(recon[i] - mo) + Math.abs(truth[i] - mo);
    den += s * s;
  }
  if (den <= 0) return num <= 0 ? 1 : 0;
  return Math.max(0, Math.min(1, 1 - num / den));
}

function wetFraction(values: number[]): number {
  if (values.length === 0) return 0;
  let n = 0;
  for (const v of values) if (v >= WET_CELL_MMH) n++;
  return n / values.length;
}

function cellAgreement(truth: number[], recon: number[]): number {
  const n = Math.min(truth.length, recon.length);
  if (n === 0) return 0;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    if (truth[i] >= WET_CELL_MMH === recon[i] >= WET_CELL_MMH) hit++;
  }
  return hit / n;
}

function fieldsComparable(a: GridField, b: GridField): boolean {
  return a.nx === b.nx && a.ny === b.ny && a.values.length === b.values.length;
}

export function computeMetrics(snapshot: Snapshot): ReportMetrics {
  const truth = snapshot.truth.values;
  const recon = snapshot.reconstruction.values;
  const comparable = fieldsComparable(snapshot.truth, snapshot.reconstruction);

  const meanTruth = mean(truth);
  const meanRecon = mean(recon);
  const peakTruth = peak(truth);
  const peakRecon = peak(recon);

  let mae = 0;
  if (comparable) {
    let s = 0;
    for (let i = 0; i < truth.length; i++) s += Math.abs(truth[i] - recon[i]);
    mae = s / truth.length;
  }

  const links: LinkState[] = snapshot.links;
  const wet = links.filter((l) => l.isWet);

  /* Metrik bentuk (kesesuaian, korelasi, kecocokan sel) hanya berarti kalau ada
     medan untuk dibandingkan. Di bawah ambang ini nilainya bukan "bagus" atau
     "buruk", melainkan tidak terdefinisi — jadi dikembalikan sebagai `null`
     supaya lapisan tampilan terpaksa menuliskannya sebagai "—", bukan
     memamerkan angka sempurna yang lahir dari penyebut nol. */
  const shapeMeaningful = comparable && peakTruth > 1;

  return {
    rmse: snapshot.rmse,
    mae,
    agreement: shapeMeaningful ? willmottAgreement(truth, recon) : null,
    correlation: shapeMeaningful ? pearson(truth, recon) : null,
    bias: meanRecon - meanTruth,
    meanTruth,
    meanRecon,
    peakTruth,
    peakRecon,
    wetAreaTruth: wetFraction(truth),
    wetAreaRecon: wetFraction(recon),
    cellHitRate: shapeMeaningful ? cellAgreement(truth, recon) : null,
    wetLinks: wet.length,
    totalLinks: links.length,
    meanAttenWet: wet.length > 0 ? mean(wet.map((l) => l.attenuationDb)) : 0,
    peakAtten: peak(links.map((l) => l.attenuationDb)),
    raining: peakTruth > 1,
  };
}

/* ---------------------------------------------------------------------------
   Skor 0..100 untuk grafik radar.

   Enam sumbu, masing-masing menjawab satu pertanyaan berbeda tentang mutu
   rekonstruksi. Semuanya dinormalkan terhadap besaran kejadian itu sendiri
   (puncak atau rata-rata medan sebenarnya), bukan terhadap tetapan yang dipilih
   agar hasilnya bagus.
--------------------------------------------------------------------------- */

export interface RadarAxis {
  axis: string;
  score: number; // 0..100
  hint: string;
}

const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100);

/**
 * Enam sumbu mutu rekonstruksi, atau `null` saat tidak ada medan untuk dinilai.
 *
 * Mengembalikan `null` — bukan enam sumbu bernilai nol — karena radar penuh nol
 * terbaca sebagai "rekonstruksinya gagal total", padahal yang benar adalah
 * "belum ada hujan yang bisa direkonstruksi". Keduanya berbeda, dan hanya satu
 * di antaranya jujur.
 */
export function radarAxes(m: ReportMetrics, wetDryAccuracy: number): RadarAxis[] | null {
  if (m.agreement === null || m.correlation === null) return null;

  /* Skala acuan galat: puncak medan sebenarnya, dengan dasar 10 mm/jam supaya
     saat cerah pembaginya tidak mendekati nol dan skornya tidak meledak. */
  const errRef = Math.max(10, m.peakTruth);
  const biasRef = Math.max(0.5, m.meanTruth);
  const peakRef = Math.max(1, m.peakTruth);

  return [
    {
      axis: "Kesesuaian",
      score: pct(m.agreement),
      hint: "Indeks kesesuaian Willmott (d) antara medan sebenarnya dan hasil rekonstruksi, 0 sampai 1.",
    },
    {
      axis: "Korelasi",
      score: pct(m.correlation),
      hint: "Korelasi Pearson antar sel grid. Mengukur apakah bentuk dan posisi sel hujan tertangkap, terlepas dari besarnya.",
    },
    {
      axis: "Galat",
      score: pct(1 - m.rmse / errRef),
      hint: "RMSE dibandingkan puncak medan sebenarnya. 100 berarti galat jauh lebih kecil daripada intensitas yang diukur.",
    },
    {
      axis: "Bias",
      score: pct(1 - Math.abs(m.bias) / biasRef),
      hint: "Selisih rata-rata rekonstruksi terhadap medan sebenarnya. Menandakan kecenderungan menaksir terlalu tinggi atau rendah.",
    },
    {
      axis: "Puncak",
      score: pct(1 - Math.abs(m.peakRecon - m.peakTruth) / peakRef),
      hint: "Selisih nilai puncak. Penting karena intensitas tertinggi itulah yang memicu ambang siaga DAS.",
    },
    {
      axis: "Deteksi",
      score: pct(wetDryAccuracy),
      hint: "Akurasi klasifikasi basah/kering per tautan terhadap kebenaran dasar sepanjang kejadian. Garis dasarnya ditaksir dari data berderau, bukan dibaca dari simulator, jadi angka ini kinerja pembalik yang sebenarnya. Yang tetap perlu diingat: pembandingnya kebenaran dasar simulasi, bukan hujan sungguhan.",
    },
  ];
}

/* ---------------------------------------------------------------------------
   Penggolongan mutu, dipakai keping status dan meter gradien.
--------------------------------------------------------------------------- */

export type Grade = "sangat baik" | "baik" | "cukup" | "kurang";

export const GRADE_TONE: Record<Grade, "ok" | "rain" | "signal" | "alert"> = {
  "sangat baik": "ok",
  baik: "rain",
  cukup: "signal",
  kurang: "alert",
};

/** Golongan dari indeks kesesuaian, atau `null` saat indeksnya tak terdefinisi. */
export function gradeOfAgreement(d: number | null): Grade | null {
  if (d === null) return null;
  if (d >= 0.9) return "sangat baik";
  if (d >= 0.75) return "baik";
  if (d >= 0.55) return "cukup";
  return "kurang";
}

/**
 * Posisi penunjuk pada meter "galat rendah → galat tinggi".
 * 0 = tanpa galat, 1 = galat sebesar puncak medan sebenarnya.
 */
export function errorMeterRatio(m: ReportMetrics): number {
  const ref = Math.max(10, m.peakTruth);
  return Math.min(1, m.rmse / ref);
}
