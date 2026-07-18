# Learner UX v6.1 baseline

Recorded: 2026-07-18

## Recovery checkpoint

| Field                | Recorded value                                         |
| -------------------- | ------------------------------------------------------ |
| Repository root      | `/home/mysterious/storage/github/CounterLab`           |
| Starting commit      | `13ab87672ecd33345ac0d697a93d121f9603b1aa`             |
| Working branch       | `feat/learner-ux-v6.1`                                 |
| Preservation commit  | `b4e23cab432d4c7a6924bf2c6b19b6ebe336990a`             |
| Initial working tree | Modified `AGENTS.md`; untracked `COUNTERLAB_REPO_ROOT` |
| Preserved change     | Repository-only filesystem boundary and root marker    |
| Initial secret scan  | Passed across 536 repository files                     |

The logical checkout path `/home/mysterious/github/CounterLab` resolves to the
physical Git root above. All work in this pass uses the physical root.

## Reference status

The following required references were read in full before this map was
written:

- `DESIGN.md`;
- `README.md`;
- `docs/PROGRESS.md`;
- `docs/AUTHORITY_BOUNDARIES.md`;
- `docs/RELEASE_CHECKLIST.md`.

The following named references are absent from the current tree and all local
Git history:

- `CounterLab_Learner_Centered_UX_Audit_v6.md`;
- `CounterLab_Learner_Interaction_Spec_v6.md`;
- `CounterLab_Learner_Experience_Prototype_v6.html`.

The supplied v6.1 milestone specification, `DESIGN.md`, existing tested
behavior, and authority contracts are therefore the available design authority.
This pass must not claim pixel parity with the missing prototype.

## Current screen inventory

| Route or state | Current learner surface                                                                     | Existing strength                                                         | v6.1 issue                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/`            | Mode-led hero, sample answer preview, three-step explanation, repeated sample/replay cards  | Honest sample/live/replay entry points and support note                   | The question is not primary, the central sample result is spoiled, and Judge Mode competes above the fold                |
| `/new`         | Live capability check                                                                       | Honest unavailable state                                                  | Operational capability appears before the learner frames a Question                                                      |
| `claim`        | Notebook evidence card, upload, support decision, claim form, optional raw sanitized packet | Exact cells, support refusal, file integrity, read-never-run copy         | Evidence, claim, upload, support limits, and privacy approval compete for attention                                      |
| `belief`       | Two hypotheses, evidence chips, intervention, confirmation, Prediction form                 | Evidence-linked alternatives and immutable Prediction API                 | The confirmation and Prediction beats form one long screen; learner-facing copy still exposes legacy contract vocabulary |
| `live-compile` | Public compiler trace plus auto-open proof console                                          | Sanitized reconnectable events                                            | Technical events are duplicated instead of translated into one learner-facing fair-test story                            |
| `build`        | Static four-check summary and reveal action                                                 | Result remains behind a learner action                                    | Copy says the result is ready before `/lab/run` returns `EXPERIMENT_COMPLETED`                                           |
| `reality`      | Result, exploration, Boundary, revision, transfer, patch, completion                        | Verified-only values, deterministic transfer, patch lock, Proof artifacts | Boundary, Apply, and Repair are compressed into one long screen family                                                   |
| `/replay/:id`  | Legacy replay intro or read-only Proof Capsule replay                                       | Persistent provenance and no new model call                               | Must stay separate from mutable sample/live presentation controls                                                        |
| `/proof/:id`   | Restored completed session in the Reality surface                                           | Exact persisted authority                                                 | No distinct learner-first completion shell                                                                               |
| `/judge`       | Evidence-first Judge Mode                                                                   | Honest mode distinctions and limits                                       | Keep as a secondary header action, not the primary learner entry                                                         |

## Duplicate navigation inventory

Five learner-progress presentations currently coexist:

1. the landing page's three-step explanation;
2. the top Header's four-step rail;
3. screen-local `Step n of 4` labels;
4. the Studio sidebar's six learner stages;
5. the Judge and replay six-stage rails.

On mobile the six-stage sidebar disappears, leaving the four-stage Header rail.
In the mutable flow, Boundary, Apply, and Repair all map to the same `reality`
review target. Completed-stage review is therefore not actually stage-specific.

## Canonical learner progress

One exported definition must own these labels and their order:

```text
Question -> Prediction -> Test -> Boundary -> Apply -> Repair
```

The presentation position is derived from existing state; it does not create a
second session state machine.

| Learner stage | Existing UI/state inputs                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Question      | `landing`, `live-setup`, `claim`, `INGESTED`                                                     |
| Prediction    | `belief`, `BELIEF_TEST_PROPOSED`, `BELIEF_TEST_CONFIRMED`                                        |
| Test          | `build`, `live-compile`, `PREDICTION_COMMITTED`, `LAB_COMPILING`, `LAB_REJECTED`, `LAB_VERIFIED` |
| Boundary      | `reality`, `EXPERIMENT_COMPLETED`, `BOUNDARY_VERIFIED`                                           |
| Apply         | `REVISION_RECORDED`, `TRANSFER_IN_PROGRESS`, `TRANSFER_FAILED`                                   |
| Repair        | `TRANSFER_PASSED`, every `PATCH_*` state, `REASONING_DIFF_ISSUED`, `PROOF_CAPSULE_ISSUED`        |

`TRANSFER_PASSED` means Apply is complete and Repair is current. The active
stage and the set of reviewable completed stages must remain separate values.

## Component reuse and state/API mapping

| Learner component       | Reused evidence or state                                                         | Existing action/API                           | Authority guard                                                                         |
| ----------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `LearnerProgress`       | UI stage plus `SessionView.state`                                                | None                                          | One shared mapper; completed review is read-only                                        |
| `LearnerCoach`          | Current `LearningGuide` copy                                                     | None                                          | Compact next action; rationale only in disclosure                                       |
| `NotebookEvidenceStory` | `ArtifactView.cells`, metric candidates, support reasons, schema summary, hashes | `uploadArtifact`, `getArtifact`               | A live session never receives bundled sample results                                    |
| Privacy summary         | `BeliefAnalysisPreview`                                                          | `previewBeliefAnalysis`, existing proposal    | Summary first; exact sanitized JSON remains reviewable                                  |
| `ModelDuel`             | `sessionBeliefPresentation`, evidence references, conditions, non-claims         | `confirmBeliefTest`, `respondToBeliefTest`    | Ask whether wording captures the learner's view, never which hypothesis is correct      |
| `PredictionSeal`        | Existing categorical choice, confidence, persisted `session.prediction`          | `commitPrediction`                            | Preserve payload and immutability; no result beforehand                                 |
| `FairTestBuilder`       | `PublicCompilerEvent`, `RunnerJob`, existing event sanitizer                     | `compileLab`, reconnect/cancel, `runLab`      | Translate only events that occurred; no private reasoning or static verification claims |
| `ExperimentTheater`     | Authorized `verifiedResult`, verdict, exact tables, current interactive labs     | Existing sample lookup or live runner actions | Local views never alter session state and never invent values                           |
| `ReflectionBuilder`     | Existing revision string                                                         | `recordRevision`                              | Clause builder and free text serialize to the same ungraded payload                     |
| `TimelineTransfer`      | Existing leakage split/risk choices                                              | `submitTransfer`                              | Visual and native controls share one state and identifiers                              |
| `CostTransfer`          | Existing imbalance strategy/risk/evidence choices                                | `submitTransfer`                              | Matrix is explanatory; fixed evaluator is unchanged                                     |
| `RepairPreview`         | Registered expected patch scope                                                  | `compilePatch`                                | UI preview cannot authorize or validate a patch                                         |
| `LearnerCompletion`     | Reasoning Diff, patch and Capsule receipts/downloads                             | Existing download URLs                        | Capability first; hashes and limitations remain in Evidence & proof                     |
| `NeedAHint`             | Fixed Subject Pack copy and evidence reference                                   | No model call                                 | Deterministic, non-authoritative, and non-answer-leaking                                |

## Authority and product risks

### High

- `ReviewScreen` currently receives `session?.verifiedResult ?? sampleResult`.
  A live session without an authorized result can therefore display bundled
  sample metrics during review. Remove this cross-mode fallback.
- `BuildScreen` statically announces that a result and four checks are complete
  before fixed execution returns `EXPERIMENT_COMPLETED`. Derive learner copy
  from real state and public events.
- Six learner labels currently collapse to four review targets. Boundary,
  Apply, and Repair need distinct read-only review identities without changing
  the server state machine.
- Interaction events occurring after Proof Capsule issuance must not mutate the
  completed authoritative evidence chain. Any UX telemetry must be separate,
  bounded, and privacy-safe.

### Medium

- The landing sample preview reveals the answer before Prediction.
- Live compile information is duplicated in the main canvas and proof drawer.
- Large guides, introductions, progress, sidebar, and proof controls create
  several simultaneous hierarchies.
- Leakage replaces screens while imbalance appends every later stage to one
  page; they need a common presentation shell.
- Current copy says `Prediction contradicted` or `Headline contradicted`; use
  hypothesis/evidence language without judging the learner.
- `App.tsx` has 4,441 lines, `styles.css` 6,343, and `studio.css` 819. Parallel
  edits to these shared integration surfaces are unsafe.
- The absent v6 reference files may contain details that cannot be recovered.

### Accessibility, responsive, and QA gaps

- Existing Playwright covers 390 x 844 but not explicit 1440 x 900 or
  1280 x 720 journeys.
- Refresh is not exercised at every asynchronous phase.
- There are no rendered computed-style assertions for 44 px targets or the
  12/13/15 px type minima.
- No automated contrast or Web Vitals harness exists.
- Stable loading geometry, local-control latency, no-model-call control checks,
  mocked verifier rejection, and final-page overflow need dedicated journeys.

## Verified sample preparation

The current sample session supports only `leakage-01`. It has no mutable
controls; imbalance controls are live-only, and the interactive API correctly
rejects non-live authority. The smallest safe playground is therefore a
build-time fixture plus exact browser-local lookup, not a new sample endpoint.

- Leakage fixture matrix: three registered designs at test fractions 20%, 25%,
  and 30% (nine exact configurations).
- Imbalance fixture matrix: thresholds 0.15, 0.25, and 0.35 by observed/rarer
  prevalence and recall/precision focus (12 exact configurations).
- Reuse `deriveInteractivePlanV5`, the fixed Python kernels, existing result
  schemas, and existing independent interactive/hosted verification.
- Bind configuration, selected run, complete result, configuration/result
  hashes, kernel and verifier provenance, and a top-level fixture-integrity
  hash under `counterlab-canonical-json-v1`.
- Unknown or corrupted configurations fail closed. There is no nearest match,
  browser metric calculation, API/model call, session-result mutation, live
  fallback, or replay interactivity.
- A complete imbalance sample journey is explicitly outside this isolated
  slice because current sample session, transfer, patch, and proof semantics
  register leakage only.

## File ownership plan

| Owner              | Exclusive scope                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead               | `App.tsx`, global routing/state, `CounterLabStudio`, global CSS, API/Worker interaction telemetry, shared contracts, package/lock files, fixture registries, release scripts, root documentation, integration and commits |
| Learner components | New isolated files under `apps/web/src/components/learner/` and `apps/web/src/features/learner/`, colocated module styles and tests; never `App.tsx`                                                                      |
| Sample playground  | Isolated generator/fixture/eval files assigned after the fixture audit; no kernel, formula, scorer, verifier, endpoint, or session-semantic change                                                                        |
| Boundary Hunt      | New Hunt files and explicitly assigned Boundary presentation files; no Boundary computation, hashes, receipts, or verifier changes                                                                                        |
| Accessibility      | Exact isolated test or component files assigned after integration; no global CSS rewrite                                                                                                                                  |
| Browser QA         | New Playwright learner files and helpers; existing authority journey remains an independent regression                                                                                                                    |
| Documentation      | Draft learner copy/evidence only; lead integrates root docs                                                                                                                                                               |

No two agents may edit the same file, shared state, CSS entry point, fixture
registry, or test file. Subagents do not commit.

## Integration sequence

1. Establish the shared stage mapper and one progress surface.
2. Correct mode/result leakage and pre-execution copy before visual expansion.
3. Add isolated learner components, then integrate them in `App.tsx` one
   milestone at a time.
4. Keep sample lookup, live runner work, and replay reconstruction visibly and
   technically separate.
5. Run focused tests after each change, inspect the complete diff, run affected
   regressions, and create one local milestone commit.
