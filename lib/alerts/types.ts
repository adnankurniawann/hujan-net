/**
 * Tipe lokal lapisan peringatan.
 *
 * `AlertCandidate` dan `AlertStatus` adalah milik kontrak bersama `lib/types.ts`.
 * Berkas ini hanya menambah apa yang dibutuhkan mesin peringatan dan panel C3
 * tetapi tidak layak masuk kontrak bersama, supaya `lib/types.ts` tetap terkunci.
 */

import type { AlertCandidate } from "../types.ts";
import type { WindowKey } from "../catchment/index.ts";

/** Tingkat keparahan. Berbeda dari `AlertStatus`, yang menyatakan status alur kerja. */
export type AlertLevel = "waspada" | "siaga";

/**
 * Bibit kandidat hasil pendeteksian, sebelum menyentuh basis data.
 * Bentuknya murni data, supaya pendeteksian bisa diuji tanpa SQLite.
 */
export interface AlertSeed {
  /** Deterministik: "<eventId>:<catchmentId>:<level>:<raisedAtSec>" */
  id: string;
  eventId: string;
  catchmentId: string;
  level: AlertLevel;
  /** Jendela akumulasi yang memicu, mis. "accum1h" */
  windowKey: WindowKey;
  /** detik sejak awal kejadian simulasi */
  raisedAtSec: number;
  /** akumulasi pada jendela penentu saat ambang terlampaui, mm */
  accumMm: number;
  /** ambang siaga jendela penentu, mm */
  thresholdMm: number;
}

/**
 * Kandidat lengkap seperti yang dikirim ke antarmuka.
 *
 * Superset dari `AlertCandidate`, jadi tetap sah dipakai di mana pun kontrak
 * bersama meminta `AlertCandidate`. Bidang tambahan dibutuhkan panel C3 untuk
 * menampilkan tingkat keparahan dan jendela pemicu.
 */
export interface AlertRecord extends AlertCandidate {
  eventId: string;
  level: AlertLevel;
  windowKey: WindowKey;
  /** catatan operator saat mengabaikan, kalau ada */
  note?: string;
}

/** Kode galat yang dipetakan ke kode status HTTP di lapisan rute. */
export type AlertErrorCode = "NOT_FOUND" | "ALREADY_DECIDED" | "INVALID_INPUT";

/**
 * Galat lapisan peringatan yang membawa kode, supaya rute tidak menebak nebak.
 *
 * Bidang `code` ditulis dan diisi terpisah, BUKAN sebagai parameter property
 * `constructor(readonly code: ...)`. Pengupasan tipe bawaan Node yang dipakai
 * `npm test` berjalan dalam mode strip-only dan menolak parameter property,
 * jadi bentuk itu akan membuat seluruh berkas ini gagal dimuat oleh `node --test`.
 */
export class AlertError extends Error {
  readonly code: AlertErrorCode;

  constructor(code: AlertErrorCode, message: string) {
    super(message);
    this.name = "AlertError";
    this.code = code;
  }
}
