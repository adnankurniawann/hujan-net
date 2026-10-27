"use client";

import { useMemo } from "react";
import {
  Chip,
  ConsoleButton,
  Figure,
  GradientMeter,
  HelpDot,
  SectionLabel,
} from "@/components/ui/primitives";
import {
  AnimatedCard,
  CardBody,
  CardDescription,
  CardTitle,
  CardVisual,
  Visual,
} from "@/components/ui/animated-card-chart";
import type { RmsePoint } from "@/components/sim/useSimulation";
import { GRADE_TONE, errorMeterRatio, gradeOfAgreement, type ReportMetrics } from "./metrics";

/* Kartu skor: dua angka yang mengukur hal yang sama dari dua arah.
   `d` tidak bersatuan dan mudah dibaca; RMSE bersatuan dan bisa dibantah.
   Keduanya ditaruh berdampingan supaya yang mudah tidak menutupi yang jujur.

   Bidang visual di atasnya menggambar RMSE sepanjang kejadian — deret yang
   sama yang dipakai kartu tren, bukan batang hias. Menyorot kartu membuka
   skalanya penuh dan menuliskan apa yang sedang dilihat. */

export default function ScoreCard({
  m,
  series,
  onOpenComparison,
}: {
  m: ReportMetrics;
  series: RmsePoint[];
  onOpenComparison: () => void;
}) {
  const grade = gradeOfAgreement(m.agreement);
  const values = useMemo(() => series.map((p) => p.rmse), [series]);

  return (
    <AnimatedCard>
      <CardVisual>
        <Visual
          accent="rain"
          series={values}
          seriesLabel="Galat rekonstruksi sepanjang kejadian"
          seriesDetail="RMSE tiap langkah waktu, dalam mm/jam. Sumbu tegaknya diskalakan ke galat terbesar kejadian ini."
          emptyLabel="Riwayat galat muncul setelah kejadian mulai berjalan."
          chips={[
            {
              value: m.agreement === null ? "—" : m.agreement.toFixed(2),
              label: "Indeks kesesuaian d",
              accent: "ok",
            },
            { value: `${m.rmse.toFixed(2)} mm/jam`, label: "RMSE berjalan", accent: "rain" },
          ]}
        />
      </CardVisual>

      <CardBody className="gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <CardTitle>Skor Kesesuaian Medan</CardTitle>
            <HelpDot hint="Indeks kesesuaian Willmott (d) antara medan hujan sebenarnya hasil simulasi dan medan hasil rekonstruksi, dihitung atas seluruh sel grid pada waktu berjalan." />
          </span>
          <ConsoleButton onClick={onOpenComparison} className="shrink-0">
            Buka perbandingan
            <span aria-hidden className="text-text-dim">
              ›
            </span>
          </ConsoleButton>
        </div>

        <CardDescription>
          {grade === null ? (
            <>Cerah pada waktu berjalan — belum ada medan hujan yang bisa dinilai.</>
          ) : (
            <>
              Indeks kesesuaian{" "}
              <span className="tnum text-text-mute">{m.agreement!.toFixed(2)}</span> setara galat{" "}
              <span className="tnum text-text-mute">{m.rmse.toFixed(2)}</span> mm/jam pada puncak
              medan <span className="tnum text-text-mute">{m.peakTruth.toFixed(1)}</span> mm/jam.
            </>
          )}
        </CardDescription>

      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Figure value={m.agreement} decimals={2} size="lg" tone="default" />
          <SectionLabel>Indeks Kesesuaian d</SectionLabel>
        </div>

        <div className="flex flex-col items-end gap-1">
          <Figure value={m.rmse} unit="mm/jam" decimals={2} size="sm" tone="rain" />
          <SectionLabel>RMSE Berjalan</SectionLabel>
        </div>

        {grade === null ? (
          <Chip tone="mute" className="mb-1">
            belum dinilai
          </Chip>
        ) : (
          <Chip tone={GRADE_TONE[grade]} dot className="mb-1">
            {grade}
          </Chip>
        )}
      </div>

      <div>
        <GradientMeter
          ratio={errorMeterRatio(m)}
          ticks={["Galat rendah", "Sedang", "Galat tinggi"]}
          ariaLabel={`Galat ${m.rmse.toFixed(2)} mm per jam terhadap puncak medan ${m.peakTruth.toFixed(1)} mm per jam`}
        />
      </div>
      </CardBody>
    </AnimatedCard>
  );
}
