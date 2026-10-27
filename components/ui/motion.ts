"use client";

import gsap from "gsap";

/* ============================================================================
 * Kosakata gerak konsol.
 *
 * Semua durasi dan pelonggaran tinggal di sini, jadi dua panggung tidak bisa
 * berpindah dengan irama berbeda tanpa mengubah berkas ini.
 *
 * KENAPA GSAP DAN BUKAN CSS. Yang membedakan bukan kehalusannya — CSS sama
 * halusnya. Yang membedakan INTERUPSI. Operator mengklik tab berpindah-pindah
 * lebih cepat daripada transisi selesai, dan dengan transisi CSS keadaan
 * setengah jalan itu menumpuk: elemen tertinggal pada opasitas 0.4, atau
 * tersangkut tergeser beberapa piksel karena transisi berikutnya dimulai dari
 * nilai antara. Timeline GSAP bisa dibunuh dan digantikan pada frame itu juga,
 * dan `overwrite: "auto"` membatalkan tween lama pada properti yang sama.
 *
 * Aturan konsol tetap berlaku: gerak hanya milik hal yang benar-benar berubah.
 * Berkas ini tidak memuat satu pun animasi masuk untuk elemen yang diam.
 * ==========================================================================*/

/** Kedatangan yang yakin: cepat di awal, mereda panjang. Sama dengan `--ease-out` CSS. */
export const EASE_OUT = "power3.out";
/** Kepergian: lebih cepat daripada kedatangan, karena kepergian bukan peristiwa. */
export const EASE_IN = "power2.in";

export const DUR = {
  /** Umpan balik langsung. */
  feedback: 0.15,
  /** Perpindahan keadaan rutin. */
  state: 0.24,
  /** Pergantian panggung dan lapisan di atasnya. */
  stage: 0.34,
  /** Kepergian lapisan; selalu lebih pendek daripada kedatangannya. */
  exit: 0.2,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Pergantian panggung.
 *
 * Isinya tidak memudar dari nol lalu naik jauh — itu membuat setiap klik tab
 * terasa seperti memuat halaman. Yang dipakai geser pendek searah perpindahan
 * ditambah pudar tipis: cukup untuk mengatakan "isinya berganti", tidak cukup
 * untuk membuat operator menunggu.
 *
 * `dir` adalah arah perpindahan di dalam deret tab, jadi berpindah ke kanan
 * mendorong isi dari kanan. Hubungan ruang itulah yang membuat deret tab terasa
 * sebagai satu deret, bukan tiga halaman terpisah.
 */
export function playStageIn(el: HTMLElement | null, dir: 1 | -1 = 1): gsap.core.Tween | null {
  if (!el) return null;
  if (prefersReducedMotion()) {
    gsap.set(el, { clearProps: "all" });
    return null;
  }
  return gsap.fromTo(
    el,
    { autoAlpha: 0, x: 18 * dir },
    {
      autoAlpha: 1,
      x: 0,
      duration: DUR.stage,
      ease: EASE_OUT,
      overwrite: "auto",
      clearProps: "transform,opacity,visibility",
    },
  );
}

/**
 * Pop-out: latar dan jendelanya.
 *
 * Jendela datang dari sedikit lebih kecil dan sedikit lebih rendah, bukan dari
 * tengah layar atau dari nol — ia sudah ada, hanya belum di depan. Latarnya
 * memudar terpisah dan lebih cepat, supaya isi di belakangnya tidak terasa
 * ikut bergerak.
 */
export function playModalIn(
  backdrop: HTMLElement | null,
  panel: HTMLElement | null,
  /**
   * Dipanggil setelah jendelanya benar-benar terlihat.
   *
   * WAJIB DIPAKAI UNTUK MEMINDAHKAN FOKUS. Animasi masuk memakai `autoAlpha`,
   * yang menulis `visibility: hidden` pada frame pertama — dan `.focus()` pada
   * elemen di dalam subtree tersembunyi tidak melakukan apa pun, tanpa galat.
   * Memanggil fokus langsung setelah `playModalIn` karena itu gagal diam-diam,
   * dan fokus tertinggal di `body`: papan ketik tetap berada di halaman yang
   * ada di belakang dialog.
   */
  onVisible?: () => void,
): gsap.core.Timeline | null {
  if (!backdrop || !panel) {
    onVisible?.();
    return null;
  }

  if (prefersReducedMotion()) {
    gsap.set([backdrop, panel], { clearProps: "all" });
    onVisible?.();
    return null;
  }

  const tl = gsap.timeline({ defaults: { overwrite: "auto" }, onComplete: onVisible });
  tl.fromTo(
    backdrop,
    { autoAlpha: 0 },
    { autoAlpha: 1, duration: DUR.state, ease: EASE_OUT },
  ).fromTo(
    panel,
    { autoAlpha: 0, y: 14, scale: 0.985 },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: DUR.stage,
      ease: EASE_OUT,
      clearProps: "transform",
    },
    "<0.04",
  );
  return tl;
}

/**
 * Penutupan pop-out, dengan panggilan balik ketika benar-benar selesai.
 *
 * Dipanggil balik, bukan ditunggu dengan setTimeout: kalau penutupannya
 * diinterupsi — operator menekan Escape lalu langsung membuka lagi — timeline
 * ini dibunuh dan panggilan baliknya tidak pernah berjalan, sehingga jendela
 * tidak dilepas di tengah pembukaan berikutnya.
 */
export function playModalOut(
  backdrop: HTMLElement | null,
  panel: HTMLElement | null,
  onDone: () => void,
): gsap.core.Timeline | null {
  if (!backdrop || !panel || prefersReducedMotion()) {
    onDone();
    return null;
  }

  const tl = gsap.timeline({ defaults: { overwrite: "auto" }, onComplete: onDone });
  tl.to(panel, {
    autoAlpha: 0,
    y: 8,
    scale: 0.99,
    duration: DUR.exit,
    ease: EASE_IN,
  }).to(backdrop, { autoAlpha: 0, duration: DUR.exit, ease: EASE_IN }, "<0.04");
  return tl;
}

/* ---------------------------------------------------------------------------
   FLIP untuk panel yang berpindah urutan

   DESIGN.md menyebut urutan panel sebagai satu-satunya hal yang berpindah di
   rel kanan: ketika ada kandidat peringatan menunggu, panel DAS yang memuat
   keputusan itu naik ke atas. Sebelumnya perpindahan itu terjadi seketika —
   panel yang tadi di bawah tiba-tiba ada di atas, dan operator tidak punya
   cara tahu bahwa itu panel yang sama.

   Diukur dengan `offsetTop`, BUKAN `getBoundingClientRect()`. Rel kanan bisa
   digulir, dan rect ikut bergeser saat digulir — memakainya berarti setiap
   guliran akan tampak seperti perpindahan panel dan memicu animasi palsu.
   `offsetTop` adalah letak tata letak, tidak terpengaruh guliran.
--------------------------------------------------------------------------- */

export type RailRects = Map<string, number>;

/** Rekam letak tiap anak ber-`data-flip` di dalam sebuah wadah. */
export function captureRail(container: HTMLElement | null): RailRects {
  const out: RailRects = new Map();
  if (!container) return out;
  container.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
    const id = el.dataset.flip;
    if (id) out.set(id, el.offsetTop);
  });
  return out;
}

/**
 * Kembalikan tiap panel ke letak lamanya lalu lepaskan ke letak barunya.
 * Panel yang baru muncul tidak ikut digeser — ia tidak berpindah dari mana pun.
 */
export function playRailFlip(container: HTMLElement | null, prev: RailRects): void {
  if (!container || prev.size === 0 || prefersReducedMotion()) return;

  container.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
    const id = el.dataset.flip;
    if (!id) return;
    const before = prev.get(id);
    if (before === undefined) return;

    const delta = before - el.offsetTop;
    if (Math.abs(delta) < 1) return;

    gsap.fromTo(
      el,
      { y: delta },
      {
        y: 0,
        duration: DUR.stage,
        ease: EASE_OUT,
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  });
}

/**
 * Penanda aktif yang meluncur di antara tab.
 *
 * Diukur dari letak tombol yang sebenarnya lalu digerakkan, bukan digambar
 * ulang di posisi baru. Perbedaannya bukan estetika: penanda yang meluncur
 * menunjukkan bahwa ketiga tab itu satu deret dan operator berpindah DI DALAM
 * deret itu. Penanda yang berkedip pindah tidak mengatakan apa-apa.
 */
export function moveTabIndicator(
  indicator: HTMLElement | null,
  target: HTMLElement | null,
  immediate = false,
): void {
  if (!indicator || !target) return;

  const parent = indicator.offsetParent as HTMLElement | null;
  if (!parent) return;

  const p = parent.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const next = { x: t.left - p.left, width: t.width };

  if (immediate || prefersReducedMotion()) {
    gsap.set(indicator, { ...next, autoAlpha: 1 });
    return;
  }

  gsap.to(indicator, {
    ...next,
    autoAlpha: 1,
    duration: DUR.state,
    ease: EASE_OUT,
    overwrite: "auto",
  });
}
