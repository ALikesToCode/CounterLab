# Release checklist

Checked product-authority boxes are supported by committed tests or the exact
production report in `docs/PRODUCTION_SMOKE.json`. Release-command boxes are
unchecked whenever the current v6.1 tree has not yet rerun that gate; an older
green release is evidence, but is not silently promoted to the current tree.

## Authority and concepts

- [x] Sample/live/replay are discriminated in contracts and routes.
- [x] Non-sample artifacts cannot receive sample Belief Tests, results, patches,
      or replay metadata.
- [x] Entity leakage and class imbalance are both registered end to end.
- [x] Unsupported and insufficient-evidence artifacts fail honestly.
- [x] Source-free Plan schemas reject code, commands, formulas, paths, and
      literal results.
- [x] A rejected Plan releases no result; a failed transfer releases no patch.

## Deterministic evidence

- [x] Leakage fixture/notebook and canonical v1 replay hash reproduce.
- [x] Random/group/ablation ranges and zero group overlap pass.
- [x] `./scripts/run-mutations.sh leakage` reports 13/13.
- [x] Imbalance fixture/notebook, confusion metrics, threshold and prevalence
      response pass.
- [x] `./scripts/run-mutations.sh imbalance` reports 19/19.
- [x] Python v2 result hashes match Worker canonicalization.
- [x] Held-out intake/routing is 10/10; all 7/7 patch-eligible cases reached
      `PATCH_VERIFIED`; the separate out-of-contract RandomForest case was
      correctly refused 1/1. The legacy aggregate remains 7/8 for compatibility.

## Scientific-engine governance

- [x] Registry schema, role policy, operation bindings, and canonical snapshot
      pass for the two released ML Subject Packs.
- [x] Every declared evidence file resolves inside the repository and matches
      its recorded SHA-256.
- [x] Installed versions, wheel/RECORD hashes, licenses, one-thread tolerance
      profile, and exact non-root image identity match the local candidate.
- [x] Leakage and imbalance golden hashes reproduce twice in the no-network,
      read-only runtime probe.
- [x] Node, Python, and container CycloneDX 1.6 inventories are deterministic
      after normalization and bind current locks, source, image, registry, and
      Subject Pack bindings.
- [x] Local-candidate vulnerability policy passes with 0 fixable Critical and
      one exact-image reviewed High exception; raw/applied/negative scans and
      the bounded reachability review are hash-bound and retained.
- [x] Proof Bundle v2 validates `scientificEngineSnapshotHash` and rejects a
      mismatched authority.
- [x] `scripts/release-check.sh` requires a qualified image and invokes the full
      engine gate.
- [x] The exact engine-qualified image is deployed and production smoke records
      its authority hash.

## Learning and patch loop

- [x] Prediction is immutable and no result exists before commitment.
- [x] Refresh restoration, recent sessions, completed-stage review, and Start
      over have React/API tests.
- [x] Interactive controls dispatch fixed verified configurations.
- [x] Leakage and manufacturing transfers are deterministic and model-free.
- [x] Both patch engines edit copies, preserve unrelated cells, recompute
      outputs, and reject seeded patch mutations.
- [x] Qualified v1/v2 Reasoning Diff and Proof Bundle bind
      artifact/Plan/result/transfer/patch.
- [x] Native v5 Reasoning Diff and Proof Capsule bind Belief Spec, Experiment
      IR, Evidence Verdict, Boundary receipt, transfer, and verified patch in
      local Worker integration tests for both released ML packs.
- [x] The deterministic Capsule archive, semantic validator, immutable
      content-addressed storage, exact-byte download, HMAC policy, tamper
      rejection, and validate/inspect/replay CLI pass locally.
- [x] Native learner-facing Reasoning Diff and direct `.counterlab` Capsule
      download use the public receipt and never expose the private R2 key.
- [ ] Hosted Capsule replay persistence/browser projection and final production
      qualification pass.

## Live integrations

- [x] Custom Responses base URL is normalized server-side and never exposed.
- [x] A real configured live Belief Test returned schema-valid,
      evidence-resolving output.
- [x] Live analysis requires an exact sanitized preview hash and learner
      approval; sensitive-looking excerpts require a second confirmation.
- [x] Runner jobs, tokens, callbacks, event cursors, and sanitized events pass
      integration tests.
- [x] The Worker retains the P-256 signing private key; the Container receives
      only the public verification key. The removed legacy symmetric secret is
      absent from the deployed secret list.
- [x] Ambiguous dispatch acknowledgement is recoverable, cancellation wins
      authority, duplicate compile/cancel requests reuse the existing job, and
      refresh reconnect resumes from a persisted cursor.
- [x] Constrained generated proof UI has no actions or validity authority.
- [x] Secret-protected operational diagnostics aggregate timing, repairs,
      tokens, concept/support, and failures without private identifiers.
- [x] Upgraded Container image deployed with secrets and migration.
- [x] One untouched live leakage notebook completes on the public URL.
- [x] One untouched live imbalance notebook completes on the public URL.
- [x] Public event reconnect, patch download, proof share, and no-secret check
      pass against production.

## Exact production gate — 2026-07-16

- [x] Worker `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` is deployed with the
      Container binding.
- [x] Container version 13 resolves to deployed registry digest
      `sha256:bdd65feebad10d4b0f232e945eb1bd1195b803d13fddf8eee558b2efdd5dc8c6`.
- [x] `/ready`, capability health, and the public response secret scan passed.
- [x] Sample, replay, untouched live leakage, and untouched live imbalance
      passed with artifact/Plan/result/patch/proof hashes recorded.
- [x] Production patch downloads opened and both Proof Bundles validated.
- [x] Both live Proof Bundles record scientific-engine authority
      `d7677c79914505c11cc0474a0f3e4be7527173ea27c5640b65c7b8a373a8e881`.
- [x] The report contains no secrets, raw notebook bytes, or private reasoning.

Report SHA-256:
`cd5c0c05b2f007c577905630a61f7be84c71908a511ca9bffad68f76bd86431a`.

## Focused Theater UI promotion — 2026-07-16

- [x] Worker `67b6b2ad-a77b-4f62-b8f6-4bbd02300869` is deployed at 100%.
- [x] The deploy used `--containers-rollout=none`; Container version 13 remains
      ready on registry digest
      `sha256:bdd65feebad10d4b0f232e945eb1bd1195b803d13fddf8eee558b2efdd5dc8c6`.
- [x] `/ready` returned analyst, persistence, private storage, runner, and
      signing checks as true.
- [x] CloakBrowser opened the real sample at desktop and 390 px, confirmed the
      permanent agent rail is absent, retained the proof console, found no
      horizontal page overflow, and recorded no console, page, or request
      errors.
- [x] The compact mobile reset label renders as `Reset` without leaking the
      full `Start over` label.
- [ ] The seven-stage live production smoke was not rerun for this UI-only
      promotion. Its recorded proof remains bound only to Worker
      `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab`.

## Current-tree release commands

- [x] Review and commit the containment/read-only repair separately from stale
      generated scientific-engine and SBOM evidence.
- [ ] `./scripts/test-all.sh` on the v6.1 branch. The latest component gates are
      recorded in the authoritative current-tree section below. The aggregate
      command remains red because this managed host denies nested Node stdio,
      localhost sockets, and Bubblewrap setup, and because exact-source
      scientific evidence intentionally remains stale until the clean source
      freeze and image rebuild.
- [x] `./scripts/run-contained-pnpm.sh run held-out:check` recomputed 10/10
      intake and matched the tracked evidence without rewriting it.
- [ ] `./scripts/run-contained-pnpm.sh run format:check` after all v6.1 changes.
- [x] Repository secret scan: passed across 1,384 files after repository-local
      `.counterlab` tool state was explicitly ignored; generated browser-profile
      state remains excluded.
- [ ] `./scripts/clean-demo.sh` is BLOCKED under the current filesystem
      constitution and is not a v6.1 release gate until its setup, cache, and
      diagnostic paths are repository-contained.
- [ ] `./scripts/reproduce-session.sh leakage-01` after all v6.1 changes.
- [ ] `./scripts/replay-patch.sh leakage-01` after all v6.1 changes.
- [ ] `./scripts/release-check.sh` on the final v6.1 tree (includes browser,
      scientific, reproduction,
      secret scan).
- [ ] Complete the release check from a clean committed v6.1 worktree with
      locked, repository-contained tool, cache, and runtime state.

## Browser/accessibility

- [x] Try the 3-minute sample in CloakBrowser.
- [x] Live own-notebook leakage and imbalance flows with the configured runner.
- [x] Persistent replay label and refresh/event reconnect.
- [x] Mobile 390px completion, keyboard-only completion, reduced motion, focus,
      contrast, and no horizontal overflow.
- [x] Focused Theater component contract, strict web/Worker TypeScript,
      targeted formatting, and `DESIGN.md` lint pass locally.
- [x] Updated focused Theater desktop and 390 px production screenshots using
      CloakBrowser after deployment.

The checked browser items describe the historical released Studio journey. The
following current-source product gates must not be inferred from them:

- [x] Belief Spec v2 and Experiment IR v5 with replay-safe adapters;
- [x] fixed experiment scorer and epistemic tri-state verdict;
- [x] signed Boundary Map authority for both ML packs: fixed execution,
      independent Worker verification, immutable receipt, retrieval, rejection,
      duplicate callback, and revision-gate tests pass locally;
- [x] accessible verified-only Boundary Map learner renderer with semantic table,
      keyboard inspection, exact assumptions, and integrity wording;
- [x] six-stage Question, Prediction, Test, Boundary, Apply, Repair Studio
      navigation with a collapsed Evidence & proof drawer and Activity tab;
- [ ] final chat-first/Judge browser journey at desktop and 390 px;
- [x] physics/free-fall explicitly omitted from the learner UX v6.1 pass; no new
      Subject Pack is claimed;
- [x] Proof Capsule v2 archive, Worker issuance/download, and local labelled
      replay authority;
- [x] native Reasoning Diff/Proof Capsule review and direct download UI;
- [x] hosted Proof Capsule replay projection and `/judge` integration pass local
      React/API tests; current browser and production qualification remain
      pending;
- [ ] current mobile, keyboard, screen-reader, reduced-motion, and Web Vitals
      execution against the final UI;
- [ ] learner pilot rows, or an explicit `EVALUATION PENDING` release label.

Production release identifiers and the residual held-out limitation are recorded
in `docs/PROGRESS.md`; no learner-study outcome or formal sandbox proof is
claimed.

## Learner UX v6.1 local gate — 2026-07-18

The boxes below apply only to branch `feat/learner-ux-v6.1`. Historical browser
or production evidence above does not qualify this source.

- [x] Question-first landing and one reviewable Question → Prediction → Test →
      Boundary → Apply → Repair progress model are implemented.
- [x] Evidence Story, privacy summary, Model Duel, Prediction Seal, Fair Test
      Builder, Experiment Theater, Boundary Hunt, Reflection Builder, visual
      transfers, RepairPreview, completion, and fixed contextual hints have
      component/integration coverage.
- [x] Strict privacy-safe learner interaction schema, append-only D1 migration,
      API, and client recording pass tests and remain outside scientific
      evidence authority.
- [x] Web Vitest passed 59 files and 375 tests.
- [x] Repository, web, and Worker TypeScript checks passed.
- [x] Vite/Worker production build passed with a unique repository-local output
      directory and `--emptyOutDir=false`.
- [x] Repository secret scan passed across 767 files while excluding generated
      browser-profile state.
- [x] Cloak-only Playwright configuration statically collected 23 tests from one
      spec file, including the production route/header/asset secret scan, and
      refuses credentialed/non-loopback target URLs.
- [x] Missing `CLOAK_CDP_ENDPOINT` failed closed with status 1; no stock Chromium
      fallback was launched.
- [x] Combined fixed-kernel and hosted-runner Python gate passed 234/234.
- [ ] Refresh the exact source/image-bound scientific-engine and Node SBOM
      evidence, then rerun the scientific-engine verifier.
- [x] Held-out intake/routing passed 10/10; all 7/7 patch-eligible cases reached
      `PATCH_VERIFIED`, and the separate RandomForest case was correctly refused
      1/1 outside the patch contract. The legacy aggregate remains 7/8.
- [x] All eight D1 migrations, including owner-capability retirement and replay
      revocation, applied successfully to a fresh repository-contained local
      database; a second pass reported none pending.
- [x] Verified Sample Playground was explicitly omitted because no independently
      admitted fixture authority existed; no browser metric computation or mode
      fallback was introduced.
- [ ] Execute 1440 × 900, 1280 × 720, and 390 × 844 CloakBrowser journeys.
- [ ] Execute keyboard-only completion and real screen-reader-name inspection.
- [ ] Verify rendered focus, typography floors, 44 px targets, reduced motion,
      async announcements, exact tables, and no horizontal overflow.
- [ ] Capture current-source screenshots and measure Web Vitals.
- [ ] Refresh source-bound evidence so the remaining 3 scientific release tests
      join the 499 passing root tests.
- [ ] Verify the owner's reported Cloudflare login with a repository-contained
      `wrangler whoami`, then create the current exact-source qualified runner
      image and receipt. Authentication is not claimed until that command
      passes.
- [ ] Run the clean committed-worktree release check with repository-contained
      state, exact-image qualification, deployment, and exact-version
      production smoke.

Detailed evidence and limitations are in
[`LEARNER_UX_V6_1_EVIDENCE.md`](LEARNER_UX_V6_1_EVIDENCE.md).

## Finish Commander current-tree gate — 2026-07-20T07:22:00Z

Earlier checked items above are evidence at their named checkpoints. The
following list is authoritative for the current dirty tree and must be rerun
after the final source freeze.

- [x] Repository root, marker, physical path, branch, HEAD, and dirty paths were
      inspected without stash, reset, clean, discard, or deletion.
- [x] MB-001 terminal recovery is source-covered through distinct-session
      resubmission, retry reconciliation, progressed-child restoration, and
      learner-facing status labels.
- [x] MB-007 uses a closed reviewed Subject Pack renderer for all
      pre-Prediction hypotheses, predicted patterns, conditions, non-claims,
      alternatives, and limitations while preserving the exact learner
      Question and sanitized evidence excerpts. The v1/v2 narrative guard
      remains defense in depth for result, verdict, elimination, and repair
      paraphrases. Historical v1 remains parseable without rewriting its signed
      object; focused contract and App suites pass.
- [x] MB-048 quarantines historical out-of-scope fixed-sample claims from all
      result/proof reads and mutable transitions while retaining the original
      record. New fixed samples still require the exact canonical Question.
- [x] MB-005 restores bounded all-status compiler history from D1 alongside the
      verified session event chain, detects snapshot races and invalid
      job/cursor identities, merges stored/live/patch/interactive streams, and
      keeps public replay on a separate five-group share-safe projection.
      Source suites pass; public CloakBrowser proof remains open.
- [x] MB-006 canonical transfer behavior passes 46 contracts, 72 App/learner,
      129 Worker, and 71 Python affected tests. Pre-submit answer leakage is
      removed, the released imbalance v1 authority is preserved, failed answers
      restore, Worker/Python patch gates reconstruct fixed semantics, and one
      26-vector corpus checks cross-runtime parity. Public/browser proof remains
      open.
- [x] The fixed Sample Proof Capsule v1 is checked in and validated before Judge
      inspection/download; it remains explicitly separate from Live Proof
      Capsule v2.
- [x] The strict source-bound build receipt v4 parser is shared by binding, VEX,
      qualification, and refresh tooling; focused tests pass 11/11.
- [x] Playwright collection fails closed without CloakBrowser. Rerun and execute
      the complete final statically collected suite after source freeze; a
      static count is not rendered-browser evidence.
- [x] Release-bound browser evidence finalization is source-complete at
      `0ee8934`: schema-v3 raw evidence binds the exact deployed tuple and
      journey telemetry; 40 journey receipts, ten `HUMAN_OBSERVATION` receipts,
      the execution report, index, and qualification receipt are cross-bound;
      bounded no-follow inputs, ignored staging, exclusive reservation, staged
      hash verification, and no-replacement behavior are independently tested.
      Public CloakBrowser execution remains 0 journeys and is not checked off.
- [ ] Regenerate current scientific integrity bindings, source/image-bound
      engine evidence, and the normalized pnpm 11.13.1 production Node SBOM
      after the final source freeze. Current generated evidence is deliberately
      stale and no dirty-tree binding pass is claimed.
- [x] Frozen Worker/client source guards cover generated-config projection,
      one-build manifest creation, positional `--no-bundle` uploads,
      pre-mutation singleton enforcement, pre-step evidence-byte rehashing,
      dry-run equality, production-smoke identity, public path/hash/count
      verification, ignored frozen-output secret scanning, and explicit
      `PROCESS_BOUND_PARTIAL` propagation. The exact manifest and qualified
      tuple still require regeneration after source freeze.
- [ ] Prove aggregate runtime enforcement with a real exact-image sentinel.
      Qualified v4 now requires the exact aggregate mode, an enforced flag, and
      a strict hash-bound cgroup v2 observation covering exact controller
      values, task membership, memory/PID/CPU negative-control deltas, cleanup,
      runtime/spec/observer identity, and freshness. Process-only, declared-only,
      unknown, false, empty, or self-inconsistent evidence fails closed. The
      current rootless producer emits process-only/false/null and cannot
      qualify on this host.
- [x] Trusted Lab Scene source integration is live-only and post-result, uses a
      strict shared envelope and closed renderer registry, and verifier v4
      requires two distinct fixed-result Metric bindings. Source-owned oracle,
      renderer, mutation, signed-binding, and Subject Pack scopes are covered;
      production and rendered-browser proof remain open.
- [x] Dirty-tree broad verification: web Vitest 80/80 files and 656/656 tests;
      root Vitest 740 passed, 27 failed, and 2 skipped across 67/73 files, with
      the same 27 classified
      capability/stale-evidence failures; kernel Pytest 220/221 with one denied
      localhost-socket test; runner Pytest 75/75; repository, web, and Worker
      TypeScript passed; production build passed. The deterministic Sample
      Boundary and fixed Sample Proof Capsule checks pass, focused sample
      authority/UI tests pass 18/18, the repository secret scan passes across
      1,384 files, and whitespace passes. Final scoped browser-finalizer
      Prettier, 11-file secret scan, and whitespace checks pass. These are not
      frozen-release results.
- [x] Private patch/Capsule downloads now use authenticated fetch, strict byte
      and filename validation, bounded timeouts, browser-save initiation after
      validation, failure-without-telemetry semantics, and duplicate-action
      guards. Stage timing preserves the original entry and exact first
      completion payload across refresh. Focused download/timing/App/Worker
      verification passes; actual downloads still require final CloakBrowser
      evidence.
- [x] Source-covered issue set: MB-001/002/003/004/005/006/007/009/010/012/013/
      015/016/017/048. Every item still needs exact public acceptance evidence.
      CL-023 remains partial because landing withholds result values while Judge
      shows the full fixed break and rendered comprehension is unmeasured.
      CL-024's bounded inquiry/presentation core is source-implemented with four
      tools, three turns, and one persisted clarification. Signed-outcome
      explanation and production/CloakBrowser execution remain open, so CL-024
      is still partial. CL-001 and CL-006 (`NO_DATA`) remain open.
- [x] Learning Director source gates: strict tools/output, registered references,
      stateless continuation, `store:false`, hashed safety identifier, compact
      provenance without provider response IDs, one optional clarification,
      fixed UI labels, approval-envelope/Belief-Spec/Subject-Pack binding, edit
      invalidation, and fail-open deterministic continuation pass focused and
      full web tests. Production invocation remains unverified.
- [x] Callback/privacy hardening: complete-field privacy inventory precedes the
      64-field projection; Unicode canonical alias variants apply before
      truncation; callback claims race cancellation before R2/verifier work;
      cancelled callbacks perform zero object-store reads/writes in the
      regression. Generated-output writes have an exact owner/path claim,
      abandoned claims expire only after the bounded job deadline, and terminal
      dispatch failure plus its evidence event commit atomically. Worker-owned
      result, interactive, and Boundary Map authority events require the exact
      active callback claim; ordinary event appends remain fenced. New live
      patch bytes use the verified patched-artifact hash as their object key, so
      a delayed losing callback cannot overwrite the winning download. The old
      session-wide key is read only as a hash-checked compatibility fallback.
      The complete Worker API passes 110/110.
- [x] Current focused learner source verification: App/API/Worker tests pass
      3/3 files and 263/263 tests; App passes 100/100; the complete Worker API
      passes 110/110; web-client and Worker TypeScript pass; and scoped
      Prettier, `git diff --check`, and secret scans pass. Creation and restart
      responses, runner action purpose/configuration, cancellation/event job
      identity (including empty terminal pages), immutable Prediction recovery,
      transient Boundary reads, and same-render patch authority have explicit
      regressions.
- [ ] Current post-integration broad verification: rerun complete web Vitest,
      repository TypeScript, kernel Pytest, production build, formatting, and
      repository secret scan after the hotfix branch is merged. The earlier
      pre-repair web run passed 85/85 files and 762/762 tests, and the earlier
      kernel run passed 222/222; those results are not substituted for this
      final branch tip.
- [ ] Current repository-wide gate: root TypeScript now passes. Root Vitest
      reports 794 passed, 36 failed, and 2 skipped across 75 files; every failure
      is confined to the two stale submission/scientific release-evidence
      suites. Do not refresh source-bound evidence hashes until the final clean
      source freezes.
- [ ] Freeze one clean source commit, build one exact runner image, run startup,
      timeout-cleanup, no-secret, refusal, held-out, and negative-control gates,
      and issue one qualified receipt.
- [ ] Verify the repository-contained Wrangler identity and intended account;
      no normal-home credential read is permitted.
- [ ] Deploy the exact qualified Container/Worker tuple and bind the active
      version to the release source, image, Worker, client, and receipt domains.
- [ ] Execute production smoke plus all 40 CloakBrowser journeys, including
      desktop/mobile sample, replay, supported live, malformed/unsupported,
      refusal, transfer fail/pass, patch, Capsule, refresh/reconnect,
      back/forward, accessibility, console/network, and Web Vitals checks.
- [ ] Keep learner evidence `NO_DATA` unless real consented observations exist;
      capture an honest public video and Devpost submission receipt only from
      the qualified deployed tuple.
- [ ] Review and commit each logical slice with the configured user identity,
      then fast-forward merge `feat/learner-ux-v6.1` into `main`.
- [x] Preserve historical qualified v4/release-check v2/deployment v4 receipt
      semantics and introduce strict v5/v3/v5 contracts for `OS_ENFORCED`
      generation-filesystem isolation.
- [ ] Persist and hash-bind the exact-image generation-isolation sentinel,
      require its exact probe hash from the production runner, and propagate it
      through new receipt versions without rewriting v5/v3/v5.

## Qualified public sample/replay checkpoint — 2026-07-24

- [x] Public `/ready` returned HTTP 200 with all eight readiness checks true for
      Worker `fa85b4c8-25bf-4800-9110-f6fba3e3700a`.
- [x] Public readiness bound runner source
      `b4321bbd64fb11eff0952ea7a4c933cd32dd5e8b`, runner digest
      `sha256:00fe2ca9f5760528bb7865b0626efcc933f4d163da7bc2af5e18a063522ea1ca`,
      and `OS_ENFORCED` generation filesystem read isolation.
- [x] CloakBrowser completed the full entity-leakage sample through Prediction,
      Test, interactive Boundary, Apply, Repair, patched notebook download, and
      fixed-sample Proof Capsule download with no console errors.
- [x] Verified replay remained persistently read-only with no new model/Codex
      call or patch unlock; an unknown replay ID rendered direct recovery.
- [x] Judge first-fold evidence was captured at 390 x 844 and 1440 x 900; the
      fixed-sample mechanism remained visible and mobile had no horizontal
      overflow.
- [ ] Complete one supported public Live notebook journey. Supported intake and
      packet preview passed, but the configured Responses endpoint rejected the
      analyst request; the Worker failed closed with no Belief Spec, result, or
      runner job.
- [ ] Supply a valid server-side Responses API credential compatible with the
      configured endpoint, then rebuild and qualify the exact current source
      before changing the active deployment.
- [x] Current focused UI gate: Experiment Theater passes 7/7 and App passes
      100/100. The test harness uses an explicit bounded five-second async wait
      for Vite's first-use route-module transform; behavioral assertions are
      unchanged.
- [x] Complete web Vitest passes 86 files and 765/765 tests; repository, web,
      and Worker TypeScript pass.
- [x] All 28 complete-root failures pass their isolated/capability reruns:
      Codex App Server 42/42, hosted-runner/read-isolation 9/9, and sequential
      source-bound/release-verifier 20/20. The aggregate restricted run remains
      recorded as 826 passed, 28 failed, and 2 skipped rather than rewritten.
- [x] Kernel passes 221/222 under restriction plus the one loopback-dependent
      service test 1/1 with the authorized capability.
- [x] Repository-contained production build passes and the secret scan passes
      across 1,485 files.
- [x] The configured user identity and `ALikesToCode/CounterLab` destination
      were verified, and the feature branch was pushed without merging `main`.
- [ ] Publish Devpost and record the submission receipt. No learner-impact
      result or `main` merge is claimed.

## Exact current-source deployment gate — 2026-07-27

- [x] Freeze runner source
      `c78c4bc7521688000c625ac21557896c0c78148e` and evidence commit
      `719f65b79ed48b368672a2769fcb1ada4eb1e4da`.
- [x] Promote the exact Container image at registry digest
      `sha256:f1a924f0eaf4b8378f3e7fb379349a196debfe77b669f5b23ab70dfe5ffc51f1`.
- [x] Pass the exact-image release gate: root Vitest 858 passed and 2 skipped;
      web Vitest 766 passed; kernel Pytest 346 passed; TypeScript, build,
      release CloakBrowser, mutation, held-out, secret, formatting, and
      source/image checks passed.
- [x] Apply the guarded Cloudflare release sequence with no pending D1
      migrations and automatic maintenance recovery.
- [ ] Final hosted runner readiness. Worker
      `01f8ccf8-c030-4d80-a7d5-2fd54c80e550` returned HTTP 503 for all 24
      probes with only `checks.runner` false; the release script restored
      maintenance Worker `bd82e08d-83b3-4a1d-8a5b-28367885feec`.
- [x] Remove the obsolete remote `OPENAI_MODEL` secret conflict while
      preserving the frozen plain value `gpt-5.6-sol`.
- [x] Validate and version-bind `CODEX_AUTH_JSON` without exposing its value.
      Version `8dbfb084-955a-4873-ae18-d105e4677d39` contains the exact final
      Worker plus the refreshed secret.
- [ ] Probe the refreshed-secret version only after its exact public identity
      is stable. The two bounded requests attempted during propagation were
      served by the old maintenance version and are not evidence about
      `8dbfb084-955a-4873-ae18-d105e4677d39`.
- [ ] If the exact refreshed-secret probe remains red, obtain the Container
      startup log for instance
      `3e29a3be5cb0ed523651870a678f4d2bdc1f3c677d6b9911eb65c1974218fed0`
      before another source or image change.
- [ ] Run current production CloakBrowser journeys and one untouched supported
      live notebook flow only after `/ready` reports all eight checks true.
- [ ] Keep production maintenance enabled and do not claim current Live
      authority until the runner, browser, and production-smoke gates pass.

## Exact zero-traffic runner diagnostic — 2026-07-27

- [x] Upload maintenance-only diagnostic Worker
      `f45eb94d-9bde-4d22-8b01-e6810ae638ae` without modifying the qualified
      Container image or production routes.
- [x] Verify the diagnostic version carries the exact qualified runner
      source/image identity, required bindings and secret names, and
      `COUNTERLAB_MAINTENANCE_MODE=true`.
- [x] Keep maintenance Worker
      `bd82e08d-83b3-4a1d-8a5b-28367885feec` at 100%, attach the diagnostic
      version at 0%, and prove exact execution through version-filtered tail
      events.
- [x] Issue one cache-busted readiness request. HTTP 503 and the sanitized
      Worker log identify `container-start` failure:
      `The container is not running, consider calling start()`.
- [x] Confirm the readiness Container instance became inactive before port
      8080 was ready, then restore the single maintenance Worker at 100%.
- [ ] Add bounded hosted-runner startup failure observability that releases no
      job or result and exposes only a fixed sanitized reason code.
- [ ] Build and qualify a new exact Container/source/evidence tuple after that
      observability change; do not reuse the current receipt.
- [ ] Resolve the reported startup reason, rerun the complete exact-image
      release gate, and enable Live only after all readiness checks are true.
