# Progress

Updated: 2026-07-19

## Active v6.1 release board

This is the live execution ledger for `feat/learner-ux-v6.1`. It is updated at
each material test, qualification, deployment, and integration gate. Statuses
mean exactly `PASS`, `FAIL`, `IN PROGRESS`, `BLOCKED`, or `NOT RUN`; a local
pass is never presented as a browser or production pass.

### Current checkpoint

- **Branch:** `feat/learner-ux-v6.1`
- **Pre-tooling source checkpoint:**
  `fafa0e05984ed877ba4d9bfdd8ce8b82bd3d9bcc`. The exact runner source is the
  commit containing this ledger and is recorded by the subsequent build and
  evidence receipts rather than guessed in advance.
- **Continuation starting commit:**
  `dd451c77606ec270cfba030784df50cb3aa19969`
- **Repository boundary:** physical root
  `/home/mysterious/storage/github/CounterLab`; root marker present; all active
  build, scan, and browser state is required to remain inside the repository.
- **Working tree:** intentionally dirty. New source-bound evidence tooling and
  its focused tests are under review. Existing scientific-engine and SBOM
  changes are stale generated evidence and must not be committed until they are
  regenerated against the next exact source commit and exact runner image.
- **Integration rule:** commit source tooling first, build and qualify that
  exact commit, commit its generated evidence separately, deploy only the
  qualified image, then fast-forward this branch into `main` after every
  required gate is recorded.

### Completed in this continuation

| Work item | Status | Exact evidence |
| --- | --- | --- |
| Repository and dirty-tree preservation | PASS | Root, marker, branch, commit, and every dirty path were inspected; no stash, reset, clean, deletion, or out-of-repository operation was used. |
| Learner-focused presentation and navigation | PASS locally | Commits `2ce90ad` and `fafa0e0` simplify the question-first entry, evidence choices, stage actions, accessible names, and client chunking while preserving signed-data authority. |
| Full web component suite | PASS locally | 59 files, 375 tests passed after aligning the cleanup-policy assertion with ephemeral `--rm` verification containers. |
| Web, Worker, and repository TypeScript | PASS locally | All three strict TypeScript checks passed at the current learner checkpoint. |
| Production Vite/Worker build | PASS locally | Vite 8.1.4 built 388 Worker modules and 197 client modules with no chunk warning. Worker 1,697.79 kB / 329.18 kB gzip; main client 399.43 kB / 116.21 kB gzip; CSS 178.66 kB / 31.35 kB gzip; largest lazy chunk Sample Boundary 86.27 kB / 17.15 kB gzip. |
| Formatting, whitespace, and secret scan | PASS locally | Prettier, Git whitespace checks, and the repository secret scan passed; the latest scan covered 766 files. |
| Source-bound runner build inputs | PASS locally | Commit `e0559ff` includes the bounded adapter inputs required by the exact-image build. |
| Pinned local Syft and Grype tools | PASS locally | Syft 1.44.0 and Grype 0.112.0 archives and binaries were independently hash-checked in repository-contained tool storage. |
| Exact-image evidence generator implementation | PASS as an uncommitted source candidate | Normalization, VEX preparation, source/image binding, and one-shot refresh scripts are implemented. Independent read-only review completed and its concrete findings were repaired: exact review-path traversal rejection, no host `/dev/null`, 31 tracked output hashes, pinned Syft/Grype configs, 14-day KEV freshness, bounded verification containers, preflighted VEX outputs, direct helper tests, and a persisted/hash-bound exact-runtime report. Exact-image execution still follows the source commit. |
| Focused scientific/release tests | PASS locally | Latest combined release Vitest: 4 files/35 tests passed. Latest focused Python reachability, scientific verifier, and held-out generator gate: 12 passed. Repository TypeScript, shell syntax, Python syntax, formatting, and whitespace checks passed. |
| CloakBrowser harness and static collection | PASS fail-closed; execution BLOCKED | Playwright 1.61.1 statically collected 22 tests in 1 spec. The shell harness and direct Playwright command both reject a missing `CLOAK_CDP_ENDPOINT`; 0 browser journeys ran and no stock browser was launched. |
| Broad product/runtime verification | PASS locally except expected evidence drift | Web Vitest 59 files/375 tests; Python kernel and runner 234/234; scientific verifier/reachability 10/10; leakage mutations 13/13; imbalance mutations 19/19; root, web, Worker, and hosted-runner TypeScript; production build; scientific import audit; Git whitespace; active-file formatting; and the 766-file secret scan all passed. Pre-refresh root Vitest passed 42/44 files and 499/502 tests; all three failures resolve through the intentionally stale scientific evidence graph and are queued for the exact-image refresh. |
| Held-out benchmark | PASS configured gate and explicit accounting | Intake passed 10/10. Seven of seven patch-eligible cases complete the fixed loop; the separate RandomForest case is correctly refused with `PATCH_ESTIMATOR_OUTSIDE_CONTRACT` because its estimator/configuration is outside the registered patch contract. The legacy aggregate remains 7/8 for compatibility. Generator syntax and exact outcome assertions passed 10/10; held-out Vitest passed 3 files/11 tests. Generated evidence refresh remains in the source-commit queue. |

### Ordered completion queue

The lead owns integration, shared architecture, release scripts, deployment,
documentation, commits, and the final merge. Independent read-only reviews and
test inventory may run in parallel, but no two workers edit the same file.

1. **Evidence tooling review and source commit — IN PROGRESS**
   - Independent review and focused repair tests are complete.
   - Inspect the final held-out and release-tool diffs, refresh held-out
     evidence, run the broader pre-commit gates, selectively stage only
     source/tests and this ledger, and create one user-authored local commit.
2. **Exact runner image and evidence regeneration — NOT RUN for the new source
   commit**
   - Attest the repository-contained runtime.
   - Build one immutable source-bound OCI image and receipt.
   - Generate Syft, Grype, CISA KEV, VEX, reachability, license, engine-health,
     registry, runtime-manifest, and snapshot evidence against that exact
     image.
   - Run the negative VEX control and reject wrong-image, wrong-component,
     stale, or unbound evidence.
   - Commit generated evidence separately only after the full exact-image
     verifier passes.
3. **Broad local qualification — IN PROGRESS**
   - The current baseline is green for product/runtime behavior. Pre-refresh
     root Vitest is 499/502, with all three failures isolated to the
     intentionally stale evidence graph. The formal registry-only engine gate
     reports exactly 14 binding
     findings: the pnpm lock hash, SBOM tool-lock hash, and 12 internal
     renderer/oracle/mutation integrity hashes.
   - `docs/sbom/node.cdx.json` still identifies pnpm 11.13.0 while the pinned
     build tool is 11.13.1. Regeneration must correct that evidence; the check
     must not be weakened.
   - Full web Vitest, repository/web/Worker/hosted-runner TypeScript, full
     Python kernel/runner suites, mutation suites, held-out cases, and the
     production build are green. Full root Vitest must be rerun after evidence
     regeneration.
   - Migrations, production-smoke harness tests, release-script tests,
     formatting, whitespace, secret scan, and SBOM/scientific evidence gates.
   - Repair implementation failures; never weaken or skip tests to turn a gate
     green.
4. **Container qualification and registry promotion — NOT RUN for the new
   source commit**
   - Qualify the exact immutable image with a clean tree.
   - Publish only the qualified source-bound tag to the configured Cloudflare
     registry.
   - Record source commit, OCI/config/manifest digests, evidence authority,
     tool versions, and exact qualification receipt.
5. **Cloudflare release gate and Wrangler deployment — NOT RUN for this
   branch**
   - Verify the active Cloudflare identity and destination without changing
     Git or remote identity.
   - Run the exact release check and bounded D1 migration gate.
   - Deploy the qualified Worker and Container with Wrangler.
   - Record the actual Worker version, Container version/digest, and deployment
     receipt; do not claim deployment before those commands succeed.
6. **Production smoke and live authority journeys — NOT RUN for this branch**
   - Readiness/capability/no-secret checks.
   - Untouched live entity-leakage and class-imbalance journeys.
   - Event reconnect, verified Boundary, deterministic transfer, copied patch
     download, Proof Capsule export/replay, failed-verification behavior, and
     exact deployed-version binding.
7. **CloakBrowser and accessibility qualification — BLOCKED until a live
   `CLOAK_CDP_ENDPOINT` is available**
   - Execute all 22 collected Playwright journeys at 1440x900, 1280x720, and
     390x844 using CloakBrowser only.
   - Exercise keyboard-only navigation, screen-reader names and announcements,
     focus restoration, reduced motion, refresh during asynchronous phases,
     downloads, unsupported notebooks, failed verification/transfer, and
     horizontal-overflow checks.
   - Capture rendered screenshots and Web Vitals only from the exact qualified
     public release. Never fall back to stock Chromium.
8. **Prize submission evidence and impact — PARTIAL**
   - Resolve every technically actionable P0/P1/P2 item in
     `docs/audits/counterlab-first-prize` and update the diagnostic score with
     evidence.
   - Freeze an exact public build and bind screenshots, demo copy, source,
     Container digest, and claims to it.
   - A real learner-impact study and final Devpost submission require genuine
     external participants/account actions; no synthetic impact or submission
     is claimed.
9. **Final documentation and merge — NOT RUN**
   - Update release checklist, evidence report, support limits, production
     identities, browser/a11y evidence, known limitations, and complete test
     totals.
   - Confirm a clean feature branch, verify `main` ancestry, switch to `main`,
     and merge `feat/learner-ux-v6.1` with `--ff-only`.
   - Do not delete the feature branch, rewrite history, force-push, or deploy a
     commit different from the one documented.

### Current blockers and non-claims

- The current public audit snapshot is not proof that this branch is deployed;
  exact source, image, Worker, and Container identities still need to be
  qualified together.
- No current-branch rendered browser journey, screenshot, screen-reader
  session, accessibility audit, or Web Vitals result is claimed while the
  CloakBrowser endpoint is unavailable.
- The existing browser suite has no Axe, Lighthouse, automated screen-reader,
  or Web Vitals integration. Keyboard, accessible-name, reduced-motion, and
  viewport scenarios are represented in the 22-test specification, but their
  rendered behavior remains unverified until CloakBrowser is available.
- A repository-wide Prettier scan can race with transient
  `.code-review-graph` SQLite sidecars. Explicit checks of every tracked and
  active untracked source file pass; the transient database files are not
  product evidence and must be excluded from the broad formatting surface
  rather than chased or deleted.
- The held-out `leakage_random_forest` notebook is supported for intake and
  reaches verified result and transfer, but Repair is intentionally refused:
  the notebook only imports `RandomForestClassifier` and provides no admitted
  estimator/configuration shape for a fixed verified patch. Broadening the
  patcher from an import token would weaken authority. The benchmark will
  report this as one expected contract refusal, not as a fabricated eighth
  patch.
- The interactive Verified Sample Playground remains omitted unless its
  fixture-integrity authority can be satisfied without browser-side
  authoritative computation.
- Physics/free-fall remains outside this UX/release pass until the two existing
  ML Subject Packs pass the production authority gate.
- Devpost submission and measured learner impact are not complete. The
  repository work can prepare and verify the evidence package, but it must not
  fabricate submission state, participants, or outcomes.

## Current status

### Learner UX v6.1 local checkpoint

Branch `feat/learner-ux-v6.1` now implements the question-first six-stage
learner presentation locally: one progress model; Notebook Evidence Story and
privacy summary; Model Duel and Prediction Seal; Fair Test Builder and
Experiment Theater; Boundary Hunt; Reflection Builder; TimelineTransfer and
CostTransfer; RepairPreview; capability-first completion; deterministic hints;
and privacy-safe interaction evidence. Milestone commits run from `273e2b8`
through `755f698`; the recovery checkpoint is `b4e23ca`.

The learner UX milestones did not change notebook intake, mode provenance,
Belief Spec or Prediction semantics, Experiment IR, candidate scoring, metric
formulas, Boundary computation, transfer evaluation, patch operations,
Reasoning Diff, Proof Capsule, or deployment configuration. A post-milestone
release repair made new schema-v1 held-out patch bundles bind the current
Subject Pack version while retaining the historical fallback for old bundles;
it did not widen patch authority. The interaction components consume existing
signed or integrity-bound data and do not calculate authoritative metrics in
the browser.

Milestone 4, the interactive Verified Sample Playground, was intentionally
omitted. No independently admitted fixed-kernel fixture authority existed for
the proposed matrix; hashing a fixture alongside the output produced by the
same generator would be self-authentication. The sample therefore remains
fixed, live exploration remains runner-backed, and replay remains read-only.

Current source-candidate evidence: web Vitest passed 58 files and 360 tests;
repository, web, and Worker TypeScript checks passed; and the combined fixed
kernel/runner Python gate passed 231/231. All eight D1 migrations applied to a
fresh repository-contained database, and a second pass reported no migrations
to apply. The production-smoke harness passed 19/19 tests. The Vite/Worker build
passed with a 398.22 kB (115.88 kB gzip) main client chunk, below the 500 kB
warning threshold, and the repository secret scan passed across 741 files while
excluding generated browser-profile state.

The complete root Vitest gate currently passes 486/488 tests. The only two
failures are the deliberately stale internal-authority and pnpm-lock evidence
checks; those hashes cannot be refreshed truthfully until this source candidate
is committed and its exact runner/adapter images are built. A new check/write
tool now reports and propagates only the fixed internal, catalog, Subject Pack,
runtime, Node SBOM, and snapshot bindings. The Cloak-only Playwright suite
statically collects 22 tests, but no browser test executed because
`CLOAK_CDP_ENDPOINT` is absent. No current-branch screenshot, screen-reader
session, rendered viewport/accessibility result, or Web Vitals measurement is
claimed.

Wrangler 4.110.0 reports the repository-contained session is unauthenticated,
and no repository-visible Cloudflare API token is present. Exact-image
qualification, remote migration, deployment, and production smoke remain
pending and are not claimed.

The complete local evidence, performance sizes, and remaining manual checks are
recorded in
[`docs/LEARNER_UX_V6_1_EVIDENCE.md`](LEARNER_UX_V6_1_EVIDENCE.md).

CounterLab Studio has three contract-separated modes: sample lesson, live
notebook analysis, and verified replay. Both released ML Subject Packs—entity
leakage and class imbalance/metric choice—have fixed kernels, independent
contract/result verification, interactive controls, deterministic transfer,
source-free Patch Plans, and verified copied-notebook patches. Native local
paths produce Reasoning Diff v2 and Proof Capsule v2; historical sample/replay
paths retain their labelled Proof Bundles.

The hosted architecture is implemented as a Vite/React Cloudflare control plane
with D1/R2 plus a Container-backed Durable Object runner. Runtime Codex writes
only bounded typed scientific artifacts and display-only scene/rationale; its
separate repair turn writes only a Patch Plan and rationale. The public critical
path never executes model-authored Python. The existing adapter-code compiler
remains a separately labelled advanced local proof and replay.

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
The first v5.1 production promotion reached Worker
`89db95bc-d0c1-48c7-963b-2e2f9a35f876` and Container version 14. Public
readiness, capability health, secret scanning, Judge Mode, Sample lesson, and
Verified replay passed. The untouched live leakage path then failed closed
before state advancement because the configured Responses-compatible endpoint
rejected the Belief Spec v2 tuple schema. No runner job or result was released.
The transport schema is fixed in `36ee156`, and the live verification command
now exercises Belief Spec v2 in `bcd5df1`. Those commits are bound to the fresh
local candidate recorded below; registry promotion and a new exact-version
smoke remain pending.

The live Responses integration was exercised against the configured endpoint.
A minimal request and the legacy v1 schema succeed. The exact pre-fix Belief
Spec v2 request reproduced HTTP 400 `invalid_json_schema`; the bounded-array
wire schema now succeeds while the canonical tuple and ordered hypothesis
validation remain unchanged. A real v2 untouched leakage analysis at `medium`
effort completed in approximately 36 seconds, validated locally, and resolved
artifact evidence. An `xhigh` run reached the 180-second transport timeout and
is not presented as a successful latency result. The custom base URL remains
server-only and provider-neutral in product state and copy.

The production control plane is deployed at
`https://counterlab.cserules.workers.dev` as Worker version
`89db95bc-d0c1-48c7-963b-2e2f9a35f876`, with Container version 14 healthy on
the earlier v5.1 candidate digest
`sha256:1b974af90901e818fc202fffca8702f7a48aa1bcfa54776af7cc67831b5e34da`.
That version did not pass the live smoke and therefore has no completed v5.1
production authority claim. The last full exact-version production smoke
belongs to Worker
`7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` and completed all seven stages at
`2026-07-16T05:03:38.850648Z`; its byte-for-byte report is committed as
`docs/PRODUCTION_SMOKE.json` with SHA-256
`cd5c0c05b2f007c577905630a61f7be84c71908a511ca9bffad68f76bd86431a`.

Scientific-engine governance is implemented for the released ML packs. The
exact source-bound v5.1 candidate is `bcd5df1…`, local OCI digest `588b0963…`,
and authority `9cd4478e…`. Its four admitted engines are bound to versions,
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
  promotion, and exact-version production smoke for the schema-fixed v5.1
  candidate.
- **Pending:** current-source 1440 × 900, 1280 × 720, and 390 × 844
  CloakBrowser journeys; rendered accessibility and Web Vitals evidence;
  clean-clone; and final release gates. Chat-first learner simplification and
  the current-tree secret scan are complete locally.
- **Blocked by phase order:** verified physics/free-fall and learner-impact
  expansion. Physics does not begin until both ML concepts pass the new public
  production authority gate.
- **Not run for this checkpoint:** local `dev`, current schema-fixed browser
  journeys, or a completed v5.1 production smoke. The previous promotion and
  partial smoke are recorded above; the exact replacement runner image build
  and scientific qualification checks passed locally.

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
| Simplified Theater and Judge Mode | done locally; browser pending | `DESIGN.md`, the focused-theater work, hosted Capsule replay commits, `ef066fa`, and v6.1 commits `e4ecf9c` through `755f698` remove the permanent agent cockpit, add the question-first flow and learner components, consolidate technical evidence into a collapsed Evidence & proof drawer, and preserve labelled Judge routes. | Run the 22 current CloakBrowser journeys at 1440 × 900, 1280 × 720, and 390 × 844; capture accessibility/performance evidence; then qualify the exact source. |
| Physics/free-fall | blocked by phase order | No verified public support is claimed. | Start only after both live ML concepts pass the new production authority gate. |
| Final release | in progress | Exact source-bound runner `bcd5df1…` built as local OCI `588b0963…`; scientific gate passes as authority `9cd4478e…`. Previous production v2 smoke remains valid only for that deployment. | Evidence-only commit, registry push, qualification, deploy, exact-version smoke, current browser journeys, and remaining release checks. |

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
- Full Python kernel suite: 170/170 passed.
- Full TypeScript suites after the Belief Spec transport repair: 435/435 root
  and 185/185 web/Worker tests passed; strict repository TypeScript passed.
- Belief analyst transport regression: 36/36 passed. The captured Responses
  schema now has object-valued `items` with an exact length of two; the
  canonical local schema still enforces ordered `current` and `competing`
  hypotheses. The real v2 leakage verification completed at `medium` effort.
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
- The exact source-bound runner image was built from `bcd5df1…` as local OCI
  `sha256:588b0963…`, with non-root user `10001:10001` and matching OCI source
  labels. The replacement image has not yet been deployed; the preceding v5.1
  deployment and its failed-closed live smoke remain recorded separately.
- Two independent no-cache Python builder executions and the release candidate
  produced the same kernel wheel SHA-256 `38b1be0e…`.
- Scientific registry Vitest passed 68/68; repository TypeScript passed; the
  exact-image scientific gate returned `VERIFIED` with authority `9cd4478e…`.
  Grype recorded 171 findings, 0 fixable Critical, one reviewed fixable High,
  one intended VEX suppression, and zero negative-control suppressions.
- Production D1 migrations `0004_boundary_request_purpose.sql` and
  `0005_proof_capsule_replays.sql` are applied; all 137 existing runner-job
  purpose values were preserved across migration 0004.
- Next active release slice: qualify the exact source, execute the current
  CloakBrowser journeys, push and qualify the matching Cloudflare image, deploy
  the Worker/Container, and run the full production smoke. The learner-clarity
  implementation itself is complete locally.

## Acceptance matrix

| Gate                                         | Status  | Current evidence                                                                                                                                                                                                                          |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample/live/replay mode separation           | pass    | Contract and Worker regression tests prevent a non-sample artifact from receiving sample Belief Test, result, patch, or replay authority.                                                                                                 |
| Scientific-engine registry and evidence      | partial | The full gate passes for source-bound local image `588b0963…` and authority `9cd4478e…`; 0 fixable Critical and 1 fixable High are handled by exact-image VEX, bounded reachability, and a negative-control scan. Registry push, production promotion, and new smoke binding remain pending. |
| Safe notebook intake and evidence references | pass    | Parser tests cover bounded input, no execution, active-output sanitization, stable hashes, exact cells/outputs, and typed refusal.                                                                                                        |
| Live schema-constrained Belief Spec          | partial | The exact pre-fix v2 call reproduced `invalid_json_schema`; `36ee156` fixes the provider-compatible wire schema, 36/36 tests pass, and a real medium-effort v2 leakage result validated with resolved evidence. Production rerun is pending. |
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
| Black-first frontend coherence               | partial | All 24 CSS files resolve through 60 declared variables and 1,574 variable uses with zero undefined or self-referential tokens. Focus and semantic contrast regression checks pass. Current desktop/mobile browser rendering remains unqualified because the required CloakBrowser CDP endpoint is unavailable. |
| Constrained generative UI                    | pass    | `json-render` composes only trusted public proof components from sanitized events; it has no action registry and no validity authority.                                                                                                   |
| Private operational diagnostics              | pass    | Secret-protected Worker aggregation reports queue/phase timing samples, repairs, token usage, concept, support, and failures without notebook or session/artifact/job identifiers.                                                         |
| Held-out intake/routing                      | pass    | `counterlab-held-out-v2`: 10/10 cases pass; four leakage, four imbalance, two unsupported.                                                                                                                                                |
| Held-out fixed full-loop completion          | partial | 7/8 supported notebooks complete Plan verification → fixed result → transfer → verified patch without source edits. Random Forest reaches result/transfer then receives `PATCH_ESTIMATOR_OUTSIDE_CONTRACT`. Human review remains pending. |
| Learner pilot                                | partial | Paired-crossover protocol, consent/privacy note, randomization, schema, and analysis script exist. No participants or learner outcomes are claimed.                                                                                       |
| TypeScript/Web/Python suites                 | partial | Web Vitest passes 58 files/360 tests; repository, web, and Worker TypeScript pass; fixed-kernel/runner Python passes 231/231. Root Vitest passes 486/488, with only the deliberately deferred exact-source integrity and lock evidence checks pending. |
| New-version browser E2E                      | partial | Historical production v2 has 13 passing CloakBrowser journeys and a full live smoke. The current redesign browser suite did not run because no `CLOAK_CDP_ENDPOINT` was available. Desktop, 1280 px, mobile, reconnect, replay, live-mocked, accessibility, and download journeys remain unqualified for this source; no stock browser was substituted. |
| Container image build and production deploy | partial | The schema-fixed image is source-bound to `bcd5df1…`, local OCI `588b0963…`, and passes the local engine gate. Public Worker `89db95bc…` still runs the preceding v5.1 image until replacement qualification/deploy completes. |
| Production live runner smoke                | fail    | Worker `89db95bc…` passed readiness, health, secret scan, Judge Mode, Sample, and replay; untouched leakage failed before state advancement on the now-fixed v2 schema. No result leaked. Both concepts must pass after redeploy. |
| One-command local demo                      | pass    | `./scripts/clean-demo.sh` regenerated both fixtures, passed 5 focused tests, confirmed current local D1 migrations, and served healthy kernel and Worker endpoints before its exact processes were stopped.                               |
| Clean-clone/release check/secret scan       | partial | The source-candidate secret scan passed across 741 files while excluding generated browser-profile state. Exact Node SBOM, image evidence, clean release, and deployment gates remain pending. |

## Latest verified commands

- Web Vitest — 58 files/360 tests passed, including the question-first landing, dark-theme contrast, focus, and release-script safety regressions.
- Fixed-kernel/runner Python — 231/231 tests passed.
- Root Vitest — 486/488 passed; the two pending tests are exact-source evidence checks scheduled after the immutable image build.
- Frontend CSS token audit — 24 files, 60 variables, 1,574 variable uses, zero undefined variables, and zero self-referential variables.
- CloakBrowser render attempt — not run because `CLOAK_CDP_ENDPOINT` was unavailable. No stock browser was substituted.
- `pnpm exec wrangler deploy --config dist/counterlab/wrangler.json --containers-rollout=none` — deployed focused Theater assets as Worker `67b6b2ad-a77b-4f62-b8f6-4bbd02300869` at 100%; Container version 13 and digest `bdd65fee…` remained unchanged. `/ready` returned all five checks true, and CloakBrowser completed the sample at desktop and 390 px with no browser errors or page overflow.
- `./scripts/production-smoke.sh https://counterlab.cserules.workers.dev` — exact Worker version `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` and deployed image digest `bdd65fee…`; all seven stages passed, including two genuine untouched live notebooks and authority hash `d7677c79…` in both live Proof Bundles. Report SHA-256: `cd5c0c05…`.
- `COUNTERLAB_E2E_BASE_URL=https://counterlab.cserules.workers.dev ./scripts/test-all.sh` — 303 root TypeScript, 110 web/Worker, and 157 Python tests passed; 13 CloakBrowser journeys passed against production and 2 credentialed browser-only live cases were skipped. The separate production smoke above exercised both real live concepts.
- `./scripts/run-mutations.sh leakage` and `./scripts/run-mutations.sh imbalance` — 13/13 and 19/19 critical mutations detected.
- `PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py` — regenerated canonical current kernel hashes and the 13/13 leakage plus 15/15 published imbalance mutation subsets in `docs/ACHIEVED_METRICS.json`.
- `./scripts/build-source-bound-runner.sh` from a clean detached worktree — built source `bcd5df1…` as non-root local OCI `sha256:588b0963f3473be0347411a857399f6dfd9f31ccc7c8248963323792ff0a394a` with matching source/tree labels.
- `./scripts/verify-scientific-engines.sh --image counterlab-runner:git-bcd5df1729de303ab9553dd261843977b4f34ffa` — passed with no findings and authority `9cd4478e97c20f235df4df0b20b2e301d5883d42886f5ac73bb8f965ecf62c82`. Its `local_candidate` metadata remains deliberately distinct from Cloudflare production authority.
- The unsuppressed Grype 0.112.0 scan recorded 171 findings and 0 fixable Critical. One fixable High (`CVE-2026-15308`) is bound to exact-image VEX and bounded reachability; the applied scan ignored exactly that one finding and the wrong-subcomponent control ignored none.
- `pnpm test:ts` — 435 root and 185 web/Worker tests passed;
  `pnpm test:python` — 170 passed; repository `tsc --noEmit` — passed.
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
`2026-07-30T19:10:33Z` and requires requalification on any bound source, image,
SBOM, entrypoint, scanner, or vulnerability-status change. Cloudflare
Containers remain a beta runtime, and no formal sandbox proof is claimed.
