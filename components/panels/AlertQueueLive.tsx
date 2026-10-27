"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AlertRecord } from "@/lib/alerts/types";
import { ConfirmDialog, type DecisionKind } from "./ConfirmDialog";
import { Divider, EmptyState, SectionLabel } from "./SectionLabel";
import { StatusBadge } from "./StatusBadge";
import Alert from "@/components/ui/alert";
import { mm, mmWhole, simClock, wallClock, windowLabel } from "./format";

/**
 * Antrean peringatan yang menunggu keputusan, ditambah daftar riwayat.
 *
 * Kandidat yang sudah dikonfirmasi atau diabaikan pindah dari antrean ke riwayat,
 * sesuai kriteria diterima C3. Perpindahan itu terjadi karena antrean dan riwayat
 * memfilter medan `status` yang sama, jadi tidak ada state ganda yang bisa
 * tidak sinkron.
 *
 * ---------------------------------------------------------------------------
 * KENAPA BERKAS INI TERPISAH DARI `AlertQueue.tsx`
 * ---------------------------------------------------------------------------
 * Ada DUA antrean peringatan di repo ini, dan keduanya memang berbeda:
 *
 *   - `AlertQueue.tsx`      dikendalikan props (`catchments`, `candidates`,
 *                           `decisions`, `onDecide`). Dipakai dasbor utama,
 *                           datanya dari simulasi di memori.
 *   - `AlertQueueLive.tsx`  (berkas ini) menarik sendiri dari `/api/alerts`
 *                           dan menulis keputusan ke SQLite. Dipakai
 *                           `app/panel-preview`, dan inilah bukti kriteria C2
 *                           "riwayat bertahan setelah server dimuat ulang".
 *
 * Sebelum 31 Juli 2026 keduanya menempati path yang sama. Merge 79e1e3c
 * menyelesaikan bentrokan itu dengan mengambil versi props saja, sehingga versi
 * inilah yang hilang — dan `panel-preview/page.tsx` yang masih memanggilnya
 * membuat `npm run build` gagal. Berkas ini dipulihkan dari 59cb74f apa adanya,
 * hanya namanya yang diubah. Jangan disatukan tanpa memutuskan lebih dulu jalur
 * mana yang menyimpan keputusan operator.
 */

const BTN = "rounded-md px-3 py-2 text-[11px] uppercase tracking-[0.12em] border";

function QueueCard({
  alert,
  onDecide,
}: {
  alert: AlertRecord;
  onDecide: (kind: DecisionKind, alert: AlertRecord) => void;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge level={alert.level} />
          <span className="font-mono text-[10px] text-text-mute shrink-0">
            {alert.catchmentId}
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-mute tabular-nums shrink-0">
          t {simClock(alert.raisedAt)}
        </span>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-text-mute">
        Akumulasi <span className="font-mono text-text">{mm(alert.accumMm)}</span> melewati
        ambang <span className="font-mono text-text">{mmWhole(alert.thresholdMm)}</span> pada
        jendela <span className="font-mono text-text">{windowLabel(alert.windowKey)}</span>.
      </p>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onDecide("confirm", alert)}
          className={`${BTN} border-signal text-signal`}
        >
          Konfirmasi
        </button>
        <button
          type="button"
          onClick={() => onDecide("dismiss", alert)}
          className={`${BTN} border-border text-text-mute hover:text-text`}
        >
          Abaikan
        </button>
      </div>
    </div>
  );
}

function HistoryRow({ alert }: { alert: AlertRecord }) {
  const decided = alert.status === "dikonfirmasi";
  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-[10px] uppercase tracking-[0.12em] shrink-0 ${
              decided ? "text-signal" : "text-text-mute"
            }`}
          >
            {alert.status}
          </span>
          <span className="font-mono text-[10px] text-text-mute truncate">
            {alert.catchmentId} · {alert.level}
          </span>
        </div>
        {alert.confirmedAt !== undefined && (
          <span className="font-mono text-[10px] text-text-mute tabular-nums shrink-0">
            {wallClock(alert.confirmedAt)}
          </span>
        )}
      </div>
      {alert.confirmedBy && (
        <p className="mt-1 text-[10px] text-text-mute">
          oleh <span className="text-text">{alert.confirmedBy}</span>
          {alert.note ? ` · ${alert.note}` : ""}
        </p>
      )}
    </div>
  );
}

export function AlertQueue({
  eventId,
  pollMs = 0,
}: {
  /**
   * Batasi antrean ke satu kejadian simulasi. Wajib diisi saat demo: tanpa ini,
   * kandidat dari pemutaran ulang sebelumnya ikut muncul di antrean operator.
   */
  eventId?: string;
  pollMs?: number;
}) {
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [pending, setPending] = useState<{ kind: DecisionKind; alert: AlertRecord }>();
  const [operator, setOperator] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [decideError, setDecideError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const query = eventId ? `?eventId=${encodeURIComponent(eventId)}` : "";
      const res = await fetch(`/api/alerts${query}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Antrean gagal dimuat, kode ${res.status}`);
      const body = (await res.json()) as { alerts: AlertRecord[] };
      setAlerts(body.alerts);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Antrean gagal dimuat");
      setAlerts([]);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
    if (pollMs <= 0) return;
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  const submit = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    setDecideError(undefined);
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(pending.alert.id)}/${pending.kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pending.kind === "dismiss" ? { by: operator, note } : { by: operator },
        ),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Gagal, kode ${res.status}`);
      setPending(undefined);
      setNote("");
      await load();
    } catch (err) {
      setDecideError(err instanceof Error ? err.message : "Keputusan gagal disimpan");
    } finally {
      setBusy(false);
    }
  }, [pending, operator, note, load]);

  const queue = useMemo(() => (alerts ?? []).filter((a) => a.status === "menunggu"), [alerts]);
  const history = useMemo(() => (alerts ?? []).filter((a) => a.status !== "menunggu"), [alerts]);

  return (
    <>
      <section>
        <SectionLabel count={alerts === null ? undefined : queue.length}>
          Antrean peringatan
        </SectionLabel>
        <Divider />

        {alerts === null ? (
          <EmptyState title="Memuat antrean." detail="Mengambil daftar kandidat dari basis data." />
        ) : loadError ? (
          <Alert type="error" label="Antrean tidak dapat dimuat" className="mt-2">
            {loadError}
          </Alert>
        ) : queue.length === 0 ? (
          <EmptyState
            title="Tidak ada kandidat menunggu keputusan."
            detail="Kandidat muncul sendiri ketika akumulasi hujan sebuah DAS melewati ambangnya. Sistem tidak pernah menyiarkan peringatan tanpa konfirmasi operator."
          />
        ) : (
          queue.map((alert, i) => (
            <div key={alert.id}>
              {i > 0 && <Divider />}
              <QueueCard alert={alert} onDecide={(kind, a) => {
                setDecideError(undefined);
                setPending({ kind, alert: a });
              }} />
            </div>
          ))
        )}
      </section>

      <section>
        <SectionLabel count={history.length}>Riwayat keputusan</SectionLabel>
        <Divider />
        {history.length === 0 ? (
          <EmptyState
            title="Belum ada keputusan tercatat."
            detail="Setiap konfirmasi dan pengabaian dicatat di sini lengkap dengan nama operator dan cap waktu."
          />
        ) : (
          history.map((alert, i) => (
            <div key={alert.id}>
              {i > 0 && <Divider />}
              <HistoryRow alert={alert} />
            </div>
          ))
        )}
      </section>

      {pending && (
        <ConfirmDialog
          kind={pending.kind}
          alert={pending.alert}
          operator={operator}
          note={note}
          busy={busy}
          error={decideError}
          onOperatorChange={setOperator}
          onNoteChange={setNote}
          onCancel={() => {
            setPending(undefined);
            setDecideError(undefined);
          }}
          onSubmit={() => void submit()}
        />
      )}
    </>
  );
}
