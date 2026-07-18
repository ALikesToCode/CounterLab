# Learner UX v6.1 evidence

Recorded: 2026-07-18

Branch: `feat/learner-ux-v6.1`

Starting commit: `13ab87672ecd33345ac0d697a93d121f9603b1aa`

This document separates what is implemented and locally verified from what
still requires a real CloakBrowser session or production qualification. Nothing
in this pass was pushed or deployed. The only external Cloudflare action was an
unauthenticated `wrangler whoami` check; no remote resource was mutated.

## Final interaction model

| Stage      | Primary learner surface                                                                                   | Existing authority consumed                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Question   | Question-first landing, sample prompts, notebook attachment, Notebook Evidence Story, and privacy summary | Artifact Manifest, exact evidence references, support decision, and sanitized packet preview                |
| Prediction | Model Duel and immutable Prediction Seal                                                                  | Learner-confirmed Belief Spec plus the existing categorical prediction/confidence payload                   |
| Test       | Fair Test Builder and learner-language rejected-plan explanation                                          | Public compiler events, fixed candidate scoring, Discrimination Contract, Experiment IR, and verifier state |
| Boundary   | Experiment Theater, Boundary Hunt, full Boundary Map, and exact table                                     | Verified result, Evidence Verdict, fixed map cells, and immutable receipt                                   |
| Apply      | Reflection Builder, TimelineTransfer, or CostTransfer                                                     | Existing revision payload and deterministic Subject Pack transfer evaluator                                 |
| Repair     | RepairPreview, copied-notebook download, learner-first completion, Reasoning Diff, and Proof Capsule      | Verified patch scope and artifact, frozen reasoning lineage, and proof receipt                              |

The six stages are a presentation mapping over the existing validated state
machine. Local Theater views and completed-stage review do not create session
transitions. A result-bearing visual still requires the existing verified
payload.

## Mode separation

| Mode            | Learner promise                                                 | Limits                                                                                       |
| --------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `sample`        | Bundled approved leakage lesson with fixed stored evidence      | No credentials, no new model call, no live-session authority, and no browser-computed metric |
| `live_notebook` | Artifact-specific analyst and runner-backed scientific workflow | Fails closed when required capabilities are missing; live controls remain runner-backed      |
| `replay`        | Read-only reconstruction of stored events and payloads          | Persistent provenance label, no new model call, and no new experiment or repair              |

Milestone 4, the interactive Verified Sample Playground, was intentionally
omitted. The repository did not contain an independently admitted fixed-kernel
fixture authority for the proposed configuration matrix. Hashing a fixture
beside the payload produced by the same generator would be self-authentication,
not independent verification. The sample stays fixed; no browser calculation,
nearest-match behavior, or cross-mode fallback was added.

## Generated, fixed, verified, and learner-owned roles

- GPT-5.6 may propose an evidence-linked Belief Spec from the learner-approved
  sanitized packet. It cannot execute the artifact or decide truth.
- Runtime Codex may propose only the bounded scientific compile artifacts
  `discrimination-contract.json`, `experiment-ir.json`, `lab-scene.json`, and
  display-only `public-rationale.md`. The separate repair turn may produce only
  `patch-plan.json` and `public-rationale.md`.
- The fixed Subject Pack scorer alone determines candidate eligibility and
  selects among registered experiments.
- Fixed kernels compute numerical results, Boundary Map cells, transfer
  outcomes, canonical serialization, and chart-ready payloads.
- The frozen verifier accepts or rejects technical and epistemic authority,
  binds results to UI paths, and releases no result after rejection.
- The learner owns the Question, explanation confirmation, immutable
  Prediction, revision, transfer action, and repair approval.

The UX components translate or disclose these roles; they do not change them.

## Milestone commits

| Milestone | Commit    | Outcome                                                                     |
| --------- | --------- | --------------------------------------------------------------------------- |
| Recovery  | `b4e23ca` | Preserved the pre-v6.1 repository safety changes                            |
| 0         | `273e2b8` | Recorded the screen, state/API, reuse, risk, and ownership map              |
| 1         | `e4ecf9c` | Question-first entry and one canonical progress model                       |
| 2         | `5b66f8d` | Evidence story, privacy summary, Model Duel, and Prediction Seal            |
| 3         | `4018e1e` | Fair Test Builder and Experiment Theater                                    |
| 4         | omitted   | No independently authoritative sample fixture matrix was available          |
| 5         | `827b812` | Verified-cell Boundary Hunt before the full map                             |
| 6         | `b25bc1e` | Reflection, visual transfer, and repair preview                             |
| 7         | `e5816ba` | Learner-first completion, fixed hints, and privacy-safe interactions        |
| 8         | `755f698` | Accessibility/responsive hardening and fail-closed Cloak E2E harness        |
| 9         | `71c5662` | Final interaction, evidence, screenshot, demo, support, and release handoff |

## Local verification evidence

The post-Milestone 9 release audit produced these exact results:

- Web Vitest: 45 files and 254 tests passed.
- Repository, web, and Worker TypeScript checks passed.
- Scientific-engine release verifier: 8/8 passed after refreshing the seven
  learner-surface integrity bindings and canonical snapshot.
- Python kernel: 179/179 passed after the held-out lineage repair.
- Leakage mutations: 13/13 detected; imbalance mutations: 19/19 detected.
- Held-out intake/routing: 10/10; fixed full-loop completion: 7/8. The remaining
  RandomForest case is the intended `PATCH_ESTIMATOR_OUTSIDE_CONTRACT` refusal.
- Held-out Vitest configuration: 2 files and 6 tests passed.
- Local D1 migration application: all six migrations passed, including
  `0006_learner_interactions.sql`.
- Vite/Worker production build passed using a unique repository-local output
  directory and `--emptyOutDir=false`.
- Repository secret scan passed across 598 files; changed-file formatting and
  `git diff --check` passed.
- The Cloak-only Playwright suite statically collected 22 tests from one spec
  file.

The complete root Vitest suite now passes 38/40 files and 465/468 tests. Its
three remaining failures are permission-mode assertions: this managed
filesystem reports requested `000`, `0555`, `0711`, or `0777` modes as `0700`.
The combined Python kernel/runner suite similarly passes 228/231; its three
remaining failures assert the same unavailable mode semantics. Neither result
is represented as a fully green release gate.

The full repository Prettier gate still reports ten pre-existing warnings in
files not changed by this UX branch. The branch-owned baseline document was
formatted; unrelated source was not mechanically rewritten during release
triage.

Held-out testing exposed a version-lineage regression introduced after the last
recorded evidence: current pack versions `2.1.0` and `1.1.0` were checked by the
TypeScript verifier, while the legacy hosted patch adapter still assumed
`2.0.0` and `1.0.0`. New schema-v1 held-out bundles now bind the exact current
pack version. Historical bundles without that field retain their old fallback,
so replay compatibility is preserved. Patch operations, transfer gates, and
verification conditions were not weakened.

## Accessibility and responsive evidence

Implemented and covered by component or static test contracts:

- one desktop and mobile progress model with completed-stage review and focus
  restoration;
- keyboard-operable dialogs, Boundary controls, exact tables, and synchronized
  visual/native transfer controls;
- visible focus, 44 px interactive targets, body/secondary/label type floors,
  non-color state cues, and reduced-motion CSS parity;
- stable lazy proof loading and one expanded local Theater view at a time;
- async result gating and no result animation before verified data;
- static E2E definitions for 1440 × 900, 1280 × 720, 390 × 844, keyboard-only,
  reduced motion, phase refresh, sample, replay, mocked live, unsupported input,
  verifier rejection, transfer failure, successful patch, downloads, and
  horizontal overflow.

Not executed in this pass: zero real browser journeys, screen-reader sessions,
rendered target/type/overflow checks, screenshots, or Web Vitals measurements.
The CloakBrowser CDP endpoint was absent, and the constitution-mandated
`/home/mysterious/.local/bin/cloakbrowser-chromium` executable was not present
when launched. The harness continued to refuse stock Chromium. Historical
production browser evidence does not qualify this branch.

## Deployment status

Wrangler 4.110.0 was executed with `HOME`, `TMPDIR`, XDG paths, npm cache, and
logs redirected inside this repository. `wrangler whoami` reported that this
contained session is not authenticated. `CLOUDFLARE_API_TOKEN`, a current
source-bound qualified runner image, and its qualification receipt were not
available. A local Container-backed dev start also failed closed because this
host cannot create the required Docker bridge interface.

No remote D1 migration, Worker deployment, Container promotion, or production
smoke was executed. Deploying the Worker alone would bypass the repository's
exact-image gate and could publish code expecting migration 0006, so it was not
used as a fallback.

## Privacy-safe learner interaction evidence

The strict interaction union permits only stage entry/completion and elapsed
time, categorical Prediction choice/confidence, fixed hint ID, Boundary Hunt
classification, revision authoring mode, transfer outcome, and patch/Proof
Capsule download actions. Records are append-only and separate from scientific
session and Proof Capsule authority.

Names, raw claims, raw revisions, raw notebook content, raw free text, paths,
credentials, and model reasoning are not fields in the contract. Interaction
recording failure does not advance or invalidate scientific state.

## Build and performance observations

The successful final Milestone 8 build reported:

| Artifact                       |         Raw |      Gzip |
| ------------------------------ | ----------: | --------: |
| Worker bundle                  | 1,620.27 kB | 313.05 kB |
| Client CSS                     |   183.23 kB |  34.45 kB |
| Lazy Reasoning Diff JavaScript |     7.99 kB |   2.67 kB |
| Lazy Reasoning Diff CSS        |     1.98 kB |   0.79 kB |
| Main client JavaScript         |   610.83 kB | 170.71 kB |

The Reasoning Diff is now a lazy chunk, and the main client decreased from the
previous 615.07 kB observation to 610.83 kB. The build still emits the warning
for a JavaScript chunk above 500 kB. Runtime performance and Core Web Vitals
were not measured.

## Remaining qualification work

- Execute the 22 journeys through an available CloakBrowser CDP endpoint at all
  three viewports, including keyboard, reduced motion, refresh, screen-reader
  names, downloads, and no-overflow assertions.
- Capture the planned screenshots only from the exact qualified source.
- Re-run the six permission-mode assertions on a filesystem that preserves
  POSIX modes; keep them as release blockers here rather than weakening the
  credential and runner boundaries.
- Provide a repository-contained Cloudflare authentication session or
  `CLOUDFLARE_API_TOKEN`, plus a current source-bound qualified runner image and
  receipt.
- Run the clean-clone, complete release, exact-image, deployment, and production
  smoke gates. Do not infer them from the local component/build evidence.
- Revisit the Verified Sample Playground only after an independently admitted,
  versioned fixture authority exists.
- Physics/free-fall and learner-impact evaluation remain outside this UX pass.
