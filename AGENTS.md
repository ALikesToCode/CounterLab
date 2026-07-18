# CounterLab AGENTS.md — Prize-One Constitution v5.1 — Scientific Engine Edition

This repository constitution supersedes earlier CounterLab scope instructions,
including v5. Preserve replay compatibility and proven implementation, but
resolve product, authority, vocabulary, scientific-engine, and sequencing
conflicts in favor of this file.

## Repository filesystem safety boundary — highest priority

A prior agent operation destroyed the owner's home-directory contents. This
must never happen again. The following boundary is non-negotiable and overrides
any conflicting workflow, tool, deployment, or cleanup instruction in this
file:

- Treat `/home/mysterious/storage/github/CounterLab` as the only permitted
  filesystem scope for repository work.
- Never read, enumerate, search, create, edit, copy, move, delete, archive,
  extract, change permissions on, or otherwise operate on files or directories
  outside this repository. In particular, never target `$HOME`,
  `/home/mysterious`, a parent directory, another checkout, or `/tmp`.
- Run repository commands with the working directory set to the repository root
  or one of its descendants. Scope searches and file operations to `.` or an
  explicitly verified descendant of the repository root.
- Before any file-affecting command, verify that every explicit and expanded
  path remains inside the repository. Reject paths that escape through `..`,
  symlinks, globs, environment-variable expansion, command substitution,
  archives, or tool defaults.
- Do not run broad or destructive cleanup commands. Any deletion must be
  explicitly requested by the owner, limited to named in-repository targets,
  and preceded by a containment check.
- Keep temporary files, caches, generated credentials, browser profiles, build
  output, and tool state inside the repository. Do not install packages or
  tools globally and do not permit package managers, test runners, browsers, or
  deployment tools to mutate paths outside the repository.
- Invoking an already-installed executable outside the repository is permitted
  only when required, but all file inputs, outputs, configuration, caches,
  profiles, and other filesystem side effects must remain inside the repository.
- If a required action cannot be completed within this boundary, stop and ask
  the owner. Never broaden the filesystem scope by assumption.

## Mission

Build **CounterLab**, a scientific debugger for beliefs.

> **CounterLab compiles a learner’s claim into competing executable models,
> finds the smallest experiment that can distinguish them, refuses weak
> evidence, reveals the boundary where each model works, verifies transfer, and
> only then unlocks repair.**

Product line:

> **Ask like chat. Prove it like science.**

Closing line:

> **Chatbots explain. CounterLab lets reality answer.**

CounterLab is not a generic tutor, arbitrary simulator, notebook copilot,
unrestricted code generator, or mastery grader. It is an evidence-producing
workflow with explicit authority boundaries.

## Working agreement

- Read this file before changing code.
- Inspect the repository, Git status, existing evidence, tests, and current
  deployment state before editing.
- Preserve useful implementation, replay compatibility, mutation tests,
  held-out cases, user changes, and truthful claims.
- Prefer small, independent, reviewable commits. Stage and verify only the
  intended slice before each commit.
- Use the configured user Git identity; never commit as Codex.
- Do not stop after planning. Implement, test, repair, document, and leave the
  repository runnable.
- Ask only for missing credentials, destructive actions, external writes, or a
  genuine scope decision.
- The owner explicitly authorizes this agent to run repository builds, local
  development services, CloakBrowser/browser automation, Cloudflare deployment,
  production smoke tests, and the release commands needed to verify CounterLab.
  This supersedes earlier instructions that required asking the owner to start
  or authorize those surfaces. Keep every action non-destructive, record only
  outcomes that occurred, stop temporary local services after verification, and
  still ask before missing-credential, destructive, or scope-expanding work.
- Run the smallest relevant verification after each logical change and the
  broader relevant suite before final handoff.
- Never claim a deployment, test, learner result, performance result, model
  call, or verifier outcome that did not occur.
- Never substitute sample or replay authority for live authority.
- Keep `docs/PROGRESS.md`, `docs/DECISIONS.md`, and
  `docs/RELEASE_CHECKLIST.md` factual and current.
- Do not leave TODO markers, placeholder routes, dead controls, fake timers,
  fake metrics, canned live results, hidden manual repair, or unlabelled replay.
- When live capability is unavailable, fail clearly and preserve honest sample
  and replay paths. Never pretend a fallback was live.
- Use CloakBrowser at `/home/mysterious/.local/bin/cloakbrowser-chromium` for
  Chromium-based Playwright and browser automation unless a task explicitly
  requires another browser.

## Prize-one scope and sequencing

Work in this order unless repository evidence proves a hard dependency requires
an adjustment. Do not weaken an earlier gate to advance a later one.

### P0 — production truth

Before product expansion:

- deploy the current Worker/Container release;
- complete untouched live entity-leakage and class-imbalance flows;
- verify event reconnect, patched-artifact download, Proof Capsule export, and
  no-secret behavior;
- execute browser journeys;
- record deployment evidence.

### P0.5 — scientific-method core

Add and integrate across both existing ML Subject Packs:

- `BeliefSpec`;
- `DiscriminationContract`;
- versioned CounterLab Experiment IR;
- fixed candidate-experiment scorer;
- epistemic verifier;
- tri-state `SUPPORTS | INCONCLUSIVE | REJECTED` Evidence Verdict;
- “Why this test?”;
- one signed Boundary Map;
- Proof Capsule v2.

Do not weaken existing fixed kernels, technical verifiers, replay evidence, or
mutation suites while introducing the new contracts.

### P1 — product experience

Add:

- a chat-first front door;
- one learner vocabulary: Question, Prediction, Test, Boundary, Apply, Repair;
- a calm conversation surface;
- a focused Experiment Theater;
- collapsed Activity and Evidence & proof drawers;
- stable, accessible, responsive UI;
- Judge Mode.

### P1.5 — one cross-domain proof

Add exactly one verified non-ML Subject Pack:

- `physics/free-fall`.

It must include a fixed kernel, analytic and numerical checks, drag/vacuum
controls, prediction, signed animated result, Boundary Map, deterministic
transfer, mutations, and Proof Capsule.

### P2 — impact

- paired crossover learner pilot;
- immediate conditional transfer;
- delayed transfer when feasible;
- a shareable no-account challenge only after the scientific core is stable.

## Explicit cuts

Do not build these before submission unless every earlier gate is green:

- arbitrary subject generation or “all STEM” claims;
- probability as a third verified Subject Pack;
- accounts, authentication, multi-tenancy, or social profiles;
- full classroom, instructor dashboard, LMS, gradebook, or certificates;
- public leaderboards or marketplace;
- voice or native mobile apps;
- screenshot intake, generic `.py` support, arbitrary datasets, or arbitrary
  package installation;
- arbitrary generated React, CSS, HTML, JavaScript, SQL, shell, or Python;
- multi-model voting or model fusion;
- ChatGPT App integration;
- a global mastery graph;
- high-stakes grading, diagnosis, proctoring, hiring scores, or authorship
  detection;
- unlabelled replay or a staged verifier failure presented as live.

## Library-first scientific-engine policy

Do not reinvent mature scientific libraries.

> **Reuse mature engines. Wrap them in bounded adapters. Verify their outputs
> independently.**

CounterLab’s originality is not a new ODE solver, symbolic algebra system,
chemistry toolkit, graph library, or physics renderer. Its original system is:

- competing-model construction;
- discriminating experiment selection;
- epistemic verification;
- tri-state evidence;
- Boundary Maps;
- transfer;
- verified repair;
- Proof Capsules.

### Required role separation

Every Subject Pack explicitly declares:

- authoritative solver;
- reference oracle;
- unit validator;
- renderer;
- property-test generator;
- optional secondary comparator.

No engine may silently occupy more than its declared roles. A renderer, game
engine, visualization library, LLM, or optional comparator is never
authoritative by default. The Subject Pack manifest and Proof Capsule record the
role assignment and exact engine versions.

### Initially approved candidates

- NumPy, SciPy, and scikit-learn for fixed numeric computation;
- `scipy.integrate.solve_ivp` for ODEs;
- `scipy.constants` for recorded constants;
- Pint for unit validation;
- SymPy for symbolic or analytic references;
- Hypothesis for property-based tests;
- Vega-Lite or the existing typed renderer for charts;
- Rapier only as optional browser interaction, rendering, or comparison;
- NetworkX for future reviewed graph Subject Packs.

Approval here permits evaluation, not automatic production installation. Add a
candidate to the production dependency set only when a shipped, reviewed
Subject Pack needs its declared role and all admission gates pass.

Future chemistry architecture may evaluate RDKit, 3Dmol.js, and Cantera. They
must not enter the current production dependency set without a shipped reviewed
Subject Pack and explicit owner approval.

### Scientific-engine admission rules

Before a scientific engine becomes authoritative, reference, validation,
rendering, property-test, or comparison infrastructure, record and verify:

- exact pinned version and package integrity;
- official source;
- license and required attribution;
- lockfile entry and integrity record;
- no floating CDN or runtime-fetched executable asset;
- no runtime model-selected dependency;
- no network requirement in authoritative execution;
- bounded, schema-validated inputs;
- CPU, wall-clock, memory, process, and output limits;
- deterministic behavior or a documented numerical tolerance profile;
- independent validation appropriate to its role;
- upgrade drift and regression tests;
- SBOM inclusion;
- Proof Capsule provenance.

Dependency upgrades are evidence changes. Re-run the pack’s oracle, invariant,
convergence, mutation, Boundary Map, transfer, and golden tests before accepting
an upgrade. Never update a scientific engine solely to silence a version
warning.

### Validation hierarchy

Prefer independent evidence in this order when applicable:

1. analytic or exact oracle;
2. dimensional analysis;
3. conservation law or invariant;
4. numerical convergence;
5. metamorphic or property-based tests;
6. frozen golden benchmarks;
7. cross-implementation comparison.

Cross-library agreement alone is not proof. Two implementations can share the
same assumption, convention, data source, or bug.

### Chemistry safety boundary

Any future chemistry Subject Pack must be curated and non-hazardous. Do not
provide synthesis planning, dangerous laboratory instructions, unrestricted
reaction search, or operational advice involving hazardous chemicals.

## Learner vocabulary and compatibility

The primary learner journey uses only:

1. **Question** — the claim or uncertainty to investigate.
2. **Prediction** — the learner’s immutable pre-result expectation and
   confidence.
3. **Test** — the smallest verified discriminating experiment.
4. **Boundary** — where the supported pattern changes or stops applying.
5. **Apply** — deterministic transfer to a surface-different case.
6. **Repair** — a minimal verified correction unlocked after transfer.

User-facing scientific artifacts are:

### Belief Spec

A learner-confirmed claim plus two primary competing hypotheses, artifact
evidence when available, uncertainty, alternatives, and applicability
conditions.

### Why this test?

A plain-language explanation of why the selected intervention separates the
competing hypotheses while holding relevant controls fixed.

### Verified Test

A lab that passed named technical and epistemic checks for a documented scope.

### Evidence Verdict

Exactly one of:

- `SUPPORTS` — the verified result matches a declared decisive pattern and
  names the supported hypothesis and bounded claim;
- `INCONCLUSIVE` — the result is valid but cannot discriminate within the
  declared thresholds or supported patterns;
- `REJECTED` — the proposed test, binding, or evidence failed verification and
  releases no authoritative result.

Never label the learner wrong. A surprising result updates the comparison
between hypotheses; it is not a judgment of the learner.

### Boundary Map

A signed, deterministic sweep showing where the relevant outcome changes across
Subject Pack-defined conditions.

### Reasoning Diff

Before/after belief, prediction, evidence, boundary condition, transfer action,
and repair.

### Proof Capsule

Portable machine-readable evidence and replay metadata. It does not certify
global mastery.

Legacy names may remain in stored replay and API compatibility layers:

- `BeliefTest` maps to `BeliefSpec`;
- `PredictionContract` maps to Prediction;
- `Verified Lab` maps to Verified Test;
- `ProofBundle` v1 maps into Proof Capsule v2;
- `Concept Pack` maps to Subject Pack.

Do not silently rewrite historical hashes or replay payloads. New primary UI and
new contracts use the v5 vocabulary.

## Authority boundaries

### GPT-5.6 reasoning analyst

May:

- route intent;
- read sanitized artifact evidence;
- propose a schema-valid Belief Spec;
- propose candidate experiments from the selected Subject Pack;
- draft plain-language explanations;
- explain signed outcomes.

Must never:

- execute user artifacts;
- compute authoritative results;
- choose a final experiment without fixed validation and scoring;
- decide verification;
- grade transfer;
- fabricate result values or unsupported artifact content;
- declare mastery.

Use the official JavaScript/TypeScript SDK and Responses API-compatible
interface. `OPENAI_MODEL` defaults to `gpt-5.6` and
`OPENAI_REASONING_EFFORT` defaults to `medium`. When `OPENAI_BASE_URL` is set,
use it server-side without exposing or hardcoding provider identity in product
copy, browser state, evidence, or logs. Keep `OPENAI_API_KEY` server-side. Use
structured output, local Zod validation, evidence resolution, `store: false`
where supported, bounded requests, and a privacy-preserving safety identifier.

Send only the exact sanitized packet preview approved for the request: relevant
cell excerpts and hashes, output/metric evidence, schema summary, learner claim,
support status, and stable Subject Pack rules. Never send raw rows, secrets,
local paths, or unrelated notebook content.

### Runtime Codex compiler

May create or repair only:

```text
generated/<session-id>/
  discrimination-contract.json
  experiment-ir.json
  lab-scene.json
  public-rationale.md
  patch-plan.json
```

Only typed JSON plans are authoritative. `public-rationale.md` and
`lab-scene.json` are display descriptions and never determine pass/fail or
numerical truth.

Codex must never:

- see hidden verifier source, mutations, held-out fixtures, unrelated files, or
  secrets;
- implement metric, scoring, split, or physics formulas;
- author unrestricted UI or executable source code;
- install packages or access the network;
- modify fixed kernels, scorers, verifiers, or transfer evaluators;
- decide final validity.

Use Codex App Server over stable `stdio` JSONL in the critical path. Perform the
required initialize/initialized handshake, validate runtime messages, sanitize
public events, and keep experimental transports and capabilities out unless
separately justified and tested. Permit at most two repairs after the initial
attempt. A first-attempt pass is valid; never inject a bug for theater.

Stage any required process credential through a private bounded launch
boundary, remove it after initialization, and never include it in generated
command environments, public events, or persisted browser-visible state.

### Fixed Subject Pack scorer

Owns:

- candidate eligibility;
- required controls and one-variable-change enforcement;
- discrimination margin;
- complexity and resource cost;
- deterministic tie-breaking;
- selection evidence;
- inconclusive thresholds.

GPT-5.6 or Codex may propose candidates. Only this scorer may select the final
candidate, and only from pack-registered operations.

### Fixed kernels

Own all numerical truth, preprocessing and split primitives, metric formulas,
physics integration, chart-ready data, canonical serialization, Boundary Map
cells, and transfer scoring.

### Frozen verifier

Owns technical validity, epistemic validity, result-to-UI binding,
reproducibility, mutation detection, and patch scope. It runs outside the
model-visible workspace. Model-authored public rationale or diagnostics are
never final authority.

### Learner

Owns claim framing, hypothesis confirmation, Prediction, revision, transfer
action, and patch approval. Never reduce the learner to clicking Accept.

## Architecture and execution boundary

Preserve the proven architecture unless evidence justifies a migration:

- Vite + React + strict TypeScript for the product surface;
- Cloudflare Worker as the control plane;
- D1 for sessions, jobs, and append-only evidence events;
- private R2 for uploaded artifacts, patched copies, and Proof Capsules;
- Durable Object plus Cloudflare Container runner for process-capable work;
- Python, pandas, NumPy, and scikit-learn for fixed ML kernels;
- bounded scientific-engine adapters registered by Subject Pack and role;
- SciPy, Pint, and fixed analytic references for the `physics/free-fall`
  kernel, once their admission gates pass;
- Zod plus generated JSON Schema for shared contracts;
- Vitest, Pytest, and Playwright with CloakBrowser for verification.

The hosted public path never executes arbitrary model-authored Python. Codex
produces bounded plans; fixed interpreters compose allowlisted operations. The
existing adapter-code compiler and stored reject-repair replay may remain as a
clearly separated advanced local proof, but cannot provide live hosted
authority.

Runner jobs, signed one-job tokens, optimistic transitions, callback
idempotency, bounded retries, timeouts, sanitized cursor-based event streams,
and typed errors remain mandatory. A rejected or failed compiler job releases no
lab result.

## Mode separation

Modes are a discriminated union and have separate authority:

- `sample` — bundled approved lesson evidence, clearly labelled;
- `replay` — reconstruction of actual stored events, labelled on every screen,
  with no new model call;
- `live_notebook` — artifact-specific live analysis and hosted runner work;
- `guided_lab` — a fixed Subject Pack experience without arbitrary artifact
  intake;
- `challenge` — a shareable read-only or no-account transfer challenge.

No mode may silently fall back to or borrow authority from another. Route-level
validation and regression tests must prevent mode leakage.

## Supported artifact contract

Live ML notebook support remains narrow and explicit:

- Jupyter `nbformat` 4;
- maximum size defined once and documented in
  `docs/SUPPORT_CONTRACT.md`;
- the documented Python/scikit-learn patterns for entity leakage and class
  imbalance;
- code, markdown, and sanitized text/JSON outputs;
- a learner-supplied Question.

Intake treats notebooks as untrusted data and never executes cells. It must
sanitize or omit HTML, JavaScript, SVG, widgets, and active content; hash the
file, cell sources, and accepted outputs; extract exact evidence references; and
return typed support decisions.

Reject or mark unsupported:

- unsupported magics;
- opaque custom binaries;
- active embedded content;
- corrupted JSON or invalid notebook versions;
- oversized notebooks;
- required external network calls;
- unknown packages or arbitrary installation;
- missing evidence needed for a supported Belief Spec;
- unsupported estimators or patch shapes.

`physics/free-fall` is a guided fixed Subject Pack, not evidence that arbitrary
physics notebooks or all STEM subjects are supported.

## Scientific-method contracts

### BeliefSpec

The versioned schema must include:

- a stable ID and session/Subject Pack provenance;
- learner Question or claim;
- exactly two primary competing hypotheses;
- predicted qualitative outcomes for each hypothesis;
- resolved evidence references when an artifact exists;
- plausible alternatives;
- uncertainty, limitations, and insufficiency state;
- applicability conditions;
- required learner confirmation.

Unresolved or irrelevant evidence, invented execution results, and unsupported
claims invalidate the Belief Spec.

### DiscriminationContract

The versioned contract must record:

- the two hypotheses;
- the intervention;
- changed variable;
- controlled variables;
- observable and unit;
- decisive patterns for each hypothesis;
- inconclusive conditions and thresholds;
- candidate score breakdown;
- plain-language “Why this test?”;
- Subject Pack and artifact provenance.

### CounterLab Experiment IR

The IR:

- is schema-versioned and rejects unknown fields;
- contains registered operation IDs, never formulas;
- contains no literal verified result values;
- contains no arbitrary commands, imports, code, SQL, shell, or network action;
- contains no raw paths outside approved artifact tokens;
- records hypotheses, predictions, intervention, controls, observables,
  decisive patterns, inconclusive conditions, Boundary Map sweep, transfer, and
  provenance;
- fails closed on unknown operations;
- resolves every evidence and result binding;
- has deterministic canonical JSON and a canonical hash.

Validate the same schema in TypeScript and Python before execution.

### Candidate experiment scorer

The fixed scorer first applies hard eligibility gates, then ranks eligible
candidates using pack-versioned weights for:

- expected discrimination;
- control completeness;
- observable validity;
- intervention minimality;
- complexity and runtime cost;
- boundary value;
- transfer relevance.

Scores and tie-breaks are reproducible and included in evidence. The scorer
cannot use model confidence as numerical truth and cannot inspect hidden
outcomes.

## Epistemic verifier rules

Reject when:

- hypotheses are not meaningfully separable;
- more than the declared variable changes;
- required controls are absent;
- the selected observable cannot distinguish the hypotheses;
- decisive patterns or inconclusive thresholds are missing;
- result bindings are unresolved;
- the result falls outside supported patterns without an inconclusive state;
- claims exceed the experiment or Boundary Map;
- the UI implies global truth, causality beyond the experiment, or mastery;
- a visual or explanation disagrees with the signed payload.

A rejected test releases no experimental result. A valid but non-discriminating
outcome produces `INCONCLUSIVE`, not a forced winner.

## Boundary Map rules

- Axes and units come from the Subject Pack allowlist.
- The grid is bounded by pack-defined limits.
- The fixed kernel owns every cell.
- Labels and units are fixed or validated.
- Model-authored formulas and literal grids are forbidden.
- The same input, seed, pack version, and kernel version produce the same hash.
- Visual blocks bind to signed result paths.
- Mutations cover swapped axes, frozen values, mislabeled legends, incorrect
  units, stale bindings, and nondeterminism.
- Cryptographically signed maps require the configured signing key. Without a
  key, label output integrity-hashed and do not claim the signed-map release
  gate passed.

## Subject Pack requirements

### Entity leakage

Preserve and generalize the existing deterministic fixture, notebook support,
fixed kernel, verifier, transfer, patcher, held-out variants, and replay.

Required fixed operations include random-row split, group holdout,
identity-feature ablation, entity-overlap calculation, and controlled
model/preprocessing comparison. The Boundary Map sweeps allowlisted test
fraction and repeated-entity conditions while keeping model and preprocessing
controlled. Displayed metrics always come from the fixed kernel.

The transfer remains a surface-different time-ordered forecasting case with
future leakage. A patch may unlock only after deterministic transfer and must
operate on a copy, use group-aware evaluation, remove identity where required,
and preserve unrelated cells.

### Class imbalance and metric choice

Preserve and generalize the existing rare-event fixture, notebook support,
fixed kernel, verifier, transfer, patcher, held-out variants, and replay.

Required fixed operations include majority baseline, stratified holdout,
confusion matrix, precision, recall, F1, PR-AUC, contextual ROC-AUC, threshold
sweep, and prevalence sweep with fixed conditional behavior. The Boundary Map
sweeps allowlisted threshold and prevalence axes. Confusion totals, prevalence,
threshold response, metric identity, result hashes, and patch scope remain
independently verified.

The transfer remains a surface-different rare manufacturing defect case with
changed prevalence and asymmetric false-negative cost.

### Physics/free-fall

Implement one fixed guided Subject Pack with:

- allowlisted inputs such as height, gravitational field, mass, drag mode, drag
  coefficient, cross-sectional area, air density, and fixed numerical-step
  choices;
- the analytic vacuum solution as the primary reference oracle;
- `scipy.integrate.solve_ivp` as the numerical trajectory solver;
- `scipy.constants` for recorded constants where appropriate;
- Pint as the unit validator at pack and kernel boundaries;
- SymPy only for fixed analytic derivation or test support;
- analytic/numerical vacuum agreement and convergence checks with documented
  tolerances;
- drag/vacuum and mass controls;
- immutable learner Prediction before results;
- signed position, velocity, and fall-time paths suitable for an accessible
  animation;
- a Boundary Map over pack-approved drag and mass/area conditions;
- deterministic transfer to a surface-different drop scenario;
- technical and epistemic verifier mutations;
- Proof Capsule v2.

The fixed adapter owns bounded solver invocation, tolerances, units, and signed
animation arrays. The browser renders those arrays with the existing renderer
or Vega-Lite. Rapier may be used only as an optional renderer or secondary
comparator; it never supplies authoritative trajectories. Do not write a general
physics engine.

Codex may only compose operation IDs into IR and scene bindings. It cannot emit
equations, numerical methods, solver configuration outside the allowlist, or
result arrays. Mutations must include analytic/numerical mismatch, convergence
failure, dimensional inconsistency, frozen drag response, swapped axes,
incorrect units, stale animation data, nonphysical values, engine-version
drift, and nondeterminism.

## Product experience

### Chat-first front door

The first screen asks what the learner wants to test in plain language. It may
offer notebook analysis, the short sample, a verified replay, or the guided
free-fall lab. It must explain the support boundary in one sentence and avoid
requiring technical vocabulary before the Question is clear.

### Learner journey

1. **Question** — capture the claim and show adjacent artifact evidence when
   relevant.
2. **Prediction** — confirm the Belief Spec and immutably lock the expectation
   and confidence.
3. **Test** — show “Why this test?”, then compile, score, verify, and run the
   selected IR.
4. **Boundary** — reveal the signed result and allow one real bounded control or
   Boundary Map exploration.
5. **Apply** — evaluate deterministic transfer without an LLM verdict.
6. **Repair** — unlock a minimal verified patch only after transfer passes.

### Experiment Theater

- The main canvas focuses on the current learner action and one dominant CTA.
- The verified intervention, controlled variables, observable, prediction, and
  outcome remain visible together.
- Result animation or charts begin only after signed data arrives.
- Loading preserves layout dimensions.
- Accessible tables expose every quantitative visual.
- Activity and Evidence & proof drawers are collapsed by default and become
  prominent during compile/verify or when the learner opens them.
- There is no permanent agent cockpit.

### Judge Mode

Judge Mode exposes honest paths:

- a short Sample lesson;
- Live notebook analysis;
- a persistently labelled Verified replay;
- the guided physics lab when its full release gate is green.

Replay never makes a new model call. Live never silently falls back to sample or
replay. A genuine prior reject-repair replay is acceptable when labelled; never
stage a rejection in a live run.

## Canonical state and transitions

Persist explicit, validated state transitions. New v5 state may be layered over
legacy replay state, but illegal transitions must fail server-side.

```text
ARTIFACT_INGESTED | GUIDED_LAB_SELECTED
  -> QUESTION_FRAMED
  -> BELIEF_SPEC_PROPOSED
  -> BELIEF_SPEC_CONFIRMED | INSUFFICIENT_EVIDENCE | REJECTED_BY_LEARNER
  -> PREDICTION_LOCKED
  -> CANDIDATES_PROPOSED
  -> DISCRIMINATION_CONTRACT_VERIFIED | TEST_REJECTED
  -> EXPERIMENT_IR_VERIFIED | TEST_REJECTED
  -> TEST_RUNNING
  -> SUPPORTS | INCONCLUSIVE | REJECTED
  -> BOUNDARY_VERIFIED
  -> REVISION_RECORDED
  -> TRANSFER_IN_PROGRESS
  -> TRANSFER_FAILED | TRANSFER_PASSED
  -> PATCH_COMPILING
  -> PATCH_REJECTED | PATCH_VERIFIED
  -> REASONING_DIFF_ISSUED
  -> PROOF_CAPSULE_ISSUED
```

Prediction is immutable. No result or Boundary Map appears before
`PREDICTION_LOCKED`. Rejected technical or epistemic verification cannot
advance to a result. Failed transfer cannot produce a patch.

## Public compiler events

Expose only validated browser-safe events such as job start, plan summary,
evidence references, allowed file creation, sanitized diff, command summary,
verifier counterexample, repair start, verified status, result readiness, or
typed failure.

Never emit private reasoning, hidden tests, secrets, credentials, raw notebook
bytes, raw dataset rows, local paths, environment variables, or complete
stdout/stderr. Persist the sanitized stream append-only and support reconnect
from an event cursor.

## Evidence, replay, and Proof Capsule v2

Canonicalize JSON before hashing and chain append-only evidence events. Record
actor, sequence, timestamp, input/output hashes, model and prompt identifiers,
commit, duration, exit code, and concise public payload when applicable.

Proof Capsule v2 must include or hash-bind:

- mode and session provenance;
- artifact manifest or guided-lab input contract;
- approved Belief Spec;
- immutable Prediction;
- candidate experiments and fixed score breakdown;
- Discrimination Contract and “Why this test?”;
- canonical Experiment IR;
- compiler events and repair history;
- technical and epistemic verifier reports;
- canonical result and Evidence Verdict;
- signed Boundary Map;
- learner revision;
- deterministic transfer result;
- patch plan, diff, artifact hashes, and patch verifier result when applicable;
- event hash chain;
- fixture, kernel, scorer, verifier, schema, prompt, model, template, and Subject
  Pack versions;
- scientific-engine registry snapshot, declared roles, exact versions,
  integrity records, licenses, tolerance profile, and engine-health result;
- SBOM identifier or hash;
- limitations, non-claims, replay ID, and reproduction commands.

Use HMAC or stronger signing only when the configured signing key exists.
Without one, say integrity-hashed. Replay must reconstruct from stored events and
payloads, display its original timestamp and identifiers, and remain visibly
labelled throughout.

Reasoning Diff is learner-facing. Proof Capsule is machine-facing.

## Patch policy

Before transfer passes:

- patch routes return a typed locked state;
- UI explains that CounterLab tests understanding before repair.

After transfer passes:

- start a separate bounded Codex turn;
- create a source-free Patch Plan;
- modify only a copy of the supported artifact;
- apply the smallest pack-registered correction;
- verify artifact validity, allowed-cell scope, dependencies, actual evaluation
  change, recomputed results, reproducibility, and unchanged unrelated hashes;
- expose a cell-level diff, source/patched hashes, unchanged count, verifier
  properties, download, and reproduction command.

Never overwrite the original. Reject broad rewrites, new dependencies outside
the allowlist, hardcoded metrics, nondeterminism, collateral source changes, or
a conclusion change without an evaluation-design change. Unsupported patch
shapes fail honestly; do not stretch the claim.

## Security and privacy

At minimum enforce:

- bounded file size, content type, JSON depth/size where practical, and safe
  filenames;
- no notebook execution during intake;
- active-output sanitization;
- generated IDs and path containment;
- server-only secrets;
- short-lived single-job runner tokens;
- credential-safe process launch and revocation;
- no-network runner boundary;
- non-root execution and read-only inputs/root where supported;
- CPU, wall-clock, memory, process, file-count, and output-size limits;
- hidden verifier and held-out isolation;
- dependency and operation allowlists;
- pinned scientific-engine dependencies, license records, and SBOM generation;
- no raw chain-of-thought in logs, events, or UI;
- secret scanning in release checks;
- private diagnostics protected by a sufficiently strong secret and containing
  only aggregate, non-identifying operational data;
- explicit limitations in `docs/THREAT_MODEL.md`.

Do not claim formal sandbox proof or 100% security. State exactly what the
Cloudflare Container and local advanced path enforce and what remains outside
the guarantee.

## Product and design rules

- One dominant action per stage.
- Body text is at least 15 px; secondary text at least 13 px; labels at least
  12 px.
- Interactive targets are at least 44 px.
- No permanent agent cockpit or developer dashboard as the primary experience.
- Activity and Evidence & proof are collapsed by default.
- Never animate or reveal a result before signed data arrives.
- Preserve layout dimensions during loading.
- Support full keyboard completion, visible focus, readable contrast, reduced
  motion, and screen-reader alternatives.
- Complete the main journey at a 390 px viewport without horizontal overflow.
- Charts and animations expose units, sample sizes, conditions, seeds where
  relevant, and an accessible table.
- Use red only for rejected invariants or contradicted expectations, never to
  shame the learner.
- Keep default learner copy plain. Put schemas, hashes, model IDs, command
  excerpts, and verifier internals in Evidence & proof.
- Measure performance before making performance claims.

## Tests and evaluation

### TypeScript and Worker

Cover:

- sample/live/replay/guided/challenge separation;
- non-sample artifacts never receiving sample Belief Specs, results, patches,
  or replay authority;
- contract validation and canonical hashes;
- fixed candidate scoring and deterministic tie-breaks;
- epistemic verdicts and inconclusive thresholds;
- evidence resolution and result-to-UI binding;
- job transitions, signed tokens, callback idempotency, and cursor reconnect;
- event sanitization and credential boundaries;
- state transitions, Prediction immutability, replay reconstruction, and Proof
  Capsule validation;
- unsupported refusal and typed API errors.

### Python kernels and verifiers

Cover:

- existing fixture determinism, canonical serialization, ML operations,
  overlap/confusion invariants, interactive configurations, transfer, patches,
  held-out variants, and every existing mutation;
- Experiment IR policy and cross-language canonical hashes;
- epistemic verifier invariants and mutations;
- Boundary Map determinism, axes, units, bindings, and mutations;
- free-fall analytic/numerical agreement, drag/vacuum response, physical bounds,
  dimensional analysis, convergence, property tests, transfer, patch-free guided
  flow, and mutations;
- scientific-engine registry validation, role separation, health probes,
  tolerance profiles, upgrade drift, licenses, integrity records, and SBOM
  inclusion.

### Browser

Use CloakBrowser and cover:

- chat-first entry and plain-language support boundary;
- Sample completion;
- persistent Replay labelling;
- untouched live leakage and imbalance flows;
- guided free-fall flow when released;
- refresh/resume and event-stream reconnect;
- no result before Prediction;
- rejected verifier blocking result;
- `INCONCLUSIVE` without a forced winner;
- interactive Boundary control and signed visual binding;
- transfer failure/pass and patch lock/unlock;
- patch and Proof Capsule downloads;
- unsupported and missing-credential states;
- mobile 390 px, keyboard-only, reduced motion, focus, contrast, and overflow.

### Benchmarks and learner pilot

Keep held-out cases outside the model-visible context and version benchmark
changes. Record support decision, evidence precision, routing, Plan/IR success,
verification, repair count, false-teaching events, patch correctness, runtime,
and measured cost only when executed.

The learner pilot uses a paired crossover, explanation-only baseline,
CounterLab condition, immediate conditional transfer, delayed transfer when
feasible, anonymized schema, consent/privacy note, and an analysis script. The
primary outcome is unassisted transfer. Do not claim results until real rows
exist.

## Required scripts

Keep these executable and clear on failure:

```bash
./scripts/dev.sh
./scripts/clean-demo.sh
./scripts/test-all.sh
./scripts/generate-fixtures.sh
./scripts/run-mutations.sh leakage
./scripts/run-mutations.sh imbalance
./scripts/reproduce-session.sh leakage-01
./scripts/record-replay.sh <session-id>
./scripts/replay-patch.sh leakage-01
./scripts/release-check.sh
./scripts/production-smoke.sh <deployed-url>
```

Add equivalent mutation/reproduction entry points for `physics/free-fall` when
that pack is implemented. Before admitting its first scientific engine, add
cross-platform-friendly engine-registry validation, engine-health, license, and
SBOM commands and include them in `release-check.sh`. `clean-demo.sh` must check
runtimes and locked dependencies, initialize local persistence, generate/verify
public fixtures, start required local services, print the URL, and state which
live capabilities are available.

## Documentation

Maintain at least:

- `README.md`;
- `docs/BUILD_PLAN.md`;
- `docs/PROGRESS.md`;
- `docs/DECISIONS.md`;
- `docs/RELEASE_CHECKLIST.md`;
- `docs/SUPPORT_CONTRACT.md`;
- `docs/ARCHITECTURE.md`;
- `docs/AUTHORITY_BOUNDARIES.md`;
- `docs/THREAT_MODEL.md`;
- `docs/EVALUATION.md`;
- `docs/CODEX_USAGE.md`;
- `docs/DEMO_SCRIPT.md`;
- `docs/DEVPOST_COPY.md`;
- `docs/SCREENSHOT_PLAN.md`;
- `docs/ACHIEVED_METRICS.json`;
- `docs/HELD_OUT_RESULTS.json`;
- scientific-engine registry and role documentation;
- third-party license and attribution inventory;
- a machine-readable SBOM;
- Proof Capsule v2 schema and reproduction documentation.

The README and demo must distinguish what GPT-5.6 proposes, what Runtime Codex
compiles or repairs, what fixed scorers/kernels compute, what the verifier
proves, what each mode means, what is supported, and what is not claimed.

## Release evidence and gates

A release is not ready until:

- the current production deployment identifier and runner image/version are
  recorded;
- untouched live leakage and imbalance pass;
- the scientific-engine registry, declared role separation, licenses, package
  integrity, SBOM, engine-health checks, and upgrade-drift tests pass;
- one verified physics flow passes or physics is omitted and not advertised;
- all existing tests remain green;
- new epistemic and Boundary Map mutations pass;
- browser tests execute against local and production surfaces as applicable;
- mobile and accessibility gates pass;
- Proof Capsule v2 validates and reproduces;
- public event reconnect, patched-artifact download, proof export, and no-secret
  behavior pass;
- sample, replay, live, guided, and challenge authority remain unmistakable;
- a clean checkout or fresh temporary clone passes release checks;
- achieved metrics are generated from actual test output;
- learner pilot contains real rows or remains explicitly pending;
- the demo/video uses achieved numbers only;
- the `/feedback` session ID used for release feedback is saved in factual
  release evidence.

Do not mark a gate complete without commands, outputs, hashes, browser evidence,
deployment identifiers, or another appropriate record. Valid progress states
are `pass`, `fail`, `partial`, and `not run`.

## Environment contract

Document and keep server-only where applicable:

```dotenv
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.6
OPENAI_REASONING_EFFORT=medium
CODEX_MODEL=
COUNTERLAB_CODEX_MODE=replay
COUNTERLAB_DATABASE_PATH=./data/counterlab.sqlite
COUNTERLAB_SIGNING_KEY=
COUNTERLAB_ADMIN_DIAGNOSTIC_SECRET=
COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY=
COUNTERLAB_RUNNER_BASE_URL=
COUNTERLAB_MAX_NOTEBOOK_BYTES=10485760
COUNTERLAB_SANDBOX_IMAGE=counterlab-runner:local
```

`COUNTERLAB_CODEX_MODE` accepts only `live`, `replay`, or `disabled`. Sample and
Replay remain usable without model credentials. Live may require the configured
Responses key/base URL, Codex authentication, and a compatible runner.

## Final reporting

At the end of a work session, report concisely:

1. what was implemented;
2. files and major modules changed;
3. commands and tests run with actual results;
4. gates now passing;
5. live, sample, replay, guided, and challenge status;
6. measured metrics only;
7. honest blockers, unsupported cases, and non-claims;
8. the highest-risk remaining issue and next highest-value action.

Do not expose private chain-of-thought. Report decisions, evidence, diffs,
commands, and outcomes.
