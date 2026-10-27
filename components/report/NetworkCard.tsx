"use client";

import { useMemo } from "react";
import type { Link } from "@/lib/types";
import {
  Bar,
  Chip,
  HelpDot,
  Num,
  SectionLabel,
  StatusDot,
} from "@/components/ui/primitives";
import {
  AnimatedCard,
  CardBody,
  CardTitle,
  CardVisual,
  Visual,
} from "@/components/ui/animated-card-chart";
import type { ReportMetrics } from "./metrics";

/**
 * Jumlah penakar hujan konvensional di dalam kotak batas yang sama.
 *
 * Angka konfigurasi statis, sesuai catatan Bab 8 PRD: panel kerapatan memakai
 * angka konfigurasi, bukan entitas data baru. Satu penakar adalah keadaan nyata
 * wilayah hulu Ciliwung pada cakupan sekecil ini — dan justru itulah alasan
 * produk ini ada.
 */
const RAIN_GAUGES_IN_BBOX = 1;

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

function RatioRow({
  index,
  label,
  value,
  status,
  tone,
}: {
  index: number;
  label: string;
  value: string;
  status: string;
  tone: "ok" | "rain" | "signal";
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="tnum flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-3xs text-text-dim"
        >
          {index}
        </span>
        <span className="truncate text-2xs text-text-mute">{label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-3xs uppercase tracking-label text-text-dim">{status}</span>
        <span className={`tnum text-2xs ${tone === "ok" ? "text-ok-text" : tone === "signal" ? "text-signal-text" : "text-rain-text"}`}>
          {value}
        </span>
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

  /* Panjang tiap tautan, diurutkan. Inilah sebaran yang menentukan seberapa
     rapat jaringan menutup wilayah — besaran yang benar-benar dimiliki kartu
     ini, bukan angka hias. */
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
          seriesDetail="Tiap batang satu kelompok tautan, diurutkan dari terpendek ke terpanjang. Lintasan yang lebih panjang mengumpulkan redaman dari petak hujan yang lebih luas."
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
            <HelpDot hint="Tautan gelombang mikro antar menara telekomunikasi yang dipakai sebagai sensor hujan. Tidak ada perangkat baru yang dipasang — redamannya sudah ada di jaringan operator." />
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
            hint="Rata-rata redaman hujan pada tautan yang saat ini terklasifikasi basah, setelah koreksi garis dasar dan WAA."
          >
            <Num value={m.wetLinks > 0 ? m.meanAttenWet : null} unit="dB" decimals={2} tone="signal" className="text-2xs" />
          </Row>
          <Row
            label="Redaman puncak"
            hint="Redaman tertinggi di antara seluruh tautan pada waktu berjalan. Nilai inilah yang paling menentukan intensitas hasil inversi."
          >
            <Num value={m.peakAtten} unit="dB" decimals={2} tone="signal" className="text-2xs" />
          </Row>
          <Row
            label="Frekuensi"
            hint="Rentang frekuensi tautan. Semakin tinggi frekuensi, semakin peka redamannya terhadap hujan — itulah sebabnya pita 15 sampai 23 GHz dipakai."
          >
            <span className="tnum text-2xs text-text">
              {stats.fLo}–{stats.fHi}
              <span className="ml-1 font-sans text-text-dim">GHz</span>
            </span>
          </Row>
          <Row
            label="Panjang lintasan"
            hint="Rentang panjang lintasan antar menara. Total panjang menentukan seberapa luas wilayah yang tersapu jaringan pengukuran ini."
          >
            <span className="tnum text-2xs text-text">
              {stats.lLo.toFixed(2)}–{stats.lHi.toFixed(2)}
              <span className="ml-1 font-sans text-text-dim">km</span>
            </span>
          </Row>
        </ul>
      </div>

      {/* ---- dua rasio yang menjadi argumen produk ---- */}
      <ul className="flex flex-col gap-2.5 border-t border-hairline pt-4">
        <RatioRow
          index={1}
          label="Penakar hujan : tautan"
          status="kerapatan"
          value={`1 : ${Math.round(m.totalLinks / RAIN_GAUGES_IN_BBOX)}`}
          tone="ok"
        />
        <RatioRow
          index={2}
          label="Cakupan grid terekonstruksi"
          status={m.wetAreaRecon >= m.wetAreaTruth * 0.8 ? "memadai" : "terbatas"}
          value={`${(m.wetAreaRecon * 100).toFixed(0)} %`}
          tone={m.wetAreaRecon >= m.wetAreaTruth * 0.8 ? "ok" : "signal"}
        />
        <li className="flex items-start gap-2 pt-1">
          <StatusDot tone="dim" className="mt-1.5" />
          <p className="text-3xs leading-4 text-text-dim">
            Total <span className="tnum text-text-mute">{stats.totalKm.toFixed(0)}</span> km
            lintasan pengukuran di dalam kotak batas yang sama, dari{" "}
            <span className="tnum text-text-mute">{RAIN_GAUGES_IN_BBOX}</span> penakar hujan
            konvensional. Tidak ada sensor baru yang dipasang.
          </p>
        </li>
      </ul>
      </CardBody>
    </AnimatedCard>
  );
}
