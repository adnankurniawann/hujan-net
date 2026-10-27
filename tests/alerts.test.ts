// Uji lapisan peringatan, tugas C2.
//
// Hanya bagian MURNI yang diuji di sini: pendeteksian tepi naik, idempotensi, dan
// sambungan ke lapisan simulasi. Bagian yang menulis ke SQLite sengaja TIDAK diuji
// di berkas ini, karena `prisma/schema.prisma` menunjuk `file:./dev.db` secara
// langsung sehingga uji otomatis akan menimpa basis data demo. Perilaku basis data
// diverifikasi lewat endpoint pada server yang berjalan. Kalau nanti mau diuji
// otomatis juga, yang dibutuhkan adalah seam basis data uji, dan itu perlu dibahas
// di grup lebih dulu karena mengubah cara semua orang menjalankan proyek.

import test from "node:test";
import assert from "node:assert/strict";

import type { CatchmentState } from "../lib/types.ts";
import { detectCandidates } from "../lib/alerts/detect.ts";
import { alertId } from "../lib/alerts/detect.ts";
import { clearSimFramesCache, loadSimFrames } from "../lib/alerts/pipeline.ts";
import { AlertError } from "../lib/alerts/types.ts";
import {
  buildRainSeries,
  catchmentStatesAt,
  loadCatchmentData,
} from "../lib/catchment/index.ts";
import { EVENT_DURATION_S, SAMPLE_COUNT } from "../lib/sim/scenario.ts";

const { catchments, config } = loadCatchmentData();

/** Bingkai status buatan, supaya tepi naik bisa diuji tanpa menjalankan simulasi. */
function frame(t: number, status: CatchmentState["status"], accum1h: number) {
  const state: CatchmentState = {
    id: "C-03",
    name: "DAS Gadog",
    accum1h,
    accum3h: accum1h,
    accum6h: accum1h,
    thresholdMm: 8,
    status,
  };
  return { t, states: [state] };
}

test("AlertError membawa kode dan bisa dimuat mode strip-only", () => {
  const err = new AlertError("ALREADY_DECIDED", "sudah diputuskan");
  assert.equal(err.code, "ALREADY_DECIDED");
  assert.equal(err.name, "AlertError");
  assert.ok(err instanceof Error);
});

test("kandidat lahir pada tepi naik, bukan selama status bertahan", () => {
  const timeline = [
    frame(0, "normal", 0),
    frame(60, "waspada", 5),
    frame(120, "waspada", 6),
    frame(180, "waspada", 7),
    frame(240, "siaga", 9),
    frame(300, "siaga", 10),
    frame(360, "siaga", 11),
  ];
  const seeds = detectCandidates(timeline, config, "uji");
  assert.equal(seeds.length, 2, "satu waspada dan satu siaga, bukan enam");
  assert.equal(seeds[0].level, "waspada");
  assert.equal(seeds[0].raisedAtSec, 60);
  assert.equal(seeds[1].level, "siaga");
  assert.equal(seeds[1].raisedAtSec, 240);
});

test("normal langsung ke siaga menghasilkan satu kandidat, bukan dua", () => {
  const seeds = detectCandidates([frame(0, "normal", 0), frame(60, "siaga", 20)], config, "uji");
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].level, "siaga");
});

test("turun ke normal lalu naik lagi adalah kejadian baru", () => {
  const timeline = [
    frame(0, "normal", 0),
    frame(60, "waspada", 5),
    frame(120, "normal", 1),
    frame(180, "waspada", 5),
  ];
  const seeds = detectCandidates(timeline, config, "uji");
  assert.equal(seeds.length, 2);
  assert.notEqual(seeds[0].id, seeds[1].id);
  assert.equal(seeds[1].raisedAtSec, 180);
});

test("status turun tidak melahirkan kandidat", () => {
  const timeline = [frame(0, "siaga", 20), frame(60, "waspada", 5), frame(120, "normal", 0)];
  // Bingkai pertama tetap tepi naik dari keadaan awal normal.
  const seeds = detectCandidates(timeline, config, "uji");
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].level, "siaga");
});

test("id kandidat deterministik dan menyertakan eventId", () => {
  const timeline = [frame(0, "normal", 0), frame(60, "siaga", 20)];
  const first = detectCandidates(timeline, config, "kejadian-a");
  const again = detectCandidates(timeline, config, "kejadian-a");
  const other = detectCandidates(timeline, config, "kejadian-b");

  assert.deepEqual(
    first.map((s) => s.id),
    again.map((s) => s.id),
    "pendeteksian ulang harus menghasilkan id yang sama",
  );
  assert.notEqual(first[0].id, other[0].id, "eventId berbeda harus memisahkan riwayat");
  assert.equal(first[0].id, alertId("kejadian-a", "C-03", "siaga", 60));
});

test("eventId wajib diisi", () => {
  assert.throws(() => detectCandidates([frame(0, "normal", 0)], config, ""), /eventId/);
});

test("bingkai kosong tidak melahirkan kandidat", () => {
  assert.deepEqual(detectCandidates([], config, "uji"), []);
});

test("loadSimFrames memberi satu bingkai per cuplikan kejadian", async () => {
  clearSimFramesCache();
  const { frames, eventId } = await loadSimFrames();

  assert.equal(frames.length, SAMPLE_COUNT);
  assert.equal(frames[0].t, 0);
  assert.equal(frames[frames.length - 1].t, EVENT_DURATION_S);
  assert.match(eventId, /^sim-[0-9a-f]{8}$/);

  for (const f of frames) {
    assert.ok(f.field.values.length === f.field.nx * f.field.ny);
    assert.ok(f.field.values.every((v) => Number.isFinite(v)));
  }
});

test("loadSimFrames menyinggahkan hasil dan eventId-nya stabil", async () => {
  clearSimFramesCache();
  const first = await loadSimFrames();
  const second = await loadSimFrames();
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.frames, second.frames, "bingkai harus dipakai ulang, bukan dihitung ulang");
});

test("bingkai memakai reconstruction, bukan truth", async () => {
  clearSimFramesCache();
  const { frames } = await loadSimFrames();
  // Medan kebenaran dasar punya puncak jauh lebih tajam daripada hasil interpolasi
  // IDW. Kalau suatu saat seseorang menukar `reconstruction` dengan `truth`, puncak
  // medan akan melonjak dan uji ini gagal.
  let peak = 0;
  for (const f of frames) for (const v of f.field.values) if (v > peak) peak = v;
  assert.ok(peak > 5, `puncak rekonstruksi terlalu rendah: ${peak}`);
  assert.ok(peak < 60, `puncak ${peak} mm/jam terlalu tinggi untuk hasil rekonstruksi`);
});

test("kejadian sungguhan benar benar melahirkan kandidat peringatan", async () => {
  clearSimFramesCache();
  const { frames, eventId } = await loadSimFrames();
  const series = buildRainSeries(frames, catchments, config);

  const timeline = [];
  for (let t = 0; t <= EVENT_DURATION_S; t += 60) {
    timeline.push({ t, states: catchmentStatesAt(series, t, config) });
  }
  const seeds = detectCandidates(timeline, config, eventId);

  // Ini uji yang menjaga babak 1:50 skenario demo. Dengan ambang operasional tanpa
  // penskalaan, kejadian ini tidak melewati satu pun ambang dan antrean tetap kosong.
  assert.ok(seeds.length > 0, "tidak ada kandidat: babak antrean peringatan pada demo akan kosong");
  assert.ok(
    seeds.some((s) => s.level === "waspada"),
    "demo perlu setidaknya satu waspada",
  );
  assert.ok(
    seeds.some((s) => s.level === "siaga"),
    "demo perlu setidaknya satu siaga",
  );
  // Kandidat harus muncul di tengah kejadian, bukan pada detik terakhir, supaya
  // ada waktu untuk memperagakan konfirmasi.
  assert.ok(
    seeds.every((s) => s.raisedAtSec < EVENT_DURATION_S),
    "kandidat tidak boleh baru muncul di akhir kejadian",
  );
});

test("jendela 3 jam dan 6 jam sama dengan 1 jam pada kejadian satu jam", async () => {
  clearSimFramesCache();
  const { frames } = await loadSimFrames();
  const series = buildRainSeries(frames, catchments, config);
  const states = catchmentStatesAt(series, EVENT_DURATION_S, config);

  // Bukan bug, melainkan akibat EVENT_DURATION_S = 3600. Uji ini ada supaya
  // kalau Radit memperpanjang durasi kejadian, uji ini gagal dan kita ingat
  // untuk meninjau ambang jendela 3 jam dan 6 jam.
  assert.equal(EVENT_DURATION_S, 3600);
  for (const s of states) {
    assert.ok(Math.abs(s.accum1h - s.accum3h) < 1e-9);
    assert.ok(Math.abs(s.accum1h - s.accum6h) < 1e-9);
  }
});
