# CounterLab Studio — First Prize Upgrade Plan

Updated: 2026-07-16

This document records the completed CounterLab Studio upgrade and its remaining
held-out/study limitation. The active v5.1 phase order and scientific-engine
work are tracked in `task_plan.md`; pending v5.1 contracts are not retroactively
claimed here.

The v5.1 scientific-engine registry gate is now implemented for the two
released ML packs. Its exact non-root local candidate, licenses, integrity
evidence, deterministic health runs, normalized SBOMs, raw vulnerability scan,
reviewed exception evidence, and canonical authority hash pass the full local
image gate as authority `d7677c79914505c11cc0474a0f3e4be7527173ea27c5640b65c7b8a373a8e881`.
Proof Bundle v2 binds and validates that authority hash. Production promotion
remains pending until the qualified image is deployed and a new
public smoke records it. See `docs/SCIENTIFIC_ENGINES.md` and
`docs/DEPENDENCY_ADMISSION.md`.

## Release objective

CounterLab Studio is a mental-model debugger that turns a learner's notebook
claim into a verified counterexperiment, checks whether the rule transfers, and
only then proposes a verified repair.

The hosted authority chain will be:

```text
notebook -> safe Artifact Manifest -> learner claim -> Belief Test approval
         -> immutable prediction -> typed Experiment Plan -> frozen verifier
         -> fixed-kernel result -> learner revision -> fixed transfer evaluator
         -> typed Patch Plan -> verified patched copy -> Reasoning Diff + Proof Bundle
```

> Chatbots explain. CounterLab lets reality answer—and only then helps you fix
> the code.

## Inspected repository state

### Proven foundations to preserve

- The notebook parser bounds bytes and JSON depth, never executes cells,
  sanitizes active content, hashes exact sources and accepted outputs, and
  returns typed support reasons.
- The leakage fixture and scikit-learn kernel produce deterministic real metrics,
  sample sizes, overlap, feature fingerprints, chart data, and canonical hashes.
- The frozen leakage verifier independently checks 18 named properties and
  detects all 12 published critical mutations.
- The local generated-adapter path has strict AST policy, a bounded Docker
  runner, host-side verification, a two-repair limit, and a genuine recorded
  reject/reject/later-verified Codex trace.
- The Responses analyst already supports a server-side key, optional custom
  Responses base URL, structured output, local Zod validation, `store: false`,
  privacy-preserving identifiers, redaction, refusals, and exact evidence
  resolution.
- Session state uses optimistic concurrency and an append-only evidence hash
  chain. Proof Bundle validation recomputes lineage, content hashes, and optional
  HMAC signatures.
- The fixed sample path, deterministic transfer, exact sample patch, clean-clone
  scripts, and CloakBrowser judged path are green.

### Baseline release blockers captured before implementation

The following findings motivated the upgrade. Regression tests now prevent
their return; they are historical baseline facts, not the current architecture.

- Worker modes are unstructured strings. Non-live Belief Tests use the approved
  sample analyst, and the Worker forces `entity_leakage`.
- Live lab compile terminates with `LOCAL_RUNNER_REQUIRED`.
- Non-live compile, run, transfer, patch, proof, and replay routes use bundled
  sample artifacts.
- The browser's live start creates a session on the sample artifact. Uploading a
  notebook creates an `instant` session instead.
- Replay discards its API payload and advances revision, transfer, and patch in
  browser-local state.
- The landing claims two mistakes, but only the leakage concept pack exists.
- The build screen hides the strongest verifier evidence, and the result UI is
  coupled to the sample's three run IDs and exact accessible chart text.
- There is no runner job persistence, token, callback, cursor, cancellation,
  operational timing, concept registry, Plan v2 interpreter, imbalance pack,
  held-out matrix, or user-study harness.

### Baseline evidence

The following passed before upgrade edits:

- Root Vitest: 104 tests
- Web Vitest: 29 tests
- Pytest: 98 tests
- TypeScript and generated Worker types: pass
- CloakBrowser Playwright: 13 tests

## Architecture decision

### Control plane

Retain the existing Vite + React application and Cloudflare Worker.

- D1 remains the durable source for projects, sessions, runner jobs, callback
  receipts, sanitized public events, operational timing, and replay metadata.
- R2 remains private storage for notebook bytes, sanitized runner input bundles,
  generated plans, patched notebook copies, and Proof Bundles.
- The browser receives only typed API payloads and sanitized compiler events.
- All mode, state, artifact, concept, plan, result, and patch lineage is checked
  again in the Worker before state can advance.

### Runner plane

Use a Cloudflare Container attached to the Worker through a Container-backed
Durable Object. The configured account and Wrangler version support Containers.

- One named Container instance per runner job provides stable job affinity.
- The Worker issues a short-lived P-256-signed job token bound to one job, session,
  artifact manifest hash, input bundle, output prefix, callback route, state
  version, origin, purpose, and expiration. The Worker retains the private key;
  the Container receives only the public verification key.
- The Container exposes an internal authenticated HTTP job API and never exposes
  its filesystem publicly.
- Runtime Codex uses the existing stable stdio JSONL App Server client.
- Codex may create only `experiment-plan.json`, `patch-plan.json`, and
  `public-rationale.md`. Rationale is display-only.
- Structural plan validation and concept verification run outside the Codex
  prompt context. Only named invariant counterexamples are returned for at most
  two repairs.
- A fixed Python interpreter composes registered concept-pack operations. It
  does not execute model-authored Python, shell, SQL, formulas, imports, paths,
  or network actions.
- During Codex generation, credentials are staged for initialization and
  revoked before the generated turn. Phase-specific outbound filtering for the
  later fixed verification/kernel processes remains a v5.1 hardening gate and
  is not claimed by the current production evidence.
- Container disk is treated as ephemeral. Every authoritative input/output is
  hash-bound and stored in D1/R2.

Cloudflare Containers are beta and have rolling deployment/cold-start behavior.
The runner transport stays behind an interface that also supports an
authenticated dedicated process service without changing browser or job
contracts.

### Hosted versus advanced local generation

Hosted Studio and the existing local proof are separate products of one
authority model:

| Path                 | Codex output                                      | Execution                                      |
| -------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Hosted Studio        | typed Experiment/Patch plans and public rationale | fixed interpreter only                         |
| Advanced local proof | plan, Python adapter, public tests                | AST policy plus locked Docker candidate runner |
| Verified replay      | no new generation                                 | reconstruct stored event/result payloads       |

The local adapter proof remains available and honestly labelled. It is not a
fallback used silently by hosted live sessions.

## Shared contracts

Add without breaking v1 replay compatibility:

- A discriminated `SessionMode` union for sample lesson, live notebook analysis,
  and verified replay, with mode-specific IDs and capabilities.
- Concept registry/routing outcomes: selected, choice required, insufficient
  evidence, and unsupported.
- Runner job kind/status, typed errors, optimistic version, input/output hashes,
  attempt limits, runner identity, timing, and event cursor.
- Short-lived runner token claims and callback envelopes.
- Strict `PublicCompilerEvent` union with job ID, event ID/cursor, and timestamp.
- Experiment Plan v2 with fixed operation IDs, allowed metrics/views, manifest
  and Belief Test lineage, qualitative expectations, non-claims, and bounded
  resources.
- Patch Plan v1 with source hash, allowed cell hashes, fixed transformations,
  expected unchanged hashes, and output file name.
- A concept-neutral verified result envelope with concept-specific run schemas;
  retain leakage v1 parsing for existing replay.
- Proof Bundle v2 with a hosted plan compiler artifact variant and full job/
  manifest/plan/result/patch lineage.

No v2 plan field accepts executable text, arbitrary formulas, shell commands,
SQL, imports, raw paths, network actions, or literal result metrics.

## Concept-pack registry

One registry is the source of truth for support detection, analyst rules,
allowed fixed operations, metrics, visualizations, plan verifier, interpreter,
transfer, patch contract, learner copy, approved claims, forbidden claims, and
advertised support.

The router never guesses. It returns one of:

- selected concept with confidence and resolved evidence;
- multiple supported candidates requiring learner choice;
- insufficient evidence;
- unsupported artifact.

Landing and upload copy are generated from release-ready registered packs. A
concept cannot be advertised until its complete registry definition and end-to-
end release tests pass.

## Persistence and idempotency

Migration 0002 adds:

- anonymous projects and project/session history;
- runner jobs with optimistic version and terminal output hashes;
- append-only public compiler events with `(job_id, cursor)` uniqueness;
- callback receipts keyed by job ID and callback idempotency key;
- artifact-to-concept routing decisions;
- private proof shares with unguessable read-only IDs;
- bounded operational timings and failure codes.

Job transition rules are explicit and terminal states are immutable. Duplicate
callbacks return the recorded result. Stale state versions are rejected. A
verified plan/result/patch cannot be attached when any of session, artifact,
manifest, concept, Belief Test, prediction, state version, or input hashes differ.

## Security properties

- Notebook intake remains parse-only with central size/depth limits.
- Upload names are never paths; R2 keys and job/session/project IDs are generated
  server-side.
- Browser code receives no model key, signing key, R2 credentials, D1 access,
  local path, raw notebook bytes, raw rows, environment data, hidden verifier
  source, or private reasoning.
- Runner tokens authorize exactly one job, one sanitized input bundle, one
  output prefix, and one short-lived callback.
- Callback bodies are bounded, authenticated, hash-checked, idempotent, and
  state-version checked.
- Public events are allow-listed and bounded; unknown App Server notifications
  are dropped.
- A rejected/failed/timed-out/cancelled plan releases no result. Failed transfer
  releases no patch.
- Patches always target a copy. Unrelated cell source hashes are verified.
- Security documentation states enforcement and beta/runtime limitations; it
  does not claim formal sandbox proof.

## Vertical milestones and gates

### Gate 1 — Authority regression boundary

Status: **complete**. Modes are discriminated at contracts and routes; tests
reject sample Belief Tests, results, patches, and replay metadata in live
artifact sessions.

1. Add failing tests proving a non-sample artifact cannot receive sample Belief
   Test, result, transfer, patch, proof, or replay metadata.
2. Add failing tests proving unsupported concepts cannot be advertised.
3. Add failing tests proving configured live runner health cannot end at the
   local-runner boundary.
4. Implement shared discriminated modes and route-level mode validation.

Exit: all authority regressions pass, and the existing sample/replay tests remain
green with explicit labels.

### Gate 2 — Runner jobs and hosted leakage

Status: **complete in production**. The Container-backed runner now
completes an artifact-specific Experiment Plan, fixed result, cursor stream,
and fail-closed callback. Exact-version production smoke passed both concepts.

1. Add job/token/event/callback/Plan v2 contracts and transition tests.
2. Add D1 migration/repository with optimistic idempotent callbacks.
3. Add Container-backed runner service and a deterministic test runner.
4. Add leakage registry/router and Plan v2 verifier/interpreter.
5. Connect upload -> preview/approval -> live analyst -> prediction -> compile ->
   repair -> verify -> fixed result.
6. Persist plan, sanitized event stream, verification, result, hashes, timings,
   model ID, prompt hash, and evidence chain.

Exit: at least one non-sample supported notebook completes an artifact-specific
hosted test-runner session; a rejected plan releases no result; refresh/cursor
reconnect reconstructs the same state.

### Gate 3 — Artifact-specific patch and Studio experience

Status: **complete in the repository**. Patch Plan v1, source sealing, fixed
copy-patch execution, private download, Proof Bundle v2, Studio shell, evidence
navigator, Agent Rail, constrained generated proof view, command palette,
recent-session resume, explicit stage review/reset, and interactive leakage
controls are implemented and covered by unit/integration tests. Production
browser smoke remains a Gate 5 task.

1. Add deterministic leakage patch support detector, Patch Plan interpreter,
   verifier, R2 download, and Proof Bundle v2.
2. Refactor the React monolith by product responsibility into routed Studio,
   lesson, and proof components without one-function fragmentation.
3. Add project sidebar, evidence navigator, five-phase agent rail, prominent
   compile moment, bottom proof console, command palette, recent sessions, and
   shareable read-only proof route.
4. Add interactive leakage controls backed only by signed fixed-kernel
   configurations.

Exit: an uploaded supported notebook gets a minimal verified patch tied to its
source hash after transfer; unrelated cell hashes remain unchanged; patch copy
and proof download are usable after refresh.

### Gate 4 — Class imbalance

Status: **complete in the repository**. The deterministic fixture/notebook,
router and analyst rules, four fixed operations, interactive threshold and
prevalence controls, manufacturing transfer, artifact-bound patch engine, and
12-mutation verifier are implemented. The Worker integration test completes
transfer through proof for this concept.

1. Add deterministic rare-event fixture/notebook and stored kernel output.
2. Add registry rules, Belief Test routing, majority baseline, stratified split,
   confusion matrix, precision, recall, F1, PR-AUC, contextual ROC-AUC,
   threshold sweep, and prevalence sweep.
3. Add interactive threshold/prevalence/metric controls, fixed manufacturing
   transfer, artifact-specific evaluation patch, and full verifier mutation set.

Exit: imbalance completes sample and live supported paths end to end. Only then
does public copy advertise two concepts.

### Gate 5 — Held-out, study, and release

Status: **partial**. Held-out v2 records 10/10 safe intake/routing decisions and
7/8 fixed full-loop completions without source edits; the Random Forest case is
honestly refused by the logistic-only non-sample patch contract. The learner
pilot protocol/randomization/analysis harness is ready with no participant
outcomes claimed. Deployment and exact production runner smoke now pass; the
final v5.1 clean-clone, accessibility, performance, and release gates remain
pending.

1. Freeze four leakage, four imbalance, and two unsupported held-out notebooks.
2. Generate machine and human held-out matrices from actual runs.
3. Add paired-crossover learner-study protocol, randomization, schema, privacy
   note, study mode, and analysis script without inventing participant results.
4. Add browser coverage for live test runner, reconnect, second concept,
   interactive recomputation, patch download, proof share, mobile, keyboard, and
   reduced motion.
5. Add deployed production smoke for health, sample, replay, runner capability,
   one live test artifact, secret leakage, and proof URL.
6. Update achieved metrics only from emitted test/benchmark logs, then finish
   docs, accessibility, performance, clean-clone, release checks, and deployment.

Exit: all release checks and production smoke pass; achieved output contains no
targets or simulated learner outcomes.

## Environment constraints observed

- Node 26.2.0, pnpm 11.12.0, Python 3.14.5, Docker 29.5.2, Codex CLI 0.144.4,
  and Wrangler 4.110.0 are installed.
- The Cloudflare account is logged in and Container-enabled. CounterLab D1/R2
  bindings and the Container-backed Durable Object are configured in
  `wrangler.jsonc`; Worker `ae01fe03-731f-4939-849f-e8f4eaec7f51` and Container
  version 10 passed exact-version production smoke.
- Cloudflare Containers are beta, use ephemeral disk, deploy with rolling image
  rollout, and require Workers Paid usage.
- Live Belief analysis requires the existing server-side key and optional custom
  Responses base URL. Product copy and persisted public events remain
  provider-neutral.
- Hosted Codex additionally requires a runner-side Codex credential and model
  configuration. Missing credentials produce a typed unavailable state; they
  never fall back to sample or replay.
- Existing local and browser test suites are green before upgrade.

## Release discipline

- Work test-first in the requested priority order.
- Preserve v1 sample/replay compatibility while adding v2 contracts.
- Keep changes in independently reviewable slices and run the smallest relevant
  test after each slice.
- Never claim a hosted, concept, held-out, study, or production gate without the
  command output and generated artifact that proves it.
