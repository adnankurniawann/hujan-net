"use client";

import { useEffect, useRef } from "react";
import { ConsoleButton, IconButton, SectionLabel, SimulationBadge } from "./primitives";
import { moveTabIndicator } from "./motion";
import type { StageView } from "@/components/store";

/** mm:ss, selalu dua digit. Format jam simulasi di seluruh konsol. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Tanda pengenal: dua menara, satu tautan di antaranya, hujan memotong tautan.
 * Ini seluruh tesis produk dalam 22 piksel, bukan hiasan.
 */
function Mark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2">
      <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden focusable="false">
        <path
          d="M3 13.5V6M15 13.5V6"
          stroke="var(--text-mute)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path d="M3 6h12" stroke="var(--signal)" strokeWidth="1.6" strokeLinecap="round" />
        <path
          d="M6 9.5l-1 3M9 9.5l-1 3M12 9.5l-1 3"
          stroke="var(--rain)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/* Batang mini kemajuan kejadian dihapus dari sini. Kemajuan waktu sudah
   ditulis tiga kali di layar yang sama — jam T+, durasi total, dan penggeser
   di bilah bawah — dan tingginya dihitung `6 + i * 1.6` px, yang menghasilkan
   7,6 / 9,2 / 10,8 px di konsol yang aturannya kelipatan 4 px. Penanda yang
   tidak menambah informasi apa pun adalah hiasan, dan hiasan tidak masuk. */

/** Satu blok statistik di dalam pil bilah atas. */
function StatBlock({
  label,
  value,
  unit,
  tone = "text-text",
}: {
  label: string;
  value: string;
  unit: string;
  tone?: string;
}) {
  return (
    <span className="flex items-center gap-1.5 px-2.5">
      <span className="text-3xs text-text-mute">{label}</span>
      <span className={`tnum text-sm ${tone}`}>
        {value}
        <span className="ml-1 font-sans text-3xs text-text-dim">{unit}</span>
      </span>
    </span>
  );
}

function IconBell() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden focusable="false">
      <path
        d="M3.6 9.4V6.3a3.4 3.4 0 0 1 6.8 0v3.1l1 1.4H2.6l1-1.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M5.8 11.4a1.3 1.3 0 0 0 2.4 0" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

/* Urutan panggung mengikuti urutan pemakaian: operator membuka peta, lalu
   membandingkan, lalu membaca laporan. Sebelumnya laporan berdiri paling kiri
   sementara ia bukan lagi panggung awal. */
const STAGES: { id: StageView; label: string }[] = [
  { id: "peta", label: "Peta Operasi" },
  { id: "perbandingan", label: "Perbandingan" },
  { id: "laporan", label: "Laporan" },
];

interface Props {
  t: number;
  durationS: number;
  rmse: number | null;
  agreement: number | null;
  wetLinks: number;
  totalLinks: number;
  pendingAlerts: number;
  stage: StageView;
  onStage: (v: StageView) => void;
  /** Membuka panggung tempat antrean kandidat peringatan berada. */
  onOpenAlerts: () => void;
  showEvacuation?: boolean;
  onToggleEvacuation?: () => void;
}

export default function TopBar({
  t,
  durationS,
  rmse,
  agreement,
  wetLinks,
  totalLinks,
  pendingAlerts,
  stage,
  onStage,
  onOpenAlerts,
  showEvacuation,
  onToggleEvacuation,
}: Props) {
  const tabsRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const settled = useRef(false);

  /* Penanda mengikuti tombol yang aktif. Pemunculan pertama dipindahkan tanpa
     animasi — penanda yang meluncur dari tepi kiri saat halaman dibuka akan
     menganimasikan sesuatu yang tidak sedang berubah. */
  useEffect(() => {
    const nav = tabsRef.current;
    if (!nav) return;

    const apply = (immediate: boolean) => {
      const target = nav.querySelector<HTMLElement>(`[data-stage="${stage}"]`);
      moveTabIndicator(indicatorRef.current, target, immediate);
    };

    apply(!settled.current);
    settled.current = true;

    /* Lebar tombol berubah ketika hurufnya selesai dimuat, jadi penanda harus
       diukur ulang — kalau tidak, ia menempel pada lebar huruf cadangan. */
    const ro = new ResizeObserver(() => apply(true));
    ro.observe(nav);
    return () => ro.disconnect();
  }, [stage]);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 px-4">
      <div className="flex shrink-0 items-center gap-2.5">
        <Mark />
        <span className="title-tight text-sm font-bold">HujanNet</span>
      </div>

      {/* ---- pil statistik: dua angka yang menjadi tesis produk ---- */}
      <div className="pill-group h-10 shrink-0 divide-x divide-hairline px-1">
        {/* `d` adalah nama indeksnya, bukan satuannya — ditulis di label, bukan
            di slot satuan, supaya tidak terbaca "hari". Indeksnya memang tak
            bersatuan, jadi slot satuan dibiarkan kosong. */}
        {/* Nadanya `rain`, bukan `ok`. Nada hijau di sini tetap hijau berapa pun
            nilainya, jadi warnanya menyatakan "bagus" alih-alih melaporkan
            angka — dan indeks 0,41 yang dicat hijau adalah klaim, bukan ukuran.
            Hijau dan merah disimpan untuk status, bukan untuk besaran. */}
        <StatBlock
          label="Indeks kesesuaian d"
          value={agreement === null ? "—" : agreement.toFixed(2)}
          unit=""
          tone="text-rain-text"
        />
        <StatBlock
          label="Galat rekonstruksi"
          value={rmse === null ? "—" : rmse.toFixed(2)}
          unit="mm/jam"
          tone="text-text-muted"
        />
        <StatBlock
          label="Tautan basah"
          value={`${wetLinks}/${totalLinks}`}
          unit=""
          tone="text-signal-text"
        />
      </div>

      {/* Penanda kejujuran data. Selalu terlihat, tidak bisa disembunyikan
          (DASH-2 dan bagian 9 PRD). */}
      <SimulationBadge className="h-10 shrink-0" />

      {/* ---- kanan ---- */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Penanda aktif meluncur di belakang tombol, bukan berkedip pindah.
            Isian tinta tombol aktif karenanya dimatikan (`indicator`) supaya
            tidak ada dua isian yang saling menimpa saat penanda sedang bergerak.

            "Rute Evakuasi" sengaja DI LUAR deret ini: ia sakelar lapisan di atas
            panggung peta, bukan panggung keempat. Menaruhnya di dalam penanda
            yang sama akan mengatakan ia setara dengan ketiganya, padahal ia bisa
            menyala bersamaan dengan panggung peta. */}
        <nav
          ref={tabsRef}
          className="pill-group relative h-10 gap-1 px-1"
          aria-label="Tampilan panggung"
        >
          <span
            ref={indicatorRef}
            aria-hidden
            className="pointer-events-none absolute left-0 top-1 h-8 rounded-full bg-text opacity-0 shadow-pill"
          />
          {STAGES.map((s) => (
            <ConsoleButton
              key={s.id}
              active={stage === s.id}
              indicator
              onClick={() => onStage(s.id)}
              className="relative z-10"
              data-stage={s.id}
            >
              {s.label}
            </ConsoleButton>
          ))}
        </nav>

        {onToggleEvacuation ? (
          <ConsoleButton active={!!showEvacuation} onClick={onToggleEvacuation}>
            Rute Evakuasi
          </ConsoleButton>
        ) : null}

        <div className="pill-group h-10 flex-col items-end px-3 py-1">
          <SectionLabel>Jam Simulasi</SectionLabel>
          <span className="tnum text-2xs text-text">
            T+{formatClock(t)}
            <span className="ml-1 text-text-dim">/ {formatClock(durationS)}</span>
          </span>
        </div>

        {/* Lonceng ini dulu memakai lencana berangka tanpa `onClick` sama
            sekali: kendali mati yang mengundang klik. Sekarang ia membuka
            panggung tempat antreannya berada. */}
        <span className="relative">
          <IconButton
            label={
              pendingAlerts > 0
                ? `Buka antrean: ${pendingAlerts} kandidat peringatan menunggu keputusan`
                : "Tidak ada kandidat peringatan yang menunggu"
            }
            onClick={onOpenAlerts}
          >
            <IconBell />
          </IconButton>
          {pendingAlerts > 0 ? (
            <span
              aria-hidden
              className="tnum absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-surface bg-alert px-1 text-[10px] font-semibold text-surface"
            >
              {pendingAlerts}
            </span>
          ) : null}
        </span>

        {/* Operator ditulis sebagai teks, bukan sebagai avatar akun: tidak ada
            login pada fase ini (Bab 3 PRD), jadi lingkaran berinisial hanya
            menjanjikan sistem akun yang memang tidak akan dibangun. */}
        <span className="hidden flex-col items-end 2xl:flex">
          <SectionLabel>Operator</SectionLabel>
          <span className="text-2xs text-text">BPBD</span>
        </span>
      </div>
    </header>
  );
}
