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
- [x] Dirty-tree broad verification: web Vitest 72/72 files and 558/558 tests;
      root Vitest 615/642 across 52/58 files with 27 classified
      capability/stale-evidence failures; kernel Pytest 220/221 with one denied
      localhost-socket test; runner Pytest 75/75; repository, web, and Worker
      TypeScript passed; production build passed. The deterministic Sample
      Boundary and fixed Sample Proof Capsule checks pass, focused sample
      authority/UI tests pass 18/18, the repository secret scan passes across
      1,384 files, and whitespace passes. Final scoped changed-file Prettier is
      still pending. These are not frozen-release results.
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
      CL-001, CL-006 (`NO_DATA`), and CL-024 remain open.
- [ ] Freeze one clean source commit, build one exact runner image, run startup,
      timeout-cleanup, no-secret, refusal, held-out, and negative-control gates,
      and issue one qualified receipt.
- [ ] Verify the repository-contained Wrangler identity and intended account;
      no normal-home credential read is permitted.
- [ ] Deploy the exact qualified Container/Worker tuple and bind the active
      version to the release source, image, Worker, client, and receipt domains.
- [ ] Execute production smoke plus all 31 CloakBrowser journeys, including
      desktop/mobile sample, replay, supported live, malformed/unsupported,
      refusal, transfer fail/pass, patch, Capsule, refresh/reconnect,
      back/forward, accessibility, console/network, and Web Vitals checks.
- [ ] Keep learner evidence `NO_DATA` unless real consented observations exist;
      capture an honest public video and Devpost submission receipt only from
      the qualified deployed tuple.
- [ ] Review and commit each logical slice with the configured user identity,
      then fast-forward merge `feat/learner-ux-v6.1` into `main`.
