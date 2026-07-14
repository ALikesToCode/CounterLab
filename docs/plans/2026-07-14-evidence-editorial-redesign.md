# CounterLab evidence-editorial redesign

## Goal

Make the judged path feel like a distinctive education product whose value is
understood before the first click. The interface must show that CounterLab does
more than explain: it converts a claim into an immutable prediction, a
discriminating intervention, a verified result, a transfer check, and finally a
bounded repair.

## Direction

The visual language is a forensic lab notebook crossed with a premium code
review. Marketing and proof-preview surfaces use a near-black navy canvas. The
learning workflow flips to a bright, gridded evidence canvas. This two-polarity
system makes the transition from promise to work visible while preserving the
product semantics defined in `AGENTS.md`:

- Navy owns system evidence and authority.
- Blue owns learner actions and current progress.
- Purple owns hypotheses and transfer.
- Aqua owns verified computation.
- Gold owns immutable prediction and the patch gate.
- Red appears only for rejected invariants or contradicted expectations.

The product uses Newsreader Variable for editorial claims and Instrument Sans
Variable for interface text. Monospace labels identify evidence, hashes, stages,
and provenance. Animation is limited to the opening proof instrument and obeys
the existing reduced-motion contract.

## Product-specific signature

The landing hero contains a real verified sample payload rather than an abstract
illustration. It shows the learner claim, sealed prediction, random-row metric,
customer-group metric, overlap counts, canonical result hash, kernel version,
seed, and mutation result. A five-node proof spine then explains Formalize,
Commit, Discriminate, Verify, and Transfer.

Every learning screen includes a guide with three stable questions:

1. What do you know?
2. What is still unknown?
3. What is your next move?

This guidance must never reveal experimental results before the Prediction
Contract is committed.

## Interaction principles

- One dominant learner action per stage.
- Technical proof is available through progressive disclosure, not hidden.
- Generated work never presents itself as authoritative; verifier state is
  visually and semantically separate.
- Replay status remains globally visible and unique.
- Unsupported inputs receive an actionable honest refusal, not a vague error or
  fabricated generic lab.
- Mobile layouts recompose dense evidence rather than shrinking it. Tables and
  diffs scroll inside their own containers.

## Inspiration synthesis

- Sentry informed the strong dark/light polarity, developer-console cadence,
  and rare high-energy verification accent.
- Superhuman informed the editorial type compression, restrained CTA hierarchy,
  and premium dark-to-light page rhythm.
- ClickHouse informed the decision to show real product data and code-shaped
  evidence in the hero rather than generic education illustration.

No brand assets, logos, or proprietary visual identity were copied. CounterLab's
semantic palette, proof flow, evidence instrument, and learning guidance are
specific to this product.

## Verification

- Strict web and Worker TypeScript typecheck.
- Web Vitest contract/component suite.
- CloakBrowser Playwright judged path at desktop and 390px mobile.
- Keyboard-only completion and reduced-motion behavior.
- Contrast tests for primary semantic text colors.
- Direct screenshot review of Landing, Claim, Belief Test, Build/Verify, and
  Reality/Transfer.
