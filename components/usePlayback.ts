"use client";

import { useEffect } from "react";
import { useDashboard } from "./store";
import { EVENT_DURATION_S } from "./preview/engine";

/** Pembaruan keadaan dibatasi ~20 per detik. Cukup halus untuk sel hujan yang
 *  bergeser, cukup jarang supaya panel dan grafik tidak dipaksa menggambar
 *  ulang 60 kali per detik dan pemutaran 20x jadi tersendat. */
const MIN_FRAME_MS = 50;

export function usePlayback() {
  const playing = useDashboard((s) => s.playing);
  const speed = useDashboard((s) => s.speed);

  useEffect(() => {
    if (!playing) return;

    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const tick = (now: number) => {
      acc += now - last;
      last = now;

      if (acc >= MIN_FRAME_MS) {
        const store = useDashboard.getState();
        const next = store.t + (acc / 1000) * speed;
        acc = 0;
        if (next >= EVENT_DURATION_S) {
          store.setT(EVENT_DURATION_S);
          store.pause();
          return;
        }
        store.setT(next);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);
}

/** Pintasan papan ketik ala konsol: spasi putar/jeda, R atur ulang, panah geser. */
export function useKeyboardTransport() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      const store = useDashboard.getState();

      if (e.code === "Space") {
        e.preventDefault();
        store.togglePlay();
      } else if (e.key === "r" || e.key === "R") {
        store.reset();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        store.pause();
        store.setT(store.t - (e.shiftKey ? 300 : 60));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        store.pause();
        store.setT(store.t + (e.shiftKey ? 300 : 60));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
