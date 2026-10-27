// GET /api/sim/link/<id>  ->  deret waktu lengkap satu tautan
//
// Tambahan di luar daftar A5, dibuat karena panel detail tautan B4 memerlukan
// deret waktu daya terima, garis dasar, redaman, dan hasil inversi sekaligus.
// Tanpa endpoint ini panel itu harus menyusun deretnya sendiri dengan memanggil
// /api/sim ratusan kali.

import { NextResponse } from "next/server";

import { getLinkSeries } from "../../store";

export const dynamic = "force-dynamic";

export function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const series = getLinkSeries(id);

  if (!series) {
    return NextResponse.json(
      { error: `Tautan ${id} tidak ada pada topologi kejadian ini.` },
      { status: 404 },
    );
  }

  return NextResponse.json(series);
}
