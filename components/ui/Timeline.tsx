"use client";

import type { PlaybackSpeed } from "@/components/store";
import { ConsoleButton, IconButton, SectionLabel } from "./primitives";
import { formatClock } from "./TopBar";

const SPEEDS: PlaybackSpeed[] = [1, 5, 20];

function IconPlay() {
  return (
    <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden focusable="false">
      <path d="M2.4 1.2l5.6 3.8-5.6 3.8z" fill="currentColor" />
    </svg>
  );
}
function IconPause() {
  return (
    <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden focusable="false">
      <rect x="2.2" y="1.2" width="2" height="7.6" rx="0.8" fill="currentColor" />
      <rect x="5.8" y="1.2" width="2" height="7.6" rx="0.8" fill="currentColor" />
    </svg>
  );
}
function IconReset() {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden focusable="false">
      <path
        d="M5 1.6A3.4 3.4 0 1 1 1.6 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M1.6 2.2v2.9h2.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface Props {
  t: number;
  durationS: number;
  playing: boolean;
  speed: PlaybackSpeed;
  /** Waktu kandidat peringatan muncul, ditandai di atas lintasan penggeser. */
  markers: number[];
  onToggle: () => void;
  onReset: () => void;
  onSeek: (t: number) => void;
  onSpeed: (s: PlaybackSpeed) => void;
}

export default function Timeline({
  t,
  durationS,
  playing,
  speed,
  markers,
  onToggle,
  onReset,
  onSeek,
  onSpeed,
}: Props) {
  const progress = durationS > 0 ? Math.min(1, Math.max(0, t / durationS)) : 0;

  return (
    <div className="card mx-5 mb-4 flex h-14 shrink-0 items-center gap-4 rounded-full px-3">
      <div className="flex shrink-0 items-center gap-1.5">
        <IconButton
          label={playing ? "Jeda" : "Putar"}
          onClick={onToggle}
          active={playing}
          className="h-9 w-9"
        >
          {playing ? <IconPause /> : <IconPlay />}
        </IconButton>
        <IconButton label="Atur ulang ke T+00:00" onClick={onReset} className="h-9 w-9">
          <IconReset />
        </IconButton>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SectionLabel>Kecepatan</SectionLabel>
        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <ConsoleButton key={s} active={speed === s} onClick={() => onSpeed(s)}>
              <span className="tnum">{s}x</span>
            </ConsoleButton>
          ))}
        </div>
      </div>

      <span className="tnum shrink-0 text-sm text-text">
        T+{formatClock(t)}
        <span className="ml-1.5 font-sans text-3xs text-text-dim">/ {formatClock(durationS)}</span>
      </span>

      <div className="relative flex min-w-0 flex-1 items-center">
        {/* Lintasan digambar di sini, bukan oleh input: lihat catatan pada
            `.scrubber` di globals.css. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-text/12"
        />
        {/* Bagian yang sudah dilalui memakai satu warna rata, bukan gradien
            menuju ungu. Batang waktu adalah kendali, bukan data — ia tidak
            perlu meminjam warna apa pun yang punya arti pengukuran. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-text/45"
          style={{ width: `${progress * 100}%` }}
        />
        {/* Penanda saat kandidat peringatan muncul. Diberi keterangan di
            legenda bilah ini, karena garis merah tanpa penjelasan hanya bisa
            dimengerti oleh orang yang sudah diberi tahu artinya. */}
        {markers.map((m) => (
          <span
            key={m}
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-alert"
            style={{ left: `${(m / durationS) * 100}%` }}
          />
        ))}
        <input
          type="range"
          className="scrubber relative"
          min={0}
          max={durationS}
          step={1}
          value={Math.round(t)}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Waktu kejadian"
          aria-valuetext={`T plus ${formatClock(t)}`}
        />
      </div>

      <span className="flex shrink-0 items-center gap-2 pr-2 text-3xs text-text-mute">
        {markers.length > 0 ? (
          <>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-3 w-0.5 rounded-full bg-alert" />
              kandidat peringatan
            </span>
            <span aria-hidden className="text-text-dim">
              ·
            </span>
          </>
        ) : null}
        <span className="text-text-dim">
          <kbd className="tnum">spasi</kbd> putar · <kbd className="tnum">R</kbd> atur ulang
        </span>
      </span>
    </div>
  );
}
