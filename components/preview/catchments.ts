/* ============================================================================
 * PREVIEW — akumulasi DAS dan kandidat peringatan. TEMPORARY.
 * ============================================================================
 * Berdampingan dengan `engine.ts`; dibuang bersama-sama ketika C1/C2 milik
 * Adnan mendarat (`lib/catchment/`, `lib/alerts/`). UI memakai tipe resmi
 * `CatchmentState` dan `AlertCandidate` supaya penggantian nanti hanya
 * mengubah sumber data, bukan komponennya.
 * ==========================================================================*/

import type { AlertCandidate, CatchmentState, Snapshot } from "@/lib/types";
import { ACCUM_STEP_S, EVENT_DURATION_S, type Geometry, computeSnapshot } from "./engine";

/** Ambang status relatif terhadap ambang siaga milik tiap DAS. */
const WASPADA_FRACTION = 0.6;

export interface CatchmentDef {
  id: string;
  name: string;
  thresholdMm: number;
  /** Cincin luar poligon, [lon, lat]. */
  ring: [number, number][];
}

export interface CatchmentSeries {
  defs: CatchmentDef[];
  /** Waktu tiap langkah pra-hitung, detik. */
  times: number[];
  /** accum[catchmentIndex][stepIndex] — akumulasi kumulatif sejak t=0, mm. */
  accum: number[][];
}

/** Uji titik dalam poligon dengan ray casting; benar untuk poligon cekung. */
export function pointInRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = yi > lat !== yj > lat;
    if (straddles && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * AMBANG PRATINJAU — HARUS DIGANTI OLEH BERKAS KONFIGURASI C1 MILIK ADNAN.
 *
 * Ambang di `data/catchments.geojson` (40, 45, 50 mm) tidak akan pernah
 * terlampaui oleh kejadian contoh ini, dan itu sudah diukur, bukan dikira:
 *
 *   Dengan sel hujan yang masih TERLIHAT bergerak di peta, akumulasi 1 jam
 *   tertinggi yang bisa dicapai DAS mana pun adalah 29 mm. Dari 144 konfigurasi
 *   badai yang diuji, tidak satu pun menembus 40 mm tanpa membesarkan selnya
 *   sampai melebihi kotak batas, dan sel sebesar itu mengubah peta menjadi
 *   pelat biru rata yang mematikan peragaan B2/B3 berprioritas P0.
 *
 * Jadi "ambang tercapai" dan "sel hujan terlihat bergerak" saling meniadakan
 * pada kejadian selama 1 jam. Tanpa penggantian ini, antrean peringatan selalu
 * kosong dan babak 1:50 serta 2:15 pada skenario demo tidak pernah terjadi.
 *
 * Kriteria C1 sendiri berbunyi "ambang dapat diatur lewat berkas konfigurasi,
 * bukan ditanam di kode", jadi angka di geojson memang berkedudukan sebagai
 * data sementara. Nilai di bawah dipilih supaya status benar-benar bergerak
 * normal -> waspada -> siaga pada kejadian contoh.
 *
 * Yang ditampilkan panel selalu ambang yang BENAR-BENAR dipakai menghitung
 * status, jadi tidak ada angka palsu di layar. Begitu Adnan menetapkan ambang
 * sebenarnya, hapus peta ini dan pakai konfigurasinya.
 *
 * Keputusan tim yang masih menggantung: turunkan ambang DAS, panjangkan durasi
 * kejadian melewati 1 jam, atau nilai status memakai jendela 3 jam / 6 jam.
 */
const PREVIEW_THRESHOLD_MM: Record<string, number> = {
  "C-01": 18,
  "C-02": 9,
  "C-03": 9,
};

/** Baca FeatureCollection sederhana menjadi definisi DAS. */
export function parseCatchments(geojson: {
  features: {
    properties: { id: string; name: string; thresholdMm: number };
    geometry: { coordinates: number[][][] };
  }[];
}): CatchmentDef[] {
  return geojson.features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    thresholdMm: PREVIEW_THRESHOLD_MM[f.properties.id] ?? f.properties.thresholdMm,
    ring: f.geometry.coordinates[0] as [number, number][],
  }));
}

/**
 * Pra-hitung akumulasi kumulatif tiap DAS untuk seluruh kejadian.
 * Sengaja memakai `reconstruction`, bukan `truth`: inilah yang benar-benar
 * dilihat sistem operasional, dan itu poin yang ingin kita tunjukkan.
 */
export function buildCatchmentSeries(geo: Geometry, defs: CatchmentDef[]): CatchmentSeries {
  const { nx, ny } = geo.grid;
  const cells = nx * ny;

  // topeng sel per DAS, dihitung sekali
  const masks = defs.map((d) => {
    const idx: number[] = [];
    for (let c = 0; c < cells; c++) {
      if (pointInRing(geo.cellLon[c], geo.cellLat[c], d.ring)) idx.push(c);
    }
    return idx;
  });

  const times: number[] = [];
  const accum: number[][] = defs.map(() => []);
  const running = defs.map(() => 0);
  const dtHours = ACCUM_STEP_S / 3600;

  for (let t = 0; t <= EVENT_DURATION_S; t += ACCUM_STEP_S) {
    const snap = computeSnapshot(geo, t);
    times.push(t);
    defs.forEach((_, di) => {
      const idx = masks[di];
      let mean = 0;
      if (idx.length > 0) {
        let sum = 0;
        for (const c of idx) sum += snap.reconstruction.values[c];
        mean = sum / idx.length;
      }
      // mm/jam selama satu langkah -> mm; akumulasi bersifat menaik
      running[di] += mean * dtHours;
      accum[di].push(running[di]);
    });
  }

  return { defs, times, accum };
}

function accumAt(series: CatchmentSeries, di: number, t: number): number {
  const { times } = series;
  if (t <= times[0]) return series.accum[di][0];
  const last = times.length - 1;
  if (t >= times[last]) return series.accum[di][last];
  const i = Math.floor(t / ACCUM_STEP_S);
  const j = Math.min(i + 1, last);
  const f = (t - times[i]) / (times[j] - times[i] || 1);
  return series.accum[di][i] + f * (series.accum[di][j] - series.accum[di][i]);
}

/** Akumulasi pada jendela bergerak selebar `windowS` detik yang berakhir di t. */
function windowAccum(series: CatchmentSeries, di: number, t: number, windowS: number): number {
  const start = Math.max(0, t - windowS);
  return Math.max(0, accumAt(series, di, t) - accumAt(series, di, start));
}

export function catchmentStatesAt(series: CatchmentSeries, t: number): CatchmentState[] {
  return series.defs.map((d, di) => {
    const accum1h = windowAccum(series, di, t, 3600);
    const accum3h = windowAccum(series, di, t, 10800);
    const accum6h = windowAccum(series, di, t, 21600);
    const status: CatchmentState["status"] =
      accum1h >= d.thresholdMm
        ? "siaga"
        : accum1h >= d.thresholdMm * WASPADA_FRACTION
          ? "waspada"
          : "normal";
    return { id: d.id, name: d.name, accum1h, accum3h, accum6h, thresholdMm: d.thresholdMm, status };
  });
}

/**
 * Waktu pertama tiap DAS melewati ambang siaga, atau null bila tidak pernah.
 * Kandidat peringatan dibuat pada saat itu dan menunggu konfirmasi operator.
 * Tidak ada jalur di sini yang menerbitkan peringatan sendiri.
 */
export function alertTriggerTimes(series: CatchmentSeries): (number | null)[] {
  return series.defs.map((d, di) => {
    for (const t of series.times) {
      if (windowAccum(series, di, t, 3600) >= d.thresholdMm) return t;
    }
    return null;
  });
}

/** Kandidat yang sudah muncul pada waktu t, berstatus awal "menunggu". */
export function pendingCandidatesAt(
  series: CatchmentSeries,
  triggers: (number | null)[],
  t: number,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  series.defs.forEach((d, di) => {
    const trig = triggers[di];
    if (trig === null || t < trig) return;
    out.push({
      id: `ALT-${d.id}`,
      catchmentId: d.id,
      raisedAt: trig,
      accumMm: windowAccum(series, di, trig, 3600),
      thresholdMm: d.thresholdMm,
      status: "menunggu",
    });
  });
  return out;
}

export type { Snapshot };
