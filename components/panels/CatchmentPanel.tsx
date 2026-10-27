"use client";

import type { CatchmentState } from "@/lib/types";
import type { AlertRecord } from "@/lib/alerts/types";
import type { AlertDecision } from "@/components/alerts/useCatchmentAlerts";
import {
  Bar,
  Chip,
  EmptyState,
  Panel,
  SectionLabel,
  StatusDot,
  type Tone,
} from "@/components/ui/primitives";
import Alert from "@/components/ui/alert";
import AlertQueue from "./AlertQueue";

const STATUS_TONE: Record<CatchmentState["status"], Tone> = {
  normal: "ok",
  waspada: "signal",
  siaga: "alert",
};

function CatchmentRow({ c }: { c: CatchmentState }) {
  const ratio = Math.min(1, c.thresholdMm > 0 ? c.accum1h / c.thresholdMm : 0);
  return (
    <li className="border-b border-hairline px-4 py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-2xs text-text">{c.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <StatusDot tone={STATUS_TONE[c.status]} />
          {/* status ditulis, bukan hanya diwarnai */}
          <span className="text-3xs uppercase tracking-label text-text-mute">{c.status}</span>
        </span>
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="tnum text-2xs text-rain-text">
          {c.accum1h.toFixed(1)}
          <span className="ml-1 font-sans text-text-dim">mm</span>
        </span>
        <span className="text-3xs text-text-dim">
          ambang <span className="tnum">{c.thresholdMm}</span> mm
        </span>
      </div>

      <Bar ratio={ratio} tone={STATUS_TONE[c.status]} className="mt-1.5" />
    </li>
  );
}

interface Props {
  catchments: CatchmentState[];
  candidates: AlertRecord[];
  decisions: Record<string, AlertDecision>;
  onDecide: (id: string, status: "dikonfirmasi" | "diabaikan", by: string) => void;
  /** Status DAS dan antrean sudah selesai diambil dari server. */
  ready?: boolean;
  /** Galat pengambilan. Ditampilkan menggantikan isi, bukan disembunyikan. */
  error?: string | null;
  deciding?: string | null;
  decideError?: string | null;
}

export default function CatchmentPanel({
  catchments,
  candidates,
  decisions,
  onDecide,
  ready = true,
  error = null,
  deciding = null,
  decideError = null,
}: Props) {
  const pending = candidates.filter((c) => !decisions[c.id]).length;

  return (
    /* Tinggi alami, bukan terbagi rata: rail di sebelahnya yang menggulir. */
    <div className="flex shrink-0 flex-col gap-4">
      <Panel title="Status DAS" aside={<SectionLabel>Akumulasi 1 Jam</SectionLabel>}>
        {/* Kedua keadaan ini dulu tidak mungkin terjadi, karena angkanya dihitung
            di peramban. Sejak status DAS datang dari server, panel yang kosong
            bisa berarti dua hal yang sangat berbeda — belum sampai, atau gagal —
            dan operator berhak tahu yang mana. */}
        {error ? (
          /* Galat, bukan kekosongan. `EmptyState` dipakai di sini sebelumnya dan
             itu keliru: bentuknya sama persis dengan panel yang memang belum
             punya isi, sehingga server yang mati terbaca sebagai hari tanpa
             hujan. */
          <div className="px-4 py-3">
            <Alert type="error" label="Status DAS tidak dapat dimuat">
              {error}. Peta dan pemutar ulang tetap berjalan; yang hilang hanya akumulasi DAS dan
              antrean peringatan.
            </Alert>
          </div>
        ) : !ready ? (
          <div className="px-4 py-3">
            <EmptyState
              title="Memuat status DAS"
              hint="Mengambil akumulasi hujan tiap DAS sepanjang kejadian dari server."
            />
          </div>
        ) : (
          <ul>
            {catchments.map((c) => (
              <CatchmentRow key={c.id} c={c} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Antrean Peringatan"
        aside={
          pending > 0 ? (
            <Chip tone="alert" dot>
              {pending} menunggu
            </Chip>
          ) : (
            <Chip tone="ok" dot>
              kosong
            </Chip>
          )
        }
        bodyClassName="px-4 py-3"
      >
        <AlertQueue
          catchments={catchments}
          candidates={candidates}
          decisions={decisions}
          onDecide={onDecide}
          deciding={deciding}
          decideError={decideError}
        />

        {/* Poin tata kelola, dipasang permanen di dalam panelnya supaya bukan
            sekadar kalimat lisan dan tidak bisa tergulir lepas dari antreannya. */}
        <p className="mt-3 flex items-start gap-2 border-t border-hairline pt-3 text-3xs leading-4 text-text-dim">
          <StatusDot tone="alert" glow={false} className="mt-1.5" />
          Sistem tidak pernah menyiarkan peringatan sendiri. Keputusan ada pada operator, dan
          setiap keputusan tercatat di basis data.
        </p>
      </Panel>
    </div>
  );
}
