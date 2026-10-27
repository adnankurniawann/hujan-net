/**
 * Judul bagian: label kecil huruf kapital dengan jarak huruf renggang,
 * sesuai anjuran Panduan bagian 6. Hitungan opsional di kanan memakai monospace.
 */
export function SectionLabel({ children, count }: { children: string; count?: number }) {
  return (
    <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
      <h2 className="text-[10px] uppercase tracking-[0.16em] text-text-mute">{children}</h2>
      {count !== undefined && (
        <span className="font-mono text-[10px] text-text-mute">{count}</span>
      )}
    </div>
  );
}

/** Garis pemisah tipis satu piksel, bukan bayangan. */
export function Divider() {
  return <div className="h-px bg-border" />;
}

/**
 * Keadaan kosong dan keadaan memuat.
 * Panduan bagian 6: dibuat serius, jangan diisi lelucon. Karena itu isinya
 * menjelaskan apa yang sedang terjadi dan apa yang akan mengubahnya.
 */
export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-6">
      <p className="text-xs text-text">{title}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-text-mute">{detail}</p>
    </div>
  );
}
