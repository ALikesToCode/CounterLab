# Task Plan: CounterLab v5.1 Scientific Engine Edition

## Goal

Transform the proven CounterLab Studio release into a scientific debugger for
beliefs with versioned scientific contracts, fixed experiment selection,
epistemic verification, signed Boundary Maps, one reviewed free-fall Subject
Pack, Proof Capsule v2, and a simpler chat-first product—without weakening live
authority, replay compatibility, fixed kernels, or existing verifiers.

## Current phase

Phases 10 and 14 — the complete local v5 result, browser belief, transfer,
interactive, and patch authority pass for both hosted ML Subject Packs. The
Worker paths now reach immutable copied patches after fixed verification, with
the leakage path also exercising a genuine reject-repair. Boundary Map,
Reasoning Diff v2, and Proof Capsule v2 are active
(`in_progress`). The current public deployment remains the qualified Experiment
Plan v2 path until this compatibility-preserving upgrade passes focused tests
and a new production smoke.

## Lead-owned critical surfaces

- repository architecture and phase order;
- root `AGENTS.md` and shared contracts;
- session state machine and D1 migrations;
- Worker routes and runner orchestration;
- Subject Pack and scientific-engine registries;
- Experiment IR, canonical hashes, and production deployment;
- integration, release claims, final results, and factual documentation.

Parallel work may inspect or change only explicitly delegated, independent
surfaces. No parallel edits to shared schemas, state, Worker session logic,
migrations, orchestration, deployment configuration, registries, canonical hash
code, `apps/web/src/App.tsx`, or global CSS.

## Phase order

### Phase 0 — clean checkpoint and factual baseline

- [x] Read required repository and release documents.
- [x] Inspect Git state, history, runtimes, tests, metrics, and incomplete work.
- [x] Run the current non-destructive baseline suite.
- [x] Record factual baseline and create the pre-v5.1 checkpoint commit.
- **Status:** complete

### Phase 1 — public production authority gate

- [x] Audit `/ready`, deployment/image binding, D1 migrations, and secret-safe
      capability reporting.
- [x] Prove live leakage and imbalance end to end.
- [x] Prove cursor reconnect, cancellation, duplicate-job idempotency, artifact
      and proof downloads, and public-event sanitization.
- [x] Make `scripts/production-smoke.sh` emit a secret-free JSON stage report.
- **Status:** complete

### Phase 2 — install and propagate v5.1 constitution

- [x] Merge the complete v5.1 execution constitution into root `AGENTS.md`.
- [x] Update decisions, upgrade plan, support contract, diagrams, vocabulary,
      and release checklist without deleting legacy contracts.
- **Status:** complete

### Phase 2A — scientific-engine registry and dependency governance

- [x] Add registry schema/package, canonical hash, policy, fixtures, licenses,
      notices, and reviewed registry entries for engines already in use.
- [x] Add admission, health, import, integrity, license, SBOM, vulnerability,
      size, and drift verification.
- [x] Add `scripts/verify-scientific-engines.sh` and release integration.
- **Status:** complete; the qualified local image and current production Proof
  Bundle authority binding are recorded separately from Cloudflare's registry
  digest.

### Phase 3 — Belief Spec v2

- [x] Add strict `BeliefSpecV2`, v1 adapter, evidence/non-claim validation, and
      learner decisions.
- **Status:** complete in contracts, analyst, and session core; hosted primary
  flow migration remains part of Phases 7–9.

### Phase 4 — CounterLab Experiment IR v5

- [x] Add strict package/schema/types/canonical hash/policy/migration.
- [x] Preserve current Experiment Plan and replay through parity-tested adapters.
- **Status:** complete as a shared package; the public runner still consumes the
  qualified v2 projection until the hosted integration slice passes.

### Phase 5 — fixed experiment-selection scorer

- [x] Add deterministic eligibility, separation, complexity, tie-breaking,
      public selection evidence, and mutation coverage.
- **Status:** complete as fixed code for both released ML packs; hosted invocation
  is in progress.

### Phase 6 — epistemic verifier and tri-state verdict

- [x] Add independent findings, `SUPPORTS | INCONCLUSIVE | REJECTED`, release
      blocking, and one mutation per finding.
- **Status:** complete in the frozen verifier with leakage and imbalance
  coverage; the v5 Worker now binds result release to this report.

### Phase 7 — Runtime Codex v5 artifacts

- [x] Restrict live output to discrimination contract, IR, scene, rationale, and
      post-transfer Patch Plan with two repairs and no hidden/manual edits.
- [x] Reconstruct all compile inputs and raw/canonical outputs at the terminal
      callback before recording verified lineage.
- [x] Dispatch the selected v5 experiment to the fixed runner without a second
      Codex turn or an early `result.ready` event.
- [x] Verify the returned fixed result epistemically and persist the tri-state
      verdict before the Worker emits result readiness.
- **Status:** complete locally. Commit `36d8157` closes runner writes before
  verification, freezes result bytes, persists the fixed reports/verdict, and
  makes result readiness a Worker-owned event. Production promotion remains
  deferred until downstream v5 lineage passes.

### Phase 8 — entity-leakage integration

- [x] Add candidate experiments, scorer contract, and epistemic mappings while
      preserving v1.
- [x] Execute the selected group-holdout experiment through the versioned fixed
      Python boundary with exact fixture authority.
- [x] Add tri-state result persistence while preserving v1.
- [x] Render exact v2 belief authority after refresh and route the released v5
      result through the fixed forecasting transfer evaluator.
- [x] Bind fixed interactive controls to frozen v5 compile/result authority
      without replacing the authoritative Evidence Verdict.
- [x] Carry the frozen v5 authority through Patch Plan rejection/repair, scoped
      source release, exact callback hashes, and an immutable copied patch.
- [ ] Add a signed recurrence/signal Boundary Sweep
      and mutations while preserving v1.
- **Status:** in progress; compile, fixed execution, and tri-state release are
  integrated, browser belief/transfer/interactive authority passes, and the
  leakage patch reaches `PATCH_VERIFIED`. Native proof and Boundary Map stages
  are not yet released.

### Phase 9 — class-imbalance integration

- [x] Add candidate experiments, scorer contract, and tri-state mappings.
- [x] Add a direct versioned run-envelope test and Worker tri-state persistence.
- [x] Reject forged fixture summary, kernel version, and seed authority before
      result release.
- [x] Render exact v2 belief authority after refresh and route the released v5
      result through the fixed manufacturing-defect transfer evaluator.
- [x] Bind threshold/prevalence controls to the same frozen v5 authority and
      fixed kernel without a model call.
- [x] Run the strict v5 imbalance patch bundle through the full Worker
      candidate/callback/frozen-download boundary.
- [ ] Add the prevalence/threshold Boundary Sweep and mutations.
- **Status:** in progress; versioned compile, fixed run, browser
  belief/transfer/interactive authority, and the full frozen patch callback now
  pass for the pack. Proof and Boundary stages remain pending.

### Phase 10 — Boundary Map engine

- [ ] Add bounded fixed-kernel contract, deterministic hash/signature, typed
      renderer, accessible table, visual binding, and mutation tests.
- **Status:** pending

### Phase 11 — chat-first product and Experiment Theater

- [ ] Incrementally introduce conversation intent, one learner vocabulary,
      progressive disclosure, and focused Theater without breaking resume.
- **Status:** pending

### Phase 12 — typed generative UI v2

- [ ] Add allowlisted `LabSceneV2`, signed result bindings, copy policy, and
      fail-closed unknown blocks.
- **Status:** pending

### Phase 13 — physics/free-fall Subject Pack

- [ ] Admit reviewed SciPy/Pint/SymPy/Hypothesis engines only after registry and
      ML production gates pass.
- [ ] Add fixed kernel, independent oracles, convergence, units, signed motion,
      Boundary Map, transfer, and mutations.
- **Status:** pending

### Phase 14 — Proof Capsule v2

- [x] Preserve own `__proto__` keys without changing historical normal vectors.
- [x] Make integer-like and Unicode key ordering cross-runtime deterministic.
- [ ] Bind the explicit canonical profile into new Capsule authority.
- [ ] Add deterministic `.counterlab` archive, CLI validate/inspect/replay,
      corruption/mode tests, engine provenance, and v1 compatibility.
- **Status:** pending

### Phase 15 — shareable challenge

- [ ] Add no-account validated-capsule challenge only after the core gates pass.
- **Status:** pending

### Phase 16 — Judge Mode

- [ ] Add `/judge`, signed labelled replay default, genuine live option,
      achieved evidence, failures, capsule download, and reproduction.
- **Status:** pending

### Phase 17 — learner pilot

- [ ] Keep paired crossover tooling; record real consented rows or explicitly
      retain `EVALUATION PENDING`.
- **Status:** pending

### Phase 18 — measured performance

- [ ] Add Web Vitals/bundle budgets, route lazy loading, abort/idempotency, and
      measured local/live timing with no fake ETA.
- **Status:** pending

### Phase 19 — accessibility and browser quality

- [ ] Execute mobile/tablet/desktop, keyboard, focus, reduced-motion, tables,
      async refresh, duplicate-click, and production journeys.
- **Status:** pending

### Phase 20 — demo, release, and submission

- [ ] Run full/fresh-clone/release/production gates, generate achieved evidence,
      complete under-three-minute demo assets, record `/feedback`, deploy, and
      report exact results and limitations.
- **Status:** pending

## Architecture decisions

| Decision | Rationale |
| --- | --- |
| Preserve the current Worker/D1/R2/Container control and runner planes | They already passed real live leakage and imbalance release evidence. |
| Keep existing v1/v2 plans, replay, and hashes through adapters | Historical evidence must never be rewritten in place. |
| Test first for every behavior change | New authority boundaries need proof the regression test can fail. |
| Register mature engines instead of reimplementing them | CounterLab owns epistemic authority, not general scientific solvers. |
| Keep renderers non-authoritative | Smooth visuals cannot decide scientific evidence. |
| Fail closed when a phase gate is not satisfied | Physics, challenges, and claims are omitted rather than simulated. |

## Delegation ledger

| Workstream | Scope | Shared critical files | Status |
| --- | --- | --- | --- |
| Production authority audit | Read-only routes, smoke, runner capability audit | none | complete; lead findings recorded |
| Scientific engine candidate audit | Official docs, versions, licenses, deployment implications | none | complete; lead findings recorded |
| UX/accessibility baseline audit | Read-only product and browser-test audit | none | complete; lead findings recorded |

## Errors encountered

| Error | Attempt | Resolution |
| --- | ---: | --- |
| Existing planning files described the completed pre-v5 Studio upgrade | 1 | Rebased the persistent plan on the v5.1 phase order; prior history remains in Git. |
| First combined planning-file patch used the wrong historical `progress.md` heading | 1 | Read the exact headings and split the updates by file. |
| Combined runner-job, Worker API, and D1 repository read exceeded the response budget | 1 | Use bounded symbol searches and reads of at most 200 lines. |
| R2 readiness probe branch was missing one closing brace | 1 | Focused API rerun passed, then 173 root + 82 web tests and typecheck passed. |
| Metrics collection with the system Python could not import scikit-learn | 1 | Re-ran with the repository's locked `.venv/bin/python`; current metrics were generated from the fixed kernels and verifier. |

## Operating notes

- Re-read this file before architecture, dependency, deployment, or release
  decisions.
- Update `findings.md` after every two inspection/research actions.
- Update `progress.md` after each test, commit, phase, or error.
- Review every delegated patch and integrate one independent workstream at a
  time.
