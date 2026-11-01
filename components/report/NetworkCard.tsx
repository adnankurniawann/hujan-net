"use client";

import { useMemo } from "react";
import type { Link } from "@/lib/types";
import {
  Bar,
  Chip,
  HelpDot,
  Num,
  SectionLabel,
} from "@/components/ui/primitives";
import {
  AnimatedCard,
  CardBody,
  CardTitle,
  CardVisual,
  Visual,
} from "@/components/ui/animated-card-chart";
import type { ReportMetrics } from "./metrics";

function range(values: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2 last:border-b-0">
      <span className="min-w-0 truncate text-2xs text-text-mute">{label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {children}
        <HelpDot hint={hint} />
      </span>
    </li>
  );
}

export default function NetworkCard({ links, m }: { links: Link[]; m: ReportMetrics }) {
  const stats = useMemo(() => {
    const [fLo, fHi] = range(links.map((l) => l.freqGHz));
    const [lLo, lHi] = range(links.map((l) => l.lengthKm));
    const totalKm = links.reduce((s, l) => s + l.lengthKm, 0);
    return { fLo, fHi, lLo, lHi, totalKm };
  }, [links]);

  const wetRatio = m.totalLinks > 0 ? m.wetLinks / m.totalLinks : 0;

  const lengths = useMemo(
    () => links.map((l) => l.lengthKm).sort((a, b) => a - b),
    [links],
  );

  return (
    <AnimatedCard>
      <CardVisual>
        <Visual
          accent="signal"
          series={lengths}
          seriesLabel="Sebaran panjang lintasan tautan"
          seriesDetail="Satu batang per kelompok tautan, dari terpendek ke terpanjang."
          emptyLabel="Belum ada topologi tautan yang dimuat."
          chips={[
            { value: `${m.wetLinks}/${m.totalLinks}`, label: "Tautan basah", accent: "signal" },
            {
              value: `${stats.totalKm.toFixed(0)} km`,
              label: "Total panjang lintasan",
              accent: "signal",
            },
          ]}
        />
      </CardVisual>

      <CardBody className="gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <CardTitle>Jaringan Tautan</CardTitle>
            <HelpDot hint="Tautan gelombang mikro antarmenara telekomunikasi. Hujan meredam sinyalnya, dan redaman itu yang kami ukur. Operator sudah mencatatnya, jadi tidak perlu alat baru." />
          </span>
          <Chip tone="rain" className="shrink-0">
            {m.totalLinks} tautan
          </Chip>
        </div>
      <div className="grid grid-cols-[124px_minmax(0,1fr)] gap-4">
        {/* ---- angka utama kartu ---- */}
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5">
            <SectionLabel>Basah / Total</SectionLabel>
          </span>
          <span className="figure text-3xl text-signal-text">
            {m.wetLinks}
            <span className="ml-1 font-sans text-sm font-normal text-text-dim">
              /{m.totalLinks}
            </span>
          </span>
          <Bar ratio={wetRatio} tone="signal" />
          <span className="text-3xs leading-4 text-text-dim">
            <span className="tnum">{(wetRatio * 100).toFixed(0)}</span> % tautan sedang melintasi
            hujan
          </span>
        </div>

        {/* ---- rentang dan nilai berjalan ---- */}
        <ul className="card-inset">
          <Row
            label="Redaman rata-rata (basah)"
            hint="Rata-rata redaman hujan pada tautan basah, setelah dikurangi garis dasar dan redaman antena basah."
          >
            <Num value={m.wetLinks > 0 ? m.meanAttenWet : null} unit="dB" decimals={2} tone="signal" className="text-2xs" />
          </Row>
          <Row
            label="Redaman puncak"
            hint="Redaman tertinggi di antara semua tautan pada waktu ini."
          >
            <Num value={m.peakAtten} unit="dB" decimals={2} tone="signal" className="text-2xs" />
          </Row>
          <Row
            label="Frekuensi"
            hint="Makin tinggi frekuensinya, makin peka tautan terhadap hujan."
          >
            <span className="tnum text-2xs text-text">
              {stats.fLo}–{stats.fHi}
              <span className="ml-1 font-sans text-text-dim">GHz</span>
            </span>
          </Row>
          <Row
            label="Panjang lintasan"
            hint="Jarak antarmenara. Lintasan panjang merata-ratakan hujan sepanjang jalurnya."
          >
            <span className="tnum text-2xs text-text">
              {stats.lLo.toFixed(2)}–{stats.lHi.toFixed(2)}
              <span className="ml-1 font-sans text-text-dim">km</span>
            </span>
          </Row>
        </ul>
      </div>

      </CardBody>
    </AnimatedCard>
  );
}
