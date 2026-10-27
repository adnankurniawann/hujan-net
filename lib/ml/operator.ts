// Operator rekonstruksi yang DIPELAJARI, sebagai pengganti interpolasi IDW.
//
// KENAPA BERKAS INI ADA
//
// Anggaran galat pada PENJELASAN.md bagian 6 menunjukkan hal yang sangat spesifik:
// galat inversi per tautan hanya 0,73 mm/jam, sedangkan galat peta akhir 3,41.
// Artinya 98 persen galat lahir di satu langkah saja, yaitu penyebaran nilai
// rata rata lintasan menjadi bidang, `lib/inverse/field.ts`.
//
// Sebabnya bukan pengukuran yang buruk. Sebabnya informasi. Satu tautan memberi
// SATU angka, yaitu rata rata hujan sepanjang lintasannya, dan rata rata garis
// tidak memuat keterangan di mana sepanjang garis itu hujannya paling deras.
// IDW menempelkan nilai rata rata itu rata ke seluruh lintasan, sehingga puncak
// hujan tergerus dan tepinya terangkat.
//
// IDW tidak mungkin memperbaiki itu, karena IDW hanya mengetahui jarak. Yang
// bisa memperbaikinya adalah operator yang PERNAH MELIHAT banyak medan hujan
// dan mempelajari polanya: kalau tautan A dan C tinggi sedangkan B rendah,
// puncaknya biasanya di sebelah sini, bukan tersebar merata.
//
// Itulah yang dipelajari di sini.
//
// KENAPA REGRESI RIDGE, BUKAN JARINGAN SARAF
//
// 1. Solusinya bentuk tertutup. Tidak ada laju belajar, tidak ada iterasi yang
//    bisa gagal menjelang tenggat.
// 2. Bentuk operatornya SAMA PERSIS dengan IDW, yaitu satu matriks bobot
//    berukuran nCells x nLinks. Jadi perbandingannya apel dengan apel: yang
//    berubah hanya dari mana bobotnya berasal, dirancang tangan atau dipelajari.
// 3. Deterministik penuh, sejalan dengan aturan "tidak ada Math.random di lib/".
// 4. Namanya jelas di literatur: ini penaksir linear ridge, setara Tikhonov
//    yang matriks regularisasinya dipelajari dari data.
//
// RUMUSNYA
//
//   W = X Rᵀ (R Rᵀ + lambda I)⁻¹
//
// dengan R matriks nLinks x N berisi taksiran hujan per tautan, X matriks
// nCells x N berisi medan kebenaran dasar, dan N jumlah contoh latih.
//
// TIDAK ADA SUKU INTERSEP, dan itu disengaja. Tanpa intersep, seluruh tautan
// bernilai nol menghasilkan medan nol. Sifat itu wajib: sistem tidak boleh
// mengarang hujan ketika seluruh jaringan melaporkan kering.

import type { GridField } from "../types";
import { toField, type GridSpec } from "../sim/grid.ts";

/** Operator rekonstruksi linear, bobotnya baris demi baris: `weights[c * nLinks + l]`. */
export interface LinearOperator {
  grid: GridSpec;
  linkIds: string[];
  nCells: number;
  nLinks: number;
  /** Tetapan regularisasi yang dipakai saat melatih. */
  lambda: number;
  /** Jumlah contoh latih. */
  trainSamples: number;
  weights: Float64Array;
}

/** Satu contoh latih: taksiran hujan per tautan, dan medan kebenaran dasarnya. */
export interface TrainingSample {
  /** Taksiran hujan rata rata lintasan per tautan, mm/jam. Panjang nLinks. */
  linkRain: number[];
  /** Medan kebenaran dasar, mm/jam. Panjang nCells. */
  truth: number[];
}

/**
 * Faktorisasi Cholesky untuk matriks simetris definit positif, di tempat.
 *
 * `m` berukuran n x n, baris demi baris. Setelah selesai, segitiga bawahnya
 * berisi faktor L dengan m = L Lᵀ. Segitiga atasnya tidak dipakai lagi.
 *
 * @returns true kalau berhasil, false kalau matriksnya tidak definit positif
 */
function cholesky(m: Float64Array, n: number): boolean {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i * n + j];
      for (let k = 0; k < j; k++) sum -= m[i * n + k] * m[j * n + k];

      if (i === j) {
        if (sum <= 0) return false;
        m[i * n + i] = Math.sqrt(sum);
      } else {
        m[i * n + j] = sum / m[j * n + j];
      }
    }
  }
  return true;
}

/**
 * Selesaikan L Lᵀ y = b di tempat, dengan `l` hasil {@link cholesky}.
 * Isi `b` diganti oleh y.
 */
function choleskySolve(l: Float64Array, n: number, b: Float64Array): void {
  // Substitusi maju: L z = b
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= l[i * n + k] * b[k];
    b[i] = sum / l[i * n + i];
  }
  // Substitusi mundur: Lᵀ y = z
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let k = i + 1; k < n; k++) sum -= l[k * n + i] * b[k];
    b[i] = sum / l[i * n + i];
  }
}

export interface FitOptions {
  /** Tetapan regularisasi ridge. Makin besar, operatornya makin halus. */
  lambda?: number;
}

/**
 * Latih operator rekonstruksi dari contoh berlabel.
 *
 * Matriks Gram dan matriks silang dibagi jumlah contoh, sehingga `lambda`
 * punya arti yang sama tak peduli berapa banyak contoh yang dipakai.
 *
 * @param samples contoh latih, seluruhnya harus berpanjang sama
 * @param grid geometri grid keluaran
 * @param linkIds id tautan, urutannya harus sama dengan `linkRain`
 * @throws kalau contohnya kosong atau panjangnya tidak konsisten
 */
export function fitLinearOperator(
  samples: readonly TrainingSample[],
  grid: GridSpec,
  linkIds: readonly string[],
  options: FitOptions = {},
): LinearOperator {
  const lambda = options.lambda ?? 1e-3;
  if (samples.length === 0) throw new Error("tidak ada contoh latih");

  const nLinks = linkIds.length;
  const nCells = samples[0].truth.length;
  const n = samples.length;

  for (const s of samples) {
    if (s.linkRain.length !== nLinks) {
      throw new Error(
        `panjang linkRain ${s.linkRain.length} tidak sama dengan nLinks ${nLinks}`,
      );
    }
    if (s.truth.length !== nCells) {
      throw new Error(
        `panjang truth ${s.truth.length} tidak sama dengan nCells ${nCells}`,
      );
    }
  }

  // G = R Rᵀ / n, berukuran nLinks x nLinks. Simetris.
  const g = new Float64Array(nLinks * nLinks);
  for (const s of samples) {
    const r = s.linkRain;
    for (let a = 0; a < nLinks; a++) {
      const ra = r[a];
      if (ra === 0) continue;
      for (let b = a; b < nLinks; b++) {
        g[a * nLinks + b] += ra * r[b];
      }
    }
  }
  for (let a = 0; a < nLinks; a++) {
    for (let b = a; b < nLinks; b++) {
      const v = g[a * nLinks + b] / n;
      g[a * nLinks + b] = v;
      g[b * nLinks + a] = v;
    }
    g[a * nLinks + a] += lambda;
  }

  // C = X Rᵀ / n, berukuran nCells x nLinks.
  const c = new Float64Array(nCells * nLinks);
  for (const s of samples) {
    const r = s.linkRain;
    const x = s.truth;
    for (let l = 0; l < nLinks; l++) {
      const rl = r[l];
      if (rl === 0) continue;
      for (let cell = 0; cell < nCells; cell++) {
        c[cell * nLinks + l] += x[cell] * rl;
      }
    }
  }
  for (let i = 0; i < c.length; i++) c[i] /= n;

  if (!cholesky(g, nLinks)) {
    throw new Error(
      "matriks Gram tidak definit positif, naikkan lambda atau tambah contoh latih",
    );
  }

  // W = C G⁻¹. Karena G simetris, tiap baris W diperoleh dari G y = Cᵀ_baris.
  const weights = new Float64Array(nCells * nLinks);
  const row = new Float64Array(nLinks);
  for (let cell = 0; cell < nCells; cell++) {
    for (let l = 0; l < nLinks; l++) row[l] = c[cell * nLinks + l];
    choleskySolve(g, nLinks, row);
    for (let l = 0; l < nLinks; l++) weights[cell * nLinks + l] = row[l];
  }

  return {
    grid,
    linkIds: [...linkIds],
    nCells,
    nLinks,
    lambda,
    trainSamples: n,
    weights,
  };
}

/**
 * Rekonstruksi medan hujan memakai operator terlatih.
 *
 * Keluarannya dijepit di nol. Intensitas hujan negatif tidak punya arti fisis,
 * dan penaksir linear sesekali bisa menghasilkannya di tepi medan.
 *
 * @param op operator hasil {@link fitLinearOperator}
 * @param linkRain taksiran hujan per tautan, mm/jam, urutannya sama dengan `op.linkIds`
 */
export function applyLinearOperator(
  op: LinearOperator,
  linkRain: readonly number[],
): GridField {
  const values = new Array<number>(op.nCells);
  for (let cell = 0; cell < op.nCells; cell++) {
    let acc = 0;
    const base = cell * op.nLinks;
    for (let l = 0; l < op.nLinks; l++) {
      acc += op.weights[base + l] * (linkRain[l] ?? 0);
    }
    values[cell] = acc > 0 ? acc : 0;
  }
  return toField(op.grid, values);
}

/**
 * Bentuk `LinearOperator` yang aman disimpan sebagai JSON. `Float64Array`
 * bukan tipe JSON, jadi bobotnya diratakan menjadi `number[]` biasa.
 */
export interface SerializedOperator {
  grid: GridSpec;
  linkIds: string[];
  nCells: number;
  nLinks: number;
  lambda: number;
  trainSamples: number;
  /** Panjang nCells * nLinks, dibulatkan 6 desimal supaya berkasnya tidak membengkak. */
  weights: number[];
}

/** Siapkan operator untuk `JSON.stringify`. */
export function serializeOperator(op: LinearOperator): SerializedOperator {
  const weights = new Array<number>(op.weights.length);
  for (let i = 0; i < op.weights.length; i++) {
    weights[i] = Math.round(op.weights[i] * 1e6) / 1e6;
  }
  return {
    grid: op.grid,
    linkIds: op.linkIds,
    nCells: op.nCells,
    nLinks: op.nLinks,
    lambda: op.lambda,
    trainSamples: op.trainSamples,
    weights,
  };
}

/** Urai balik hasil {@link serializeOperator}, dengan pemeriksaan bentuk. */
export function deserializeOperator(raw: unknown): LinearOperator {
  const s = raw as Partial<SerializedOperator>;
  if (
    !s ||
    typeof s.nCells !== "number" ||
    typeof s.nLinks !== "number" ||
    !Array.isArray(s.linkIds) ||
    !Array.isArray(s.weights) ||
    !s.grid
  ) {
    throw new Error("[ml] berkas operator tidak berbentuk SerializedOperator yang sah");
  }
  if (s.weights.length !== s.nCells * s.nLinks) {
    throw new Error(
      `[ml] panjang weights ${s.weights.length} tidak sama dengan nCells*nLinks ${s.nCells * s.nLinks}`,
    );
  }
  if (s.linkIds.length !== s.nLinks) {
    throw new Error(`[ml] panjang linkIds ${s.linkIds.length} tidak sama dengan nLinks ${s.nLinks}`);
  }
  return {
    grid: s.grid,
    linkIds: s.linkIds,
    nCells: s.nCells,
    nLinks: s.nLinks,
    lambda: s.lambda ?? 0,
    trainSamples: s.trainSamples ?? 0,
    weights: Float64Array.from(s.weights),
  };
}
