# Findings: CounterLab Studio upgrade

## 2026-07-16 v5 patch and proof boundary

- The strict v5 Patch Compile bundle and fixed runner/Python path existed before
  Worker migration, but the Worker still required `beliefTest` and returned 409
  for a native `beliefSpec` session. Commits `15799f9`, `a970fc0`, and
  `8822f4d` remove that dead boundary without weakening legacy behavior.
- The Experiment IR transfer contract ID and deterministic evaluator task ID
  are separate authorities. Both are now registered and checked; comparing
  them as if identical would dead-end every valid v5 repair.
- A native v5 Patch Plan can now be rejected and repaired while source bytes
  remain sealed. The fixed patch callback accepts exactly Plan, rationale,
  notebook, and Patch Result hashes, freezes their bytes, and is idempotent
  after mutable runner output disappears.
- Both leakage and class imbalance now exercise the complete native Worker
  boundary through transfer and `PATCH_VERIFIED`; neither borrows a sample
  result, sample patch, or legacy Belief Test.
- Native v5 must not call the legacy Proof Bundle assembler because it requires
  Belief Test v1 and Experiment Plan v2 as primary authority. The Worker now
  stops honestly at `PATCH_VERIFIED` pending native Reasoning Diff and Capsule.
- The own JSON `__proto__` key-loss collision is fixed by null-prototype
  normalization while normal historical vectors remain unchanged. The
  follow-up integer-like-key, UTF-16 ordering, Unicode normalization, and lone
  surrogate failures are now fixed by the shared direct writer and Python
  parity implementation. Proof Capsule still must record the profile name.
- The qualified Container is correctly bound to source lock hash `48443375…`,
  not the current worktree. The unit suite asserts that drift as a named release
  finding; final promotion requires a newly built and qualified image.
- Strict Proof Capsule issuance also depends on a verified Boundary Map,
  immutable patch lineage, deterministic archive validation/storage, and replay
  persistence. None is marked complete yet.

## 2026-07-15 v5.1 scientific-engine upgrade

- The current repository is already a substantial production release: live
  entity leakage and class imbalance, Cloudflare Worker/D1/R2/Container runner,
  fixed kernels, verified patching, replay, and evidence chains exist.
- Root `AGENTS.md` was upgraded to a concise v5.1 scientific-engine constitution
  in commit `97f2e1d`, but the latest execution mandate adds concrete registry
  schemas, phase order, production authority checks, IR v5, scorer, Boundary
  Map, free-fall, Proof Capsule, performance, and submission gates that still
  require implementation and documentation propagation.
- Existing planning records were stale from the earlier Studio upgrade and must
  not be treated as current completion evidence.
- No relevant CounterLab entry was found in the external memory registry; the
  repository and current production evidence remain authoritative.
- Current `docs/PROGRESS.md` records a real deployed Worker, runner image, live
  leakage/imbalance browser completion, cursor resume, patch/proof downloads,
  clean-clone release, and 7/8 held-out fixed-loop completion. Phase 1 may reuse
  this evidence only after rechecking the new `/ready`, cancellation,
  duplicate-submission, and JSON smoke-report requirements.
- `README.md` still opens with the pre-v5 “CI for understanding” thesis and old
  Belief Test/Verified Lab/Proof Bundle vocabulary. It also contains a stale
  sentence saying the upgraded image still needs deployment, which conflicts
  with the later recorded production version and must be corrected factually.
- `docs/DECISIONS.md` intentionally contains historical decisions that are now
  superseded, including an edge-only Cloudflare path and older generated Plan
  shapes. Preserve history, but add explicit v5.1 decisions instead of deleting
  old entries.
- `docs/SUPPORT_CONTRACT.md`, `docs/ARCHITECTURE.md`, and authority/evidence
  diagrams still use Belief Test, Prediction Contract, Experiment Plan, and
  Proof Bundle as current primary terms. Phase 2 needs versioned compatibility
  wording rather than destructive renames.
- `docs/EVALUATION.md`, `docs/ARCHITECTURE.md`, and
  `docs/AUTHORITY_BOUNDARIES.md` contain stale “production smoke not yet run” or
  credential-broker limitations that conflict with the newer production and
  staged-credential-revocation evidence. These must be reconciled before any
  new release claim.
- Existing evaluation evidence remains strong and narrow: leakage and imbalance
  fixed metrics/mutations, 10/10 routing, 7/8 fixed held-out completion, real
  live compiler traces, deterministic transfer, and verified patch. It contains
  no BeliefSpecV2, IR v5, scorer, epistemic verdict, Boundary Map, scientific
  engine registry, physics, or Proof Capsule evidence.
- The current release checklist is fully green for the pre-v5.1 product. New
  v5.1 gates must be added as separate unchecked/partial rows rather than
  retroactively weakening or relabelling prior evidence.
- Baseline runtimes are Node 26.2.0, pnpm 11.12.0, Python 3.14.5, Docker
  29.5.2, Codex CLI 0.144.4, and Wrangler 4.110.0. No supplied
  `CounterLab_Scientific_Engine_Registry_v5_1.schema.json` exists in the tree.
- The current repository has 334 tracked files and no scientific-engine
  registry, Experiment IR v5, scorer, Boundary Map, or physics package yet.
- The full pre-v5.1 `release-check.sh` remains reproducible on the current host:
  all TS/web/Python/type/browser tests, both 12/12 mutation suites, 10/10
  held-out routing with 7/8 fixed completion, sandbox smoke, Vite/Worker build,
  canonical replay/patch reproduction, and a 334-file secret scan passed.

The sections below are retained as historical implementation findings and may
be stale. Verify them against the current tree before making decisions.

## Requirements

- Preserve strong fixed evidence machinery while eliminating every path that can
  assign sample analysis, result, transfer, or patch artifacts to uploads.
- Introduce explicit sample lesson, live notebook analysis, and verified replay
  discriminated modes with route-level leakage prevention.
- Add a process-capable, token-authenticated runner job plane with sanitized,
  reconnectable public compiler events.
- Host only typed plan generation; execute fixed allow-listed operations.
- Generalize leakage and ship class imbalance end to end before advertising it.
- Upgrade the UI into a resumable Studio without hiding compile/verify evidence.
- Prove at least six supported held-out notebooks and honest unsupported cases.

## Research Findings

- `AGENTS.md` confirms the fixed kernel, verifier, analyst, Codex compiler, learner,
  and replay authority boundaries remain binding.
- `AGENTS.md` also explicitly permits class imbalance only after leakage P0 is
  verified and forbids arbitrary STEM/notebook claims, unrestricted generated
  code, and unlabelled replay.
- The file contains an embedded/duplicated earlier master prompt; the current
  user upgrade request is more specific where it narrows hosted generation to
  typed plans.
- README honestly describes the current hosted limitation: the Cloudflare Worker
  handles the live analyst but reports local-runner-required for Codex/Python,
  while sample/replay remain the only complete public flows.
- README still defines runtime Codex outputs as Python adapter plus public tests;
  the Studio hosted upgrade must add a distinct typed-plan compiler without
  rewriting the genuine local adapter proof.
- Progress records a fully verified leakage P0, real live Belief Test, genuine
  Codex reject/repair trace, 12/12 mutations, clean-clone release, and production
  browser coverage. These gates justify starting P0.5, but do not prove an
  artifact-specific hosted run.
- Progress explicitly marks class imbalance not run. Any current two-concept
  public copy is therefore a release defect.
- Achieved metrics are narrowly grounded: one 2,880-row leakage fixture,
  canonical hash, 12/12 mutations, one verified sample patch, and a genuine
  Codex replay whose recorded generation isolation is `PARTIAL`. There are no
  held-out, cost, hosted-runner, imbalance, or learner-study measurements yet.
- The authority document already separates proposal, computation, verification,
  learner judgment, and replay correctly. The upgrade should extend the matrix
  with a Worker control plane, signed runner jobs, hosted fixed-plan interpreter,
  and callbacks rather than weakening existing boundaries.
- Current Codex event sanitization exists as an async iterable, but the Worker
  has no runner transport, event cursor, or reconnect path and returns a typed
  `LOCAL_RUNNER_REQUIRED` response.
- Current local generation expects `experiment-plan.json`, Python adapter, and
  public tests. The hosted plane must be a separate plan-only authority while
  preserving local replay and adapter proof as an advanced mode.
- Threat model already covers browser, parser, analyst, Codex, candidate,
  verifier, and replay boundaries. It does not yet cover runner job tokens,
  callback replay/idempotency, queue denial-of-service, event cursor access, or
  output-prefix confinement; these become mandatory threat-model additions.
- Existing highest-priority hardening focuses on local Codex credential brokering.
  The new hosted plan-only design can reduce risk further by never allowing
  model-authored commands or code to execute, but Codex App Server still needs a
  process boundary and credential isolation inside the runner.
- The original master prompt establishes the existing v1 contracts and sample
  milestones. The new user prompt supersedes only the hosted compiler shape and
  expands the release gates; fixed numeric, verifier, learner, replay, and
  no-fabrication authority remain unchanged.
- The repository is a compact monorepo with one Worker migration, one leakage
  concept pack, a monolithic React app/styles pair, shared contracts/session/
  parser/analyst/Codex/proof packages, a Python kernel, and a local Docker runner.
  There is no hosted runner service, job repository, concept registry, imbalance
  directory, held-out matrix, or user-study directory.
- Runtime inventory is current and compatible with the existing release: Node
  26.2.0, pnpm 11.12.0, Python 3.14.5, Docker 29.5.2, Codex CLI 0.144.4, and
  Wrangler 4.110.0.
- `main` matched `origin/main` before this upgrade; only the working planning
  records are dirty. Existing recent commits isolate UI, Codex boundary, and
  documentation changes, matching the constitution's reviewability preference.
- Root scripts currently run TypeScript/web/Python tests and the local Codex
  runner; the web deploy remains the Vite build plus Wrangler Worker deployment.
- `POST /belief-test` uses the live analyst only for `mode === "live"`; all
  other modes use `ApprovedSampleBeliefAnalyst`, and every request is forced to
  `concept: "entity_leakage"`.
- `POST /lab/compile` rejects live mode with `LOCAL_RUNNER_REQUIRED`; all other
  modes receive `sampleLabVerification` and the bundled adapter/test/verifier
  hashes.
- `POST /lab/run` records `sampleResult` without checking the artifact identity
  or mode. Transfer always calls `evaluateSampleTransfer`.
- `POST /patch/compile` always creates the sample patch from
  `sampleManifest.fileSha256` and writes the bundled patched notebook under the
  current session ID. Proof issuance also uses `createSampleReasoningProof`.
- Replay is one hard-coded `leakage-01` payload. The current Worker therefore
  has no artifact-specific hosted compile, verification, result, transfer,
  patch, or proof path.
- The React app duplicates mode as `"instant" | "live" | "replay"` and stage
  state locally instead of consuming a shared discriminated mode contract.
- Landing copy currently says CounterLab teaches two machine-learning mistakes,
  although the repository contains only the leakage pack.
- The Claim screen can display uploaded artifact evidence, but the Belief screen
  still presents leakage-specific public hypotheses and predictions even when
  the analyst output is available; exact analyst wording is secondary disclosure.
- Resume state relies on several local-storage keys rather than route identity.
  The header's stage buttons provide limited backward review and a visible reset,
  but there is no project/session route shell or shareable session URL.
- Build/verify is summarized as four generic completed checks, with the genuine
  command and verifier trace hidden inside a technical disclosure. Instant mode
  labels its source as stored approved artifacts rather than an active job.
- `ResultBars` reads metrics from the result object, but its accessible label is
  hard-coded to the sample's exact three values; it cannot describe an
  artifact-specific or interactive run correctly.
- The Reality screen is coupled to the leakage sample's run IDs and forecasting
  transfer. When `session === null` (replay client path), revision, transfer,
  and patch completion are advanced entirely in local component/local-storage
  state rather than reconstructed from persisted replay events.
- The live setup screen explicitly says a local runner is required and routes a
  committed live prediction to a terminal `LiveCompileBoundary`.
- `startLiveSession()` creates a live session using `createSampleArtifact()`;
  it does not begin with an uploaded artifact. Conversely, `uploadNotebook()`
  always creates the uploaded artifact's session with `mode: "instant"`.
- Replay fetches `/api/replays/leakage-01` only as an availability check, throws
  away the returned payload, sets `session` and `artifact` to null, and renders
  bundled `sampleResult` plus local progress state.
- Session recovery uses one global session ID in local storage and maps server
  state back into a monolithic stage; there is no URL routing, recent project
  list, event cursor, or persisted replay session.
- The browser API health schema literally accepts only
  `local-runner-required` for Codex, kernel, and sandbox; it cannot represent a
  configured hosted runner.
- `SessionView` and create-session input repeat the three string modes rather
  than a shared discriminated union. The client has no runner-job, public-event,
  cursor/reconnect, interactive-run, patch download, or proof-share routes.
- `sample.ts` imports the bundled verified result directly into the browser.
  `App.tsx` then uses it as a fallback for null sessions, including replay,
  which makes sample leakage structurally easy rather than impossible.
- The API client does strictly validate typed envelopes and typed errors; this
  is strong existing code to retain while extending route-specific schemas.
- Shared contracts already enforce strict artifact manifests, evidence-reference
  shape, immutable prediction fields, event hash metadata, chart/result
  agreement, transfer/check agreement, patch verification agreement, proof
  integrity mode, and the canonical session transition graph.
- Experiment Plan v1 is designed for the local adapter compiler: it permits
  arbitrary `datasetAdapter`, model, metric, view, and invariant strings and has
  no artifact manifest hash or evidence references. A separate strict v2 plan
  is required for the hosted fixed interpreter.
- `VerifiedResultSet` models only customer fixtures and accuracy/ROC AUC; it
  cannot represent confusion matrices, precision, recall, F1, PR-AUC,
  thresholds, or prevalence scenarios for imbalance.
- Proof Bundle v1 requires a generated adapter and v1 experiment plan. Hosted
  plan-only proof needs an explicit compiler artifact variant rather than fake
  adapter metadata.
- There are no shared schemas yet for discriminated session modes, concept
  routing, runner jobs/status transitions, signed job claims, sanitized public
  compiler events, cursor pages, patch plans, or interactive run requests.
- Session core preserves aggregate identity/mode/artifact during transitions,
  increments optimistic versions, validates canonical event hashes, and emits
  one append-only evidence event with each state mutation. This is strong
  authority/integrity machinery to reuse.
- Session mode is still a plain string union and carries no mode-specific
  artifact/replay/model-call invariants.
- `verifyLab()` accepts an untyped verification object, while
  `recordExperimentResult()` only validates the standalone result schema. It
  does not bind the result to the session artifact, verified plan, concept,
  input hashes, or manifest hash; the Worker can therefore attach `sampleResult`
  after any lab verification.
- The same missing cross-object binding exists for patch/proof: patch verifies
  its session ID, but sample source-artifact identity is not enforced by the
  service, and Proof Bundle v1 is parsed without recomputing its integrity hash
  at issue time.
- SQLite and D1 repositories both use optimistic version checks and append-only
  event tables. D1's paired insert/update batch is designed to make the event
  and aggregate advance together; this pattern can be reused for job callbacks.
- Migration 0001 has artifacts, sessions, evidence events, and replay metadata,
  but no projects, runner jobs, public event cursors, callback receipts,
  operational timings, proof shares, or output-prefix records.
- Local SQLite embeds migrations in TypeScript while Worker D1 uses SQL files;
  runner-job repository tests must keep both persistence implementations aligned
  or explicitly limit jobs to the hosted D1 plane.
- The notebook parser is safe by construction: byte/depth bounds, basename
  normalization, no execution, active MIME/source omission, output hashing,
  exact source hashing, deterministic timestamps, package/magic refusal, and
  typed support reasons are already implemented and should be preserved.
- Support currently depends on a valid `metadata.counterlab.schemaSummary`.
  Without it, an otherwise recognizable untouched notebook is `PARTIAL` with
  empty schema fields/entity/target candidates, which blocks the UI's supported
  upload path.
- Known symbols cover leakage basics and F1, but not confusion-matrix,
  precision/recall, average-precision/PR-AUC, threshold, or stratification
  patterns needed for the imbalance support detector.
- Metric extraction already handles accuracy, ROC AUC, F1, precision, and
  recall in safe text/JSON outputs. It needs PR-AUC aliases, prevalence, and
  confusion counts without relaxing active-output policy.
- The live Belief Analyst already uses the official JavaScript Responses API,
  provider-neutral base URL normalization, Zod structured output, `store:
  false`, configurable reasoning, stable hashed safety identifier, redaction,
  prompt hashing, refusal handling, local validation, and exact manifest
  evidence resolution. Preserve this implementation.
- The analyst receives a caller-selected concept and rejects model attempts to
  change it, which is correct only after a deterministic concept router makes
  the selection. The Worker currently bypasses that missing router by always
  passing leakage.
- Stable instructions already describe leakage and imbalance, but there is no
  selected-pack registry/version, sensitive-excerpt approval boundary, or API
  that returns the exact sanitized preview before the call.
- `ApprovedSampleBeliefAnalyst` correctly rejects every non-sample SHA. The
  release bug is the Worker choosing this analyst for all non-live sessions,
  not weakness in the analyst itself.
- Evidence resolution indexes `cell.outputHashes` by original notebook
  `outputIndex`, while the parser stores only accepted output hashes densely;
  a skipped unsafe output before a safe metric can make an otherwise valid
  evidence reference unresolvable. Held-out output-order variants should cover
  this before changing the manifest contract.
- Codex client already defines live/replay/disabled compilers, bounded inputs,
  stable app-server event validation, provider-agnostic model selection, prompt
  builders, replay metadata, and typed setup failures. Preserve the local
  adapter compiler as an advanced proof.
- Current compile prompts authorize three local artifacts including Python and
  an allow-listed command set. Hosted Studio needs a separate plan-only input
  and compiler that permits only `experiment-plan.json`, `patch-plan.json`, and
  display-only `public-rationale.md`, with no generated commands executed.
- Current sanitized events correctly suppress reasoning, raw response items,
  agent prose, unknown notifications, raw paths, and obvious secrets. The event
  contract still exposes generic command text and file basenames and lacks job
  IDs/timestamps, allowed generated path typing, expected verifier values,
  result-ready hashes, failure codes, and cursor sequencing.
- App Server transport performs the stable stdio JSONL handshake, starts an
  ephemeral isolated thread/turn, disables approvals and network, bounds
  protocol/stderr output, denies all server-initiated interactions, validates
  installed protocol responses, and terminates the process. This is the hosted
  runner's reusable process client.
- Live compiler health intentionally fails unless an OS-enforced launch boundary
  is configured. A hosted runner must supply its own container/process boundary
  rather than enabling the unit-test escape hatch.
- The local Bubblewrap boundary validates auth file ownership/permissions,
  stages and revokes credentials, clears inherited environment, masks parent
  environment access, mounts a bounded workspace/runtime, disables network
  namespace access, and has explicit credential/read-isolation probes. Preserve
  this as the advanced local generated-adapter proof.
- The Python leakage fixture/kernel are deterministic and generate the verified
  dramatic gap from real scikit-learn computation. Canonical hashing, overlap,
  feature fingerprints, sample sizes, seed, and chart data are fixed-code
  outputs and should not be rewritten.
- The kernel is currently hard-coded to the public customer column/feature names,
  exactly three run configurations, and one public CSV. Its HTTP service accepts
  only `{}` or the exact public fixture request, so it is not yet an
  artifact-specific Experiment Plan v2 interpreter.
- The deterministic forecasting transfer evaluator is correct for leakage but
  is a module-global fixed task. Concept registry routing and an imbalance
  transfer evaluator are absent.
- The Python AST policy is a strong existing local generated-adapter defense;
  hosted plan-only execution should not depend on it, but must preserve it for
  the advanced local path.
- Public patching is intentionally exact-sample-only: it requires known cell
  IDs/index, fixture metadata, stored kernel payload, and exact code fragments.
  It deterministically edits one evaluation cell on a copy, recomputes outputs,
  and rejects metadata/nbformat/cell/dependency drift, hardcoded metrics,
  overlap, retained identity, nondeterminism, and noncanonical bytes.
- An artifact-specific patch compiler therefore needs a typed patch plan that
  resolves allowed evaluation cells and transformations from the manifest, plus
  a fixed interpreter and the same invariant classes. It must return UNVERIFIED
  outside supported patterns instead of routing to this exact sample patch.
- The frozen leakage verifier independently validates exact run contracts,
  metric/sample/overlap ranges, zero group overlap, baseline overlap,
  discriminating gaps, identity ablation, controlled variables, chart equality,
  canonical hashes, active mutation probes, resource/network enforcement,
  hidden-artifact isolation, support status, and 12 seeded critical mutations.
- The verifier is intentionally hard-coded to leakage result v1 and its three
  run IDs. Hosted Plan v2 needs a pre-execution plan verifier tied to the
  selected concept pack, while result verification should dispatch to distinct
  leakage/imbalance contracts rather than making this verifier generic by
  weakening its exact invariants.
- Optional active evidence is explicit: missing probes become limitations, not
  invented verification. Preserve that honesty in hosted job reports.
- The runner is currently an in-process/local batch library, not a service. It
  has fresh-workspace containment, strict file/depth/size validation, plan v1
  checks, Docker execution, host-side active probes, sanitized counterexamples,
  and a two-repair orchestrator, but no HTTP API, signed job token, queue,
  callback, cursor, cancellation, or operational metrics.
- Local Docker enforcement is concrete: no network, read-only root, non-root
  UID, dropped capabilities, no-new-privileges, pids/memory/CPU/file limits,
  bounded tmpfs and output mounts, no inherited credentials, exact output set,
  and host recomputation outside the candidate.
- Hosted plan-only execution can reuse the orchestrator/counterexample model but
  should replace candidate Docker execution with structural plan verification
  plus a fixed operation interpreter. Codex App Server itself still requires a
  process/container boundary.
- Proof Bundle code is a strong authority boundary: it recomputes the event
  chain, checks session/concept/artifact/evidence/output-hash lineage, verifies
  content hashes, and optionally validates HMAC with timing-safe comparison.
- The public replay route does not use `reconstructReplay`; it returns one
  hand-shaped compiler summary/result/patch payload. The UI discards even that
  payload. A Studio replay must be issued from stored event and result objects
  and expose a cursor-safe read-only session.
- `createSampleReasoningProof` and sample transfer/patch builders hardcode the
  leakage replay and sample proof shape. They are valid only behind explicit
  sample lesson mode and cannot serve uploaded artifacts.
- The recorded Codex trace is genuine and honest: two rejected repair attempts,
  then a separate later verified run; generation isolation remains PARTIAL while
  candidate execution isolation is verified. Preserve this wording and do not
  recast the later run as repair 3.
- Current official Cloudflare docs position Containers as Container-backed
  Durable Objects suitable for explicit short-lived jobs, with manual named
  instance lifecycle, ephemeral disk, rolling deploys, and beta/no-SLA caveats.
- Cloudflare now supports deny-by-default container internet plus allowed-host
  and trusted outbound-handler controls. This permits a phase boundary: Codex
  App Server can reach only its authenticated model endpoint, while fixed plan
  verification/kernel execution runs with outbound internet disabled.
- The installed Wrangler 4.110.0 schema supports containers, Durable Objects,
  Workflows, and Queues. The current CounterLab config has only assets, D1, R2,
  and observability; it has no runner binding/migration yet.
- A live account probe succeeded: the configured account has container write
  permission and existing ready Container deployments. Cloudflare Containers
  are therefore the preferred implementable runner plane for this repository,
  not merely a fallback design.
- Containers remain beta and require Workers Paid usage; the architecture must
  document this release risk and preserve an authenticated process-service
  fallback interface.
- Existing Worker tests cover typed health/errors, sample proof completion,
  prediction immutability, optimistic D1 conflicts, and the genuine replay
  summary. They create only the sample artifact and contain no non-sample
  result/patch leakage regression.
- Existing React tests explicitly expect live mode to create a live sample and
  terminate at `Local runner required`; this test encodes the release blocker
  and must be replaced by an uploaded-artifact job flow test.
- Existing browser tests strongly cover sample lesson clarity, immutability,
  refresh, transfer gate, replay label, unsupported intake, keyboard, and reduced
  motion. They lack a test runner live upload, event reconnect, interactive
  recomputation, second concept, artifact patch download, or proof share.
- Playwright correctly uses the mandated CloakBrowser executable. The test
  harness starts Wrangler/Vite locally and applies D1 migrations.
- `styles.css` contains several later generations of repeated `.topbar`,
  `.landing`, `.workspace`, `.footer`, and media-query rules. Cascade overrides,
  not a coherent token/component layer, now determine much of the UI.
- The first authority guard is now enforced before mutation: sample lessons can
  be created only for the approved sample SHA, and bundled results/patches can
  be used only by an instant sample session. Uploaded live sessions retain their
  prior state when such a route is attempted.
- Worker/client health can now express a configured runner binding; public copy
  advertises only the released leakage concept.

## Technical Decisions

| Decision | Rationale |
| --- | --- |
| Treat current user priority order as the implementation sequence | It directly addresses known false authority before adding surface area. |
| Keep replay immutable and visibly separate | A replay can demonstrate genuine evidence but cannot satisfy live artifact-specific gates. |
| Reuse jobs only when session, artifact, kind, and state version match | This makes submission idempotency explicit without suppressing a legitimate retry after a failed job advances session state. |
| Implement cancellation through the Worker and process boundary | A browser-only polling abort does not cancel scientific work or prevent a late result. |
| Register only observed fixed-ML authority before new engines | CounterLab kernel, NumPy, pandas, and scikit-learn own current computation. SciPy remains transitive/SBOM-only until a reviewed adapter uses it. |

## v5.1 production authority audit

- The deployed Worker and Container binding are current and healthy, remote D1
  migrations are applied, and previously recorded untouched leakage and
  imbalance sessions include artifact-bound live analyst, compiler, kernel,
  transfer, patch, reasoning, and Proof Bundle evidence.
- Public `/ready` currently resolves to SPA HTML and `/api/ready` is absent.
  Container health exists only on the internal runner route; Worker health
  reports configuration by binding/secret presence rather than probing the
  process plane.
- Event APIs reconnect from a nonzero cursor, but browser refresh restarts from
  cursor zero. `CANCELLED` is a legal terminal status with no public route or
  runner abort. Callback idempotency is strong, while submission idempotency is
  implicit and lacks a reusable-job query or production double-submit proof.
- Both production patch downloads open as nbformat 4 notebooks, and both
  existing Proof Bundle v2 downloads validate. The portable `.counterlab`
  Proof Capsule required by v5.1 does not exist yet.
- Public assets and inspected compiler streams contained none of the tested
  credential, private-key, raw-notebook, or private-reasoning patterns.
- The current production smoke script fails closed and executes sample,
  replay, leakage, and imbalance journeys, but it emits prose only. It does not
  preserve a JSON report binding deployment, timestamps, stages, concepts, and
  result/download hashes.

## v5.1 scientific-engine audit

- Production currently runs Python 3.12.13 with NumPy 2.4.6, SciPy 1.18.0,
  scikit-learn 1.9.0, and pandas 2.3.3. SciPy is installed transitively rather
  than declared directly. Local development uses Python 3.14.5.
- A no-network `solve_ivp` health probe matched the 100 m analytic vacuum impact
  time to approximately 8.9e-16 seconds for that specific environment. This is
  an engine health observation, not a released educational result.
- NumPy, SciPy, and scikit-learn each initialized 24 compute threads in the
  inspected runner. Fixed child environments do not yet cap BLAS/OpenMP
  threads, so resource determinism is incomplete.
- The existing production image is approximately 747 MB; installed NumPy,
  SciPy, and scikit-learn directories are approximately 68, 138, and 48 MiB.
- The supplied registry JSON Schema file is absent. The repository also lacks
  a scientific-engine registry, collected license notices, repository-level
  SBOM, hash-locked Python artifacts, engine drift fixtures, and health report.
- Admission recommendation: register current pinned NumPy and scikit-learn;
  make SciPy 1.18.0 direct and use it for bounded ODEs/constants; admit Pint as
  a unit validator, SymPy only for fixed/test oracles, and Hypothesis only as a
  test generator when physics begins. Defer Vega-Lite unless the existing
  renderer is insufficient, and omit Rapier, Pyodide, NetworkX, math.js, and
  chemistry engines from the critical path.
- Base images use tags rather than digests, `requirements.lock.txt` has no
  artifact hashes, and the primary runner Dockerfile has no final non-root
  `USER`. These are release-governance risks to close before physics.

## v5.1 production authority closure

- Worker `ae01fe03-731f-4939-849f-e8f4eaec7f51` and Container version 10/image
  digest `sha256:2b15a35b7f938d754467cadabf8a2f12d085c4436d5f28791cb6add6d2b7bbe1`
  passed one exact-version smoke from 2026-07-15T13:20:35Z through
  2026-07-15T13:31:38Z.
- All seven stages passed: public readiness, capability, public-secret scan,
  sample, replay, untouched live leakage, and untouched live imbalance.
- Leakage proved compile reuse, nonzero-cursor reconnect, scoped cancellation
  with no result, duplicate-cancel reuse, fixed result, transfer-gated patch,
  patched-notebook download, and proof validation.
- The smoke exposed one real lost-dispatch recovery defect before the final
  pass. Regression-first repair now redelivers one ambiguous/5xx dispatch using
  the same job authority, never retries a definitive 4xx, and reacquires a
  missing fixed result after refresh even when an old run checkpoint exists.
- The Worker retains the P-256 private signing key; the deployed secret list no
  longer contains the legacy symmetric signing secret. The Container receives
  only the public verification key.
- `docs/PRODUCTION_SMOKE.json` is byte-identical to the generated report and has
  SHA-256 `d74795a13034293483a1a0375d3906643a3dd2ba3472d8fae3498b6894430bb2`.
- The earlier audit findings about missing readiness, cancellation, cursor
  persistence, duplicate-action proof, and JSON evidence are resolved. Browser
  history navigation, scientific contracts, and v5.1 product simplification
  remain separate pending work.

## Issues Encountered

| Issue | Resolution |
| --- | --- |
| Large constitution output exceeded one tool response | Read all 1,187 lines in four bounded ranges. |
| Worker API remainder exceeded one tool response | Re-read the remainder in two bounded ranges. |

## Resources

- `AGENTS.md`
- `README.md`
- `docs/PROGRESS.md`
- `docs/ACHIEVED_METRICS.json`
- `docs/AUTHORITY_BOUNDARIES.md`
- `docs/THREAT_MODEL.md`
- `CounterLab_Codex_Master_Build_Prompt.md`
- `package.json`, `apps/web/package.json`, `pyproject.toml`
- Repository tree captured on 2026-07-15.
- Remaining required documents and code inspection are still in progress.

## Visual/Browser Findings

- The read-only v5.1 UX audit confirmed strong existing authority cues: the
  current product keeps sample/live/replay labels visible, requires approval of
  sanitized analyst input, uses immutable prediction controls, binds displayed
  leakage and imbalance values to verified fixed-kernel runs, preserves an
  accessible results table, honors reduced motion, and renders its existing
  generated proof through a constrained action-free component catalogue.
- The checked-in experience does not yet implement the v5.1 learner model:
  there is no chat-first question surface, six-stage vocabulary, tri-state
  verdict, Boundary Map, Experiment Theater, guided/challenge mode, or `/judge`
  route. The permanent Agent Rail and Proof Console also conflict with the
  required collapsed Activity and Evidence & proof disclosures.
- Accessibility debt is measurable rather than cosmetic: many Studio labels
  render at 8--12 px, several stage/command controls are below 44 px, there is
  no skip link, top-level stage changes do not restore focus, the command
  palette lacks a focus trap/return path, and proof tabs do not implement the
  ARIA tab keyboard pattern.
- Async browser resilience is incomplete: the event cursor lives only in React
  state and reconnect helpers restart from zero; no learner-visible cancel
  action exists; duplicate submission, async-phase refresh, and browser
  back/forward are not covered end-to-end.
- Performance is currently unmeasured. The audit found no Web Vitals
  instrumentation or route-level lazy loading; `App.tsx` and the accumulated
  global styles remain large conflict surfaces that should be split by product
  responsibility only after authority contracts are stable.

## 2026-07-16 v5 LAB_RUN authority findings

- Raw compiler file SHA-256 values and canonical Experiment IR hashes are
  distinct authorities. The run envelope preserves both and never compares a
  pretty-printed file hash to a canonical semantic hash.
- The fixed fixture materially determines every displayed metric, so the v5 run
  binds its ID, version, descriptor hash, and generated content hash.
- Dispatch must branch on job kind before schema version. Otherwise a v5
  `LAB_RUN` is incorrectly sent through the scientific Codex compiler instead of
  the fixed kernel.
- Result readiness is a verifier-owned event. The runner can report successful
  fixed execution, but only the Worker has the independent evidence needed to
  release `SUPPORTS` or `INCONCLUSIVE` to a browser.
- The generated Experiment IR v5 JSON Schema already ships in the Python
  package. Validating against it at the process boundary closes executable and
  unknown-field drift without duplicating the TypeScript schema manually.

## 2026-07-16 v5 result-release authority findings

- Verification cannot safely run while the runner can still append events or
  overwrite its output object. The job now enters `AWAITING_APPROVAL` first and
  the Worker verifies an immutable authority copy of the exact result bytes.
- Result readiness is a control-plane fact. V5 runners are forbidden from
  publishing verifier or readiness events; the Worker appends them only after
  fixed technical and epistemic verification.
- Cross-store callback recovery requires deterministic, prefix-reconcilable
  Worker events and exact immutable hashes. Callback idempotency must remain
  valid after the learner advances beyond the result stage.
- Valid inconclusive evidence is an educational result, not a technical
  failure. The v5 callback invokes the epistemic verifier directly so a valid
  `INCONCLUSIVE` outcome can be released without weakening technical checks.
- Leakage and class imbalance now have direct Worker integration coverage.
- A valid fixture hash did not by itself protect the declared fixture summary,
  kernel version, or top-level seed. Rehashed forgeries initially passed the
  technical verifier; frozen per-pack result authority now rejects all five
  tested mutations before result release.
- Browser Belief Spec v2 presentation, fixed transfer routing, and interactive
  exploration are now closed locally. Interactive v5 has a distinct purpose,
  fixed cross-language derivation, frozen compile/result authority, and never
  replaces the authoritative Evidence Verdict.
- The v5 Patch Plan and portable proof boundaries remain separate blockers. The
  current schemas require v1 Belief Test authority and must be versioned rather
  than populated by casting a Belief Spec v2 into a legacy field.
