"use client";

import { useEffect, useRef, useState } from "react";
import type { CatchmentState } from "@/lib/types";
import type { AlertRecord } from "@/lib/alerts/types";
import { OPERATOR, type AlertDecision } from "@/components/alerts/useCatchmentAlerts";
import {
  Chip,
  ConsoleButton,
  EmptyState,
  SectionLabel,
  StatusDot,
} from "@/components/ui/primitives";
import Alert from "@/components/ui/alert";
import { formatClock } from "@/components/ui/TopBar";

/* ============================================================================
 * Antrean kandidat peringatan — satu-satunya jalan sebuah peringatan bisa
 * terbit, dan jalan itu selalu melewati manusia.
 *
 * Dipakai di dua tempat (panel operasi dan kartu laporan), jadi komponennya
 * berdiri sendiri di berkas ini. Dengan begitu tidak mungkin ada dua versi
 * aturan konfirmasi yang berbeda di dalam satu aplikasi.
 *
 * Kandidatnya kini `AlertRecord` dari SQLite, bukan lagi `AlertCandidate` yang
 * dihitung di peramban. `AlertRecord` adalah superset, jadi yang benar benar
 * baru hanya `level`: sejak keputusan operator pindah ke server, antrean memuat
 * kandidat waspada DAN siaga, sementara jalur memori dulu hanya melahirkan
 * siaga. Tanpa tingkat yang tertulis, dua kartu dengan angka berbeda akan
 * terlihat seperti dua peringatan yang sama beratnya.
 * ==========================================================================*/

export { OPERATOR };

function ConfirmDialog({
  candidate,
  catchmentName,
  onCancel,
  onConfirm,
}: {
  candidate: AlertRecord | null;
  catchmentName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (candidate && !el.open) el.showModal();
    if (!candidate && el.open) el.close();
  }, [candidate]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="card w-[440px] max-w-[calc(100vw-32px)] p-0 text-text shadow-float backdrop:bg-text/35 backdrop:backdrop-blur-sm"
    >
      {candidate ? (
        <div>
          <header className="flex items-center gap-2 border-b border-hairline px-5 py-4">
            <StatusDot tone="alert" />
            <SectionLabel>Konfirmasi Penerbitan Peringatan</SectionLabel>
          </header>
          <div className="px-5 py-4">
            <p className="text-2xs leading-5 text-text">
              Terbitkan peringatan{" "}
              <span className="uppercase tracking-label text-alert-text">{candidate.level}</span>{" "}
              untuk <span className="text-signal-text">{catchmentName}</span>? Akumulasi{" "}
              <span className="tnum text-alert-text">{candidate.accumMm.toFixed(1)}</span> mm telah
              melewati ambang <span className="tnum">{candidate.thresholdMm.toFixed(1)}</span> mm.
            </p>
            <p className="mt-3 text-3xs leading-5 text-text-dim">
              Tindakan ini tercatat atas nama {OPERATOR}. Sistem tidak menerbitkan peringatan tanpa
              langkah ini.
            </p>
          </div>
          <footer className="flex justify-end gap-2 border-t border-hairline px-5 py-4">
            <ConsoleButton onClick={onCancel}>Batal</ConsoleButton>
            <ConsoleButton variant="solid" onClick={onConfirm}>
              Ya, terbitkan
            </ConsoleButton>
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}

export interface AlertQueueProps {
  catchments: CatchmentState[];
  candidates: AlertRecord[];
  decisions: Record<string, AlertDecision>;
  onDecide: (id: string, status: "dikonfirmasi" | "diabaikan", by: string) => void;
  /** Id kandidat yang keputusannya sedang ditulis ke basis data, kalau ada. */
  deciding?: string | null;
  /** Galat penulisan keputusan terakhir. */
  decideError?: string | null;
  /** Ringkas: tanpa riwayat, untuk kartu laporan yang ruangnya lebih sempit. */
  compact?: boolean;
}

export default function AlertQueue({
  catchments,
  candidates,
  decisions,
  onDecide,
  deciding = null,
  decideError = null,
  compact = false,
}: AlertQueueProps) {
  const [pendingConfirm, setPendingConfirm] = useState<AlertRecord | null>(null);

  const nameOf = (catchmentId: string) =>
    catchments.find((c) => c.id === catchmentId)?.name ?? catchmentId;

  const queue = candidates.filter((c) => !decisions[c.id]);
  const history = candidates.filter((c) => decisions[c.id]);

  if (queue.length === 0 && history.length === 0) {
    return (
      <EmptyState
        title="Tidak ada kandidat peringatan"
        hint="Kandidat muncul otomatis ketika akumulasi satu DAS melewati ambangnya. Penerbitannya tetap menunggu konfirmasi operator."
      />
    );
  }

  return (
    <>
      {/* Daftar kandidat yang menggulir sendiri, bukan panel yang memanjang.
          Sejak antrean memuat waspada dan siaga sekaligus, kandidatnya bisa
          menumpuk sampai lima di akhir kejadian. Terukur pada 1440x900: blok DAS
          membengkak jadi 791px sementara rel kanan hanya setinggi 722px, dan yang
          pertama terdorong ke bawah lipatan justru baris tata kelola "sistem
          tidak pernah menyiarkan peringatan sendiri" — kalimat yang sengaja
          dipasang permanen supaya tidak bisa tergulir lepas dari antreannya.
          Batas tinggi ini mengembalikan janji itu: yang menggulir daftarnya,
          bukan panelnya. Mode ringkas kartu laporan tidak dibatasi, karena di
          sana riwayat memang tidak ditampilkan dan daftarnya selalu pendek. */}
      <ul
        className={`flex flex-col gap-2 ${
          compact ? "" : "max-h-[256px] overflow-y-auto pr-1"
        }`}
      >
        {queue.map((a) => {
          /* Kandidat siaga ditandai merah, waspada kuning. Tanpa pembedaan ini
             dua tingkat yang berbeda beratnya akan terlihat sama mendesak. */
          const tone = a.level === "siaga" ? "alert" : "signal";
          const busy = deciding === a.id;
          return (
            <li key={a.id} className="card-inset px-3 py-2.5">
              {/* Tingkat dibawa keping di baris nama, BUKAN di baris angka.
                  Baris angka sudah memikul dua tombol, dan pada rel 380px keping
                  di sana mendorong "Abaikan" keluar dari tepi panel. Keping ini
                  sekaligus menggantikan titik status yang dulu berdiri di sini:
                  keduanya mengkodekan hal yang sama, dan yang berhuruf menang
                  karena tingkatnya terbaca, bukan cuma terwarnai. */}
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Chip tone={tone}>{a.level}</Chip>
                  <span className="truncate text-2xs text-text">{nameOf(a.catchmentId)}</span>
                </span>
                <span className="tnum shrink-0 text-3xs text-text-dim">
                  T+{formatClock(a.raisedAt)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-3xs text-text-mute">
                  <span className="tnum text-alert-text">{a.accumMm.toFixed(1)}</span> /{" "}
                  <span className="tnum">{a.thresholdMm.toFixed(1)}</span> mm
                </span>
                <span className="flex shrink-0 gap-2">
                  <ConsoleButton
                    variant="danger"
                    disabled={busy}
                    onClick={() => setPendingConfirm(a)}
                  >
                    Konfirmasi
                  </ConsoleButton>
                  <ConsoleButton
                    disabled={busy}
                    onClick={() => onDecide(a.id, "diabaikan", OPERATOR)}
                  >
                    Abaikan
                  </ConsoleButton>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Keputusan sekarang menempuh perjalanan ke basis data, jadi kegagalannya
          harus terlihat. Diam diam gagal berarti operator mengira sudah
          memutuskan sesuatu yang sebenarnya tidak tercatat. */}
      {decideError ? (
        <Alert
          type="error"
          dense
          label="Tidak tersimpan"
          message={decideError}
          className="mt-2"
        />
      ) : null}

      {history.length > 0 && !compact ? (
        <div className="mt-3">
          <SectionLabel className="px-1">Riwayat</SectionLabel>
          <ul className="mt-1.5 flex flex-col gap-1">
            {history.map((a) => {
              const d = decisions[a.id];
              const confirmed = d.status === "dikonfirmasi";
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-full px-3 py-1.5 odd:bg-text/[0.04]"
                >
                  <span className="min-w-0 truncate text-2xs text-text-mute">
                    {nameOf(a.catchmentId)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Chip tone={confirmed ? "ok" : "dim"}>{d.status}</Chip>
                    {confirmed && d.confirmedBy ? (
                      <span className="text-3xs text-text-dim">{d.confirmedBy}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {history.length > 0 && compact ? (
        <p className="mt-2 px-1 text-3xs text-text-dim">
          <span className="tnum">{history.length}</span> kandidat sudah diputuskan — lihat riwayat
          di panel operasi.
        </p>
      ) : null}

      <ConfirmDialog
        candidate={pendingConfirm}
        catchmentName={pendingConfirm ? nameOf(pendingConfirm.catchmentId) : ""}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          if (pendingConfirm) onDecide(pendingConfirm.id, "dikonfirmasi", OPERATOR);
          setPendingConfirm(null);
        }}
      />
    </>
  );
}
