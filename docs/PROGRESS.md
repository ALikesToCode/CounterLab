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
verification now freezes the result, independently verifies it, persists its
tri-state verdict, and alone releases readiness. The browser renders native v2
belief authority after refresh, and downstream session-core/Worker gates now
resolve exact v5 evidence authority before revision and concept-specific
transfer. Interactive reruns now derive from frozen compile/result authority
without changing the Evidence Verdict. The strict v5 patch contract, runner,
fixed Python verifier, and both Worker concept paths now preserve that authority
through reject-repair or direct verification, source sealing, exact terminal
hashes, immutable patch artifacts, and `PATCH_VERIFIED`. Native Reasoning Diff
v2 now binds the complete v5 evidence tuple, and the Worker issues a
content-addressed Proof Capsule v2 only after independently rebuilding that
authority from immutable job objects. The canonical archive, optional HMAC,
semantic validator, exact-byte download, duplicate-callback recovery, tamper
rejection, and local validate/inspect/replay CLI pass. Capsule issuance itself
is covered for both ML packs. Boundary Map v1 now has strict
cross-runtime contracts, fixed 25-cell leakage and 15-cell imbalance kernels,
pack-owned grids, and exact-request authorization. Its independent verifier,
strict purpose-separated runner contract, and fixed hosted execution now pass
locally. Worker-owned immutable freeze, independent verification, HMAC-signed
receipt, session projection, authority-checked retrieval, rejection handling,
and revision gating now pass for both concepts. The accessible learner renderer
remains in progress.
The current production scientific authority remains the qualified Experiment
Plan v2 path and has not been promoted to the in-progress v5.1 worktree. The
focused Experiment Theater UI was backported onto that qualified production
source without advancing the scientific contracts.

The live Responses integration was exercised against the configured endpoint. A
real schema-constrained class-imbalance Belief Test completed, validated locally,
and resolved all three evidence references to exact notebook cells/outputs. The
custom base URL remains server-only and provider-neutral in product state and
copy.

The production control plane is deployed at
`https://counterlab.cserules.workers.dev` as Worker version
`67b6b2ad-a77b-4f62-b8f6-4bbd02300869`. The UI-only promotion used Wrangler's
`--containers-rollout=none`; Container version 13 remains ready on image
digest `sha256:bdd65feebad10d4b0f232e945eb1bd1195b803d13fddf8eee558b2efdd5dc8c6`.
The last full exact-version production smoke belongs to Worker
`7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` and completed all seven stages at
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

### At-a-glance execution ledger

- **Done locally:** native Belief Spec v2; bounded Codex scientific compile;
  fixed scorer and epistemic verifier; tri-state primary result authority;
  interactive fixed-kernel controls; deterministic transfer; verified copied
  notebook patches for both ML packs; canonical JSON parity; and end-to-end
  Boundary Map dispatch, fixed execution, rejection, Worker verification,
  integrity/HMAC receipt, retrieval, revision gating, native Reasoning Diff v2, and
  deterministic Proof Capsule v2 issuance/download/CLI replay.
- **In progress:** accessible Boundary Map and Reasoning Diff learner rendering,
  plus the Studio Proof Capsule download surface.
- **Pending:** hosted v5 capsule replay persistence; final Studio/Judge integration;
  clean-clone, engine, secret, browser, accessibility, and performance gates;
  final Container/Worker promotion and exact-version production smoke.
- **Blocked by phase order:** verified physics/free-fall and learner-impact
  expansion. Physics does not begin until both ML concepts pass the new public
  production authority gate.
- **Not run for this checkpoint:** `build`, `dev`, deployment, browser journeys,
  or production smoke. The current public deployment remains the qualified v2
  release described below.

| Slice | Status | Repository evidence | Remaining release condition |
| --- | --- | --- | --- |
| Belief Spec v2 analyst/session authority | done | Native v2 proposal, confirmation, evidence resolution, v1 replay adapter, and live Worker tests; commits through `06465f3` | Production promotion is deferred until the full v5 chain is complete. |
| Bounded Codex scientific compile | done | Four-file allowlist, compiler provenance, fixed candidate verifier/scorer, two-repair contract, and terminal callback reconstruction; commits `d57b4a2` through `1972c2d` | Rerun in the final production image and smoke both concepts. |
| V5 fixed-run dispatch | done | Exact Belief Spec, Prediction, manifest, fixture, raw/canonical IR, selection, selected IR, report, and Plan hashes bind the run; `c7eca2e` | No production claim until every downstream v5 stage passes. |
| V5 runner/Python execution | done | Versioned runner dispatches `LAB_RUN` before Codex, Python validates Experiment IR v5 and registered fixture authority, fixed kernel alone computes output, and no early result event is emitted; direct leakage and imbalance envelopes are covered. | Rebuild and requalify only with the complete release chain. |
| Worker epistemic result callback | done | Commits `36d8157`, `32e9b0a`, and `f5de4e2` close runner writes, freeze exact bytes, bind frozen kernel/fixture/seed authority, persist reports/verdict, and prove `SUPPORTS` plus five no-release imbalance mutations through the Worker. | Migrate the browser and downstream learner stages before promotion. |
| Browser and downstream evidence authority | done | Commits `f406f0e`, `22169c9`, and `3dbadd0` render exact v2 Belief Specs after refresh, fail closed on mixed or hash-mismatched authority, and route leakage/imbalance to their fixed transfer evaluators. | Preserve this authority tuple through interactive, patch, and proof migration. |
| Interactive controls on v5 lineage | done locally | Commits `30ec305`, `ce88b9c`, and `ee3c78f` add a purpose-separated strict bundle, cross-language fixed derivation, frozen compile/result authority, both concept controls, and immutable session verdicts. | Requalify in the final image and production smoke. |
| V5 deterministic transfer | done locally | Both genuine v5 concepts pass their registered fixed transfer evaluator; `INCONCLUSIVE` may transfer but remains patch-locked. | Requalify inside the complete release chain before production promotion. |
| V5 artifact-specific patch | done locally for both packs | Commits `1d96fe0`, `3f8a653`, `ff5e03c`, `15799f9`, `a970fc0`, `8822f4d`, and `d2f2b92` add the strict v5 bundle, independent Python checks, transfer evaluator binding, idempotent Worker dispatch, genuine verifier reject-repair, source sealing, exact four-output callback, immutable authority, and copied patch download without creating a legacy proof. The Worker test now completes both concepts to `PATCH_VERIFIED`. | Requalify both concepts in the final image and production smoke. |
| Canonical JSON authority | done locally | Commits `47f49a7` and `b4a68ff` preserve dangerous own keys, write sorted object text directly, use UTF-16 key order in both runtimes, reject lone surrogates, preserve Unicode normalization, and pass shared hash vectors without changing normal historical evidence. Proof Capsule v2 records `counterlab-canonical-json-v1`. | Rerun final release vectors after the last lock/source change. |
| Reasoning Diff v2 and Proof Capsule v2 | done locally | Commits `ccf8dc2`, `8334d87`, `337fc9a`, `d44f001`, `e42d26e`, `e42b3a2`, and `0b252b2` add native session authority, deterministic canonical archives, semantic verification, immutable content-addressed storage, safe public receipts, HMAC/integrity policy, exact-byte download, duplicate-callback recovery, tamper rejection, and validate/inspect/replay CLI support for both ML packs. No v5 object is cast into the legacy proof. | Add hosted capsule replay persistence and learner/Judge surfaces, regenerate the engine snapshot after the final lock, then requalify the image and production paths. |
| Boundary Map authority | done locally | Commits through `5b89084` and `77e1cba` bind the exact pack sweep into compile authority, execute only registered grids, freeze exact runner bytes, independently reverify lineage and values, issue an integrity/HMAC receipt using Worker time, reject without result release, expose immutable authority-checked retrieval, and gate v5 revision. Leakage and imbalance, duplicate callback, wrong-key, race, and rejection paths pass. | Add the accessible learner renderer, then requalify both concepts in the final image and production smoke. |
| Simplified Theater and Judge Mode | partial locally | `DESIGN.md`, the focused-theater plan, and commit `01ac1d7` remove the permanent agent cockpit, widen the learner canvas, consolidate authority into one evidence rail plus the collapsed proof drawer, and raise Studio typography and controls to the documented floor. | Run updated desktop/390 px CloakBrowser journeys after the owner starts the forbidden local dev surface; Boundary Map data and the full six-stage vocabulary remain pending. |
| Physics/free-fall | blocked by phase order | No verified public support is claimed. | Start only after both live ML concepts pass the new production authority gate. |
| Final release | pending | Previous production v2 smoke remains valid for that deployment. | Full suites, clean clone, engine gate, secret scan, deployment, CloakBrowser journeys, and exact-version production smoke. |

Latest local v5.1 verification checkpoint (2026-07-16):

- Worker API Vitest: 57/57 passed after native Reasoning Diff and Proof Capsule
  issuance for both packs, HMAC and missing/wrong-key policy, immutable
  download, duplicate callback, CLI replay, and tamper rejection.
- Proof Capsule archive/semantic authority Vitest: 5/5 passed; node CLI Vitest:
  3/3 passed. The positive CLI path uses an actual Worker-issued capsule.
- Strict repository, web, and Worker TypeScript checks passed for this slice.
- Concept registry Vitest: 12/12 passed.
- Relevant v5 patch contracts/runner Vitest: 83/83 passed before Worker
  integration; hosted Python patch tests: 9/9 passed.
- Shared canonical, Proof Bundle, session, and Experiment IR suites pass,
  including integer-like keys, non-BMP UTF-16 ordering, dangerous own keys,
  Unicode preservation, and lone-surrogate rejection in TypeScript and Python.
- Boundary Map contracts and Experiment IR: 70/70 focused TypeScript tests
  passed. Registry, analyst, scientific-candidate, and epistemic suites: 101/101
  passed.
- Boundary Map verifier: 24/24 mutation, lineage, canonical-report, and
  integrity/HMAC receipt tests passed. Runner bundle: 21/21; hosted runner:
  15/15 focused tests passed.
- Boundary compile contracts/compiler/runner: 48/48 focused TypeScript tests;
  hosted Boundary execution: 22/22 Python tests.
- Worker Boundary authority after dispatch, rejection, receipt, retrieval, and
  revision-race closure: 18 files and 140/140 tests; session core 26/26;
  repository TypeScript check passed.
- Full Python kernel suite after hosted Boundary Map integration: 169/169
  passed.
- Full TypeScript suites after current-pack fixture repair: 409/409 root and
  136/136 web/Worker tests passed; strict repository and Worker TypeScript
  passed.
- Focused Theater React tests: 3/3 passed; strict web/Worker TypeScript and
  targeted Prettier checks passed. `DESIGN.md` lint reports 0 warnings and 0
  errors.
- Current live Worker test fixtures resolve pack versions from the registry;
  historical signed replay/contract fixtures remain on their original versions.
- Git whitespace check: passed.
- No `build`, `dev`, deployment, or production smoke was run for this slice.
- The recorded scientific-engine candidate remains source-bound to lock hash
  `48443375…`; current worktree drift is an explicit fail-closed release finding.
- Next active slice: render the verified Boundary Map and Reasoning Diff in the
  learner journey, expose Capsule download/replay without technical clutter,
  then run the current-tree release and production qualification gates.

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
| V5 hosted scientific authority migration     | partial | Native Belief Spec, bounded compile/repair, fixed selection, fixture-bound fixed execution, Worker-owned tri-state result release, browser v2 belief rendering, deterministic transfer, frozen interactive controls, both full v5 patch callbacks, both Boundary Map authority paths, Reasoning Diff v2, and Proof Capsule v2 pass locally. Learner rendering, hosted replay persistence, image requalification, and production promotion remain pending. |
| Fixed hosted result and cross-language hash  | pass    | Python v2 result hashes now use browser-compatible canonical JSON while legacy v1/replay hashes remain stable; TypeScript result verification passes both concepts.                                                                       |
| Entity-leakage lab and mutations             | pass    | Computed random 0.984722, group 0.594444, ablation 0.673611, zero group overlap; the current CLI rejects 13/13 critical mutations and the achieved-metrics collector records the same 13/13 published set.                                |
| Class-imbalance lab and mutations            | pass    | 6,000 rows, 1.0833% positives, majority accuracy 0.989333 with recall 0; threshold recall 0.3125; the current CLI rejects 19/19 critical mutations and the achieved-metrics collector records its narrower 15/15 published set.             |
| Interactive fixed-kernel controls            | pass    | Leakage split/entity/ablation/test-fraction and imbalance threshold/prevalence/metric focus dispatch verified configurations; authoritative results remain immutable.                                                                     |
| Transfer-gated artifact patch                | pass    | Fixed forecasting/manufacturing evaluators gate source-free Patch Plans; both concept patch engines preserve unrelated cells and fail closed on verifier mutations.                                                                       |
| Non-sample leakage patch                     | pass    | Three logistic-regression held-out styles compile through the registered one-cell group/identity transformation; entity aliases and patch mutations are tested.                                                                           |
| Reasoning Diff and portable proof            | partial | Legacy Worker integration remains byte-compatible. Native v5 now independently rebuilds frozen compile/result/Boundary/transfer/patch authority, issues Reasoning Diff v2, and stores/downloads a semantically validated content-addressed Proof Capsule. Its local CLI validates, inspects, and reconstructs a visibly labelled capsule replay. Hosted replay persistence, learner UI, final image qualification, and production proof remain pending. |
| Studio navigation and resume                 | pass    | Explicit completed-stage review, recent sessions, canonical refresh restoration, Start over, focused project/evidence rail, command palette, collapsed proof console, and no-permanent-cockpit contract have React tests.                  |
| Constrained generative UI                    | pass    | `json-render` composes only trusted public proof components from sanitized events; it has no action registry and no validity authority.                                                                                                   |
| Private operational diagnostics              | pass    | Secret-protected Worker aggregation reports queue/phase timing samples, repairs, token usage, concept, support, and failures without notebook or session/artifact/job identifiers.                                                         |
| Held-out intake/routing                      | pass    | `counterlab-held-out-v2`: 10/10 cases pass; four leakage, four imbalance, two unsupported.                                                                                                                                                |
| Held-out fixed full-loop completion          | partial | 7/8 supported notebooks complete Plan verification → fixed result → transfer → verified patch without source edits. Random Forest reaches result/transfer then receives `PATCH_ESTIMATOR_OUTSIDE_CONTRACT`. Human review remains pending. |
| Learner pilot                                | partial | Paired-crossover protocol, consent/privacy note, randomization, schema, and analysis script exist. No participants or learner outcomes are claimed.                                                                                       |
| TypeScript/Web/Python suites                 | pass    | `COUNTERLAB_E2E_BASE_URL=https://counterlab.cserules.workers.dev ./scripts/test-all.sh` passed 303 root TypeScript tests, 110 web/Worker tests, 157 Python tests, strict TypeScript checks, and the production-backed browser slice.              |
| New-version browser E2E                      | pass    | 13 CloakBrowser journeys passed against the production endpoint; two credentialed browser-only live cases were skipped. Production smoke separately passed sample/replay (2/2) and untouched leakage/imbalance live flows (2/2), including patch and Proof Bundle downloads. |
| Container image build and production deploy | pass    | Current Worker `67b6b2ad-a77b-4f62-b8f6-4bbd02300869` reuses ready Container version 13 and deployed registry digest `bdd65fee…`; no Container rollout occurred. The source-bound local qualification remains recorded separately as OCI digest `94c1987e…`. |
| Production live runner smoke                | pass    | One fail-closed run passed readiness, capability health, public secret scan, sample, replay, untouched live leakage, and untouched live imbalance. It also validated reconnect/idempotency/cancellation, patch and proof downloads, both Proof Bundles, and their engine-authority bindings. |
| One-command local demo                      | pass    | `./scripts/clean-demo.sh` regenerated both fixtures, passed 5 focused tests, confirmed current local D1 migrations, and served healthy kernel and Worker endpoints before its exact processes were stopped.                               |
| Clean-clone/release check/secret scan       | partial | The pre-hardening Studio tree passed a fresh-clone release check and 334-file scan. The current v5.1 tree has not yet rerun the final clean-clone, SBOM, dependency, and secret gates. |

## Latest verified commands

- `pnpm exec wrangler deploy --config dist/counterlab/wrangler.json --containers-rollout=none` — deployed focused Theater assets as Worker `67b6b2ad-a77b-4f62-b8f6-4bbd02300869` at 100%; Container version 13 and digest `bdd65fee…` remained unchanged. `/ready` returned all five checks true, and CloakBrowser completed the sample at desktop and 390 px with no browser errors or page overflow.
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

The highest remaining product risk is presenting and promoting the native v5
authority without weakening it. Both ML paths now continue from their frozen
Belief Spec, Prediction, Experiment IR, selection, result, Evidence Verdict,
Boundary receipt, transfer, Patch Plan, and copied patch through Reasoning Diff
v2 and a semantically verified Proof Capsule v2. The local archive, immutable
storage, download, HMAC policy, and labelled CLI replay are complete. Hosted
replay persistence, accessible Boundary/Reasoning Diff rendering, learner-facing
Capsule controls, engine/image requalification, and final production smoke
remain open. The current production deployment stays on its qualified v2
contract.
Upstream Runtime Codex turn intermittency remains an operational
risk; the runner fails closed and the previous production smoke proved its
bounded recovery path. The reviewed vulnerability exception expires on
`2026-07-30T04:21:10Z` and requires requalification on any bound source, image,
SBOM, entrypoint, scanner, or vulnerability-status change. Cloudflare
Containers remain a beta runtime, and no formal sandbox proof is claimed.
