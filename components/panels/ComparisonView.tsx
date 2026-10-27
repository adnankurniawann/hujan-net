"use client";

import { useEffect, useRef, useState } from "react";
import type { GridField, Link, Snapshot } from "@/lib/types";
import type { CatchmentDef } from "@/components/preview/catchments";
import { fieldToImageData } from "@/components/map/colorRamp";
import {
  BASEMAP_ALPHA,
  BASEMAP_CANVAS_FILTER,
  BASEMAP_GROUND,
  basemapTileUrl,
} from "@/components/map/basemap";
import { inkCanvasColor, paperCanvasColor } from "@/components/map/canvasTokens";
import RainLegend from "@/components/map/RainLegend";
import { ConsoleButton, Num, SectionLabel, SimulationBadge } from "@/components/ui/primitives";

const KM_PER_DEG = 110.6;

/** Sel dengan nilai tertinggi pada satu medan, dalam koordinat bumi. */
function peakOf(field: GridField): { lat: number; lon: number; value: number } {
  const [lonMin, latMin, lonMax, latMax] = field.bbox;
  let best = -Infinity;
  let bi = 0;
  for (let i = 0; i < field.values.length; i++) {
    if (field.values[i] > best) {
      best = field.values[i];
      bi = i;
    }
  }
  const x = bi % field.nx;
  const y = Math.floor(bi / field.nx);
  return {
    lon: lonMin + ((x + 0.5) / field.nx) * (lonMax - lonMin),
    lat: latMin + ((y + 0.5) / field.ny) * (latMax - latMin),
    value: best,
  };
}

function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (a.lat - b.lat) * KM_PER_DEG;
  const dx = (a.lon - b.lon) * KM_PER_DEG;
  return Math.sqrt(dx * dx + dy * dy);
}

function lon2tile(lon: number, zoom: number) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function lat2tile(lat: number, zoom: number) {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
}
function tile2lon(x: number, z: number) {
  return (x / Math.pow(2, z)) * 360 - 180;
}
function tile2lat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

const TILE_CACHE = new Map<string, HTMLImageElement>();
function getTileImage(z: number, x: number, y: number, onLoaded: () => void): HTMLImageElement | null {
  const key = `${z}/${x}/${y}`;
  if (TILE_CACHE.has(key)) {
    const img = TILE_CACHE.get(key)!;
    return img.complete ? img : null;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = basemapTileUrl(z, x, y);
  img.onload = () => onLoaded();
  TILE_CACHE.set(key, img);
  return null;
}

/**
 * Satu medan hujan di atas kanvas, lengkap dengan peta asli, jaringan tautan, dan menara.
 * Kedua panel perbandingan memakai komponen ini dengan perlakuan yang identik.
 */
function FieldCanvas({
  field,
  links,
  catchmentDefs,
}: {
  field: GridField;
  links: Link[];
  catchmentDefs: CatchmentDef[];
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    if (!gridRef.current) gridRef.current = document.createElement("canvas");
    const small = gridRef.current;

    const draw = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const [lonMin, latMin, lonMax, latMax] = field.bbox;
      const bboxW = lonMax - lonMin;
      const bboxH = latMax - latMin;

      const scale = Math.max(rect.width / bboxW, rect.height / bboxH);
      const drawW = bboxW * scale;
      const drawH = bboxH * scale;
      const ox = (rect.width - drawW) / 2;
      const oy = (rect.height - drawH) / 2;

      const toX = (lon: number) => ox + ((lon - lonMin) / bboxW) * drawW;
      const toY = (lat: number) => oy + ((latMax - lat) / bboxH) * drawH;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, rect.width, rect.height);
      ctx.clip();

      ctx.fillStyle = BASEMAP_GROUND;
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Gambar ubin peta dasar (basemap tiles)
      const zoom = 12;
      const xMin = lon2tile(lonMin, zoom);
      const xMax = lon2tile(lonMax, zoom);
      const yMin = lat2tile(latMax, zoom);
      const yMax = lat2tile(latMin, zoom);

      /* Ubin dibuat tak berwarna, sama seperti peta utama. Ini panel yang
         membandingkan dua medan hujan dengan mata, dan alas berwarna di bawah
         keduanya ikut menggeser warna yang dibaca darinya. */
      ctx.save();
      ctx.filter = BASEMAP_CANVAS_FILTER;
      ctx.globalAlpha = BASEMAP_ALPHA;

      for (let tx = xMin; tx <= xMax; tx++) {
        for (let ty = yMin; ty <= yMax; ty++) {
          const tLonMin = tile2lon(tx, zoom);
          const tLonMax = tile2lon(tx + 1, zoom);
          const tLatMax = tile2lat(ty, zoom);
          const tLatMin = tile2lat(ty + 1, zoom);

          const px1 = toX(tLonMin);
          const py1 = toY(tLatMax);
          const px2 = toX(tLonMax);
          const py2 = toY(tLatMin);

          const tileImg = getTileImage(zoom, tx, ty, draw);
          if (tileImg) {
            ctx.drawImage(tileImg, px1, py1, px2 - px1, py2 - py1);
          }
        }
      }

      ctx.restore();

      // medan hujan, dinaikkan resolusinya dengan interpolasi halus
      const { nx, ny, values } = field;
      if (small.width !== nx || small.height !== ny) {
        small.width = nx;
        small.height = ny;
      }
      const sctx = small.getContext("2d");
      if (sctx) {
        sctx.putImageData(fieldToImageData(sctx, values, nx, ny), 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(small, ox, oy, drawW, drawH);
      }

      /* Jaringan tautan, tenang dan identik di kedua panel.
         Bertinta, bukan lavender. Warna sebelumnya di sini — rgba(168,159,190)
         — adalah sisa terakhir `--violet`, rona yang sudah dihapus dari sistem
         karena ia sempat berarti "kontrol aktif" sekaligus "ini data". Di
         panggung ini ia bahkan menjadi rona kelima, dan duduk tepat di sebelah
         biru hujan yang sedang dinilai. */
      ctx.strokeStyle = inkCanvasColor(0.28);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const l of links) {
        ctx.moveTo(toX(l.siteA.lon), toY(l.siteA.lat));
        ctx.lineTo(toX(l.siteB.lon), toY(l.siteB.lat));
      }
      ctx.stroke();

      // titik-titik menara (tower dots)
      const sitesSet = new Set<string>();
      for (const l of links) {
        for (const s of [l.siteA, l.siteB]) {
          const key = `${s.lon.toFixed(5)},${s.lat.toFixed(5)}`;
          if (sitesSet.has(key)) continue;
          sitesSet.add(key);
          const x = toX(s.lon);
          const y = toY(s.lat);
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = paperCanvasColor();
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = inkCanvasColor();
          ctx.fill();
        }
      }

      // tanpa bingkai internal: tepi panel sudah digambar oleh tata letak
      ctx.restore();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [field, links, catchmentDefs]);

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}

function FieldPanel({
  label,
  badge,
  field,
  links,
  catchmentDefs,
  peakValue,
}: {
  label: string;
  badge?: React.ReactNode;
  field: GridField;
  links: Link[];
  catchmentDefs: CatchmentDef[];
  peakValue: number;
}) {
  return (
    <div className="card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
        <SectionLabel>{label}</SectionLabel>
        <span className="flex items-center gap-3">
          {badge}
          <span className="flex items-baseline gap-1">
            <SectionLabel>Puncak</SectionLabel>
            <Num value={peakValue} unit="mm/jam" decimals={1} tone="rain" className="text-2xs" />
          </span>
        </span>
      </header>
      <FieldCanvas field={field} links={links} catchmentDefs={catchmentDefs} />
    </div>
  );
}

/** Salah satu metode rekonstruksi. `ml` hanya sah kalau Snapshot punya `mlReconstruction`. */
type Method = "idw" | "ml";

export default function ComparisonView({
  snapshot,
  links,
  catchmentDefs,
}: {
  snapshot: Snapshot;
  links: Link[];
  catchmentDefs: CatchmentDef[];
}) {
  /* `mlReconstruction` adalah perluasan opsional pada Snapshot (lihat
     lib/types.ts): hanya ada kalau server memuat operator terlatih. Sakelar
     IDW/AI baru dirender kalau datanya benar benar ada, supaya panel ini
     tidak pernah menjanjikan metode yang tidak tersedia. */
  const hasMl = snapshot.mlReconstruction !== undefined && snapshot.mlRmse !== undefined;
  const [method, setMethod] = useState<Method>("idw");
  const activeMethod = hasMl ? method : "idw";

  const reconField = activeMethod === "ml" ? snapshot.mlReconstruction! : snapshot.reconstruction;
  const reconRmse = activeMethod === "ml" ? snapshot.mlRmse! : snapshot.rmse;

  const truthPeak = peakOf(snapshot.truth);
  const reconPeak = peakOf(reconField);
  const peakOffsetKm = kmBetween(truthPeak, reconPeak);
  const rainingNow = truthPeak.value > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 gap-4">
        {/* "(Simulasi)" dilepas dari judulnya: lencana DATA SIMULASI berdiri
            delapan piksel di sebelahnya dan sudah mengatakan hal yang sama,
            sementara judul dua barisnya mendesak lencana itu ke bawah. */}
        <FieldPanel
          label="Medan Sebenarnya"
          badge={<SimulationBadge />}
          field={snapshot.truth}
          links={links}
          catchmentDefs={catchmentDefs}
          peakValue={truthPeak.value}
        />
        <FieldPanel
          label="Hasil Rekonstruksi Kami"
          badge={
            hasMl ? (
              <span className="pill-group flex h-7 gap-0.5 p-0.5">
                <ConsoleButton active={activeMethod === "idw"} onClick={() => setMethod("idw")}>
                  IDW
                </ConsoleButton>
                <ConsoleButton active={activeMethod === "ml"} onClick={() => setMethod("ml")}>
                  AI Terlatih
                </ConsoleButton>
              </span>
            ) : undefined
          }
          field={reconField}
          links={links}
          catchmentDefs={catchmentDefs}
          peakValue={reconPeak.value}
        />
      </div>

      {/* ---- strip galat: angka yang tidak bisa ditunjukkan tim lain ---- */}
      <div className="card flex shrink-0 items-center gap-6 px-5 py-4">
        <div className="flex flex-col gap-1">
          <SectionLabel>Galat Rekonstruksi (RMSE)</SectionLabel>
          <span className="figure text-4xl text-text">
            {reconRmse.toFixed(2)}
            <span className="ml-2 font-sans text-2xs font-normal tracking-normal text-text-dim">
              mm/jam
            </span>
          </span>
        </div>

        <p className="max-w-[46ch] text-3xs leading-5 text-text-dim">
          {activeMethod === "ml" ? (
            <>
              Kanan diisi operator linear yang bobotnya DIPELAJARI dari ratusan badai sintetis,
              bukan dirancang tangan seperti IDW — lihat{" "}
              <code className="text-text-dim/90">scripts/train-operator.ts</code>. Bentuknya
              sama: satu matriks bobot per sel per tautan, hanya sumbernya beda.
            </>
          ) : (
            <>
              Kiri adalah medan hujan yang dibangkitkan simulator. Kanan direkonstruksi hanya dari
              redaman {links.length} tautan gelombang mikro, tanpa satu pun penakar hujan. Karena
              kebenaran dasarnya diketahui, galatnya bisa diukur, bukan diklaim.
            </>
          )}
        </p>

        <div className="ml-auto flex items-stretch gap-5">
          {hasMl && (
            <div className="flex flex-col justify-center gap-1 border-l border-hairline pl-5">
              <SectionLabel>AI vs IDW</SectionLabel>
              <Num
                value={((snapshot.mlRmse! - snapshot.rmse) / snapshot.rmse) * 100}
                unit="%"
                decimals={1}
                tone={snapshot.mlRmse! < snapshot.rmse ? "ok" : "alert"}
                className="text-sm"
              />
            </div>
          )}
          <div className="flex flex-col justify-center gap-1 border-l border-hairline pl-5">
            <SectionLabel>Selisih Posisi Puncak</SectionLabel>
            <Num
              value={rainingNow ? peakOffsetKm : null}
              unit="km"
              decimals={2}
              tone="signal"
              className="text-sm"
            />
          </div>
          <div className="flex flex-col justify-center gap-1 border-l border-hairline pl-5">
            <SectionLabel>Selisih Nilai Puncak</SectionLabel>
            <Num
              value={rainingNow ? reconPeak.value - truthPeak.value : null}
              unit="mm/jam"
              decimals={1}
              tone="rain"
              className="text-sm"
            />
          </div>
          <div className="flex items-center pl-1">
            <RainLegend label="Skala Sama Untuk Kedua Peta" />
          </div>
        </div>
      </div>
    </div>
  );
}
