/**
 * GET  /api/alerts               daftar antrean peringatan
 * POST /api/alerts/refresh       lihat berkas refresh/route.ts
 *
 * Sengaja TIDAK ada POST untuk membuat peringatan secara manual. Kandidat hanya
 * boleh lahir dari pelampauan ambang yang terhitung, bukan dari permintaan HTTP,
 * supaya tidak ada jalur yang bisa menyuntik peringatan palsu ke antrean operator.
 */

import { NextResponse } from "next/server";
import { listAlerts } from "@/lib/alerts";
import type { AlertStatus } from "@/lib/types";
import { errorResponse } from "./_respond";

/** Antrean berubah setiap kali operator memutuskan, jadi jangan disinggahkan. */
export const dynamic = "force-dynamic";

const VALID_STATUS: ReadonlySet<string> = new Set<AlertStatus>([
  "menunggu",
  "dikonfirmasi",
  "diabaikan",
]);

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const eventId = url.searchParams.get("eventId") ?? undefined;

    if (status !== undefined && !VALID_STATUS.has(status)) {
      return NextResponse.json(
        {
          error: `Nilai status "${status}" tidak dikenal. Pakai menunggu, dikonfirmasi, atau diabaikan`,
          code: "INVALID_INPUT",
        },
        { status: 400 },
      );
    }

    const alerts = await listAlerts({
      status: status as AlertStatus | undefined,
      eventId,
    });
    return NextResponse.json({ alerts });
  } catch (err) {
    return errorResponse(err);
  }
}
