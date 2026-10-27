// Kontrak data HujanNet Dashboard.
// Ditulis pada tugas T0 dan DIKUNCI. Semua orang membangun di atas berkas ini.
// Perubahan apa pun harus diumumkan di grup lebih dulu (lihat Panduan bagian 3).

export type Coord = { lat: number; lon: number };

export interface Link {
  id: string;
  siteA: Coord;
  siteB: Coord;
  lengthKm: number;
  freqGHz: number; // rentang tropis realistis: 15 sampai 23
  polarization: "H" | "V";
  txPowerDbm: number;
}

export interface LinkSample {
  linkId: string;
  t: number; // detik sejak awal kejadian
  rxPowerDbm: number; // sudah termasuk derau dan kuantisasi
  baselineDb: number; // kebenaran dasar, hanya untuk evaluasi
  trueRainMmH: number; // kebenaran dasar rata rata lintasan
}

export interface LinkState {
  linkId: string;
  t: number;
  isWet: boolean; // hasil klasifikasi
  attenuationDb: number; // A_hujan setelah koreksi
  estRainMmH: number; // hasil inversi
}

export interface GridField {
  bbox: [number, number, number, number]; // [lonMin, latMin, lonMax, latMax]
  nx: number;
  ny: number;
  values: number[]; // panjang nx*ny, mm/jam, urutan baris demi baris
}

export interface Snapshot {
  t: number;
  links: LinkState[];
  truth: GridField; // medan simulasi
  reconstruction: GridField; // hasil rekonstruksi kita, IDW
  rmse: number;
  /**
   * PERLUASAN KONTRAK, BUKAN BAWAAN T0. Medan hasil operator linear terlatih
   * (regresi ridge, lib/ml/operator.ts), dihitung dari tautan yang SAMA
   * dengan `reconstruction`, hanya beda dari mana bobotnya berasal.
   *
   * OPSIONAL, BUKAN JAMINAN. `reconstructEvent` hanya mengisinya kalau
   * dipanggil dengan `options.operator` — lib/ tidak boleh membaca cakram
   * sendiri (aturan arsitektur bagian 2), jadi memuat berkas operator adalah
   * urusan pemanggil, bukan `reconstructEvent`. Di dasbor sungguhan
   * (app/api/sim/store.ts) operatornya selalu dimuat, jadi kedua bidang ini
   * selalu ada di Snapshot yang benar benar dikirim ke peramban. Alert dan
   * status DAS tetap membaca `reconstruction`, bukan ini, supaya ambang yang
   * sudah disetel ke perilaku IDW tidak diam diam ikut berubah. Dipakai
   * ComparisonView untuk sakelar IDW/AI. Diumumkan sebagai perluasan, sesuai
   * aturan berkas ini: kontrak lama tidak diubah, hanya ditambah.
   */
  mlReconstruction?: GridField;
  mlRmse?: number;
}

export interface CatchmentState {
  id: string;
  name: string;
  accum1h: number; // mm
  accum3h: number;
  accum6h: number;
  thresholdMm: number;
  status: "normal" | "waspada" | "siaga";
}

export type AlertStatus = "menunggu" | "dikonfirmasi" | "diabaikan";

export interface AlertCandidate {
  id: string;
  catchmentId: string;
  raisedAt: number;
  accumMm: number;
  thresholdMm: number;
  status: AlertStatus;
  confirmedBy?: string;
  confirmedAt?: number;
}
