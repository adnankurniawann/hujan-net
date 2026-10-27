import type { CatchmentState } from "@/lib/types";
import { StatusBadge, ThresholdBar } from "./StatusBadge";
import { Divider, EmptyState, SectionLabel } from "./SectionLabel";
import { mm, mmWhole, percentOf } from "./format";

/**
 * Daftar Daerah Aliran Sungai dengan akumulasi tiga jendela dan statusnya.
 *
 * Komponen server, tanpa state. Kepadatan informasi sengaja tinggi: ini konsol
 * operator, bukan halaman pemasaran.
 */

function AccumCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-[0.12em] text-text-mute">{label}</span>
      <span className="font-mono text-xs text-text tabular-nums">{value}</span>
    </div>
  );
}

function CatchmentRow({ state }: { state: CatchmentState }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono text-[10px] text-text-mute shrink-0">{state.id}</span>
          <span className="truncate text-xs text-text">{state.name}</span>
        </div>
        <StatusBadge level={state.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
        <AccumCell label="1 jam" value={mm(state.accum1h)} />
        <AccumCell label="3 jam" value={mm(state.accum3h)} />
        <AccumCell label="6 jam" value={mm(state.accum6h)} />
        <AccumCell label="ambang" value={mmWhole(state.thresholdMm)} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <ThresholdBar
          value={state.accum1h}
          threshold={state.thresholdMm}
          level={state.status}
        />
        <span className="font-mono text-[10px] text-text-mute shrink-0 tabular-nums">
          {percentOf(state.accum1h, state.thresholdMm)}
        </span>
      </div>
    </div>
  );
}

export function CatchmentList({ states }: { states: CatchmentState[] }) {
  return (
    <section>
      <SectionLabel count={states.length}>Daerah Aliran Sungai</SectionLabel>
      <Divider />
      {states.length === 0 ? (
        <EmptyState
          title="Belum ada data akumulasi."
          detail="Status DAS dihitung dari medan hujan hasil rekonstruksi. Daftar ini terisi setelah sumber simulasi tersedia."
        />
      ) : (
        states.map((state, i) => (
          <div key={state.id}>
            {i > 0 && <Divider />}
            <CatchmentRow state={state} />
          </div>
        ))
      )}
    </section>
  );
}
