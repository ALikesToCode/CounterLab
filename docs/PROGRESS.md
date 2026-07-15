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
| TypeScript/Web/Python suites                 | pass    | `pnpm test`: 164 root TypeScript, 76 web, and 90 Python tests passed. `pnpm run typecheck` passed including generated Worker types.                                                                                                       |
| New-version browser E2E                      | not run | Fifteen CloakBrowser journeys are defined, including opt-in real hosted leakage and imbalance flows. The current AGENTS instructions prohibit this agent from starting `dev` or `build`; a user-started server or explicit permission is required. |
| Container image build and production deploy  | not run | Runner image/binding are implemented; the upgraded image has not been built/deployed in this worktree because build commands are prohibited.                                                                                              |
| Production live runner smoke                 | not run | The existing public deployment predates this Container upgrade. Do not treat its current health as proof of the new runner.                                                                                                               |
| Clean-clone/release check/secret scan        | partial | Secret scan passed across 333 repository files. The full release/clean-clone script also invokes prohibited build/E2E steps and therefore awaits user execution/permission.                                                              |

## Latest verified commands

- `pnpm test` — 164 root TypeScript, 76 web, 90 Python passed.
- `pnpm run typecheck` — root, web, and Worker typechecks passed.
- `pnpm exec vitest run --config evals/held-out/vitest.config.ts` — 6 tests passed.
- `pnpm run held-out:run` — intake 10/10; fixed completion 7/8.
- `./scripts/run-mutations.sh leakage` and `imbalance` — 12/12 detected in each matrix.
- `pnpm --filter @counterlab/web exec playwright test --config playwright.config.ts --list` — 15 CloakBrowser journeys discovered; execution not claimed.
- `pnpm run format:check` — passed.
- `python3 scripts/secret-scan.py` — passed across 333 repository files.
- `./scripts/replay-patch.sh leakage-01` — `PATCH VERIFIED`, group overlap 0.
- `PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py` — regenerated `docs/ACHIEVED_METRICS.json` from fixed kernels/verifiers.
- `pnpm run belief:live:verify` — real configured analyst output validated and resolved; approximately 99 seconds on this environment.

## Highest-risk remaining issue

The highest release risk is operational rather than hidden sample authority: the
new Container runner has comprehensive in-repository integration coverage but no
fresh public deployment/browser smoke. The next authorized action must build and
deploy that exact image, run one untouched live artifact through the public URL,
reconnect its event stream, download its patch/proof, scan for secrets, and then
record the resulting deployment identifier. Cloudflare Containers remain a beta
runtime and no formal sandbox claim is made.
