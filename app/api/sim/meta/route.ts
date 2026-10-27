// GET /api/sim/meta  ->  daftar tautan, kotak batas, durasi kejadian, dan angka
// mutu rekonstruksi. Dipanggil sekali saat dasbor dimuat.

import { NextResponse } from "next/server";

import { getMeta } from "../store";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getMeta());
}
