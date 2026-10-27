"use client";

import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Link } from "@/lib/types";
import type { CatchmentDef } from "./preview/catchments";
/* Kejadian, status DAS, dan antrean peringatan seluruhnya dari server. Jalan
   mundurnya ada di kepala `components/sim/useSimulation.ts`: `components/preview/`
   sengaja tidak dihapus. */
import { useLinkTrace, useSimulation } from "./sim/useSimulation";
import { useCatchmentAlerts } from "./alerts/useCatchmentAlerts";
import { useDashboard, type StageView } from "./store";
import { captureRail, playRailFlip, playStageIn, type RailRects } from "./ui/motion";

/* `useLayoutEffect` memperingatkan saat render di server. Komponen ini memang
   komponen klien, tetapi Next tetap merendernya sekali di server. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Urutan tab, dipakai menentukan arah geseran saat panggung berganti. */
const STAGE_ORDER: StageView[] = ["peta", "perbandingan", "laporan"];
import { useKeyboardTransport, usePlayback } from "./usePlayback";
import RainLegend from "./map/RainLegend";
import ComparisonView from "./panels/ComparisonView";
import CatchmentPanel from "./panels/CatchmentPanel";
import LinkDetailPanel from "./panels/LinkDetailPanel";
const ReportView = dynamic(() => import("./report/ReportView"), { ssr: false });
import { computeMetrics } from "./report/metrics";
import TopBar from "./ui/TopBar";
import Timeline from "./ui/Timeline";
import { SectionLabel } from "./ui/primitives";
import Alert from "./ui/alert";

/* MapLibre menyentuh window saat modul dimuat, jadi peta tidak ikut render
   di server. Kerangka konsol tetap dirender lebih dulu. */
const RainMap = dynamic(() => import("./map/RainMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="text-2xs uppercase tracking-label text-text-dim">Memuat peta…</span>
    </div>
  ),
});

import EvacuationPanel from "./panels/EvacuationPanel";
import { EVACUATION_POSTS } from "@/lib/evacuation/data";
import type { DetailedEvacuationRoute } from "@/lib/evacuation/routes";

const EvacuationRouteModal = dynamic(() => import("./modals/EvacuationRouteModal"), {
  ssr: false,
});

interface Props {
  links: Link[];
  catchmentDefs: CatchmentDef[];
}

export default function Dashboard({ links, catchmentDefs }: Props) {
  const sim = useSimulation();
  const alerts = useCatchmentAlerts();
  usePlayback();
  useKeyboardTransport();

  const [showEvacuation, setShowEvacuation] = useState(false);
  const [selectedEvacPostId, setSelectedEvacPostId] = useState<string | null>(null);
  /* `DetailedEvacuationRoute`, bukan `EvacuationRoute`: peta perlu penggal
     aksesnya untuk menggambarnya putus-putus, dan tipe dasarnya tidak
     memuatnya. */
  const [activeEvacRoute, setActiveEvacRoute] = useState<DetailedEvacuationRoute | null>(null);
  /* HANYA id poskonya yang disimpan, bukan rutenya.
     Sebelumnya jendela tinjauan memegang salinan beku dari objek rute pada saat
     ia dibuka. Medan hujan di dalam jendela itu tetap bergerak mengikuti waktu,
     tetapi vonis AMAN / WASPADA / BAHAYA dan angka hujan maksimum di sebelahnya
     tidak pernah dihitung ulang — jendela menampilkan hujan hari ini dengan
     penilaian dari beberapa menit yang lalu. Pada konsol yang seluruh gunanya
     menilai lintasan terhadap hujan, itu bukan cacat tampilan.
     Sekarang rutenya diambil dari `activeEvacRoute`, yang dihitung ulang panel
     evakuasi setiap langkah waktu. */
  const [routeModalPostId, setRouteModalPostId] = useState<string | null>(null);

  const t = useDashboard((s) => s.t);
  const playing = useDashboard((s) => s.playing);
  const speed = useDashboard((s) => s.speed);
  const stage = useDashboard((s) => s.stage);
  const selectedLinkId = useDashboard((s) => s.selectedLinkId);
  const setStage = useDashboard((s) => s.setStage);
  const selectLink = useDashboard((s) => s.selectLink);
  const setT = useDashboard((s) => s.setT);
  const setSpeed = useDashboard((s) => s.setSpeed);
  const togglePlay = useDashboard((s) => s.togglePlay);
  const reset = useDashboard((s) => s.reset);
  const pause = useDashboard((s) => s.pause);

  const durationS = sim.meta?.durationS ?? 3600;
  const snapshot = useMemo(() => sim.snapshotAt(t), [sim, t]);
  const catchments = useMemo(() => alerts.statesAt(t), [alerts, t]);
  const candidates = useMemo(() => alerts.candidatesUpTo(t), [alerts, t]);
  const decisions = alerts.decisions;
  const decideAlert = alerts.decide;
  /* Penanda lintasan memakai SELURUH kandidat kejadian, bukan yang sudah muncul
     pada t: gunanya justru melompat maju ke saat peringatan akan lahir. */
  const markers = alerts.markers;

  /* Tren galat dihitung sekali dan hanya ketika laporan benar-benar dibuka:
     biayanya satu snapshot penuh per titik cuplik, dan pemuatan pertama tidak
     boleh menunggu itu. */
  const rmseSeries = useMemo(
    () => (stage === "laporan" ? sim.rmseSeries() : []),
    [sim, stage],
  );

  const metrics = useMemo(() => (snapshot ? computeMetrics(snapshot) : null), [snapshot]);
  const pendingAlerts = candidates.filter((c) => !decisions[c.id]).length;

  const selectedLink = useMemo(
    () => links.find((l) => l.id === selectedLinkId) ?? null,
    [links, selectedLinkId],
  );
  const selectedState = useMemo(
    () => snapshot?.links.find((s) => s.linkId === selectedLinkId) ?? null,
    [snapshot, selectedLinkId],
  );
  const trace = useLinkTrace(selectedLinkId);

  /* Rute yang sedang ditinjau, dinilai ulang bersama medan hujan.
     Dicocokkan dengan id posko yang dipilih saat jendela dibuka: kalau panel
     sampai berpindah ke posko lain, jendelanya tertutup daripada diam-diam
     berganti pokok bahasan di depan operator. Pemilihan posko ikut dikunci saat
     membuka, jadi dalam pemakaian normal hal itu tidak terjadi. */
  const routeUnderReview =
    routeModalPostId && activeEvacRoute?.targetPostId === routeModalPostId
      ? activeEvacRoute
      : null;
  const postUnderReview = routeModalPostId
    ? EVACUATION_POSTS.find((p) => p.id === routeModalPostId) ?? null
    : null;

  /* ---- pergantian panggung ----
     Isi panggung digeser pendek SEARAH perpindahan di dalam deret tab, jadi
     berpindah ke kanan mendorong isi dari kanan. Hubungan ruang itulah yang
     membuat tiga tab terbaca sebagai satu deret, bukan tiga halaman terpisah.
     Pemunculan pertama tidak dianimasikan: tidak ada yang berpindah di situ. */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const prevStage = useRef<StageView | null>(null);

  /* ---- panel kanan yang berpindah urutan ----
     Letak lama direkam setiap selesai render, jadi ketika urutannya berubah,
     peta letak yang tersimpan masih memuat letak SEBELUM perubahan. Panel
     dikembalikan ke sana lalu dilepaskan ke letak barunya.

     `useLayoutEffect` supaya pengembalian itu terjadi sebelum cat: dengan
     `useEffect`, panel sempat tergambar satu frame di letak barunya lebih dulu
     dan perpindahannya terlihat berkedip. */
  const railRef = useRef<HTMLElement | null>(null);
  const railRects = useRef<RailRects>(new Map());

  useIsoLayoutEffect(() => {
    playRailFlip(railRef.current, railRects.current);
    railRects.current = captureRail(railRef.current);
  });

  useEffect(() => {
    const previous = prevStage.current;
    prevStage.current = stage;
    if (previous === null || previous === stage) return;

    const dir: 1 | -1 =
      STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(previous) ? 1 : -1;
    playStageIn(stageRef.current, dir);

    /* SENGAJA TANPA CLEANUP YANG MEMBUNUH TWEEN.
       Sebelumnya cleanup memanggil `tween.kill()`, dan itu menyembunyikan
       panggung secara permanen: React memanggil efek dua kali (Strict Mode
       menyala secara bawaan di App Router), sehingga urutannya menjadi
       jalan -> cleanup -> jalan lagi. Cleanup membunuh tween saat opasitasnya
       masih 0, lalu jalan kedua berhenti di penjaga `previous === stage`
       karena refnya sudah dimutasi — tween pengganti tidak pernah dibuat dan
       panggungnya tertinggal `visibility: hidden`.

       Membiarkannya hidup aman: `playStageIn` memakai `overwrite: "auto"`,
       jadi pergantian panggung yang cepat membatalkan tween lama pada properti
       yang sama tanpa perlu dibunuh dari sini. */
  }, [stage]);

  return (
    /* Kerangka: satu jendela yang melayang di atas sapuan langit mendung
       (lihat `body::before` di globals.css). Semua panggung berada di dalamnya.

       Kerangkanya kertas buram, bukan kaca: di belakangnya cuma warna rata,
       dan kaca di atas warna rata bukan kaca — cuma kabur. Kaca dipakai hanya
       di panel yang benar-benar melayang di atas peta. */
    <div className="relative z-10 flex h-screen w-screen flex-col p-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-shell shadow-shell">
        <TopBar
          t={t}
          durationS={durationS}
          rmse={metrics?.rmse ?? null}
          agreement={metrics?.agreement ?? null}
          wetLinks={metrics?.wetLinks ?? 0}
          totalLinks={links.length}
          pendingAlerts={pendingAlerts}
          stage={stage}
          onStage={setStage}
          onOpenAlerts={() => setStage("peta")}
          showEvacuation={showEvacuation}
          /* Menutup lapisan evakuasi ikut menutup tinjauannya. Panel yang
             menghitung rutenya ikut dilepas di sini, jadi jendela yang
             ditinggalkan terbuka akan menahan penilaian terakhir tanpa ada yang
             memperbaruinya lagi — persis keadaan yang baru saja diperbaiki. */
          onToggleEvacuation={() =>
            setShowEvacuation((prev) => {
              if (prev) {
                setRouteModalPostId(null);
                setSelectedEvacPostId(null);
                setActiveEvacRoute(null);
              }
              return !prev;
            })
          }
        />

        {/* Pembungkus panggung. Ada semata-mata supaya pergantian panggung punya
            satu elemen untuk digerakkan; kelasnya menyalin persis kelas anaknya
            agar rantai `min-h-0 / flex-1` tidak terputus — peta bergantung pada
            rantai itu untuk mendapat tinggi nyata. */}
        <div ref={stageRef} className="flex min-h-0 flex-1 flex-col">
        {sim.error ? (
          /* Kejadian sekarang datang lewat jaringan, jadi kegagalan yang dulu
             mustahil kini mungkin. Berhenti pada layar "menyiapkan" selamanya
             akan terbaca sebagai aplikasi yang menggantung, bukan sebagai
             server yang mati. */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
            <Alert type="error" label="Kejadian gagal dimuat" className="max-w-[56ch]">
              {sim.error}. Pastikan server pengembangan berjalan, lalu muat ulang halaman.
            </Alert>
          </div>
        ) : !sim.ready ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6">
            <SectionLabel>Menyiapkan kejadian</SectionLabel>
            <p className="max-w-[46ch] text-center text-2xs leading-5 text-text-dim">
              Mengambil kejadian dari server: medan hujan sebenarnya, redaman{" "}
              {links.length} tautan, dan hasil pembalikannya menjadi peta hujan.
            </p>
          </div>
        ) : stage === "laporan" ? (
          snapshot ? (
            <ReportView
              snapshot={snapshot}
              links={links}
              catchments={catchments}
              candidates={candidates}
              decisions={decisions}
              wetDryAccuracy={sim.meta!.wetDryAccuracy}
              rmseSeries={rmseSeries}
              t={t}
              durationS={durationS}
              onDecide={decideAlert}
              onOpenComparison={() => setStage("perbandingan")}
              onOpenMap={() => setStage("peta")}
            />
          ) : null
        ) : (
          /* ---- panggung operasi: peta atau perbandingan, dengan panel kanan ---- */
          <div className="flex min-h-0 flex-1 gap-4 px-5 pb-4">
            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
              {stage === "peta" ? (
                <div className="card relative min-h-0 flex-1 overflow-hidden">
                  <RainMap
                    bbox={sim.meta!.bbox}
                    links={links}
                    snapshot={snapshot}
                    catchmentDefs={catchmentDefs}
                    catchmentStates={catchments}
                    selectedLinkId={selectedLinkId}
                    onSelectLink={selectLink}
                    evacuationPosts={showEvacuation ? EVACUATION_POSTS : undefined}
                    evacuationRoute={showEvacuation ? activeEvacRoute : null}
                  />

                  {/* Keping ringkas melayang di atas peta, bukan bilah penuh:
                      peta adalah isi utama panggung ini dan tidak boleh dipotong.

                      Di sinilah kaca dipakai, dan hanya di sini: yang ada di
                      belakang keping ini memang peta yang bergerak, jadi
                      buramnya menunjukkan sesuatu — cuaca terlihat menembusnya. */}
                  <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
                    <div className="glass flex items-center gap-3 px-4 py-2.5">
                      <div className="flex flex-col">
                        <SectionLabel>Tautan Basah</SectionLabel>
                        <span className="tnum text-sm text-signal-text">
                          {metrics?.wetLinks ?? 0}
                          <span className="ml-1 font-sans text-3xs text-text-dim">
                            / {links.length}
                          </span>
                        </span>
                      </div>
                      <span className="h-8 w-px bg-hairline" />
                      <div className="flex flex-col">
                        <SectionLabel>RMSE</SectionLabel>
                        <span className="tnum text-sm text-rain-text">
                          {metrics ? metrics.rmse.toFixed(2) : "—"}
                          <span className="ml-1 font-sans text-3xs text-text-dim">mm/jam</span>
                        </span>
                      </div>
                    </div>
                    {pendingAlerts > 0 ? (
                      <Alert type="error" dense label={null} overMap className="self-start">
                        <span className="tnum text-alert-text">{pendingAlerts}</span> kandidat
                        peringatan menunggu keputusan
                      </Alert>
                    ) : null}
                  </div>

                  <div className="pointer-events-none absolute bottom-4 left-4">
                    <RainLegend label="Intensitas Hujan · Rekonstruksi" />
                  </div>
                </div>
              ) : snapshot ? (
                <ComparisonView snapshot={snapshot} links={links} catchmentDefs={catchmentDefs} />
              ) : null}
            </main>

            {/* ---------------- panel kanan, 380px (DASH-1) ---------------- */}
            {/* Urutan diatur lewat `order` flexbox, BUKAN dengan merender panel
                DAS di dua cabang berbeda seperti sebelumnya. Dua cabang berarti
                React membongkar satu simpul dan memasang simpul baru, sehingga
                panel yang "naik ke atas" sebenarnya panel yang berbeda — tidak
                ada yang bisa dianimasikan, dan keadaan dalamnya (gulir, dialog
                yang sedang terbuka) ikut hilang. Satu simpul yang berpindah
                urutan menyelesaikan keduanya sekaligus. */}
            <aside
              ref={railRef}
              className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto pr-1"
            >
              {/* Tanpa tinggi tetap dan tanpa gulir sendiri: relnya yang
                  bergulir sebagai satu kolom (lihat DESIGN.md, Layout).
                  Sebelumnya panel ini dipatok 560 px lalu menggulir isinya di
                  dalam rel yang juga menggulir — dua bilah gulir bersarang
                  selebar 380 px, dan operator harus menebak yang mana yang
                  sedang ia gerakkan. */}
              {showEvacuation ? (
                <div data-flip="evakuasi" className="shrink-0">
                  <EvacuationPanel
                    snapshot={snapshot}
                    catchmentDefs={catchmentDefs}
                    catchments={catchments}
                    selectedPostId={selectedEvacPostId}
                    onSelectPost={(post) => setSelectedEvacPostId(post ? post.id : null)}
                    onSelectRoute={setActiveEvacRoute}
                    /* Poskonya ikut dikunci, bukan hanya dicatat: selama
                       jendela terbuka, peringkat rekomendasi masih berubah
                       mengikuti hujan, dan tanpa penguncian ini pokok yang
                       sedang ditinjau bisa berpindah sendiri. */
                    onOpenModal={(_route, post) => {
                      setSelectedEvacPostId(post.id);
                      setRouteModalPostId(post.id);
                    }}
                  />
                </div>
              ) : null}

              {/* Panel yang memuat keputusan naik ke atas ketika ada kandidat
                  menunggu. Itu satu-satunya hal yang berpindah di rel ini. */}
              <div data-flip="das" style={{ order: pendingAlerts > 0 ? -1 : 1 }}>
                <CatchmentPanel
                  catchments={catchments}
                  candidates={candidates}
                  decisions={decisions}
                  onDecide={decideAlert}
                  ready={alerts.ready}
                  error={alerts.error}
                  deciding={alerts.deciding}
                  decideError={alerts.decideError}
                />
              </div>

              <div data-flip="tautan" className="flex h-[440px] shrink-0 flex-col">
                <LinkDetailPanel
                  link={selectedLink}
                  state={selectedState}
                  trace={trace}
                  t={t}
                  durationS={durationS}
                />
              </div>
            </aside>
          </div>
        )}
        </div>

        <Timeline
          t={t}
          durationS={durationS}
          playing={playing}
          speed={speed}
          markers={markers}
          onToggle={togglePlay}
          onReset={reset}
          onSeek={(next) => {
            pause();
            setT(next);
          }}
          onSpeed={setSpeed}
        />
      </div>

      {routeUnderReview && postUnderReview && sim.meta ? (
        <EvacuationRouteModal
          route={routeUnderReview}
          post={postUnderReview}
          snapshot={snapshot}
          bbox={sim.meta.bbox}
          onClose={() => setRouteModalPostId(null)}
        />
      ) : null}
    </div>
  );
}
