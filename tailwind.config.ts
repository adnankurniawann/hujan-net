import type { Config } from "tailwindcss";

/**
 * Skala ditaruh DI LUAR `extend` supaya menggantikan skala bawaan Tailwind,
 * bukan menumpuknya. Efeknya: hanya nilai yang memang ada di bahasa visual ini
 * yang punya kelas, sehingga `p-[13px]` atau `rounded-[7px]` tidak punya jalan
 * masuk dan konsistensi ditegakkan oleh konfigurasi, bukan oleh kedisiplinan.
 *
 * Jejak tata letak (jarak 4px, angka monospace, satuan selalu ditulis) tetap
 * seperti sebelumnya.
 *
 * Revisi terang: radius dikembalikan ke ukuran perkakas (maksimum 14px untuk
 * kartu) dan bayangan ditulis ulang dengan tinta biru gelap, bukan hitam pekat
 * — bayangan hitam di atas kertas terang terbaca sebagai kotoran. Setiap
 * bayangan punya offset dan sebaran, jadi elemennya benar-benar terangkat.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    spacing: {
      0: "0px",
      px: "1px",
      0.5: "2px",
      1: "4px",
      1.5: "6px",
      2: "8px",
      2.5: "10px",
      3: "12px",
      3.5: "14px",
      4: "16px",
      5: "20px",
      6: "24px",
      7: "28px",
      8: "32px",
      9: "36px",
      10: "40px",
      11: "44px",
      12: "48px",
      14: "56px",
      16: "64px",
      18: "72px",
      20: "80px",
      24: "96px",
      32: "128px",
    },
    borderRadius: {
      none: "0px",
      sm: "4px",
      DEFAULT: "8px",
      md: "10px",
      lg: "12px",
      xl: "14px",
      full: "9999px",
    },
    boxShadow: {
      none: "none",
      /* Bayangan hanya untuk elemen yang benar-benar melayang: kartu, pil,
         dialog. Warnanya tinta biru gelap dengan alfa rendah — sewarna dengan
         teksnya, jadi bayangan terbaca sebagai bayangan dan bukan noda abu. */
      card: "0 1px 2px -1px rgba(15,32,51,0.10), 0 8px 20px -14px rgba(15,32,51,0.28)",
      pill: "0 1px 2px -1px rgba(15,32,51,0.08)",
      float: "0 4px 8px -4px rgba(15,32,51,0.18), 0 24px 48px -24px rgba(15,32,51,0.40)",
      shell: "0 2px 6px -3px rgba(15,32,51,0.12), 0 32px 64px -32px rgba(15,32,51,0.34)",
      "ring-rain": "0 0 0 1px rgba(31,111,208,0.34), 0 8px 20px -14px rgba(31,111,208,0.42)",
    },
    extend: {
      /* Setiap nilai antara 0 dan 100 boleh dipakai sebagai pengubah alfa
         (`bg-rain/12`). Tanpa ini hanya kelipatan 5 bawaan Tailwind yang
         menghasilkan CSS, dan sisanya hilang tanpa peringatan. */
      opacity: Object.fromEntries(
        Array.from({ length: 101 }, (_, i) => [String(i), String(i / 100)]),
      ),
      colors: {
        /* Warna latar dan garis dipakai apa adanya. */
        bg: "var(--bg)",
        "bg-deep": "var(--bg-deep)",
        shell: "var(--shell)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        hairline: "var(--hairline)",
        /* Tinta ditulis sebagai kanal RGB, bukan `var(--text)` biasa, karena
           ia dipakai dengan pengubah alfa (`bg-text/12` untuk lintasan waktu,
           `bg-text/35` untuk latar dialog). Pada bentuk `var()` polos pengubah
           itu menghasilkan CSS tidak sah dan hilang tanpa peringatan. */
        text: "rgb(var(--text-rgb) / <alpha-value>)",
        "text-mute": "var(--text-mute)",
        "text-dim": "var(--text-dim)",

        /* Warna aksen ditulis sebagai kanal RGB terpisah supaya `<alpha-value>`
           bisa disisipkan. Ditulis sebagai `var(--rain)` biasa, pengubah alfa
           seperti `bg-rain/12` akan menghasilkan CSS yang tidak sah. */
        rain: "rgb(var(--rain-rgb) / <alpha-value>)",
        "rain-text": "rgb(var(--rain-text-rgb) / <alpha-value>)",
        signal: "rgb(var(--signal-rgb) / <alpha-value>)",
        "signal-text": "rgb(var(--signal-text-rgb) / <alpha-value>)",
        alert: "rgb(var(--alert-rgb) / <alpha-value>)",
        "alert-text": "rgb(var(--alert-text-rgb) / <alpha-value>)",
        ok: "rgb(var(--ok-rgb) / <alpha-value>)",
        "ok-text": "rgb(var(--ok-text-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        "3xs": ["10px", { lineHeight: "14px" }],
        "2xs": ["11px", { lineHeight: "16px" }],
      },
      letterSpacing: {
        label: "0.12em",
        caps: "0.16em",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      /* Satu nilai buram saja, dipakai kelas `.glass`. Kaca setebal jendela,
         bukan kabut — dan kalau ada dua nilai buram, keduanya akan dipakai. */
      backdropBlur: {
        glass: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
