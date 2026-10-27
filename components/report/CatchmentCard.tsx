"use client";

import type { CatchmentState } from "@/lib/types";
import type { AlertRecord } from "@/lib/alerts/types";
import type { AlertDecision } from "@/components/alerts/useCatchmentAlerts";
import AlertQueue from "@/components/panels/AlertQueue";
import {
  Bar,
  Chip,
  Figure,
  GradientMeter,
  HelpDot,
  SectionLabel,
  StatusDot,
  type Tone,
} from "@/components/ui/primitives";
import {
  AnimatedCard,
  CardBody,
  CardTitle,
  CardVisual,
  Visual,
} from "@/components/ui/animated-card-chart";

/* ============================================================================
 * Akumulasi DAS dan antrean peringatan dalam satu kartu.
 *
 * Kedua hal ini disatukan dengan sengaja: angka akumulasi tidak berarti apa-apa
 * tanpa ambangnya, dan ambang tidak berarti apa-apa tanpa siapa yang memutuskan.
 * Baris terakhir kartu ini adalah aturan tata kelolanya, dipasang permanen.
 * ==========================================================================*/

const STATUS_TONE: Record<CatchmentState["status"], Tone> = {
  normal: "ok",
  waspada: "signal",
  siaga: "alert",
};

/** DAS dengan rasio akumulasi terhadap ambang paling tinggi. */
function mostLoaded(catchments: CatchmentState[]): CatchmentState | null {
  let best: CatchmentState | null = null;
  let bestRatio = -1;
  for (const c of catchments) {
    const ratio = c.thresholdMm > 0 ? c.accum1h / c.thresholdMm : 0;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = c;
    }
  }
  return best;
}

export default function CatchmentCard({
  catchments,
  candidates,
  decisions,
  onDecide,
}: {
  catchments: CatchmentState[];
  candidates: AlertRecord[];
  decisions: Record<string, AlertDecision>;
  onDecide: (id: string, status: "dikonfirmasi" | "diabaikan", by: string) => void;
}) {
  const lead = mostLoaded(catchments);
  const leadRatio = lead && lead.thresholdMm > 0 ? lead.accum1h / lead.thresholdMm : 0;
  const pending = candidates.filter((c) => !decisions[c.id]).length;

  /* Akumulasi 1 jam tiap DAS. Deretnya pendek — hanya sebanyak DAS yang ada —
     dan itu justru benar: satu batang satu DAS, bukan batang isian. */
  const accums = catchments.map((c) => c.accum1h);

  return (
    <AnimatedCard>
      <CardVisual>
        <Visual
          accent={pending > 0 ? "alert" : "rain"}
          series={accums}
          bars={Math.max(1, accums.length)}
          seriesLabel="Akumulasi 1 jam tiap DAS"
          seriesDetail={
            lead
              ? `Tertinggi: ${lead.name}, ${lead.accum1h.toFixed(1)} mm terhadap ambang ${lead.thresholdMm.toFixed(0)} mm.`
              : "Belum ada DAS yang mengumpulkan hujan."
          }
          emptyLabel="Akumulasi DAS muncul setelah hujan tersimulasi mulai turun."
          chips={[
            {
              value: lead ? `${lead.accum1h.toFixed(1)} mm` : "—",
              label: "Akumulasi tertinggi",
              accent: pending > 0 ? "alert" : "rain",
            },
            {
              value: `${pending} menunggu`,
              label: "Kandidat peringatan menunggu keputusan",
              accent: pending > 0 ? "alert" : "ok",
            },
          ]}
        />
      </CardVisual>

      <CardBody className="min-h-0 gap-4 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <CardTitle>Akumulasi DAS &amp; Peringatan</CardTitle>
            <HelpDot hint="Akumulasi curah hujan hasil rekonstruksi dijumlahkan per Daerah Aliran Sungai, lalu dibandingkan dengan ambang siaga jendela 1 jam dari data/catchment-config.json." />
          </span>
          {pending > 0 ? (
            <Chip tone="alert" dot className="shrink-0">
              {pending} menunggu
            </Chip>
          ) : (
            <Chip tone="ok" dot className="shrink-0">
              antrean kosong
            </Chip>
          )}
        </div>
      {/* ---- DAS paling terbebani ---- */}
      {lead ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Figure
                value={lead.accum1h}
                unit="mm"
                decimals={1}
                size="md"
                tone={STATUS_TONE[lead.status]}
              />
              <span className="flex items-center gap-2">
                <SectionLabel>{lead.name} · Akumulasi 1 Jam</SectionLabel>
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="tnum text-sm text-text">
                {(leadRatio * 100).toFixed(0)}
                <span className="ml-1 font-sans text-3xs text-text-dim">% ambang</span>
              </span>
              <Chip tone={STATUS_TONE[lead.status]} dot>
                {lead.status}
              </Chip>
            </div>
          </div>

          <GradientMeter
            ratio={leadRatio}
            ticks={["Normal", "Waspada", "Siaga"]}
            ariaLabel={`${lead.name} pada ${(leadRatio * 100).toFixed(0)} persen ambang siaga`}
          />
        </div>
      ) : null}

      {/* ---- kotak arti, seperti kotak penjelasan pada kartu laporan ---- */}
      {lead ? (
        <p className="card-inset px-3 py-2.5 text-3xs leading-5 text-text-mute">
          Akumulasi <span className="text-text">{lead.name}</span> mencapai{" "}
          <span className="tnum text-text">{(leadRatio * 100).toFixed(0)} %</span> ambang siaga{" "}
          <span className="tnum">{lead.thresholdMm}</span> mm. Angka ini berasal dari medan hasil
          rekonstruksi, bukan dari penakar hujan.
        </p>
      ) : null}

      {/* ---- seluruh DAS ---- */}
      <div>
        <SectionLabel className="px-1">Seluruh DAS · 1 / 3 / 6 Jam</SectionLabel>
        <ul className="mt-2 flex flex-col gap-2">
          {catchments.map((c) => {
            const ratio = c.thresholdMm > 0 ? c.accum1h / c.thresholdMm : 0;
            return (
              <li key={c.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusDot tone={STATUS_TONE[c.status]} />
                    <span className="truncate text-2xs text-text">{c.name}</span>
                  </span>
                  <span className="tnum shrink-0 text-3xs text-text-mute">
                    {c.accum1h.toFixed(1)} / {c.accum3h.toFixed(1)} / {c.accum6h.toFixed(1)}
                    <span className="ml-1 font-sans text-text-dim">mm</span>
                  </span>
                </div>
                <Bar ratio={ratio} tone={STATUS_TONE[c.status]} />
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---- antrean peringatan ---- */}
      <div className="border-t border-hairline pt-4">
        <SectionLabel className="px-1">Antrean Kandidat Peringatan</SectionLabel>
        <div className="mt-2">
          <AlertQueue
            catchments={catchments}
            candidates={candidates}
            decisions={decisions}
            onDecide={onDecide}
            compact
          />
        </div>
      </div>

      {/* Poin tata kelola, dipasang permanen supaya bukan sekadar kalimat lisan. */}
      <p className="flex items-start gap-2 text-3xs leading-4 text-text-dim">
        <StatusDot tone="alert" className="mt-1.5" glow={false} />
        Sistem tidak pernah menyiarkan peringatan sendiri. Keputusan akhir ada pada operator.
      </p>
      </CardBody>
    </AnimatedCard>
  );
}
