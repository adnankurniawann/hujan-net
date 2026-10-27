import test from "node:test";
import assert from "node:assert/strict";

import {
  freeSpacePathLoss,
  ituCoefficients,
  rainRateFromAttenuation,
  specificAttenuation,
} from "../lib/physics/itu838.ts";

const POLARIZATIONS = ["H", "V"] as const;

test("bolak balik: inversi mengembalikan intensitas hujan masukan", () => {
  const rains = [0.5, 1, 5, 12.5, 25, 60, 120];
  const freqs = [15, 17.3, 18, 20, 22.8, 23];
  const lengths = [2, 3.7, 5, 8];

  for (const pol of POLARIZATIONS) {
    for (const f of freqs) {
      const { k, alpha } = ituCoefficients(f, pol);
      for (const R of rains) {
        for (const L of lengths) {
          const attenDb = specificAttenuation(R, k, alpha) * L;
          const back = rainRateFromAttenuation(attenDb, L, k, alpha);
          assert.ok(
            Math.abs(back - R) < 0.01,
            `f=${f} GHz pol=${pol} L=${L} km R=${R} mm/jam menghasilkan ${back}`,
          );
        }
      }
    }
  }
});

test("pada 20 GHz, hujan 25 mm/jam memberi redaman spesifik 1 sampai 4 dB/km", () => {
  for (const pol of POLARIZATIONS) {
    const { k, alpha } = ituCoefficients(20, pol);
    const gamma = specificAttenuation(25, k, alpha);
    assert.ok(
      gamma > 1 && gamma < 4,
      `pol=${pol} menghasilkan ${gamma.toFixed(3)} dB/km, di luar rentang wajar`,
    );
  }
});

test("masukan degenerate tidak pernah menghasilkan NaN", () => {
  const { k, alpha } = ituCoefficients(18, "V");
  const degenerate = [
    rainRateFromAttenuation(5, 0, k, alpha),
    rainRateFromAttenuation(5, -3, k, alpha),
    rainRateFromAttenuation(-2, 5, k, alpha),
    rainRateFromAttenuation(0, 5, k, alpha),
    rainRateFromAttenuation(Number.NaN, 5, k, alpha),
    rainRateFromAttenuation(5, 5, 0, alpha),
    specificAttenuation(-1, k, alpha),
    specificAttenuation(Number.NaN, k, alpha),
    specificAttenuation(10, 0, alpha),
    freeSpacePathLoss(0, 18),
    freeSpacePathLoss(5, 0),
    freeSpacePathLoss(Number.NaN, 18),
  ];

  for (const [i, v] of degenerate.entries()) {
    assert.ok(Number.isFinite(v), `hasil ke-${i} bukan angka terhingga: ${v}`);
    assert.ok(v >= 0, `hasil ke-${i} negatif: ${v}`);
  }
});

test("interpolasi mendekati nilai tabel ITU pada frekuensi antara", () => {
  // 18 GHz ada di tabel. Interpolasi dari tetangganya, 15 dan 20 GHz, harus
  // mendarat dekat nilai resmi itu. Ini yang membuktikan pilihan interpolasi
  // logaritmik pada k dan linear pada alpha memang benar.
  const official = {
    H: { k: 0.07078, alpha: 1.0818 },
    V: { k: 0.07574, alpha: 1.0022 },
  };

  for (const pol of POLARIZATIONS) {
    const a = ituCoefficients(17.999, pol);
    const b = ituCoefficients(18.001, pol);
    const k = (a.k + b.k) / 2;
    const alpha = (a.alpha + b.alpha) / 2;
    assert.ok(
      Math.abs(k - official[pol].k) / official[pol].k < 0.02,
      `pol=${pol} k interpolasi ${k} menyimpang lebih dari 2 persen`,
    );
    assert.ok(
      Math.abs(alpha - official[pol].alpha) < 0.01,
      `pol=${pol} alpha interpolasi ${alpha} menyimpang lebih dari 0,01`,
    );
  }
});

test("koefisien menaik terhadap frekuensi dan dijepit di luar tabel", () => {
  const f15 = ituCoefficients(15, "H");
  const f20 = ituCoefficients(20, "H");
  assert.ok(f20.k > f15.k, "k harus naik seiring frekuensi");
  assert.ok(f20.alpha < f15.alpha, "alpha harus turun seiring frekuensi");

  // Tepi tabel adalah 7 dan 40 GHz. Batas bawah turun dari 10 ke 7 GHz pada
  // 11 Agustus 2026, karena OpenMRG memuat tautan mulai 7 GHz dan tabel lama
  // akan menjepitnya menjadi 10 GHz tanpa peringatan apa pun.
  assert.deepEqual(ituCoefficients(1, "H"), ituCoefficients(7, "H"));
  assert.deepEqual(ituCoefficients(200, "V"), ituCoefficients(40, "V"));
});

test("koefisien cocok dengan Rekomendasi ITU-R P.838-3 resmi", () => {
  // Disalin ulang dari r-rec-p.838-3-200503-i!!pdf-e.pdf pada 11 Agustus 2026.
  // Uji ini ada karena tabel sebelumnya memuat empat angka yang salah salin,
  // dan kesalahannya tidak pernah terlihat: model maju dan model invers
  // memanggil fungsi yang sama, jadi galatnya saling meniadakan. Baru terlihat
  // ketika dibandingkan dengan dokumen sumber.
  const resmi: [number, "H" | "V", number, number][] = [
    [7, "H", 0.001915, 1.481],
    [7, "V", 0.001425, 1.4745],
    [15, "H", 0.04481, 1.1233],
    [15, "V", 0.05008, 1.044],
    [18, "H", 0.07078, 1.0818],
    [18, "V", 0.07708, 1.0025], // dulu tertulis 0,07574 dan 1,0022
    [23, "H", 0.1286, 1.0214],
    [23, "V", 0.1284, 0.963],
    [25, "H", 0.1571, 0.9991], // dulu alphaH tertulis 1,0
    [35, "H", 0.3374, 0.9047], // dulu alphaH tertulis 0,904
    [38, "V", 0.3844, 0.8552],
    [40, "V", 0.4274, 0.8421],
  ];

  for (const [freq, pol, k, alpha] of resmi) {
    const got = ituCoefficients(freq, pol);
    assert.equal(got.k, k, `k pada ${freq} GHz ${pol}`);
    assert.equal(got.alpha, alpha, `alpha pada ${freq} GHz ${pol}`);
  }
});

test("redaman spesifik naik secara monoton terhadap intensitas hujan", () => {
  const { k, alpha } = ituCoefficients(23, "H");
  let prev = -1;
  for (let R = 0; R <= 150; R += 2.5) {
    const gamma = specificAttenuation(R, k, alpha);
    assert.ok(gamma > prev, `gamma tidak naik pada R=${R}`);
    prev = gamma;
  }
});

test("redaman ruang bebas cocok dengan hitungan tangan", () => {
  // 20 GHz pada 5 km: 92,45 + 26,02 + 13,98 = 132,45 dB
  assert.ok(Math.abs(freeSpacePathLoss(5, 20) - 132.45) < 0.01);
  // Jarak dua kali lipat menambah tepat 6,02 dB.
  assert.ok(
    Math.abs(freeSpacePathLoss(10, 20) - freeSpacePathLoss(5, 20) - 6.0206) <
      0.001,
  );
});
