// GET /api/sim?t=<detik>  ->  satu Snapshot
//
// Waktu harus jatuh tepat pada cuplikan kejadian, yaitu kelipatan langkah
// cuplikan. Permintaan di luar rentang atau bukan angka ditolak dengan 400 dan
// pesan yang menyebut rentang yang sah, supaya yang memanggil tidak perlu
// menebak.

import { NextResponse } from "next/server";

import { getSnapshot, timeRange } from "./store";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("t");
  const { min, max, step } = timeRange();

  const t = raw === null ? min : Number(raw);

  if (!Number.isFinite(t)) {
    return NextResponse.json(
      { error: `Parameter t harus angka dalam detik. Diterima: ${raw}` },
      { status: 400 },
    );
  }

  if (t < min || t > max) {
    return NextResponse.json(
      {
        error: `Waktu t = ${t} detik di luar rentang kejadian. Rentang yang sah ${min} sampai ${max} detik.`,
      },
      { status: 400 },
    );
  }

  const snapshot = getSnapshot(t);
  if (!snapshot) {
    return NextResponse.json(
      {
        error: `Waktu t = ${t} detik bukan waktu cuplikan. Pakai kelipatan ${step} detik.`,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(snapshot);
}
