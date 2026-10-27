"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/* ============================================================================
 * Kartu berlapis dengan grafik yang membuka saat disorot.
 *
 * Bentuknya diambil dari komponen shadcn "animated card": kartu dengan bidang
 * visual 180px di atas dan badan teks di bawah, berisi lapisan grid, gradien
 * radial, batang data, keping nilai, dan sebuah keterangan yang naik dari
 * bawah ketika kartu disorot.
 *
 * TIGA HAL DIUBAH DARI ASLINYA, DAN SEMUANYA PUNYA ALASAN:
 *
 * 1. Warnanya tidak lagi violet. Aslinya memakai #8b5cf6, sedangkan DESIGN.md
 *    berkas ini menyatakan `--violet` dihapus dan tidak boleh kembali — dulu
 *    ia berarti "kontrol aktif" sekaligus "ini data", lalu bocor ke radar dan
 *    pengukur. Warna di sini diambil dari token yang sudah ada (`rain`,
 *    `signal`, `alert`, `ok`), jadi tidak ada rona baru yang masuk.
 *
 * 2. Batangnya bukan angka karangan. Aslinya memuat 14 batang dengan tinggi
 *    yang ditulis tangan, ditambah keping "+15,2%" dan "+18,7%" yang tidak
 *    dihitung dari apa pun. Di produk yang seluruh nilai jualnya adalah berani
 *    menampilkan galat karena tahu kebenarannya, grafik hiasan tanpa makna di
 *    panggung yang dinilai juri adalah kewajiban yang tidak perlu. Batang di
 *    sini membaca `series`, dan kepingnya membaca nilai nyata kartunya.
 *
 * 3. Lebarnya tidak dipatok 356px dan kelas `dark:` dibuang. Kartu laporan
 *    hidup di dalam grid lebar berubah, dan konsol ini hanya punya mode terang
 *    — dipilih dari ruangannya, bukan dari kebiasaan kategori.
 *
 * Batangnya digambar sebagai elemen, bukan SVG, supaya ikut melar mengikuti
 * lebar kolom. SVG berlebar tetap akan terpotong atau gepeng di grid ini.
 * ========================================================================== */

/* ---------------------------------------------------------------------------
   Rangka kartu
--------------------------------------------------------------------------- */

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export function AnimatedCard({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "group/animated-card card relative flex min-h-0 min-w-0 flex-col overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

export function CardVisual({ className, ...props }: DivProps) {
  return <div className={cn("relative h-[180px] w-full overflow-hidden", className)} {...props} />;
}

export function CardBody({ className, ...props }: DivProps) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 border-t border-hairline p-4", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("title-tight text-sm font-bold leading-5 text-text", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-2xs leading-4 text-text-dim", className)} {...props} />;
}

/* ---------------------------------------------------------------------------
   Visual
--------------------------------------------------------------------------- */

export type VisualAccent = "rain" | "signal" | "alert" | "ok";

/** Keping nilai di sudut kiri atas. Isinya angka nyata, bukan persentase hias. */
export interface VisualChip {
  /** Sudah diformat lengkap dengan satuannya, mis. "9.28 mm/jam". */
  value: string;
  /** Nama besaran, dibaca pembaca layar dan muncul di atribut title. */
  label: string;
  accent?: VisualAccent;
}

export interface VisualProps {
  /** Nilai mentah yang digambar sebagai batang. Kosong berarti belum ada data. */
  series: number[];
  /** Judul yang muncul di keterangan saat kartu disorot. */
  seriesLabel: string;
  /** Baris kedua keterangan: rentang, satuan, atau batas keberlakuannya. */
  seriesDetail?: string;
  chips?: VisualChip[];
  accent?: VisualAccent;
  /** Ditulis di tengah bidang ketika `series` kosong. */
  emptyLabel?: string;
  /** Jumlah batang. Deret yang lebih panjang diringkas dengan rata rata. */
  bars?: number;
}

const ACCENT_VAR: Record<VisualAccent, string> = {
  rain: "--rain-rgb",
  signal: "--signal-rgb",
  alert: "--alert-rgb",
  ok: "--ok-rgb",
};

/**
 * Ringkas deret apa pun menjadi `bars` nilai dengan rata rata per keranjang.
 * Memakai rata rata, bukan pengambilan tiap-n, supaya puncak sesaat tidak
 * hilang hanya karena kebetulan jatuh di antara dua titik yang diambil.
 */
function bucket(series: number[], bars: number): number[] {
  if (series.length === 0) return [];
  if (series.length <= bars) return series.slice();

  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * series.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * series.length) / bars));
    let sum = 0;
    for (let j = from; j < to; j++) sum += series[j];
    out.push(sum / (to - from));
  }
  return out;
}

export function Visual({
  series,
  seriesLabel,
  seriesDetail,
  chips = [],
  accent = "rain",
  emptyLabel = "Belum ada data untuk digambar",
  bars = 14,
}: VisualProps) {
  const [hovered, setHovered] = useState(false);
  const accentVar = ACCENT_VAR[accent];

  const values = useMemo(() => bucket(series, bars), [series, bars]);
  const max = useMemo(() => values.reduce((a, b) => Math.max(a, b), 0), [values]);

  return (
    <div
      className="absolute inset-0"
      style={{ "--accent": `var(${accentVar})` } as React.CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* --- kisi, paling bawah --- */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(var(--text-rgb) / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--text-rgb) / 0.06) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          backgroundPosition: "center",
          maskImage:
            /* Stensil alfa, bukan warna yang terlihat: yang dipakai mask hanya
               kanal alfanya. Ditulis dengan token supaya tidak ada nilai warna
               harfiah yang menyelinap masuk ke berkas ini. */
            "radial-gradient(ellipse 50% 50% at 50% 50%, rgb(var(--text-rgb)) 60%, transparent 100%)",
          WebkitMaskImage:
            /* Stensil alfa, bukan warna yang terlihat: yang dipakai mask hanya
               kanal alfanya. Ditulis dengan token supaya tidak ada nilai warna
               harfiah yang menyelinap masuk ke berkas ini. */
            "radial-gradient(ellipse 50% 50% at 50% 50%, rgb(var(--text-rgb)) 60%, transparent 100%)",
        }}
      />

      {/* --- pendar radial, menguat saat disorot --- */}
      <div
        className="pointer-events-none absolute inset-0 z-[2] transition-opacity duration-500 ease-out"
        style={{
          background:
            "radial-gradient(ellipse 55% 55% at 50% 55%, rgb(var(--accent) / 0.20), transparent 70%)",
          opacity: hovered ? 1 : 0.55,
        }}
      />

      {/* --- batang data --- */}
      {values.length === 0 ? (
        <div className="absolute inset-0 z-[3] flex items-center justify-center px-6">
          <p className="max-w-[30ch] text-center text-3xs leading-4 text-text-dim">{emptyLabel}</p>
        </div>
      ) : (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 z-[3] flex h-[132px] items-end gap-[3px] px-4 pb-4"
        >
          {values.map((v, i) => {
            /* Tinggi selalu memetakan nilai yang sama. Yang berubah saat
               disorot hanyalah skalanya: saat diam batang ditekan menjadi
               siluet, saat disorot ia dibuka penuh. Datanya tidak pernah
               berganti bentuk — hanya penekanannya. */
            const ratio = max > 0 ? v / max : 0;
            const height = 6 + ratio * (hovered ? 104 : 44);
            return (
              <span
                key={i}
                className="flex-1 rounded-sm transition-all duration-500 ease-out"
                style={{
                  height: `${height}px`,
                  backgroundColor: hovered
                    ? `rgb(var(--accent) / ${0.35 + ratio * 0.55})`
                    : "rgb(var(--text-rgb) / 0.14)",
                }}
              />
            );
          })}
        </div>
      )}

      {/* --- sapuan naik dari dasar saat disorot --- */}
      <div
        className="pointer-events-none absolute inset-0 z-[4] transition-opacity duration-500 ease-out"
        style={{
          background: "linear-gradient(to top, rgb(var(--accent) / 0.22), transparent 55%)",
          opacity: hovered ? 1 : 0,
        }}
      />

      {/* --- keping nilai, menepi saat keterangan muncul --- */}
      {chips.length > 0 ? (
        <div className="absolute left-4 top-4 z-[6] flex flex-wrap items-center gap-1.5 transition-opacity duration-300 ease-out group-hover/animated-card:opacity-0">
          {chips.map((chip) => (
            <span
              key={chip.label}
              title={chip.label}
              /* Latarnya ditulis lewat `style`, bukan `bg-surface/80`.
                 `--surface` adalah string `var()` biasa, bukan kanal RGB, jadi
                 pengubah alfa di atasnya menghasilkan CSS tidak sah yang hilang
                 tanpa peringatan — persis jebakan yang ditulis Aturan Kanal
                 Alfa di DESIGN.md. Tanpa `backdrop-blur` juga, karena `.glass`
                 hanya boleh di atas kanvas peta. */
              style={{ backgroundColor: "rgb(255 255 255 / 0.86)" }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: `rgb(var(${ACCENT_VAR[chip.accent ?? accent]}) / 1)`,
                }}
              />
              <span className="tnum text-3xs text-text">{chip.value}</span>
              <span className="sr-only">{chip.label}</span>
            </span>
          ))}
        </div>
      ) : null}

      {/* --- keterangan, naik dari bawah --- */}
      <div className="pointer-events-none absolute inset-0 z-[7] flex translate-y-3 items-start justify-center p-4 opacity-0 transition-all duration-500 ease-out group-hover/animated-card:translate-y-0 group-hover/animated-card:opacity-100">
        <div
          style={{ backgroundColor: "rgb(255 255 255 / 0.90)" }}
          className="max-w-[34ch] rounded-lg border border-border px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: "rgb(var(--accent) / 1)" }}
            />
            <p className="text-2xs font-medium leading-4 text-text">{seriesLabel}</p>
          </div>
          {seriesDetail ? (
            <p className="mt-0.5 text-3xs leading-4 text-text-dim">{seriesDetail}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
