"use client";

import { useCallback, useEffect, useRef } from "react";
import type gsap from "gsap";
import { playModalIn, playModalOut } from "@/components/ui/motion";
import type { AlertRecord } from "@/lib/alerts/types";
import { mm, mmWhole, windowLabel } from "./format";
import { StatusBadge } from "./StatusBadge";
import Alert from "@/components/ui/alert";

export type DecisionKind = "confirm" | "dismiss";

interface Props {
  kind: DecisionKind;
  alert: AlertRecord;
  operator: string;
  note: string;
  busy: boolean;
  error?: string;
  onOperatorChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const FIELD =
  "w-full bg-bg border border-border rounded-md px-2 py-2 text-xs text-text placeholder:text-text-mute focus:border-signal";

/**
 * Dialog penegasan singkat sebelum keputusan operator tercatat.
 *
 * Kriteria diterima C3 menuntut tombol konfirmasi memunculkan dialog penegasan.
 * Dialog ini juga menjadi tempat nama operator diminta, karena `POST /confirm`
 * dan `POST /dismiss` menolak keputusan tanpa identitas. Itu bukan formalitas:
 * keputusan meneruskan atau tidak meneruskan peringatan harus bisa
 * dipertanggungjawabkan, dan keduanya sama sama dicatat.
 *
 * Latarnya blok warna semi tembus, bukan efek kaca buram, sesuai larangan bagian 6.
 */
export function ConfirmDialog({
  kind,
  alert,
  operator,
  note,
  busy,
  error,
  onOperatorChange,
  onNoteChange,
  onCancel,
  onSubmit,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef<gsap.core.Timeline | null>(null);

  /* Menutup lewat animasi keluar dulu, baru melepas jendelanya — sama persis
     dengan jendela tinjauan rute, karena keduanya pop-out yang sama. Kalau
     penutupannya diinterupsi, timeline dibunuh dan `onCancel` tidak pernah
     berjalan, jadi dialog tidak dilepas di tengah pembukaan berikutnya. */
  const requestCancel = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = playModalOut(backdropRef.current, panelRef.current, onCancel);
    if (!closingRef.current) onCancel();
  }, [onCancel]);

  useEffect(() => {
    /* Fokus lewat onVisible, bukan langsung: animasi masuk menulis
       visibility: hidden pada frame pertama dan .focus() akan gagal diam-diam. */
    const tl = playModalIn(backdropRef.current, panelRef.current, () =>
      inputRef.current?.focus(),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      tl?.kill();
      closingRef.current?.kill();
      closingRef.current = null;
    };
  }, [requestCancel]);

  const isConfirm = kind === "confirm";
  const canSubmit = operator.trim().length > 0 && !busy;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: "color-mix(in srgb, var(--bg) 82%, transparent)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={isConfirm ? "Konfirmasi peringatan" : "Abaikan peringatan"}
        className="w-full max-w-md bg-surface border border-border rounded-md"
      >
        <div className="px-4 pt-4 pb-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-text-mute">
            {isConfirm ? "Konfirmasi peringatan" : "Abaikan peringatan"}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <StatusBadge level={alert.level} />
            <span className="font-mono text-[10px] text-text-mute">{alert.catchmentId}</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-text">
            Akumulasi{" "}
            <span className="font-mono">{mm(alert.accumMm)}</span> melewati ambang{" "}
            <span className="font-mono">{mmWhole(alert.thresholdMm)}</span> pada jendela{" "}
            <span className="font-mono">{windowLabel(alert.windowKey)}</span>.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-text-mute">
            {isConfirm
              ? "Keputusan ini tercatat atas nama operator di bawah. Sistem tetap tidak menyiarkan apa pun ke publik."
              : "Pengabaian juga dicatat lengkap dengan nama dan cap waktu, supaya bisa ditelusuri kemudian."}
          </p>
        </div>

        <div className="h-px bg-border" />

        <div className="px-4 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.12em] text-text-mute">
              Nama operator
            </span>
            <input
              ref={inputRef}
              className={`${FIELD} font-mono`}
              value={operator}
              onChange={(e) => onOperatorChange(e.target.value)}
              placeholder="mis. Adnan, BPBD Kab. Bogor"
              disabled={busy}
            />
          </label>

          {!isConfirm && (
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-text-mute">
                Alasan singkat, opsional
              </span>
              <input
                className={FIELD}
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="mis. hujan lokal, tinggi muka air masih normal"
                disabled={busy}
              />
            </label>
          )}

          {/* Galat penyimpanan berdiri sebagai kotak, bukan sebaris teks merah.
              Satu baris merah di antara dua kolom isian terbaca sebagai catatan
              kaki formulir; yang sebenarnya terjadi adalah keputusan operator
              tidak tercatat sama sekali. */}
          {error && (
            <Alert type="error" dense label="Gagal disimpan">
              {error}
            </Alert>
          )}
        </div>

        <div className="h-px bg-border" />

        <div className="px-4 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={requestCancel}
            disabled={busy}
            className="metal-edge border border-border text-text-mute rounded-md px-3 py-2 text-[11px] uppercase tracking-[0.12em] hover:text-text disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className={`metal-edge border rounded-md px-3 py-2 text-[11px] uppercase tracking-[0.12em] disabled:opacity-50 ${
              isConfirm ? "border-signal text-signal" : "border-border text-text"
            }`}
          >
            {busy ? "Menyimpan" : isConfirm ? "Konfirmasi" : "Abaikan"}
          </button>
        </div>
      </div>
    </div>
  );
}
