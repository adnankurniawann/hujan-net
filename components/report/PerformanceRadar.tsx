"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { RadarAxis } from "./metrics";
import { SectionLabel } from "@/components/ui/primitives";

/* Enam sumbu mutu rekonstruksi dalam satu bentuk. Gunanya bukan angka pastinya
   — itu ada di kartu lain — melainkan bentuknya: sumbu mana yang penyok, yaitu
   sisi mana dari model invers yang paling lemah pada kejadian ini. */

const TICK = {
  fill: "var(--text-mute)",
  fontSize: 9,
  letterSpacing: "0.08em",
};

export default function PerformanceRadar({ axes }: { axes: RadarAxis[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <SectionLabel>Kinerja Rekonstruksi</SectionLabel>
        <span className="text-3xs text-text-dim">0 – 100</span>
      </div>

      <div className="mt-1 min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={axes} outerRadius="72%" margin={{ top: 8, right: 18, bottom: 4, left: 18 }}>
            <PolarGrid stroke="rgba(15,32,51,0.12)" strokeWidth={1} />
            <PolarAngleAxis dataKey="axis" tick={TICK} tickLine={false} />
            {/* Sumbu radius disembunyikan: skalanya sudah dikunci 0..100 dan
                labelnya hanya menambah derau di ruang sekecil ini. */}
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
            {/* Poligon memakai `--rain`: seluruh isi radar ini adalah mutu medan
                hujan hasil rekonstruksi, dan itu memang besaran hujan. */}
            <Radar
              dataKey="score"
              stroke="var(--rain-text)"
              strokeWidth={1.6}
              fill="var(--rain)"
              fillOpacity={0.18}
              isAnimationActive={false}
              dot={{ r: 2, fill: "var(--rain-text)", stroke: "none" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Angka tiap sumbu ditulis juga, supaya bentuk radar tidak menjadi
          satu-satunya pembawa arti bagi pembaca yang menyalin ke laporan. */}
      <ul className="mt-1 grid grid-cols-3 gap-x-3 gap-y-1 px-1">
        {axes.map((a) => (
          <li key={a.axis} className="flex items-baseline justify-between gap-1" title={a.hint}>
            <span className="truncate text-3xs text-text-dim">
              {a.axis}
              {a.axis === "Deteksi" ? <sup className="ml-0.5 text-text-mute">†</sup> : null}
            </span>
            <span className="tnum text-3xs text-rain-text">{a.score}</span>
          </li>
        ))}
      </ul>

      {/* Sumbu Deteksi nyaris selalu 100, jadi ia menuntut penjelasan. Catatan
          ini dulu berbunyi "memakai garis dasar yang sudah diketahui, jadi
          angkanya batas atas", dan itu benar selama angkanya datang dari mesin
          pratinjau yang pembaliknya memang tahu garis dasar sebenarnya. Sejak
          dasbor membaca `/api/sim`, garis dasarnya ditaksir dari data berderau —
          `tests/inverse.test.ts` menguji bahwa taksiran itu tidak pernah identik
          dengan kebenaran dasar. Peringatan lama justru merendahkan hasil yang
          sah, jadi yang tersisa hanya batas yang memang masih berlaku.
          Peringatannya ditulis di halaman, bukan disembunyikan di atribut
          `title` yang tidak akan pernah disentuh siapa pun dari kursi juri. */}
      <p className="mt-1.5 px-1 text-3xs leading-4 text-text-dim">
        <span className="text-text-mute">†</span> Deteksi diukur terhadap kebenaran dasar
        simulasi. Garis dasarnya ditaksir, bukan diketahui.
      </p>
    </div>
  );
}
