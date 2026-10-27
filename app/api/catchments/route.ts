/**
 * GET /api/catchments?t=<detik>   satu bingkai
 * GET /api/catchments?all=1       seluruh kejadian sekaligus
 *
 * Mengembalikan `CatchmentState[]`. Endpoint ini ada karena `Snapshot` pada kontrak
 * data tidak memuat status DAS, sehingga panel C3 tidak punya sumber lain.
 *
 * KENAPA ADA RAGAM `all=1`.
 *
 * Sampai 31 Juli 2026 panel DAS di dasbor menghitung akumulasinya sendiri di
 * peramban, dari medan hujan mesin pratinjau, sementara antrean peringatan lahir
 * dari `lib/catchment` + `lib/alerts` di sini. Keduanya memakai kejadian contoh yang
 * BERBEDA, dan bukan sekadar berbeda besaran: mesin pratinjau menggerakkan badai dari
 * barat daya ke timur laut, `DEMO_STORM` di `lib/sim/scenario.ts` menggerakkannya dari
 * tenggara ke barat laut. Peringkat DAS-nya terbalik. Terukur pada grid yang benar
 * benar dipakai dasbor: pratinjau memberi C-01 28,4 mm dan C-02 6,6 mm, pipeline di
 * sini memberi C-01 5,1 mm dan C-02 9,4 mm.
 *
 * Begitu keputusan operator pindah ke SQLite, perbedaan itu menjadi kontradiksi yang
 * terlihat: panel bertuliskan "Cisarua SIAGA" tanpa satu pun peringatan Cisarua, di
 * sebelah antrean yang menerbitkan peringatan Megamendung yang panel yang sama sebut
 * normal. Ragam `all=1` menutupnya dengan membuat panel membaca perhitungan yang sama
 * dengan yang melahirkan kandidat.
 *
 * Seluruh kejadian dikirim sekali, bukan satu bingkai per permintaan, karena panel
 * harus mengikuti penggeser waktu sampai kecepatan 20x. Memanggil server tiap bingkai
 * membuat status DAS tertinggal di belakang peta. Muatannya kecil: 241 bingkai kali
 * tiga DAS.
 *
 * Langkah cuplik mengikuti `sampleIntervalSec` pada `data/catchment-config.json`,
 * yaitu 15 detik. Pendeteksian kandidat di `lib/alerts/pipeline.ts` berjalan pada
 * kelipatan 60 detik, dan 60 kelipatan 15, jadi setiap `raisedAt` kandidat selalu
 * jatuh tepat pada salah satu bingkai di sini.
 */

import { NextResponse } from "next/server";
import { buildRainSeries, catchmentStatesAt, loadCatchmentData } from "@/lib/catchment";
import { loadSimFrames } from "@/lib/alerts/pipeline";

export const dynamic = "force-dynamic";

/**
 * Singgahan rangkaian status seluruh kejadian.
 *
 * Menyusunnya menuntut `buildRainSeries` atas 241 bingkai lalu 241 kali
 * `catchmentStatesAt`, dan terukur memakan 2,4 detik. Itu sekali per pemuatan
 * halaman, tetapi 2,4 detik adalah 2,4 detik ketika panel DAS masih kosong
 * sementara petanya sudah hidup. Kejadiannya deterministik dan berkas datanya
 * statis sepanjang umur proses, jadi hasilnya cukup dihitung sekali.
 *
 * Dikunci pada `eventId`: kalau tetapan simulasi berubah, sidik jarinya berubah
 * dan singgahan ini ikut gugur dengan sendirinya.
 */
let cachedTimeline: { eventId: string; body: unknown } | null = null;

export async function GET(req: Request): Promise<NextResponse> {
  const params = new URL(req.url).searchParams;
  const all = params.get("all") === "1";
  const raw = params.get("t");
  const t = raw === null ? 0 : Number(raw);
  if (!all && (!Number.isFinite(t) || t < 0)) {
    return NextResponse.json(
      { error: `Parameter t harus angka detik tidak negatif, diterima "${raw}"`, code: "INVALID_INPUT" },
      { status: 400 },
    );
  }

  let frames;
  let eventId: string;
  try {
    ({ frames, eventId } = await loadSimFrames());
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Sumber simulasi tidak tersedia",
        code: "SIM_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  if (all && cachedTimeline?.eventId === eventId) {
    return NextResponse.json(cachedTimeline.body);
  }

  try {
    const { catchments, config } = loadCatchmentData();
    const series = buildRainSeries(frames, catchments, config);

    if (!all) {
      return NextResponse.json({ t, catchments: catchmentStatesAt(series, t, config) });
    }

    const stepS = config.sampleIntervalSec;
    const durationS = frames.length > 0 ? frames[frames.length - 1].t : 0;
    const timeline = [];
    for (let step = 0; step * stepS <= durationS; step++) {
      const tf = step * stepS;
      timeline.push({ t: tf, states: catchmentStatesAt(series, tf, config) });
    }

    const body = { eventId, stepS, durationS, frames: timeline };
    cachedTimeline = { eventId, body };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Galat tidak dikenal", code: "INTERNAL" },
      { status: 500 },
    );
  }
}
