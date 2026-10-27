# Daftar `llms.txt` — Tumpukan Teknologi HujanNet Dashboard

> Referensi cepat untuk AI coding assistant (Claude Code, Cursor, dll) saat mengerjakan sprint HujanNet.
> Status: ✅ resmi tersedia · ❌ belum ada versi resmi

---

## 1. Next.js ✅

**Kerangka utama proyek (App Router, TypeScript strict)**

| Jenis | URL |
|---|---|
| Index | `https://nextjs.org/docs/llms.txt` |
| Full (seluruh isi docs) | `https://nextjs.org/docs/llms-full.txt` |

---

## 2. Tailwind CSS ❌

**Styling**

Tidak ada `llms.txt` resmi. PR untuk fitur ini di repo `tailwindcss.com` **ditolak** oleh tim maintainer — alasannya, traffic dokumentasi mereka sudah turun ~40% sejak AI marak dan mereka tidak mau memperparah itu.

Alternatif tidak resmi (kualitas bisa berbeda, gunakan dengan hati-hati):

| Sumber | URL |
|---|---|
| Context7 (community) | `https://context7.com/websites/tailwindcss` |
| Gist AI-generated (per Apr 2025) | `https://gist.github.com/ConstantinHvber/0e521eafaa34e9a70f2254ae8c629ad0` |

---

## 3. MapLibre GL JS ❌

**Peta interaktif**

Tidak ditemukan `llms.txt` resmi maupun tidak resmi. Gunakan dokumentasi biasa sebagai gantinya:

| Sumber | URL |
|---|---|
| Docs resmi | `https://maplibre.org/maplibre-gl-js/docs/` |

---

## 4. Recharts ✅

**Grafik/chart**

| Jenis | URL |
|---|---|
| Index | `https://recharts.org/llms.txt` |

---

## 5. Zustand ✅

**State management klien**

| Jenis | URL |
|---|---|
| Source (repo GitHub) | `https://github.com/pmndrs/zustand/blob/main/docs/llms.txt` |
| Hosted (situs docs) | `https://zustand.docs.pmnd.rs/llms.txt` |

---

## 6. Prisma ✅

**ORM ke SQLite (log peringatan & kejadian)**

| Jenis | URL |
|---|---|
| Index | `https://www.prisma.io/docs/llms.txt` |
| Full (seluruh isi docs) | `https://www.prisma.io/docs/llms-full.txt` |
| Bonus | Prisma punya "Agent Skills" resmi untuk coding agent (mis. Claude Code) |

---

## Catatan

Untuk **Tailwind CSS** dan **MapLibre GL JS** yang belum punya `llms.txt` resmi, saat memberi context ke AI assistant lebih aman langsung sertakan:
- Cuplikan `tailwind.config.ts` / kelas utility yang dipakai di proyek
- Contoh kode inisialisasi map dari docs MapLibre (`https://maplibre.org/maplibre-gl-js/docs/`)

daripada mengandalkan file `llms.txt` yang tidak tersedia.