---
target: whole dashboard (components/Dashboard.tsx)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-07-30T10-59-23Z
slug: components-dashboard-tsx
---
Method: dual-agent (A: a459b622730f6b558 · B: a5635ba4ef063c4f8)
Browser evidence: **unavailable** — Chrome extension not connected in either agent. No overlay was injected and no screenshots were taken. Visual findings are derived from source and from the compiled CSS served by the running dev server, not from rendered pixels.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Live T+, RMSE, and `aria-pressed` are solid; but confirming an alert produces no receipt, the bell badge opens nothing, and tile failure logs to console only. |
| 2 | Match System / Real World | 3 | Domain language is excellent (DAS, redaman, waspada, units always written). Docked: Willmott index `d` printed in the unit slot, and shown as "100 %" though it is dimensionless. |
| 3 | User Control and Freedom | 2 | `decideAlert` has no inverse — an issued alert can never be revoked. No undo anywhere. |
| 4 | Consistency and Standards | 2 | Internally disciplined (one Card, one Panel, one Chip). Against the project's own written standard it breaks 5 of 7 explicit bans, and every palette hex has drifted from PRODUCT.md. |
| 5 | Error Prevention | 3 | `ConfirmDialog` is genuinely good — restates catchment, accumulation, threshold, accountable operator. But "Abaikan" dismisses a flood candidate in one unguarded click. |
| 6 | Recognition Rather Than Recall | 3 | Legend repeated inside ComparisonView, thresholds printed beside every accumulation. Docked: red alert markers on the scrubber have no legend. |
| 7 | Flexibility and Efficiency | 3 | Space/R/arrows/Shift, speed presets, stage switching — console-grade. Docked: no keyboard path to select a link, and Space is hijacked while a button has focus. |
| 8 | Aesthetic and Minimalist Design | 1 | The default stage renders the same six metrics in four encodings, led by a decorative gauge and a decorative radar. |
| 9 | Error Recovery | 1 | No `app/error.tsx`, no error boundary, no error state anywhere in the tree. One throw in `computeSnapshot` and the demo sits on "Menyiapkan kejadian" forever. |
| 10 | Help and Documentation | 3 | Unusually good in-product help (HelpDot hints, PipelineMarkers formulas, Batas Keberlakuan). Docked: all of it is `title`-only on non-focusable spans. |
| **Total** | | **23/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

**Split, and the split runs along stage boundaries.** Peta and Perbandingan are authored for rainfall-from-telecom-attenuation and could not be lifted into another product. Laporan — the default screen — and the visual shell are category-interchangeable.

Genuinely authored:
- `LinkDetailPanel.tsx:215-223` — attenuation drawn as the shaded area *between* rx power and the dashed baseline. The band **is** the measurement.
- `LinkDetailPanel.tsx:286-307` — inversion filled, ground truth dashed on top, with a comment noting that reversing the order would hide the proof.
- `RainMap.tsx:67-80` — attenuation encoded in stroke width *and* alpha, `ATTEN_FULL_DB = 30` tuned because 20 dB buried the rain field.
- `ComparisonView.tsx` — one `FieldCanvas`, one `colorRamp`, identical cover-scale math, so neither field can be flattered by its own rendering.
- `PipelineMarkers.tsx` — real formulas with `IDW_NEIGHBOURS`/`IDW_POWER` imported from the engine, so documented constants cannot drift from running ones.
- The semantic color contract: `--signal` = what the radio measured, `--rain` = what was inferred from it, held across `colorRamp.ts`, `RainMap.tsx`, `RainLegend.tsx`, `LinkDetailPanel.tsx`.

Category-interchangeable:
- `AccuracyGauge.tsx` — 340° arc with radial core glow and six orbiting satellites. Could display NPS or uptime. Largest element on the default screen.
- `PerformanceRadar.tsx` — six-axis radar restating the same six numbers as the satellites, then listing them numerically below. Three encodings of one dataset.
- `TopBar.tsx:44-57` `MiniBars` — seven ascending bars showing progress already stated three times nearby.
- `TopBar.tsx:181-200` — a bell with a live badge and no `onClick`, and an "OP" avatar for an account system PRODUCT.md puts permanently out of scope.
- `globals.css:94-106` — four colored radial-gradient blobs behind `backdrop-blur-[14px]`.

On the default screen roughly 60% of the pixels survive a find-and-replace into "ModelOps Dashboard". On Perbandingan, close to none would.

### Deterministic scan

`detect.mjs` returned **zero findings** across `components` and `app`, exit 0. Assessment B verified the zero is real rather than a silent failure: probing with synthetic bad files produced hits on both the CSS and TSX paths, `.impeccable/config.local.json` contains no ignore rules, and `doctor.mjs` reports no drift.

**The detector agreeing with you is not evidence here.** It encodes generic slop rules; it does not know this project's written bans. The build ships colored gradient blobs, backdrop blur, `rounded-3xl`, and colored glow shadows — all explicitly banned in Panduan §6 — and the detector has no rule for any of them. B also found one genuine blind spot: the `overused-font` rule targets Inter by name, this project's body font *is* Inter, but it reaches CSS as `var(--font-inter)` so the regex never matches. The clean result on that rule is CSS-variable indirection, not absence of Inter.

No false positives to report — the finding set was empty.

### Browser evidence

No user-visible overlay is available. Neither agent could reach Chrome, so injection, screenshots, and console capture were all skipped; `live-server.mjs` was never started. Fallback signal came from the compiled CSS served at `/_next/static/css/app/layout.css` — declared values, not computed styles. Specifically unverified: real tab order, whether focus rings actually render, whether anything clips or overlaps at 1440×900, and all console output.

## Overall Impression

There are two products in this repo. One is a disciplined measurement instrument — Perbandingan, the link detail panel, the color contract, the governance dialog — and it is better than hackathon work usually gets. The other is a generated-looking analytics report that opens by default and leads with a number the team's own handover note says must never be shown.

The single biggest opportunity is not additive. Change one line in `store.ts`, suppress the degenerate metrics on an empty field, and the demo starts on the screen the script actually describes and stops volunteering the evidence against itself.

## What's Working

**The semantic color contract, held across four files.** `--signal` for what the radio measured, `--rain` for what was inferred from it. It works because color is doing the same job the product does — separating measurement from inference. A generic dashboard cannot borrow it, because it requires knowing what is being measured. `colorRamp.ts` is also monotonic in lightness *and* alpha, so it survives greyscale and color-vision deficiency. That is correct dataviz, done deliberately.

**`ComparisonView.tsx` is the best screen in the build, for the right reason.** Both panels render through one `FieldCanvas` with one ramp and identical scale math, so neither field can be flattered. Then RMSE sits at `text-4xl` beside a paragraph explaining why the error is measurable at all. Hierarchy, honesty, and the product claim are the same object. Do not touch this screen.

**Honesty implemented as structure, not copy.** `SimulationBadge` is a primitive, not a string. The governance sentence is pinned inside the alert panel in *both* places the queue appears (`CatchmentPanel.tsx:99`, `CatchmentCard.tsx:163`) so it cannot scroll away from its subject. "Batas Keberlakuan" sits on the same page as the numbers it qualifies.

## Priority Issues

### [P0] The default screen discredits the product in the first three seconds

`store.ts:46` sets `stage: "laporan"`. At t=0 the field is all zeros, so `willmottAgreement` takes its degenerate branch (`metrics.ts:104`, `if (den <= 0) return num <= 0 ? 1 : 0`) and returns 1. The first thing on screen is `text-5xl` **"100 %"**, a grade chip reading **"sangat baik"**, RMSE 0,00, a radar with the correlation axis collapsed to zero, and a satellite reading **"Deteksi basah/kering 99,9 %"**.

**Why it matters:** Both audiences lose. Panduan §10 beat one describes the map at t=0 — the presenter either burns dead air navigating or improvises on a screen the script never mentions. And a BRIN research judge reading 100% + 99.9% on synthetic data concludes *leaked ground truth* before the first sentence lands. CATATAN-SULTAN.md Keputusan 4 predicted this exact reaction and deliberately kept 99.9% off the top bar; the report now publishes it in three places.

**Fix:** (a) `store.ts:46` → `stage: "peta"`. (b) When `m.peakTruth < 1`, suppress agreement, grade, and correlation — render `—` with "cerah — tidak ada medan untuk dibandingkan." A gauge that refuses to score an empty field is far more convincing than one that scores it 100. (c) Drop `wetDryAccuracy` from the satellites, radar, and PipelineMarkers, or label it in place: "garis dasar diketahui — bukan taksiran."

**Suggested command:** `/impeccable distill`

### [P1] The shipped design is a different visual world from the one every document certifies

Panduan §6 bans background gradients, colored blobs, glassmorphism/blur, `rounded-2xl`+, and heavy/colored shadows, and states one accent only. Verified in the working tree: four colored radial-gradient blobs (`globals.css:100-105`), `backdrop-blur-[14px]` and `rounded-3xl` on the shell (`Dashboard.tsx:93`), colored glow shadows, and `--violet` in 37 places.

Beyond the bans, **every palette value has drifted**. Token names were preserved (`globals.css:12` says so explicitly) but the hexes were all replaced: `--bg` #0D1B26 → #0b0913, `--surface` #16303F → #16131f, `--rain` #2E6FB7 → #4b8ef8, `--signal` #D98A21 → #f4a63c, `--text` #E8EFF3 → #f3effb — teal-navy operator console to near-black purple. New tokens `--violet`, `--scale-mid`, `--bg-deep`, `--shell`, `--surface-2/3` were added. The 4px scale is gone too: `tailwind.config.ts:19-44` now defines 2px/6px/10px/14px steps. Meanwhile `CATATAN-SULTAN.md:22-26` still certifies that the config makes violations impossible and the detector is clean.

**Why it matters:** PRODUCT.md names repo reviewers as a secondary audience who must explain any function to a judge. Documentation currently contradicts the code it describes. Separately, `--violet` was justified in `primitives.tsx:369` as reserved for chrome so it wouldn't collide with data — it is now the radar fill, the gauge arc, the timeline progress bar, and a satellite tone. It means both "this control is active" and "this is data," which is the same as meaning nothing.

**Fix:** Pick one and make it true. The new skin is defensible and better executed than flat teal — if you keep it, rewrite Panduan §6 and PRODUCT.md's Brand Commitments, and delete the false compliance claim in CATATAN-SULTAN.md before anyone reads the repo. Then strip `--violet` from every data role so it means exactly one thing.

**Suggested command:** `/impeccable document`

### [P1] No keyboard path exists to the product's core interaction

Verified: zero `tabIndex`, zero `role="button"`, zero `onKeyDown` anywhere in `components/`. `onSelectLink` is invoked from exactly one place — `RainMap.tsx:364`, inside `map.on("click")` with a 7px pixel hit test. The overlay canvas is `pointer-events-none`. Selecting a link is the only route to `LinkDetailPanel`, which is the entire B4 proof.

Assessment B found two further defects here that the design review missed: `usePlayback.ts:49-57` early-returns for `INPUT`/`TEXTAREA`/`SELECT`/contentEditable but **not `BUTTON`**, so with any ConsoleButton focused, Space calls `preventDefault()` and toggles playback instead of activating the button. And `.maplibregl-canvas:focus {outline:none}` (specificity 0,2,0) beats the app's `:focus-visible` ring (0,1,0), while MapLibre gives that canvas `tabindex="0"` — a tab stop with no visible indicator.

**Why it matters:** The whole inversion demonstration is unreachable by keyboard or screen reader. The 7px tolerance is also a live demo risk on a trackpad against a projector.

**Fix:** Render a visually-hidden `<ul>` of `<button>`s (one per link, labeled `L-012 · 18 GHz · 4,94 km · basah`) calling `selectLink` — ~15 lines, no visual change, and it doubles as the wet-links list a power user wants. Add `BUTTON` to the `usePlayback` guard. Restore a focus ring on the map canvas. Make `HelpDot` a real `<button>` with the hint in an `sr-only` span.

**Suggested command:** `/impeccable audit`

### [P1] `--text-dim` fails WCAG AA and carries the sentence the product is built on

`--text-dim: #7a7292` measures **3.90:1** on the card surface, **4.47:1** on `--bg-deep`, **4.18:1** on card-inset — all below AA's 4.5:1, with no large-text exemption since it is almost always rendered at 10px (`text-3xs`). It appears 62 times across the codebase and carries: every unit (mm/jam, dB, GHz, km), every chart axis tick, the "Batas Keberlakuan" footnote, the keyboard hints, and the governance sentence "Sistem tidak pernah menyiarkan peringatan sendiri."

**Why it matters:** The brand rule says units must always be written; they are currently the least readable text on screen. And the strongest narrative asset in the pitch is rendered at the lowest contrast in the app, at 10px, viewed from a projector.

**Fix:** Raise `--text-dim` to ≈`#9a93ad` (~4.6:1 on card). Promote the governance line in `CatchmentPanel.tsx:99` and `CatchmentCard.tsx:163` to `text-text-mute` at `text-2xs`. Median font size in this console is 10–11px — lift `text-3xs` to 11px globally once the report is no longer the default and you have the vertical room.

**Suggested command:** `/impeccable typeset`

### [P2] The two beats worth 50 seconds of a 180-second script are staged in a scrolling sidebar

Panduan §10 gives DAS status and the governance confirmation over a quarter of the demo. Both live in the 380px right rail at 11px, behind a `LinkDetailPanel` pinned to 440px (`Dashboard.tsx:194`). By arithmetic the rail holds ~724px of viewport against ~918px of content, which puts the alert queue below the fold. CATATAN-SULTAN.md §3 still claims everything fits at 900px — true before the 440px pin. This was not visually confirmed; verify it before the demo, because two beats depend on it.

**Why it matters:** The team already made this exact call once — CATATAN-SULTAN.md argues B5 deserved full width because the script says "buka" and "kembali." The script gives DAS its own beat in the same language and it did not get the same treatment. Governance, which PRODUCT.md Principle 2 calls the selling point, currently occupies less pixel area at lower contrast than the decorative MiniBars in the top bar.

**Fix:** When `pendingAlerts > 0`, reorder the rail so `CatchmentPanel` sits above `LinkDetailPanel` — one line in `Dashboard.tsx:190-209`. Better: promote the raised candidate to a full-width strip above the map showing catchment, accumulation vs threshold, the governance sentence at `text-2xs`, and both buttons at demo scale.

**Suggested command:** `/impeccable layout`

## Persona Red Flags

**Alex (power user)** — No keyboard link selection, the interaction he'd use most. Arrow step is fixed at 60s (`usePlayback.ts:63,67`) for a 3600s event, so he overshoots the T+29:00 peak every time. Every scrub calls `pause()` (`Dashboard.tsx:221`) so he can't nudge while playing. The red scrubber markers look like jump targets and are `pointer-events-none` (`Timeline.tsx:121`). Space toggles playback instead of pressing the button he has focused. First click on "Laporan" mid-playback computes 61 snapshots synchronously (`useSnapshot.ts:185-196`) — he'll feel the hitch. The bell with a badge does nothing.

**Sam (accessibility-dependent)** — Cannot select a link at all, so `LinkDetailPanel` and the core proof do not exist for him. 62 elements below AA contrast, mostly 10px, including every unit and the governance sentence. All hints are `title`-only on non-focusable elements, so the entire in-product help layer is invisible. Recharts SVGs have no aria description and no table alternative. `body { overflow: hidden }` plus `h-screen` plus a fixed 380px rail containing a fixed 440px panel means 200% zoom clips instead of reflowing — a WCAG requirement, not a mobile concern. **Credit where due:** the scrubber is a real `<input type="range">` with `aria-label` and `aria-valuetext`, `StatusDot` is `aria-hidden` with status written as text, `ConfirmDialog` is a native `<dialog>` so focus trap and Esc work for free, and `prefers-reduced-motion` is honored. Above the hackathon bar.

**BPBD operator (project-specific, from PRODUCT.md)** — Opens his console and lands on a research report, not an operational map. The number he is accountable for — accumulation vs threshold — is the third region of a scrolling 380px rail at 11px, while a `text-5xl` model-quality gauge owns the screen. The SSR payload shows thresholds of 18/9/9 mm; he knows 1-hour siaga thresholds are 40–50 mm, and nothing on screen marks these as provisional preview values. In a product whose credibility strategy is "simulated is disclosed, not disguised," an undisclosed provisional threshold is the one honesty gap that matters. **"Abaikan" dismisses a flood candidate in one click** with no confirmation, no reason capture, no undo — in real practice a dismissal is as accountable as a confirmation, and only one direction is guarded. After confirming, nothing tells him it was issued, to whom, or when.

**Hackathon judge (project-specific, 3-minute demo)** — Seconds 0–3: "100 %", "sangat baik", "99,9 %", and a radar with a collapsed axis, on an empty field. Her question is loaded before the narrator finishes. Beat 1:20 (Perbandingan) will land — it is the strongest screen and correctly built. Beat 1:50: 11px text in a 380px column is unreadable from the room; she takes the narrator's word rather than seeing evidence. Beat 2:15: the governance claim is a 10px grey sentence below AA contrast and a 28px pill — not visible from the audience. If venue Wi-Fi drops, CARTO tiles fail silently (`RainMap.tsx:349` logs to console only); the app degrades beautifully since all data is local, but with no "ubin dasar luring · seluruh data digambar lokal" chip, a robustness win reads as a broken map.

## Minor Observations

- **[P2] No error boundary anywhere.** No `app/error.tsx`, no boundary, no try/catch outside `preview/engine.ts`. If `computeSnapshot` throws, `sim.ready` stays false and the screen shows "Menyiapkan kejadian" forever with no timeout. That is a live-demo failure mode with no recovery.
- `ReportView.tsx:184` labels an action "Lihat laporan penuh" that opens Perbandingan; `ScoreCard.tsx:31` labels the identical action correctly.
- `TopBar.tsx:142` puts `d` in the unit slot. `d` is the index's name, not a unit — it reads as "days."
- `AccuracyGauge` renders a dimensionless 0–1 Willmott index as a percentage. Statistically defensible, rhetorically dangerous: it invites "100% accurate."
- `NetworkCard.tsx:24` hardcodes `RAIN_GAUGES_IN_BBOX = 1` and presents "1 : 50" as a headline argument with no assumption marker. The code comment is honest; the UI isn't.
- `RainMap.tsx:180-189` hardcodes `#F0603F`/`#F4A63C` because canvas can't read `var()`. Read them once via `getComputedStyle` so a token change can't desync the map.
- `primitives.tsx:469` `GradientMeter` introduces `--scale-mid: #f4d03c`, a yellow in no token list.
- `text-[8px]` and `text-[9px]` escape the type scale. `MiniBars` heights compute to 7.6/9.2/10.8/12.4/15.6px — sub-pixel values in a build whose stated rule is 4px multiples.
- `formatClock` renders a 3600s event as `60:00` in mm:ss — ambiguous at a glance.
- `app/fonts/GeistVF.woff` and `GeistMonoVF.woff` are on disk and referenced nowhere. Dead assets.
- **Credit:** no emoji anywhere. Every number is JetBrains Mono via `.tnum`/`.figure`, including Recharts axis ticks. Empty and loading states are serious and explain what is happening. Those rules are held cleanly.

## Questions to Consider

1. **If Perbandingan is the decisive slide, why is it a tab you can navigate away from?** What does this console look like if truth-vs-reconstruction is the permanent home and the map becomes the drill-down? The current IA says the report is the product and the proof is a side trip.
2. **The report renders six metrics in three encodings. If the projector could show exactly one number, which is it — and does the layout currently say so?** Right now the layout says "100 %", the one number you cannot defend. RMSE is the one you can, and it's a `text-2xl` figure in a side card.
3. **`--violet` was introduced so chrome wouldn't collide with data, and it is now the radar fill, the gauge arc, the progress bar, and a satellite tone.** What has the operator learned by seeing it?
4. **Governance is described as the selling point.** It occupies less pixel area, at lower contrast, than the decorative MiniBars. If exactly one element had to be legible from four metres, would you choose the accuracy gauge or the confirmation step?
5. **Wet/dry 99,9% is known to be inflated because the preview inverter already knows the true baseline** — your own handover note says so and says not to show it. It now appears three times on the default screen. What is the answer when a judge asks how the baseline was estimated?
