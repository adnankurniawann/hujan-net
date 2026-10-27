/**
 * GET /api/alerts/event
 *
 * Mengembalikan `eventId` kejadian simulasi yang sedang berjalan.
 *
 * Ada karena antrean peringatan HARUS dibatasi ke satu kejadian. Tanpa itu, kandidat
 * dari kejadian lama ikut muncul di antrean operator. Panel di dasbor tidak bisa
 * menebak `eventId` sendiri, karena nilainya sidik jari dari tetapan simulasi.
 *
 * Pemakaian dari sisi klien:
 *
 *   const { eventId } = await fetch("/api/alerts/event").then((r) => r.json());
 *   const { alerts } = await fetch(`/api/alerts?eventId=${eventId}`).then((r) => r.json());
 */

import { NextResponse } from "next/server";
import { loadSimFrames } from "@/lib/alerts/pipeline";
import { errorResponse } from "../_respond";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const { eventId, frames } = await loadSimFrames();
    return NextResponse.json({
      eventId,
      durationS: frames.length > 0 ? frames[frames.length - 1].t : 0,
      frameCount: frames.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
