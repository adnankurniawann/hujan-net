"use client";

import { create } from "zustand";
/* Panjang kejadian dibaca dari tetapan skenario yang sama dengan yang dipakai
   server, bukan dari mesin pratinjau. Keduanya kebetulan 3600 detik, tetapi
   penjepit penggeser waktu tidak pantas bergantung pada folder yang statusnya
   memang cadangan. `lib/sim/scenario` murni tetapan dan aman di bundel klien. */
import { EVENT_DURATION_S } from "@/lib/sim/scenario";

/**
 * Tiga panggung. `laporan` menjadi tampilan awal: pertanyaan pertama juri adalah
 * "seberapa akurat", bukan "di mana hujannya" — dan jawaban atas pertanyaan itu
 * berada satu klik dari sana, bukan sebaliknya.
 */
export type StageView = "laporan" | "peta" | "perbandingan";
export type PlaybackSpeed = 1 | 5 | 20;

/* KEPUTUSAN OPERATOR TIDAK LAGI DI SINI.
   `decisions` dan `decideAlert` dulu menyimpan konfirmasi dan pengabaian di
   memori Zustand, yang berarti seluruh riwayat hilang pada tiap muat ulang dan
   kriteria C2 "riwayat bertahan setelah server dimuat ulang" tidak pernah bisa
   diperagakan. Sekarang keputusan ditulis ke SQLite lewat `/api/alerts`; lihat
   `components/alerts/useCatchmentAlerts.ts`. Store ini kembali menjadi apa yang
   memang pantas ada di peramban saja: keadaan tampilan. */

interface DashboardState {
  t: number;
  playing: boolean;
  speed: PlaybackSpeed;
  stage: StageView;
  selectedLinkId: string | null;

  setT: (t: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  reset: () => void;
  setSpeed: (s: PlaybackSpeed) => void;
  setStage: (v: StageView) => void;
  selectLink: (id: string | null) => void;
}

const clampT = (t: number) => Math.min(EVENT_DURATION_S, Math.max(0, t));

export const useDashboard = create<DashboardState>((set) => ({
  t: 0,
  playing: false,
  speed: 20,
  /* Panggung awal adalah peta, bukan laporan. Naskah demo (Panduan bagian 10)
     membuka pada t=0 dengan cuaca cerah di atas peta, dan pada t=0 medan
     sebenarnya masih kosong — laporan tidak punya apa pun untuk dinilai. */
  stage: "peta",
  selectedLinkId: null,

  setT: (t) => set({ t: clampT(t) }),
  play: () => set((s) => (s.t >= EVENT_DURATION_S ? { playing: true, t: 0 } : { playing: true })),
  pause: () => set({ playing: false }),
  togglePlay: () =>
    set((s) => {
      if (s.playing) return { playing: false };
      // memutar dari ujung kejadian mengulang dari awal
      return s.t >= EVENT_DURATION_S ? { playing: true, t: 0 } : { playing: true };
    }),
  reset: () => set({ t: 0, playing: false }),
  setSpeed: (speed) => set({ speed }),
  setStage: (stage) => set({ stage }),
  selectLink: (selectedLinkId) => set({ selectedLinkId }),
}));
