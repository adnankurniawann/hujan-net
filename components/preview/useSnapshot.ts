"use client";

/* ============================================================================
 * TITIK TUKAR TUNGGAL ke API milik Radit (A5).
 * ============================================================================
 * Ketika `GET /api/sim?t=` dan `GET /api/sim/meta` sudah ada, cukup ganti isi
 * `useSimulation` di berkas ini: ambil meta sekali, lalu ambil snapshot per
 * perubahan t (atau pra-ambil seluruh kejadian sekali, sesuai A5 yang menyimpan
 * hasilnya di memori). Seluruh komponen di `components/` sudah bicara dalam
 * tipe resmi `Snapshot`, `LinkState`, `CatchmentState`, `AlertCandidate`,
 * sehingga tidak ada komponen yang perlu diubah.
 * Setelah itu hapus folder `components/preview/`.
 * ==========================================================================*/

import { useEffect, useMemo, useRef, useState } from "react";
import type { AlertCandidate, CatchmentState, Link, Snapshot } from "@/lib/types";
import {
  EVENT_DURATION_S,
  type Geometry,
  type GridSpec,
  type LinkTracePoint,
  buildGeometry,
  classificationAccuracy,
  computeSnapshot,
  linkTrace,
} from "./engine";
import {
  type CatchmentDef,
  type CatchmentSeries,
  alertTriggerTimes,
  buildCatchmentSeries,
  catchmentStatesAt,
  pendingCandidatesAt,
} from "./catchments";

/** Resolusi grid rekonstruksi. Cukup halus untuk heatmap, cukup murah untuk 20x. */
const GRID_NX = 44;
const GRID_NY = 36;
const BBOX_MARGIN_DEG = 0.012;

export interface SimulationMeta {
  bbox: [number, number, number, number];
  durationS: number;
  links: Link[];
  /** Akurasi klasifikasi basah/kering terhadap kebenaran dasar, 0..1. */
  wetDryAccuracy: number;
}

export interface RmsePoint {
  t: number;
  rmse: number;
  /** Puncak medan sebenarnya pada t; dipakai sebagai konteks besaran galat. */
  peakTruth: number;
}

export interface Simulation {
  ready: boolean;
  meta: SimulationMeta | null;
  snapshotAt: (t: number) => Snapshot | null;
  catchmentsAt: (t: number) => CatchmentState[];
  candidatesAt: (t: number) => AlertCandidate[];
  traceFor: (linkId: string) => LinkTracePoint[];
  /**
   * Galat rekonstruksi sepanjang kejadian, dicuplik tiap `RMSE_TREND_STEP_S`.
   * Dihitung sekali saat pertama diminta lalu disimpan, karena isinya tidak
   * bergantung pada t dan biayanya adalah satu snapshot penuh per titik cuplik.
   */
  rmseSeries: () => RmsePoint[];
}

/** Langkah cuplik grafik tren galat. 60 detik memberi 61 titik untuk 1 jam. */
export const RMSE_TREND_STEP_S = 60;

function gridFromLinks(links: Link[]): GridSpec {
  let lonMin = Infinity;
  let latMin = Infinity;
  let lonMax = -Infinity;
  let latMax = -Infinity;
  for (const l of links) {
    for (const s of [l.siteA, l.siteB]) {
      lonMin = Math.min(lonMin, s.lon);
      latMin = Math.min(latMin, s.lat);
      lonMax = Math.max(lonMax, s.lon);
      latMax = Math.max(latMax, s.lat);
    }
  }
  return {
    bbox: [
      lonMin - BBOX_MARGIN_DEG,
      latMin - BBOX_MARGIN_DEG,
      lonMax + BBOX_MARGIN_DEG,
      latMax + BBOX_MARGIN_DEG,
    ],
    nx: GRID_NX,
    ny: GRID_NY,
  };
}

interface Built {
  geo: Geometry;
  series: CatchmentSeries;
  triggers: (number | null)[];
  meta: SimulationMeta;
}

export function useSimulation(links: Link[], catchments: CatchmentDef[]): Simulation {
  const [built, setBuilt] = useState<Built | null>(null);
  const snapCache = useRef(new Map<number, Snapshot>());
  const traceCache = useRef(new Map<string, LinkTracePoint[]>());
  const rmseCache = useRef<RmsePoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* Beri browser satu putaran tugas untuk melukis kerangka dan keadaan memuat
       lebih dulu.

       Dipakai setTimeout, bukan requestAnimationFrame: tab yang tersembunyi
       tidak pernah menerima frame di Chrome, sehingga dasbor yang dibuka di tab
       latar akan berhenti di "Menyiapkan kejadian" sampai tabnya dilihat. */
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      const grid = gridFromLinks(links);
      const geo = buildGeometry(links, grid);
      const series = buildCatchmentSeries(geo, catchments);
      const next: Built = {
        geo,
        series,
        triggers: alertTriggerTimes(series),
        meta: {
          bbox: grid.bbox,
          durationS: EVENT_DURATION_S,
          links,
          wetDryAccuracy: classificationAccuracy(geo),
        },
      };
      snapCache.current.clear();
      traceCache.current.clear();
      rmseCache.current = null;
      setBuilt(next);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [links, catchments]);

  return useMemo<Simulation>(() => {
    if (!built) {
      return {
        ready: false,
        meta: null,
        snapshotAt: () => null,
        catchmentsAt: () => [],
        candidatesAt: () => [],
        traceFor: () => [],
        rmseSeries: () => [],
      };
    }
    const { geo, series, triggers, meta } = built;
    return {
      ready: true,
      meta,
      snapshotAt: (t) => {
        // kuantisasi ke 1 detik supaya cache berguna saat pemutaran
        const key = Math.round(t);
        const hit = snapCache.current.get(key);
        if (hit) return hit;
        const snap = computeSnapshot(geo, key);
        // batasi cache agar pemutaran panjang tidak menumpuk memori
        if (snapCache.current.size > 900) snapCache.current.clear();
        snapCache.current.set(key, snap);
        return snap;
      },
      catchmentsAt: (t) => catchmentStatesAt(series, t),
      candidatesAt: (t) => pendingCandidatesAt(series, triggers, t),
      traceFor: (linkId) => {
        const hit = traceCache.current.get(linkId);
        if (hit) return hit;
        const li = geo.links.findIndex((l) => l.id === linkId);
        if (li < 0) return [];
        const trace = linkTrace(geo, li);
        traceCache.current.set(linkId, trace);
        return trace;
      },
      rmseSeries: () => {
        if (rmseCache.current) return rmseCache.current;
        const out: RmsePoint[] = [];
        for (let t = 0; t <= meta.durationS; t += RMSE_TREND_STEP_S) {
          const snap = computeSnapshot(geo, t);
          let peak = 0;
          for (const v of snap.truth.values) if (v > peak) peak = v;
          out.push({ t, rmse: snap.rmse, peakTruth: peak });
        }
        rmseCache.current = out;
        return out;
      },
    };
  }, [built]);
}
