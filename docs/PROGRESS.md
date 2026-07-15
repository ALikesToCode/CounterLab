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
`06c96067-a679-41ba-8487-fb2ad781c316`. Runner version 9 uses image digest
`sha256:167a207956b5efc6b28702d905d2eafaad8e0502da75e3df1de3a38a9927a636`;
Cloudflare reported all 7 instances healthy during the release smoke.

## Acceptance matrix

| Gate                                         | Status  | Current evidence                                                                                                                                                                                                                          |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample/live/replay mode separation           | pass    | Contract and Worker regression tests prevent a non-sample artifact from receiving sample Belief Test, result, patch, or replay authority.                                                                                                 |
| Safe notebook intake and evidence references | pass    | Parser tests cover bounded input, no execution, active-output sanitization, stable hashes, exact cells/outputs, and typed refusal.                                                                                                        |
| Live schema-constrained Belief Test          | pass    | Real configured Responses call returned a valid class-imbalance Belief Test with three locally resolved evidence references; invalid/unresolved output is rejected in tests.                                                              |
| Live analyst preview and approval            | pass    | Live calls require a hash-bound preview of the exact sanitized packet; sensitive-looking evidence requires explicit approval, and claim/artifact changes invalidate it.                                                                  |
| Runner job/token/callback/event cursor model | pass    | D1 repository, optimistic transitions, single-job signed tokens, callback idempotency, cursor reconnect, and browser-safe event schemas pass integration tests.                                                                           |
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
| TypeScript/Web/Python suites                 | pass    | Current-worktree and fresh-clone release gates each passed 170 root TypeScript, 79 web, and 136 Python tests plus root/web/Worker typechecks.                                                                                              |
| New-version browser E2E                      | pass    | 13 local CloakBrowser journeys passed; two credentialed live journeys were correctly skipped locally. Production separately passed sample/replay (2/2) and untouched leakage/imbalance live flows (2/2), including patch and Proof Bundle downloads. |
| Container image build and production deploy | pass    | Worker `06c96067-a679-41ba-8487-fb2ad781c316` and runner version 9 are deployed; Cloudflare reported 7/7 healthy instances for the pinned production image digest.                                                                          |
| Production live runner smoke                | pass    | Both untouched supported notebooks completed live artifact-specific analysis, compile/verify, fixed runs, interactive control, transfer, verified patch, and proof download. A completed compile resumed from cursor 10 with events 11–20. |
| One-command local demo                      | pass    | `./scripts/clean-demo.sh` regenerated both fixtures, passed 5 focused tests, confirmed current local D1 migrations, and served healthy kernel and Worker endpoints before its exact processes were stopped.                               |
| Clean-clone/release check/secret scan       | pass    | A fresh temporary clone installed both locked dependency sets and passed `./scripts/release-check.sh`; the final scan found no repository secret pattern across 334 files.                                                               |

## Latest verified commands

- `./scripts/release-check.sh` — passed in the current worktree and a fresh temporary clone: 170 root TypeScript, 79 web, 136 Python, 13 local browser journeys with 2 credentialed live skips, both 12/12 mutation matrices, sandbox smoke, production build, replay reproduction, patch verification, and a 334-file secret scan.
- `./scripts/production-smoke.sh` against `https://counterlab.cserules.workers.dev` — capability and public-asset secret checks passed; sample/replay 2/2 and real untouched leakage/imbalance 2/2 passed.
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
