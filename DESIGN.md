---
name: HujanNet Dashboard
description: A daylight-overcast operator console where the measured surface is the only thing that carries colour.
colors:
  bg: "#e4ebf2"
  bg-deep: "#d3dce6"
  shell: "#f7fafc"
  surface: "#ffffff"
  surface-2: "#f2f6fa"
  surface-3: "#e8eef5"
  inset: "rgba(15, 32, 51, 0.045)"
  border: "rgba(15, 32, 51, 0.12)"
  border-strong: "rgba(15, 32, 51, 0.22)"
  hairline: "rgba(15, 32, 51, 0.07)"
  text: "#0f2033"
  text-mute: "#47617a"
  text-dim: "#546a7e"
  rain: "#1f6fd0"
  rain-text: "#0f5fb8"
  signal: "#b8720d"
  signal-text: "#8a5206"
  alert: "#c33f26"
  alert-text: "#b0311c"
  ok: "#0d7d64"
  ok-text: "#096450"
  scale-low: "#0d7d64"
  scale-mid: "#b8720d"
  scale-high: "#c33f26"
typography:
  figure-xl:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "48px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum 1"
  figure-lg:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "36px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum 1"
  figure-md:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tnum 1"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
    letterSpacing: "-0.01em"
  readout:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "tnum 1"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "16px"
    letterSpacing: "normal"
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: "14px"
    letterSpacing: "0.16em"
rounded:
  none: "0px"
  sm: "4px"
  DEFAULT: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  full: "9999px"
spacing:
  0.5: "2px"
  1: "4px"
  1.5: "6px"
  2: "8px"
  2.5: "10px"
  3: "12px"
  3.5: "14px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  12: "48px"
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "16px 20px 12px"
  card-inset:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  shell:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
  glass-panel:
    backgroundColor: "rgba(255, 255, 255, 0.82)"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-mute}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "28px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
  button-ghost-active:
    backgroundColor: "{colors.text}"
    textColor: "{colors.surface}"
  button-solid:
    backgroundColor: "{colors.text}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "28px"
  button-danger:
    backgroundColor: "rgba(195, 63, 38, 0.10)"
    textColor: "{colors.alert-text}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 12px"
    height: "28px"
  icon-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-mute}"
    rounded: "{rounded.full}"
    height: "32px"
    width: "32px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-mute}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  chip-rain:
    backgroundColor: "rgba(31, 111, 208, 0.08)"
    textColor: "{colors.rain-text}"
  chip-signal:
    backgroundColor: "rgba(184, 114, 13, 0.08)"
    textColor: "{colors.signal-text}"
  chip-alert:
    backgroundColor: "rgba(195, 63, 38, 0.10)"
    textColor: "{colors.alert-text}"
  chip-ok:
    backgroundColor: "rgba(13, 125, 100, 0.08)"
    textColor: "{colors.ok-text}"
  pill-group:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    height: "40px"
  simulation-badge:
    backgroundColor: "rgba(184, 114, 13, 0.10)"
    textColor: "{colors.signal-text}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 12px 4px 8px"
---

# Design System: HujanNet Dashboard

## Overview

**Creative North Star: "Read Through Wet Glass"**

This is an operator console lit like an overcast afternoon. The ground is a cool blue-grey paper, the cards are opaque white, the lines are ink hairlines, and the only saturated colour on screen belongs to the thing being measured: the rain field on the map. Light was chosen from the room the console is used in — a BPBD operations room in daylight, and a judged hall with the lights on and a projector running. Both wash out a dark console. Light here is a decision with a reason attached, not a category default.

The material logic is literal. Glass appears only where something is actually being read *through* glass: a panel floating over the live map or over a rain-field canvas. Over flat colour, glass is not glass — it is blur, and blur over flat colour is decoration. Everything not floating over a canvas is opaque paper. That single distinction is what keeps the world from collapsing into the generic frosted-panel look it would otherwise become.

Density is high and unapologetic: this is an instrument, not a landing page. Type runs small (10px and 11px carry most of the interface) so that big monospace figures can mean something when they appear. Colour is rationed to two data accents plus two status colours, and "this control is active" is expressed in ink rather than hue — because an active tool is not a measured quantity and must not look like one.

**Key Characteristics:**
- Daylight-overcast light ground (`#e4ebf2` → `#d3dce6`), a single vertical sky wash, no colour blobs
- Exactly two data accents: blue `--rain` (inferred weather) and amber `--signal` (what the radio measured)
- Active state is ink, never accent colour
- Glass only over map or field canvas; everywhere else, opaque paper
- Every numeral in Martian Mono, tabular, with its unit written out
- Fixed 1440px single-screen desktop; only stage content scrolls
- Undefined metrics render as `—`

## Colors

A cool, low-chroma daylight palette in which every saturated pixel is either a measurement or a status.

### Primary
- **Rain Blue** (`{colors.rain}`): the inferred weather quantity — mm/jam. It paints the rain heatmap, the legend gradient, the reconstruction readouts, the scrubber thumb, and the focus ring (4.95:1 on white, well past the 3:1 non-text threshold). Its darker sibling `rain-text` exists solely so the same meaning survives as small text on white.

### Secondary
- **Signal Amber** (`{colors.signal}`): the quantity the radio actually measured — attenuation, received power, wet-link counts. Amber is the measurement; blue is the inference drawn from it. Never swap them for visual balance.

### Tertiary
- **Alert Clay** (`{colors.alert}`): siaga status only — pending alert candidates, timeline event markers, the bell badge, destructive controls.
- **Confirm Green** (`{colors.ok}`): normal / confirmed status only.
- Together with Signal Amber these three also serve as the fixed low→high error scale (`scale-low` / `scale-mid` / `scale-high`) used by the gradient meter. That ramp is deliberately built from existing tokens; no fifth hue was smuggled in as a "mid" yellow.

### Neutral
- **Overcast Paper** (`{colors.bg}` / `{colors.bg-deep}`): the page ground, joined by one vertical sky wash from `#eef3f8` at the top to `bg-deep` at the bottom. Light falls from above, like a covered sky. That gradient is the only decorative gradient in the system.
- **Shell** (`{colors.shell}`): the one console window that floats on the ground and holds every stage.
- **Card White** (`{colors.surface}`) with **Recessed Paper** (`{colors.surface-2}`, `{colors.surface-3}`) and **Inset** (`{colors.inset}`): nested surfaces go *darker*, not lighter. On a light ground, a lighter inset reads as a hole.
- **Ink** (`{colors.text}`) with **Muted Ink** (`{colors.text-mute}`) and **Dim Ink** (`{colors.text-dim}`): all three verified ≥ 4.5:1 against all four card grounds. Ink is also the active-state fill and the timeline progress fill.
- **Hairlines** (`{colors.hairline}`, `{colors.border}`, `{colors.border-strong}`): ink at low alpha. Lines are ink, never white — a white line on light paper is an absence, not a line.

### Named Rules
**The Two Accents Rule.** There are exactly two data colours: `rain` for the weather quantity inferred, `signal` for the quantity the radio measured. `alert` and `ok` are status and carry no measurement meaning. A fifth hue is a bug, not a variant.

**The Ink Active Rule.** "This control is active" is drawn in ink (`text` on `surface`), never in an accent. A violet once carried both "active" and "this is data" and therefore taught the operator nothing; it was deleted and must not return under another name.

**The Alpha Channel Rule.** Only `text`, `rain`, `rain-text`, `signal`, `signal-text`, `alert`, `alert-text`, `ok`, and `ok-text` are declared as RGB channels and therefore accept alpha modifiers (`bg-text/12`, `bg-rain/8`). `text-mute`, `text-dim`, `border`, `hairline`, and the surfaces are plain `var()` strings: writing `text-mute/60` produces invalid CSS that disappears with no warning. If a muted ink needs transparency, use `text` with an alpha instead.

**The Darker-Is-Heavier Rule.** The rain ramp (`components/map/colorRamp.ts`) is one hue, monotonic in *both* lightness and alpha, and on this light ground it runs pale blue → ink blue as intensity rises. Heavier rain is darker, never brighter. The map, both comparison canvases, and the legend all read from that one function, so they cannot drift apart.

## Typography

**UI Font:** Archivo (with ui-sans-serif, system-ui, sans-serif)
**Numeral Font:** Martian Mono (with ui-monospace, monospace), tabular figures always on

**Character:** Studio grotesque, black on white. Archivo carries the words and Martian Mono carries every number, so digits never shift column as time advances.

The pairing took two attempts on 31 July 2026, and both corrections are worth recording. The console shipped on Inter + JetBrains Mono: two good faces, but the default pairing of very nearly every machine-generated interface, saying nothing about this product. It was then moved to IBM Plex, which is correct on the technical merits — its Sans and Mono are a designed pair — but has no attitude, and was rejected on sight.

Archivo + Martian Mono was chosen against a reference: a film-production portfolio, black and white, bold and editorial. **The reference had to be translated rather than copied.** That site is display type at enormous sizes with very little text; this console is 10px and 11px carrying nearly the whole interface, in tight columns of numbers. Archivo is the one grotesque with that editorial weight that was also drawn to hold up small — the more mannered grotesques close their apertures at 10px, and 10px is where this console lives.

The attitude therefore lives in **treatment, not in the face**: headline figures at weight 600 and −0.04em, titles bold and tight, body text left quiet at 400. If everything thickens, nothing stands out and only noise is left.

Martian Mono is markedly wider than the mono it replaced, so `.tnum` carries −0.035em to claw back column width. Letter-spacing is tightened, never glyph width: the figures stay tabular, so digits still do not shift column as the clock advances.

The CSS variables are named by role (`--font-sans`, `--font-mono`), never by brand — a lesson this file learned twice.

### Hierarchy
- **Figure XL / LG / MD** (mono, 600, 48 / 36 / 30px, line-height 1, tracking -0.04em): the single headline number of a report card. Weight climbed 300 → 400 → 600 across two revisions: a hairline weight that looked elegant on dark went pale on white, and a regular weight had no editorial presence at all.
- **Title** (Inter, 600, 14px, tracking tight): the product wordmark and card headings that are sentences rather than labels.
- **Readout** (mono, 400, 14px, tabular): live values inside the top-bar stat pill, the map glass chip, and the transport clock.
- **Body** (Inter, 400, 11px / 16px): explanatory prose, empty-state hints, field values. Hints cap at 36–46ch.
- **Label** (Inter, 500, 10px / 14px, uppercase, tracking 0.16em): section labels, chips, buttons. Every button in the console is a label, not a title.

### Named Rules
**The Mono Numeral Rule.** Every number, unit, link ID, coordinate, and clock is Martian Mono with tabular figures. There is no exception for "just one number in a sentence".

**The Written Unit Rule.** A number never ships bare. The unit (dB, mm/jam, GHz, km) is written next to it in Archivo at one step smaller in dim ink. When a quantity is genuinely dimensionless, the unit slot stays empty and the name goes in the label — it is never filled with a letter that could be misread as a unit.

**The Em Dash Rule.** An undefined metric renders as `—`. Never `0`, never `100 %`. Metrics whose type is `number | null` (agreement, correlation, cell hit rate) exist precisely so the null can reach the screen intact.

## Layout

One fixed 1440px desktop screen; there is no mobile layout and no breakpoint work below it. `body` has `overflow: hidden`; only stage content and the right rail scroll. The page is a 12px-inset frame holding a single rounded console shell, and every stage lives inside that shell.

The operating stage is a two-column split with a 16px gutter: an elastic main region (map or comparison) and a fixed **380px right rail**. The rail scrolls as one column rather than each panel scrolling independently, so that at 900px viewport height every panel stays whole instead of three panels each collapsing toward zero. The link-detail panel is pinned to 440px so the rail does not jump when a link is selected or released. Panel *order* is the one thing that moves: when alert candidates are waiting, the catchment panel carrying that decision rises to the top of the rail; otherwise it sits below.

Chrome heights are fixed: 64px top bar, 40px pill groups, 56px transport bar, 40px panel headers, 28px buttons, 32px icon buttons.

Spacing is a 4px rhythm (4 / 8 / 12 / 16 / 24 / 32 / 48). Half-steps (2 / 6 / 10 / 14) exist for dense in-component spacing only and never for layout gutters. The Tailwind spacing and radius scales are declared *outside* `extend`, replacing the defaults, so arbitrary values like `p-[13px]` have no class to compile into — consistency is enforced by configuration, not discipline.

## Elevation & Depth

Hybrid, and strictly rationed. Depth comes first from tonal layering — ground, shell, card, inset, each step darker as it recedes — and second from four shadows that only elements which genuinely float are allowed to use. Every shadow is written in dark blue ink (`rgba(15,32,51,…)`) rather than black, because a black shadow on light paper reads as dirt, and every shadow has both an offset and a spread so the element lifts instead of glowing. Divisions inside a surface are 1px ink hairlines, never a shadow.

### Shadow Vocabulary
- **Card** (`0 1px 2px -1px rgba(15,32,51,0.10), 0 8px 20px -14px rgba(15,32,51,0.28)`): every card and panel.
- **Pill** (`0 1px 2px -1px rgba(15,32,51,0.08)`): an active pill button only.
- **Float** (`0 4px 8px -4px rgba(15,32,51,0.18), 0 24px 48px -24px rgba(15,32,51,0.40)`): elements above the stage.
- **Shell** (`0 2px 6px -3px rgba(15,32,51,0.12), 0 32px 64px -32px rgba(15,32,51,0.34)`): the console window on the sky wash.
- **Glass** (`inset 0 1px 0 rgba(255,255,255,0.95), 0 2px 4px -2px rgba(15,32,51,0.18), 0 12px 28px -18px rgba(15,32,51,0.42)`): the top-edge light catch plus the directional contact shadow that make glass read as glass.
- **State ring** (`0 0 0 3px rgba(<accent>, 0.20–0.22)`): a tight ring around a 6–8px status dot. It is a state marker, not a glow — a soft bloom is invisible on light paper.

### Named Rules
**The Glass-Over-Canvas Rule.** `.glass` may be applied only where a map or a rain-field canvas is physically behind it — today the map stat chip, the rain legend, and the MapLibre zoom control. Over flat colour it is not glass, only blur. The shell and every card are opaque paper. This is the single most abusable class in the system; the audit test is one question: is there a moving canvas behind this element right now?

**The Earned Shadow Rule.** Shadows belong to things that float. A divider inside a card is a 1px hairline. Glows with zero offset, and shadows tinted with an accent colour, do not exist here.

## Shapes

Two rules cover almost everything. **Containers get large corners; triggers get full pills.** Cards and the shell are 14px, glass panels and inner panels 12px, insets and the MapLibre control group 10px, small marks 4px. Nothing exceeds 14px — the radius scale tops out there deliberately, so a container cannot drift into a soft consumer-app blob. Buttons, chips, icon buttons, badges, status dots, meter bars, the scrubber track and thumb are all `9999px`. The tension between square-shouldered containers and fully-round triggers is what gives the console its instrument feel.

Borders are 1px ink hairlines on nearly every surface; glass takes a 1px white border instead, because a highlight is what a lit edge of wet glass actually looks like. Gradients appear in exactly three roles, all of them functional: the sky wash, the low→high error meter, and the rain scale (map, comparison canvases, legend). A gradient that encodes nothing is not part of this language.

## Components

### Buttons
- **Shape:** full pill (`9999px`), 28px tall, 12px horizontal padding, label type (10px uppercase, 0.12em tracking).
- **Ghost (default):** white surface, muted ink label, hairline border. Hover strengthens the border, drops to `surface-2`, and darkens the label to full ink over 150ms.
- **Active:** ink fill, white label, transparent border, pill shadow. Never an accent fill. `aria-pressed` always reflects it.
- **Solid:** ink fill at rest; hover is `text/90`.
- **Danger:** alert at 10% fill, alert-text label, alert border at 45%; hover deepens to 16% fill and 70% border.
- **Disabled:** 40% opacity, not-allowed cursor. No colour change.
- **Icon button:** 32px circle, same ghost/active logic, always with `aria-label` and `title`.

### Chips
- **Style:** pill, 1px border, 2px/8px padding, 10px uppercase label, optional 4px status dot.
- **Tones:** each accent chip is border at 35–40% and fill at 8–10% of the same hue, with the darker `-text` variant for the label. Neutral chips use the plain border tokens with no fill.

### Cards / Containers
- **Corner:** 14px card, 10px inset.
- **Background:** white card on `shell`, inset going darker (`inset`), never lighter.
- **Shadow:** the Card shadow; inner divisions are hairlines.
- **Border:** 1px `border`; insets use `hairline`.
- **Padding:** header 16px top / 20px sides / 12px bottom; panel headers are a fixed 40px row with a hairline bottom rule.

### Navigation
Stage switching is a pill group (`surface-2` with a hairline border) holding three ghost buttons ordered by use — map, comparison, report. The active stage is the ink-filled button. There is no other nav; there is no mobile treatment.

### Timeline (signature)
A 56px full-pill card holding transport, speed, clock, and scrubber. The track is drawn as two layers behind a real `<input type="range">` — base at `text/12`, elapsed at `text/45` — so the control keeps native keyboard and screen-reader behaviour while showing system colour. Elapsed progress is flat ink, not a gradient and not an accent: the timeline is a control, not a measurement. Alert-candidate times appear as 2px alert ticks on the track, and those ticks are explained by a legend in the same bar, because an unexplained red mark only means something to someone already told what it means. The thumb is a 14px white circle with a 3px rain-blue ring.

### Rain Legend (signature)
A 300px glass panel pinned to the bottom-left of the map. Its gradient bar is sampled from the same `rainColor()` function that paints the heatmap and both comparison canvases at 31 stops, so it cannot drift from what it explains. Stops are 0/10/20/35/50/60 mm/jam with the last marked `≥`, and the bar sits on white so that zero reads as genuinely transparent.

### Simulation Badge (signature)
A permanent, non-dismissible pill in signal amber at 10% fill with a status dot and the words DATA SIMULASI, plus an optional normal-case detail after a hairline divider. It is a trust element, not a development label, and no view carrying simulated data ships without it.

### Status Dot
An 8px accent circle with a 3px state ring. Colour is never the sole carrier of meaning — every use writes the status as text alongside it, and the dot itself is `aria-hidden`.

## Do's and Don'ts

### Do:
- **Do** treat `rain` as the inferred weather quantity and `signal` as what the radio measured, and keep `alert` / `ok` for status only.
- **Do** render active state as ink fill on white (`bg-text text-surface`).
- **Do** set every number in Martian Mono with tabular figures and its unit written out beside it.
- **Do** render an undefined metric as `—`, and give any metric that can be undefined a `number | null` type so the null survives to the screen.
- **Do** use `.glass` only when a map or rain-field canvas is behind the element; use opaque `.card` everywhere else.
- **Do** keep layout spacing on the 4px rhythm and reserve 2/6/10/14 for dense in-component spacing.
- **Do** draw internal divisions as 1px ink hairlines and reserve shadows for things that float.
- **Do** make nested surfaces darker than their parent, never lighter.
- **Do** read every rain colour from `rainColor()` in `components/map/colorRamp.ts` so map, comparison, and legend cannot diverge.
- **Do** write section labels as 10px uppercase Archivo at 0.16em tracking, and buttons at 0.12em.
- **Do** keep Indonesian UI copy throughout, including empty and loading states, and write those states seriously.

### Don't:
- **Don't** reintroduce `--violet` or add a fifth hue under any name; if a new state needs distinguishing, use ink, weight, or shape.
- **Don't** apply an alpha modifier to `text-mute`, `text-dim`, `border`, `hairline`, or any surface token — those are plain `var()` strings and the class will vanish silently. Use `text/<n>` instead.
- **Don't** use `.glass` over flat colour, including the shell, cards, dialogs, and the right rail.
- **Don't** exceed a 14px radius on a container or use anything but a full pill on a trigger.
- **Don't** add a decorative gradient, colour blob, or accent-tinted glow; the sky wash, the error meter, and the rain ramp are the only gradients, and all three encode something.
- **Don't** make heavier rain lighter — the ramp must stay monotonic in lightness and alpha in the darker-is-heavier direction.
- **Don't** animate anything that is not actually changing; transitions are 150ms colour on controls and 200ms width on bars, and `prefers-reduced-motion` is honoured globally.
- **Don't** render the same metric in more than two encodings on one screen, or add a stat row that carries no decision.
- **Don't** hide or gate the DATA SIMULASI marker on any simulated-data view.
- **Don't** introduce a new text colour without checking it at ≥ 4.5:1 against all four card grounds.
- **Don't** add an emoji or a decorative icon; every icon in the console draws a real object (towers and a link, a bell, transport glyphs).

<!--
Discrepancy noted against PRODUCT.md, recorded rather than canonized: the map
stat chip in components/Dashboard.tsx renders RMSE as `(metrics?.rmse ?? 0)
.toFixed(2)`, which prints `0.00` when the metric is undefined. The Em Dash Rule
above is the system rule (the top bar and the primitives follow it); the chip is
a defect against it, not a permitted variant, and is not recorded as one.
-->
