"use client";

/* ============================================================================
 * Sumber data dasbor: kejadian sungguhan dari `/api/sim`.
 * ============================================================================
 *
 * Ini pengganti `components/preview/useSnapshot.ts`, yaitu langkah A5 yang sejak
 * awal ditulis sebagai rencana di kepala berkas itu.
 *
 * KENAPA DIGANTI SEKARANG, DAN BUKAN SEKADAR KARENA "SUDAH WAKTUNYA".
 *
 * Repo ini memuat DUA kejadian contoh yang berbeda. Mesin pratinjau memakai
 * badai dua sel dari barat daya ke timur laut dengan puncak 78 mm/jam; `lib/sim`
 * memakai `DEMO_STORM`, badai tiga sel dari tenggara ke barat laut dengan puncak
 * 38 mm/jam. Selama panel DAS dan antrean peringatan sama sama dihitung di
 * peramban, ketidakcocokan itu tidak pernah terlihat. Begitu keputusan operator
 * dipindahkan ke SQLite — dan SQLite hanya bisa diisi oleh pipeline server —
 * dua kejadian itu bertemu di satu layar dan saling membantah: peringkat DAS-nya
 * terbalik, sehingga panel menyebut Cisarua siaga sementara antrean menerbitkan
 * peringatan Megamendung.
 *
 * Menyamakan badainya sudah dicoba dan tidak cukup. Dengan parameter badai yang
 * sama persis, IDW sederhana mesin pratinjau tetap merekonstruksi C-02 sebesar
 * 7,13 mm sementara pipeline server mendapat 9,36 mm — dua sisi ambang siaga 9 mm.
 * Selisih itu bukan soal penyetelan melainkan soal dua model inversi yang memang
 * berbeda, jadi satu satunya jalan adalah berhenti menghitung gambar di peramban.
 *
 * Yang ikut membaik, dan ini bukan efek samping kecil: angka yang dipakai
 * laporan berubah dari angka mesin pratinjau menjadi angka pipeline sungguhan.
 *
 *   RMSE rata rata      6,08  ->  3,41 mm/jam
 *   RMSE terburuk      10,18  ->  7,44 mm/jam   kriteria A4 < 8, dari GAGAL ke LOLOS
 *   selisih puncak      3,16  ->  2,73 km
 *   akurasi basah/kering 99,9% -> 99,6%
 *
 * Akurasi basah/kering yang turun justru yang jujur. Angka 99,9% mesin pratinjau
 * tinggi karena inversinya sudah tahu garis dasar sebenarnya; `lib/inverse`
 * menaksir garis dasar dari data berderau, dan `tests/inverse.test.ts` menguji
 * bahwa taksiran itu tidak pernah identik dengan kebenaran dasar.
 *
 * CARA MUNDUR KALAU ADA YANG MELEDAK DI LOKASI ACARA. `components/preview/`
 * sengaja TIDAK dihapus, dan hook di sana masih utuh. Di `components/Dashboard.tsx`:
 *
 *   1. impor `useSimulation` dari `./preview/useSnapshot`, panggil dengan
 *      `(links, catchmentDefs)`
 *   2. `catchments` -> `sim.catchmentsAt(t)`, `candidates` -> `sim.candidatesAt(t)`,
 *      `trace` -> `sim.traceFor(selectedLinkId)`
 *   3. keputusan operator kembali ke memori: pakai `useState` sederhana untuk
 *      peta `decisions`, karena `components/store.ts` sudah tidak menyimpannya
 *
 * Keduanya berbicara dalam tipe resmi yang sama, jadi tidak ada komponen
 * tampilan yang perlu diubah.
 * ==========================================================================*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Link, Snapshot } from "@/lib/types";

export interface SimulationMeta {
  bbox: [number, number, number, number];
  durationS: number;
  links: Link[];
  /** Akurasi klasifikasi basah/kering terhadap kebenaran dasar, 0..1. */
  wetDryAccuracy: number;
  /** Jarak antar cuplikan kejadian, detik. */
  intervalS: number;
}

export interface RmsePoint {
  t: number;
  rmse: number;
  /** Puncak medan sebenarnya pada t; dipakai sebagai konteks besaran galat. */
  peakTruth: number;
}

/** Satu titik pada grafik deret waktu tautan di panel B4. */
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

export interface Simulation {
  ready: boolean;
  /** Terisi hanya kalau kejadian gagal diambil. Dasbor menampilkannya apa adanya. */
  error: string | null;
  meta: SimulationMeta | null;
  snapshotAt: (t: number) => Snapshot | null;
  rmseSeries: () => RmsePoint[];
}

/** Langkah cuplik grafik tren galat. 60 detik memberi 61 titik untuk 1 jam. */
export const RMSE_TREND_STEP_S = 60;

/** Bentuk jawaban `/api/sim/meta` yang benar benar dipakai di sini. */
interface MetaResponse {
  links: Link[];
  bbox: [number, number, number, number];
  durationS: number;
  intervalS: number;
  diagnostics: { wetDryAccuracy: number };
}

interface Loaded {
  meta: SimulationMeta;
  times: number[];
  snapshots: Snapshot[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let detail = `kode ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = String(body.error);
    } catch {
      /* jawaban bukan JSON; kode status saja sudah cukup memberi tahu */
    }
    throw new Error(`${url} gagal: ${detail}`);
  }
  return (await res.json()) as T;
}

/**
 * Ambil seluruh kejadian sekali, lalu layani `t` dari memori.
 *
 * Tidak menerima `links`: topologi datang dari `/api/sim/meta`, sehingga tautan
 * yang digambar peta dijamin tautan yang benar benar diukur pipeline. Versi
 * pratinjau menerimanya karena memang menghitung sendiri di peramban.
 */
export function useSimulation(): Simulation {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rmseCache = useRef<RmsePoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const meta = await getJson<MetaResponse>("/api/sim/meta");
        const event = await getJson<{ times: number[]; snapshots: Snapshot[] }>("/api/sim/event");
        if (cancelled) return;

        if (event.snapshots.length === 0) {
          throw new Error("kejadian tidak memuat satu pun bingkai");
        }

        rmseCache.current = null;
        setLoaded({
          meta: {
            bbox: meta.bbox,
            durationS: meta.durationS,
            links: meta.links,
            wetDryAccuracy: meta.diagnostics.wetDryAccuracy,
            intervalS: meta.intervalS,
          },
          times: event.times,
          snapshots: event.snapshots,
        });
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Kejadian simulasi gagal diambil");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const snapshotAt = useCallback(
    (t: number): Snapshot | null => {
      if (!loaded) return null;
      const { times, snapshots } = loaded;
      /* Waktu dibulatkan ke cuplikan terdekat, bukan dijepit ke bawah: pada
         kecepatan 20x penggeser waktu melompati cuplikan, dan pembulatan ke bawah
         membuat peta tertinggal setengah langkah di belakang jam simulasi. */
      const step = loaded.meta.intervalS;
      const i = Math.round(t / step);
      const clamped = Math.min(times.length - 1, Math.max(0, i));
      return snapshots[clamped] ?? null;
    },
    [loaded],
  );

  const rmseSeries = useCallback((): RmsePoint[] => {
    if (!loaded) return [];
    if (rmseCache.current) return rmseCache.current;

    const out: RmsePoint[] = [];
    const stride = Math.max(1, Math.round(RMSE_TREND_STEP_S / loaded.meta.intervalS));
    for (let i = 0; i < loaded.snapshots.length; i += stride) {
      const snap = loaded.snapshots[i];
      let peak = 0;
      for (const v of snap.truth.values) if (v > peak) peak = v;
      out.push({ t: snap.t, rmse: snap.rmse, peakTruth: peak });
    }
    rmseCache.current = out;
    return out;
  }, [loaded]);

  return useMemo<Simulation>(
    () => ({
      ready: loaded !== null,
      error,
      meta: loaded?.meta ?? null,
      snapshotAt,
      rmseSeries,
    }),
    [loaded, error, snapshotAt, rmseSeries],
  );
}

/** Bentuk jawaban `/api/sim/link/<id>`, tersusun sebagai kolom. */
interface LinkSeriesResponse {
  t: number[];
  rxPowerDbm: number[];
  baselineEstDb: number[];
  rainAttenuationDb: number[];
  estRainMmH: number[];
  isWet: boolean[];
  trueRainMmH: number[];
}

/**
 * Deret waktu satu tautan untuk panel detail B4.
 *
 * Diambil hanya ketika ada tautan yang dipilih, dan disinggahkan per tautan:
 * juri biasanya bolak balik antara dua atau tiga tautan yang sama, dan
 * mengambilnya ulang tiap klik membuat grafiknya berkedip kosong.
 *
 * `rainAttenuationDb` yang dipakai sebagai `attenuationDb`, bukan
 * `totalAttenuationDb`: yang ditunjukkan panel adalah redaman akibat hujan
 * setelah koreksi antena basah, dan itulah yang menurunkan `estRainMmH`.
 */
export function useLinkTrace(linkId: string | null): LinkTracePoint[] {
  const cache = useRef(new Map<string, LinkTracePoint[]>());
  const [, bump] = useState(0);

  useEffect(() => {
    if (!linkId || cache.current.has(linkId)) return;
    let cancelled = false;

    (async () => {
      try {
        const s = await getJson<LinkSeriesResponse>(
          `/api/sim/link/${encodeURIComponent(linkId)}`,
        );
        if (cancelled) return;
        cache.current.set(
          linkId,
          s.t.map((t, i) => ({
            t,
            rxPowerDbm: s.rxPowerDbm[i],
            baselineDb: s.baselineEstDb[i],
            attenBand: [s.rxPowerDbm[i], s.baselineEstDb[i]] as [number, number],
            attenuationDb: s.rainAttenuationDb[i],
            isWet: s.isWet[i],
            estRainMmH: s.estRainMmH[i],
            trueRainMmH: s.trueRainMmH[i],
          })),
        );
        bump((n) => n + 1);
      } catch {
        /* Grafik kosong sudah menjadi keadaan yang ditangani panel B4, dan satu
           tautan yang gagal diambil tidak pantas menjatuhkan seluruh dasbor. */
        if (!cancelled) cache.current.set(linkId, []);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linkId]);

  return linkId ? (cache.current.get(linkId) ?? []) : [];
}
