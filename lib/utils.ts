/**
 * `cn` — penggabung nama kelas.
 *
 * Versi shadcn memakai `clsx` + `tailwind-merge`. Keduanya tidak dipasang di
 * sini: PRODUCT.md melarang dependensi baru tanpa kesepakatan tim, dan satu
 * satunya hal yang dibutuhkan komponen adalah menggabung string.
 *
 * BATASNYA HARUS DIKETAHUI. Fungsi ini TIDAK menyelesaikan kelas Tailwind yang
 * bertabrakan. `cn("p-4", "p-2")` menghasilkan "p-4 p-2", dan yang menang
 * ditentukan urutan di berkas CSS hasil build, bukan urutan argumen. Untuk
 * menimpa sebuah utilitas, hapus nilai bawaannya, jangan menumpuknya.
 *
 * Ini juga persis perilaku yang sudah dipakai `components/ui/primitives.tsx`,
 * yang menyambung `className` lewat template string tanpa penyelesaian
 * tabrakan. Jadi berkas ini menyeragamkan pola yang memang sudah ada, bukan
 * memperkenalkan pola kedua.
 */

export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];

  const walk = (value: ClassValue): void => {
    if (value === null || value === undefined || value === false || value === "") return;
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    for (const key of Object.keys(value)) {
      if (value[key]) out.push(key);
    }
  };

  for (const input of inputs) walk(input);
  return out.join(" ");
}
