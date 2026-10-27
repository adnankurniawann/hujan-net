"use client";

/* ============================================================================
 * Status DAS dan antrean peringatan, keduanya dari server.
 * ============================================================================
 *
 * Menggantikan dua hal sekaligus yang sebelumnya hidup di peramban: perhitungan
 * akumulasi DAS di `components/preview/catchments.ts`, dan keputusan operator
 * yang disimpan di `components/store.ts`.
 *
 * KENAPA KEPUTUSAN OPERATOR PINDAH KE SQLITE. Keputusan yang hanya ada di memori
 * Zustand hilang pada setiap muat ulang, sehingga kriteria C2 "riwayat bertahan
 * setelah server dimuat ulang" tidak pernah benar benar bisa diperagakan.
 *
 * TIGA ATURAN YANG DITEGAKKAN DI SINI
 *
 * 1. KANDIDAT DIBATASI OLEH JAM SIMULASI. `/api/alerts` mengembalikan SELURUH
 *    kandidat kejadian sekaligus, termasuk yang ambangnya baru terlampaui pada
 *    T+48:00, karena `refreshAlertsFromFrames` memindai seluruh rentang waktu
 *    sekali jalan. Kalau dikirim apa adanya ke panel, peringatan sudah duduk di
 *    antrean pada T+0 saat peta masih cerah — peringatan yang mendahului
 *    hujannya sendiri. `candidatesUpTo` menyaring `raisedAt <= t`, sehingga
 *    kandidat tetap muncul satu per satu seiring badainya berjalan.
 *
 * 2. PENANDA LINTASAN TIDAK DIBATASI. `markers` justru memakai seluruh kandidat,
 *    karena gunanya memang melompat ke depan, ke saat peringatan akan muncul.
 *
 * 3. `refresh` DIPANGGIL SEKALI SEBELUM MEMBACA. `syncCandidates` memakai id
 *    deterministik dan tidak pernah menyentuh baris yang sudah ada, jadi
 *    pemanggilan ini aman diulang dan tidak pernah mengembalikan kandidat yang
 *    sudah diputuskan operator ke status `menunggu`.
 * ==========================================================================*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AlertStatus, CatchmentState } from "@/lib/types";
import type { AlertRecord } from "@/lib/alerts/types";

/** Keputusan operator atas satu kandidat, seperti yang dibaca komponen antrean. */
export interface AlertDecision {
  status: AlertStatus;
  confirmedBy?: string;
  confirmedAt?: number;
}

/** Tidak ada autentikasi dalam lingkup ini; operator ditulis apa adanya. */
export const OPERATOR = "OPERATOR BPBD";

/**
 * Selang penarikan ulang antrean, ms.
 *
 * Bukan untuk keputusan yang dibuat di dasbor ini — itu langsung memakai baris
 * yang dikembalikan endpoint. Ini untuk keputusan yang dibuat di tempat lain,
 * misalnya halaman `/panel-preview` yang menulis ke basis data yang sama.
 */
const POLL_MS = 5000;

interface CatchmentTimeline {
  eventId: string;
  stepS: number;
  frames: { t: number; states: CatchmentState[] }[];
}

export interface CatchmentAlerts {
  ready: boolean;
  /** Terisi hanya kalau status DAS atau antrean gagal diambil. */
  error: string | null;
  statesAt: (t: number) => CatchmentState[];
  candidatesUpTo: (t: number) => AlertRecord[];
  /** `raisedAt` seluruh kandidat kejadian, untuk penanda di lintasan penggeser waktu. */
  markers: number[];
  decisions: Record<string, AlertDecision>;
  decide: (id: string, status: Exclude<AlertStatus, "menunggu">, by: string) => void;
  /** Id kandidat yang keputusannya sedang ditulis, kalau ada. */
  deciding: string | null;
  /** Galat penulisan keputusan terakhir. Dibersihkan pada percobaan berikutnya. */
  decideError: string | null;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* jawaban bukan JSON; kode status saja sudah cukup memberi tahu */
  }
  if (!res.ok) {
    const detail = (body as { error?: string })?.error ?? `kode ${res.status}`;
    throw new Error(detail);
  }
  return body as T;
}

export function useCatchmentAlerts(): CatchmentAlerts {
  const [timeline, setTimeline] = useState<CatchmentTimeline | null>(null);
  const [records, setRecords] = useState<AlertRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const eventId = useRef<string | null>(null);

  const loadAlerts = useCallback(async () => {
    const query = eventId.current ? `?eventId=${encodeURIComponent(eventId.current)}` : "";
    const body = await getJson<{ alerts: AlertRecord[] }>(`/api/alerts${query}`);
    setRecords(body.alerts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    (async () => {
      try {
        /* Urutannya wajib: menyemai lebih dulu, baru membaca. Terbalik, pembacaan
           pertama selalu mengembalikan antrean kosong dan panel terlihat rusak
           selama satu selang penarikan. */
        await getJson<{ eventId: string }>("/api/alerts/refresh", { method: "POST" });
        const tl = await getJson<CatchmentTimeline>("/api/catchments?all=1");
        if (cancelled) return;

        eventId.current = tl.eventId;
        setTimeline(tl);
        await loadAlerts();
        if (cancelled) return;
        setError(null);

        timer = window.setInterval(() => {
          void loadAlerts().catch(() => {
            /* Satu penarikan yang gagal tidak boleh mengosongkan antrean yang
               sudah tergambar; baris yang ada tetap dipakai sampai berhasil. */
          });
        }, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Status DAS gagal diambil");
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [loadAlerts]);

  const statesAt = useCallback(
    (t: number): CatchmentState[] => {
      if (!timeline || timeline.frames.length === 0) return [];
      const i = Math.round(t / timeline.stepS);
      const clamped = Math.min(timeline.frames.length - 1, Math.max(0, i));
      return timeline.frames[clamped].states;
    },
    [timeline],
  );

  const candidatesUpTo = useCallback(
    (t: number): AlertRecord[] => (records ?? []).filter((r) => r.raisedAt <= t),
    [records],
  );

  const markers = useMemo(
    () => Array.from(new Set((records ?? []).map((r) => r.raisedAt))).sort((a, b) => a - b),
    [records],
  );

  const decisions = useMemo(() => {
    const out: Record<string, AlertDecision> = {};
    for (const r of records ?? []) {
      if (r.status === "menunggu") continue;
      out[r.id] = {
        status: r.status,
        confirmedBy: r.confirmedBy,
        confirmedAt: r.confirmedAt,
      };
    }
    return out;
  }, [records]);

  const decide = useCallback(
    (id: string, status: Exclude<AlertStatus, "menunggu">, by: string) => {
      setDeciding(id);
      setDecideError(null);
      const kind = status === "dikonfirmasi" ? "confirm" : "dismiss";

      void (async () => {
        try {
          const body = await getJson<{ alert: AlertRecord }>(
            `/api/alerts/${encodeURIComponent(id)}/${kind}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ by }),
            },
          );
          /* Baris yang dikembalikan endpoint dipakai apa adanya, bukan ditebak
             di sini. Dengan begitu cap waktu dan nama operator yang tampil di
             riwayat memang yang tersimpan di basis data. */
          setRecords((prev) =>
            (prev ?? []).map((r) => (r.id === body.alert.id ? body.alert : r)),
          );
        } catch (err) {
          setDecideError(err instanceof Error ? err.message : "Keputusan gagal disimpan");
        } finally {
          setDeciding(null);
        }
      })();
    },
    [],
  );

  return {
    ready: timeline !== null && records !== null,
    error,
    statesAt,
    candidatesUpTo,
    markers,
    decisions,
    decide,
    deciding,
    decideError,
  };
}
