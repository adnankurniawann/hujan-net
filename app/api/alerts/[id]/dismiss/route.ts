/**
 * POST /api/alerts/:id/dismiss
 *
 * Badan: { "by": "nama operator", "note": "alasan singkat" }
 *
 * `note` opsional. Pengabaian dicatat selengkap konfirmasi, karena keputusan untuk
 * TIDAK meneruskan peringatan sama pentingnya untuk diaudit.
 */

import { NextResponse } from "next/server";
import { dismissAlert } from "@/lib/alerts";
import { errorResponse, readDecisionBody } from "../../_respond";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const { by, note } = await readDecisionBody(req);
    const alert = await dismissAlert(params.id, by, note);
    return NextResponse.json({ alert });
  } catch (err) {
    return errorResponse(err);
  }
}
