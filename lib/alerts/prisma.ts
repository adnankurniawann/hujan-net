/**
 * Klien Prisma tunggal.
 *
 * Next.js memuat ulang modul saat pengembangan setiap kali berkas berubah. Tanpa
 * penyimpanan di `globalThis`, tiap muat ulang membuat `PrismaClient` baru dan
 * SQLite kehabisan sambungan setelah beberapa penyuntingan.
 *
 * HANYA UNTUK SISI SERVER.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { hujannetPrisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.hujannetPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.hujannetPrisma = prisma;
}
