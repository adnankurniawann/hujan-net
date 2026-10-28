"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type gsap from "gsap";
import { playModalIn, playModalOut } from "@/components/ui/motion";
import { SafetyAnnunciator } from "@/components/evacuation/SafetyAnnunciator";
import Alert from "@/components/ui/alert";
import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Snapshot } from "@/lib/types";
import { EVACUATION_POSTS, type EvacuationPost } from "@/lib/evacuation/data";
import type { DetailedEvacuationRoute, TurnStep } from "@/lib/evacuation/routes";
import { fieldToImageData } from "@/components/map/colorRamp";
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_GROUND,
  BASEMAP_PAINT,
  BASEMAP_TILES,
  hasWebGl2,
} from "@/components/map/basemap";
import {
  inkCanvasColor,
  paperCanvasColor,
  safetyCanvasColor,
} from "@/components/evacuation/safety";
import {
  ConsoleButton,
  IconButton,
  Num,
  SectionLabel,
  SimulationBadge,
} from "@/components/ui/primitives";

/* ============================================================================
 * Jendela tinjauan rute evakuasi.
 *
 * Bukan navigasi belok demi belok. Operator tidak sedang menyetir — ia sedang
 * MENILAI sebuah rute sebelum menyerahkannya ke tim lapangan. Karena itu yang
 * digambar besar di sini adalah lintasan di atas medan hujan hasil inversi,
 * dan daftar di sebelah kanan menjelaskan MENGAPA rute itu bernilai aman atau
 * tidak, bukan ke arah mana harus belok.
 *
 * Medan hujannya digambar dengan `fieldToImageData()` yang sama dengan peta
 * utama dan kedua kanvas perbandingan, jadi skala warnanya tidak bisa berbeda.
 * Tanpa itu, jendela ini akan menampilkan penilaian keamanan tanpa menunjukkan
 * bukti yang dipakai menilainya.
 * ==========================================================================*/

interface Props {
  route: DetailedEvacuationRoute | null;
  post: EvacuationPost | null;
  snapshot: Snapshot | null;
  bbox: [number, number, number, number];
  onClose: () => void;
}

export default function EvacuationRouteModal({ route, post, snapshot, bbox, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef<gsap.core.Timeline | null>(null);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  /* Menutup lewat animasi keluar, lalu baru melepas jendelanya.
     `onClose` dipanggil dari `onComplete` timeline, bukan dari setTimeout:
     kalau penutupannya diinterupsi, timeline-nya dibunuh dan panggilan balik
     itu tidak pernah berjalan — jadi jendela tidak dilepas di tengah jalan. */
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = playModalOut(backdropRef.current, dialogRef.current, onClose);
    if (!closingRef.current) onClose();
  }, [onClose]);

  /* Masuk. Fokus dipindahkan lewat panggilan balik onVisible, BUKAN langsung
     setelah ini: animasi masuk menulis visibility: hidden pada frame pertama,
     dan .focus() di dalam subtree tersembunyi gagal diam-diam. */
  useEffect(() => {
    const tl = playModalIn(backdropRef.current, dialogRef.current, () => {
      const FOCUSABLE =
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    return () => {
      tl?.kill();
      closingRef.current?.kill();
      closingRef.current = null;
    };
  }, []);

  const targetPost =
    post ??
    (route ? EVACUATION_POSTS.find((p) => p.id === route.targetPostId) ?? null : null);

  /* Nilai terbaru dibaca lewat ref oleh penggambar, supaya peta tidak perlu
     dibangun ulang setiap kali medan hujan bergerak. Sebelumnya efeknya
     berhenti di `if (mapRef.current) return`, sehingga peta memang tidak
     dibangun ulang — tetapi fungsi gambarnya masih memegang rute lama, dan
     mengganti posko tidak pernah mengubah garis di layar. */
  const drawDataRef = useRef({ route, targetPost, snapshot, bbox });
  drawDataRef.current = { route, targetPost, snapshot, bbox };

  const drawRoute = useCallback(() => {
    const map = mapRef.current;
    const canvas = overlayRef.current;
    const container = containerRef.current;
    const { route: r, targetPost: tp, snapshot: snap, bbox: bb } = drawDataRef.current;
    if (!map || !canvas || !container || !r || !tp) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const P = (lon: number, lat: number) => map.project([lon, lat]);

    /* --- 1. medan hujan rekonstruksi, paling bawah --- */
    if (snap) {
      const { nx, ny, values } = snap.reconstruction;
      if (!gridRef.current) gridRef.current = document.createElement("canvas");
      const small = gridRef.current;
      if (small.width !== nx || small.height !== ny) {
        small.width = nx;
        small.height = ny;
      }
      const sctx = small.getContext("2d");
      if (sctx) {
        sctx.putImageData(fieldToImageData(sctx, values, nx, ny), 0, 0);
        const tl = P(bb[0], bb[3]);
        const br = P(bb[2], bb[1]);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(small, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      }
    }

    if (r.waypoints.length === 0) return;

    /* --- 2. lintasan evakuasi --- */
    const stroke = safetyCanvasColor(r.safetyStatus);
    if (r.waypoints.length > 1) {
      // Alas kertas di bawah garis, supaya lintasan tetap terbaca di atas hujan pekat.
      ctx.beginPath();
      ctx.lineWidth = 8;
      ctx.strokeStyle = paperCanvasColor();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      r.waypoints.forEach((wp, i) => {
        const p = P(wp.lon, wp.lat);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = stroke;
      r.waypoints.forEach((wp, i) => {
        const p = P(wp.lon, wp.lat);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    /* --- 2b. penggal akses, putus-putus ---
       Sama dengan peta operasi: penggal dari titik berat DAS ke jalan terdekat
       dan dari jalan ke posko tidak berada di atas jalan terpetakan mana pun,
       jadi ia tidak boleh digambar dengan garis yang sama dengan jalannya. */
    for (const leg of r.access ? [r.access.origin, r.access.post] : []) {
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

    /* --- 3. titik asal: tinta, karena asal bukan sebuah status ---
       Titiknya adalah titik berat DAS, bukan ujung garis jalan: itulah wilayah
       yang sedang dievakuasi, dan penggal putus-putus di atas yang menjelaskan
       bagaimana ia tersambung ke jalan. */
    const originPoint = r.access?.origin.from ?? [r.waypoints[0].lon, r.waypoints[0].lat];
    const startP = P(originPoint[0], originPoint[1]);
    ctx.beginPath();
    ctx.arc(startP.x, startP.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = inkCanvasColor();
    ctx.fill();
    ctx.strokeStyle = paperCanvasColor();
    ctx.lineWidth = 2;
    ctx.stroke();

    /* --- 4. posko tujuan: cincin berwarna status rute --- */
    const endP = P(tp.lon, tp.lat);
    ctx.beginPath();
    ctx.arc(endP.x, endP.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = paperCanvasColor();
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(endP.x, endP.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = stroke;
    ctx.fill();
  }, []);

  /* Peta dibangun SEKALI, saat jendela dipasang.
     `route` sengaja tidak menjadi kebergantungan. Sejak penilaian keamanan ikut
     hidup mengikuti medan hujan, objek rutenya lahir baru setiap langkah waktu
     meskipun lintasannya sama persis; dengan `route` di daftar kebergantungan,
     efek ini akan membongkar dan membangun ulang seluruh peta MapLibre beberapa
     kali per detik — ubin dimuat ulang, peta berkedip, dan kamera melompat
     kembali ke awal setiap kali. Bingkai awalnya dibaca dari ref, bukan dari
     prop, karena yang dibutuhkan hanya nilainya pada saat pemasangan. */
  useEffect(() => {
    const container = containerRef.current;
    const initial = drawDataRef.current.route;
    if (!container || mapRef.current || !initial || !hasWebGl2()) return;

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
          { id: "basemap", type: "raster", source: "basemap", paint: { ...BASEMAP_PAINT } },
        ],
      },
      bounds: initial.bounds,
      fitBoundsOptions: { padding: 56 },
      attributionControl: false,
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("move", drawRoute);
    map.on("moveend", drawRoute);
    map.on("load", drawRoute);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [drawRoute]);

  /* Kamera hanya diarahkan ulang ketika LINTASANNYA yang berganti, bukan ketika
     penilaiannya diperbarui. `id` berisi pasangan DAS–posko, jadi ia tetap sama
     sepanjang hujan bergerak di atas lintasan yang sama. */
  const routeId = route?.id ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeId) return;
    map.fitBounds(drawDataRef.current.route!.bounds, { padding: 56, duration: 320 });
  }, [routeId]);

  /* Penilaian atau medan hujan berubah -> hanya lapisan atas yang digambar
     ulang. Peta dan kameranya tidak disentuh. */
  useEffect(() => {
    drawRoute();
  }, [route, snapshot, drawRoute]);

  /* ---- perilaku dialog ----
     Escape menutup, fokus terkunci di dalam jendela selama terbuka, dan fokus
     kembali ke tombol yang membukanya saat ditutup. Tanpa ini operator yang
     bekerja dengan papan ketik bisa menekan Tab keluar dari dialog dan
     menekan tombol di panggung yang sedang tertutup di belakangnya. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;

      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [onClose, requestClose]);

  if (!route || !targetPost) return null;

  const rainKnown = snapshot !== null;

  /* Ringkasan penugasan untuk tim lapangan. Operator tidak menyetir rutenya —
     ia menyerahkannya, jadi yang disalin adalah keputusan beserta dasarnya,
     bukan petunjuk belok. */
  const handleCopy = async () => {
    const summary = [
      `Penugasan evakuasi: ${route.startName} -> ${targetPost.name}`,
      `Alamat posko: ${targetPost.address}`,
      `Jarak ${route.distanceKm} km, tempuh sekitar ${route.durationMins} menit`,
      rainKnown
        ? `Status lintasan ${route.safetyStatus}, hujan maksimum ${route.maxRainRateMmH} mm/jam`
        : "Status lintasan belum dinilai: medan hujan belum tersedia",
      `Daya tampung posko ${targetPost.occupied} / ${targetPost.capacity} jiwa`,
      `Kontak posko: ${targetPost.phone}`,
      "Sumber: HujanNet Dashboard (DATA SIMULASI)",
    ].join("\n");

    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(summary);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/35 p-6 backdrop-blur-glass"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="evac-route-title"
        aria-describedby="evac-route-basis"
        className="flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-shell shadow-float"
      >
        {/* ---- kepala ---- */}
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="evac-route-title"
                className="min-w-0 break-words text-sm font-semibold leading-5 text-text"
              >
                {targetPost.name}
              </h2>
            </div>
            <p className="mt-1 text-2xs leading-4 text-text-dim">
              Lintasan dari {route.startName} · {targetPost.address}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {/* "lintasan sintetis" sudah tidak benar sejak lintasannya dicari
                di atas jaringan jalan OpenStreetMap. Yang masih karangan hanya
                daftar posko dan medan hujannya, dan label ini harus menyebutkan
                persis itu — penanda kejujuran yang isinya sendiri sudah basi
                justru mengajari orang untuk tidak mempercayainya. */}
            <SimulationBadge detail="posko sintetis · jalan dari OpenStreetMap" />
            <IconButton label="Tutup tinjauan rute" onClick={requestClose}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden focusable="false">
                <path
                  d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </IconButton>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* ---- peta tinjauan ---- */}
          <div className="relative min-h-[320px] flex-1">
            <div ref={containerRef} className="h-full w-full" />
            <canvas ref={overlayRef} className="pointer-events-none absolute inset-0" />

            {/* Kaca dipakai di sini karena yang di belakangnya memang peta yang
                bergerak — syarat satu-satunya untuk kelas ini. */}
            <div className="glass pointer-events-none absolute left-4 top-4 flex items-center gap-4 px-4 py-2.5">
              <div className="flex flex-col">
                <SectionLabel>Jarak</SectionLabel>
                <Num value={route.distanceKm} unit="km" decimals={2} className="text-sm" />
              </div>
              <span className="h-8 w-px bg-hairline" />
              <div className="flex flex-col">
                <SectionLabel>Tempuh</SectionLabel>
                <Num value={route.durationMins} unit="menit" decimals={0} className="text-sm" />
              </div>
              <span className="h-8 w-px bg-hairline" />
              <div className="flex flex-col">
                <SectionLabel>Hujan maks</SectionLabel>
                <Num
                  value={rainKnown ? route.maxRainRateMmH : null}
                  unit="mm/jam"
                  decimals={1}
                  tone="rain"
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* ---- sisi kanan: dasar penilaian ---- */}
          <div className="flex w-full shrink-0 flex-col border-t border-border bg-surface lg:w-[360px] lg:border-l lg:border-t-0">
            <div id="evac-route-basis" className="shrink-0 border-b border-hairline px-4 py-3">
              <SafetyAnnunciator
                status={route.safetyStatus}
                rainMmH={rainKnown ? route.maxRainRateMmH : null}
                known={rainKnown}
              />
              <p className="mt-2.5 text-2xs leading-4 text-text-dim">
                Intensitas diambil dari medan hujan hasil inversi pada tiap titik lintasan, bukan
                dari perkiraan cuaca terpisah.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <SectionLabel>Ruas lintasan</SectionLabel>
              <ol className="mt-2 flex flex-col gap-1.5">
                {route.steps.map((step) => (
                  <li
                    key={step.id}
                    className="flex items-start gap-2.5 rounded-md border border-hairline bg-text/[0.03] px-3 py-2"
                  >
                    <span className="mt-0.5 shrink-0 text-text-mute">
                      <StepGlyph direction={step.direction} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-2xs font-medium leading-4 text-text">
                        {step.roadName}
                      </span>
                      {step.distanceMeter > 0 ? (
                        <span className="mt-0.5 block text-3xs text-text-dim">
                          <Num value={step.distanceMeter} unit="m" decimals={0} tone="dim" />
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="shrink-0 border-t border-border px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <SectionLabel>Kontak posko</SectionLabel>
                <a
                  href={`tel:${targetPost.phone.replace(/[^0-9+]/g, "")}`}
                  className="tnum rounded-sm text-2xs text-text underline decoration-border underline-offset-2 transition-colors duration-150 hover:decoration-text-mute"
                >
                  {targetPost.phone}
                </a>
              </div>
              <ConsoleButton className="mt-3 w-full" onClick={handleCopy}>
                {copied === "ok" ? "Ringkasan disalin" : "Salin ringkasan penugasan"}
              </ConsoleButton>
              {copied === "fail" ? (
                <Alert type="warning" dense label="Papan klip tidak tersedia" className="mt-2">
                  Ringkasan dapat dibaca langsung dari daftar ruas di atas.
                </Alert>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Lambang arah ruas. Ikon di konsol ini selalu menggambar benda atau arah yang
 * nyata — panah ini menunjukkan arah belok, jadi ia membawa arti. Emoji yang
 * sebelumnya dipakai di sini tidak.
 */
function StepGlyph({ direction }: { direction: TurnStep["direction"] }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 12 12",
    "aria-hidden": true,
    focusable: "false" as const,
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  if (direction === "turn-right") {
    return (
      <svg {...common}>
        <path d="M3 10V6a2 2 0 012-2h4" />
        <path d="M7 2l2.5 2L7 6" />
      </svg>
    );
  }
  if (direction === "turn-left") {
    return (
      <svg {...common}>
        <path d="M9 10V6a2 2 0 00-2-2H3" />
        <path d="M5 2L2.5 4 5 6" />
      </svg>
    );
  }
  if (direction === "arrive") {
    return (
      <svg {...common}>
        <circle cx="6" cy="6" r="4" />
        <circle cx="6" cy="6" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M6 10V2" />
      <path d="M3.5 4.5L6 2l2.5 2.5" />
    </svg>
  );
}
