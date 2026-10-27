"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatchmentState, Snapshot } from "@/lib/types";
import type { CatchmentDef } from "@/components/preview/catchments";
import { EVACUATION_POSTS, type EvacuationPost } from "@/lib/evacuation/data";
import { lookupRoute, ringCentroid, type DetailedEvacuationRoute } from "@/lib/evacuation/routes";
import { safetyTone } from "@/components/evacuation/safety";
import { SafetyAnnunciator, SafetyNotice } from "@/components/evacuation/SafetyAnnunciator";
import {
  Bar,
  Chip,
  ConsoleButton,
  EmptyState,
  Num,
  Panel,
  SectionLabel,
  type Tone,
} from "@/components/ui/primitives";
import Alert from "@/components/ui/alert";

/* ============================================================================
 * Panel rute evakuasi.
 *
 * Ini panel keputusan operator BPBD, bukan navigasi warga. Yang diputuskan:
 * KE POSKO MANA sebuah DAS terdampak diarahkan. Karena itu yang ditonjolkan
 * adalah daya tampung sisa dan keamanan lintasan terhadap medan hujan hasil
 * inversi — bukan petunjuk belok demi belok, yang tidak berguna bagi orang
 * yang sedang duduk di depan konsol.
 *
 * Keamanan rute dinilai dengan `sampleRainAt()` pada tiap titik lintasan,
 * artinya panel ini adalah satu-satunya tempat di konsol tempat lapisan
 * pengukuran benar-benar dipakai untuk sebuah keputusan operasional.
 * ==========================================================================*/

interface Props {
  snapshot: Snapshot | null;
  catchmentDefs: CatchmentDef[];
  catchments: CatchmentState[];
  selectedPostId: string | null;
  onSelectPost: (post: EvacuationPost | null) => void;
  onSelectRoute: (route: DetailedEvacuationRoute | null) => void;
  onOpenModal?: (route: DetailedEvacuationRoute, post: EvacuationPost) => void;
}

const CATCHMENT_TONE = {
  siaga: "alert",
  waspada: "signal",
  normal: "mute",
} as const;

export default function EvacuationPanel({
  snapshot,
  catchmentDefs,
  catchments,
  selectedPostId,
  onSelectPost,
  onSelectRoute,
  onOpenModal,
}: Props) {
  /* DAS terdampak. Awalnya DAS berstatus paling berat, karena itulah yang
     sedang ditanyakan operator saat panel ini dibuka. */
  const initialCatchmentId = useMemo(() => {
    const ranked = [...catchments].sort((a, b) => {
      const rank = { siaga: 0, waspada: 1, normal: 2 } as const;
      const d = rank[a.status] - rank[b.status];
      return d !== 0 ? d : b.accum1h - a.accum1h;
    });
    return ranked[0]?.id ?? catchmentDefs[0]?.id ?? null;
  }, [catchments, catchmentDefs]);

  const [pickedCatchmentId, setPickedCatchmentId] = useState<string | null>(null);
  const catchmentId = pickedCatchmentId ?? initialCatchmentId;

  const origin = useMemo(() => {
    const def = catchmentDefs.find((d) => d.id === catchmentId);
    if (!def) return null;
    const c = ringCentroid(def.ring);
    return c ? { ...c, id: def.id, name: def.name } : null;
  }, [catchmentDefs, catchmentId]);

  /* Hujan hanya diketahui kalau ada snapshot. Tanpa itu, `sampleRainAt` akan
     mengembalikan 0 untuk setiap titik dan setiap rute akan tampak "AMAN" —
     angka nol yang sebenarnya berarti "belum diukur". Perbedaan itu dijaga di
     sini supaya yang sampai ke layar adalah "—", bukan nol palsu. */
  const rainKnown = snapshot !== null;

  /* Pasangan DAS–posko yang tidak punya lintasan tersimpan. Dikumpulkan, bukan
     dibuang diam-diam: posko yang hilang dari daftar tanpa keterangan terbaca
     sebagai posko yang tidak ada, padahal ia ada dan justru datanya yang belum
     lengkap. */
  const gaps = useMemo(() => {
    if (!origin) return [];
    return EVACUATION_POSTS.map((post) => ({
      post,
      gap: lookupRoute(origin.id, origin.name, origin, post, null).gap,
    })).filter((g) => g.gap !== null);
  }, [origin]);

  const routes = useMemo(() => {
    if (!origin) return [];
    const all = EVACUATION_POSTS.map(
      (post) => lookupRoute(origin.id, origin.name, origin, post, snapshot).route,
    ).filter((r): r is DetailedEvacuationRoute => r !== null);
    return all.sort((a, b) => {
      const headroomA = headroomOf(a.targetPostId);
      const headroomB = headroomOf(b.targetPostId);
      /* Posko penuh tidak pernah direkomendasikan, seberapa pun dekatnya. */
      if (headroomA <= 0 !== (headroomB <= 0)) return headroomA <= 0 ? 1 : -1;
      if (rainKnown) {
        const rank = { AMAN: 0, WASPADA: 1, BAHAYA: 2 } as const;
        const d = rank[a.safetyStatus] - rank[b.safetyStatus];
        if (d !== 0) return d;
      }
      return a.distanceKm - b.distanceKm;
    });
  }, [origin, snapshot, rainKnown]);

  const shown =
    routes.find((r) => r.targetPostId === selectedPostId) ?? routes[0] ?? null;
  const shownPost = shown ? postOf(shown.targetPostId) : null;

  const noSafeRoute =
    rainKnown && routes.length > 0 && routes.every((r) => r.safetyStatus !== "AMAN");
  const allPostsFull =
    EVACUATION_POSTS.length > 0 && EVACUATION_POSTS.every((p) => p.capacity - p.occupied <= 0);

  /* Rute yang sedang ditampilkan panel selalu ikut tergambar di peta.
     Sebelumnya peta baru menggambar sesuatu setelah operator mengklik sebuah
     posko, jadi panel merekomendasikan satu lintasan sementara peta di
     sebelahnya masih kosong — dua jawaban berbeda untuk pertanyaan yang sama.
     Ini juga membuat lintasan ikut dinilai ulang saat sel hujan bergerak. */
  useEffect(() => {
    onSelectRoute(shown);
  }, [shown, onSelectRoute]);

  /* Cukup mengubah posko terpilih: efek di atas yang menyalurkan rutenya ke
     peta, jadi rute tidak pernah dihitung di dua tempat dengan cara berbeda. */
  const handlePick = (post: EvacuationPost) => onSelectPost(post);

  return (
    <Panel
      title="Rute Evakuasi"
      aside={
        <Chip tone="mute">
          {EVACUATION_POSTS.length} posko
        </Chip>
      }
      bodyClassName="flex flex-col"
    >
      {!origin || !shown || !shownPost ? (
        <EmptyState
          title="Wilayah terdampak belum ditentukan"
          hint="Rute dihitung dari poligon DAS. Muat definisi DAS untuk mulai menilai lintasan evakuasi."
        />
      ) : (
        <>
          {/* ---- DAS terdampak: asal rute ---- */}
          <div className="shrink-0 border-b border-hairline px-4 py-3">
            <SectionLabel>Wilayah terdampak</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {catchmentDefs.map((def) => {
                const state = catchments.find((c) => c.id === def.id);
                const active = def.id === catchmentId;
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => {
                      setPickedCatchmentId(def.id);
                      onSelectPost(null);
                      onSelectRoute(null);
                    }}
                    aria-pressed={active}
                    className={`metal-edge inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-3xs font-medium uppercase tracking-label transition-colors duration-150 ease-out ${
                      active
                        ? "border-transparent bg-text text-surface shadow-pill"
                        : "border-border bg-surface text-text-mute hover:border-border-strong hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    {def.name}
                    {state && state.status !== "normal" ? (
                      <span
                        aria-hidden
                        className={`h-1 w-1 rounded-full ${
                          state.status === "siaga" ? "bg-alert" : "bg-signal"
                        } ${active ? "opacity-90" : ""}`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
            {(() => {
              const state = catchments.find((c) => c.id === catchmentId);
              if (!state) return null;
              return (
                <p className="mt-2 text-2xs leading-4 text-text-dim">
                  Status{" "}
                  <span className={`font-medium ${toneText(CATCHMENT_TONE[state.status])}`}>
                    {state.status}
                  </span>
                  , akumulasi 1 jam{" "}
                  <Num value={state.accum1h} unit="mm" decimals={1} tone="mute" /> terhadap ambang{" "}
                  <Num value={state.thresholdMm} unit="mm" decimals={0} tone="mute" />.
                </p>
              );
            })()}
          </div>

          {/* ---- rekomendasi ---- */}
          <div>
            <div className="border-b border-hairline px-4 py-3">
              {/* Ketika tidak ada satu pun pilihan yang layak, panel harus
                  mengatakannya. Menampilkan lintasan berbahaya di bawah kata
                  "Rekomendasi" tanpa keterangan membuat sistem terbaca seolah
                  menyarankannya. */}
              <SectionLabel>
                {shown.targetPostId === selectedPostId ? "Posko dipilih" : "Rekomendasi"}
              </SectionLabel>

              <h3 className="mt-2 text-sm font-semibold leading-5 text-text">
                {shownPost.name}
              </h3>
              <p className="mt-0.5 text-2xs leading-4 text-text-dim">{shownPost.address}</p>

              {/* Status lintasan dibaca sebagai panel instrumen: seluruh tingkat
                  tercetak, yang berlaku menyala, ambang pemicunya ditulis. */}
              <SafetyAnnunciator
                status={shown.safetyStatus}
                rainMmH={rainKnown ? shown.maxRainRateMmH : null}
                known={rainKnown}
                className="mt-3"
              />

              {noSafeRoute ? (
                <SafetyNotice className="mt-3">
                  <span className="font-medium text-alert-text">Tidak ada lintasan aman</span> ke
                  posko mana pun saat ini. Yang ditampilkan adalah lintasan paling pendek, bukan
                  lintasan aman.
                </SafetyNotice>
              ) : null}
              {allPostsFull ? (
                <SafetyNotice className="mt-3">
                  <span className="font-medium text-alert-text">Seluruh posko penuh.</span>{" "}
                  Diperlukan posko tambahan sebelum pengarahan warga.
                </SafetyNotice>
              ) : null}
              {gaps.length > 0 ? (
                <Alert type="warning" dense label="Lintasan tidak tersedia" className="mt-3">
                  {gaps.map((g) => g.post.name).join(", ")} tidak punya lintasan tersimpan (
                  {gaps.map((g) => g.gap).join(", ")}). Posko itu tidak ikut dinilai. Bangun ulang
                  dengan <span className="font-mono">scripts/build-evacuation-routes.mjs</span>.
                </Alert>
              ) : null}

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-text/[0.045] px-3 py-2.5">
                <div className="flex flex-col gap-1">
                  <SectionLabel>Jarak</SectionLabel>
                  <Num value={shown.distanceKm} unit="km" decimals={2} />
                </div>
                <div className="flex flex-col gap-1">
                  <SectionLabel>Tempuh</SectionLabel>
                  <Num value={shown.durationMins} unit="menit" decimals={0} />
                </div>
                <div className="flex flex-col gap-1">
                  <SectionLabel>Hujan maks</SectionLabel>
                  <Num
                    value={rainKnown ? shown.maxRainRateMmH : null}
                    unit="mm/jam"
                    decimals={1}
                    tone="rain"
                  />
                </div>
              </div>

              {/* Jarak di atas adalah jarak DI ATAS JALAN. Penggal di kedua
                  ujung yang tidak ada jalannya harus disebut di sebelahnya,
                  bukan diam-diam ditambahkan ke angka jarak — kalau ditambahkan,
                  angka itu berhenti berarti "sejauh ini kendaraan berjalan". */}
              <p className="mt-2 text-3xs leading-4 text-text-dim">
                Jarak diukur di atas jaringan jalan OpenStreetMap. Di luar itu masih ada{" "}
                <span className="tnum text-text-mute">{shown.access.origin.meter}</span> m dari titik
                berat DAS ke jalan terdekat dan{" "}
                <span className="tnum text-text-mute">{shown.access.post.meter}</span> m dari jalan
                ke posko; keduanya digambar putus-putus di peta karena tidak ada jalan terpetakan di
                sana.
              </p>

              <CapacityRow post={shownPost} className="mt-3" />

              <ConsoleButton
                variant="solid"
                className="mt-3 w-full"
                onClick={() => onOpenModal?.(shown, shownPost)}
                title={`Tinjau lintasan evakuasi menuju ${shownPost.name}`}
              >
                Tinjau rute di peta
              </ConsoleButton>
            </div>

            {/* ---- posko lain ---- */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between">
                <SectionLabel>Posko lain</SectionLabel>
                <SectionLabel>Sisa daya tampung</SectionLabel>
              </div>

              <div className="mt-2 flex flex-col gap-1.5">
                {routes
                  .filter((r) => r.targetPostId !== shown.targetPostId)
                  .map((route) => {
                    const post = postOf(route.targetPostId);
                    if (!post) return null;
                    const headroom = post.capacity - post.occupied;
                    return (
                      <button
                        key={route.targetPostId}
                        type="button"
                        onClick={() => handlePick(post)}
                        className="metal-edge group flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left transition-colors duration-150 ease-out hover:border-border-strong hover:bg-surface-2"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-2xs font-medium text-text">
                            {post.name}
                          </span>
                          <span className="flex items-center gap-1.5 text-3xs text-text-dim">
                            <Num value={route.distanceKm} unit="km" decimals={2} tone="dim" />
                            {rainKnown ? (
                              <>
                                <span aria-hidden>·</span>
                                <span className={toneText(safetyTone(route.safetyStatus))}>
                                  {route.safetyStatus}
                                </span>
                              </>
                            ) : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <Num
                            value={headroom}
                            unit="jiwa"
                            decimals={0}
                            tone={headroom <= 0 ? "alert" : "default"}
                          />
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------------------
   Bagian daya tampung.

   Batangnya bertinta, bukan berwarna: daya tampung bukan besaran yang diukur
   radio dan bukan cuaca yang disimpulkan darinya, jadi ia tidak boleh memakai
   salah satu dari dua warna data. Warna hanya muncul ketika daya tampung
   menjadi sebuah status — yaitu ketika posko hampir atau sudah penuh.
--------------------------------------------------------------------------- */
function CapacityRow({ post, className = "" }: { post: EvacuationPost; className?: string }) {
  const known = post.capacity > 0;
  const ratio = known ? post.occupied / post.capacity : 0;
  const headroom = post.capacity - post.occupied;
  const tone = !known ? "mute" : ratio >= 1 ? "alert" : ratio >= 0.8 ? "signal" : "default";

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <SectionLabel>Daya tampung</SectionLabel>
        <span className="text-2xs">
          <Num value={known ? post.occupied : null} decimals={0} tone={tone} />
          <span className="mx-1 font-sans text-text-dim">/</span>
          <Num value={known ? post.capacity : null} unit="jiwa" decimals={0} tone="mute" />
        </span>
      </div>
      <Bar ratio={ratio} tone={tone === "mute" ? "default" : tone} className="mt-1.5" />
      <p className="mt-1.5 text-3xs text-text-dim">
        {!known ? (
          "Daya tampung posko belum tercatat"
        ) : headroom > 0 ? (
          <>
            Sisa <Num value={headroom} unit="jiwa" decimals={0} tone="dim" /> dari{" "}
            <Num value={post.capacity} unit="jiwa" decimals={0} tone="dim" />
          </>
        ) : (
          "Posko penuh — arahkan ke posko lain"
        )}
      </p>
    </div>
  );
}

function postOf(id: string): EvacuationPost | null {
  return EVACUATION_POSTS.find((p) => p.id === id) ?? null;
}

function headroomOf(id: string): number {
  const p = postOf(id);
  return p ? p.capacity - p.occupied : 0;
}

function toneText(tone: Tone): string {
  if (tone === "alert") return "text-alert-text";
  if (tone === "signal") return "text-signal-text";
  if (tone === "ok") return "text-ok-text";
  if (tone === "rain") return "text-rain-text";
  if (tone === "dim") return "text-text-dim";
  if (tone === "default") return "text-text";
  return "text-text-mute";
}
