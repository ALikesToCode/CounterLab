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
and revision gating now pass for both concepts. The browser now parses that
authority strictly, starts and reconnects Boundary jobs, releases no cells
before verification, renders a keyboard-inspectable semantic map, and keeps
revision locked until the receipt is present. Both live ML paths also render the
native six-dimension Reasoning Diff and download the immutable `.counterlab`
Proof Capsule directly; historical sample and replay paths retain their own
labelled authority.
The current production scientific authority remains the qualified Experiment
Plan v2 path. The complete v5.1 source is now bound to a fresh local runner
candidate and passes the local scientific gate, but it has not yet been pushed,
qualified, deployed, or production-smoked. The focused Experiment Theater UI
was backported onto the current production source without advancing its
scientific contracts.

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

Scientific-engine governance is implemented for the released ML packs. The
exact source-bound v5.1 candidate is `efe7fcf…`, local OCI digest `1b974af9…`,
and authority `aff2ea37…`. Its four admitted engines are bound to versions,
roles, operations, licenses, installed-file hashes, health evidence, three
normalized SBOMs, raw vulnerability evidence, and an exact-image reviewed
exception. The full local image gate passes. The earlier Cloudflare registry
digest `bdd65fee…` and authority `d7677c79…` remain historical production v2
evidence; those identities are not interchangeable with the new candidate.

## Active v5.1 execution tracker

### At-a-glance execution ledger

- **Done locally:** native Belief Spec v2; bounded Codex scientific compile;
  fixed scorer and epistemic verifier; tri-state primary result authority;
  interactive fixed-kernel controls; deterministic transfer; verified copied
  notebook patches for both ML packs; canonical JSON parity; and end-to-end
  Boundary Map dispatch, fixed execution, rejection, Worker verification,
  integrity/HMAC receipt, retrieval, revision gating, verified-only accessible
  rendering, native Reasoning Diff v2, deterministic Proof Capsule v2
  issuance/download/CLI replay, direct learner download, and the six-stage
  Studio vocabulary with keyboard-operable Evidence & proof tabs; hosted,
  persistently labelled Capsule replay; evidence-first Judge Mode; D1 migration
  application; and an exact source-bound non-root runner candidate whose local
  scientific gate passes.
- **In progress:** Cloudflare registry push, qualified Container/Worker
  promotion, and exact-version production smoke for the v5.1 candidate.
- **Pending:** current-source desktop and 390 px browser journeys, chat-first
  learner simplification, clean-clone, secret, accessibility, performance, and
  final release gates.
- **Blocked by phase order:** verified physics/free-fall and learner-impact
  expansion. Physics does not begin until both ML concepts pass the new public
  production authority gate.
- **Not run for this checkpoint:** local `dev`, current-source browser journeys,
  v5.1 deployment, or v5.1 production smoke. The exact runner image build and
  scientific qualification checks were run; the public deployment remains the
  qualified v2 release described below until promotion finishes.

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
| Reasoning Diff v2 and Proof Capsule v2 | done locally | Commits through `7e82a5d` add native session authority, deterministic canonical archives, semantic verification, immutable content-addressed storage, safe public receipts, HMAC/integrity policy, exact-byte download, duplicate-callback recovery, tamper rejection, validate/inspect/replay CLI support, a six-dimension learner Reasoning Diff, direct `.counterlab` download for both ML packs, and persistently labelled hosted Capsule replay. No v5 object is cast into legacy proof. | Qualify the exact image and prove both live concepts plus replay in the new production smoke. |
| Boundary Map authority and learner rendering | done locally | Commits through `5b89084`, `77e1cba`, `9c4fc23`, and `f50bab1` bind the exact pack sweep into compile authority, execute only registered grids, freeze and independently reverify lineage and values, issue an integrity/HMAC receipt, reject without result release, expose immutable authority-checked retrieval, gate revision, and render only a verified map with a semantic table and keyboard cell inspection. Both concepts and rejection/reconnect paths are covered. | Requalify both concepts in the final image and run the current desktop/390 px browser journey. |
| Simplified Theater and Judge Mode | done locally; browser pending | `DESIGN.md`, the focused-theater work, hosted Capsule replay commits, and `ef066fa` remove the permanent agent cockpit, consolidate technical evidence into a collapsed Evidence & proof drawer, enforce Question → Prediction → Test → Boundary → Apply → Repair, and add evidence-first Judge routes with labelled authority. | Run updated desktop/390 px CloakBrowser journeys against the promoted source, then complete the chat-first clarity pass without exposing results before Prediction. |
| Physics/free-fall | blocked by phase order | No verified public support is claimed. | Start only after both live ML concepts pass the new production authority gate. |
| Final release | in progress | Exact source-bound runner `efe7fcf…` built as local OCI `1b974af9…`; scientific gate passes as authority `aff2ea37…`. Previous production v2 smoke remains valid only for that deployment. | Evidence-only commit, registry push, qualification, deploy, exact-version smoke, current browser journeys, and remaining release checks. |

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
- Current learner-surface React/API suite: 153/153 passed after strict public
  proof parsing, verified-only Boundary rendering, revision gating, native
  Reasoning Diff/Capsule review, six-stage navigation, and keyboard proof tabs;
  strict web TypeScript passed. Shared contract tests: 39/39 passed.
- Current live Worker test fixtures resolve pack versions from the registry;
  historical signed replay/contract fixtures remain on their original versions.
- Git whitespace check: passed.
- The exact source-bound runner image was built from `efe7fcf…` as local OCI
  `sha256:1b974af9…`, with non-root user `10001:10001` and matching OCI source
  labels. `dev`, deployment, current browser journeys, and v5.1 production
  smoke have not yet run.
- Two independent no-cache Python builder executions and the release candidate
  produced the same kernel wheel SHA-256 `38b1be0e…`.
- Scientific registry Vitest passed 68/68; repository TypeScript passed; the
  exact-image scientific gate returned `VERIFIED` with authority `aff2ea37…`.
  Grype recorded 171 findings, 0 fixable Critical, one reviewed fixable High,
  one intended VEX suppression, and zero negative-control suppressions.
- Production D1 migrations `0004_boundary_request_purpose.sql` and
  `0005_proof_capsule_replays.sql` are applied; all 137 existing runner-job
  purpose values were preserved across migration 0004.
- Next active slice: commit the exact evidence, push and qualify the matching
  Cloudflare image, deploy the Worker/Container, and run the full production
  smoke before beginning the chat-first learner-clarity pass.

## Acceptance matrix

| Gate                                         | Status  | Current evidence                                                                                                                                                                                                                          |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample/live/replay mode separation           | pass    | Contract and Worker regression tests prevent a non-sample artifact from receiving sample Belief Test, result, patch, or replay authority.                                                                                                 |
| Scientific-engine registry and evidence      | partial | The full gate passes for source-bound local image `1b974af9…` and authority `aff2ea37…`; 0 fixable Critical and 1 fixable High are handled by exact-image VEX, bounded reachability, and a negative-control scan. Registry push, production promotion, and new smoke binding remain pending. |
| Safe notebook intake and evidence references | pass    | Parser tests cover bounded input, no execution, active-output sanitization, stable hashes, exact cells/outputs, and typed refusal.                                                                                                        |
| Live schema-constrained Belief Test          | pass    | Real configured Responses call returned a valid class-imbalance Belief Test with three locally resolved evidence references; invalid/unresolved output is rejected in tests.                                                              |
| Live analyst preview and approval            | pass    | Live calls require a hash-bound preview of the exact sanitized packet; sensitive-looking evidence requires explicit approval, and claim/artifact changes invalidate it.                                                                  |
| Runner job/token/callback/event cursor model | pass    | D1 repository, optimistic transitions, Worker-held P-256 private signing, Container public-key verification, callback idempotency, cursor reconnect, scoped cancellation, recoverable dispatch acknowledgement, and browser-safe event schemas pass tests and production smoke. |
| Artifact-specific hosted Experiment Plan     | pass    | Worker/runner integration compiles and independently verifies typed v2 Plans; rejected candidates release no result.                                                                                                                      |
| V5 hosted scientific authority migration     | partial | Native Belief Spec, bounded compile/repair, fixed selection, fixture-bound fixed execution, Worker-owned tri-state result release, browser v2 belief rendering, deterministic transfer, frozen interactive controls, both patch paths, both Boundary Map paths, Reasoning Diff v2, Proof Capsule v2 download, and hosted labelled replay pass locally. Exact-image production promotion and smoke remain pending. |
| Fixed hosted result and cross-language hash  | pass    | Python v2 result hashes now use browser-compatible canonical JSON while legacy v1/replay hashes remain stable; TypeScript result verification passes both concepts.                                                                       |
| Entity-leakage lab and mutations             | pass    | Computed random 0.984722, group 0.594444, ablation 0.673611, zero group overlap; the current CLI rejects 13/13 critical mutations and the achieved-metrics collector records the same 13/13 published set.                                |
| Class-imbalance lab and mutations            | pass    | 6,000 rows, 1.0833% positives, majority accuracy 0.989333 with recall 0; threshold recall 0.3125; the current CLI rejects 19/19 critical mutations and the achieved-metrics collector records its narrower 15/15 published set.             |
| Interactive fixed-kernel controls            | pass    | Leakage split/entity/ablation/test-fraction and imbalance threshold/prevalence/metric focus dispatch verified configurations; authoritative results remain immutable.                                                                     |
| Transfer-gated artifact patch                | pass    | Fixed forecasting/manufacturing evaluators gate source-free Patch Plans; both concept patch engines preserve unrelated cells and fail closed on verifier mutations.                                                                       |
| Non-sample leakage patch                     | pass    | Three logistic-regression held-out styles compile through the registered one-cell group/identity transformation; entity aliases and patch mutations are tested.                                                                           |
| Reasoning Diff and portable proof            | partial | Native v5 independently rebuilds frozen compile/result/Boundary/transfer/patch authority, issues Reasoning Diff v2, stores/downloads a semantically validated content-addressed Proof Capsule, renders its six learner-facing dimensions, and persists a visibly labelled hosted replay. Final image qualification and production proof remain pending. |
| Studio navigation and resume                 | pass    | Explicit completed-stage review, recent sessions, canonical refresh restoration, Start over, focused project/evidence rail, command palette, collapsed Evidence & proof drawer, Question → Prediction → Test → Boundary → Apply → Repair progress, keyboard tab navigation, and no-permanent-cockpit contract have React tests. |
| Constrained generative UI                    | pass    | `json-render` composes only trusted public proof components from sanitized events; it has no action registry and no validity authority.                                                                                                   |
| Private operational diagnostics              | pass    | Secret-protected Worker aggregation reports queue/phase timing samples, repairs, token usage, concept, support, and failures without notebook or session/artifact/job identifiers.                                                         |
| Held-out intake/routing                      | pass    | `counterlab-held-out-v2`: 10/10 cases pass; four leakage, four imbalance, two unsupported.                                                                                                                                                |
| Held-out fixed full-loop completion          | partial | 7/8 supported notebooks complete Plan verification → fixed result → transfer → verified patch without source edits. Random Forest reaches result/transfer then receives `PATCH_ESTIMATOR_OUTSIDE_CONTRACT`. Human review remains pending. |
| Learner pilot                                | partial | Paired-crossover protocol, consent/privacy note, randomization, schema, and analysis script exist. No participants or learner outcomes are claimed.                                                                                       |
| TypeScript/Web/Python suites                 | pass    | `COUNTERLAB_E2E_BASE_URL=https://counterlab.cserules.workers.dev ./scripts/test-all.sh` passed 303 root TypeScript tests, 110 web/Worker tests, 157 Python tests, strict TypeScript checks, and the production-backed browser slice.              |
| New-version browser E2E                      | partial | Historical production v2 has 13 passing CloakBrowser journeys and a full live smoke. Current v5.1 desktop/390 px, reconnect, replay, and live browser journeys remain to be executed after promotion. |
| Container image build and production deploy | partial | Current v5.1 image is source-bound to `efe7fcf…`, local OCI `1b974af9…`, and passes the local engine gate. The public Worker still uses the historical v2 Container until registry push, qualification, and deploy complete. |
| Production live runner smoke                | partial | Historical v2 smoke passed all seven stages. The current v5.1 exact-version smoke has not run and cannot inherit the previous result. |
| One-command local demo                      | pass    | `./scripts/clean-demo.sh` regenerated both fixtures, passed 5 focused tests, confirmed current local D1 migrations, and served healthy kernel and Worker endpoints before its exact processes were stopped.                               |
| Clean-clone/release check/secret scan       | partial | The pre-hardening Studio tree passed a fresh-clone release check and 334-file scan. The current v5.1 tree has not yet rerun the final clean-clone, SBOM, dependency, and secret gates. |

## Latest verified commands

- `pnpm exec wrangler deploy --config dist/counterlab/wrangler.json --containers-rollout=none` — deployed focused Theater assets as Worker `67b6b2ad-a77b-4f62-b8f6-4bbd02300869` at 100%; Container version 13 and digest `bdd65fee…` remained unchanged. `/ready` returned all five checks true, and CloakBrowser completed the sample at desktop and 390 px with no browser errors or page overflow.
- `./scripts/production-smoke.sh https://counterlab.cserules.workers.dev` — exact Worker version `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` and deployed image digest `bdd65fee…`; all seven stages passed, including two genuine untouched live notebooks and authority hash `d7677c79…` in both live Proof Bundles. Report SHA-256: `cd5c0c05…`.
- `COUNTERLAB_E2E_BASE_URL=https://counterlab.cserules.workers.dev ./scripts/test-all.sh` — 303 root TypeScript, 110 web/Worker, and 157 Python tests passed; 13 CloakBrowser journeys passed against production and 2 credentialed browser-only live cases were skipped. The separate production smoke above exercised both real live concepts.
- `./scripts/run-mutations.sh leakage` and `./scripts/run-mutations.sh imbalance` — 13/13 and 19/19 critical mutations detected.
- `PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py` — regenerated canonical current kernel hashes and the 13/13 leakage plus 15/15 published imbalance mutation subsets in `docs/ACHIEVED_METRICS.json`.
- `./scripts/build-source-bound-runner.sh` from a clean detached worktree — built source `efe7fcf…` as non-root local OCI `sha256:1b974af90901e818fc202fffca8702f7a48aa1bcfa54776af7cc67831b5e34da` with matching source/tree labels.
- `./scripts/verify-scientific-engines.sh --image counterlab-runner:git-efe7fcfa6bfb5bb0115d4bd0bb1e1c1c628ef0b8` — passed with no findings and authority `aff2ea37372b647b887d1e088f5aac98ceb725246b760eb07ae21e1453e5e57e`. Its `local_candidate` metadata remains deliberately distinct from Cloudflare production authority.
- The unsuppressed Grype 0.112.0 scan recorded 171 findings and 0 fixable Critical. One fixable High (`CVE-2026-15308`) is bound to exact-image VEX and bounded reachability; the applied scan ignored exactly that one finding and the wrong-subcomponent control ignored none.
- `pnpm test:ts` — 296 root and 103 web/Worker tests passed; `pnpm test:python` — 105 passed; `pnpm typecheck` — passed.
- Two independent no-cache builder executions plus the release candidate produced kernel wheel hash `38b1be0e3c6e1ca33b3a8f36b45fb3273a416b1c2bea099f25afec71e8ebb87b`.
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

The highest remaining product risk is promotion of the complete native v5
authority without source, image, registry, or smoke drift. Both ML paths now
continue from their frozen Belief Spec, Prediction, Experiment IR, selection,
result, Evidence Verdict, Boundary receipt, transfer, Patch Plan, and copied
patch through Reasoning Diff v2, a semantically verified Proof Capsule v2, and a
persistently labelled hosted replay. The exact local candidate and engine
authority pass; registry push, qualified deployment, current browser execution,
and exact-version production smoke remain open. The current production
deployment stays on its qualified v2 contract until those gates pass.
Upstream Runtime Codex turn intermittency remains an operational
risk; the runner fails closed and the previous production smoke proved its
bounded recovery path. The reviewed vulnerability exception expires on
`2026-07-30T18:20:06Z` and requires requalification on any bound source, image,
SBOM, entrypoint, scanner, or vulnerability-status change. Cloudflare
Containers remain a beta runtime, and no formal sandbox proof is claimed.
