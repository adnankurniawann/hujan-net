/**
 * Tipe lokal untuk lapisan DAS.
 *
 * `CatchmentState` sendiri adalah milik kontrak bersama di `lib/types.ts` (milik Radit).
 * Berkas ini hanya memuat tipe yang tidak dipakai lapisan lain, supaya kontrak bersama
 * tetap ramping dan tidak perlu diubah setelah T0 dikunci.
 */

/** Satu cincin poligon GeoJSON: senarai pasangan [lon, lat] derajat, tertutup. */
export type Ring = ReadonlyArray<readonly [number, number]>;

/** Poligon DAS yang sudah diurai dari GeoJSON. `rings[0]` cincin luar, sisanya lubang. */
export interface CatchmentPolygon {
  id: string;
  name: string;
  /** rings[0] = batas luar, rings[1..] = lubang */
  rings: Ring[];
  /** [lonMin, latMin, lonMax, latMax] derajat, dihitung dari cincin luar */
  bbox: readonly [number, number, number, number];
}

/** Ambang untuk satu jendela akumulasi, satuan mm. */
export interface WindowThresholds {
  waspadaMm: number;
  siagaMm: number;
}

/** Kunci jendela akumulasi, sesuai nama bidang pada `CatchmentState`. */
export type WindowKey = "accum1h" | "accum3h" | "accum6h";

/** Ambang lengkap untuk satu DAS. */
export type CatchmentThresholds = Record<WindowKey, WindowThresholds>;

/** Bentuk mentah `data/catchment-config.json`. */
export interface CatchmentConfig {
  /**
   * Faktor skala ambang untuk kejadian demo, 0 sampai 1.
   *
   * Ambang di `perCatchment` ditulis dalam besaran operasional, yaitu angka yang
   * masuk akal untuk banjir sungguhan. Kejadian simulasi sekarang jauh lebih ringan
   * daripada itu, jadi tanpa penskalaan tidak akan ada satu pun peringatan dan
   * babak antrean peringatan pada demo tidak pernah terjadi.
   *
   * Memisahkannya sebagai faktor tersendiri, bukan menurunkan angka aslinya, supaya
   * ambang operasional tetap terbaca di berkas dan supaya pertanyaan "kenapa siaga
   * pada 8 mm" punya jawaban yang jujur. Set ke 1 begitu kejadiannya sekuat banjir
   * sungguhan atau data nyata sudah masuk.
   */
  demoScale: number;
  /**
   * Urutan baris pada `GridField.values`. `south-to-north` berarti indeks baris 0
   * berada di `latMin`. Lihat catatan di `geo.ts`.
   */
  gridRowOrder: "south-to-north" | "north-to-south";
  /** Jarak antar cuplikan simulasi, detik. Sesuai A3: 15 detik. */
  sampleIntervalSec: number;
  defaults: CatchmentThresholds;
  perCatchment: Record<string, Partial<CatchmentThresholds>>;
}

/** Hasil pemetaan sel grid ke satu DAS. Dihitung sekali per bentuk grid. */
export interface CatchmentMembership {
  catchmentId: string;
  /** Indeks datar ke `GridField.values` untuk sel yang pusatnya di dalam poligon. */
  cellIndices: Int32Array;
}

/** Rata rata hujan satu DAS pada satu waktu. */
export interface CatchmentRainSample {
  /** detik sejak awal kejadian */
  t: number;
  /** rata rata intensitas hujan seluruh sel di dalam DAS, mm/jam */
  meanMmH: number;
}

/** Deret waktu rata rata hujan untuk satu DAS. `samples` wajib menaik menurut `t`. */
export interface CatchmentRainSeries {
  catchmentId: string;
  name: string;
  samples: CatchmentRainSample[];
}
