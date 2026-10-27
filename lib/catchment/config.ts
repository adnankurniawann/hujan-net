/**
 * Pemuat dan pemvalidasi `data/catchments.geojson` dan `data/catchment-config.json`.
 *
 * Bagian penguraian dibuat murni supaya bisa diuji tanpa menyentuh berkas.
 * Bagian pembacaan berkas ada di `loadCatchmentData`, hanya boleh dipanggil di server.
 */

import type {
  CatchmentConfig,
  CatchmentPolygon,
  CatchmentThresholds,
  Ring,
  WindowKey,
  WindowThresholds,
} from "./types.ts";
import { ringBbox } from "./geo.ts";

const WINDOW_KEYS: readonly WindowKey[] = ["accum1h", "accum3h", "accum6h"];

/** Panjang jendela akumulasi dalam detik, sesuai nama bidang `CatchmentState`. */
export const WINDOW_SECONDS: Record<WindowKey, number> = {
  accum1h: 3600,
  accum3h: 3 * 3600,
  accum6h: 6 * 3600,
};

function fail(message: string): never {
  throw new Error(`[catchment] ${message}`);
}

function asRing(coords: unknown, where: string): Ring {
  if (!Array.isArray(coords) || coords.length < 4) {
    fail(`${where}: cincin poligon butuh minimal 4 titik termasuk titik penutup`);
  }
  return coords.map((pair, i) => {
    if (
      !Array.isArray(pair) ||
      pair.length < 2 ||
      typeof pair[0] !== "number" ||
      typeof pair[1] !== "number" ||
      !Number.isFinite(pair[0]) ||
      !Number.isFinite(pair[1])
    ) {
      fail(`${where}: titik ke-${i} bukan pasangan [lon, lat] yang sah`);
    }
    return [pair[0], pair[1]] as const;
  });
}

/**
 * Urai FeatureCollection GeoJSON menjadi daftar poligon DAS.
 * Hanya menerima geometri `Polygon`. `MultiPolygon` ditolak dengan pesan jelas,
 * karena tidak dibutuhkan untuk tiga DAS skematis dan hanya menambah jalur kode
 * yang tidak sempat diuji dalam sprint dua hari.
 */
export function parseCatchments(geojson: unknown): CatchmentPolygon[] {
  const fc = geojson as { type?: string; features?: unknown[] };
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    fail("catchments.geojson harus berupa FeatureCollection");
  }
  if (fc.features.length === 0) fail("catchments.geojson tidak berisi satu pun DAS");

  return fc.features.map((raw, i) => {
    const f = raw as {
      properties?: Record<string, unknown>;
      geometry?: { type?: string; coordinates?: unknown };
    };
    const props = f.properties ?? {};
    const id = typeof props.id === "string" ? props.id : undefined;
    const name = typeof props.name === "string" ? props.name : undefined;
    if (!id) fail(`fitur ke-${i} tidak punya properties.id`);
    if (!name) fail(`DAS "${id}" tidak punya properties.name`);

    const geom = f.geometry;
    if (geom?.type === "MultiPolygon") {
      fail(`DAS "${id}" memakai MultiPolygon, yang belum didukung. Pecah jadi Polygon terpisah`);
    }
    if (geom?.type !== "Polygon" || !Array.isArray(geom.coordinates)) {
      fail(`DAS "${id}" bukan geometri Polygon`);
    }

    const rings = (geom.coordinates as unknown[]).map((r, ri) =>
      asRing(r, `DAS "${id}" cincin ${ri}`),
    );
    return { id, name, rings, bbox: ringBbox(rings[0]) };
  });
}

function asThresholds(raw: unknown, where: string): WindowThresholds {
  const t = raw as { waspadaMm?: unknown; siagaMm?: unknown };
  if (typeof t?.waspadaMm !== "number" || typeof t?.siagaMm !== "number") {
    fail(`${where}: butuh angka waspadaMm dan siagaMm`);
  }
  if (t.waspadaMm > t.siagaMm) {
    fail(`${where}: waspadaMm (${t.waspadaMm}) tidak boleh lebih besar dari siagaMm (${t.siagaMm})`);
  }
  return { waspadaMm: t.waspadaMm, siagaMm: t.siagaMm };
}

/** Urai dan validasi `catchment-config.json`. */
export function parseConfig(raw: unknown): CatchmentConfig {
  const c = raw as Record<string, unknown>;
  const rowOrder = c?.gridRowOrder;
  if (rowOrder !== "south-to-north" && rowOrder !== "north-to-south") {
    fail('gridRowOrder harus "south-to-north" atau "north-to-south"');
  }
  const interval = c?.sampleIntervalSec;
  if (typeof interval !== "number" || interval <= 0) {
    fail("sampleIntervalSec harus angka positif dalam detik");
  }

  const demoScale = c?.demoScale;
  if (typeof demoScale !== "number" || !(demoScale > 0) || demoScale > 1) {
    fail("demoScale harus angka lebih besar dari 0 dan tidak lebih dari 1");
  }

  const defaultsRaw = c?.defaults as Record<string, unknown> | undefined;
  const defaults = {} as CatchmentThresholds;
  for (const key of WINDOW_KEYS) {
    defaults[key] = asThresholds(defaultsRaw?.[key], `defaults.${key}`);
  }

  const perCatchment: Record<string, Partial<CatchmentThresholds>> = {};
  const perRaw = (c?.perCatchment ?? {}) as Record<string, Record<string, unknown>>;
  for (const [id, override] of Object.entries(perRaw)) {
    const merged: Partial<CatchmentThresholds> = {};
    for (const key of WINDOW_KEYS) {
      if (override?.[key] !== undefined) {
        merged[key] = asThresholds(override[key], `perCatchment.${id}.${key}`);
      }
    }
    perCatchment[id] = merged;
  }

  return { gridRowOrder: rowOrder, sampleIntervalSec: interval, demoScale, defaults, perCatchment };
}

/**
 * Ambang efektif satu DAS: nilai per DAS menimpa nilai bawaan, per jendela, lalu
 * seluruhnya dikalikan `demoScale`.
 *
 * Angka di berkas konfigurasi adalah besaran OPERASIONAL. Yang dikembalikan fungsi
 * ini adalah besaran EFEKTIF untuk kejadian yang sedang diperagakan. Lihat catatan
 * pada `CatchmentConfig.demoScale` untuk alasannya.
 */
export function thresholdsFor(config: CatchmentConfig, catchmentId: string): CatchmentThresholds {
  const override = config.perCatchment[catchmentId] ?? {};
  const scale = config.demoScale;
  const out = {} as CatchmentThresholds;
  for (const key of WINDOW_KEYS) {
    const base = override[key] ?? config.defaults[key];
    out[key] = {
      waspadaMm: base.waspadaMm * scale,
      siagaMm: base.siagaMm * scale,
    };
  }
  return out;
}

/** Ambang operasional satu DAS, tanpa penskalaan demo. Untuk ditampilkan apa adanya. */
export function operationalThresholdsFor(
  config: CatchmentConfig,
  catchmentId: string,
): CatchmentThresholds {
  const override = config.perCatchment[catchmentId] ?? {};
  const out = {} as CatchmentThresholds;
  for (const key of WINDOW_KEYS) {
    out[key] = override[key] ?? config.defaults[key];
  }
  return out;
}

/** Pastikan setiap DAS di GeoJSON dikenali konfigurasi, supaya salah ketik id ketahuan. */
export function assertConfigCoversCatchments(
  config: CatchmentConfig,
  catchments: CatchmentPolygon[],
): void {
  const known = new Set(catchments.map((c) => c.id));
  for (const id of Object.keys(config.perCatchment)) {
    if (!known.has(id)) {
      fail(`perCatchment berisi id "${id}" yang tidak ada di catchments.geojson`);
    }
  }
}
