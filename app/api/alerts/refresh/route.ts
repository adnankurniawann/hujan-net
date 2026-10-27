/**
 * POST /api/alerts/refresh
 *
 * Hitung ulang kandidat dari kejadian simulasi terkini, lalu simpan yang baru.
 * Aman dipanggil berulang: kandidat yang sudah ada tidak disentuh, jadi keputusan
 * operator tidak pernah dikembalikan ke `menunggu`.
 *
 * Lapisan simulasi sekarang sudah tersedia, jadi jalur normalnya menjawab 200 berisi
 * jumlah kandidat baru, jumlah yang sudah ada, dan `eventId`. Kode 503 tetap ada untuk
 * kegagalan sungguhan saat memuat kejadian, misalnya `data/links.json` tidak terbaca.
 */

import { NextResponse } from "next/server";
import { loadSimFrames, refreshAlertsFromFrames } from "@/lib/alerts/pipeline";
import { errorResponse } from "../_respond";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
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

  try {
    const result = await refreshAlertsFromFrames(frames, eventId);
    // `eventId` disertakan supaya pemanggil bisa langsung memfilter antrean tanpa
    // perlu memanggil /api/alerts/event lagi.
    return NextResponse.json({ ...result, eventId });
  } catch (err) {
    return errorResponse(err);
  }
}
