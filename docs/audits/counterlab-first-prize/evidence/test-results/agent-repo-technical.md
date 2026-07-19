# CounterLab repository, API, AI-authority, trust, and test audit

Audit scope: Agents 6, 7, 8, and 10 (backend/reliability; GPT-5.6 and Codex; verification/trust/security; repository/tests/maintainability).

Audit date: 2026-07-19 (Asia/Kolkata)

Audited commit: `f9ca9bce2bb88921614d3e7ee6d195ba0c099c70` (`checkpoint: preserve concurrent dark theme sweep`, committed 2026-07-19T00:31:48+05:30).

Important baseline limitation: the worktree was already dirty and changed concurrently during this read-only audit. At the final test checkpoint, modified files included `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`, learner/Judge CSS and components, the lockfile, SBOM output, and scientific-engine evidence; untracked paths included `.theme-sweep.py`, `data/`, `docs/a/`, and the audit tree. I did not modify product code. Source findings involving the landing and replay UI describe the exact final worktree read during this audit, not necessarily the committed tree. The HEAD itself remained stable during the reported verification commands.

## Executive technical verdict

CounterLab's central technical idea is real in source, not a README fiction. The repository contains a substantive separation between model proposals, schema validation, a fixed experiment scorer, frozen technical and epistemic verification, fixed Python execution, transfer grading, patch verification, and Proof Capsule issuance. It also contains unusually serious provenance, replay, mutation, callback-idempotency, token-binding, artifact-sanitization, and fail-closed tests for a hackathon submission.

That strength is not yet converted into prize-one evidence. The live Worker currently visible to the audit commander is healthy, but its deployed source/image tuple is not exposed and the current repository documentation explicitly says that the local v6.1 branch is not deployed or browser-qualified. The current official Devpost project remains an empty `submission_pre_draft`. The public edge also has no repository-visible abuse/rate-limit control despite unauthenticated routes capable of initiating GPT and hosted Codex/Container work. Finally, the hosted `ContainerCodexLaunchBoundary` is credential staging plus a privilege drop; it is not a filesystem read allowlist, even though the client accepts any launch boundary as satisfying its "OS-enforced generation read-isolation" gate.

Strict classification:

| Finding | Evidence state | Severity candidate | What is and is not proven |
| --- | --- | --- | --- |
| Devpost project is empty and unsubmitted | Observed via current official Devpost connector; independently confirmed by commander | P0 | Proven current submission blocker; not a product-code defect |
| Public build lacks repository/image provenance and exact current live qualification | Source/docs plus commander-supplied current Cloudflare deployment metadata | P1 | Proven evidence/provenance gap; public unavailability is **not** alleged |
| Plain-language landing CTA routes to a notebook-only path | Verified in current worktree and covered by passing UI tests that do not reject the behavior | P1 | Proven source/UI logic; browser agent should confirm live impact |
| Legacy replay advertises read-only but adds an unlabeled mutable local practice overlay | Verified in current worktree and replay API | P1 | Stored replay bytes are not mutated; the issue is semantic/authority labeling |
| No edge abuse/rate-limit control in repository | Verified by bindings, middleware, route inventory, and search | P1 | A denial-of-wallet/availability **risk**, not an executed exploit or measured outage |
| Hosted Codex boundary does not enforce read isolation from bundled runtime/source | Verified in source and acknowledged partially in threat model | P1 | A claim/invariant gap and potential read exposure; no successful exfiltration was attempted or proven |
| Upload multipart body is materialized before authoritative file-size check | Verified in source | P2 | Memory-amplification risk within platform request limits; no DoS attempted |
| Sanitization is heuristic, not PII classification | Verified in source and documented | P2 | Exact preview/approval mitigates; no secret leak observed |
| Browser sessions are bearer capabilities in URL/local storage without per-session auth | Verified in source | P2 | Random UUIDs mitigate guessing; no cross-session access was attempted |
| Current release/browser suite is not fully qualified and documentation is stale/contradictory | Verified in docs/tests | P2 | Historical evidence remains valid only for its recorded build |
| Core files are very large and no hosted CI workflow is present | Verified in repository | P2 | Maintainability/release-risk issue, not a current functional failure |
| Static SPA response hardening is not defined alongside API headers | Verified in source/config | P3 | API CSP and headers are strong; no injection exploit found |

P0/P1 findings must receive independent reproduction before final inclusion. RTA-001 has commander corroboration. RTA-002 has independent live/Cloudflare evidence from the commander. RTA-003 and RTA-004 should be cross-checked by the live-journey agent. RTA-005 and RTA-006 require wave-two source/security confirmation.

## What is technically strongest

1. **Authority separation is executable.** GPT-5.6 proposes a locally validated `BeliefSpec`; Codex returns bounded schema-conforming plans; a fixed scorer and independent verifiers decide; Python fixed kernels own numerical truth; the Worker reconstructs and verifies authority before releasing a result.
2. **The hosted source-free path fails closed.** Structured Codex turns are instructed not to use tools, run with `readOnly`/no-network policy, reject command/file events, and materialize only after schema validation (`packages/codex-client/src/app-server.ts:1370-1459`). This does not solve read isolation (RTA-006), but it does prevent a detected tool-use turn from becoming authoritative.
3. **Notebook intake is narrow and non-executing.** The parser accepts bounded nbformat JSON, omits active HTML/JS/SVG/widget content, records exact hashes/evidence references, and refuses unsupported dependencies/magics instead of executing cells.
4. **Runner capability and callback design is strong.** One-job signed tokens bind job, purpose, input/output lineage, callback, state version, origin and expiry. Callbacks, retries, reconnect cursors, and optimistic transitions are independently checked.
5. **Proof and repair binding are substantive.** Proof Capsule v2 binds mode, prediction, score selection, IR, verification reports, result, Boundary Map, transfer, patch, event chain and versions. Patch compilation remains source-free until deterministic transfer passes; source is then read only for a fixed, independently verified copy transformation.
6. **Adversarial tests are unusually deep.** The repository includes mutation, canonicalization, replay tamper, stale binding, unsupported input, path/symlink, token, callback-conflict, patch-scope, and epistemic inconclusive/rejection coverage.

## Authority trace

| Stage | Actual implementation | Authority | Evidence status |
| --- | --- | --- | --- |
| Notebook intake | `apps/web/worker/api.ts:3296-3369` calls `parseNotebook`; raw bytes go to private R2 and manifest to D1 | Parser/support contract | Verified in source and tests |
| GPT request | `packages/belief-analyst/src/index.ts` constructs bounded sanitized context and uses the official Responses SDK with structured Zod parsing, `store: false`, timeout/retry bounds, and a hashed safety identifier | Proposal only | Verified in source and focused tests; live call not performed by this agent |
| Learner approval | Worker requires preview hash/claim/artifact consistency and learner confirmation before prediction | Learner | Verified in source/test |
| Codex compile | App Server stdio JSONL handshake; structured output schema; up to two repairs; source-free generation | Proposal only | Verified in source; protocol unit tests partly blocked in managed sandbox |
| Candidate validation/selection | `packages/experiment-scorer` hard-gates registered ops, controls, changed variables, observables, patterns and complexity, then uses deterministic ordering | Fixed scorer | Verified in source; scorer test passed |
| Technical/epistemic verification | `packages/plan-verifier` validates Belief/IR/selection/provenance/result bindings and tri-state release conditions | Frozen verifier | Verified in source; focused tests passed |
| Numerical result | Fixed Python kernel/hosted runner executes registered operations and produces canonical hashes | Fixed kernel | Verified in source; 227/231 Python tests passed, four sandbox-only failures |
| Result release | Worker independently rebuilds bundles and refuses release on callback/lineage/verifier mismatch | Worker plus verifier | Verified in source/API tests |
| Boundary | Pack-registered bounded grid from fixed kernel; independently reverified; integrity or HMAC receipt | Fixed kernel/verifier | Verified in source/tests |
| Transfer | Deterministic fixed evaluator; patch routes gate on PASSED state | Fixed transfer evaluator | Verified in source/tests |
| Patch | Separate source-free Codex Patch Plan, fixed verification, then source retrieval and copy-only patch | Codex proposes; fixed patch/verifier decides | Verified in source/tests |
| Final evidence | Reasoning Diff v2 plus exact-byte Proof Capsule v2, content-addressed storage and labelled hosted replay | Worker/verifier | Verified in source/tests; current public exact build unqualified |

## Backend/API/reliability map

The Worker exposes readiness/health, artifact upload and retrieval, sample/live/replay sessions, belief preview/proposal/confirmation, immutable prediction, compile, runner input/source/start/events/output/callback, public event reconnect/cancel, fixed lab/boundary/interactive runs, revision, transfer, patch compile/download, reasoning diff, proof bundle/capsule, replay publication and replay downloads (`apps/web/worker/api.ts:3175-8620`).

Positive reliability controls include:

- D1-backed sessions, jobs, append-only events, idempotency keys and optimistic state transitions.
- Private R2 storage for source, job bundles, patched artifacts and Proof Capsules.
- Signed, purpose-specific runner tokens; separate runner endpoints validate token purpose and lineage.
- Callback conflict/idempotency handling, bounded retry rules, cursor-based event reconnect, cancellation terminalization and result re-fetch.
- Readiness distinguishes analyst, persistence, private storage, runner and signing (`api.ts:3178-3224`).
- API responses receive `no-store`, `nosniff`, `no-referrer`, frame denial and a restrictive API CSP (`api.ts:3227-3239`).
- Admin diagnostics require a 32+ character secret and constant-time bearer comparison.
- No CORS opt-in was found, so arbitrary browser origins cannot simply read API responses.

Important qualification: `max_instances: 10` in `apps/web/wrangler.jsonc:27-35` is a concurrency ceiling, not a caller quota or cost-control policy.

## Security/adversarial conclusions

### Safely confirmed defenses

- Invalid/unsupported notebooks are refused; notebook cells are treated as data and not executed during intake.
- File extension, MIME, notebook schema, byte size, active outputs, imports, magics, network dependencies and support evidence are checked.
- Artifact and output paths are generated/allowlisted; workspace and output policies reject traversal, symlinks, nested paths and unexpected file sets.
- Structured Codex output cannot directly supply formulas, commands, arbitrary code, result literals or raw paths under the v5 IR.
- A detected command/file event in a hosted structured Codex turn causes `CODEX_PROTOCOL_ERROR` and no authoritative result (`app-server.ts:1420-1428`).
- Fixed verifier and result hashes reject stale, hard-coded, swapped, confounded, nondiscriminating and binding-inconsistent evidence.
- A failed transfer cannot start patch authority; patch verification checks the original hash, changed cell scope, dependencies, new results and preserved unrelated bytes.
- Replay v2 validates the exact stored Capsule before projection. Legacy v1 replay is separately labelled and does not claim a Capsule.
- Secret scan passed across 1,085 repository files during this audit.

### Not demonstrated or not safe to claim

- No successful cross-session access, prompt exfiltration, command/tool read, rate-exhaustion, denial-of-service or denial-of-wallet exploit was attempted. RTA-005, RTA-006, RTA-007, RTA-008 and RTA-009 are source/architecture risk findings.
- No current production live notebook was run by this agent, and no current deployed source/image identifier is available in the public API evidence reviewed here.
- Static application response headers were not captured by this agent; RTA-012 is based on repository configuration only.
- No formal claim that the entire hosted Container is networkless is supported. `apps/web/worker/runner-container.ts` enables Container internet for operational dependencies; the App Server turn requests no network, but the threat model correctly describes phase-specific outbound filtering as future hardening.

## Repository and maintainability observations

- `apps/web/worker/api.ts` and its test are each roughly 299 KB/8,700 lines; `apps/web/src/App.tsx` is roughly 152 KB. Those monoliths concentrate state-machine, persistence, protocol, UX and proof risks and make final fixes harder to review.
- No `.github/workflows` or other hosted CI workflow was found. The local scripts are comprehensive, but release confidence depends on a human invoking them and preserving artifacts.
- Dependencies and toolchains are pinned; the runner image uses digest-pinned bases, hash-locked wheels, a non-root final user, read-only `/app`, SBOM/VEX evidence and scientific-engine role manifests.
- The Codex client README is materially stale: `packages/codex-client/README.md:32-60` still says authenticated live generation is unavailable and only replay/disabled paths remain, while the current hosted runner includes `ContainerCodexLaunchBoundary` and the Worker advertises configured Codex. This harms judge trust even though the root `docs/CODEX_USAGE.md` is more current.
- `docs/DEVPOST_COPY.md` and parts of older documentation retain legacy vocabulary (`Belief Test`, `Experiment Plan`, `Proof Bundle`) while the constitution and current UI use Question/Prediction/Test/Boundary/Apply/Repair and Belief Spec/Experiment IR/Proof Capsule.
- `docs/LEARNER_PILOT_RESULTS.json` records no participant data; impact is aspirational rather than measured.

## Verification performed

All commands were run from the repository or an in-repository descendant. `TMPDIR` and `XDG_CACHE_HOME` were set to `docs/audits/counterlab-first-prize/evidence/test-results/agent-repo-runtime`. Product files were not intentionally written.

### Stable TypeScript authority slice

Command:

```text
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ./node_modules/.bin/vitest run --no-file-parallelism packages/notebook-parser/src/index.test.ts packages/experiment-scorer/test/scorer.test.ts packages/plan-verifier/src/scientific-candidate-v5.test.ts packages/plan-verifier/src/epistemic.test.ts packages/plan-verifier/src/epistemic-imbalance.test.ts packages/proof-capsule/src/index.test.ts packages/proof-capsule/src/authority.test.ts packages/proof-capsule/src/node-cli.test.ts services/hosted-runner/src/job-processor.test.ts services/hosted-runner/src/control-plane-client.test.ts services/hosted-runner/src/fixed-kernel.test.ts services/hosted-runner/src/fixed-patch.test.ts services/hosted-runner/src/startup-probe.test.ts
```

Result: **13 files passed; 106/106 tests passed** in 3.76 seconds.

### Worker/API/current UI slice

Command from `apps/web`:

```text
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ../../node_modules/.bin/vitest run --config vitest.config.ts --no-file-parallelism worker/api.test.ts src/api.test.ts src/App.test.tsx src/features/judge/JudgeModeView.test.tsx
```

Result: **4 files passed; 124/124 tests passed** in 13.35 seconds. These tests passed on the concurrently modified worktree at the recorded HEAD.

### Python kernel and runner

Command:

```text
env TMPDIR=<audit-runtime> PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=services/kernel/src:services/runner/src .venv/bin/python -m pytest services/kernel/tests services/runner/tests -p no:cacheprovider -qq --tb=short
```

Collection: **231 tests**. Result: **227 passed, 4 failed**.

The four failures are attributable to the managed audit sandbox:

1. `services/kernel/tests/test_service.py::test_kernel_service_exposes_health_and_only_the_fixed_public_run` — loopback socket creation denied with `PermissionError: [Errno 1] Operation not permitted`.
2. `services/runner/tests/test_docker_runner.py::test_execution_snapshot_is_the_exact_validated_read_only_source` — expected mode `0555`, managed filesystem reported `0700`.
3. `services/runner/tests/test_docker_runner.py::test_executor_loads_only_bounded_fixed_outputs_and_records_enforcement` — expected mode `0777`, managed filesystem reported `0700`.
4. `services/runner/tests/test_harness.py::test_fixed_harness_runs_public_tests_then_writes_contract_and_evidence` — expected output mode `0644`, managed filesystem remapped modes.

These failures do not establish a product regression. They do mean the exact permission/socket behavior could not be independently requalified in this environment.

### Codex protocol slice

Command:

```text
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ./node_modules/.bin/vitest run --no-file-parallelism packages/codex-client/src/index.test.ts packages/codex-client/src/scientific-method.test.ts
```

Result: **24 passed, 18 failed**. All 18 failures occurred because the fake App Server child exited cleanly before turn completion and the client correctly returned `CODEX_PROCESS_EXITED`; the expected protocol scenarios could not execute. No external Codex call was made. Given the managed process sandbox and the passing non-process authority slice, classify this as an audit-environment limitation unless reproduced outside this sandbox, not a confirmed product defect.

An earlier 19-file exploratory run produced 141 passes and 27 failures; six failing files were all process, loopback, namespace or permission dependent. The stable slices above are the decision evidence.

### Type checking

Commands (first from repository root; second and third from `apps/web`):

```text
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ./node_modules/.bin/tsc --noEmit
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ../../node_modules/.bin/tsc --noEmit -p tsconfig.json
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ../../node_modules/.bin/tsc --noEmit -p tsconfig.worker.json
```

Result: **all three passed with exit code 0**.

### Secret scan

Command:

```text
env TMPDIR=<audit-runtime> PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/secret-scan.py
```

Result: **passed across 1,085 repository files**.

### Not run

- Full `scripts/test-all.sh` and release gate: avoided because the repository was changing concurrently, browser CDP was owned by other agents, and the full scripts generate evidence/build output.
- Current live credentialed E2E: not authorized within this specialist scope and not proven source-identical to the audited worktree.
- Docker build/scientific admission release: would mutate generated evidence already being changed by another agent.
- Destructive or load/adversarial traffic: prohibited and unnecessary for source-level findings.

## Issue records

### RTA-001

Issue ID: RTA-001

Title: Official Devpost project is an empty, unsubmitted pre-draft

Severity: P0

Confidence: confirmed

Reproducibility: always (current connector read)

Category: submission

Affected route or component: Devpost project ID `1330312`

Affected user: judges and submitter

Affected Devpost criterion: Stage One eligibility; all four scored criteria

Environment: official Devpost connector, fetched 2026-07-19 audit session

Prerequisites: authenticated project-owner connector access

Reproduction steps: Read project ID `1330312`; inspect name, tagline, description, video, repository fields, publication and submission state.

Expected behaviour: A completed Education submission with public description, <3-minute public YouTube demo, repository/license/setup information, GPT-5.6 and Codex explanation, and `/feedback` session ID is submitted before the official deadline.

Actual behaviour: Project name is `Untitled`; tagline is null; description is empty; video is null; slug/publication are null; state is `submission_pre_draft`; hackathon `submitted_at` is null.

Evidence: Devpost connector response: `id=1330312`, `state=submission_pre_draft`, `published_at=null`, `updated_at=2026-07-14T14:35:27.274-04:00`. Independently confirmed by the audit commander and recorded in `devpost-project-baseline.md`.

Console or network evidence: Official connector response; no browser console relevance.

Source-code evidence: `docs/DEVPOST_COPY.md` is only a local draft and does not submit the project.

Root-cause hypothesis: Submission content and assets have not yet been entered/published.

Learner impact: None directly.

Judge impact: No eligible, judgeable submission exists in its current state.

Trust or integrity impact: High if last-minute text/video diverges from the actual public build.

Recommended correction: Populate every required field from verified evidence, attach the public <3-minute video, repository and `/feedback` ID, then perform a final consistency check and submit.

Smallest acceptable fix: Complete and submit the official form with a working public app, public video, repository/license/setup instructions, category and `/feedback` session.

Acceptance criteria: Project has a public slug/URL, non-empty required fields, valid video/repository links, Education category, `/feedback` ID and non-null submission timestamp; a fresh read shows submitted state.

Regression test: Final submission-readiness checklist plus connector re-read and incognito link checks.

Dependencies: Final public-build qualification, video, repository publication/license, submission copy and feedback session.

Estimated effort: M

Score leverage: very high

Related issues: RTA-002, RTA-010

### RTA-002

Issue ID: RTA-002

Title: Current public Worker cannot be bound to the audited repository/image or an exact-version live journey

Severity: P1

Confidence: confirmed

Reproducibility: always

Category: submission

Affected route or component: public Worker, release evidence, README, production smoke

Affected user: judges, maintainers and learners relying on live authority

Affected Devpost criterion: Technological Implementation; Design; Quality of the Idea

Environment: public production plus repository at `f9ca9bce…`

Prerequisites: none

Reproduction steps: Compare current Cloudflare deployment metadata, public `/ready`/`/api/health`, README branch statement, `docs/CODEX_USAGE.md`, `docs/PROGRESS.md`, `docs/RELEASE_CHECKLIST.md` and `docs/PRODUCTION_SMOKE.json`.

Expected behaviour: Public UI/API exposes a source/image/build identifier that matches immutable release evidence proving both live Subject Packs, reconnect, patch download, Capsule export and no-secret behavior for that exact tuple.

Actual behaviour: Commander-supplied read-only Cloudflare evidence shows a current deployment (`dad4cd71…`, Worker version `bef5edb7…`, created 2026-07-18T18:12:53Z) and healthy public readiness, but no source commit is exposed. README lines 16-19 explicitly say v6.1 is not pushed/deployed/browser-qualified. `docs/CODEX_USAGE.md:132-136` says fresh public deployment/live smoke remains required. `docs/PROGRESS.md:290-291` describes older Worker `89db95bc…` and a failed schema smoke, so it is stale. `docs/PRODUCTION_SMOKE.json` binds an older Worker/image.

Evidence: README 16-19; `docs/CODEX_USAGE.md:132-136`; `docs/PROGRESS.md:268-291`; `docs/RELEASE_CHECKLIST.md:179-185`; commander Cloudflare baseline.

Console or network evidence: Public `/ready` was reported all true and `/api/health` configured by the commander; those responses do not expose source/image provenance.

Source-code evidence: Release docs above; no build identifier endpoint was found in the route inventory.

Root-cause hypothesis: Deployment occurred after the latest written evidence without regenerating a source/image-bound release record and current journey matrix.

Learner impact: Live may work, but failures cannot be tied to the audited implementation and regression status.

Judge impact: Sophisticated source receives limited credit because the public demo cannot prove it is the same build.

Trust or integrity impact: High; this is an evidence-chain gap, not evidence that the Worker is broken.

Recommended correction: Create one immutable release manifest tying git commit, lock hash, Worker version, Container digest, schema/engine snapshot and timestamp; expose a safe public build ID; run the exact two-pack production smoke and browser matrix against it.

Smallest acceptable fix: Safe build ID plus exact deployment record and successful untouched leakage/imbalance live smoke with downloadable artifacts and Capsule hashes.

Acceptance criteria: Public build ID equals release manifest; manifest identifies Worker/Container/source; both live flows and reconnect/download/replay checks pass; docs contain no conflicting current-state claims.

Regression test: Release script fails if public build ID, source commit, image digest or evidence tuple differ.

Dependencies: Stable final branch, credentials, deployment pipeline, production smoke fixtures and browser runner.

Estimated effort: M

Score leverage: very high

Related issues: RTA-001, RTA-010

### RTA-003

Issue ID: RTA-003

Title: The primary plain-language CTA cannot start an investigation without a notebook

Severity: P1

Confidence: high (source-confirmed; live confirmation pending)

Reproducibility: always in audited worktree

Category: UX

Affected route or component: `/`, `/new`, Landing, `LiveSetup`, `ClaimScreen`

Affected user: first-time learner and hands-on judge

Affected Devpost criterion: Design; Potential Impact; Quality of the Idea

Environment: current worktree at recorded HEAD, React tests passing

Prerequisites: clean first visit, no notebook attached

Reproduction steps: Enter any question in the landing composer; activate `Test this claim`; continue through capability setup without attaching a notebook.

Expected behaviour: The question either starts a supported guided/sample investigation, asks the learner to choose a supported path, or clearly states before submission that a notebook is required.

Actual behaviour: Landing promises `State a claim or attach a notebook…` and `Test this claim` (`QuestionComposer.tsx:36-73`). Submit calls `chooseMode("live")` (`App.tsx:4332-4345`), which opens notebook setup (`App.tsx:3987-3998`, `3231-3305`). Continuing clears artifact/session and opens the notebook-specific claim screen (`4091-4104`); `Compare two explanations` is disabled while `supported` is false (`918-920`, `1044-1054`).

Evidence: Exact source references above; passing App/UI test slice does not assert a successful question-only flow.

Console or network evidence: None required; this is deterministic client routing.

Source-code evidence: `apps/web/src/components/learner/QuestionComposer.tsx:36-73`; `apps/web/src/App.tsx:918-920,1044-1054,3231-3305,3987-3998,4091-4104,4332-4345`.

Root-cause hypothesis: Question-first visual redesign was layered over a live-notebook-only state machine without a decision state for question-only input.

Learner impact: The dominant CTA creates a dead end and makes the product feel misleading or incomplete.

Judge impact: Fails the first-20-seconds promise that CounterLab starts from a learner's question.

Trust or integrity impact: Medium; copy implies a capability the path does not deliver.

Recommended correction: Route question-only submit to an explicit supported-path chooser or deterministic sample seeded by the selected supported misconception; reserve live notebook for attached artifacts.

Smallest acceptable fix: Before submit, label notebook requirement and offer one dominant `Try this with the verified sample` continuation that preserves the learner's question without implying artifact-specific authority.

Acceptance criteria: A clean user can enter a question, understand support limits, select a valid path and reach Prediction without encountering a disabled unexplained CTA; live remains honestly notebook-specific.

Regression test: Browser test for question-only landing submit through first actionable Prediction state plus copy assertion for mode/source label.

Dependencies: Product choice on question-only behavior; no backend change required for the smallest fix.

Estimated effort: S

Score leverage: very high

Related issues: RTA-002, RTA-004

### RTA-004

Issue ID: RTA-004

Title: Legacy verified replay's mutable practice overlay is not labelled as non-authoritative

Severity: P1

Confidence: high (source-confirmed; live confirmation pending)

Reproducibility: always in audited worktree

Category: verification

Affected route or component: `/judge`, `/replay/leakage-01`, legacy replay learner completion

Affected user: judges and learners inspecting replay

Affected Devpost criterion: Technological Implementation; Design; Quality of the Idea

Environment: current worktree and Worker replay endpoint

Prerequisites: open Judge Mode legacy replay

Reproduction steps: Open `/judge`; follow `Watch replay`; advance to revision/transfer; submit correct choices; activate patch verification; refresh/reopen.

Expected behaviour: A read-only replay either only reconstructs stored events or clearly labels any local practice actions and simulated completion as browser-only, non-authoritative overlays that do not alter/reissue proof.

Actual behaviour: Judge copy says `Read-only stored events. No new model call, no new experiment` (`JudgeModeView.tsx:208-221`). The replay API returns immutable v1 result/patch data (`api.ts:8558-8575`) and App sets `session=null` (`App.tsx:4000-4014`). With no session, revision is persisted locally, transfer is graded in the browser, and `compilePatch` simply sets state to `patched` (`2138-2180`, `2247-2301`). The UI then says `Transfer passed · Patch unlocked`, `Your notebook correction is ready`, and later renders completion; downloads remain correctly disabled because no session exists.

Evidence: Source references above. Stored replay payload is not mutated; this finding is the unlabeled mutable overlay and implied authority.

Console or network evidence: Transfer and patch state require no API call when `session === null`, so absence of network is expected.

Source-code evidence: `apps/web/src/features/judge/JudgeModeView.tsx:208-221`; `apps/web/worker/api.ts:8558-8575`; `apps/web/src/App.tsx:2138-2180,2247-2301,2482-2518,2670-2722,4000-4014`.

Root-cause hypothesis: A useful local practice continuation was reused from sample/live UI without a separate replay-overlay authority label.

Learner impact: Learners may believe their new transfer/patch is part of the stored verified run.

Judge impact: Creates doubt about whether replay, sample and live authority are truly separate.

Trust or integrity impact: High semantic risk; no evidence payload corruption was found.

Recommended correction: Make legacy replay truly read-only, or label the continuation on every affected screen as `Local practice — not part of the recorded proof`; never use `verified`, `passed`, `patch unlocked` or completion language without that qualifier.

Smallest acceptable fix: Persistent replay-practice banner plus copy changes and no proof/export affordance for local overlay state.

Acceptance criteria: Network/state tests prove stored replay unchanged; every local action is visibly non-authoritative; refresh does not imply a new verified session; hosted Capsule replay remains separate.

Regression test: E2E replay test asserts no mutation API calls and persistent `local practice / not recorded` labeling through transfer and patch screens.

Dependencies: UX copy and mode discriminant; no data migration.

Estimated effort: S

Score leverage: high

Related issues: RTA-003, RTA-010

### RTA-005

Issue ID: RTA-005

Title: Public cost-bearing API has no repository-visible abuse or caller rate control

Severity: P1

Confidence: high (source-confirmed risk; exploit untested)

Reproducibility: always as a configuration property

Category: reliability

Affected route or component: `/api/artifacts`, `/api/live/sessions`, belief analysis, lab/patch compile, runner dispatch

Affected user: all public learners and project owner

Affected Devpost criterion: Technological Implementation; Potential Impact

Environment: Worker source/config at recorded HEAD

Prerequisites: public network client; a synthetically supported notebook for model/runner cost

Reproduction steps: Inspect Worker bindings/middleware/routes and Wrangler config; search source/config for rate-limiter, Turnstile, quota or abuse binding. Do not send load.

Expected behaviour: Bounded per-IP/session/project creation and expensive-operation quotas, burst control, retry guidance, budget circuit breaker and observability protect public GPT/Codex/Container capacity.

Actual behaviour: `WorkerBindings` declares credentials/storage/runner but no rate-limit binding (`api.ts:180-195`). API middleware only assigns request ID and response headers (`3227-3239`). Artifact/live session/model/compile routes are public (`3296-3751`, `7861+`). `wrangler.jsonc` has D1/R2/Container/DO/observability but no rate-limit binding; `max_instances:10` only caps concurrency. Search found only handling of upstream OpenAI 429 responses and runner-client retry status, not inbound control.

Evidence: Source/config inventory and negative search.

Console or network evidence: No load test was performed; no production outage or bill impact is claimed.

Source-code evidence: `apps/web/worker/api.ts:180-195,3175-3239,3296-3751,7861-8366`; `apps/web/wrangler.jsonc:13-54`.

Root-cause hypothesis: Hackathon prioritized no-account access and per-job authority but omitted an edge abuse budget.

Learner impact: A small number of callers could consume the ten runner slots or model quota and make honest learners see degraded states.

Judge impact: Public production readiness and cost control are vulnerable to a basic architecture question.

Trust or integrity impact: Availability/cost risk, not evidence-integrity bypass.

Recommended correction: Add Cloudflare rate-limit/Turnstile or equivalent edge control around upload/session creation and expensive transitions, with per-session idempotency, global budget circuit breaker and privacy-safe telemetry.

Smallest acceptable fix: Low-friction per-IP burst/sustained quotas for artifact/live session/GPT/compile/patch routes, `429` typed response with retry-after, and global daily runner/model budget stop that preserves sample/replay.

Acceptance criteria: Unit/integration tests prove threshold, retry-after, independent sample/replay availability, no double charge on idempotent retry and safe global circuit breaker.

Regression test: Deterministic mock rate-limiter tests and a non-destructive staging burst below/at/above the limit.

Dependencies: Cloudflare rate-limit binding or selected edge mechanism; product copy for degraded state.

Estimated effort: M

Score leverage: high

Related issues: RTA-009

### RTA-006

Issue ID: RTA-006

Title: Hosted Codex launch boundary does not enforce the claimed generation read isolation

Severity: P1

Confidence: high (source-confirmed claim gap; exploit untested)

Reproducibility: always as implemented

Category: AI usage

Affected route or component: `ContainerCodexLaunchBoundary`, hosted structured compile/patch

Affected user: judges evaluating the authority boundary; maintainers

Affected Devpost criterion: Technological Implementation (first tie-break); Quality of the Idea

Environment: hosted runner source/image definition

Prerequisites: configured live hosted Codex turn

Reproduction steps: Compare App Server isolation requirement, Container launch preparation, final image permissions, structured turn policy and threat-model claims.

Expected behaviour: A production boundary presented as `OS-enforced generation read-isolation` gives Codex a filesystem namespace/read allowlist containing only the generation packet/workspace and minimum runtime, with hidden verifier, runner/kernel source and unrelated bundle paths absent.

Actual behaviour: Client accepts any `launchBoundary` health response as satisfying its isolation gate (`app-server.ts:1478-1507`). `ContainerCodexLaunchBoundary` validates containment, creates/stages/deletes auth, chmod/chowns paths, drops UID/GID with `setpriv`, and applies `--no-new-privs`, but creates no mount/user namespace, chroot or read allowlist (`launch-boundary.ts:79-207`). The final image makes `/app/runner.mjs`, `/opt/codex` and the installed Python environment broadly readable to UID 10001 (`Dockerfile.runner:79-100`). Structured turns instruct no tools and reject command/file events after they appear (`app-server.ts:1370-1459`), which fails result release but does not prove a disallowed read never occurred.

Evidence: Source references above; `docs/THREAT_MODEL.md:60-73` already acknowledges that prompts/workspace-write do not prove read isolation and describes the authenticated boundary as partial.

Console or network evidence: No command-read/exfiltration attempt was made. No hidden-data leak is claimed.

Source-code evidence: `services/hosted-runner/src/launch-boundary.ts:79-207`; `packages/codex-client/src/app-server.ts:1370-1459,1478-1507`; `Dockerfile.runner:79-100`; `docs/THREAT_MODEL.md:60-73`.

Root-cause hypothesis: A privilege/credential boundary was used to satisfy an interface designed for filesystem read isolation.

Learner impact: Direct learner numerical authority still fails closed, but confidential verifier/source non-observation is not proven.

Judge impact: The strongest architecture claim can be challenged as overclaimed, reducing technological-implementation credit.

Trust or integrity impact: High claim/invariant gap; output authority remains protected by schema/verification.

Recommended correction: Either implement an actual minimal mount namespace/read allowlist (or isolated sidecar/proxy) with a probe proving hidden paths `ENOENT`, or rename the interface/claim to credential-and-privilege boundary and mark generation unreadability `PARTIAL` everywhere.

Smallest acceptable fix: Honest claim downgrade plus release-blocking test that the hosted UI/README never says hidden source is unreadable; prize-quality fix is actual namespace isolation with authenticated E2E probe.

Acceptance criteria: From the Codex process, allowed runtime/workspace paths work; named `/app`, repository, verifier, fixtures and unrelated job paths are absent; credential is revoked before turn; network policy is phase-tested; a tool-attempt turn releases no result.

Regression test: Production-image black-box mount/read probe plus malicious fake-App-Server read attempt and no-result assertion.

Dependencies: Container/runtime support, Codex auth design and possibly host credential proxy.

Estimated effort: L for real isolation; XS for honest claim correction

Score leverage: high

Related issues: RTA-002, RTA-010

### RTA-007

Issue ID: RTA-007

Title: Multipart upload can be buffered before the authoritative notebook size check

Severity: P2

Confidence: confirmed

Reproducibility: always for chunked/missing-content-length multipart

Category: security

Affected route or component: `POST /api/artifacts`

Affected user: public learners and Worker availability

Affected Devpost criterion: Technological Implementation

Environment: Worker source

Prerequisites: multipart request without a useful declared length

Reproduction steps: Read the handler order: optional declared-length rejection; `context.req.formData()`; file/metadata validation; `file.size`; `arrayBuffer`.

Expected behaviour: Streaming/bounded body parsing enforces the configured notebook byte limit before materializing multipart data.

Actual behaviour: `formData()` occurs at `api.ts:3319` before `file.size` is checked at `3342-3347`; a missing/chunked content length bypasses the early declared-length guard.

Evidence: `apps/web/worker/api.ts:3296-3349`.

Console or network evidence: No oversized request was sent; platform-level request limits mitigate the maximum.

Source-code evidence: Same as evidence.

Root-cause hypothesis: Convenience multipart parser used after only an advisory content-length check.

Learner impact: Potential availability degradation under abusive large requests.

Judge impact: Minor production-hardening concern if raised.

Trust or integrity impact: Availability only; parser still checks supported notebook bytes before storage.

Recommended correction: Enforce a platform route/body limit and use a bounded streaming multipart parser or reject requests without a safe content length.

Smallest acceptable fix: Reject absent/invalid/over-limit declared length for this endpoint and document platform cap; retain `file.size` defense in depth.

Acceptance criteria: Chunked/absent/over-limit requests terminate before multipart materialization; normal max-size notebook succeeds; typed `413` returned.

Regression test: Worker request tests for no content-length, conflicting lengths, just-below/at/above max.

Dependencies: Cloudflare request-stream support.

Estimated effort: S

Score leverage: medium

Related issues: RTA-005

### RTA-008

Issue ID: RTA-008

Title: Live analyst preview sanitization is heuristic and does not classify PII

Severity: P2

Confidence: confirmed

Reproducibility: always for unrecognized sensitive values

Category: security

Affected route or component: GPT-5.6 sanitized context and approval preview

Affected user: notebook-uploading learner

Affected Devpost criterion: Technological Implementation; Potential Impact

Environment: belief analyst source

Prerequisites: supported notebook containing sensitive-looking content not matched by current regexes

Reproduction steps: Inspect `sanitizeText` and `buildSanitizedAnalystContext`; compare fields/excerpts sent with the `privacyClass` metadata.

Expected behaviour: Privacy copy precisely describes the boundary; obvious PII classes are omitted/redacted or explicitly warned before external model transfer.

Actual behaviour: Sanitizer redacts OpenAI-style keys, assignment-like secret/token/password values, and common absolute paths (`index.ts:317-332`). It still sends up to 12 source excerpts, symbols, metric candidates, schema field names/types/privacy-class strings and learner claim (`369-434`). `privacyClass` is included but not used to suppress a field. The threat model correctly says classification cannot be guaranteed (`docs/THREAT_MODEL.md:87-89`).

Evidence: Exact source/docs above; UI presents the exact packet and requires additional approval only when secret/path markers are detected.

Console or network evidence: No PII/secret was uploaded or sent during this audit.

Source-code evidence: `packages/belief-analyst/src/index.ts:317-434`; `docs/THREAT_MODEL.md:87-89`.

Root-cause hypothesis: Narrow hackathon sanitizer prioritizes secrets/paths, relying on learner preview for broader privacy.

Learner impact: A learner can approve excerpts containing names/emails/IDs without a targeted warning.

Judge impact: Education privacy story is weaker than the architecture story.

Trust or integrity impact: Privacy risk; no observed exposure.

Recommended correction: Add explicit PII pattern/class handling and phrase preview as learner-controlled disclosure, not guaranteed sanitization.

Smallest acceptable fix: Suppress schema fields marked sensitive, detect common email/phone/ID patterns, highlight every outbound excerpt, and warn that preview may contain personal data.

Acceptance criteria: Tests cover false-positive/negative samples; private classes are omitted; packet hash invalidates on claim/artifact change; no raw rows/paths/secrets sent.

Regression test: Table-driven sanitizer and exact-packet snapshot tests with synthetic PII.

Dependencies: Privacy taxonomy and product copy.

Estimated effort: M

Score leverage: medium

Related issues: RTA-005, RTA-009

### RTA-009

Issue ID: RTA-009

Title: Session URLs are bearer capabilities without user authentication or explicit sharing warning

Severity: P2

Confidence: high

Reproducibility: always by design

Category: security

Affected route or component: `/session/:sessionId`, session APIs, patch/Capsule downloads, browser history/local storage

Affected user: live notebook learners

Affected Devpost criterion: Technological Implementation; Potential Impact

Environment: frontend/Worker source

Prerequisites: possession of a valid random session URL/ID

Reproduction steps: Inspect session ID generation, URL restoration, API routes and absence of session auth middleware.

Expected behaviour: Product explicitly treats URLs as secret bearer capabilities or binds sensitive mutations/downloads to a separate secret/cookie.

Actual behaviour: Session IDs are cryptographically random UUIDs, but appear in SPA routes/local storage and are accepted directly by read/mutation/download endpoints; only admin/runner paths have explicit authentication. No explicit user warning was found.

Evidence: `apps/web/src/App.tsx:3956-3968`; public route inventory `api.ts:3430-8521`; session core uses `crypto.randomUUID`.

Console or network evidence: No cross-session request was attempted; guessability is low.

Source-code evidence: Same as evidence; API middleware at `api.ts:3227-3239` does not authenticate learner sessions.

Root-cause hypothesis: No-account design intentionally uses opaque IDs as capabilities without surfacing that privacy model.

Learner impact: Sharing browser history/screenshots/URL can grant access to evidence and mutation/download actions.

Judge impact: A reasonable privacy question lacks a clear answer.

Trust or integrity impact: Confidentiality and session-control risk; not predictable-ID exposure.

Recommended correction: Document the bearer-capability model and add a separate HttpOnly secret or signed action token for mutations/downloads.

Smallest acceptable fix: Persistent `Anyone with this private session link can view it` warning, no referrer, short retention, revoke/start-over control, and no session IDs in third-party requests.

Acceptance criteria: Random ID alone cannot mutate/download if a second secret is adopted; otherwise sharing/retention/revocation behavior is explicit and tested.

Regression test: Cross-client capability tests and referrer/third-party request audit.

Dependencies: Product privacy decision and D1 session schema if revocation is added.

Estimated effort: M

Score leverage: medium

Related issues: RTA-008

### RTA-010

Issue ID: RTA-010

Title: Release, Codex and submission documentation contradicts the current implementation/deployment state

Severity: P2

Confidence: confirmed

Reproducibility: always

Category: documentation

Affected route or component: README, Codex client README, Progress, Release Checklist, Devpost draft

Affected user: judges, reviewers and maintainers

Affected Devpost criterion: Technological Implementation; Quality of the Idea

Environment: repository at recorded HEAD

Prerequisites: read the primary docs in sequence

Reproduction steps: Compare root README, `packages/codex-client/README.md`, `docs/CODEX_USAGE.md`, `docs/PROGRESS.md`, release checklist and Devpost draft.

Expected behaviour: One current, source-bound truth names what is live, what is local, what is replay/sample, what Codex actually does and which vocabulary is current.

Actual behaviour: Root README says v6.1 is undeployed; Progress identifies an older failed Worker even though a newer Worker exists; Codex README says live authenticated generation is unavailable/replay-only (`32-60`) while hosted source includes a Container boundary; submission copy uses legacy Belief Test/Experiment Plan/Proof Bundle terminology.

Evidence: `README.md:14-19`; `packages/codex-client/README.md:32-60`; `docs/CODEX_USAGE.md:132-136`; `docs/PROGRESS.md:268-291`; `docs/DEVPOST_COPY.md`.

Console or network evidence: Current Cloudflare metadata from commander conflicts with Progress, confirming staleness rather than a current production failure.

Source-code evidence: `services/hosted-runner/src/launch-boundary.ts` and Worker health contradict replay-only Codex README.

Root-cause hypothesis: Rapid parallel release work updated implementation/deployment without a single generated current-state record.

Learner impact: Minimal.

Judge impact: Makes genuine strengths look unreliable or unfinished.

Trust or integrity impact: High documentation credibility cost.

Recommended correction: Generate a concise current truth page from the final release manifest; revise or clearly archive obsolete docs; update primary submission copy to v5 vocabulary.

Smallest acceptable fix: README opening, Codex usage, Progress current-state table and Judge instructions all agree with the exact public build; stale README section marked historical.

Acceptance criteria: Search finds no contradictory current claims; every production claim cites the exact release evidence tuple; legacy vocabulary appears only in compatibility/history context.

Regression test: Release-doc consistency script checks build ID, status markers and prohibited current legacy phrases.

Dependencies: RTA-002 exact release manifest.

Estimated effort: S

Score leverage: high

Related issues: RTA-001, RTA-002, RTA-004, RTA-006

### RTA-011

Issue ID: RTA-011

Title: Monolithic Worker/UI files and missing hosted CI increase final-release regression risk

Severity: P2

Confidence: confirmed

Reproducibility: always

Category: documentation

Affected route or component: `apps/web/worker/api.ts`, `apps/web/src/App.tsx`, repository automation

Affected user: maintainers and judges reviewing reproducibility

Affected Devpost criterion: Technological Implementation

Environment: repository

Prerequisites: inspect file sizes/module boundaries and automation paths

Reproduction steps: Count lines/sizes; inspect repository for CI workflows; compare local release scripts.

Expected behaviour: Critical protocol/state-machine surfaces have reviewable modules and an automated clean-check pipeline.

Actual behaviour: Worker API is about 8,700 lines/~299 KB with an equally large test; App is ~152 KB. No `.github/workflows`/hosted CI was found. Local scripts are strong but manually invoked.

Evidence: Repository file inventory and automation search.

Console or network evidence: None.

Source-code evidence: Files named above; `package.json` and `scripts/` define local checks.

Root-cause hypothesis: Hackathon delivery optimized for rapid integrated changes.

Learner impact: Indirect regression risk.

Judge impact: Limited if the exact release is proven; meaningful when combined with RTA-002.

Trust or integrity impact: Reviewability/release discipline.

Recommended correction: Do not refactor before submission unless required. Add a minimal hosted CI gate for typecheck, focused authority tests and secret scan; schedule modular extraction after release.

Smallest acceptable fix: CI on push/PR runs deterministic fast checks and uploads a machine-readable summary.

Acceptance criteria: Clean checkout reproduces passing core tests; CI commit equals deployed source; no broad refactor enters critical path.

Regression test: CI itself.

Dependencies: Public repository and CI provider.

Estimated effort: S for CI; XL for safe modularization

Score leverage: medium

Related issues: RTA-002

### RTA-012

Issue ID: RTA-012

Title: Static SPA response security policy is not defined alongside the hardened API headers

Severity: P3

Confidence: medium (source/config only)

Reproducibility: always in repository configuration

Category: security

Affected route or component: static HTML/assets

Affected user: all browser users

Affected Devpost criterion: Technological Implementation

Environment: Vite/Cloudflare assets configuration

Prerequisites: inspect `index.html`, assets config and header files

Reproduction steps: Compare API middleware headers with static asset configuration.

Expected behaviour: HTML receives an appropriate CSP, frame restriction, referrer policy, nosniff and permissions policy.

Actual behaviour: API routes have strong headers (`api.ts:3227-3239`), but no `_headers` or static-response header configuration was found and `index.html` has no CSP meta. Actual production static headers were not captured by this agent.

Evidence: Repository negative search; API source.

Console or network evidence: Unverified live; browser/network agent should confirm response headers.

Source-code evidence: `apps/web/wrangler.jsonc:8-12`; `apps/web/worker/api.ts:3227-3239`; `apps/web/index.html`.

Root-cause hypothesis: Hardening was applied only to Worker API middleware while static assets are served by the assets subsystem.

Learner impact: Low unless an injection/vector is later introduced; React escaping and no dangerous sink were observed.

Judge impact: Low.

Trust or integrity impact: Defense-in-depth gap; no exploit found.

Recommended correction: Add tested static response headers compatible with Vite assets and necessary inline/bootstrap behavior.

Smallest acceptable fix: Frame/referrer/nosniff plus a report-only CSP, then enforce once browser journeys pass.

Acceptance criteria: Public document response shows intended headers; app and downloads work; CSP reports no required blocked resources.

Regression test: Production smoke asserts exact headers for `/`, `/judge`, one asset and one API response.

Dependencies: Final production header capture and CSP tuning.

Estimated effort: S

Score leverage: low

Related issues: none

## Recommended order for follow-on implementation

1. Submit nothing until RTA-002 produces one exact public release tuple and two complete live smokes.
2. Correct RTA-003 and RTA-004 because they damage the first minute and mode honesty with small code changes.
3. Add RTA-005 cost/availability controls before widely sharing the public URL.
4. Resolve RTA-006 by either real read isolation or an explicit `PARTIAL` claim; do not let copy overstate the boundary.
5. Align all submission/README/Judge copy (RTA-010), record only observed evidence, create the demo, and complete RTA-001.
6. Address RTA-007 through RTA-009 if time remains; add CI, but defer monolith refactoring.
7. Confirm RTA-012 live before spending time on it.

## Final limitations

- This agent did not use a browser or send production write/load requests; live route behavior belongs to the live-journey/browser specialists.
- The repository changed concurrently. UI source findings were re-read at the final stable HEAD, but modified worktree content is not commit-addressable.
- The managed sandbox prevents loopback socket, namespace, child-process and Unix-mode verification. Those failures are recorded, not concealed.
- No current production Codex/GPT call was performed, so reachability and quota behavior remain unverified here.
- Exact current deployment source/image provenance was not available; current deployment metadata and health were supplied independently by the audit commander.
