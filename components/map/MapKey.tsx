import { SectionLabel } from "@/components/ui/primitives";

/* Keterangan simbol peta operasi. Warna dan gaya garis meniru yang dilukis
   RainMap: tautan kering bertinta tipis, tautan basah --signal menebal
   mengikuti redaman, batas DAS putus-putus. */

function Swatch({ children }: { children: React.ReactNode }) {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden className="shrink-0">
      {children}
    </svg>
  );
}

export default function MapKey({ totalLinks }: { totalLinks: number }) {
  return (
    <div className="glass w-[300px] px-4 py-3">
      <SectionLabel>Keterangan</SectionLabel>
      <ul className="mt-2 flex flex-col gap-1.5 text-3xs text-text-mute">
        <li className="flex items-center gap-2.5">
          <Swatch>
            <line x1="1" y1="5" x2="27" y2="5" stroke="rgb(var(--text-rgb) / 0.35)" strokeWidth="1" />
            <circle cx="2" cy="5" r="2" fill="var(--text)" />
            <circle cx="26" cy="5" r="2" fill="var(--text)" />
          </Swatch>
          Tautan kering, titik = menara
        </li>
        <li className="flex items-center gap-2.5">
          <Swatch>
            <line x1="1" y1="5" x2="27" y2="5" stroke="var(--signal)" strokeWidth="3.5" strokeLinecap="round" />
          </Swatch>
          Tautan basah, makin tebal makin besar redaman
        </li>
        <li className="flex items-center gap-2.5">
          <Swatch>
            <line x1="1" y1="5" x2="27" y2="5" stroke="rgb(var(--text-rgb) / 0.45)" strokeWidth="1" strokeDasharray="5 4" />
          </Swatch>
          Batas DAS, berwarna saat waspada atau siaga
        </li>
      </ul>
      <p className="mt-2.5 border-t border-hairline pt-2 text-3xs leading-4 text-text-dim">
        Badai dan {totalLinks} tautan di sini simulasi. Warna biru adalah hujan yang kami
        taksir dari redaman tautan.
      </p>
    </div>
  );
}
