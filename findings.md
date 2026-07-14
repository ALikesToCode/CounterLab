# Findings: CounterLab Studio upgrade

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

- None yet.
