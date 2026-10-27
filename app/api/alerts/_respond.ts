/**
 * Pemetaan galat lapisan peringatan ke tanggapan HTTP.
 *
 * App Router hanya memperlakukan nama berkas khusus seperti `route.ts` sebagai
 * endpoint, jadi berkas ini aman berada di dalam folder rute. Awalan garis bawah
 * dipakai sekadar penanda bagi pembaca. Diletakkan di sini, bukan di `lib/alerts/`,
 * karena isinya urusan HTTP, bukan aturan bisnis.
 */

import { NextResponse } from "next/server";
import { AlertError } from "@/lib/alerts";
import type { AlertErrorCode } from "@/lib/alerts";

const HTTP_STATUS: Record<AlertErrorCode, number> = {
  NOT_FOUND: 404,
  ALREADY_DECIDED: 409,
  INVALID_INPUT: 400,
};

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AlertError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: HTTP_STATUS[err.code] },
    );
  }
  const message = err instanceof Error ? err.message : "Galat tidak dikenal";
  return NextResponse.json({ error: message, code: "INTERNAL" }, { status: 500 });
}

/** Baca `by` dan `note` dari badan permintaan JSON, tanpa mengasumsikan bentuknya. */
export async function readDecisionBody(req: Request): Promise<{ by: string; note?: string }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AlertError("INVALID_INPUT", 'Badan permintaan harus JSON berisi { "by": "nama operator" }');
  }
  const body = raw as { by?: unknown; note?: unknown };
  if (typeof body?.by !== "string" || body.by.trim().length === 0) {
    throw new AlertError("INVALID_INPUT", 'Bidang "by" wajib diisi nama operator yang memutuskan');
  }
  return {
    by: body.by,
    note: typeof body.note === "string" && body.note.trim() ? body.note : undefined,
  };
}
