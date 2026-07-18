---
version: alpha
name: CounterLab Monochrome Instrument
description: A black-first scientific workspace built from one white, one black, neutral depth, precise interface typography, and scarce evidence-state accents. The interface keeps one learner action dominant while technical authority stays available through progressive disclosure.

colors:
  canvas: "#000000"
  surface: "#0a0a0a"
  surface-soft: "#141414"
  control: "#202020"
  ink: "#fafafa"
  ink-soft: "#a1a1a1"
  line: "#262626"
  line-strong: "#3d3d3d"
  primary: "#fafafa"
  primary-active: "#cfcfcf"
  on-primary: "#090909"
  verified: "#2ec4a0"
  verified-soft: "rgba(46, 196, 160, 0.14)"
  prediction: "#e0b356"
  prediction-soft: "rgba(224, 179, 86, 0.13)"
  replay: "#a79bff"
  replay-soft: "rgba(167, 155, 255, 0.13)"
  danger: "#e5484d"
  danger-soft: "rgba(229, 72, 77, 0.13)"
  focus: "#91b7ff"

typography:
  display:
    fontFamily: "Instrument Sans Variable, Avenir Next, sans-serif"
    fontSize: 64px
    fontWeight: 560
    lineHeight: 1.02
    letterSpacing: -2.4px
  heading:
    fontFamily: "Instrument Sans Variable, Avenir Next, sans-serif"
    fontSize: 36px
    fontWeight: 560
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
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.secondary}"
    padding: "{spacing.lg}"
  evidence-sidebar-item:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-soft}"
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

CounterLab should feel like a precise scientific instrument, not an agent dashboard and not a light product with dark paint applied. The learner works on a true-black field. Near-black surfaces, hairline gray borders, disciplined spacing, and high-contrast sans typography establish depth without card clutter or decorative glow.

White belongs to the dominant learner action. Blue is limited to the keyboard focus indicator. Gold marks what the learner committed, aqua marks what fixed computation verified, purple labels replay authority, and red appears only for rejected invariants or contradicted expectations. Semantic color never decorates unsupported claims.

## Layout

- Keep one dominant action in the main Experiment Theater.
- Use one compact project-and-evidence rail on desktop. Do not show a permanent agent cockpit.
- Keep Activity and Evidence & proof collapsed until the learner opens them or compilation needs attention.
- Cards use sober 10–18 px geometry, fine borders, and shallow shadows. Avoid a wall of floating cards.
- Preserve a minimum 15 px body, 13 px secondary text, 12 px labels, and 44 px interactive targets.
- At 900 px and below, remove the persistent rail and let the learner canvas own the viewport.
- At 390 px, stack quantitative comparisons and keep all tables or code excerpts scrollable within their own bounds.

## Components and states

- Primary buttons are rectangular white controls with black text and a 44 px minimum height. Pills are reserved for status.
- Evidence cards pair a plain-language statement with an adjacent source reference; they do not decorate unsupported claims.
- Verified seals use aqua only after technical and epistemic verification.
- Prediction locks use gold and remain visibly immutable after commitment.
- Rejected states use red without learner-blaming language and release no result.
- The proof drawer contains schemas, events, hashes, command summaries, and verifier details. It is not the primary workspace.
- Focus uses a high-contrast three-pixel ring with spacing from the component edge.

## Motion

Use 160–240 ms opacity and transform transitions for drawers, focus changes, and stage entry. Preserve layout dimensions while loading. Disable nonessential motion for `prefers-reduced-motion` and never animate a result before signed data is available.

## Inspiration synthesis

- **Apple** informs the black field, exact type hierarchy, generous negative space, and preference for one obvious action.
- **Vercel** informs monochrome surfaces, fine borders, compact geometry, white primary actions, and technical clarity without dashboard density.
- **ChatGPT** informs the calm conversational entry and centered composer, without turning the scientific workflow into an unstructured chat transcript.
- **ClickHouse** informs the use of real computed values and code-shaped evidence as visual proof, never abstract AI decoration.

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
