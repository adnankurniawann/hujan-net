// Langkah 5 dari model invers: dari satu angka per tautan menjadi peta.
//
// Inilah bagian yang membuat persoalan ini ill-posed. Setiap tautan hanya
// memberi satu bilangan, yaitu rata rata hujan sepanjang lintasannya. Tak
// berhingga banyak medan hujan bisa menghasilkan kumpulan bilangan yang sama.
// Yang kita tambahkan adalah pengetahuan awal: hujan bersifat menerus secara
// ruang, sehingga nilai rata rata lintasan disebar ke titik titik sepanjang
// lintasan lalu diinterpolasi dengan pembobotan jarak balik.
//
// Bobot interpolasi hanya bergantung pada geometri, dan geometri menara tidak
// berubah sepanjang kejadian. Karena itu bobotnya dihitung sekali menjadi
// operator jarang, lalu dipakai ulang untuk seluruh 241 langkah waktu. Ini yang
// membuat seluruh kejadian selesai di bawah dua detik.

import type { GridField, Link } from "../types";
import { distanceKm, pathSamplePoints } from "../sim/geo.ts";
import { cellCenters, type GridSpec, toField } from "../sim/grid.ts";

export interface IdwOptions {
  /** Jumlah titik sebaran sepanjang tiap lintasan. */
  pathSamples?: number;
  /** Pangkat pembobotan jarak balik. */
  power?: number;
  /** Jangkauan maksimum pengaruh satu titik, km. Di luar ini bobotnya nol. */
  cutoffKm?: number;
  /** Penghalus jarak, km. Mencegah bobot tak hingga tepat di atas lintasan. */
  smoothingKm?: number;
}

// Jangkauan 2 km hasil penyetelan pada topologi `data/links.json`. Jangkauan
// yang lebih panjang menyebarkan nilai rata rata satu lintasan ke wilayah yang
// jauh lebih luas daripada ciri hujan yang sebenarnya, sehingga medan menjadi
// rata: terlalu rendah di puncak dan terlalu tinggi di sekelilingnya. Pada
// kejadian contoh, menaikkan jangkauan dari 2 ke 4 km menaikkan RMSE rata rata
// dari 3,4 menjadi 6,4 mm/jam.
//
// Harganya adalah cakupan: pada jangkauan 2 km sekitar seperempat sel grid
// berada di luar jangkauan setiap lintasan dan mengikuti tautan terdekat dengan
// peluruhan jarak. Itu memang keadaan sebenarnya di tepi jaringan, dan lebih
// jujur daripada memoles peta sampai penuh.
const DEFAULTS: Required<IdwOptions> = {
  pathSamples: 20,
  power: 2,
  cutoffKm: 2,
  smoothingKm: 0.3,
};

/**
 * Operator interpolasi jarang: untuk setiap sel grid, daftar tautan yang
 * berpengaruh beserta bobotnya yang sudah dinormalkan.
 */
export interface IdwKernel {
  grid: GridSpec;
  linkIds: string[];
  /** Indeks tautan yang berpengaruh pada sel ke-i, sejajar dengan `weights`. */
  cellLinkIndices: Int32Array[];
  /** Bobot yang sudah dinormalkan sehingga jumlahnya satu per sel. */
  cellWeights: Float64Array[];
  /** 1 kalau sel punya lintasan di dalam jangkauan, 0 kalau hanya mengikuti tautan terdekat. */
  cellInRange: Uint8Array;
}

/**
 * Bangun operator interpolasi dari geometri tautan. Cukup sekali per topologi.
 */
export function buildIdwKernel(
  links: readonly Link[],
  grid: GridSpec,
  options: IdwOptions = {},
): IdwKernel {
  const opt = { ...DEFAULTS, ...options };
  const centers = cellCenters(grid);

  // Sebarkan nilai rata rata lintasan ke titik titik sepanjang lintasan.
  const points = links.map((link) =>
    pathSamplePoints(link.siteA, link.siteB, opt.pathSamples),
  );

  const smoothingSq = opt.smoothingKm * opt.smoothingKm;
  const cellLinkIndices: Int32Array[] = new Array(centers.length);
  const cellWeights: Float64Array[] = new Array(centers.length);
  const cellInRange = new Uint8Array(centers.length);

  const idxBuf: number[] = [];
  const wBuf: number[] = [];

  for (let c = 0; c < centers.length; c++) {
    idxBuf.length = 0;
    wBuf.length = 0;

    for (let l = 0; l < links.length; l++) {
      let weight = 0;
      for (const p of points[l]) {
        const d = distanceKm(centers[c], p);
        if (d > opt.cutoffKm) continue;
        const dSq = d * d + smoothingSq;
        weight += Math.pow(dSq, -opt.power / 2);
      }
      if (weight > 0) {
        idxBuf.push(l);
        wBuf.push(weight);
      }
    }

    cellInRange[c] = idxBuf.length > 0 ? 1 : 0;

    if (idxBuf.length > 0) {
      // Sel di dalam jangkauan: bobot dinormalkan sehingga jumlahnya satu.
      let sum = 0;
      for (const w of wBuf) sum += w;
      cellLinkIndices[c] = Int32Array.from(idxBuf);
      cellWeights[c] = Float64Array.from(wBuf.map((w) => w / sum));
      continue;
    }

    // Sel di luar jangkauan seluruh lintasan, biasanya sudut kotak batas. Di
    // sana tidak ada pengukuran sama sekali, jadi nilai tautan terdekat tidak
    // boleh dipakai utuh: itu sama dengan mengaku tahu hujan di tempat yang
    // tidak terpantau. Nilainya diteruskan dengan peluruhan 1/d^2 yang sama
    // seperti di dalam jangkauan, sehingga semakin jauh dari jaringan
    // taksirannya semakin mendekati nol.
    let nearest = -1;
    let nearestKm = Number.POSITIVE_INFINITY;
    for (let l = 0; l < links.length; l++) {
      for (const p of points[l]) {
        const d = distanceKm(centers[c], p);
        if (d < nearestKm) {
          nearestKm = d;
          nearest = l;
        }
      }
    }

    if (nearest < 0) {
      cellLinkIndices[c] = new Int32Array(0);
      cellWeights[c] = new Float64Array(0);
      continue;
    }

    const taper = Math.min(1, (opt.cutoffKm / nearestKm) ** opt.power);
    cellLinkIndices[c] = Int32Array.from([nearest]);
    cellWeights[c] = Float64Array.from([taper]);
  }

  return {
    grid,
    linkIds: links.map((l) => l.id),
    cellLinkIndices,
    cellWeights,
    cellInRange,
  };
}

/**
 * Rekonstruksi medan hujan dari intensitas rata rata lintasan tiap tautan.
 *
 * @param kernel operator dari {@link buildIdwKernel}
 * @param rainByLink intensitas rata rata lintasan, mm/jam, sejajar `kernel.linkIds`
 * @returns medan hujan hasil rekonstruksi, mm/jam
 */
export function reconstructField(
  kernel: IdwKernel,
  rainByLink: readonly number[],
): GridField {
  const cells = kernel.cellLinkIndices.length;
  const values = new Array<number>(cells).fill(0);

  for (let c = 0; c < cells; c++) {
    const idx = kernel.cellLinkIndices[c];
    const w = kernel.cellWeights[c];
    let acc = 0;
    for (let j = 0; j < idx.length; j++) {
      acc += w[j] * (rainByLink[idx[j]] ?? 0);
    }
    values[c] = acc;
  }

  return toField(kernel.grid, values);
}

/**
 * Pecahan sel grid yang punya lintasan di dalam jangkauan pembobotan.
 * Sel di luar jangkauan tetap terisi lewat tautan terdekat, tetapi tidak
 * dihitung tercakup, karena taksirannya jauh lebih lemah.
 */
export function kernelCoverage(kernel: IdwKernel): number {
  let covered = 0;
  for (const v of kernel.cellInRange) covered += v;
  return covered / kernel.cellInRange.length;
}
