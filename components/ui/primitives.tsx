import type { ReactNode } from "react";

/* ============================================================================
 * Kosakata dasar antarmuka. Semua komponen lain dibangun dari sini supaya
 * tipografi, radius, jarak, dan satuan tidak pernah ditulis dua versi.
 *
 * Bahasa bentuknya dua aturan saja:
 *   - wadah isi  → sudut besar (16 sampai 22 px), `card` / `card-inset`
 *   - pemicu     → sudut penuh (pil), `Chip` / `ConsoleButton` / `Pill`
 * Kontras antara wadah bersudut besar dan pemicu berbentuk pil inilah yang
 * memberi tampilan SaaS pada konsol ini.
 * ==========================================================================*/

/**
 * Nada warna yang boleh dipakai komponen.
 *
 * `violet` sudah dihapus. Warna itu sempat berarti "kontrol ini aktif" di
 * tombol sekaligus "ini sebuah pengukuran" di radar, pengukur, dan batang
 * waktu — dan warna yang berarti dua hal tidak mengajari operator apa pun.
 * Yang tersisa hanya nada yang punya satu arti: `signal` untuk besaran yang
 * diukur radio, `rain` untuk besaran cuaca yang disimpulkan darinya, `alert`
 * dan `ok` untuk status.
 */
export type Tone = "default" | "mute" | "dim" | "signal" | "rain" | "alert" | "ok";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-text",
  mute: "text-text-mute",
  dim: "text-text-dim",
  signal: "text-signal-text",
  rain: "text-rain-text",
  alert: "text-alert-text",
  ok: "text-ok-text",
};

const TONE_SOLID: Record<Tone, string> = {
  default: "bg-text",
  mute: "bg-text-mute",
  dim: "bg-text-dim",
  signal: "bg-signal",
  rain: "bg-rain",
  alert: "bg-alert",
  ok: "bg-ok",
};

const TONE_GLOW: Record<Tone, string> = {
  default: "",
  mute: "",
  dim: "",
  signal: "glow-signal",
  rain: "glow-rain",
  alert: "glow-alert",
  ok: "glow-ok",
};

/** Label bagian: huruf kapital kecil, jarak huruf renggang. */
export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-3xs font-medium uppercase tracking-caps text-text-mute ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Angka dengan satuannya. Satu-satunya cara menulis angka di konsol ini:
 * satuan selalu ikut, digit selalu berlebar tetap.
 */
export function Num({
  value,
  unit,
  decimals = 1,
  tone = "default",
  className = "",
  unitClassName = "",
  placeholder = "—",
}: {
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  tone?: Tone;
  className?: string;
  unitClassName?: string;
  placeholder?: string;
}) {
  const shown =
    value === null || value === undefined || !Number.isFinite(value)
      ? placeholder
      : value.toFixed(decimals);
  return (
    <span className={`tnum ${TONE_TEXT[tone]} ${className}`}>
      {shown}
      {unit ? (
        <span className={`ml-1 font-sans text-text-dim ${unitClassName}`}>{unit}</span>
      ) : null}
    </span>
  );
}

/**
 * Angka utama sebuah kartu. Tipis dan besar, satuannya kecil di sebelahnya —
 * bentuk yang dipakai laporan, bukan bentuk yang dipakai tabel.
 */
export function Figure({
  value,
  unit,
  decimals = 2,
  tone = "default",
  size = "md",
  placeholder = "—",
}: {
  value: number | null | undefined;
  unit?: string;
  decimals?: number;
  tone?: Tone;
  size?: "sm" | "md" | "lg" | "xl";
  placeholder?: string;
}) {
  const SIZE = {
    sm: "text-2xl",
    md: "text-3xl",
    lg: "text-4xl",
    xl: "text-5xl",
  }[size];
  const shown =
    value === null || value === undefined || !Number.isFinite(value)
      ? placeholder
      : value.toFixed(decimals);
  return (
    <span className={`figure ${SIZE} ${TONE_TEXT[tone]}`}>
      {shown}
      {unit ? (
        <span className="ml-2 font-sans text-2xs font-normal tracking-normal text-text-dim">
          {unit}
        </span>
      ) : null}
    </span>
  );
}

/** Baris label-nilai untuk daftar metadata padat. */
export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <SectionLabel>{label}</SectionLabel>
      <span className="text-2xs">{children}</span>
    </div>
  );
}

/**
 * Titik status. Warna tidak pernah menjadi satu-satunya pembawa arti:
 * setiap pemakainya menuliskan juga statusnya sebagai teks.
 */
export function StatusDot({
  tone,
  glow = true,
  className = "",
}: {
  tone: Tone;
  glow?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${TONE_SOLID[tone]} ${
        glow ? TONE_GLOW[tone] : ""
      } ${className}`}
    />
  );
}

/** Pil kecil berisi teks. Dipakai untuk status, kategori, dan penanda. */
export function Chip({
  tone = "mute",
  children,
  className = "",
  dot = false,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const RING: Record<Tone, string> = {
    default: "border-border-strong",
    mute: "border-border",
    dim: "border-border",
    signal: "border-signal/35 bg-signal/8",
    rain: "border-rain/35 bg-rain/8",
    alert: "border-alert/40 bg-alert/10",
    ok: "border-ok/35 bg-ok/8",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-3xs font-medium uppercase tracking-label ${RING[tone]} ${TONE_TEXT[tone]} ${className}`}
    >
      {dot ? <StatusDot tone={tone} glow={false} className="h-1 w-1" /> : null}
      {children}
    </span>
  );
}

/**
 * Tanda tanya kecil di ujung baris, seperti pada kartu laporan.
 * Judulnya nyata (atribut `title`), bukan hiasan: setiap istilah teknis di
 * konsol ini harus bisa dijelaskan di tempat.
 */
export function HelpDot({ hint }: { hint: string }) {
  return (
    <span
      title={hint}
      aria-label={hint}
      role="img"
      className="inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full border border-border text-3xs font-semibold leading-none text-text-dim transition-colors duration-150 hover:border-border-strong hover:text-text-mute"
    >
      ?
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Kartu
--------------------------------------------------------------------------- */

/**
 * Kartu: satuan tata letak utama. `title` dan `aside` membentuk kepala kartu;
 * tanpa keduanya kartu jadi wadah kosong yang isinya mengatur dirinya sendiri.
 */
export function Card({
  title,
  hint,
  aside,
  children,
  className = "",
  bodyClassName = "",
  scroll = false,
}: {
  title?: ReactNode;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  scroll?: boolean;
}) {
  return (
    <section className={`card flex min-h-0 min-w-0 flex-col ${className}`}>
      {title ? (
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
          <span className="flex min-w-0 items-center gap-2">
            {typeof title === "string" ? <SectionLabel>{title}</SectionLabel> : title}
            {hint ? <HelpDot hint={hint} /> : null}
          </span>
          {aside}
        </header>
      ) : null}
      <div
        className={`min-h-0 flex-1 ${scroll ? "overflow-y-auto" : ""} ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Panel: kartu yang mengisi satu wilayah konsol dan punya garis pemisah di
 * bawah kepalanya. Bentuk yang dipakai panel kanan dan panggung peta.
 */
export function Panel({
  title,
  aside,
  children,
  className = "",
  bodyClassName = "",
  scroll = false,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  scroll?: boolean;
}) {
  return (
    <section
      className={`card flex min-h-0 min-w-0 flex-col overflow-hidden ${className}`}
    >
      {title ? (
        <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
          <SectionLabel>{title}</SectionLabel>
          {aside}
        </header>
      ) : null}
      <div className={`min-h-0 flex-1 ${scroll ? "overflow-y-auto" : ""} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

/** Keadaan kosong dibuat serius, bukan lelucon. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-dim"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" focusable="false">
          <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M6 3.5v3.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <circle cx="6" cy="8.8" r="0.6" fill="currentColor" />
        </svg>
      </span>
      <p className="text-2xs uppercase tracking-label text-text-mute">{title}</p>
      {hint ? <p className="max-w-[36ch] text-2xs leading-5 text-text-dim">{hint}</p> : null}
    </div>
  );
}

/**
 * Penanda DATA SIMULASI. Wajib terlihat di setiap tampilan yang memakai data
 * simulasi (bagian 9 PRD, kejujuran data). Dibuat seperti label instrumen.
 */
export function SimulationBadge({
  className = "",
  detail,
}: {
  className?: string;
  detail?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-signal/45 bg-signal/10 py-1 pl-2 pr-3 text-3xs font-medium uppercase tracking-caps text-signal-text ${className}`}
    >
      <StatusDot tone="signal" className="h-1.5 w-1.5" />
      Data Simulasi
      {detail ? (
        <span className="border-l border-signal/30 pl-2 normal-case tracking-normal text-text-mute">
          {detail}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Tombol: pil. Keadaan aktif memakai tinta, bukan warna aksen.
 *
 * Sebelumnya keadaan aktif memakai --violet supaya tidak bertabrakan dengan
 * --signal dan --rain. Itu memecahkan tabrakan dengan cara menambah warna
 * keempat, yang lalu bocor ke radar dan pengukur sampai ikut berarti "data".
 * Tinta menyelesaikannya tanpa warna baru: "sedang aktif" adalah keadaan
 * perkakas, bukan besaran yang diukur, jadi ia memang tidak boleh berwarna.
 */
export function ConsoleButton({
  active = false,
  disabled = false,
  onClick,
  title,
  children,
  className = "",
  variant = "ghost",
  indicator = false,
  ...rest
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  variant?: "ghost" | "solid" | "danger";
  /**
   * Tombol berada di dalam deret yang punya penanda aktif meluncur sendiri.
   * Isian tinta keadaan aktif dimatikan supaya tidak ada dua isian yang saling
   * menimpa saat penanda sedang bergerak; yang tersisa hanya warna hurufnya.
   */
  indicator?: boolean;
} & React.HTMLAttributes<HTMLButtonElement>) {
  const look =
    variant === "solid"
      ? "border-transparent bg-text text-surface hover:bg-text/90"
      : variant === "danger"
        ? "border-alert/45 bg-alert/10 text-alert-text hover:border-alert/70 hover:bg-alert/16"
        : indicator
          ? active
            ? "border-transparent bg-transparent text-surface"
            : "border-transparent bg-transparent text-text-mute hover:text-text"
          : active
            ? "border-transparent bg-text text-surface shadow-pill"
            : "border-border bg-surface text-text-mute hover:border-border-strong hover:bg-surface-2 hover:text-text";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      {...rest}
      className={`metal-edge inline-flex h-7 items-center justify-center gap-1 rounded-full border px-3 text-3xs font-medium uppercase tracking-label transition-colors duration-150 ease-out ${look} disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

/** Tombol ikon bulat untuk bilah atas. */
export function IconButton({
  label,
  onClick,
  active = false,
  children,
  className = "",
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`metal-edge inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ease-out ${
        active
          ? "border-transparent bg-text text-surface"
          : "border-border bg-surface text-text-mute hover:border-border-strong hover:bg-surface-2 hover:text-text"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Meter gradien: rendah → tinggi dengan penunjuk.
   Dipakai kartu skor rekonstruksi dan kartu akumulasi DAS, jadi kedua kartu
   itu tidak bisa memakai skala yang berbeda tanpa mengubah berkas ini.
--------------------------------------------------------------------------- */
export function GradientMeter({
  ratio,
  ticks,
  ariaLabel,
}: {
  /** 0..1, posisi penunjuk. */
  ratio: number;
  /** Label di bawah batang, dari kiri ke kanan. */
  ticks?: string[];
  ariaLabel?: string;
}) {
  const pos = Math.min(1, Math.max(0, ratio));
  return (
    <div>
      <div
        role="img"
        aria-label={ariaLabel}
        className="relative h-2 w-full rounded-full"
        style={{
          background:
            "linear-gradient(to right, var(--scale-low) 0%, var(--scale-mid) 52%, var(--scale-high) 100%)",
        }}
      >
        <span
          aria-hidden
          className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text"
          style={{
            left: `${pos * 100}%`,
            boxShadow: "0 0 0 2px var(--surface)",
          }}
        />
      </div>
      {ticks?.length ? (
        <div className="mt-1.5 flex justify-between">
          {ticks.map((t) => (
            <span key={t} className="text-3xs uppercase tracking-label text-text-dim">
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Batang kemajuan tipis satu warna, untuk baris daftar padat. */
export function Bar({
  ratio,
  tone = "rain",
  className = "",
}: {
  ratio: number;
  tone?: Tone;
  className?: string;
}) {
  const pos = Math.min(1, Math.max(0, ratio));
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-text/[0.10] ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-200 ease-out ${TONE_SOLID[tone]}`}
        style={{ width: `${pos * 100}%` }}
      />
    </div>
  );
}
