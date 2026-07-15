# Progress

Updated: 2026-07-15

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

The live Responses integration was exercised against the configured endpoint. A
real schema-constrained class-imbalance Belief Test completed, validated locally,
and resolved all three evidence references to exact notebook cells/outputs. The
custom base URL remains server-only and provider-neutral in product state and
copy.

The production control plane is deployed at
`https://counterlab.cserules.workers.dev` as Worker version
`ae01fe03-731f-4939-849f-e8f4eaec7f51`. Container version 10 uses image
digest
`sha256:2b15a35b7f938d754467cadabf8a2f12d085c4436d5f28791cb6add6d2b7bbe1`.
The exact-version production smoke completed all seven stages at
`2026-07-15T13:31:38Z`; its byte-for-byte report is committed as
`docs/PRODUCTION_SMOKE.json` with SHA-256
`d74795a13034293483a1a0375d3906643a3dd2ba3472d8fae3498b6894430bb2`.

## Acceptance matrix

| Gate                                         | Status  | Current evidence                                                                                                                                                                                                                          |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample/live/replay mode separation           | pass    | Contract and Worker regression tests prevent a non-sample artifact from receiving sample Belief Test, result, patch, or replay authority.                                                                                                 |
| Safe notebook intake and evidence references | pass    | Parser tests cover bounded input, no execution, active-output sanitization, stable hashes, exact cells/outputs, and typed refusal.                                                                                                        |
| Live schema-constrained Belief Test          | pass    | Real configured Responses call returned a valid class-imbalance Belief Test with three locally resolved evidence references; invalid/unresolved output is rejected in tests.                                                              |
| Live analyst preview and approval            | pass    | Live calls require a hash-bound preview of the exact sanitized packet; sensitive-looking evidence requires explicit approval, and claim/artifact changes invalidate it.                                                                  |
| Runner job/token/callback/event cursor model | pass    | D1 repository, optimistic transitions, Worker-held P-256 private signing, Container public-key verification, callback idempotency, cursor reconnect, scoped cancellation, recoverable dispatch acknowledgement, and browser-safe event schemas pass tests and production smoke. |
| Artifact-specific hosted Experiment Plan     | pass    | Worker/runner integration compiles and independently verifies typed v2 Plans; rejected candidates release no result.                                                                                                                      |
| Fixed hosted result and cross-language hash  | pass    | Python v2 result hashes now use browser-compatible canonical JSON while legacy v1/replay hashes remain stable; TypeScript result verification passes both concepts.                                                                       |
| Entity-leakage lab and mutations             | pass    | Computed random 0.984722, group 0.594444, ablation 0.673611, zero group overlap; 12/12 published mutations detected.                                                                                                                      |
| Class-imbalance lab and mutations            | pass    | 6,000 rows, 1.0833% positives, majority accuracy 0.989333 with recall 0; threshold recall 0.3125; 12/12 mutations detected.                                                                                                               |
| Interactive fixed-kernel controls            | pass    | Leakage split/entity/ablation/test-fraction and imbalance threshold/prevalence/metric focus dispatch verified configurations; authoritative results remain immutable.                                                                     |
| Transfer-gated artifact patch                | pass    | Fixed forecasting/manufacturing evaluators gate source-free Patch Plans; both concept patch engines preserve unrelated cells and fail closed on verifier mutations.                                                                       |
| Non-sample leakage patch                     | pass    | Three logistic-regression held-out styles compile through the registered one-cell group/identity transformation; entity aliases and patch mutations are tested.                                                                           |
| Reasoning Diff and Proof Bundle              | pass    | Worker integration binds artifact, Plan, result, transfer, patch, job events, and hashes into concept-specific learner/machine outputs.                                                                                                   |
| Studio navigation and resume                 | pass    | Explicit completed-stage review, recent sessions, canonical refresh restoration, Start over, Agent Rail, command palette, and proof console have React tests.                                                                             |
| Constrained generative UI                    | pass    | `json-render` composes only trusted public proof components from sanitized events; it has no action registry and no validity authority.                                                                                                   |
| Private operational diagnostics              | pass    | Secret-protected Worker aggregation reports queue/phase timing samples, repairs, token usage, concept, support, and failures without notebook or session/artifact/job identifiers.                                                         |
| Held-out intake/routing                      | pass    | `counterlab-held-out-v2`: 10/10 cases pass; four leakage, four imbalance, two unsupported.                                                                                                                                                |
| Held-out fixed full-loop completion          | partial | 7/8 supported notebooks complete Plan verification → fixed result → transfer → verified patch without source edits. Random Forest reaches result/transfer then receives `PATCH_ESTIMATOR_OUTSIDE_CONTRACT`. Human review remains pending. |
| Learner pilot                                | partial | Paired-crossover protocol, consent/privacy note, randomization, schema, and analysis script exist. No participants or learner outcomes are claimed.                                                                                       |
| TypeScript/Web/Python suites                 | pass    | The last full local gate passed 179 root TypeScript, 99 web, and 136 Python tests. After the dispatch-recovery change, all 101 web tests and strict web/Worker typechecks passed; a new full release rerun is still required before the v5.1 release claim. |
| New-version browser E2E                      | pass    | 13 local CloakBrowser journeys passed; two credentialed live journeys were correctly skipped locally. Production separately passed sample/replay (2/2) and untouched leakage/imbalance live flows (2/2), including patch and Proof Bundle downloads. |
| Container image build and production deploy | pass    | Worker `ae01fe03-731f-4939-849f-e8f4eaec7f51` and Container version 10 are deployed with the exact digest above. A post-smoke snapshot reported 3 active/healthy and 0 failed instances; health is explicitly time-bound. |
| Production live runner smoke                | pass    | Exact-version smoke passed readiness, capability, public secret scan, sample, replay, untouched leakage, and untouched imbalance. Leakage additionally proved nonzero-cursor reconnect, compile reuse, acknowledged cancellation without result, duplicate-cancel reuse, patch download, and proof validation. |
| One-command local demo                      | pass    | `./scripts/clean-demo.sh` regenerated both fixtures, passed 5 focused tests, confirmed current local D1 migrations, and served healthy kernel and Worker endpoints before its exact processes were stopped.                               |
| Clean-clone/release check/secret scan       | partial | The pre-hardening Studio tree passed a fresh-clone release check and 334-file scan. The current v5.1 tree has not yet rerun the final clean-clone, SBOM, dependency, and secret gates. |

## Latest verified commands

- `./scripts/production-smoke.sh https://counterlab.cserules.workers.dev` — exact Worker version `ae01fe03-731f-4939-849f-e8f4eaec7f51`; all seven stages passed, including two genuine untouched live notebooks. Evidence: `docs/PRODUCTION_SMOKE.json`.
- `pnpm --filter @counterlab/web test -- --run` after dispatch recovery — 101/101 web tests passed; strict web and Worker typechecks passed.
- `./scripts/test-all.sh` before the final dispatch-recovery slice — 179 root TypeScript, 99 web, 136 Python, and 13 local browser journeys passed with 2 credentialed live skips. A current full rerun remains a release action.
- Historical pre-hardening `./scripts/release-check.sh` and fresh-clone runs passed their then-current locked tree; they are not substituted for the pending v5.1 release rerun.
- `./scripts/clean-demo.sh` — 5 focused tests passed; local kernel and Worker health responses were verified independently.
- `pnpm run held-out:run` — intake 10/10; fixed completion 7/8, with the allowlist refusal recorded rather than bypassed.
- `./scripts/reproduce-session.sh leakage-01` — reproduced canonical result `2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0`, 12/12 mutations, and verified patch.
- `./scripts/replay-patch.sh leakage-01` — `PATCH VERIFIED`, group overlap 0.
- Protected production diagnostic probe — unauthenticated 401, authenticated 200, aggregate-only schema.
- Production event cursor probe — a verified 20-event live compile returned events 11–20 when resumed with `after=10`.
- `pnpm run belief:live:verify` — real configured analyst output validated and resolved; approximately 99 seconds on this environment.

## Highest-risk remaining issue

The highest remaining risk is upstream Runtime Codex turn intermittency. The
runner now fails closed, restarts only before material compiler output, caps the
restart budget at three turns, revokes staged credentials after initialization,
and exposes a typed retry path. Production smoke proved both first-attempt
success and recovery after a failed compile, but this cannot remove upstream
availability risk. Cloudflare Containers remain a beta runtime, and no formal
sandbox proof is claimed.
