/**
 * Pratinjau panel C3. HANYA UNTUK PENGEMBANGAN.
 *
 * Halaman ini ada karena A5 belum digabung, sehingga panel C3 tidak punya sumber
 * status DAS. Di sini rantai C1 sampai C3 dijalankan penuh memakai badai sintetis:
 * medan hujan, akumulasi per DAS, pendeteksian kandidat, penyimpanan, lalu panelnya.
 *
 * Halaman ini bukan bagian dari demo dan tidak ditaut dari mana pun. Begitu B1 dan A5
 * selesai, `CatchmentPanel` dipasang di panel kanan dasbor dan berkas ini dibuang.
 *
 * Pakai `?t=<detik>` untuk melihat panel pada waktu simulasi lain, mis. `?t=3000`.
 */

import type { Link } from "@/lib/types";
import { buildRainSeries, catchmentStatesAt, loadCatchmentData } from "@/lib/catchment";
import { detectCandidates, syncCandidates } from "@/lib/alerts";
import type { CatchmentTimelineFrame } from "@/lib/alerts";
import { CatchmentList } from "@/components/panels/CatchmentList";
import { AlertQueue } from "@/components/panels/AlertQueueLive";
import { Divider } from "@/components/panels/SectionLabel";
import { simClock } from "@/components/panels/format";
import { DensityPanel } from "@/components/panels/DensityPanel";
import { densityStats, type DensityConfig } from "@/components/panels/density";
import linksJson from "@/data/links.json";
import densityJson from "@/data/density-config.json";
import { EVENT_DURATION_SEC, stormFrames } from "./storm";

export const dynamic = "force-dynamic";

/** Pengenal kejadian pratinjau. Tetap, supaya penyegaran halaman idempoten. */
const PREVIEW_EVENT_ID = "pratinjau-c3";

/** Langkah evaluasi status untuk pendeteksian kandidat, detik. */
const EVAL_STEP_SEC = 60;

export default async function PanelPreviewPage({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  const requested = Number(searchParams.t);
  const t = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 0), EVENT_DURATION_SEC)
    : 5400;

  const { catchments, config } = loadCatchmentData();
  const frames = stormFrames();
  const series = buildRainSeries(frames, catchments, config);

  // Isi antrean sekali. Bersifat idempoten: id kandidat deterministik dan
  // syncCandidates tidak pernah menyentuh baris yang sudah diputuskan operator.
  const timeline: CatchmentTimelineFrame[] = [];
  for (let ts = 0; ts <= EVENT_DURATION_SEC; ts += EVAL_STEP_SEC) {
    timeline.push({ t: ts, states: catchmentStatesAt(series, ts, config) });
  }
  await syncCandidates(detectCandidates(timeline, config, PREVIEW_EVENT_ID));

  const states = catchmentStatesAt(series, t, config);
  const density = densityJson as DensityConfig;

  return (
    <main className="min-h-screen p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="border border-signal text-signal rounded-md px-2 py-1 text-[10px] uppercase tracking-[0.12em]">
          Data simulasi
        </span>
        <span className="text-[11px] text-text-mute">
          Pratinjau C3, bukan bagian dari demo. Ubah waktu lewat{" "}
          <span className="font-mono text-text">?t=</span> dalam detik, 0 sampai{" "}
          <span className="font-mono text-text">{EVENT_DURATION_SEC}</span>.
        </span>
      </div>

      {/* Lebar 380px mengikuti panel kanan yang ditetapkan B1. */}
      <div className="flex flex-col gap-4 w-[380px]">
        {/* Panel kanan dasbor sekarang memakai `components/panels/CatchmentPanel`
            versi B1, yang mengambil kandidat dari state klien. Pratinjau ini
            tetap menyusun CatchmentList dan AlertQueue secara langsung, karena
            AlertQueue-lah satu satunya jalur yang benar benar menyimpan
            keputusan operator ke SQLite. Selama kedua jalur belum disatukan,
            halaman ini adalah bukti kriteria C2 "riwayat bertahan setelah
            server dimuat ulang". */}
        <div className="flex flex-col overflow-hidden rounded-md border border-border bg-surface">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h1 className="text-2xs uppercase tracking-caps text-text">
              Hidrologi dan Peringatan
            </h1>
            <span className="num text-2xs text-text-mute">t {simClock(t)}</span>
          </div>
          <Divider />
          <CatchmentList states={states} />
          <Divider />
          <AlertQueue eventId={PREVIEW_EVENT_ID} pollMs={0} />
        </div>
        {density.enabled && (
          <DensityPanel
            stats={densityStats(linksJson as unknown as Link[], density)}
            sourceLabel={density.sourceLabel}
            bboxLabel={density.bboxLabel}
            verified={density.verified}
          />
        )}
      </div>
    </main>
  );
}
