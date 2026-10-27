import type { CatchmentState } from "@/lib/types";
import type { AlertLevel } from "@/lib/alerts/types";
import { Chip, type Tone } from "@/components/ui/primitives";

/**
 * Penanda status DAS dan tingkat keparahan peringatan.
 *
 * DIALEK KEDUA YANG DIHAPUS. Berkas ini dulu menggambar lencananya sendiri:
 * kotak bersudut 10px dengan tepi warna penuh dan tanpa isian, sementara
 * `Chip` di `primitives.tsx` menggambar pil dengan tepi 35 persen dan isian
 * tipis. Keduanya mengkodekan hal yang persis sama — normal, waspada, siaga —
 * dan operator melihat keduanya di layar yang sama: `Chip` di panel operasi,
 * lencana ini di antrean langsung dan dialog penegasan. Dua bentuk untuk satu
 * arti mengajari operator bahwa bentuknya berarti sesuatu, padahal tidak.
 *
 * Yang tersisa di sini hanyalah pemetaan tingkat ke nada, yang memang milik
 * berkas ini: `Chip` tahu apa itu `alert`, tapi tidak tahu bahwa "siaga" lebih
 * berat daripada "waspada".
 */

type Level = CatchmentState["status"] | AlertLevel;

const TONE: Record<Level, Tone> = {
  normal: "ok",
  waspada: "signal",
  siaga: "alert",
};

export function StatusBadge({ level }: { level: Level }) {
  return (
    <Chip tone={TONE[level]} dot>
      {level}
    </Chip>
  );
}

/**
 * Batang akumulasi terhadap ambang.
 * Tinggi 4 piksel, tanpa sudut membulat besar, tanpa gradien.
 */
export function ThresholdBar({
  value,
  threshold,
  level,
}: {
  value: number;
  threshold: number;
  level: Level;
}) {
  const ratio = threshold > 0 ? Math.min(value / threshold, 1) : 0;
  const fill =
    level === "siaga" ? "bg-alert" : level === "waspada" ? "bg-signal" : "bg-rain";
  return (
    <div className="h-1 w-full border border-border rounded-md overflow-hidden" role="presentation">
      <div className={`h-full ${fill}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
