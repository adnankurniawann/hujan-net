/**
 * Penyimpanan antrean peringatan ke SQLite lewat Prisma.
 *
 * HANYA UNTUK SISI SERVER.
 *
 * ATURAN TATA KELOLA YANG DITEGAKKAN DI SINI
 * 1. `syncCandidates` hanya bisa membuat baris berstatus `menunggu`. Tidak ada
 *    parameter status, jadi tidak ada cara memanggilnya untuk membuat peringatan
 *    yang sudah dianggap disetujui.
 * 2. Status hanya bisa berubah lewat `confirmAlert` atau `dismissAlert`, dan
 *    keduanya menuntut identitas operator yang tidak kosong.
 * 3. `publishableAlerts` adalah satu satunya pintu menuju "boleh disiarkan", dan
 *    pintu itu menuntut status `dikonfirmasi` sekaligus `decidedBy` terisi.
 *    Di luar itu, proyek ini memang tidak punya saluran keluar apa pun. Tidak ada
 *    pengirim SMS, surel, maupun webhook. Ketiadaan itu disengaja.
 */

import type { AlertStatus } from "../types.ts";
import { prisma } from "./prisma.ts";
import { AlertError } from "./types.ts";
import type { AlertLevel, AlertRecord, AlertSeed } from "./types.ts";
import type { WindowKey } from "../catchment/index.ts";

/** Bentuk baris mentah yang dipakai pemeta di bawah. */
interface AlertRow {
  id: string;
  eventId: string;
  catchmentId: string;
  level: string;
  windowKey: string;
  raisedAtSec: number;
  accumMm: number;
  thresholdMm: number;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  note: string | null;
}

/**
 * Petakan baris basis data ke bentuk kontrak data.
 *
 * `raisedAt` pada kontrak adalah detik simulasi, sedangkan `confirmedAt` adalah
 * waktu dinding dalam milidetik epoch. Keduanya memang beda sumbu waktu, karena
 * ambang terlampaui pada waktu simulasi sementara operator menekan tombol pada
 * waktu nyata. Panel C3 harus memformat keduanya dengan cara berbeda.
 */
function toRecord(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    eventId: row.eventId,
    catchmentId: row.catchmentId,
    level: row.level as AlertLevel,
    windowKey: row.windowKey as WindowKey,
    raisedAt: row.raisedAtSec,
    accumMm: row.accumMm,
    thresholdMm: row.thresholdMm,
    status: row.status as AlertStatus,
    confirmedBy: row.decidedBy ?? undefined,
    confirmedAt: row.decidedAt ? row.decidedAt.getTime() : undefined,
    note: row.note ?? undefined,
  };
}

/**
 * Simpan bibit kandidat hasil `detectCandidates`.
 *
 * Memakai upsert dengan blok `update` kosong. Artinya, kandidat yang sudah ada
 * TIDAK disentuh sama sekali. Ini penting: memutar ulang kejadian yang sama tidak
 * boleh mengembalikan kandidat yang sudah dikonfirmasi atau diabaikan operator
 * kembali ke `menunggu`.
 *
 * @returns jumlah baris yang benar benar baru
 */
export async function syncCandidates(seeds: ReadonlyArray<AlertSeed>): Promise<{
  created: number;
  existing: number;
}> {
  if (seeds.length === 0) return { created: 0, existing: 0 };

  const ids = seeds.map((s) => s.id);
  const before = await prisma.alert.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const known = new Set(before.map((r) => r.id));

  for (const seed of seeds) {
    if (known.has(seed.id)) continue;
    await prisma.alert.upsert({
      where: { id: seed.id },
      // Tidak ada `status` di sini. Nilai bawaan skema, yaitu "menunggu",
      // adalah satu satunya status yang mungkin lahir dari jalur ini.
      create: {
        id: seed.id,
        eventId: seed.eventId,
        catchmentId: seed.catchmentId,
        level: seed.level,
        windowKey: seed.windowKey,
        raisedAtSec: seed.raisedAtSec,
        accumMm: seed.accumMm,
        thresholdMm: seed.thresholdMm,
      },
      update: {},
    });
  }

  return { created: seeds.length - known.size, existing: known.size };
}

export interface ListAlertsFilter {
  eventId?: string;
  status?: AlertStatus;
}

/**
 * Daftar peringatan untuk antrean operator.
 * Diurutkan menunggu lebih dulu, lalu yang paling baru terangkat di atas.
 */
export async function listAlerts(filter: ListAlertsFilter = {}): Promise<AlertRecord[]> {
  const rows = await prisma.alert.findMany({
    where: {
      ...(filter.eventId ? { eventId: filter.eventId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: [{ raisedAtSec: "desc" }],
  });
  const rank: Record<string, number> = { menunggu: 0, dikonfirmasi: 1, diabaikan: 2 };
  return rows
    .map(toRecord)
    .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.raisedAt - a.raisedAt);
}

/** Ambil satu peringatan, atau lempar `AlertError` berkode `NOT_FOUND`. */
export async function getAlert(id: string): Promise<AlertRecord> {
  const row = await prisma.alert.findUnique({ where: { id } });
  if (!row) throw new AlertError("NOT_FOUND", `Peringatan "${id}" tidak ditemukan`);
  return toRecord(row);
}

function requireOperator(by: unknown): string {
  if (typeof by !== "string" || by.trim().length === 0) {
    throw new AlertError("INVALID_INPUT", "Nama operator wajib diisi untuk setiap keputusan");
  }
  return by.trim();
}

/**
 * Ubah status satu kandidat, hanya dari `menunggu`.
 *
 * Peralihan dibuat sekali jalan lewat `updateMany` dengan syarat status masih
 * `menunggu`, sehingga dua permintaan yang datang bersamaan tidak bisa sama sama
 * berhasil. Yang kalah menerima `ALREADY_DECIDED`, bukan diam diam menimpa.
 */
async function decide(
  id: string,
  next: Extract<AlertStatus, "dikonfirmasi" | "diabaikan">,
  by: string,
  note?: string,
): Promise<AlertRecord> {
  const operator = requireOperator(by);

  const result = await prisma.alert.updateMany({
    where: { id, status: "menunggu" },
    data: { status: next, decidedBy: operator, decidedAt: new Date(), note: note?.trim() || null },
  });

  if (result.count === 0) {
    const existing = await prisma.alert.findUnique({ where: { id } });
    if (!existing) throw new AlertError("NOT_FOUND", `Peringatan "${id}" tidak ditemukan`);
    throw new AlertError(
      "ALREADY_DECIDED",
      `Peringatan "${id}" sudah berstatus "${existing.status}" dan tidak bisa diputuskan ulang`,
    );
  }

  return getAlert(id);
}

/** Operator menyetujui kandidat. Satu satunya jalan menuju status `dikonfirmasi`. */
export function confirmAlert(id: string, by: string): Promise<AlertRecord> {
  return decide(id, "dikonfirmasi", by);
}

/** Operator menolak kandidat, boleh disertai alasan singkat. */
export function dismissAlert(id: string, by: string, note?: string): Promise<AlertRecord> {
  return decide(id, "diabaikan", by, note);
}

/**
 * Peringatan yang sudah sah untuk diteruskan ke lembaga berwenang.
 *
 * Ini gerbang tata kelola proyek. Kalau suatu saat ada yang menambahkan pengiriman
 * ke luar, satu satunya sumber yang boleh dipakai adalah fungsi ini. Perhatikan
 * bahwa syaratnya dua, status `dikonfirmasi` DAN `decidedBy` terisi, supaya baris
 * yang statusnya sempat diubah lewat jalur lain tetap tersaring.
 */
export async function publishableAlerts(eventId?: string): Promise<AlertRecord[]> {
  const rows = await prisma.alert.findMany({
    where: {
      status: "dikonfirmasi",
      decidedBy: { not: null },
      ...(eventId ? { eventId } : {}),
    },
    orderBy: [{ raisedAtSec: "asc" }],
  });
  return rows.map(toRecord);
}

/** Hanya untuk pengujian: kosongkan tabel peringatan. */
export async function resetAlertsForTest(): Promise<void> {
  await prisma.alert.deleteMany({});
}
