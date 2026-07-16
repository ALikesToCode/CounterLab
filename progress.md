# Progress Log: CounterLab Studio upgrade

## v5 two-concept patch authority — 2026-07-16

- Added a strict v5 Patch Compile bundle carrying Belief Spec, Prediction,
  frozen Experiment IR/selection/Plan lineage, Worker Evidence Verdict,
  epistemic report hash, full deterministic transfer, and bounded patch scope.
- Bound the Subject Pack transfer contract separately from its concrete fixed
  evaluator task; the Worker and independent Python verifier check both.
- Routed the hosted runner through Patch Plan generation and the fixed Python
  patch engine without exposing notebook bytes before external verification.
- Added a Worker integration that observes a real Patch Plan rejection, keeps
  source sealed, repairs on attempt two, verifies again, and then permits only
  the scoped source notebook.
- Closed the callback on an exact ordered four-output set, froze Patch Plan,
  display-only rationale, verification report, Patch Result, and patched
  notebook under Worker-owned authority, and proved duplicate recovery after
  mutable runner outputs were deleted.
- Native v5 stops at `PATCH_VERIFIED`; it does not issue the Belief-Test-based
  legacy Proof Bundle. Boundary Map, Reasoning Diff v2, and Proof Capsule v2
  remain pending.
- Added the equivalent class-imbalance Worker journey from fixed result through
  transfer, scoped source release, verified Plan, exact callback hashes, frozen
  copied notebook, and `PATCH_VERIFIED`.
- Preserved own JSON `__proto__` keys in the two historical canonicalizers;
  then replaced object materialization with one direct canonical writer shared
  by contracts, sessions, Proof Bundles, and Experiment IR. TypeScript and
  Python now match integer-like, non-BMP Unicode, dangerous-key, number, and
  normalization-preservation vectors and reject lone surrogates.
- Verification for this slice: Worker API 54/54, concept registry 12/12,
  strict repository TypeScript passed, relevant v5 patch/runner tests 83/83,
  hosted Python patch tests 9/9, and proof/session canonical tests 39/39. No
  build, dev server, deployment, browser journey, or production smoke was run
  for this slice.
- After aligning a stale epistemic test factory to frozen fixture authority and
  making current lock drift from the recorded image explicit, the full suites
  pass 373 root TypeScript, 136 web/Worker, and 126 Python tests plus strict
  typechecking. The current image remains stale by design and is not promoted.

## v5.1 Scientific Engine Edition — 2026-07-15

- Began the new implementation mandate under the supplied Ultra Execution
  Policy.
- Read the planning-with-files, test-driven-development, parallel-agent, and RTK
  workflows.
- Rebased `task_plan.md` onto the non-negotiable v5.1 phase order.
- Confirmed the repository began this phase with no uncommitted files.
- Logged and corrected one stale-context planning-file patch failure.
- At the opening checkpoint, no new v5.1 engineering or release claim had been
  made; the entries below record the subsequent work.
- Read the current README, progress matrix, and decision history. Recorded the
  already-proven production evidence and identified stale v5 vocabulary and one
  contradictory deployment sentence for Phase 2 documentation repair.
- Read support, architecture, evaluation, release, achieved metrics, upgrade,
  authority, and threat-model documents. Logged stale production/isolation
  claims and isolated pre-v5.1 achievements from still-unimplemented v5.1 gates.
- Ran `./scripts/test-all.sh`: 170 root TypeScript, 79 web, 136 Python, all
  typechecks, current local migrations, and 13 CloakBrowser journeys passed; 2
  credentialed live journeys skipped locally as designed.
- The local Cloudflare runner build resolved to the recorded image digest
  `sha256:167a207956b5efc6b28702d905d2eafaad8e0502da75e3df1de3a38a9927a636`.
- Ran `./scripts/release-check.sh`: 170 root TypeScript, 79 web, 136 Python,
  13 local browser journeys (2 credentialed live skips), leakage 12/12,
  imbalance 12/12, held-out routing 10/10 and fixed completion 7/8, sandbox
  smoke, production build, metrics generation, replay reproduction, patch
  verification, and the 334-file secret scan passed.
- Refreshed `docs/HELD_OUT_RESULTS.json` from that real baseline run; only the
  execution timestamp and measured durations changed.
- Phase 0 baseline is complete. Phase 1 production authority is now closed by
  exact deployment evidence; Phase 2 documentation propagation is active.
- Completed the read-only production audit against the live Worker, Container,
  D1, stored live leakage/imbalance evidence, downloads, event cursors, and
  public assets. It confirmed current live authority and isolated four missing
  gates: a public readiness proxy, real cancellation, explicit active-job
  reuse, and a machine-readable production smoke report.
- Added regression tests first. They failed against the old behavior exactly as
  expected: `/ready` returned 404, a repeated compile returned 409, the runner
  had no readiness/cancel methods, the process service had no abort signal, and
  the job service had no state-bound lookup or idempotent cancel operation.
- Implemented state-bound active job reuse for live compile/patch jobs, a
  fail-closed public `/ready`, signed runner-token verification inside the
  process plane, scoped cancellation through Worker → dispatcher → hosted
  runner, optimistic/idempotent `CANCELLED` persistence, and abort propagation
  into Codex/fixed-process execution.
- Moved runner-token signing/verification into shared session core so both the
  Worker and process plane enforce the same contract. The Worker retains the
  P-256 private signing key; the Container receives only the derived public
  verification key. Generated child commands receive neither signing material
  nor model credentials.
- Focused verification after the implementation: 42 root runner/compiler tests
  passed; 37 Worker/D1/dispatcher/deployment tests passed; strict repository
  TypeScript passed.
- Broad verification after cancellation propagation: 173 root TypeScript tests
  and 82 Worker/UI tests passed; strict repository TypeScript passed. The new
  active-turn cancellation regression completes in about 56 ms instead of
  waiting for the 5-second App Server timeout.
- Deployed Worker `ae01fe03-731f-4939-849f-e8f4eaec7f51` with Container version
  10 and image digest
  `sha256:2b15a35b7f938d754467cadabf8a2f12d085c4436d5f28791cb6add6d2b7bbe1`.
- Exact-version production smoke passed readiness, capability, public-secret
  scan, sample, replay, untouched leakage, and untouched imbalance. Leakage
  additionally proved cursor reconnect, cancellation without result, duplicate
  action reuse, patch download, and Proof Bundle validation.
- Committed the byte-identical, secret-free report as
  `docs/PRODUCTION_SMOKE.json` (SHA-256
  `d74795a13034293483a1a0375d3906643a3dd2ba3472d8fae3498b6894430bb2`).

The historical Studio progress below remains evidence for the pre-v5.1 release,
not proof that new v5.1 gates pass.

## Session: 2026-07-15

### Phase 1: Repository and blocker discovery

- **Status:** in_progress
- **Started:** 2026-07-15
- Actions taken:
  - Re-read the complete 1,187-line repository constitution in bounded ranges.
  - Loaded the file-planning and strict test-first workflows.
  - Created persistent task, findings, and progress working files.
  - Read the current README and progress/acceptance matrix; recorded the gap
    between verified leakage evidence and the hosted artifact-specific path.
  - Read achieved metrics and the authority matrix; identified the existing
    local adapter compiler as a separate proof to preserve, not the hosted plan
    execution model.
  - Read the threat model and original master prompt; catalogued new runner-token,
    callback, cursor, and queue threats without weakening the established model,
    kernel, verifier, learner, or replay authority.
  - Inspected the complete repository tree, package scripts, Git baseline, and
    installed runtimes; confirmed the absence of a hosted runner, registry,
    imbalance pack, held-out matrix, and study support.
  - Completed the Worker API route audit and located the exact hard-coded
    sample/live boundaries for the first regression suite.
  - Read the first 700 lines of the React application and recorded the false
    two-concept claim, local string modes, leakage-specific Belief copy, and
    local-storage-only resume architecture.
  - Audited React through the result/transfer state boundary; found hidden
    verifier evidence, sample-only accessible chart text, and browser-only
    replay progression.
  - Completed `App.tsx`; verified that live setup starts on the sample artifact,
    uploads are assigned instant mode, replay discards its API payload, and live
    compile is a dead-end screen.
  - Completed the React API/sample/bootstrap audit; confirmed strict envelope
    validation is reusable, while health/mode/session schemas and bundled sample
    fallbacks need explicit authority separation.
  - Completed the shared contract implementation audit; identified reusable
    integrity/state invariants and the exact v2 plan, runner, mode, result, and
    proof contract gaps.
  - Read session domain/service logic; confirmed strong append-only optimistic
    state handling and found missing artifact/plan/result/patch cross-bindings.
  - Completed SQLite/D1 persistence audit; confirmed atomic optimistic patterns
    and catalogued the runner/project/event-cursor schema missing from migration 0001.
  - Completed notebook parser audit; preserved its intake safety model and
    identified schema-metadata dependence plus imbalance evidence gaps.
  - Completed Belief Analyst audit; confirmed its provider-neutral Responses
    safety/integrity path is reusable and isolated concept routing, preview,
    sensitivity approval, and output-index resolution gaps.
  - Audited Codex types/prompts/fallbacks/sanitizer; isolated the hosted
    plan-only compiler/event additions from the proven local adapter compiler.
  - Completed App Server transport audit; confirmed stable stdio lifecycle and
    isolation checks are reusable inside a process-capable runner.
  - Completed credential/read-isolation audit; recorded the strong local proof
    boundary that should remain separate from hosted plan interpretation.
  - Audited the fixed leakage fixture/experiment/service/transfer/AST policy;
    preserved deterministic numeric authority and identified the missing plan
    interpreter and generic concept routing.
  - Completed public patch engine audit; preserved its strict sample proof and
    scoped the new artifact-specific patch-plan interpreter/verifier boundary.
  - Completed the 890-line frozen leakage verifier audit; retained its exact
    active-mutation authority and scoped concept-dispatched plan/result verifier
    additions.
  - Completed runner workspace/pipeline/orchestrator/Docker audit; established
    the exact reusable local controls and the missing hosted job-service layer.
  - Audited proof/replay/sample builders; retained full chain validation and
    identified the API/UI summary replay and hard-coded sample proof boundary.
  - Read the Cloudflare Container skill/references, current official docs,
    installed Wrangler schema/config, and performed a read-only account probe;
    confirmed the account can host the native runner plane.
  - Inventoried unit/Python/browser tests and read the Worker/React critical
    suites; found missing sample-leakage tests and blocker-encoding UI tests.
  - Audited the E2E harness and stylesheet structure; confirmed CloakBrowser is
    configured and found multiple cascade generations in the CSS monolith.
  - Added red authority regressions. They reproduced sample session acceptance
    (201), sample result attachment (200), sample patch persistence before a 500,
    false two-concept copy, and rejection of configured runner health.
  - Added artifact/mode/result/patch guards and configured runner capability;
    the focused Worker/UI suite now passes 22 tests.
  - Added and passed a copied-sample regression: an upload with identical bytes
    cannot acquire the registered sample lesson's authority.
  - Added the strict discriminated `SessionMode` contract for sample lesson,
    live notebook, and verified replay; cross-mode fields are rejected.
  - Migrated session aggregates, D1/SQLite reads, Worker endpoints, API client,
    and React restore logic to the discriminated mode contract. Legacy stored
    strings normalize on read but are rejected for newly created sessions.
  - Added separate sample/live/replay session routes, retired generic client
    mode selection, made replays read-only, and blocked sample transfer reuse
    by live artifacts.
  - Changed live entry to require an uploaded notebook before creating the live
    session; the bundled sample is no longer substituted for live analysis.
  - Added hosted Runner Job, browser-safe compiler event, callback, token, fixed
    operation, and Experiment Plan v2 contracts with terminal transition rules.
  - Added D1 migration 0002 and a repository that atomically persists optimistic
    jobs, cursor-ordered public events, and append-only callback receipts.
  - Added short-lived HMAC runner grants bound to one job, manifest, sanitized
    input object, output prefix, callback path, state version, and expiration.
  - Generated one Plan v2 JSON Schema into TypeScript and packaged Python
    locations, then added Python schema/lineage/evidence validation and a fixed
    leakage plan interpreter with deterministic interactive run configuration.
  - Added the release-aware concept-pack registry and evidence-backed concept
    router; the Worker no longer hardcodes entity leakage and unsupported or
    insufficient evidence cannot enter model analysis.
  - Added an independent hosted Plan v2 verifier that binds plans to the
    approved Belief Test, artifact manifest, concept pack, allow-listed fixed
    operations, controlled variables, and resolved evidence references.
  - Extended the stable Codex App Server stdio client with a separate hosted
    plan-only compile/repair interface. Hosted turns can create only the strict
    experiment plan and display-only rationale, receive only structured
    verifier counterexamples, and retain the proven local adapter compiler as a
    separate advanced path.
  - Added the Cloudflare runner control-plane boundary: private R2 input/output
    objects, named Container dispatch, scoped job tokens, authenticated start,
    output, event, and callback routes, plus public cursor reconnect.
  - Replaced the live compile dead end with an artifact-specific `LAB_COMPILE`
    job. The Worker binds the bundle to the uploaded manifest, approved Belief
    Test, immutable prediction, and released concept pack, then independently
    re-verifies the returned Plan before advancing the session.
  - Added callback idempotency and fail-closed behavior: a runner-claimed
    success with an invalid Plan becomes `REJECTED`, releases no experiment
    result, and cannot double-append session evidence on retry.
  - Added the authenticated hosted-runner process service. It fetches only the
    scoped sanitized job bundle, starts Codex App Server over stdio, accepts
    only the Plan and public rationale outputs, submits candidates to the
    external Worker verifier, and applies at most two structured repairs.
  - Added the Cloudflare Container deployment boundary and production image.
    The image contains the pinned Codex CLI and fixed Python kernel, excludes
    the hidden verifier, demotes Codex turns to UID/GID 10001, and removes the
    staged authentication file before each model turn.
  - Built and smoke-tested the production runner image: Codex 0.144.4, fixed
    kernel import, and the non-root setpriv identity all passed.
  - Added the artifact-bound `LAB_RUN` contract and fixed Python hosted entrypoint.
    The entrypoint revalidates manifest, Plan, learner-claim, fixture, and
    canonical hashes before composing registered leakage operations.
  - Added Verified Result Set v2 without weakening the stored sample v1 contract,
    plus an independent Worker-side result verifier for Plan lineage, declared
    runs, fixture fingerprints, group overlap, identity removal, discrimination,
    chart consistency, and canonical hashing.
  - Replaced the live result dead boundary with a separate authenticated
    `LAB_RUN` job. The hosted runner makes no new model turn, runs only the fixed
    Python module, emits bounded public events, and releases a result only after
    the Worker verifier passes.
  - Added the hosted artifact-specific patch loop. Codex emits only
    `patch-plan.json` and display-only rationale; the Worker verifies the Plan,
    keeps source bytes sealed until that verification succeeds, and gives the
    source plus Plan to one fixed Python patch entrypoint.
  - Reused the proven notebook patch verifier as fixed authority, bound its
    output to the uploaded source hash/session/job, preserved the source, and
    stored the verified copy privately for an authenticated session download.
  - Added Proof Bundle v2 and live Reasoning Diff issuance containing the exact
    uploaded manifest, Experiment Plan, Patch Plan, fixed result, verifier
    reports, public compiler events, transfer, hashes, and limitations.
  - Generated Patch Plan v1 JSON Schema into both TypeScript and Python package
    locations and validated the Plan independently in Zod, JSON Schema, the
    Worker verifier, and the fixed patch process.
- Files created/modified:
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `docs/FIRST_PRIZE_UPGRADE_PLAN.md`

## Test Results

| Test                                            | Input                                       | Expected                                                                | Actual                                                 | Status |
| ----------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ | ------ |
| Root Vitest                                     | pre-upgrade tree                            | Existing contracts/core/client suites stay green                        | 104 passed                                             | pass   |
| Web Vitest                                      | pre-upgrade tree                            | Existing Worker/UI/API suites stay green                                | 29 passed                                              | pass   |
| Pytest                                          | pre-upgrade tree                            | Existing kernel/verifier/runner suites stay green                       | 98 passed                                              | pass   |
| Typecheck                                       | pre-upgrade tree                            | TypeScript and Worker generated types pass                              | passed                                                 | pass   |
| CloakBrowser E2E                                | pre-upgrade tree                            | Existing judged path stays green                                        | 13 passed in 28.3s                                     | pass   |
| Authority regressions (red)                     | pre-fix Worker/UI                           | Reproduce all five release blockers                                     | 5 expected failures reproduced                         | pass   |
| Authority regressions (green)                   | guarded Worker/UI                           | Prevent sample lineage leaks and accept configured runner health        | 22 passed                                              | pass   |
| Copied-sample authority regression (red)        | sample hash with a different artifact ID    | Reject copied upload as a sample lesson                                 | Expected 201-to-409 failure reproduced                 | pass   |
| Copied-sample authority regression (green)      | sample ID and hash binding                  | Reject copied upload as a sample lesson                                 | 1 focused test passed                                  | pass   |
| Root Vitest                                     | authority and mode-contract slice           | Preserve all contract/core/client behavior                              | 105 passed                                             | pass   |
| Web Vitest                                      | authority and runner-capability slice       | Preserve Worker/UI/API behavior                                         | 34 passed                                              | pass   |
| Typecheck                                       | authority and mode-contract slice           | Strict TypeScript remains valid                                         | passed                                                 | pass   |
| CloakBrowser E2E                                | authority and copy slice                    | Existing lesson, replay, resume, upload, keyboard paths remain valid    | 13 passed in 27.6s                                     | pass   |
| Mode route regressions (red)                    | pre-migration Worker                        | Separate mode endpoints and strict cross-mode bodies                    | 2 expected 404 failures reproduced                     | pass   |
| Live transfer/replay mutation regressions (red) | pre-guard Worker                            | Reject sample transfer for live and all replay writes                   | 2 expected 200-to-409 failures reproduced              | pass   |
| Root Vitest                                     | mode-migrated tree                          | Contracts, persisted state, proof, clients remain green                 | 106 passed                                             | pass   |
| Web Vitest                                      | mode-migrated tree                          | Worker, API, and React mode boundaries remain green                     | 38 passed                                              | pass   |
| Typecheck                                       | mode-migrated tree                          | Strict TypeScript and Worker types pass                                 | passed                                                 | pass   |
| CloakBrowser E2E                                | mode-migrated tree                          | Existing 13 judged paths remain green                                   | 13 passed in 27.7s                                     | pass   |
| Repository Prettier check                       | full repository                             | No formatting differences                                               | 46 pre-existing/unrelated files reported               | fail   |
| Runner contracts (red)                          | pre-contract tree                           | Plan, job, event, callback, and token schemas exist                     | 4 expected undefined-schema failures reproduced        | pass   |
| Runner job service (red)                        | pre-service tree                            | Optimistic jobs, cursors, callbacks                                     | Missing module reproduced                              | pass   |
| Runner token (red)                              | pre-token tree                              | Signed bounded grants                                                   | Missing module reproduced                              | pass   |
| Python Plan interpreter (red)                   | pre-interpreter tree                        | Shared schema and fixed execution                                       | Missing module reproduced                              | pass   |
| Runner contract/service tests                   | hosted runner substrate                     | Structural policy, optimistic transitions, event reconnect, idempotency | 21 passed                                              | pass   |
| D1/token tests                                  | hosted runner substrate                     | D1 atomic persistence and signed grant enforcement                      | 3 passed                                               | pass   |
| Python Plan/kernel tests                        | hosted runner substrate                     | Schema/evidence policy, determinism, unchanged reference hash           | 8 passed                                               | pass   |
| Full `test-all.sh`                              | runner substrate checkpoint                 | Shared, Worker/UI, Python/runner, typecheck, D1 migration, browser      | 113 TS + 41 web + 101 Python + 13 browser passed       | pass   |
| Concept routing                                 | released pack registry                      | Select supported evidence and refuse unsupported/insufficient artifacts | 3 registry + 30 analyst/registry + 42 web tests passed | pass   |
| Hosted plan verifier                            | Plan v2 authority boundary                  | Accept one fully bound plan and reject structured invariant violations  | 2 tests passed; typecheck passed                       | pass   |
| Hosted Codex plan compiler                      | plan-only prompt, two repairs, stable stdio | Constrain outputs and reject executable authority                       | 22 Codex-client tests passed; typecheck passed         | pass   |
| Hosted Worker compile                           | live artifact, scoped token, cursor events  | Verify an artifact-specific Plan without sample authority               | 23 Worker tests passed                                 | pass   |
| Full `test-all.sh`                              | hosted compile checkpoint                   | Shared, Worker/UI, Python/runner, typecheck, D1 migration, browser      | 122 TS + 45 web + 101 Python + 13 browser passed       | pass   |
| Hosted runner unit tests                        | process service and control-plane boundary  | Dispatch, auth, repair, output allowlist, launch isolation              | 9 passed                                               | pass   |
| Runner production image                         | `Dockerfile.runner`                         | Build, pinned Codex, fixed kernel, non-root launch identity             | built; 3 container smoke checks passed                 | pass   |
| Full `test-all.sh`                              | hosted Container runner checkpoint          | Shared, Worker/UI, Python/runner, typecheck, D1 migration, browser      | 131 TS + 45 web + 101 Python + 13 browser passed       | pass   |
| Hosted fixed-kernel result path                 | live uploaded artifact and verified Plan    | Separate LAB_RUN, no Codex turn, independent result verification        | focused Worker, runner, contract, verifier tests pass  | pass   |
| Runner production image                         | hosted fixed-kernel entrypoint               | Rebuild after Plan execution integration                                | built successfully                                     | pass   |
| Full `test-all.sh`                              | artifact-specific LAB_RUN checkpoint         | Shared, Worker/UI, Python/runner, typecheck, D1 migration, browser      | 137 TS + 45 web + 102 Python + 13 browser passed       | pass   |
| Hosted artifact-specific patch                  | uploaded notebook, verified result, passed transfer | Plan-only Codex, sealed source, fixed patch, download, Reasoning Diff/Proof v2 | focused Worker/runner/Python/proof tests passed | pass |
| Full `test-all.sh`                              | hosted patch and live proof checkpoint        | Shared, Worker/UI, Python/runner, typecheck, D1 migration, Docker image, browser | 142 TS + 45 web + 103 Python + 13 browser passed | pass |

## Error Log

| Timestamp  | Error                                                                                             | Attempt | Resolution                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-15 | Full `AGENTS.md` output truncated                                                                 |       1 | Re-read using bounded `sed` ranges.                                                                                       |
| 2026-07-15 | Worker API remainder output exceeded the available model context                                  |       1 | Switched to bounded reads of at most 200 lines.                                                                           |
| 2026-07-15 | Combined plan/progress patch used stale task-plan table context                                   |       1 | Split document creation from exact-context progress updates.                                                              |
| 2026-07-15 | Root Vitest config excluded the targeted Worker test                                              |       1 | Switched to the web Vitest configuration.                                                                                 |
| 2026-07-15 | Combined Git diff output exceeded the response budget                                             |       1 | Switched to bounded status, stat, and per-file diff inspection.                                                           |
| 2026-07-15 | Focused mode-migration failures emitted a truncated DOM dump                                      |       1 | Isolated the four failures from the summary and switched to individual reruns.                                            |
| 2026-07-15 | Repository-wide Prettier check reported 46 existing style differences                             |       1 | Formatted all changed code and kept unrelated generated/replay files untouched; use diff-local validation for this slice. |
| 2026-07-15 | Full typecheck rejected the D1 test adapter's `unknown` SQL values and cross-runtime URL overload |       1 | Cast binds to Node `SQLInputValue` and resolved migration files through `fileURLToPath`.                                  |
| 2026-07-15 | Combined App Server source inspection exceeded the response context                               |       1 | Switched to bounded reads around the compiler implementation.                                                             |
| 2026-07-15 | Hosted compiler typecheck rejected `plan` as an internal run phase                                |       1 | Extended the validated transport phase union to include hosted plan compilation.                                          |
| 2026-07-15 | Runner-event API client typecheck found an incorrect error-class name                             |       1 | Used the existing `ApiClientError` contract for local cursor validation.                                                  |
| 2026-07-15 | Progress update patch used stale pre-format table context                                         |       1 | Re-read the formatted table and applied the update against exact context.                                                 |
| 2026-07-15 | Progress search command contained an unescaped backtick                                           |       1 | Re-ran the bounded search with a single-quoted plain pattern.                                                             |
| 2026-07-15 | Combined progress/task-plan patch missed the task plan's formatted row                            |       1 | Split the documentation updates and patched each exact formatted table independently.                                     |
| 2026-07-15 | Candidate verification advanced the reconnect cursor with a verifier event                        |       1 | Updated the regression to require the file event and independent verifier event.                                          |
| 2026-07-15 | Hosted runner event helper lost variant fields under non-distributive `Omit`                      |       1 | Added a distributive payload type and kept Zod validation at emission.                                                    |
| 2026-07-15 | Prettier had no parser for the Dockerfile and `.dockerignore`                                     |       1 | Kept them hand-audited and validated them with Docker and Wrangler.                                                       |
| 2026-07-15 | Container constructor used the default unknown Durable Object props type                          |       1 | Bound it to the Container base class's empty props type.                                                                  |
| 2026-07-15 | Resuming the prior Docker build referenced an expired process ID                                  |       1 | Verified no image existed, then reran the cached build with concise progress.                                             |
| 2026-07-15 | Runner image omitted `/usr/sbin`, so the installed `groupadd` command was unreachable             |       1 | Added the standard sbin directories to the explicit production `PATH`.                                                    |
| 2026-07-15 | Corepack failed on an unresolved Yarn shim in the mixed Node/Python image                          |       1 | Installed the declared `pnpm@11.12.0` directly and removed Corepack from the build.                                       |
| 2026-07-15 | Full tests found strict JSON parsing incompatible with Prettier's Wrangler JSONC trailing commas   |       1 | Preserved `wrangler.jsonc` as strict JSON, which remains a valid Wrangler configuration.                                  |
| 2026-07-15 | The LAB_RUN contract test referenced a Plan constant outside its describe scope                    |       1 | Moved the lineage test beside the shared hosted Plan fixture.                                                             |
| 2026-07-15 | Hosted-runner tests imported session-core solely to calculate fixture hashes                       |       1 | Kept the runner dependency boundary narrow and used valid opaque hashes in the unit fixture.                              |
| 2026-07-15 | Filtered hosted-runner Vitest command used an extra argument separator and found no tests          |       1 | Ran the files through root Vitest with explicit paths.                                                                    |
| 2026-07-15 | Web Vitest filter was executed from the wrong include root                                          |       1 | Re-ran from `apps/web` using its local Vitest configuration.                                                               |
| 2026-07-15 | Optional Python `black` formatting probe was unavailable                                           |       1 | Kept the files manually formatted and verified them with pytest and `git diff --check`.                                    |
| 2026-07-15 | Result-verifier typecheck exposed entity-field assumptions on future imbalance runs                |       1 | Narrowed leakage run specs explicitly before accessing entity-specific fields.                                           |
| 2026-07-15 | Combined runner-job, Worker API, and D1 repository inspection exceeded one response budget           |       1 | Returned to bounded reads of no more than 200 lines around each relevant symbol.                                          |
| 2026-07-15 | Shared runner-token move exposed TypeScript 7's stricter `BufferSource` generic                       |       1 | Returned a concrete `Uint8Array<ArrayBuffer>` from base64 decoding; full typecheck passed.                                 |
| 2026-07-15 | First broad Worker run found a missing brace in the new R2 readiness probe                            |       1 | Repaired the bounded branch, reran its focused API test, then reran all 255 TypeScript/Worker tests and typecheck.           |

## v5.1 delegated audit evidence

| Workstream | Scope | Verification | Result | Status |
| --- | --- | --- | --- | --- |
| UX/accessibility baseline | Existing React shell, Studio components, hooks, styles, browser coverage | 6 focused Vitest files / 23 tests; strict web TypeScript | 23 passed; typecheck passed; no files changed | pass |
| Production authority audit | Deployed Worker/Container/D1, two live concepts, events, downloads, scripts | Exact-version seven-stage production smoke plus focused recovery tests | All stages passed; committed report binds deployment and evidence hashes | pass |
| Scientific engine audit | Current image/manifests plus official source, license, version, size, determinism evidence | local/image `pip check`; no-network SciPy health probe; thread inspection | dependency health passed; registry/SBOM/hash locks/thread policy absent | partial |

The audit also recorded the v5.1 gaps now sequenced behind the production
authority and scientific-contract gates: chat-first entry, six-stage learner
vocabulary, tri-state verdict, Boundary Map, progressive disclosure, `/judge`,
minimum type/target sizes, focus management, cursor persistence, cancellation,
async browser journeys, and measured performance.

## 5-Question Reboot Check

| Question             | Answer                                                                              |
| -------------------- | ----------------------------------------------------------------------------------- |
| Where am I?          | Phases 8–9 downstream v5 authority: artifact patch and Proof Capsule next.           |
| Where am I going?    | Boundary Map, simpler Theater, optional verified physics, and final requalification. |
| What's the goal?     | A real public artifact-specific CounterLab Studio with two verified concepts.       |
| What have I learned? | See `findings.md`.                                                                  |
| What have I done?    | Closed v5 compile/result/browser/transfer authority while preserving v1/v2 evidence. |

## 2026-07-16 v5 fixed-run checkpoint

- Commit `37bf938` added the versioned v5 `LAB_RUN` to the hosted runner union
  and routes it to the fixed kernel before any Codex compiler branch.
- The v5 runner uploads only `verified-result.json`, publishes a bounded command
  event, and withholds `result.ready` until the Worker verifies the result.
- The Python entrypoint validates exact top-level/hash sets, Experiment IR v5
  JSON Schema, Belief/Prediction/session lineage, fixed scorer selection,
  projected Plan parity, the registered fixture descriptor, and the computed
  fixture content hash before returning output.
- Focused evidence: 8 Python plan/imbalance tests passed; 22 Experiment IR,
  runner, and fixed-kernel tests passed; strict TypeScript, touched-file
  Prettier, and `git diff --check` passed.
- Active gate: Worker-side epistemic result verification and atomic tri-state
  persistence. V5 interactive, transfer, patch, proof, Boundary Map, UI, and
  release work remain downstream.
- No build, dev server, deployment, or production smoke was run for this slice.

## 2026-07-16 v5 epistemic result-authority checkpoint

- Commit `36d8157` makes the Worker the only authority that can emit
  `verifier.verified`, `verifier.rejected`, or `result.ready` for v5 runs.
- The Worker closes runner writes at `AWAITING_APPROVAL`, freezes and re-reads
  the exact result bytes, reconstructs compile and run lineage, and persists
  technical verification, epistemic verification, and the tri-state verdict.
- `SUPPORTS` and valid `INCONCLUSIVE` results advance atomically;
  `REJECTED` stores a no-release verdict and exposes fixed counterexamples.
- Callback retry tests cover partial Worker-event append, learner progression,
  late runner events, mutable-output tampering, extra hashes, and duplicate
  rejection evidence.
- Verification: 123 Web/Worker tests and 68 focused authority tests passed;
  repository and Worker TypeScript checks plus `git diff --check` passed.
- Next gate: direct class-imbalance Worker callback integration, followed by v5
  interactive controls, transfer, patch, Reasoning Diff, and proof lineage.
- No build, dev server, deployment, browser journey, or production smoke was
  run for this slice.

## 2026-07-16 class-imbalance v5 result-authority checkpoint

- Commit `32e9b0a` records frozen per-pack result authority for kernel version
  and fixture summary, and requires the result seed to match the selected Plan.
- Five rehashed forgeries—rows, positives, prevalence, kernel version, and
  top-level seed—now produce a technical `REJECTED` verdict with no result.
- Commit `f5de4e2` integration-tests an artifact-specific class-imbalance
  Belief Spec through bounded scientific compile, fixed selection, versioned
  run dispatch, the real public fixed-result fixture, Worker verification, and
  `SUPPORTS competing`.
- The same Worker tests prove all five fixed-authority mutations emit only
  `verifier.rejected`, keep the session at `LAB_VERIFIED`, and expose no result.
- Verification: 129 Web/Worker tests passed; 31 focused Concept Pack/verifier
  tests passed; repository and Worker TypeScript plus whitespace checks passed.
- Next gate: browser client/session mirroring, followed by v5 interactive,
  transfer, patch, Reasoning Diff, and proof lineage.
- No build, dev server, deployment, browser journey, or production smoke was
  run for this slice.

## 2026-07-16 v5 browser and deterministic-transfer checkpoint

- Commit `f406f0e` adds a single learner-facing presentation adapter for legacy
  Belief Test v1 and native Belief Spec v2 authority. Exact claims, hypotheses,
  evidence, conditions, alternatives, and non-claims now survive refresh, and
  class-imbalance predictions no longer fall through to leakage wording.
- Commit `22169c9` treats every persisted session aggregate as untrusted at the
  downstream boundary. Revision, transfer, and patch gates now re-resolve a
  normalized authority tuple and reject mixed versions, hash drift, concept or
  artifact mismatch, rejected evidence, and v5 result-method bypasses.
- Commit `3dbadd0` dispatches genuine v5 leakage and class-imbalance sessions to
  their registered fixed transfer evaluators. Valid `INCONCLUSIVE` evidence can
  continue through revision and transfer for learning, but cannot unlock patch
  generation.
- Verification: 132 Web/Worker tests across 18 files, 23 session-core tests,
  strict repository and Worker TypeScript, and `git diff --check` passed.
- Active gate: a purpose-separated v5 interactive-run contract that derives
  every exploration from frozen compile/result authority and never replaces the
  authoritative verdict. V5 Patch Plan and Proof Capsule lineage follow.
- No build, dev server, deployment, browser journey, or production smoke was
  run for this slice.

## 2026-07-16 v5 interactive-authority checkpoint

- Commit `30ec305` introduces a separate strict v5 interactive LAB_RUN bundle.
  It binds the frozen compile lineage, released result/verdict/report tuple,
  configuration, deterministic derived Plan, selected run, and one permitted
  output; unknown fields and rejected source evidence fail closed.
- Commit `ce88b9c` adds an independent Python rederivation and exact nested-key
  policy. The fixed process verifies configuration/source hashes and executes
  only the allow-listed derived Plan.
- Commit `ee3c78f` migrates the public Worker route for both released concepts.
  Compiler outputs and results are frozen under Worker-only authority prefixes;
  callback verification checks the selected run and never replaces the source
  result, Evidence Verdict, epistemic report, or session state.
- Verification: 134 Web/Worker tests, 32 Experiment IR/hosted-runner tests, all
  111 kernel tests, 13 focused plan/imbalance tests, strict TypeScript, and
  whitespace checks passed.
- One initial package-filtered Vitest command used a repository-relative filter
  incorrectly and found no tests; the same regressions were rerun through the
  root Vitest config and failed red before implementation, then passed.
- Active gate: a versioned v5 Patch Plan bundle/callback tied to the uploaded
  artifact and passed fixed transfer, followed by Proof Capsule v2.
- No build, dev server, deployment, browser journey, or production smoke was
  run for this slice.
