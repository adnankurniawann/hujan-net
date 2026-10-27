"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { RmsePoint } from "@/components/sim/useSimulation";
import { Figure, HelpDot, SectionLabel } from "@/components/ui/primitives";
import { formatClock } from "@/components/ui/TopBar";

/* Kartu tren galat: satu angka besar dan seluruh riwayat galat kejadian dalam
   grafik kecil. Titik sekarang ditandai di kurva supaya operator melihat
   posisinya, bukan hanya nilainya.

   Kurva ini memuat SELURUH kejadian, termasuk menit yang belum dilewati jam
   simulasi. Itu sah karena kejadiannya memang sudah dihitung seluruhnya di
   muka — tetapi tanpa penanda, pembaca yang melihat "T+29" mengira menit 30
   sampai 60 sudah benar-benar terjadi. Bagian yang belum dilewati karena itu
   diarsir dan diberi nama. */

const AXIS_TICK = {
  fill: "var(--text-dim)",
  fontSize: 9,
  fontFamily: "var(--font-mono), ui-monospace, monospace",
};

export default function RmseTrend({
  rmse,
  t,
  durationS,
  series,
  peakTruth,
}: {
  rmse: number;
  t: number;
  durationS: number;
  series: RmsePoint[];
  peakTruth: number;
}) {
  const maxRmse = series.reduce((hi, p) => Math.max(hi, p.rmse), 0);
  const top = Math.max(2, Math.ceil((maxRmse * 1.25) / 2) * 2);

  /* Titik terdekat pada kurva, bukan nilai berjalan: kurva dicuplik tiap menit,
     jadi menaruh nilai detik-per-detik di atasnya akan tampak melompat. */
  const here = series.reduce<RmsePoint | null>(
    (best, p) => (best === null || Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best),
    null,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Figure value={rmse} unit="mm/jam" decimals={2} size="md" tone="default" />
          <span className="flex items-center gap-1.5">
            <SectionLabel>Galat Rekonstruksi (RMSE)</SectionLabel>
            <HelpDot hint="Akar galat kuadrat rata-rata antara medan hujan sebenarnya hasil simulasi dan medan hasil rekonstruksi, dihitung atas seluruh sel grid." />
          </span>
        </div>
        {/* Keping golongan dilepas dari kartu ini. Golongannya milik indeks
            kesesuaian, bukan milik RMSE, dan ia sudah tertulis di kepala
            laporan serta di kartu skor — tiga kali di satu layar terbaca
            sebagai membujuk, bukan melaporkan. */}
      </div>

      <p className="text-3xs leading-4 text-text-dim">
        Galat dibandingkan puncak medan sebenarnya{" "}
        <span className="tnum text-rain-text">{peakTruth.toFixed(1)}</span> mm/jam. Karena medan
        sebenarnya berasal dari simulasi, galat ini terukur — bukan ditaksir.
      </p>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="rmse-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--rain)" stopOpacity={0.34} />
                <stop offset="100%" stopColor="var(--rain)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(15,32,51,0.09)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, durationS]}
              ticks={[0, durationS / 2, durationS]}
              tickFormatter={formatClock}
              tick={AXIS_TICK}
              stroke="rgba(15,32,51,0.16)"
              tickLine={false}
            />
            <YAxis
              domain={[0, top]}
              width={26}
              tick={AXIS_TICK}
              stroke="rgba(15,32,51,0.16)"
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Area
              dataKey="rmse"
              stroke="none"
              fill="url(#rmse-fill)"
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              dataKey="rmse"
              stroke="var(--rain-text)"
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
            {/* wilayah yang belum dilewati jam simulasi */}
            {t < durationS ? (
              <ReferenceArea
                x1={t}
                x2={durationS}
                fill="rgba(15,32,51,0.05)"
                stroke="none"
                label={{
                  value: "pra-hitung",
                  position: "insideTopRight",
                  fill: "var(--text-dim)",
                  fontSize: 9,
                }}
              />
            ) : null}
            <ReferenceLine x={t} stroke="rgba(15,32,51,0.34)" strokeDasharray="2 3" />
            {here ? (
              <ReferenceDot
                x={here.t}
                y={here.rmse}
                r={3.5}
                fill="var(--text)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
