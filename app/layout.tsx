import type { Metadata } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";

/* Huruf konsol.
 *
 * Riwayatnya dua langkah, dan langkah keduanya adalah koreksi:
 *
 *   Inter + JetBrains Mono — pasangan bawaan hampir setiap antarmuka yang
 *   dihasilkan mesin. Tidak mengatakan apa pun tentang produk ini.
 *
 *   IBM Plex Sans + Mono — benar secara teknis (Sans dan Mono-nya sepasang
 *   sejak awal), tetapi tidak punya sikap. Ditolak.
 *
 * Archivo + Martian Mono dipilih dari rujukan yang diberikan: grotesque
 * hitam-putih ala studio, bobot tebal yang berkarakter editorial.
 *
 * KENAPA ARCHIVO DAN BUKAN GROTESQUE YANG LEBIH BERGAYA. Rujukannya portofolio
 * rumah produksi film: tipe raksasa, teks sedikit. Konsol ini kebalikannya —
 * 10px dan 11px membawa hampir seluruh antarmuka, dengan kolom angka rapat.
 * Archivo satu-satunya kandidat yang digambar justru untuk ukuran kecil
 * SEKALIGUS punya bobot tebal yang bisa membawa judul. Grotesque yang lebih
 * berkarakter menutup bukaannya di 10px, dan di 10px-lah konsol ini hidup.
 *
 * Bobot 700 sengaja ikut dimuat: sikap editorial itu tinggal di judul dan
 * angka besar, bukan di badan teks.
 *
 * Nama peubahnya berbasis PERAN, bukan merek — `--font-sans` dan `--font-mono`.
 * Peubah bernama menurut mereknya sudah terbukti berbohong dua kali di berkas
 * ini; sekarang penggantian huruf berikutnya cukup mengubah dua baris di sini.
 */
const sans = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = Martian_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HujanNet Dashboard",
  description:
    "Rekonstruksi peta curah hujan dari redaman tautan gelombang mikro antar menara telekomunikasi.",
};

/* Kontrak arah desain.
 *
 * Ditulis lewat `dangerouslySetInnerHTML` supaya benar-benar menjadi komentar
 * HTML pada keluaran produksi. Komentar JSX (`{/* ... *\/}`) dibuang oleh
 * kompilator dan tidak pernah sampai ke halaman, jadi kontrak yang ditulis
 * begitu tidak bisa diaudit siapa pun setelah build.
 */
const DIRECTION_CONTRACT = `
impeccable:direction hujannet-kaca-basah

THESIS: Curah hujan dibaca lewat kaca basah. Konsol ini menolak susunan bawaan
kategorinya — panel gelap dengan aksen neon dan satu pengukur raksasa di tengah
— dan menjadikan permukaan pengukurannya sendiri (peta dan medan hujan) satu-
satunya benda yang berwarna, dengan perkakasnya sebagai kaca pucat di atasnya.

OWN-WORLD: Cahaya siang mendung. Kertas biru-kelabu dingin, kartu putih buram,
garis tinta setipis rambut. Kaca hanya di atas peta dan kanvas medan, tidak
pernah di atas warna rata. Dua aksen data saja: --rain biru untuk besaran cuaca
yang disimpulkan, --signal ambar untuk besaran yang diukur radio. Keadaan aktif
memakai tinta, bukan warna.

STORY: Operator melihat sel hujan bergerak, menekan satu tautan, membaca pita
redaman di bawah garis dasar, lalu membandingkan medan sebenarnya dengan hasil
rekonstruksi dan melihat galatnya terukur, bukan diklaim.

FIRST VIEWPORT: Peta operasi penuh, keping kaca statistik di kiri atas, legenda
hujan di kiri bawah, panel detail tautan dan status DAS di rel kanan 380px,
penggeser waktu di bawah. Keputusan utama — konfirmasi kandidat peringatan —
naik ke puncak rel begitu ada yang menunggu.

FORM: Konsol operator satu layar 1440px, dipilih dari tempat pemakaian: ruang
BPBD siang hari dan aula juri ber-lampu menyala, dua-duanya melunturkan tema
gelap. Arah dipatok oleh pengguna (terang, tanpa ungu, kaca yang dikerjakan
sungguhan), jadi tidak ada undian arah.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, and DESIGN.md
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body
        className={`${sans.variable} ${mono.variable} antialiased font-sans bg-bg text-text`}
      >
        <div hidden dangerouslySetInnerHTML={{ __html: `<!--${DIRECTION_CONTRACT}-->` }} />
        {children}
      </body>
    </html>
  );
}
