# Learner UX v6.1 evidence

Recorded: 2026-07-18

Branch: `feat/learner-ux-v6.1`

Starting commit: `13ab87672ecd33345ac0d697a93d121f9603b1aa`

This document separates what is implemented and locally verified from what
still requires a real CloakBrowser session or production qualification. Nothing
in this pass was pushed, deployed, or used to mutate an external service.

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

| Milestone | Commit                    | Outcome                                                                     |
| --------- | ------------------------- | --------------------------------------------------------------------------- |
| Recovery  | `b4e23ca`                 | Preserved the pre-v6.1 repository safety changes                            |
| 0         | `273e2b8`                 | Recorded the screen, state/API, reuse, risk, and ownership map              |
| 1         | `e4ecf9c`                 | Question-first entry and one canonical progress model                       |
| 2         | `5b66f8d`                 | Evidence story, privacy summary, Model Duel, and Prediction Seal            |
| 3         | `4018e1e`                 | Fair Test Builder and Experiment Theater                                    |
| 4         | omitted                   | No independently authoritative sample fixture matrix was available          |
| 5         | `827b812`                 | Verified-cell Boundary Hunt before the full map                             |
| 6         | `b25bc1e`                 | Reflection, visual transfer, and repair preview                             |
| 7         | `e5816ba`                 | Learner-first completion, fixed hints, and privacy-safe interactions        |
| 8         | `755f698`                 | Accessibility/responsive hardening and fail-closed Cloak E2E harness        |
| 9         | this documentation commit | Final interaction, evidence, screenshot, demo, support, and release handoff |

## Local verification evidence

Milestone 8 ended with these exact results:

- Web Vitest: 45 files and 254 tests passed.
- Repository, web, and Worker TypeScript checks passed.
- Vite/Worker production build passed using a unique repository-local output
  directory and `--emptyOutDir=false`.
- Repository secret scan passed across 597 files.
- `git diff --check` and shell syntax validation passed.
- The Cloak-only Playwright suite statically collected 22 tests from one spec
  file.
- Invoking the browser harness without `CLOAK_CDP_ENDPOINT` exited with status 1
  and reported: `CLOAK_CDP_ENDPOINT is required; stock Chromium is forbidden.`

After adding the Milestone 9 documentation, the final secret scan passed across
598 repository files. The repository, web, and Worker TypeScript checks, web
Vitest (45 files/254 tests), documentation formatting, `git diff --check`, and
the Vite/Worker build were also rerun successfully against the final
documentation state.

An earlier full root Vitest attempt was not green: 33 files and 439 tests passed,
while 7 files and 29 tests failed. Observed failure categories included sandbox
isolation, loopback `EPERM`, runtime/mode assumptions, Codex child-process
requirements, and truthful release-source drift. That result is not represented
as a release pass.

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
The CloakBrowser CDP endpoint was absent, and the harness correctly refused to
launch stock Chromium. Historical production browser evidence does not qualify
this branch.

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
- Investigate and close the full-root Vitest failures or document approved
  environment-specific exclusions in the release process.
- Run the clean-clone, complete release, exact-image, deployment, and production
  smoke gates. Do not infer them from the local component/build evidence.
- Revisit the Verified Sample Playground only after an independently admitted,
  versioned fixture authority exists.
- Physics/free-fall and learner-impact evaluation remain outside this UX pass.
