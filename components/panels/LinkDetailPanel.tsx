"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Link, LinkState } from "@/lib/types";
import type { LinkTracePoint } from "@/components/preview/engine";
import { EmptyState, Num, Panel, SectionLabel, StatusDot } from "@/components/ui/primitives";
import { formatClock } from "@/components/ui/TopBar";

const AXIS_TICK = {
  fill: "var(--text-dim)",
  fontSize: 10,
  fontFamily: "var(--font-mono), ui-monospace, monospace",
};

/** Satu nilai berjalan besar. Inilah angka yang ditunjuk saat presentasi. */
function Readout({
  label,
  value,
  unit,
  decimals,
  tone,
}: {
  label: string;
  value: number | null;
  unit: string;
  decimals: number;
  tone: "signal" | "rain" | "mute";
}) {
  return (
    <div className="flex flex-col gap-px px-3 py-2">
      <SectionLabel>{label}</SectionLabel>
      <Num value={value} unit={unit} decimals={decimals} tone={tone} className="text-sm" />
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  decimals,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: number;
  unit: string;
  decimals: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card rounded-md px-2.5 py-1.5">
      <div className="tnum text-3xs text-text-mute">T+{formatClock(label ?? 0)}</div>
      {payload
        .filter((p) => p.dataKey !== "attenBand" && typeof p.value === "number")
        .map((p) => (
          <div key={p.dataKey} className="flex items-baseline gap-2">
            <span className="text-3xs text-text-dim">{p.name}</span>
            <span className="tnum text-3xs" style={{ color: p.color }}>
              {(p.value as number).toFixed(decimals)}
              <span className="ml-1 text-text-dim">{unit}</span>
            </span>
          </div>
        ))}
    </div>
  );
}

interface Props {
  link: Link | null;
  state: LinkState | null;
  trace: LinkTracePoint[];
  t: number;
  durationS: number;
}

export default function LinkDetailPanel({ link, state, trace, t, durationS }: Props) {
  /* Domain dan tanda sumbu dibulatkan ke kelipatan 5 dBm. Dibiarkan otomatis,
     Recharts menghasilkan tanda seperti -114 / -136 / -151 / -166 yang jaraknya
     tidak seragam, dan sumbu semacam itu tidak terbaca sebagai alat ukur. */
  const { rxDomain, rxTicks } = useMemo(() => {
    if (trace.length === 0) return { rxDomain: [0, 1] as [number, number], rxTicks: [0, 1] };
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of trace) {
      lo = Math.min(lo, p.rxPowerDbm);
      hi = Math.max(hi, p.baselineDb);
    }
    const step = 5;
    const bottom = Math.floor((lo - (hi - lo) * 0.1) / step) * step;
    const top = Math.ceil((hi + (hi - lo) * 0.08) / step) * step;
    const span = top - bottom;
    // sasaran 4 sampai 5 tanda, dengan langkah kelipatan 5
    const tickStep = Math.max(step, Math.ceil(span / 4 / step) * step);
    const ticks: number[] = [];
    for (let v = bottom; v <= top + 1e-9; v += tickStep) ticks.push(v);
    return { rxDomain: [bottom, top] as [number, number], rxTicks: ticks };
  }, [trace]);

  const rainMax = useMemo(() => {
    if (trace.length === 0) return 10;
    let hi = 0;
    for (const p of trace) hi = Math.max(hi, p.estRainMmH, p.trueRainMmH);
    return Math.max(10, Math.ceil((hi * 1.15) / 5) * 5);
  }, [trace]);

  if (!link) {
    return (
      <Panel title="Detail Tautan" className="flex-1">
        <EmptyState
          title="Belum ada tautan terpilih"
          hint="Klik salah satu lintasan tautan di peta untuk melihat daya terima, garis dasar, redaman, dan hasil inversinya."
        />
      </Panel>
    );
  }

  const wet = state?.isWet ?? false;

  return (
    <Panel
      title={`Detail Tautan · ${link.id}`}
      aside={
        <span className="flex items-center gap-2">
          <StatusDot tone={wet ? "signal" : "mute"} />
          <span className="text-3xs uppercase tracking-label text-text-mute">
            {wet ? "Basah" : "Kering"}
          </span>
        </span>
      }
      scroll
      className="flex-1"
    >
      {/* nilai berjalan: dua domain, dua warna. --signal untuk besaran yang
          diukur radio, --rain untuk besaran cuaca yang disimpulkan darinya. */}
      <div className="grid grid-cols-2 divide-x divide-y divide-hairline border-b border-hairline">
        <Readout
          label="Redaman A"
          value={state?.attenuationDb ?? null}
          unit="dB"
          decimals={2}
          tone="signal"
        />
        <Readout
          label="Hujan R"
          value={state?.estRainMmH ?? null}
          unit="mm/jam"
          decimals={1}
          tone="rain"
        />
        <Readout label="Frekuensi f" value={link.freqGHz} unit="GHz" decimals={0} tone="mute" />
        <Readout label="Panjang L" value={link.lengthKm} unit="km" decimals={2} tone="mute" />
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <SectionLabel>Polarisasi</SectionLabel>
        <span className="tnum text-2xs">{link.polarization}</span>
        <SectionLabel>Daya Pancar</SectionLabel>
        <Num value={link.txPowerDbm} unit="dBm" decimals={0} className="text-2xs" />
      </div>

      {/* ---- grafik 1: daya terima terhadap garis dasar ---- */}
      <div className="border-b border-hairline px-1 pb-1 pt-3">
        <div className="mb-1 flex items-center justify-between px-2">
          <SectionLabel>Daya Terima</SectionLabel>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-3xs text-text-dim">
              <span aria-hidden className="inline-block h-px w-3 bg-text-mute" />
              garis dasar
            </span>
            <span className="flex items-center gap-1 text-3xs text-text-dim">
              <span aria-hidden className="inline-block h-2 w-3 bg-signal/25" />
              redaman
            </span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={104}>
          <ComposedChart data={trace} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(15,32,51,0.09)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, durationS]}
              ticks={[0, durationS / 4, durationS / 2, (durationS * 3) / 4, durationS]}
              tickFormatter={formatClock}
              tick={AXIS_TICK}
              stroke="rgba(15,32,51,0.16)"
              tickLine={false}
            />
            <YAxis
              domain={rxDomain}
              ticks={rxTicks}
              width={44}
              tick={AXIS_TICK}
              stroke="rgba(15,32,51,0.16)"
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Tooltip
              content={<ChartTooltip unit="dBm" decimals={2} />}
              cursor={{ stroke: "rgba(15,32,51,0.30)", strokeWidth: 1 }}
            />
            {/* area antara daya terima dan garis dasar = redaman hujan */}
            <Area
              dataKey="attenBand"
              name="redaman"
              stroke="none"
              fill="var(--signal)"
              fillOpacity={0.22}
              isAnimationActive={false}
              activeDot={false}
            />
            <Line
              dataKey="baselineDb"
              name="garis dasar"
              stroke="var(--text-mute)"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="rxPowerDbm"
              name="daya terima"
              stroke="var(--signal)"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine x={t} stroke="var(--text)" strokeWidth={1} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ---- grafik 2: hasil inversi terhadap kebenaran dasar ---- */}
      <div className="px-1 pb-2 pt-2">
        <div className="mb-1 flex items-center justify-between px-2">
          <SectionLabel>Intensitas Hujan</SectionLabel>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-3xs text-text-dim">
              <span aria-hidden className="inline-block h-px w-3 bg-text" />
              sebenarnya
            </span>
            <span className="flex items-center gap-1 text-3xs text-text-dim">
              <span aria-hidden className="inline-block h-2 w-3 bg-rain/40" />
              inversi
            </span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={96}>
          <ComposedChart data={trace} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="rgba(15,32,51,0.09)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, durationS]}
              ticks={[0, durationS / 4, durationS / 2, (durationS * 3) / 4, durationS]}
              tickFormatter={formatClock}
              tick={AXIS_TICK}
              stroke="rgba(15,32,51,0.16)"
              tickLine={false}
            />
            <YAxis
              domain={[0, rainMax]}
              width={44}
              tick={AXIS_TICK}
              stroke="rgba(15,32,51,0.16)"
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Tooltip
              content={<ChartTooltip unit="mm/jam" decimals={1} />}
              cursor={{ stroke: "rgba(15,32,51,0.30)", strokeWidth: 1 }}
            />
            {/* Inversi dulu, kebenaran dasar DI ATASNYA. Kalau urutannya dibalik,
                area inversi menutupi garis putus-putus kebenaran dasar, dan
                justru garis itulah bukti bahwa hasil inversinya benar. */}
            <Area
              dataKey="estRainMmH"
              name="inversi"
              stroke="var(--rain-text)"
              strokeWidth={1.4}
              fill="var(--rain)"
              fillOpacity={0.28}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="trueRainMmH"
              name="sebenarnya"
              stroke="var(--text)"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine x={t} stroke="var(--text)" strokeWidth={1} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
