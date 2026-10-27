/**
 * POST /api/alerts/:id/confirm
 *
 * Badan: { "by": "nama operator" }
 *
 * Ini satu satunya jalan menuju status `dikonfirmasi`. Konfirmasi TIDAK menyiarkan
 * apa pun. Yang terjadi hanyalah keputusan operator tercatat, lengkap dengan siapa
 * dan kapan, sehingga bisa dipertanggungjawabkan di kemudian hari.
 */

import { NextResponse } from "next/server";
import { confirmAlert } from "@/lib/alerts";
import { errorResponse, readDecisionBody } from "../../_respond";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const { by } = await readDecisionBody(req);
    const alert = await confirmAlert(params.id, by);
    return NextResponse.json({ alert });
  } catch (err) {
    return errorResponse(err);
  }
}
