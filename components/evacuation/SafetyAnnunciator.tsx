"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import Alert from "@/components/ui/alert";
import type { SafetyStatus } from "./safety";

/* ============================================================================
 * Anunsiator status lintasan.
 *
 * MENGGANTIKAN KOTAK PERINGATAN BERTINT. Sebelumnya status rute ditampilkan
 * sebagai pil berwarna plus kotak isian 10% dengan tepi 40% dan teks gelap —
 * resep `alert-danger` yang sama persis dengan setiap kerangka kerja CSS, dan
 * karena itu tidak mengatakan apa pun tentang produk ini.
 *
 * Rujukannya panel anunsiator sungguhan di ruang kendali: seluruh tingkat
 * SELALU tercetak, hanya yang sedang berlaku yang menyala. Bentuk itu lebih
 * jujur daripada satu kata berwarna, karena operator melihat skalanya sekaligus
 * posisinya di dalam skala itu — "BAHAYA" tidak berarti apa-apa kalau yang
 * membacanya belum tahu ada tingkat di bawahnya.
 *
 * Ambang yang memicunya ikut ditulis, jadi angkanya bisa dibantah. Itu syarat
 * yang sama yang berlaku untuk setiap angka lain di konsol ini.
 * ==========================================================================*/

const LEVELS: SafetyStatus[] = ["AMAN", "WASPADA", "BAHAYA"];

/** Ambang batas bawah tiap tingkat, mm/jam. Sumbernya `computeRouteToPost`. */
const THRESHOLD_MMH: Record<SafetyStatus, number | null> = {
  AMAN: null,
  WASPADA: 15,
  BAHAYA: 35,
};

const LEVEL_INK: Record<SafetyStatus, string> = {
  AMAN: "var(--ok)",
  WASPADA: "var(--signal)",
  BAHAYA: "var(--alert)",
};

export function SafetyAnnunciator({
  status,
  rainMmH,
  known,
  className = "",
}: {
  status: SafetyStatus;
  /** Hujan tertinggi di sepanjang lintasan. */
  rainMmH: number | null;
  /** Salah bila medan hujan belum ada: seluruh lampu padam, bukan AMAN. */
  known: boolean;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeIndex = known ? LEVELS.indexOf(status) : -1;
  const prevIndex = useRef<number>(activeIndex);

  /* Lampu yang baru menyala diberi satu denyut singkat, dan hanya ketika
     tingkatnya benar-benar BERPINDAH. Selama hujan bergerak tanpa mengubah
     tingkat, tidak ada yang beranimasi — sesuai aturan konsol ini bahwa gerak
     hanya milik hal yang berubah. */
  useEffect(() => {
    if (prevIndex.current === activeIndex) return;
    prevIndex.current = activeIndex;
    if (activeIndex < 0 || !rootRef.current) return;

    const lamp = rootRef.current.querySelector<HTMLElement>(`[data-level="${activeIndex}"]`);
    if (!lamp) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        lamp,
        { "--lamp-lift": 0 },
        {
          "--lamp-lift": 1,
          duration: 0.42,
          ease: "power3.out",
          clearProps: "--lamp-lift",
        },
      );
    }, rootRef);

    return () => ctx.revert();
  }, [activeIndex]);

  const threshold = known ? THRESHOLD_MMH[status] : null;

  return (
    <div ref={rootRef} className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-3xs font-medium uppercase tracking-caps text-text-mute">
          Status lintasan
        </span>
        <span className="tnum text-3xs text-text-dim">
          {known && rainMmH !== null ? (
            <>
              {rainMmH.toFixed(1)}
              <span className="ml-1 font-sans">mm/jam</span>
            </>
          ) : (
            "—"
          )}
        </span>
      </div>

      {/* Deretan lampu. Garis rambut di atas dan di bawah, bukan kotak: pembatas
          di dalam sebuah permukaan adalah garis, bukan bayangan. */}
      <div
        role="img"
        aria-label={
          known
            ? `Status lintasan ${status}${rainMmH !== null ? `, hujan tertinggi ${rainMmH.toFixed(1)} milimeter per jam` : ""}`
            : "Status lintasan belum dinilai"
        }
        className="mt-1.5 grid grid-cols-3 border-y border-hairline"
      >
        {LEVELS.map((level, i) => {
          const lit = i === activeIndex;
          return (
            <span
              key={level}
              data-level={i}
              style={
                {
                  "--lamp": LEVEL_INK[level],
                  "--lamp-lift": 0,
                } as React.CSSProperties
              }
              className={[
                "relative flex items-center justify-center py-1.5 text-3xs font-medium uppercase tracking-caps transition-colors duration-200 ease-out",
                i > 0 ? "border-l border-hairline" : "",
                /* `text-text-dim`, bukan `text-text-dim/0`. Yang kedua adalah
                   pengubah alfa di atas token yang ditulis sebagai `var()`
                   biasa, bukan kanal RGB — kelasnya menghasilkan CSS tidak sah
                   dan hilang tanpa peringatan, sehingga lampu yang PADAM
                   tergambar bertinta penuh dan tidak bisa dibedakan dari yang
                   menyala. Persis jebakan Aturan Kanal Alfa di DESIGN.md. */
                lit ? "text-text" : "text-text-dim",
              ].join(" ")}
            >
              {/* Isian lampu. Alfanya dinaikkan sedikit oleh --lamp-lift saat
                  tingkatnya baru berpindah, lalu kembali ke nilai tenangnya. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out"
                style={{
                  background: lit
                    ? "color-mix(in srgb, var(--lamp) 14%, transparent)"
                    : "transparent",
                  opacity: lit ? 1 : 0,
                }}
              />
              {/* Garis nyala di dasar slot: penanda posisi, bukan pendar. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] transition-opacity duration-200 ease-out"
                style={{ background: "var(--lamp)", opacity: lit ? 1 : 0 }}
              />
              <span
                className="relative"
                style={{ color: lit ? "var(--lamp)" : undefined }}
              >
                {level}
              </span>
            </span>
          );
        })}
      </div>

      <p className="mt-1.5 text-3xs leading-4 text-text-dim">
        {!known ? (
          "Medan hujan belum tersedia, jadi lintasan ini belum dapat dinilai."
        ) : threshold === null ? (
          <>
            Hujan di sepanjang lintasan di bawah{" "}
            <span className="tnum text-text-mute">15</span> mm/jam.
          </>
        ) : (
          <>
            Hujan di sepanjang lintasan melewati{" "}
            <span className="tnum text-text-mute">{threshold}</span> mm/jam.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * Pemberitahuan untuk keadaan yang menuntut keputusan, seperti "tidak ada
 * lintasan aman".
 *
 * DULU sebuah aturan tebal di tepi atas tanpa isian, dipilih supaya tidak
 * terbaca sebagai kotak `alert-danger` bawaan kerangka kerja. Alasannya masih
 * benar, tapi jawabannya salah: keberatannya adalah pada kotak yang warnanya
 * dipinjam dari palet orang lain, bukan pada kotak itu sendiri. Setelah
 * `components/ui/alert.tsx` ada, kotak pesan konsol ini memakai `--alert` dan
 * `--signal` yang sama dengan lampu di atasnya, jadi keduanya sekeluarga.
 *
 * Yang tersisa dari bentuk lama justru yang merugikan: aturan tepi atas tidak
 * punya ikon, sehingga satu-satunya pembawa artinya adalah warna garis setebal
 * dua piksel — dan itu hilang bagi operator yang tidak bisa membedakan merah
 * dan kuning. Kotak pesannya membawa bentuk ikon DAN kata statusnya.
 *
 * Fungsi ini dipertahankan sebagai nama, bukan sebagai bentuk: kedua pemanggil
 * di `EvacuationPanel` menyebut "SafetyNotice", dan istilah itu menjelaskan
 * maksudnya lebih baik daripada `<Alert type="error">` yang telanjang.
 */
export function SafetyNotice({
  children,
  tone = "alert",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "alert" | "signal";
  className?: string;
}) {
  return (
    <Alert type={tone} label={null} className={className}>
      {children}
    </Alert>
  );
}
