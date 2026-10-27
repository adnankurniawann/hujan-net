import type { Snapshot } from "@/lib/types";
import type { EvacuationPost, EvacuationRoute, RouteWaypoint } from "./data";
import ROUTE_TABLE from "@/data/evacuation-routes.json";

/* ============================================================================
 * Lintasan evakuasi.
 *
 * APA YANG BERUBAH DAN KENAPA. Berkas ini dulu MENGARANG lintasannya. Garis
 * lurus dari titik berat DAS ke posko, dengan dua titik tengah yang digeser
 * 15 persen tegak lurus supaya terlihat berbelok; jaraknya jarak burung
 * terbang; dan petunjuk beloknya ditulis tetap di dalam kode — "Belok kanan di
 * Simpang Utama", "Jl. Raya Puncak / Jl. Megamendung" — lengkap dengan jarak
 * `totalKm * 600` yang tidak diturunkan dari apa pun. Di peta, garis itu
 * menyeberangi lembah dan kebun teh tanpa satu pun jalan di bawahnya.
 *
 * Untuk konsol yang seluruh argumennya bersandar pada "kebenaran dasarnya
 * diketahui, galatnya bisa diukur, bukan diklaim", itu satu-satunya angka di
 * layar yang tidak bisa dibantah karena memang tidak diukur dari apa pun.
 *
 * Sekarang lintasannya dicari dengan Dijkstra di atas jaringan jalan
 * OpenStreetMap yang nyata, dan hasilnya dibekukan ke `data/evacuation-routes.json`
 * oleh `scripts/build-evacuation-routes.mjs`. Lihat berkas itu untuk alasan
 * perhitungannya tidak dilakukan di peramban.
 *
 * YANG MASIH DIHITUNG DI SINI adalah keamanan lintasan terhadap medan hujan
 * hasil inversi. Itu memang berubah tiap langkah waktu, dan itulah satu-satunya
 * tempat di konsol ini lapisan pengukuran dipakai untuk keputusan operasional.
 * ==========================================================================*/

const KM_PER_DEG_LAT = 111.0;
const KM_PER_DEG_LON = 110.6;

export interface TurnStep {
  id: number;
  direction: "straight" | "turn-right" | "turn-left" | "arrive";
  instruction: string;
  roadName: string;
  distanceMeter: number;
}

/** Penggal lurus di ujung lintasan yang tidak berada di atas jalan terpetakan. */
export interface AccessLeg {
  meter: number;
  from: [number, number];
  to: [number, number];
}

export interface DetailedEvacuationRoute extends EvacuationRoute {
  steps: TurnStep[];
  bounds: [[number, number], [number, number]]; // [[west, south], [east, north]]
  /**
   * Dari titik berat DAS ke jalan terdekat, dan dari jalan terdekat ke posko.
   *
   * TIDAK DIGABUNGKAN KE DALAM `waypoints`, dan itu inti perbaikannya. Titik
   * berat sebuah DAS berada 196 sampai 452 meter dari jalan terdekat, dan
   * koordinat posko 125 sampai 614 meter — terukur, bukan ditaksir. Menyambung
   * keduanya dengan garis penuh berarti menggambar lebih dari satu kilometer
   * "jalan" yang tidak ada, yaitu persis cacat yang seharusnya diperbaiki.
   * Antarmuka menggambar penggal ini putus-putus dan menyebutkan panjangnya.
   */
  access: { origin: AccessLeg; post: AccessLeg };
}

/* ---------------------------------------------------------------------------
   Bentuk berkas data
--------------------------------------------------------------------------- */

interface StoredRoute {
  originId: string;
  postId: string;
  reachable: boolean;
  distanceMeter?: number;
  durationMins?: number;
  access?: { origin: AccessLeg; post: AccessLeg };
  steps?: TurnStep[];
  line?: [number, number][];
}

const TABLE = ROUTE_TABLE as unknown as {
  origins: { id: string; name: string; lon: number; lat: number }[];
  routes: StoredRoute[];
};

/**
 * Sejauh mana titik berat yang dihitung sekarang boleh menyimpang dari titik
 * berat yang dipakai saat lintasan dibangun, dalam meter.
 *
 * Koordinat di berkas data dibulatkan ke lima desimal, sekitar 1,1 meter, jadi
 * selisih beberapa meter hanyalah pembulatan. Selisih yang lebih besar berarti
 * `data/catchments.geojson` sudah diubah tanpa membangun ulang lintasannya, dan
 * lintasan yang tersimpan bukan lagi lintasan dari DAS yang sekarang.
 */
const CENTROID_TOLERANCE_M = 25;

/**
 * Titik berat luasan sebuah cincin poligon DAS, dipakai sebagai titik asal.
 *
 * Memakai titik berat luasan (rumus poligon), bukan rata-rata simpul, supaya
 * cincin dengan simpul rapat di satu sisi tidak menarik titiknya ke sana.
 * Untuk poligon merosot (luas nol) ia jatuh kembali ke rata-rata simpul.
 *
 * `scripts/build-evacuation-routes.mjs` memuat salinan persis fungsi ini.
 * Kalau yang satu diubah, yang lain harus ikut — dan pemeriksaan toleransi di
 * bawah akan menangkapnya kalau terlupa.
 */
export function ringCentroid(ring: [number, number][]): { lat: number; lon: number } | null {
  if (!ring || ring.length === 0) return null;

  let twiceArea = 0;
  let lon = 0;
  let lat = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = xj * yi - xi * yj;
    twiceArea += cross;
    lon += (xj + xi) * cross;
    lat += (yj + yi) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    let sx = 0;
    let sy = 0;
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
    }
    return { lon: sx / ring.length, lat: sy / ring.length };
  }

  return { lon: lon / (3 * twiceArea), lat: lat / (3 * twiceArea) };
}

/** Jarak aproksimasi bidang datar dalam kilometer. */
export function calculateKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * KM_PER_DEG_LAT;
  const dLon = (lon2 - lon1) * KM_PER_DEG_LON;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** Sampel intensitas hujan pada koordinat tertentu dari grid rekonstruksi snapshot. */
export function sampleRainAt(lat: number, lon: number, snapshot: Snapshot | null): number {
  if (!snapshot) return 0;
  const { bbox, nx, ny, values } = snapshot.reconstruction;
  const [lonMin, latMin, lonMax, latMax] = bbox;

  if (lon < lonMin || lon > lonMax || lat < latMin || lat > latMax) return 0;

  const gx = Math.floor(((lon - lonMin) / (lonMax - lonMin)) * nx);
  const gy = Math.floor(((lat - latMin) / (latMax - latMin)) * ny);

  const clampedX = Math.max(0, Math.min(nx - 1, gx));
  const clampedY = Math.max(0, Math.min(ny - 1, gy));

  const idx = clampedY * nx + clampedX;
  return values[idx] ?? 0;
}

/* ---------------------------------------------------------------------------
   Pencarian lintasan
--------------------------------------------------------------------------- */

/**
 * Kenapa sebuah pasangan DAS–posko tidak punya lintasan. Dibedakan karena
 * ketiganya menuntut tindakan yang berbeda dari orang yang membacanya.
 */
export type RouteGap =
  | "tidak-ada-data" // pasangan ini tidak ada di berkas
  | "tidak-terhubung" // ada di berkas, tapi Dijkstra tidak menemukan lintasan
  | "data-basi"; // geojson berubah tanpa membangun ulang lintasan

export interface RouteLookup {
  route: DetailedEvacuationRoute | null;
  gap: RouteGap | null;
}

/**
 * Ambil lintasan DAS → posko, lalu nilai keamanannya terhadap hujan saat ini.
 *
 * `originId` adalah id DAS di `data/catchments.geojson`, bukan koordinat.
 * Sengaja: lintasan yang tersimpan dibangun untuk DAS tertentu, dan menerima
 * koordinat bebas akan menyiratkan bahwa fungsi ini bisa merutekan dari mana
 * saja — padahal ia hanya bisa mencari di tabel.
 */
export function lookupRoute(
  originId: string,
  originName: string,
  originCentroid: { lat: number; lon: number },
  post: EvacuationPost,
  snapshot: Snapshot | null,
): RouteLookup {
  const stored = TABLE.routes.find((r) => r.originId === originId && r.postId === post.id);
  if (!stored) return { route: null, gap: "tidak-ada-data" };

  const storedOrigin = TABLE.origins.find((o) => o.id === originId);
  if (storedOrigin) {
    const drift =
      calculateKm(originCentroid.lat, originCentroid.lon, storedOrigin.lat, storedOrigin.lon) *
      1000;
    /* Menolak, bukan menggambar apa adanya. Lintasan dari DAS yang sudah
       dipindah tetap terlihat masuk akal di peta — mengikuti jalan, berbelok
       di persimpangan sungguhan — dan justru itu yang membuatnya berbahaya:
       tidak ada satu pun tanda di layar bahwa ia menuju dari tempat yang salah. */
    if (drift > CENTROID_TOLERANCE_M) return { route: null, gap: "data-basi" };
  }

  if (!stored.reachable || !stored.line || stored.line.length < 2) {
    return { route: null, gap: "tidak-terhubung" };
  }

  const waypoints: RouteWaypoint[] = stored.line.map(([lon, lat]) => ({ lat, lon }));

  /* Hujan disampel di sepanjang lintasan DAN di kedua penggal aksesnya. Penggal
     akses tetap harus dilalui rombongan, jadi banjir di sana sama saja
     menutup lintasannya. */
  const probes: [number, number][] = [...stored.line];
  if (stored.access) {
    probes.push(stored.access.origin.from, stored.access.origin.to);
    probes.push(stored.access.post.from, stored.access.post.to);
  }

  let maxRain = 0;
  for (const [lon, lat] of probes) {
    const r = sampleRainAt(lat, lon, snapshot);
    if (r > maxRain) maxRain = r;
  }

  let safetyStatus: "AMAN" | "WASPADA" | "BAHAYA" = "AMAN";
  if (maxRain > 35) safetyStatus = "BAHAYA";
  else if (maxRain > 15) safetyStatus = "WASPADA";

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of probes) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const access = stored.access ?? {
    origin: { meter: 0, from: stored.line[0], to: stored.line[0] },
    post: {
      meter: 0,
      from: stored.line[stored.line.length - 1],
      to: stored.line[stored.line.length - 1],
    },
  };

  return {
    gap: null,
    route: {
      id: `ROUTE-${post.id}-${originId}`,
      targetPostId: post.id,
      postName: post.name,
      startName: originName,
      /** Jarak DI ATAS JALAN. Penggal akses dilaporkan terpisah lewat `access`. */
      distanceKm: Number(((stored.distanceMeter ?? 0) / 1000).toFixed(2)),
      durationMins: stored.durationMins ?? 0,
      safetyStatus,
      maxRainRateMmH: Number(maxRain.toFixed(1)),
      waypoints,
      steps: stored.steps ?? [],
      access,
      bounds: [
        [minLon - 0.004, minLat - 0.004],
        [maxLon + 0.004, maxLat + 0.004],
      ],
    },
  };
}
