---
version: alpha
name: CounterLab Evidence Instrument
description: A calm scientific workspace that pairs a warm learner canvas with deep-navy evidence chrome, editorial conclusions, precise interface typography, and scarce semantic accents. The interface keeps one learner action dominant while technical authority stays available through progressive disclosure.

colors:
  canvas: "#f3f1eb"
  surface: "#ffffff"
  surface-soft: "#f7f8fa"
  ink: "#07152a"
  ink-soft: "#4c5d73"
  night: "#061326"
  night-raised: "#0d2038"
  on-night: "#f4f8fb"
  on-night-muted: "#a7b7c9"
  primary: "#245eea"
  primary-active: "#143d9d"
  on-primary: "#ffffff"
  verified: "#007a78"
  verified-soft: "#dff6f2"
  prediction: "#955f00"
  prediction-soft: "#fff1ca"
  danger: "#b5363a"
  danger-soft: "#fbe8e7"
  focus: "#1d4ed8"

typography:
  display:
    fontFamily: "Newsreader Variable, Iowan Old Style, Georgia, serif"
    fontSize: 64px
    fontWeight: 520
    lineHeight: 1.02
    letterSpacing: -2.4px
  heading:
    fontFamily: "Newsreader Variable, Iowan Old Style, Georgia, serif"
    fontSize: 36px
    fontWeight: 520
    lineHeight: 1.12
    letterSpacing: -1px
  title:
    fontFamily: "Instrument Sans Variable, Avenir Next, sans-serif"
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.2px
  body:
    fontFamily: "Instrument Sans Variable, Avenir Next, sans-serif"
    fontSize: 15px
    fontWeight: 450
    lineHeight: 1.6
    letterSpacing: 0
  secondary:
    fontFamily: "Instrument Sans Variable, Avenir Next, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0
  label:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, ui-monospace, monospace"
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 1px
  proof:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, ui-monospace, monospace"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.55
    letterSpacing: 0

rounded:
  control: 10px
  card: 14px
  panel: 18px
  pill: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 64px

components:
  learner-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "{spacing.xxl}"
  evidence-sidebar:
    backgroundColor: "{colors.night}"
    textColor: "{colors.on-night}"
    typography: "{typography.secondary}"
    padding: "{spacing.lg}"
  evidence-sidebar-item:
    backgroundColor: "{colors.night-raised}"
    textColor: "{colors.on-night-muted}"
    typography: "{typography.secondary}"
    rounded: "{rounded.control}"
    padding: "{spacing.md}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "{spacing.xl}"
  card-title:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
  secondary-copy:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.secondary}"
  section-label:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
  proof-drawer:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.proof}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "{spacing.md} {spacing.lg}"
    height: 44px
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.on-primary}"
  focus-ring:
    backgroundColor: "{colors.focus}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
  verified-seal:
    backgroundColor: "{colors.verified-soft}"
    textColor: "{colors.verified}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
  prediction-lock:
    backgroundColor: "{colors.prediction-soft}"
    textColor: "{colors.prediction}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
  rejection-state:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.secondary}"
    rounded: "{rounded.card}"
---

# CounterLab Evidence Instrument

## Direction

CounterLab should feel like a precise scientific instrument, not an agent dashboard. The learner works on a warm, quiet canvas while provenance and fixed-system evidence sit in deep-navy chrome. Editorial serif type is reserved for questions, predictions, and conclusions; interface sans carries actions and explanations; monospace identifies evidence, units, hashes, and verifier state.

The memorable moment is the transition from a sealed Prediction to a verified Test: gold marks what the learner committed, aqua marks what fixed computation verified, and the result stays absent until signed data arrives. Blue belongs to the current learner action. Red appears only for rejected invariants or contradicted expectations.

## Layout

- Keep one dominant action in the main Experiment Theater.
- Use one compact project-and-evidence rail on desktop. Do not show a permanent agent cockpit.
- Keep Activity and Evidence & proof collapsed until the learner opens them or compilation needs attention.
- Cards use sober 10–18 px geometry, fine borders, and shallow shadows. Avoid a wall of floating cards.
- Preserve a minimum 15 px body, 13 px secondary text, 12 px labels, and 44 px interactive targets.
- At 900 px and below, remove the persistent rail and let the learner canvas own the viewport.
- At 390 px, stack quantitative comparisons and keep all tables or code excerpts scrollable within their own bounds.

## Components and states

- Primary buttons are rectangular blue controls with a 44 px minimum height. Pills are reserved for status.
- Evidence cards pair a plain-language statement with an adjacent source reference; they do not decorate unsupported claims.
- Verified seals use aqua only after technical and epistemic verification.
- Prediction locks use gold and remain visibly immutable after commitment.
- Rejected states use red without learner-blaming language and release no result.
- The proof drawer contains schemas, events, hashes, command summaries, and verifier details. It is not the primary workspace.
- Focus uses a high-contrast three-pixel ring with spacing from the component edge.

## Motion

Use 160–240 ms opacity and transform transitions for drawers, focus changes, and stage entry. Preserve layout dimensions while loading. Disable nonessential motion for `prefers-reduced-motion` and never animate a result before signed data is available.

## Inspiration synthesis

- **Sentry** informed the decisive dark/light authority split and technical-console cadence. CounterLab removes the mascots, neon palette, and cockpit density.
- **Notion** informed sober rectangular controls, warm workspace surfaces, and 12–14 px card geometry. CounterLab keeps its own editorial serif and scientific semantics.
- **ClickHouse** informed the use of real computed values and code-shaped evidence as the visual proof, never abstract AI decoration. CounterLab uses aqua and gold rather than an electric-yellow identity.
- **Ferrari** supplied the contrast reference: generous restraint, modest display weight, and one scarce high-energy accent. CounterLab mutates that restraint into an evidence-first education surface without automotive imagery or branding.

## Do

- Show the real Question, Prediction, Test, controls, observable, and signed outcome.
- Make evidence provenance available without forcing it into the learner's primary reading path.
- Use spacing and typography before adding color or shadow.
- Keep mode labels persistent and honest.
- Keep quantitative visuals paired with accessible tables.

## Do not

- Do not create a permanent multi-agent cockpit.
- Do not use decorative gradient blobs, glass-card walls, or generic AI illustrations.
- Do not shrink labels below 12 px or secondary copy below 13 px.
- Do not use red to judge a learner.
- Do not imply live authority for sample or replay evidence.
