// Keacakan yang dapat diulang.
//
// Simulator harus murni: satu kejadian yang sama harus menghasilkan deret angka
// yang sama persis setiap kali dijalankan, kalau tidak demo bisa berubah di
// depan juri dan RMSE yang kita sebutkan tidak bisa dipertanggungjawabkan.
// Karena itu tidak ada Math.random di mana pun di lib/.

/** Hash string menjadi bilangan bulat 32 bit tak bertanda. Varian FNV-1a. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pembangkit bilangan acak seragam pada [0, 1), algoritme mulberry32. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Satu tarikan derau Gauss, rata rata nol, simpangan baku satu.
 * Transformasi Box-Muller. Benihnya menentukan hasil sepenuhnya.
 */
export function gaussian(seed: number): number {
  const rnd = mulberry32(seed);
  const u1 = Math.max(rnd(), Number.MIN_VALUE);
  const u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Benih gabungan dari satu nama dan satu bilangan, misalnya id tautan dan waktu. */
export function seedOf(name: string, n: number): number {
  return (hashString(name) ^ Math.imul(n | 0, 0x9e3779b1)) >>> 0;
}
