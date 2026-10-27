"use client";

import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { cn } from "@/lib/utils";
import { DUR, EASE_OUT, prefersReducedMotion } from "@/components/ui/motion";

/* ============================================================================
 * Pemberitahuan sebaris: hijau, kuning, merah, biru.
 *
 * Satu-satunya bentuk kotak pesan di konsol ini. Sebelum berkas ini ada, setiap
 * panel menuliskan sendiri resep "garis 40% di atas isian 10%" — antrean
 * peringatan punya versinya, dasbor punya versinya, panel DAS memakai
 * `EmptyState` untuk sesuatu yang sebenarnya galat. Tiga dialek untuk satu
 * maksud, dan tidak ada yang bisa memperbaiki ketiganya sekaligus.
 *
 * WARNANYA TOKEN, BUKAN PALET TAILWIND. `bg-green-100` dan kawan-kawannya
 * dipakai setiap kerangka kerja CSS dan karena itu tidak mengatakan apa pun
 * tentang produk ini; lebih buruk lagi, hijau bawaan Tailwind tidak sewarna
 * dengan `--ok` yang sudah dipakai peta, radar, dan pengukur. Dua hijau di satu
 * layar terbaca sebagai dua arti. Jadi:
 *
 *   sukses     → --ok      hijau   #0d7d64
 *   peringatan → --signal  kuning  #b8720d
 *   bahaya     → --alert   merah   #c33f26
 *   info       → --rain    biru
 *
 * BATASNYA. Warna tidak pernah menjadi satu-satunya pembawa arti. Setiap nada
 * membawa ikon dengan bentuk yang berbeda DAN kata statusnya tertulis, jadi
 * pesan ini tetap terbaca oleh operator yang tidak bisa membedakan merah dan
 * hijau, dan tetap terbaca ketika dicetak hitam putih.
 *
 * KAPAN JANGAN PAKAI INI. Kotak pesan cocok untuk keadaan yang muncul lalu
 * hilang: galat penyimpanan, hasil tindakan, syarat yang belum terpenuhi. Ia
 * TIDAK cocok untuk status yang selalu ada. `SafetyAnnunciator` sengaja bukan
 * kotak pesan karena status lintasan selalu punya nilai, dan skala penuhnya
 * harus terlihat sekaligus.
 * ==========================================================================*/

/** Nada resmi konsol. Sama persis dengan `Tone` di `primitives.tsx`. */
export type AlertTone = "ok" | "signal" | "alert" | "rain";

/**
 * Nama pendek yang lebih terbaca di tempat pemakaian. `type="error"` menjelaskan
 * dirinya sendiri di dalam JSX; `tone="alert"` menuntut pembacanya ingat bahwa
 * `--alert` berarti merah.
 */
export type AlertType = "success" | "warning" | "error" | "info" | AlertTone;

const TONE_OF: Record<AlertType, AlertTone> = {
  success: "ok",
  warning: "signal",
  error: "alert",
  info: "rain",
  ok: "ok",
  signal: "signal",
  alert: "alert",
  rain: "rain",
};

/**
 * Kata status berbahasa Indonesia. Dipakai sebagai label bawaan dan sebagai
 * teks pembuka bagi pembaca layar, sehingga arti nadanya tidak pernah hanya
 * ada di dalam warnanya.
 */
const TONE_WORD: Record<AlertTone, string> = {
  ok: "Aman",
  signal: "Waspada",
  alert: "Bahaya",
  rain: "Info",
};

/* Isian 8 sampai 10 persen dengan tepi 35 sampai 40 persen — angka yang sama
   dengan `Chip`, jadi keping dan kotak pesan bernada sama terlihat sekeluarga.
   Kuning dan hijau diberi isian sedikit lebih tipis daripada merah: pada kertas
   terang keduanya lebih terang sejak awal, dan pada alfa yang sama merah akan
   terlihat lebih pucat daripada dua lainnya. */
const TONE_SKIN: Record<AlertTone, string> = {
  ok: "border-ok/35 bg-ok/8 text-ok-text",
  signal: "border-signal/38 bg-signal/9 text-signal-text",
  alert: "border-alert/40 bg-alert/10 text-alert-text",
  rain: "border-rain/35 bg-rain/8 text-rain-text",
};

/** Warna tepi saat kotaknya bisa diklik dan kursor ada di atasnya. */
const TONE_HOVER: Record<AlertTone, string> = {
  ok: "hover:border-ok/60 hover:bg-ok/12",
  signal: "hover:border-signal/62 hover:bg-signal/13",
  alert: "hover:border-alert/65 hover:bg-alert/14",
  rain: "hover:border-rain/60 hover:bg-rain/12",
};

/**
 * Ikon per nada. BENTUKNYA berbeda, bukan cuma warnanya: centang untuk aman,
 * segitiga untuk waspada, segi delapan untuk bahaya, lingkaran untuk info.
 * Itulah yang membuat pesan ini tetap bisa dibedakan tanpa warna.
 */
function AlertIcon({ tone }: { tone: AlertTone }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 14 14",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
    className: "mt-px shrink-0",
  };

  if (tone === "ok") {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="5.4" />
        <path d="M4.6 7.2 6.3 8.9 9.4 5.3" />
      </svg>
    );
  }
  if (tone === "signal") {
    return (
      <svg {...common}>
        <path d="M7 1.9 12.7 11.8H1.3z" />
        <path d="M7 5.6v2.7" />
        <circle cx="7" cy="10.2" r="0.55" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (tone === "alert") {
    return (
      <svg {...common}>
        <path d="M4.8 1.4h4.4l3.4 3.4v4.4l-3.4 3.4H4.8L1.4 9.2V4.8z" />
        <path d="M7 4.4v3.2" />
        <circle cx="7" cy="9.7" r="0.55" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="7" cy="7" r="5.4" />
      <path d="M7 6.4v3.2" />
      <circle cx="7" cy="4.4" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}

export interface AlertProps {
  /** `success` | `warning` | `error` | `info`, atau nada token langsung. */
  type?: AlertType;
  /**
   * Label tebal di depan pesan. Bawaannya kata status nada tersebut. Beri
   * `null` untuk menghilangkannya ketika pesannya sudah berupa kalimat penuh.
   */
  label?: ReactNode | null;
  /** Isi pesan. `children` menang bila keduanya diisi. */
  message?: ReactNode;
  children?: ReactNode;
  /** Tindakan di ujung kanan, biasanya `ConsoleButton`. */
  action?: ReactNode;
  /** Bila diisi, muncul tombol tutup di ujung kanan. */
  onDismiss?: () => void;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  /** Versi satu baris untuk rel sempit: huruf lebih kecil, jarak lebih rapat. */
  dense?: boolean;
  /**
   * Kotak ini melayang DI ATAS PETA, bukan di dalam sebuah panel.
   *
   * Isian 10 persen bekerja di atas kertas yang polos, dan gagal di atas peta:
   * terukur di panggung operasi, jalan dan label desa terbaca menembus kotak
   * "4 kandidat peringatan menunggu keputusan" sampai kalimatnya harus dieja.
   * Bendera ini menukar isian tembus itu dengan warna yang sama sudah dicampur
   * ke permukaan, jadi hasilnya legap tanpa berubah nada.
   *
   * Ditulis sebagai `style`, bukan kelas. `cn` di proyek ini tidak
   * menyelesaikan tabrakan utilitas Tailwind — menumpuk `bg-surface` di atas
   * `bg-alert/10` akan diputuskan oleh urutan di berkas CSS hasil build, bukan
   * oleh urutan argumen. Gaya sebaris tidak punya keraguan itu.
   */
  overMap?: boolean;
  /**
   * Bahasa isyarat bagi pembaca layar. `assertive` menyela apa pun yang sedang
   * dibacakan — pantas untuk galat yang menghentikan pekerjaan, tidak pantas
   * untuk pemberitahuan biasa. Bawaannya mengikuti nada.
   */
  live?: "off" | "polite" | "assertive";
  className?: string;
}

/**
 * Kotak pesan.
 *
 * GERAKNYA GSAP, bukan pustaka animasi kedua. Kotak ini muncul justru pada saat
 * operator sedang menekan sesuatu — keputusan gagal disimpan, kejadian gagal
 * dimuat — jadi ia harus tahan diinterupsi: `overwrite: "auto"` membatalkan
 * tween lama pada properti yang sama ketika pesannya berganti sebelum animasi
 * masuknya selesai. Alasan panjangnya ada di `components/ui/motion.ts`.
 */
export default function Alert({
  type = "info",
  label,
  message,
  children,
  action,
  onDismiss,
  onClick,
  dense = false,
  overMap = false,
  live,
  className,
}: AlertProps) {
  const tone = TONE_OF[type] ?? "rain";
  const ref = useRef<HTMLDivElement | null>(null);
  const body = children ?? message;

  /* Datang dengan pudar dan buram pendek. Buramnya yang mengerjakan pekerjaan
     sebenarnya: ia membuat kotak ini terbaca sebagai sesuatu yang BARU MUNCUL,
     bukan sesuatu yang sedari tadi ada dan baru terlihat — bedanya penting
     ketika yang muncul adalah galat.
   *
   * DAFTAR KEBERGANTUNGANNYA HANYA `tone`, DAN ITU DISENGAJA. Versi pertama
   * berkas ini ikut menyertakan isi pesannya supaya pesan yang berganti dapat
   * animasi baru. Isi pesan hampir selalu berupa elemen JSX, yaitu objek baru
   * pada SETIAP render — jadi efeknya berjalan ulang setiap kali induknya
   * dirender, dan animasi masuknya dimulai lagi dari `autoAlpha: 0` sebelum
   * yang sebelumnya selesai. Terlihat di dasbor: keping "kandidat peringatan
   * menunggu" berkedip tanpa henti selama pemutaran berjalan, karena jam
   * simulasi merender induknya beberapa kali per detik. Yang hilang cuma
   * animasi ulang saat teks berganti; yang didapat, kotaknya benar-benar
   * terbaca. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    const tween = gsap.fromTo(
      el,
      { autoAlpha: 0, y: 6, filter: "blur(6px)" },
      {
        autoAlpha: 1,
        y: 0,
        filter: "blur(0px)",
        duration: DUR.state,
        ease: EASE_OUT,
        overwrite: "auto",
        clearProps: "transform,opacity,visibility,filter",
      },
    );
    return () => {
      tween.kill();
    };
  }, [tone]);

  const clickable = Boolean(onClick);

  return (
    <div
      ref={ref}
      role={tone === "alert" ? "alert" : "status"}
      aria-live={live ?? (tone === "alert" ? "assertive" : "polite")}
      onClick={onClick}
      style={
        overMap
          ? {
              backgroundColor: `color-mix(in srgb, var(--${tone}) 12%, var(--surface))`,
            }
          : undefined
      }
      className={cn(
        "flex items-start gap-2 rounded-lg border transition-colors duration-150 ease-out",
        dense ? "px-2.5 py-1.5 text-3xs leading-4" : "px-3 py-2.5 text-2xs leading-5",
        TONE_SKIN[tone],
        overMap ? "shadow-card" : "",
        /* Kotaknya tidak membesar dan tidak miring saat disentuh kursor. Itu
           gerak untuk kartu produk, dan kotak yang bergoyang di ruang kendali
           membuat kabar buruk terasa main-main. Yang berubah cuma tepinya, dan
           hanya kalau ia memang bisa diklik. */
        clickable ? `cursor-pointer ${TONE_HOVER[tone]}` : "",
        className,
      )}
    >
      <AlertIcon tone={tone} />

      <span className="min-w-0 flex-1">
        {label !== null ? (
          <span className="font-semibold uppercase tracking-label">
            {label ?? TONE_WORD[tone]}
            {body ? " " : null}
          </span>
        ) : null}
        {body ? <span className="text-text-mute">{body}</span> : null}
      </span>

      {action ? <span className="shrink-0">{action}</span> : null}

      {onDismiss ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Tutup pemberitahuan"
          className="-mr-1 -mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-current opacity-55 transition-opacity duration-150 ease-out hover:opacity-100"
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 9 9"
            aria-hidden
            focusable="false"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          >
            <path d="M1.4 1.4 7.6 7.6M7.6 1.4 1.4 7.6" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
