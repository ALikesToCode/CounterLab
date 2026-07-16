# Progress

Updated: 2026-07-16

## Current status

CounterLab Studio now has three contract-separated modes: sample lesson, live
notebook analysis, and verified replay. Both released concept packs—entity
leakage and class imbalance/metric choice—have fixed kernels, independent
Plan/result verification, interactive controls, deterministic transfer tasks,
source-free Patch Plans, verified copied-notebook patches, Reasoning Diffs, and
Proof Bundles.

The hosted architecture is implemented as a Vite/React Cloudflare control plane
with D1/R2 plus a Container-backed Durable Object runner. Runtime Codex writes
only typed JSON Plans and display-only rationale. The public critical path never
executes model-authored Python. The existing adapter-code compiler remains a
separately labelled advanced local proof and replay.

The v5 scientific-method packages are implemented and independently tested:
`BeliefSpecV2`, Experiment IR v5 with a v2 projection adapter, the deterministic
candidate scorer, and the epistemic verifier with tri-state Evidence Verdicts.
The local Worker/runner implementation now creates a native Belief Spec, accepts
only the four bounded Codex scientific artifacts, independently reruns candidate
verification at the compile callback, dispatches an authority-bound v5
`LAB_RUN`, and executes only its fixed projected Plan against the registered
fixture. The runner deliberately withholds `result.ready`; Worker-side epistemic
verification and tri-state result persistence are the active unfinished gate.
The current production deployment remains the qualified Experiment Plan v2
path and has not been promoted to this worktree.

The live Responses integration was exercised against the configured endpoint. A
real schema-constrained class-imbalance Belief Test completed, validated locally,
and resolved all three evidence references to exact notebook cells/outputs. The
custom base URL remains server-only and provider-neutral in product state and
copy.

The production control plane is deployed at
`https://counterlab.cserules.workers.dev` as Worker version
`7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab`. Container version 13 uses image
digest `sha256:bdd65feebad10d4b0f232e945eb1bd1195b803d13fddf8eee558b2efdd5dc8c6`.
The exact-version production smoke completed all seven stages at
`2026-07-16T05:03:38.850648Z`; its byte-for-byte report is committed as
`docs/PRODUCTION_SMOKE.json` with SHA-256
`cd5c0c05b2f007c577905630a61f7be84c71908a511ca9bffad68f76bd86431a`.

Scientific-engine governance is now implemented for the released ML packs. The
exact local candidate image is non-root, its four admitted engines are bound to
versions, roles, operations, licenses, installed-file hashes, health evidence,
three normalized SBOMs, raw vulnerability evidence, an exact-image reviewed
exception, and an authority hash. The full local image gate passes and live
Proof Bundle v2 creation binds that exact authority hash. The source-bound
candidate was deployed under Cloudflare's distinct registry digest above; both
live smoke stages record authority hash `d7677c79…`. The local OCI digest and
deployed registry digest remain distinct identities and are not interchangeable.

## Active v5.1 execution tracker

| Slice | Status | Repository evidence | Remaining release condition |
| --- | --- | --- | --- |
| Belief Spec v2 analyst/session authority | done | Native v2 proposal, confirmation, evidence resolution, v1 replay adapter, and live Worker tests; commits through `06465f3` | Production promotion is deferred until the full v5 chain is complete. |
| Bounded Codex scientific compile | done | Four-file allowlist, compiler provenance, fixed candidate verifier/scorer, two-repair contract, and terminal callback reconstruction; commits `d57b4a2` through `1972c2d` | Rerun in the final production image and smoke both concepts. |
| V5 fixed-run dispatch | done | Exact Belief Spec, Prediction, manifest, fixture, raw/canonical IR, selection, selected IR, report, and Plan hashes bind the run; `c7eca2e` | No production claim until the callback gate below passes. |
| V5 runner/Python execution | done | Versioned runner dispatches `LAB_RUN` before Codex, Python validates Experiment IR v5 and registered fixture authority, fixed kernel alone computes output, and no early result event is emitted; `37bf938` | Add a direct v5 imbalance-envelope test during concept integration. |
| Worker epistemic result callback | done | Commit `36d8157` write-closes the runner boundary, freezes the exact result bytes, reconstructs every v5 compile/run hash, persists technical and epistemic reports plus the verdict, and lets only Worker-owned events release `SUPPORTS` or `INCONCLUSIVE`; `REJECTED` releases no result. | Reprove this authority for class imbalance, then promote only with the complete v5 chain. |
| Interactive controls on v5 lineage | pending | Existing v2 fixed controls remain qualified. | Remove legacy Belief Test/Plan assumptions and bind every control rerun to the v5 selected experiment. |
| Transfer, patch, Reasoning Diff, proof | pending | Existing v2 artifact-specific path remains qualified. | Migrate lineage without sample/replay authority, then add Proof Capsule v2. |
| Boundary Map, simplified Theater, Judge Mode | pending | Contracts/UX requirements are recorded; existing UI remains the released Studio UI. | Implement only after the v5 ML authority loop passes. |
| Physics/free-fall | blocked by phase order | No verified public support is claimed. | Start only after both live ML concepts pass the new production authority gate. |
| Final release | pending | Previous production v2 smoke remains valid for that deployment. | Full suites, clean clone, engine gate, secret scan, deployment, CloakBrowser journeys, and exact-version production smoke. |

Latest local v5 result-authority verification (2026-07-16):

- Web/Worker Vitest: 123 passed across 18 files.
- Focused session, runner-job, Experiment IR, and epistemic-verifier Vitest: 68 passed across 5 files.
- Strict repository and Worker TypeScript: passed.
- Git whitespace check: passed.
- No `build`, `dev`, deployment, or production smoke was run for this slice.
- Next active slice: prove the same v5 callback authority with a class-imbalance
  Worker integration test, then migrate interactive controls, transfer, patch,
  Reasoning Diff, and proof lineage.

## Acceptance matrix

| Gate                                         | Status  | Current evidence                                                                                                                                                                                                                          |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample/live/replay mode separation           | pass    | Contract and Worker regression tests prevent a non-sample artifact from receiving sample Belief Test, result, patch, or replay authority.                                                                                                 |
| Scientific-engine registry and evidence      | pass    | The full gate passes for local image `94c1987e…` and authority hash `d7677c79…`; 0 fixable Critical and 1 fixable High are handled by exact-image VEX plus bounded reachability and a negative-control scan. Cloudflare deployment uses the separately recorded `bdd65fee…` registry digest, and both live Proof Bundles in the production smoke record the same authority hash. |
| Safe notebook intake and evidence references | pass    | Parser tests cover bounded input, no execution, active-output sanitization, stable hashes, exact cells/outputs, and typed refusal.                                                                                                        |
| Live schema-constrained Belief Test          | pass    | Real configured Responses call returned a valid class-imbalance Belief Test with three locally resolved evidence references; invalid/unresolved output is rejected in tests.                                                              |
| Live analyst preview and approval            | pass    | Live calls require a hash-bound preview of the exact sanitized packet; sensitive-looking evidence requires explicit approval, and claim/artifact changes invalidate it.                                                                  |
| Runner job/token/callback/event cursor model | pass    | D1 repository, optimistic transitions, Worker-held P-256 private signing, Container public-key verification, callback idempotency, cursor reconnect, scoped cancellation, recoverable dispatch acknowledgement, and browser-safe event schemas pass tests and production smoke. |
| Artifact-specific hosted Experiment Plan     | pass    | Worker/runner integration compiles and independently verifies typed v2 Plans; rejected candidates release no result.                                                                                                                      |
| V5 hosted scientific authority migration     | partial | Native Belief Spec, bounded compile/repair, fixed selection, fixture-bound fixed execution, and Worker-owned tri-state result release pass focused tests. Direct class-imbalance Worker integration and all downstream v5 interactive/transfer/patch/proof lineage remain pending. |
| Fixed hosted result and cross-language hash  | pass    | Python v2 result hashes now use browser-compatible canonical JSON while legacy v1/replay hashes remain stable; TypeScript result verification passes both concepts.                                                                       |
| Entity-leakage lab and mutations             | pass    | Computed random 0.984722, group 0.594444, ablation 0.673611, zero group overlap; the current CLI rejects 13/13 critical mutations and the achieved-metrics collector records the same 13/13 published set.                                |
| Class-imbalance lab and mutations            | pass    | 6,000 rows, 1.0833% positives, majority accuracy 0.989333 with recall 0; threshold recall 0.3125; the current CLI rejects 19/19 critical mutations and the achieved-metrics collector records its narrower 15/15 published set.             |
| Interactive fixed-kernel controls            | pass    | Leakage split/entity/ablation/test-fraction and imbalance threshold/prevalence/metric focus dispatch verified configurations; authoritative results remain immutable.                                                                     |
| Transfer-gated artifact patch                | pass    | Fixed forecasting/manufacturing evaluators gate source-free Patch Plans; both concept patch engines preserve unrelated cells and fail closed on verifier mutations.                                                                       |
| Non-sample leakage patch                     | pass    | Three logistic-regression held-out styles compile through the registered one-cell group/identity transformation; entity aliases and patch mutations are tested.                                                                           |
| Reasoning Diff and Proof Bundle              | pass    | Worker integration binds artifact, Plan, result, transfer, patch, job events, hashes, and the exact scientific-engine authority into concept-specific learner/machine outputs; a mismatched authority fails validation.                   |
| Studio navigation and resume                 | pass    | Explicit completed-stage review, recent sessions, canonical refresh restoration, Start over, Agent Rail, command palette, and proof console have React tests.                                                                             |
| Constrained generative UI                    | pass    | `json-render` composes only trusted public proof components from sanitized events; it has no action registry and no validity authority.                                                                                                   |
| Private operational diagnostics              | pass    | Secret-protected Worker aggregation reports queue/phase timing samples, repairs, token usage, concept, support, and failures without notebook or session/artifact/job identifiers.                                                         |
| Held-out intake/routing                      | pass    | `counterlab-held-out-v2`: 10/10 cases pass; four leakage, four imbalance, two unsupported.                                                                                                                                                |
| Held-out fixed full-loop completion          | partial | 7/8 supported notebooks complete Plan verification → fixed result → transfer → verified patch without source edits. Random Forest reaches result/transfer then receives `PATCH_ESTIMATOR_OUTSIDE_CONTRACT`. Human review remains pending. |
| Learner pilot                                | partial | Paired-crossover protocol, consent/privacy note, randomization, schema, and analysis script exist. No participants or learner outcomes are claimed.                                                                                       |
| TypeScript/Web/Python suites                 | pass    | `COUNTERLAB_E2E_BASE_URL=https://counterlab.cserules.workers.dev ./scripts/test-all.sh` passed 303 root TypeScript tests, 110 web/Worker tests, 157 Python tests, strict TypeScript checks, and the production-backed browser slice.              |
| New-version browser E2E                      | pass    | 13 CloakBrowser journeys passed against the production endpoint; two credentialed browser-only live cases were skipped. Production smoke separately passed sample/replay (2/2) and untouched leakage/imbalance live flows (2/2), including patch and Proof Bundle downloads. |
| Container image build and production deploy | pass    | Worker `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` is bound to Container version 13 and deployed registry digest `bdd65fee…`; the source-bound local qualification remains recorded separately as OCI digest `94c1987e…`. |
| Production live runner smoke                | pass    | One fail-closed run passed readiness, capability health, public secret scan, sample, replay, untouched live leakage, and untouched live imbalance. It also validated reconnect/idempotency/cancellation, patch and proof downloads, both Proof Bundles, and their engine-authority bindings. |
| One-command local demo                      | pass    | `./scripts/clean-demo.sh` regenerated both fixtures, passed 5 focused tests, confirmed current local D1 migrations, and served healthy kernel and Worker endpoints before its exact processes were stopped.                               |
| Clean-clone/release check/secret scan       | partial | The pre-hardening Studio tree passed a fresh-clone release check and 334-file scan. The current v5.1 tree has not yet rerun the final clean-clone, SBOM, dependency, and secret gates. |

## Latest verified commands

- `./scripts/production-smoke.sh https://counterlab.cserules.workers.dev` — exact Worker version `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` and deployed image digest `bdd65fee…`; all seven stages passed, including two genuine untouched live notebooks and authority hash `d7677c79…` in both live Proof Bundles. Report SHA-256: `cd5c0c05…`.
- `COUNTERLAB_E2E_BASE_URL=https://counterlab.cserules.workers.dev ./scripts/test-all.sh` — 303 root TypeScript, 110 web/Worker, and 157 Python tests passed; 13 CloakBrowser journeys passed against production and 2 credentialed browser-only live cases were skipped. The separate production smoke above exercised both real live concepts.
- `./scripts/run-mutations.sh leakage` and `./scripts/run-mutations.sh imbalance` — 13/13 and 19/19 critical mutations detected.
- `PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py` — regenerated canonical current kernel hashes and the 13/13 leakage plus 15/15 published imbalance mutation subsets in `docs/ACHIEVED_METRICS.json`.
- `./scripts/verify-scientific-engines.sh --image counterlab-runner:engine-registry-v5` — passed for local OCI image `sha256:94c1987e54b5074b3eb075f5924ec9d757d8579584d6d59b129124065272f934`; authority hash `d7677c79914505c11cc0474a0f3e4be7527173ea27c5640b65c7b8a373a8e881`. Its `local_candidate` metadata is deliberately distinct from Cloudflare's deployed registry digest.
- The unsuppressed Grype 0.112.0 scan recorded 171 findings and 0 fixable Critical. One fixable High (`CVE-2026-15308`) is bound to exact-image VEX and bounded reachability; the applied scan ignored exactly that one finding and the wrong-subcomponent control ignored none.
- `pnpm test:ts` — 296 root and 103 web/Worker tests passed; `pnpm test:python` — 105 passed; `pnpm typecheck` — passed.
- Two clean builder executions produced kernel wheel hash `16cbf5a0b9e76badddb29767858a31e310b454a9c30f44c3abe86a87b746ed57`.
- `pnpm --filter @counterlab/web test -- --run` after dispatch recovery — 101/101 web tests passed; strict web and Worker typechecks passed.
- `./scripts/test-all.sh` before the final dispatch-recovery slice — 179 root TypeScript, 99 web, 136 Python, and 13 local browser journeys passed with 2 credentialed live skips. A current full rerun remains a release action.
- Historical pre-hardening `./scripts/release-check.sh` and fresh-clone runs passed their then-current locked tree; they are not substituted for the pending v5.1 release rerun.
- `./scripts/clean-demo.sh` — 5 focused tests passed; local kernel and Worker health responses were verified independently.
- `pnpm run held-out:run` — intake 10/10; fixed completion 7/8, with the allowlist refusal recorded rather than bypassed.
- `COUNTERLAB_SANDBOX_IMAGE=counterlab-runner:local ./scripts/reproduce-session.sh leakage-01` — validated historical result `25016542…`, reproduced current semantic result `a6ae7652…`, detected 13/13 mutations, and verified the patch without rewriting replay evidence.
- `./scripts/replay-patch.sh leakage-01` — validated archived patch `eb20…` and independently verified current patch `6aee…`, with group overlap 0.
- Protected production diagnostic probe — unauthenticated 401, authenticated 200, aggregate-only schema.
- Production event cursor probe — a verified 20-event live compile returned events 11–20 when resumed with `after=10`.
- `pnpm run belief:live:verify` — real configured analyst output validated and resolved; approximately 99 seconds on this environment.

## Highest-risk remaining issue

The highest remaining product risk is the final result-release authority cutover.
The local v5 path now hash-binds Belief Spec, Prediction, raw compiler files,
fixed selection, selected IR, projected Plan, and fixture through fixed-kernel
execution, but the Worker result callback does not yet persist the epistemic
report and tri-state verdict. Until it does, no v5 result may be released and the
current production deployment must remain on its qualified v2 contract. Upstream
Runtime Codex turn intermittency remains an operational risk; the runner fails
closed and the previous production smoke proved its bounded recovery path. The
reviewed vulnerability exception expires on
`2026-07-30T04:21:10Z` and requires requalification on any bound source, image,
SBOM, entrypoint, scanner, or vulnerability-status change. Cloudflare
Containers remain a beta runtime, and no formal sandbox proof is claimed.
