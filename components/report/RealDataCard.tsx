"use client";

import { Card, Chip, SectionLabel } from "@/components/ui/primitives";
import cnnResults from "@/ml/results/wetdry_cnn.json";
import lstmResults from "@/ml/results/wetdry_lstm.json";
import rainmapResults from "@/ml/results/rainmap.json";
import calibrateResults from "@/ml/results/calibrate.json";

/* ============================================================================
 * Satu-satunya kartu laporan yang TIDAK berasal dari simulasi.
 *
 * Angkanya dibaca dari ml/results/*.json, ditulis pipeline Python di ml/ saat
 * model dinilai pada data operator sungguhan (OpenRainER Italia, OpenMRG
 * Swedia) di bulan yang tidak pernah dipakai melatih. Melatih ulang model
 * memperbarui kartu ini; tidak ada angka yang ditulis tangan.
 * ==========================================================================*/

type Dataset = "openrainer" | "openmrg";
const DATASETS: { key: Dataset; label: string }[] = [
  { key: "openrainer", label: "Italia" },
  { key: "openmrg", label: "Swedia" },
];

const WETDRY_ROWS: { name: string; mcc: Record<Dataset, number>; note?: string }[] = [
  { name: "Aturan ambang lama", mcc: { openrainer: cnnResults.test.openrainer.rule.mcc, openmrg: cnnResults.test.openmrg.rule.mcc } },
  { name: "Random Forest", mcc: { openrainer: cnnResults.test.openrainer.rf.mcc, openmrg: cnnResults.test.openmrg.rf.mcc } },
  { name: "1D-CNN", mcc: { openrainer: cnnResults.test.openrainer.cnn.mcc, openmrg: cnnResults.test.openmrg.cnn.mcc } },
  {
    name: "LSTM · dipakai dasbor",
    mcc: { openrainer: lstmResults.test.openrainer.lstm.mcc, openmrg: lstmResults.test.openmrg.lstm.mcc },
    note: "*",
  },
];

const MAP_INPUT = rainmapResults.inputs.est_long.test;
const MAP_ORACLE = rainmapResults.inputs.oracle.test;
const MAP_ROWS = [
  { name: "IDW · dipakai dasbor", cml: MAP_INPUT.idw.rmse_wet, oracle: MAP_ORACLE.idw.rmse_wet },
  { name: "Ridge, terikat topologi", cml: MAP_INPUT.ridge.rmse_wet, oracle: MAP_ORACLE.ridge.rmse_wet },
  { name: "MLP per sel", cml: MAP_INPUT.mlp.rmse_wet, oracle: MAP_ORACLE.mlp.rmse_wet },
];

function best(values: number[], lowerIsBetter: boolean): number {
  return lowerIsBetter ? Math.min(...values) : Math.max(...values);
}

function Table({
  head,
  rows,
  lowerIsBetter,
}: {
  head: string[];
  rows: { name: string; values: number[]; note?: string }[];
  lowerIsBetter: boolean;
}) {
  const bests = head.slice(1).map((_, c) => best(rows.map((r) => r.values[c]), lowerIsBetter));
  return (
    <table className="w-full text-left text-3xs">
      <thead>
        <tr className="text-text-dim">
          {head.map((h, i) => (
            <th key={h} className={`pb-1.5 font-medium ${i > 0 ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-t border-hairline">
            <td className="py-1.5 text-text">
              {r.name}
              {r.note}
            </td>
            {r.values.map((v, c) => (
              <td
                key={c}
                className={`tnum py-1.5 text-right ${v === bests[c] ? "font-semibold text-ok" : "text-text"}`}
              >
                {v.toFixed(2)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RealDataCard() {
  const k = calibrateResults.params;
  const crossLow = 1 - calibrateResults.test.openrainer["disetel di openmrg"].total_ratio;
  return (
    <Card
      title="Uji pada Data Operator Sungguhan"
      hint="Model dinilai pada data redaman CML operator di Italia (OpenRainER, uji 2022) dan Swedia (OpenMRG, uji Agustus 2015), terhadap radar cuaca. Bulan uji tidak pernah dipakai melatih."
      aside={<Chip tone="ok">data sungguhan</Chip>}
      bodyClassName="grid grid-cols-3 gap-6 px-5 pb-5"
    >
      <div className="flex flex-col gap-2">
        <SectionLabel>Basah / kering · MCC, makin tinggi makin baik</SectionLabel>
        <Table
          head={["Metode", ...DATASETS.map((d) => d.label)]}
          rows={WETDRY_ROWS.map((r) => ({ name: r.name, note: r.note, values: DATASETS.map((d) => r.mcc[d.key]) }))}
          lowerIsBetter={false}
        />
        <p className="text-3xs leading-4 text-text-dim">
          * LSTM masih dilatih dengan label Swedia lama yang telat sekitar 6 menit, jadi angka
          Swedianya belum setara baris lain. Di Italia ia setara 1D-CNN.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Peta hujan Swedia · RMSE saat hujan, mm/jam</SectionLabel>
        <Table
          head={["Metode", "Dari CML", "Masukan sempurna"]}
          rows={MAP_ROWS.map((r) => ({ name: r.name, values: [r.cml, r.oracle] }))}
          lowerIsBetter
        />
        <p className="text-3xs leading-4 text-text-dim">
          {rainmapResults.covered_cells} sel radar 2 km, tautan di bawah 1 km dibuang. Di data
          sungguhan ketiganya hampir setara. MLP tidak dipasang di dasbor karena pada badai
          simulasi ia kalah dari IDW.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Kalibrasi per iklim</SectionLabel>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-3xs">
          <dt className="text-text-dim">Pengali k ITU, Italia</dt>
          <dd className="tnum text-right text-text">{k.openrainer.k_scale.toFixed(2)}</dd>
          <dt className="text-text-dim">Pengali k ITU, Swedia</dt>
          <dd className="tnum text-right text-text">{k.openmrg.k_scale.toFixed(2)}</dd>
          <dt className="text-text-dim">Redaman antena basah</dt>
          <dd className="tnum text-right text-text">
            {k.openrainer.waa_db.toFixed(1)} / {k.openmrg.waa_db.toFixed(1)} dB
          </dd>
        </dl>
        <p className="text-3xs leading-4 text-text-dim">
          Angka yang pas di satu negara meleset di negara lain: angka Swedia membuat total hujan
          Italia {(crossLow * 100).toFixed(0)} % terlalu rendah. Jaringan Indonesia perlu disetel dengan radar
          atau penakar hujan Indonesia sendiri.
        </p>
      </div>
    </Card>
  );
}
