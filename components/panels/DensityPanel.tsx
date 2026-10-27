"use client";

import { useState } from "react";
import type { DensityStats } from "./density";
import { Divider } from "./SectionLabel";
import Alert from "@/components/ui/alert";

/**
 * Panel perbandingan kerapatan pengamatan (tugas C4, prioritas P2).
 *
 * Menampilkan jumlah penakar hujan versus jumlah tautan pada kotak batas yang sama,
 * beserta rasionya. Rasio ditampilkan besar karena itulah satu satunya angka yang
 * perlu diingat juri dari panel ini.
 *
 * Kriteria diterima C4 menuntut panel ini dapat dimatikan supaya tidak mengganggu
 * demo utama. Ada dua tuas untuk itu, dan keduanya diperlukan:
 *   1. `enabled` di `data/density-config.json`, untuk mematikannya sebelum demo
 *      tanpa menyentuh kode.
 *   2. Tombol tutup di panel, untuk mematikannya di tengah demo kalau ternyata
 *      mengganggu. Tidak ada yang mau menyunting berkas di depan juri.
 */
export function DensityPanel({
  stats,
  sourceLabel,
  bboxLabel,
  verified,
}: {
  stats: DensityStats;
  sourceLabel: string;
  bboxLabel: string;
  /** false berarti angka penakar hujan belum diverifikasi, dan itu dinyatakan di layar */
  verified: boolean;
}) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  const [lonMin, latMin, lonMax, latMax] = stats.bbox;

  return (
    <div className="bg-surface border border-border rounded-md overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="text-[10px] uppercase tracking-[0.16em] text-text-mute">
          Kerapatan pengamatan
        </h2>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Sembunyikan panel kerapatan"
          className="text-[10px] uppercase tracking-[0.12em] text-text-mute hover:text-text"
        >
          Tutup
        </button>
      </div>
      <Divider />

      <div className="px-4 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-3xl leading-none text-signal tabular-nums">
            {stats.ratioLabel}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-mute">
            penakar : tautan
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1">
          <Row label="Penakar hujan" value={`${stats.rainGaugeCount}`} />
          <Row label="Tautan" value={`${stats.linkCount}`} />
          <Row label="Total lintasan" value={`${stats.totalPathKm.toFixed(1)} km`} />
          <Row
            label="Rata rata"
            value={
              stats.linkCount > 0 ? `${(stats.totalPathKm / stats.linkCount).toFixed(2)} km` : "-"
            }
          />
        </div>
      </div>

      <Divider />

      <div className="px-4 py-3">
        <p className="font-mono text-[10px] leading-relaxed text-text-mute tabular-nums">
          {lonMin.toFixed(3)} .. {lonMax.toFixed(3)} bujur
          <br />
          {latMin.toFixed(3)} .. {latMax.toFixed(3)} lintang
        </p>
        <p className="mt-2 text-[10px] leading-relaxed text-text-mute">{bboxLabel}</p>
        <p className="mt-2 text-[10px] leading-relaxed text-text-mute">
          Sumber: {sourceLabel}
        </p>
        {/* Kuning, bukan merah. Angka yang belum diverifikasi bukan kesalahan —
            ia sah dipakai selama tidak disebut angka resmi. Merah di sini akan
            menyamakan "belum dirujuk ke BMKG" dengan "gagal dimuat". */}
        {!verified && (
          <Alert type="warning" dense className="mt-2" label="Belum diverifikasi">
            Jumlah penakar hujan belum dirujuk ke basis data BMKG. Jangan disampaikan sebagai
            angka resmi.
          </Alert>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-[0.12em] text-text-mute">{label}</span>
      <span className="font-mono text-xs text-text tabular-nums">{value}</span>
    </div>
  );
}
