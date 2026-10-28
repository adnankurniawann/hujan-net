// Klasifikasi basah kering dengan LSTM terlatih, pengganti aturan ambang di
// lib/inverse/classify.ts.
//
// Model dilatih di ml/hujannet_ml/cnn.py pada data operator sungguhan
// (OpenMRG Swedia + OpenRainER Italia), label dari radar sepanjang lintasan.
// Bobotnya ditulis `uv run python -m hujannet_ml.cnn export` ke
// data/ml-wetdry.json. Berkas ini hanya menjalankan lintasan majunya.
//
// Masukan satu keputusan: 120 menit redaman SEBELUM menit sekarang, dua kanal
// per menit (selisih terhadap acuan kering dibagi 5 dB, dijepit -10..40 dB, dan
// topeng data ada), plus frekuensi/40 GHz dan panjang/10 km. Sama persis dengan
// `sequences` dan `meta_inputs` di cnn.py.

import type { Link, LinkSample } from "../types";
import { dryReferenceLevel } from "../inverse/classify.ts";

export interface WetDryModel {
  window: number;
  hidden: number;
  /** Ambang peluang, disetel pada MCC validasi. */
  threshold: number;
  wIh: Float64Array; // [4H, 2], urutan gerbang PyTorch: i, f, g, o
  wHh: Float64Array; // [4H, H]
  b: Float64Array; // [4H], bias_ih + bias_hh
  w1: Float64Array; // [64, H + 2]
  b1: Float64Array;
  w2: Float64Array; // [64]
  b2: number;
}

function numbers(raw: Record<string, unknown>, key: string, length: number): Float64Array {
  const v = raw[key];
  if (!Array.isArray(v) || v.length !== length || !v.every(Number.isFinite)) {
    throw new Error(`[ml] model basah/kering: "${key}" harus ${length} angka`);
  }
  return Float64Array.from(v as number[]);
}

export function deserializeWetDry(raw: unknown): WetDryModel {
  if (typeof raw !== "object" || raw === null) throw new Error("[ml] model basah/kering bukan objek");
  const r = raw as Record<string, unknown>;
  const { window, hidden, threshold, b2 } = r;
  if (![window, hidden, threshold, b2].every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error("[ml] model basah/kering: window, hidden, threshold, b2 harus angka");
  }
  const H = hidden as number;
  const w1 = numbers(r, "w1", 64 * (H + 2));
  return {
    window: window as number,
    hidden: H,
    threshold: threshold as number,
    wIh: numbers(r, "wIh", 4 * H * 2),
    wHh: numbers(r, "wHh", 4 * H * H),
    b: numbers(r, "b", 4 * H),
    w1,
    b1: numbers(r, "b1", 64),
    w2: numbers(r, "w2", 64),
    b2: b2 as number,
  };
}

interface State {
  h: Float64Array;
  c: Float64Array;
}

const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

/** Satu langkah LSTM, mengembalikan keadaan baru. */
function step(m: WetDryModel, s: State, x0: number, x1: number): State {
  const H = m.hidden;
  const gates = new Float64Array(4 * H);
  for (let g = 0; g < 4 * H; g++) {
    let v = m.b[g] + m.wIh[2 * g] * x0 + m.wIh[2 * g + 1] * x1;
    const row = g * H;
    for (let k = 0; k < H; k++) v += m.wHh[row + k] * s.h[k];
    gates[g] = v;
  }
  const h = new Float64Array(H);
  const c = new Float64Array(H);
  for (let k = 0; k < H; k++) {
    c[k] = sigmoid(gates[H + k]) * s.c[k] + sigmoid(gates[k]) * Math.tanh(gates[2 * H + k]);
    h[k] = sigmoid(gates[3 * H + k]) * Math.tanh(c[k]);
  }
  return { h, c };
}

/** Logit dari keadaan terakhir dan dua masukan meta. */
function head(m: WetDryModel, h: Float64Array, meta: readonly [number, number]): number {
  const H = m.hidden;
  let out = m.b2;
  for (let j = 0; j < 64; j++) {
    const row = j * (H + 2);
    let v = m.b1[j] + m.w1[row + H] * meta[0] + m.w1[row + H + 1] * meta[1];
    for (let k = 0; k < H; k++) v += m.w1[row + k] * h[k];
    out += m.w2[j] * Math.max(0, v);
  }
  return out;
}

/** Logit untuk satu jendela [window][2]. Dipakai uji kesamaan dengan PyTorch. */
export function wetDryLogit(m: WetDryModel, x: readonly (readonly [number, number])[], meta: readonly [number, number]): number {
  let s: State = { h: new Float64Array(m.hidden), c: new Float64Array(m.hidden) };
  for (const [v, mask] of x) s = step(m, s, v, mask);
  return head(m, s.h, meta);
}

/**
 * Klasifikasi basah kering satu tautan dengan LSTM.
 *
 * Satu keputusan per menit, berlaku untuk seluruh cuplikan di menit itu, dan
 * hanya melihat menit sebelumnya. Menit sebelum kejadian dianggap data hilang
 * (topeng 0), seperti celah data yang memang ada di data latih.
 *
 * shortcut: acuan kering dari selubung atas seluruh kejadian (`dryReferenceLevel`),
 * bukan median 24 jam ke belakang seperti saat latih, karena simulasi hanya satu
 * jam. Ganti dengan median bergulir 24 jam begitu data operator yang panjang masuk.
 */
export function classifyWetDryModel(samples: readonly LinkSample[], link: Link, m: WetDryModel): boolean[] {
  if (samples.length === 0) return [];
  const dryLevel = dryReferenceLevel(samples.map((s) => s.rxPowerDbm));
  const minuteOf = (t: number) => Math.floor(t / 60);
  const nMin = minuteOf(samples[samples.length - 1].t) + 1;

  const sum = new Float64Array(nMin);
  const count = new Float64Array(nMin);
  for (const s of samples) {
    const i = minuteOf(s.t);
    sum[i] += dryLevel - s.rxPowerDbm;
    count[i]++;
  }
  const value = Array.from(sum, (v, i) => (count[i] ? Math.min(40, Math.max(-10, v / count[i])) / 5 : 0));
  const mask = Array.from(count, (n) => (n ? 1 : 0));

  // Keadaan setelah k menit kosong sama untuk semua jendela, jadi dihitung sekali.
  const W = m.window;
  const padded: State[] = [{ h: new Float64Array(m.hidden), c: new Float64Array(m.hidden) }];
  for (let k = 1; k <= W; k++) padded.push(step(m, padded[k - 1], 0, 0));

  const meta: [number, number] = [link.freqGHz / 40, link.lengthKm / 10];
  const wet = new Array<boolean>(nMin);
  for (let i = 0; i < nMin; i++) {
    let s = padded[Math.max(0, W - i)];
    for (let k = Math.max(0, i - W); k < i; k++) s = step(m, s, value[k], mask[k]);
    wet[i] = sigmoid(head(m, s.h, meta)) > m.threshold;
  }
  return samples.map((s) => wet[minuteOf(s.t)]);
}
