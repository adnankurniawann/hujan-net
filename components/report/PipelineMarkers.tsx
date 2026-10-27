"use client";

import { Card, SectionLabel, StatusDot, type Tone } from "@/components/ui/primitives";
import { IDW_NEIGHBOURS, IDW_POWER } from "@/components/preview/engine";

/* ============================================================================
 * Rantai fisika dan inversi, ditulis apa adanya.
 *
 * Kartu ini menjawab pertanyaan pertama juri peneliti: "apa isi modelnya?".
 * Karena itu isinya rumus dan tetapan yang benar-benar dipakai jalur kode,
 * bukan nama teknologi. Tetapan IDW diimpor dari mesinnya, jadi kalau K atau p
 * diubah di sana, kartu ini ikut berubah tanpa ada yang perlu ingat.
 * ==========================================================================*/

interface Marker {
  step: string;
  name: string;
  detail: string;
  tone: Tone;
}

export default function PipelineMarkers({
  nx,
  ny,
  totalLinks,
  wetDryAccuracy,
}: {
  nx: number;
  ny: number;
  totalLinks: number;
  wetDryAccuracy: number;
}) {
  const forward: Marker[] = [
    {
      step: "F1",
      name: "Medan Hujan Sintetis",
      detail: "sel hujan bergerak, kebenaran dasar",
      tone: "rain",
    },
    {
      step: "F2",
      name: "ITU-R P.838",
      detail: "γ = k · R^α",
      tone: "signal",
    },
    {
      step: "F3",
      name: "Redaman Lintasan",
      detail: `A = ∫γ dl · ${totalLinks} tautan`,
      tone: "signal",
    },
  ];

  const inverse: Marker[] = [
    {
      step: "I1",
      name: "Klasifikasi Basah/Kering",
      detail: `akurasi ${(wetDryAccuracy * 100).toFixed(1)} %`,
      tone: "ok",
    },
    {
      step: "I2",
      name: "Garis Dasar & Koreksi WAA",
      detail: "baseline kering, redaman antena basah",
      tone: "signal",
    },
    {
      step: "I3",
      name: "Retrieval R dari A",
      detail: "R = (A / (k·L))^(1/α)",
      tone: "rain",
    },
    {
      step: "I4",
      name: "Interpolasi Grid (IDW)",
      detail: `K=${IDW_NEIGHBOURS}, p=${IDW_POWER}, ${nx}×${ny} sel`,
      tone: "rain",
    },
  ];

  return (
    <Card
      title="Rantai Model"
      hint="Urutan langkah yang benar-benar dijalankan tiap satu detik simulasi: model maju menurunkan redaman dari medan hujan, model invers merekonstruksi medan hujan kembali dari redaman itu."
      bodyClassName="flex flex-col gap-4 px-5 pb-5"
    >
      <Group label="Model Maju — Medan → Redaman" markers={forward} />
      <Group label="Model Invers — Redaman → Medan" markers={inverse} />
    </Card>
  );
}

function Group({ label, markers }: { label: string; markers: Marker[] }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <StatusDot tone={markers[0].tone} />
        <SectionLabel>{label}</SectionLabel>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {markers.map((m) => (
          <li key={m.step} className="flex min-w-0 items-baseline gap-2">
            <span className="tnum shrink-0 text-3xs text-text-dim">{m.step}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-2xs text-text">{m.name}</span>
              <span className="tnum truncate text-3xs text-text-dim">{m.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
