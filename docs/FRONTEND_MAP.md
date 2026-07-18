# CounterLab Frontend Map

Updated: 2026-07-19

## Stack and entry

The browser application lives in `apps/web`.

| Concern                 | Source                                  |
| ----------------------- | --------------------------------------- |
| HTML shell              | `apps/web/index.html`                   |
| React entry             | `apps/web/src/main.tsx`                 |
| Root state machine      | `apps/web/src/App.tsx`                  |
| Route parser            | `apps/web/src/app/AppRouter.ts`         |
| Studio shell            | `apps/web/src/app/CounterLabStudio.tsx` |
| Typed API client        | `apps/web/src/api.ts`                   |
| Sample fixtures         | `apps/web/src/sample.ts`                |
| Global design system    | `apps/web/src/styles.css`               |
| Studio chrome           | `apps/web/src/styles/studio.css`        |
| Product design contract | `DESIGN.md`                             |

The stack is Vite, React, strict TypeScript, and plain CSS. CounterLab does not use Tailwind or a component library. Components use semantic HTML, global classes for legacy screens, and co-located CSS Modules for newer surfaces.

## Route map

Routing is deliberately small and implemented in `AppRouter.ts` rather than a router package.

| Route          | Surface                                     | Authority                       |
| -------------- | ------------------------------------------- | ------------------------------- |
| `/`            | Chat-first Question composer and entry rail | Entry only                      |
| `/judge`       | Judge Mode evidence dossier                 | Read-only product evidence      |
| `/new`         | Live capability setup                       | Live eligibility only           |
| `/session/:id` | Active learner journey                      | Mode-specific session authority |
| `/replay/:id`  | Hosted Proof Capsule replay                 | Persistently labelled replay    |
| `/proof/:id`   | Completed-session proof view                | Stored session evidence         |

`App.tsx` synchronizes the parsed route with browser history and owns the learner state machine. It keeps sample, replay, and live paths separate.

## Shell map

`CounterLabStudio.tsx` wraps post-entry learner screens. It owns the project/evidence trigger, command palette, and collapsed proof drawer. It does not become a permanent agent cockpit.

| Component                                  | Responsibility                                               |
| ------------------------------------------ | ------------------------------------------------------------ |
| `components/studio/ProjectSidebar.tsx`     | Recent projects, evidence cells, and project commands        |
| `components/studio/CommandPalette.tsx`     | Keyboard command surface                                     |
| `components/studio/ProofConsole.tsx`       | Activity, plan, diff, tests, verifier, and provenance drawer |
| `components/studio/GeneratedProofView.tsx` | Sanitized compiler-event timeline and generated proof scene  |

## Learner journey map

The primary journey is Question, Prediction, Test, Boundary, Apply, Repair.

| Component                                      | Stage or responsibility                                   |
| ---------------------------------------------- | --------------------------------------------------------- |
| `components/learner/QuestionComposer.tsx`      | Plain-language Question and optional notebook attachment  |
| `components/learner/NotebookEvidenceStory.tsx` | Sanitized notebook evidence and source references         |
| `components/learner/PrivacyPacketSummary.tsx`  | Exact model packet preview and exclusions                 |
| `components/learner/ModelDuel.tsx`             | Two competing hypotheses and learner confirmation         |
| `components/learner/PredictionSeal.tsx`        | Immutable prediction and confidence lock                  |
| `components/learner/FairTestBuilder.tsx`       | Why this test, controls, compile events, and verification |
| `components/learner/ExperimentTheater.tsx`     | Signed result, exploration, Boundary, and Apply theater   |
| `components/learner/LearnerProgress.tsx`       | Six-stage progress and review navigation                  |
| `components/learner/LearnerCoach.tsx`          | Progressive-disclosure next-step rationale                |
| `components/learner/NeedAHint.tsx`             | Optional evidence-linked hint                             |
| `components/learner/ReflectionBuilder.tsx`     | Structured learner revision                               |
| `components/learner/TimelineTransfer.tsx`      | Entity-leakage transfer exercise                          |
| `components/learner/CostTransfer.tsx`          | Class-imbalance transfer exercise                         |
| `components/learner/RepairPreview.tsx`         | Bounded repair scope and preserved behavior               |
| `components/learner/LearnerCompletion.tsx`     | Reasoning change, transfer status, and proof actions      |

`App.tsx` also contains the top-level screen orchestration for landing, Question, Prediction, Test, live setup, live compilation, entity-leakage reality, and class-imbalance reality. These screens compose the learner components above rather than duplicating their authority.

## Experiment and lesson map

| Component                                       | Responsibility                                         |
| ----------------------------------------------- | ------------------------------------------------------ |
| `features/boundary/BoundaryStage.tsx`           | Runner-backed Boundary job and signed-map reveal       |
| `features/boundary/BoundaryHunt.tsx`            | Learner classification before signed-map reveal        |
| `components/generative-ui/BoundaryMapBlock.tsx` | Keyboard-accessible signed Boundary Map and data table |
| `components/lesson/InteractiveImbalanceLab.tsx` | Threshold, prevalence, metric, and verified readout    |
| `components/lesson/ImbalanceTransferLesson.tsx` | Manufacturing-defect transfer and patch unlock         |
| `components/lesson/ImbalancePatchReview.tsx`    | Repair trace, diff, invariants, and downloads          |

## Proof and replay map

| Component                                        | Responsibility                                       |
| ------------------------------------------------ | ---------------------------------------------------- |
| `components/proof/ReasoningDiffView.tsx`         | Before/after reasoning ledger and authority hashes   |
| `components/proof/DeferredReasoningDiffView.tsx` | Lazy loading and failure recovery for Reasoning Diff |
| `components/proof/ProofCapsuleView.tsx`          | Proof Capsule v2 identity, integrity, and export     |
| `components/proof/ReplayPublicationPanel.tsx`    | Replay publication and link copy                     |
| `components/replay/ProofCapsuleReplayView.tsx`   | Read-only replay from Question through Repair        |
| `features/judge/JudgeModeView.tsx`               | Public evidence dossier and honest mode entry points |

## State and event support

| Source                                    | Responsibility                                       |
| ----------------------------------------- | ---------------------------------------------------- |
| `hooks/useRunnerEvents.ts`                | Sanitized runner event stream and reconnect behavior |
| `hooks/runnerCheckpoint.ts`               | Repository-defined local runner checkpoint           |
| `hooks/useRecentProjects.ts`              | Recent-session navigation data                       |
| `hooks/useLearnerStageTiming.ts`          | Learner-stage timing evidence                        |
| `features/learner/subjectPackHints.ts`    | Subject Pack-specific hint copy                      |
| `features/learner/interactionEvidence.ts` | Learner interaction evidence helpers                 |

## Styling ownership

| Surface                                                                          | Stylesheet                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Root tokens, resets, header, landing, legacy stages, lesson and transfer screens | `src/styles.css`                                                                |
| Project rail, proof drawer, palette, studio canvas                               | `src/styles/studio.css`                                                         |
| Learner components                                                               | Co-located `components/learner/*.module.css`                                    |
| Boundary components                                                              | Co-located `features/boundary/*.module.css` and `BoundaryMapBlock.module.css`   |
| Proof and replay                                                                 | Co-located `components/proof/*.module.css` and `components/replay/*.module.css` |
| Judge Mode                                                                       | `features/judge/JudgeModeView.module.css`                                       |

All hardcoded hexadecimal colors are declared once in the `:root` token block in `styles.css`. Component styles consume those variables. Scoped Judge and Theater variables alias the same global tokens.

## Visual contract

- Canvas: true black.
- Surfaces: near-black layers separated by gray hairlines, not card shadows.
- Primary action: white background with black text.
- Type: Instrument Sans for display and interface; monospace only for proof, hashes, units, and labels.
- Verified: restrained aqua.
- Prediction: restrained gold.
- Replay: restrained purple.
- Rejected: red only.
- Focus: visible blue ring, independent of semantic state.
- Result animation: never begins before signed data exists.

## Responsive and accessibility contract

- Body text remains at least 15 px; secondary text at least 13 px; labels at least 12 px.
- Interactive targets remain at least 44 px.
- The main journey completes at 390 px without page-level horizontal overflow.
- Tables and code excerpts scroll within their own bounds.
- Keyboard focus remains visible on every interactive control.
- Quantitative visuals retain accessible tables.
- `prefers-reduced-motion` disables nonessential transitions.
- Activity and Evidence & proof remain collapsed by default.

## Verification

Run from `apps/web`:

```bash
pnpm build
pnpm typecheck
pnpm test
```

Browser qualification must use the repository-configured CloakBrowser path and repository-local runtime directories. A missing CloakBrowser or unavailable container runtime is a blocker, not permission to substitute stock Chromium.
