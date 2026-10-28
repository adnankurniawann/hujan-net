// Membandingkan IDW, operator ridge, dan MLP peta hujan pada kejadian demo.
//
// Jalankan:  node scripts/compare-rainmap.ts
//
// MLP (lib/ml/rainmap.ts) dilatih pada data sungguhan OpenMRG dan tidak terikat
// topologi. Skrip ini yang menunjukkan ia TIDAK pindah ke badai demo, jadi tidak
// dipasang di dasbor (ARSITEKTUR.md 9.7). Baris "sempurna" memakai hujan
// sebenarnya sepanjang lintasan, untuk memisahkan galat peta dari galat per tautan.

import { readFileSync } from "node:fs";
import type { Link } from "../lib/types.ts";
import { buildIdwKernel, computeBias, computeRmse, invertSeries, reconstructField } from "../lib/inverse/index.ts";
import { simulateEvent } from "../lib/sim/forward.ts";
import { rainFieldAt } from "../lib/sim/rainField.ts";
import { DEMO_STORM, EVENT_GRID } from "../lib/sim/scenario.ts";
import { loadOperator, loadRainMapModel, loadWetDryModel } from "../lib/ml/loadOperator.ts";
import { applyLinearOperator } from "../lib/ml/operator.ts";
import { buildRainMapKernel, reconstructFieldMl } from "../lib/ml/rainmap.ts";

const links = JSON.parse(readFileSync("data/links.json", "utf8")) as Link[];
const event = simulateEvent(links, { storm: DEMO_STORM });
const series = invertSeries(event, { wetDryModel: loadWetDryModel() });
const operator = loadOperator();
const model = loadRainMapModel();
const idwKernel = buildIdwKernel(links, EVENT_GRID);
const mlKernel = buildRainMapKernel(links, EVENT_GRID, model);
const linkIndex = new Map(links.map((l, i) => [l.id, i]));

const sums: Record<string, [number, number]> = {};
const add = (name: string, truth: Parameters<typeof computeRmse>[0], field: Parameters<typeof computeRmse>[1]) => {
  const s = (sums[name] ??= [0, 0]);
  s[0] += computeRmse(truth, field);
  s[1] += computeBias(truth, field);
};

for (let i = 0; i < event.times.length; i++) {
  const truth = rainFieldAt(DEMO_STORM, event.times[i], EVENT_GRID);
  for (const [input, key] of [["LSTM", "estRainMmH"], ["sempurna", "trueRainMmH"]] as const) {
    const rain = links.map((l) => series.get(l.id)?.[key][i] ?? 0);
    const idw = reconstructField(idwKernel, rain);
    add(`IDW, masukan ${input}`, truth, idw);
    add(`MLP, masukan ${input}`, truth, reconstructFieldMl(mlKernel, model, rain, idw));
    if (input === "LSTM") {
      add("Ridge, masukan LSTM", truth, applyLinearOperator(operator, operator.linkIds.map((id) => rain[linkIndex.get(id) ?? -1] ?? 0)));
    }
  }
}

const n = event.times.length;
console.log("| Metode | RMSE rata-rata (mm/jam) | Bias rata-rata (mm/jam) |\n|---|---|---|");
for (const [name, [rmse, bias]] of Object.entries(sums)) {
  console.log(`| ${name} | ${(rmse / n).toFixed(2)} | ${(bias / n).toFixed(2)} |`);
}
