// GET /api/sim/event  ->  seluruh kejadian sekaligus: { times, snapshots }
//
// Tambahan di luar daftar A5, dengan alasan yang sama seperti endpoint per
// tautan: tanpa ini dasbor harus memanggil /api/sim 241 kali untuk mendapat satu
// kejadian utuh.
//
// KENAPA PRAAMBIL, BUKAN AMBIL PER BINGKAI. Pemutar ulang berjalan sampai 20x,
// yang berarti satu bingkai baru tiap 0,75 detik waktu nyata. Mengambil per
// bingkai membuat kemulusan peta bergantung pada latensi HTTP di laptop yang
// sedang juga merender peta; satu jeda saja terlihat sebagai peta yang tersendat
// tepat di depan juri. Seluruh kejadian berukuran sekitar 3,9 MB setelah
// pembulatan `payload.ts`, dan itu diambil sekali di layar "Menyiapkan kejadian"
// yang memang sudah ada.
//
// Perhitungannya sendiri tidak diulang: `getEvent()` menyinggahkan kejadian di
// memori proses, jadi endpoint ini hanya membentuk muatan JSON.

import { NextResponse } from "next/server";

import { getEvent } from "../store";
import { toSnapshotPayload } from "@/lib/sim/payload";

export const dynamic = "force-dynamic";

export function GET() {
  const event = getEvent();
  return NextResponse.json({
    times: event.times,
    snapshots: event.snapshots.map(toSnapshotPayload),
  });
}
