import { LEGEND_STOPS, RAIN_SCALE_MAX_MMH, rainCss } from "./colorRamp";
import { SectionLabel } from "@/components/ui/primitives";

/* Gradien legenda dicuplik dari rainColor() yang sama dengan yang melukis
   heatmap dan kedua kanvas perbandingan, jadi legenda tidak bisa melenceng
   dari peta. Batangnya berdiri di atas kertas peta yang terang, sama seperti
   heatmap-nya, supaya nilai 0 terbaca sebagai benar-benar bening. */
const GRADIENT = Array.from({ length: 31 }, (_, i) => {
  const v = (i / 30) * RAIN_SCALE_MAX_MMH;
  return `${rainCss(v)} ${((v / RAIN_SCALE_MAX_MMH) * 100).toFixed(1)}%`;
}).join(", ");

export default function RainLegend({ label }: { label: string }) {
  return (
    <div className="glass w-[300px] px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>{label}</SectionLabel>
        <span className="text-3xs text-text-dim">mm/jam</span>
      </div>
      <div
        className="mt-2 h-2.5 w-full rounded-full border border-hairline bg-surface"
        style={{ backgroundImage: `linear-gradient(to right, ${GRADIENT})` }}
      />
      <div className="mt-1.5 flex justify-between">
        {LEGEND_STOPS.map((s, i) => (
          <span key={s} className="tnum text-3xs text-text-dim">
            {i === LEGEND_STOPS.length - 1 ? `≥${s}` : s}
          </span>
        ))}
      </div>
    </div>
  );
}
