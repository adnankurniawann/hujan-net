# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary, immediate audience: BRIN hackathon judges evaluating a scripted 3-minute live demo. Design and prioritization decisions optimize for what reads clearly and convincingly in that window (see the exact demo script and beat timing in `Panduan.md` section 10).

Primary, in-narrative persona: a BPBD/BMKG disaster-mitigation operator monitoring rainfall and catchment accumulation, who reviews auto-raised alert candidates and manually confirms or dismisses them. The system never broadcasts an alert on its own — operator confirmation is a deliberate governance point, not a missing feature.

Secondary audience: teammates and future reviewers of the repo, who need to be able to explain any function in the codebase to a judge on request (explicit team rule in `Panduan.md` section 5: "kalau kalian tidak bisa menjelaskan satu fungsi ke juri, fungsi itu tidak boleh masuk").

## Product Purpose

HujanNet Dashboard demonstrates one claim: signal attenuation between telecom microwave towers can be read as a high-resolution rainfall map, without installing new sensors.

For this hackathon phase, the product does not use real telecom operator data. It simulates a synthetic moving rain field, derives per-link attenuation from that field using the ITU-R P.838 physics model (forward model), then inverts that attenuation back into a reconstructed rain map (inverse model). Ground truth is known because the rain field is simulated, so the dashboard can display a live RMSE between the true field and the reconstruction — a number no team relying on real (unlabeled) telco data could show.

Success = the judges leave believing the inversion method works on real telco link data, based on watching simulated truth and reconstruction track each other with a visibly low RMSE.

Every view built on simulated data must carry a visible "DATA SIMULASI" marker. This is treated as a credibility asset, not a disclaimer to minimize.

## Positioning

The differentiating mechanism: turning existing telecom backhaul link attenuation (already recorded by operators today and normally discarded as noise) into rainfall measurement, via a physically-grounded forward model (ITU-R P.838) and its inverse — not integration of others' data sources.

Explicit competitive stance against incumbent platforms (named: Noah.ai) — see `Panduan.md` section 1.2: their strength is integration (CCTV analysis, evacuation routing, citizen alerts, hydrology models); this product deliberately does not build any of that. Building integration features would mean competing on Noah.ai's ground and burying the one thing only this team has: the measurement layer itself.

Where the "AI" claim lives (judges will ask): (1) wet/dry classification on noisy attenuation time series, (2) reconstructing a rain field from integral line measurements along links — an ill-posed inverse problem, since infinitely many rain fields can produce identical link measurements, requiring learned priors. Framed as harder than object detection.

## Operating Context

Single repo, single language (TypeScript/Next.js) — deliberately no separate Python service; a 2-day sprint cannot support two runtimes.

Three-person team with locked file ownership to avoid merge conflicts (`Panduan.md` section 4):
- Radit: `lib/physics/`, `lib/sim/`, `lib/inverse/`, `lib/types.ts` (locked after T0), `app/api/sim/`, `tests/`
- Sultan (this session's user): `components/`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts`
- Adnan: `lib/catchment/`, `lib/alerts/`, `app/api/alerts/`, `prisma/`, `data/`

Pure-function requirement: physics/sim modules must have no side effects and must not import React or Next, so they stay independently testable and portable to a separate service later.

Fixed desktop target: 1440px width, not responsive for mobile (explicit scope decision — this is an operator console, not a public site).

2-day build sprint with a hard code freeze at 16:00 on day 2 — after that, bug fixes only, no new features. Full task breakdown, branch/commit/PR conventions, and a day-by-day schedule are in `Panduan.md` sections 5, 7, and 8.

## Capabilities and Constraints

**In scope (P0 — the core proof):**
- Map with link paths + reconstructed rainfall heatmap layer
- Rain field simulator with bidirectional physics (forward: field → attenuation)
- Single-link detail panel: received-power time series, baseline, attenuation, inversion result
- Side-by-side true field vs. reconstruction comparison with live RMSE (judged as the decisive slide)

**In scope (P1):** per-catchment (DAS) rainfall accumulation with thresholds; alert-candidate queue requiring manual operator confirmation (system must never auto-broadcast); event replay with a time scrubber.

**In scope (P2, cut first if time-constrained):** rain-gauge-vs-link density comparison panel; per-link wet/dry status markers.

**In scope (P1, added 31 July 2026):** operator-facing evacuation dispatch — given an affected DAS, which posko to route it to. Deliberately scoped as a *consumer of the measurement layer*, not as routing infrastructure: route safety is scored by sampling the reconstructed rain field along each candidate lintasan (`sampleRainAt()`), which makes it a demonstration of what the inversion output is good for. It is not turn-by-turn navigation and has no citizen-facing surface; the operator selects a posko and produces a dispatch summary for a field team.

**Explicitly out of scope, permanently** (see `Panduan.md` section 1.2 for full rationale table): CCTV/object detection, citizen SMS/notification subscriptions, citizen reports, an LLM chatbot, news/earthquake/air-quality widget aggregation, login/roles/account management, hydrology/flood-depth prediction models.

> **Scope change recorded 31 July 2026.** "Evacuation routing" was previously in the permanent-exclusion list above, on the argument that it competes on Noah.ai's ground. The narrowed form now in scope is the operator dispatch decision, which is defensible on the original argument's own terms: it consumes the measurement layer rather than duplicating an integration feature. The excluded thing remains excluded — citizen-facing navigation, public route broadcast, and road-network routing are still out. If a judge asks, the honest answer is that the product routes *operators' decisions*, not people.

**Legal/governance constraint:** the system is a measurement/data-supply layer to authorized agencies (BPBD/BMKG), not a public broadcast layer. Citizen-facing meteorological alerting is BMKG's legal authority under UU 31/2009 — cited directly as the answer to an anticipated judge question.

**No new dependencies without team agreement** — every added library is an untested risk in a 2-day sprint.

**Terminology (Indonesian, used verbatim in-product and in judge-facing framing):** DAS (Daerah Aliran Sungai = catchment/watershed), waspada (watch/elevated status), siaga (alert/high status), redaman (attenuation), curah hujan (rainfall).

## Brand Commitments

Design system is pre-decided by the team and stated as binding rules, not suggestions (`Panduan.md` section 6, verbatim: "jangan terlihat seperti hasil vibe coding... ini bukan saran, ini aturan").

Revised 30 July 2026 to a light "read through wet glass" world. The token *names* are unchanged and their semantics are unchanged; the values and the surrounding rules were replaced, and `Panduan.md` section 6 was rewritten to match what actually ships.

- **Light, not dark, chosen from the use scene** — a BPBD operations room in daylight and a lit hackathon hall with a projector. Dark themes wash out on both. Light is a decision here, not a default.
- Palette (implemented in `app/globals.css` / `tailwind.config.ts`): `--bg #e4ebf2`, `--bg-deep #d3dce6`, `--shell #f7fafc`, `--surface #ffffff`, `--surface-2 #f2f6fa`, `--surface-3 #e8eef5`, `--border rgba(15,32,51,0.12)`, `--text #0f2033`, `--text-mute #47617a`, `--text-dim #546a7e`, `--rain #1f6fd0` (rain scale), `--signal #b8720d` (attenuation/signal), `--alert #c33f26` (siaga status), `--ok #0d7d64`.
- **Exactly two data accents**: `--rain` for the weather quantity inferred, `--signal` for the quantity the radio measured. `--alert`/`--ok` are status, not decoration. A fifth hue is a bug, not a variant.
- **`--violet` is deleted and must not return.** It previously meant "control is active" so it would not collide with data colour, then leaked into the radar fill, gauge arc, and timeline progress until it meant both "control" and "data". Active state now uses ink (`--text`), which is not a measured quantity at all.
- Every text colour in the palette is verified >= 4.5:1 against all four card grounds (WCAG AA). New text colours must be checked before use.
- Typography: Inter for UI text, JetBrains Mono for every number, unit, link ID, and coordinate — a non-negotiable rule, not a preference.
- Spacing scale: multiples of 4px for layout (4/8/12/16/24/32/48). Half-steps (2/6/10/14) exist for dense in-component spacing only.
- **Glass is a material, not a decoration.** `.glass` may only be used where a map or rain-field canvas sits behind it — currently the map stat chip, the rain legend, and the MapLibre zoom control. Over flat colour it is not glass, only blur. The console shell and every card use opaque paper.
- Explicitly banned: coloured background gradients and blobs (one vertical sky wash in `body::before` is the sole exception), `.glass` anywhere but over map/field canvases, radii above 14px, in-UI emoji, coloured or zero-offset glow shadows, entrance animation on every element (motion reserved for things that actually change, e.g. a moving rain cell), decorative icons that convey nothing, oversized stat-card rows with no function, and rendering the same metric in more than two encodings on one screen.
- Explicitly wanted: high information density (operator console, not a marketing page), 1px hairline dividers instead of shadows, small-caps letter-spaced section labels, units always written out (dB, mm/jam, GHz, km), serious (non-joke) empty/loading states, and undefined metrics rendered as `—` rather than `0` or `100 %`.
- Product name: "HujanNet Dashboard" / "HUJANNET DASHBOARD" in UI.
- The "DATA SIMULASI" marker is a permanent, always-visible brand/trust element on every simulated-data view — not a temporary dev label to remove later.

## Evidence on Hand

No real telecom operator data exists or will be used in this phase — this is a stated, permanent absence, not a gap to fill in. Rain fields and link topology (`data/links.json`, 40–60 synthetic links around the upper Ciliwung watershed bounding box) are synthetic, generated per the T0 task spec.

One layer is **not** synthetic and may be described as real: the catchment boundaries in `data/catchments.geojson` are delineated from SRTM 1 arcsec (~30 m) elevation via pit filling, D8 flow direction, and flow accumulation — see `scripts/hydro/README.md`. The three sub-catchments measure 15.5 / 43.6 / 75.0 km², summing to the 134.1 km² draining to Gadog, consistent with the ~150 km² published for the Ciliwung at Katulampa just downstream. Real terrain does not make the rain or the attenuation real; the "DATA SIMULASI" marker stays exactly as it is.

Because ground truth is simulated (not real), the dashboard can legitimately display quantitative accuracy numbers (RMSE, classification accuracy) that a team using unlabeled real data could not honestly show. Future work (real operator data access) is described as belonging to the proposal's "Rencana Eksekusi" section, outside this repo.

## Product Principles

1. Prove the inversion, not the integration — every feature choice is judged against "does this strengthen the truth-vs-reconstruction proof," not "does this make the product more complete as a platform."
2. Governance is a feature, not friction — no code path may auto-broadcast an alert; a human operator confirmation step is a selling point in the demo, explicitly framed around trust (a false 2am alarm destroys trust in the system within a month).
3. Simulated is disclosed, not disguised — the DATA SIMULASI marker and the honest framing ("we show error precisely because we know ground truth") are core to credibility, not a weakness to minimize.
4. Two days, one runtime, locked contracts — architecture choices (single TS repo, pure-function physics modules, a locked `lib/types.ts` contract, strict file-ownership boundaries between the three builders) exist to prevent integration failures within a hard deadline, not for long-term architectural elegance.
5. A working narrow demo beats a broken wide one — P2/unfinished features are cut at the code freeze, not forced in; five features that run smoothly beat nine that stutter.
