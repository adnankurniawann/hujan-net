"use client";

/* ============================================================================
 * Pengukur utama laporan.
 *
 * Satu angka besar di tengah — indeks kesesuaian medan rekonstruksi — di dalam
 * satu busur yang menunjukkan sejauh mana perjalanannya dari 0 ke 1.
 *
 * Enam "satelit" yang dulu mengitari busur ini sudah dihapus. Keenamnya
 * menampilkan metrik yang sama persis dengan yang sudah digambar radar di
 * kolom kiri dan sudah ditulis sebagai angka di bawah radar itu — encoding
 * ketiga untuk satu himpunan data yang sama. Pada latar terang mereka juga
 * bertabrakan dengan busurnya. Yang dihapus di sini tidak hilang dari laporan:
 * setiap angkanya tetap ada di radar dan daftarnya.
 * ==========================================================================*/

const SWEEP_START = -170; // derajat, 0 = atas, positif searah jarum jam
const SWEEP_END = 170;
const SWEEP = SWEEP_END - SWEEP_START;

const VB = 320; // sisi viewBox
const C = VB / 2;
const R_TRACK = 116;
const R_TICK_IN = 100;
const R_TICK_OUT = 107;

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arcPath(r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = polar(r, fromDeg);
  const [x2, y2] = polar(r, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function AccuracyGauge({
  /** 0..1 */
  value,
  headline,
  caption,
  footnote,
}: {
  value: number;
  headline: string;
  caption: string;
  footnote: string;
}) {
  const frac = Math.max(0, Math.min(1, value));
  const endDeg = SWEEP_START + SWEEP * frac;
  const [px, py] = polar(R_TRACK, endDeg);

  /* Tanda skala tiap 17 derajat: cukup rapat untuk terbaca sebagai alat ukur,
     cukup jarang untuk tidak menjadi tekstur. */
  const ticks: number[] = [];
  for (let d = SWEEP_START; d <= SWEEP_END + 0.01; d += SWEEP / 20) ticks.push(d);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[360px]">
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="h-full w-full overflow-visible"
        aria-hidden
        focusable="false"
      >
        {/* Busur memakai satu rona saja — biru hujan yang menua ke arah ujung.
            Sebelumnya ia berakhir di ungu, warna yang di tempat lain berarti
            "kontrol aktif"; sebuah busur mutu tidak boleh dicat dengan warna
            kendali. */}
        <defs>
          <linearGradient id="gauge-arc" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--rain)" />
            <stop offset="100%" stopColor="var(--rain-text)" />
          </linearGradient>
        </defs>

        {/* tanda skala */}
        {ticks.map((d) => {
          const [x1, y1] = polar(R_TICK_IN, d);
          const [x2, y2] = polar(R_TICK_OUT, d);
          const passed = d <= endDeg;
          return (
            <line
              key={d}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={passed ? "rgba(15,32,51,0.34)" : "rgba(15,32,51,0.12)"}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* lintasan */}
        <path
          d={arcPath(R_TRACK, SWEEP_START, SWEEP_END)}
          fill="none"
          stroke="rgba(15,32,51,0.10)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* kemajuan */}
        {frac > 0.004 ? (
          <path
            d={arcPath(R_TRACK, SWEEP_START, endDeg)}
            fill="none"
            stroke="url(#gauge-arc)"
            strokeWidth="6"
            strokeLinecap="round"
          />
        ) : null}

        {/* penunjuk di ujung kemajuan */}
        <circle cx={px} cy={py} r="5.5" fill="var(--text)" />
        <circle cx={px} cy={py} r="10" fill="none" stroke="rgba(15,32,51,0.18)" />
      </svg>

      {/* ---- angka utama, di tengah lingkaran ---- */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
        {/* Tanpa tanda persen. Indeks Willmott tidak bersatuan dan rentangnya
            0..1; menuliskannya "96 %" mengundang pembacaan "96 % akurat", yaitu
            klaim yang tidak dibuat siapa pun di berkas ini. Angkanya ditulis
            apa adanya sebagai 0,96. */}
        <span className="figure text-5xl text-text">{headline}</span>
        <span className="mt-2 text-2xs font-medium uppercase tracking-caps text-text-mute">
          {caption}
        </span>
        <span className="mt-1 max-w-[22ch] text-3xs leading-4 text-text-dim">{footnote}</span>
      </div>
    </div>
  );
}
