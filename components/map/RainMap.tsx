"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CatchmentState, Link, Snapshot } from "@/lib/types";
import type { CatchmentDef } from "@/components/preview/catchments";
import { fieldToImageData } from "./colorRamp";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_GROUND,
  BASEMAP_PAINT,
  BASEMAP_TILES,
  LINK_DIM_WITH_ROUTE,
} from "./basemap";
import { canvasColor, inkCanvasColor, paperCanvasColor } from "./canvasTokens";
import { safetyCanvasColor } from "@/components/evacuation/safety";

/* ============================================================================
 * KENAPA SELURUH DATA DIGAMBAR DI KANVAS, BUKAN LEWAT SUMBER GeoJSON MapLibre
 * ============================================================================
 * maplibre-gl 6.0.0 memuat web worker-nya sebagai module script, dan di bawah
 * Next.js 14 dev URL-nya gagal diselesaikan: browser menerima HTML halaman lalu
 * menolaknya ("non-JavaScript MIME type of text/html"). Seluruh penguraian
 * GeoJSON terjadi di worker itu, sehingga akibatnya:
 *
 *   isSourceLoaded('links') tetap false, querySourceFeatures() mengembalikan 0,
 *   isStyleLoaded() tetap false, dan SEMUA lapisan vektor tidak pernah tergambar
 *   tanpa satu pun pesan galat dari MapLibre. Lapisan raster tetap normal.
 *
 * Perbaikan di akarnya ada di luar wilayah berkas Sultan: mengunci maplibre-gl
 * ke 5.x (package.json) atau menambah aturan worker di next.config.mjs. Dua
 * hari sebelum demo, mengubah wilayah orang lain lebih berisiko daripada
 * menggambar sendiri. Lihat catatan serah terima.
 *
 * MapLibre tetap dipakai untuk ubin dasar, geser, dan zum. Proyeksi diambil
 * dari map.project(), jadi lapisan ini selalu sejajar dengan petanya.
 * Efek sampingnya bagus: satu kanvas berarti urutan gambar dijamin (hujan di
 * bawah, tautan di atas) dan aplikasi tidak lagi bergantung pada worker.
 * ==========================================================================*/

/** Toleransi klik dalam piksel CSS, jauh lebih lebar daripada garisnya. */
const HIT_TOLERANCE_PX = 7;

/** Lama penyingkapan lintasan evakuasi. */
const REVEAL_MS = 460;

/**
 * Dihormati setiap kali, bukan sekali saat pasang: pengguna bisa mengubah
 * setelan ini selama konsol terbuka, dan gerak yang tidak diinginkan pada
 * layar operator bukan urusan sepele.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface Props {
  bbox: [number, number, number, number];
  links: Link[];
  snapshot: Snapshot | null;
  catchmentDefs: CatchmentDef[];
  catchmentStates: CatchmentState[];
  selectedLinkId: string | null;
  onSelectLink: (id: string | null) => void;
  evacuationPosts?: import("@/lib/evacuation/data").EvacuationPost[];
  evacuationRoute?: import("@/lib/evacuation/routes").DetailedEvacuationRoute | null;
}

/**
 * Redaman dipetakan ke DUA saluran sekaligus, lebar dan kepekatan.
 *
 * Versi pertama hanya memakai lebar dengan puncak pada 20 dB, dan pada kejadian
 * selebat ini hampir semua tautan melewati 20 dB sehingga semuanya tergambar
 * setebal maksimum: jadilah mi kuning yang menutupi medan hujan di bawahnya.
 * Skalanya dinaikkan ke 30 dB, lebar maksimumnya diturunkan, dan kepekatan ikut
 * membawa informasi, sehingga jaringan tautan terbaca sebagai medan pengukuran
 * bergradasi, bukan topeng basah/kering hitam putih.
 */
const ATTEN_FULL_DB = 30;

function attenFraction(attenDb: number): number {
  if (!(attenDb > 0)) return 0;
  return Math.min(1, attenDb / ATTEN_FULL_DB);
}

function widthForAtten(attenDb: number): number {
  return 0.9 + attenFraction(attenDb) * 1.9; // 0,9 .. 2,8 px
}

function alphaForAtten(attenDb: number): number {
  return 0.5 + attenFraction(attenDb) * 0.5; // 0,50 .. 1,00
}

export default function RainMap({
  bbox,
  links,
  snapshot,
  catchmentDefs,
  catchmentStates,
  selectedLinkId,
  onSelectLink,
  evacuationPosts,
  evacuationRoute,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const gridRef = useRef<HTMLCanvasElement | null>(null);
  /** Ujung tautan dalam piksel layar, hasil proyeksi terakhir; dipakai uji klik. */
  const hitRef = useRef<{ id: string; ax: number; ay: number; bx: number; by: number }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const statusById = useMemo(
    () => new Map(catchmentStates.map((c) => [c.id, c.status])),
    [catchmentStates],
  );
  const stateById = useMemo(
    () => new Map((snapshot?.links ?? []).map((s) => [s.linkId, s])),
    [snapshot],
  );

  /** Menara: ujung tautan yang unik. */
  const sites = useMemo(() => {
    const seen = new Set<string>();
    const out: { lat: number; lon: number }[] = [];
    for (const l of links) {
      for (const s of [l.siteA, l.siteB]) {
        const key = `${s.lon.toFixed(5)},${s.lat.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(s);
      }
    }
    return out;
  }, [links]);

  /* Kemajuan penyingkapan lintasan evakuasi. Disimpan sebagai ref, bukan
     state: nilainya dibaca dan ditulis di dalam satu lintasan gambar, dan
     menjadikannya state akan memicu render ulang React 60 kali per detik
     untuk sesuatu yang hanya digambar ke kanvas. */
  const revealRef = useRef<{ id: string | null; t0: number; p: number }>({
    id: null,
    t0: 0,
    p: 1,
  });

  /* -- satu lintasan gambar untuk seluruh data ----------------------------- */
  const draw = useCallback(() => {
    const map = mapRef.current;
    const canvas = overlayRef.current;
    const container = containerRef.current;
    if (!map || !canvas || !container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const P = (lon: number, lat: number) => map.project([lon, lat]);

    /* --- 1. medan hujan hasil rekonstruksi, paling bawah --- */
    if (snapshot) {
      const { nx, ny, values } = snapshot.reconstruction;
      if (!gridRef.current) gridRef.current = document.createElement("canvas");
      const small = gridRef.current;
      if (small.width !== nx || small.height !== ny) {
        small.width = nx;
        small.height = ny;
      }
      const sctx = small.getContext("2d");
      if (sctx) {
        sctx.putImageData(fieldToImageData(sctx, values, nx, ny), 0, 0);
        // Sudut kotak batas diproyeksikan lalu petak diregangkan ke dalamnya.
        // Pada kotak selebar 19 km dekat ekuator, lengkung Mercator di dalam
        // rentang ini di bawah sepersepuluh persen, jadi tidak terlihat.
        const tl = P(bbox[0], bbox[3]);
        const br = P(bbox[2], bbox[1]);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(small, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      }
    }

    /* --- 2. wilayah DAS ---

       Batasnya SELALU digambar, isiannya tidak.

       Sebelumnya seluruh blok ini dilewati ketika status "normal", jadi pada
       awal kejadian peta tidak menunjukkan satu pun DAS — padahal DAS adalah
       satuan ruang yang dipakai panel kanan, antrean peringatan, dan rute
       evakuasi. Operator melihat nama "DAS Cisarua" di panel tanpa ada apa pun
       di peta yang bisa dicocokkan dengannya, dan wilayahnya baru muncul persis
       pada saat ia sudah tidak normal lagi.

       Statusnya dibawa oleh dua hal sekaligus, bukan warna saja: garis putus
       tipis bertinta untuk normal, garis utuh berwarna status untuk waspada
       dan siaga. Isian warna tetap disimpan untuk status naik saja, supaya
       medan hujan di bawahnya tidak tertutup tiga petak berwarna sepanjang
       kejadian. */
    for (const d of catchmentDefs) {
      const status = statusById.get(d.id) ?? "normal";

      const outline = () => {
        ctx.beginPath();
        d.ring.forEach(([lon, lat], i) => {
          const p = P(lon, lat);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      };

      if (status !== "normal") {
        outline();
        ctx.fillStyle =
          status === "siaga" ? canvasColor("alert", 0.16) : canvasColor("signal", 0.12);
        ctx.fill();
      }

      outline();
      if (status === "normal") {
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = inkCanvasColor(0.3);
      } else {
        ctx.setLineDash([]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle =
          status === "siaga" ? canvasColor("alert", 0.8) : canvasColor("signal", 0.8);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      /* Nama DAS di titik tengah cincin. Batas tanpa nama masih membuat panel
         dan peta tidak bisa dicocokkan; hanya tiga DAS, jadi labelnya tidak
         menjadi kerumunan. */
      /* Titik penutup cincin mengulang titik pertama. Ikut dirata-rata, ia
         menghitung satu sudut dua kali dan menarik labelnya keluar dari
         tengah — terlihat jelas pada DAS yang berbentuk kotak. */
      const verts = d.ring.slice();
      const last = verts[verts.length - 1];
      if (verts.length > 1 && last[0] === verts[0][0] && last[1] === verts[0][1]) {
        verts.pop();
      }

      let sx = 0;
      let sy = 0;
      for (const [lon, lat] of verts) {
        const p = P(lon, lat);
        sx += p.x;
        sy += p.y;
      }
      const cx = sx / verts.length;
      const cy = sy / verts.length;

      ctx.font = "500 10px var(--font-sans), ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = inkCanvasColor(status === "normal" ? 0.65 : 0.85);
      ctx.shadowColor = paperCanvasColor();
      ctx.shadowBlur = 4;
      ctx.fillText(d.name, cx, cy);
      ctx.shadowBlur = 0;
      ctx.textAlign = "start";
    }

    /* Jaringan pengukuran disurutkan selama sebuah lintasan evakuasi tergambar:
       menara dan tautan sama-sama konteks di saat itu, bukan pokok. Menara ikut
       disurutkan bersama tautannya — kalau hanya garisnya yang memudar,
       titik-titiknya justru menjadi hal paling pekat di peta. */
    const linkDim = evacuationRoute ? LINK_DIM_WITH_ROUTE : 1;

    /* --- 3. titik-titik menara ---
       Bertinta konsol, bukan slate Tailwind. Keduanya biru tua dan selisihnya
       tipis di layar, tetapi menara adalah benda tetap di peta, bukan besaran
       terukur — jadi ia harus memakai tinta yang sama dengan seluruh konsol,
       dan ikut berubah kalau palet berubah. */
    ctx.globalAlpha = linkDim;
    for (const s of sites) {
      const p = P(s.lon, s.lat);
      // Cincin kertas, supaya menara terbaca juga di atas hujan pekat.
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = paperCanvasColor();
      ctx.fill();
      ctx.strokeStyle = inkCanvasColor(0.4);
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inti bertinta.
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = inkCanvasColor();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* --- 4. lintasan tautan, paling atas. Kering tenang, basah --signal dan
             menebal mengikuti redaman, terpilih putih terang. ---

       Tautan yang sedang dipilih TIDAK ikut disurutkan: itu keadaan yang dibuat
       operator sendiri dengan mengklik, dan memudarkannya membuat klik itu
       seolah tidak berakibat apa-apa. */
    const hits: typeof hitRef.current = [];
    const selectedDraw: (() => void)[] = [];
    ctx.lineCap = "round";
    for (const l of links) {
      const a = P(l.siteA.lon, l.siteA.lat);
      const b = P(l.siteB.lon, l.siteB.lat);
      hits.push({ id: l.id, ax: a.x, ay: a.y, bx: b.x, by: b.y });

      const st = stateById.get(l.id);
      const wet = st?.isWet ?? false;
      const atten = st?.attenuationDb ?? 0;
      const isSelected = l.id === selectedLinkId;
      const isHovered = l.id === hoveredId;

      /* Keadaan pilih dan sorot digambar dengan tinta, bukan dengan warna
         aksen: "sedang dipilih" adalah keadaan perkakas, sedangkan --signal
         sudah berarti "sebesar inilah redaman yang terukur". Kalau keduanya
         memakai warna yang sama, operator tidak bisa membedakan tautan yang
         basah dari tautan yang sedang ia klik. */
      let width = wet ? widthForAtten(atten) : 0.9;
      let color: string;
      let alpha: number;
      if (isSelected) {
        color = inkCanvasColor();
        alpha = 1;
        width = Math.max(width, 1.6) + 1.4;
      } else if (isHovered) {
        color = inkCanvasColor();
        alpha = 0.7;
        width += 0.8;
      } else if (wet) {
        color = canvasColor("signal");
        alpha = alphaForAtten(atten);
      } else {
        color = inkCanvasColor();
        alpha = 0.3;
      }

      const paint = () => {
        ctx.globalAlpha = isSelected ? alpha : alpha * linkDim;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      };
      // yang terpilih digambar terakhir supaya tidak pernah tertutup tetangganya
      if (isSelected) selectedDraw.push(paint);
      else paint();
    }
    /* --- 5. posko evakuasi dan lintasan rute ---

       Alfa dikembalikan ke 1 lebih dulu. Penggambaran tautan di atas memakai
       `globalAlpha` per tautan dan baru memulihkannya di akhir efek, jadi
       tanpa baris ini seluruh penanda evakuasi ikut diwarisi alfa tautan
       terakhir — lintasan rute tergambar pudar dan warnanya bercampur dengan
       medan hujan di belakangnya, sehingga status rute tidak terbaca. */
    ctx.globalAlpha = 1;

    if (evacuationPosts && evacuationPosts.length > 0) {
      const targetId = evacuationRoute?.targetPostId ?? null;

      for (const post of evacuationPosts) {
        const p = P(post.lon, post.lat);
        const isTarget = post.id === targetId;

        /* Posko adalah tempat, bukan besaran terukur dan bukan status — jadi
           penandanya bertinta. Warna hanya muncul pada posko yang menjadi
           tujuan rute aktif, dan warnanya adalah status rute itu sendiri. */
        const mark =
          isTarget && evacuationRoute
            ? safetyCanvasColor(evacuationRoute.safetyStatus)
            : inkCanvasColor(0.75);

        /* Digambar sebagai rumah, bukan lingkaran. Menara juga lingkaran kecil
           gelap, dan pada ukuran 6 px kedua penanda itu tidak bisa dibedakan —
           peta jadi menampilkan dua hal berbeda dengan bentuk yang sama.
           Bentuk bangunan juga menggambarkan benda yang sebenarnya, sesuai
           aturan ikon konsol ini. */
        const s = isTarget ? 1.25 : 1;
        const drawHouse = () => {
          ctx.beginPath();
          ctx.moveTo(p.x - 5.5 * s, p.y - 1 * s);
          ctx.lineTo(p.x, p.y - 6.5 * s);
          ctx.lineTo(p.x + 5.5 * s, p.y - 1 * s);
          ctx.lineTo(p.x + 4 * s, p.y - 1 * s);
          ctx.lineTo(p.x + 4 * s, p.y + 5 * s);
          ctx.lineTo(p.x - 4 * s, p.y + 5 * s);
          ctx.lineTo(p.x - 4 * s, p.y - 1 * s);
          ctx.closePath();
        };

        // Garis luar kertas supaya penanda tetap terbaca di atas hujan pekat.
        drawHouse();
        ctx.strokeStyle = paperCanvasColor();
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";
        ctx.stroke();

        drawHouse();
        ctx.fillStyle = mark;
        ctx.fill();

        /* Hanya posko tujuan yang diberi nama. Empat label sekaligus di atas
           peta hujan menutupi justru medan yang sedang dinilai. */
        if (isTarget) {
          ctx.font = "500 10px var(--font-sans), ui-sans-serif, system-ui, sans-serif";
          ctx.fillStyle = inkCanvasColor();
          ctx.shadowColor = paperCanvasColor();
          ctx.shadowBlur = 4;
          ctx.fillText(post.name, p.x + 12, p.y + 3.5);
          ctx.shadowBlur = 0;
        }
      }
    }

    if (evacuationRoute && evacuationRoute.waypoints.length > 1) {
      const stroke = safetyCanvasColor(evacuationRoute.safetyStatus);

      /* --- penyingkapan lintasan ---
         Satu-satunya gerak di peta ini, dan ia hanya berjalan ketika rutenya
         benar-benar BERGANTI — operator memilih posko atau DAS lain. Lintasan
         digambar dari titik asal menuju posko, searah dengan perjalanan yang
         diwakilinya, supaya mata mengikuti arah evakuasi dan bukan sekadar
         melihat garis baru muncul. Saat medan hujan bergerak tanpa mengubah
         rute, `p` sudah bernilai 1 dan tidak ada yang beranimasi. */
      const pts = evacuationRoute.waypoints.map((wp) => P(wp.lon, wp.lat));
      const segLen: number[] = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        segLen.push(l);
        total += l;
      }

      const reveal = revealRef.current;
      let p = 1;
      if (total > 0 && !prefersReducedMotion()) {
        if (reveal.id !== evacuationRoute.id) {
          /* Lintasan ini belum tercatat oleh efek penyingkapan, yang berjalan
             setelah render. Tanpa cabang ini frame pertama akan menggambarnya
             utuh, lalu efeknya mengembalikan ke nol — lintasan berkedip
             sebelum ditelusuri. */
          p = 0;
        } else {
          const elapsed = performance.now() - reveal.t0;
          const raw = Math.min(1, Math.max(0, elapsed / REVEAL_MS));
          p = 1 - Math.pow(1 - raw, 3); // ease-out kubik, cepat lalu mereda
        }
      }
      reveal.p = p;

      const shownLen = total * p;
      const path: { x: number; y: number }[] = [pts[0]];
      let walked = 0;
      for (let i = 0; i < segLen.length; i++) {
        if (walked + segLen[i] <= shownLen) {
          path.push(pts[i + 1]);
          walked += segLen[i];
        } else {
          const f = segLen[i] > 0 ? (shownLen - walked) / segLen[i] : 0;
          path.push({
            x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
            y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
          });
          break;
        }
      }

      /* Selubung kertas yang lebar, lalu inti berwarna status di atasnya.
         Medan hujan di belakangnya bisa berwarna apa saja, jadi status rute
         tidak boleh diadu langsung dengannya — putih memisahkan lintasan dari
         seluruh skala hujan lebih dulu, baru warnanya dibaca. */
      if (path.length > 1) {
        const trace = () => {
          ctx.beginPath();
          path.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
        };

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        trace();
        ctx.lineWidth = 9;
        ctx.strokeStyle = paperCanvasColor();
        ctx.stroke();

        trace();
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = stroke;
        ctx.stroke();
      }

      /* --- penggal akses: PUTUS-PUTUS, dan itu bukan hiasan ---
         Titik berat DAS berjarak ratusan meter dari jalan terdekat, begitu pula
         koordinat posko. Versi sebelumnya menyambung keduanya dengan garis
         penuh yang sama, sehingga peta menyatakan ada jalan di tempat yang
         tidak ada jalannya sama sekali. Garis putus-putus adalah kesepakatan
         kartografi untuk lintasan yang tidak terpetakan; lebarnya pun dibuat
         lebih tipis supaya tidak terbaca sebagai bagian dari rute berkendara.
         Tidak ikut disingkap: yang disingkap adalah perjalanannya, dan penggal
         ini bukan perjalanan yang dirutekan. */
      const legs = evacuationRoute.access
        ? [evacuationRoute.access.origin, evacuationRoute.access.post]
        : [];
      for (const leg of legs) {
        if (leg.meter < 1) continue;
        const a = P(leg.from[0], leg.from[1]);
        const b = P(leg.to[0], leg.to[1]);

        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.lineCap = "butt";

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 5;
        ctx.strokeStyle = paperCanvasColor();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.stroke();

        ctx.restore();
      }
    }

    selectedDraw.forEach((f) => f());
    ctx.globalAlpha = 1;
    hitRef.current = hits;
  }, [
    bbox,
    links,
    snapshot,
    catchmentDefs,
    statusById,
    stateById,
    sites,
    selectedLinkId,
    hoveredId,
    evacuationPosts,
    evacuationRoute,
  ]);

  /** Tautan terdekat dari satu titik layar, atau null. */
  const hitTest = useCallback((x: number, y: number): string | null => {
    let best: string | null = null;
    let bestD = HIT_TOLERANCE_PX;
    for (const s of hitRef.current) {
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((x - s.ax) * dx + (y - s.ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = s.ax + t * dx;
      const py = s.ay + t * dy;
      const d = Math.hypot(x - px, y - py);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  }, []);

  /* `draw` berubah setiap frame data; disimpan di ref supaya pendengar MapLibre
     yang hanya dipasang sekali selalu memanggil versi terbaru. */
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  /* Rute berganti -> mulai penyingkapan, lalu gambar ulang tiap frame sampai
     selesai. Selama medan hujan bergerak tanpa mengubah rute, efek ini tidak
     berjalan sama sekali: geraknya milik perubahan rute, bukan milik waktu. */
  const routeId = evacuationRoute?.id ?? null;
  useEffect(() => {
    if (routeId === null) {
      revealRef.current = { id: null, t0: 0, p: 1 };
      return;
    }
    if (revealRef.current.id === routeId) return;

    revealRef.current = { id: routeId, t0: performance.now(), p: 0 };
    if (prefersReducedMotion()) {
      revealRef.current.p = 1;
      drawRef.current();
      return;
    }

    let raf = 0;
    const step = () => {
      drawRef.current();
      if (revealRef.current.id === routeId && revealRef.current.p < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [routeId]);

  /* -- pembuatan peta, sekali ---------------------------------------------- */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = new MapLibreMap({
      container,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: BASEMAP_TILES,
            tileSize: 256,
            maxzoom: 19,
            attribution: BASEMAP_ATTRIBUTION,
          },
        },
        layers: [
          { id: "ground", type: "background", paint: { "background-color": BASEMAP_GROUND } },
          /* Perlakuan warnanya ada di `./basemap.ts`, dipakai bersama oleh
             peta ini, jendela tinjauan rute, dan kedua kanvas perbandingan. */
          { id: "basemap", type: "raster", source: "basemap", paint: { ...BASEMAP_PAINT } },
        ],
      },
      bounds: [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      fitBoundsOptions: { padding: 32 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });

    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.getCanvas().style.cursor = "default";

    map.on("error", (e) => {
      console.error("[RainMap]", e.error?.message ?? e);
    });

    // gambar ulang setiap kali kamera bergerak; `render` mencakup animasi zum
    map.on("move", () => drawRef.current());
    map.on("moveend", () => drawRef.current());

    map.on("mousemove", (e: MapMouseEvent) => {
      const id = hitTest(e.point.x, e.point.y);
      setHoveredId(id);
      map.getCanvas().style.cursor = id ? "pointer" : "default";
    });
    map.on("mouseout", () => setHoveredId(null));
    map.on("click", (e: MapMouseEvent) => {
      onSelectLink(hitTest(e.point.x, e.point.y));
    });

    map.on("load", () => setLoaded(true));

    /* MapLibre hanya mengikuti resize jendela, bukan resize wadahnya. */
    const ro = new ResizeObserver(() => {
      map.resize();
      drawRef.current();
    });
    ro.observe(container);

    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __hujanMap?: MapLibreMap }).__hujanMap = map;
    }

    mapRef.current = map;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox]);

  return (
    <div className="absolute inset-0">
      {/* wadah peta memakai h-full, BUKAN absolute: stylesheet MapLibre memaksa
          `.maplibregl-map { position: relative }` sehingga posisi absolut apa pun
          di elemen ini dibatalkan dan tingginya jatuh ke 0. */}
      <div ref={containerRef} className="h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />
      {!loaded ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-deep">
          <span className="text-2xs uppercase tracking-label text-text-dim">Memuat peta…</span>
        </div>
      ) : null}
    </div>
  );
}
