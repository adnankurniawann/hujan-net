"use client";

import { useMemo } from "react";
import type { CatchmentState, Link, Snapshot } from "@/lib/types";
import type { AlertRecord } from "@/lib/alerts/types";
import type { AlertDecision } from "@/components/alerts/useCatchmentAlerts";
import type { RmsePoint } from "@/components/sim/useSimulation";
import {
  Card,
  Chip,
  ConsoleButton,
  SectionLabel,
  SimulationBadge,
} from "@/components/ui/primitives";
import AccuracyGauge from "./AccuracyGauge";
import CatchmentCard from "./CatchmentCard";
import NetworkCard from "./NetworkCard";
import PerformanceRadar from "./PerformanceRadar";
import PipelineMarkers from "./PipelineMarkers";
import RmseTrend from "./RmseTrend";
import ScoreCard from "./ScoreCard";
import { computeMetrics, gradeOfAgreement, radarAxes } from "./metrics";

/* ============================================================================
 * Panggung "Laporan".
 *
 * Satu kartu utama yang menjawab pertanyaan pokok — seberapa cocok medan hujan
 * hasil rekonstruksi dengan medan sebenarnya — lalu tiga kartu di bawahnya yang
 * memecah jawaban itu menjadi bagian yang bisa diperiksa: skor dan rantai model,
 * jaringan tautan yang mengukurnya, dan akibatnya di sisi DAS.
 *
 * Semua angka dihitung dari `Snapshot` lewat `metrics.ts`. Kalau simulasinya
 * berubah, laporan ini berubah; tidak ada angka yang ditulis tangan.
 * ==========================================================================*/

export default function ReportView({
  snapshot,
  links,
  catchments,
  candidates,
  decisions,
  wetDryAccuracy,
  rmseSeries,
  t,
  durationS,
  onDecide,
  onOpenComparison,
  onOpenMap,
}: {
  snapshot: Snapshot;
  links: Link[];
  catchments: CatchmentState[];
  candidates: AlertRecord[];
  decisions: Record<string, AlertDecision>;
  wetDryAccuracy: number;
  rmseSeries: RmsePoint[];
  t: number;
  durationS: number;
  onDecide: (id: string, status: "dikonfirmasi" | "diabaikan", by: string) => void;
  onOpenComparison: () => void;
  onOpenMap: () => void;
}) {
  const m = useMemo(() => computeMetrics(snapshot), [snapshot]);
  const axes = useMemo(() => radarAxes(m, wetDryAccuracy), [m, wetDryAccuracy]);
  const grade = gradeOfAgreement(m.agreement);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-4">
        {/* ================= kartu utama ================= */}
        <Card className="shrink-0">
          <header className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-5">
            <ConsoleButton onClick={onOpenMap} title="Kembali ke peta operasi" className="w-7 px-0">
              <span aria-hidden>‹</span>
              <span className="sr-only">Kembali ke peta operasi</span>
            </ConsoleButton>
            <h1 className="title-tight text-lg font-bold text-text">
              Laporan Rekonstruksi
            </h1>
            {grade === null ? (
              <Chip tone="mute">belum dinilai</Chip>
            ) : (
              <Chip tone={grade === "sangat baik" || grade === "baik" ? "ok" : "signal"} dot>
                {grade}
              </Chip>
            )}
            <SimulationBadge className="ml-auto" detail="kebenaran dasar diketahui" />
          </header>

          <div className="grid grid-cols-[minmax(220px,1fr)_minmax(0,1.75fr)_minmax(240px,1fr)] gap-5 px-5 pb-5">
            {/* ---- kolom kiri: penjelasan dan radar ---- */}
            <div className="flex min-h-[320px] flex-col gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text">Kesesuaian Medan</h2>
                <p className="mt-1.5 text-3xs leading-5 text-text-dim">
                  Mengukur seberapa dekat medan hujan hasil rekonstruksi dengan medan hujan
                  sebenarnya. Karena medan sebenarnya berasal dari simulasi, kedekatan itu bisa
                  dihitung — bukan diperkirakan.
                </p>
              </div>
              <div className="min-h-0 flex-1">
                {axes ? (
                  <PerformanceRadar axes={axes} />
                ) : (
                  <div className="flex h-full min-h-[200px] items-center justify-center px-4">
                    <p className="max-w-[28ch] text-center text-3xs leading-5 text-text-dim">
                      Enam sumbu mutu muncul setelah ada medan hujan untuk dibandingkan.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ---- kolom tengah: pengukur ----
                Saat cerah, pengukur tidak ditampilkan sebagai nol maupun sebagai
                seratus. Medan kosong tidak punya kesesuaian yang bisa diukur, dan
                menuliskan itu apa adanya lebih kuat daripada memamerkan angka
                sempurna yang lahir dari penyebut nol. */}
            <div className="flex min-w-0 items-center justify-center">
              {m.agreement === null ? (
                <div className="flex flex-col items-center gap-3 px-8 text-center">
                  <span className="figure text-5xl text-text-mute">—</span>
                  <span className="text-2xs font-medium uppercase tracking-caps text-text-mute">
                    Indeks Kesesuaian (d)
                  </span>
                  <p className="max-w-[34ch] text-3xs leading-5 text-text-dim">
                    Cerah pada waktu berjalan. Tidak ada medan hujan untuk dibandingkan, jadi
                    indeks kesesuaian belum terdefinisi — bukan bernilai nol, dan bukan sempurna.
                  </p>
                  <p className="max-w-[34ch] text-3xs leading-5 text-text-dim">
                    Majukan waktu ke kejadian hujan untuk menilai rekonstruksi.
                  </p>
                </div>
              ) : (
                <AccuracyGauge
                  value={m.agreement}
                  headline={m.agreement.toFixed(2)}
                  caption="Indeks Kesesuaian (d)"
                  footnote="Kecocokan medan rekonstruksi terhadap medan sebenarnya"
                />
              )}
            </div>

            {/* ---- kolom kanan: tren galat ---- */}
            <div className="card-inset flex min-h-[320px] flex-col gap-3 p-4">
              <div className="min-h-0 flex-1">
                <RmseTrend
                  rmse={m.rmse}
                  t={t}
                  durationS={durationS}
                  series={rmseSeries}
                  peakTruth={m.peakTruth}
                />
              </div>
              <ConsoleButton onClick={onOpenComparison} className="self-end">
                Buka perbandingan
                <span aria-hidden className="text-text-dim">
                  ›
                </span>
              </ConsoleButton>
            </div>
          </div>
        </Card>

        {/* ================= tiga kartu rincian ================= */}
        <div className="grid shrink-0 grid-cols-[minmax(320px,1fr)_minmax(320px,1.1fr)_minmax(320px,1.05fr)] items-start gap-4">
          <div className="flex flex-col gap-4">
            <ScoreCard m={m} series={rmseSeries} onOpenComparison={onOpenComparison} />
            <PipelineMarkers
              nx={snapshot.reconstruction.nx}
              ny={snapshot.reconstruction.ny}
              totalLinks={m.totalLinks}
              wetDryAccuracy={wetDryAccuracy}
            />
          </div>

          <NetworkCard links={links} m={m} />

          <CatchmentCard
            catchments={catchments}
            candidates={candidates}
            decisions={decisions}
            onDecide={onDecide}
          />
        </div>

        {/* Catatan kaki laporan: batas keberlakuan angka di atas, ditulis di
            halaman yang sama dengan angkanya, bukan di dokumen lain. */}
        <footer className="flex shrink-0 items-start gap-3 px-1 pb-1">
          <SectionLabel className="shrink-0">Batas Keberlakuan</SectionLabel>
          <p className="max-w-[110ch] text-3xs leading-4 text-text-dim">
            Seluruh angka pada halaman ini dihitung dari medan hujan sintetis, bukan dari data
            redaman operator telekomunikasi. Nilai galat karenanya berlaku untuk kejadian simulasi
            ini saja dan bukan jaminan kinerja lapangan.
          </p>
        </footer>
      </div>
    </div>
  );
}

