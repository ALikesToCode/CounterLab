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
- [ ] `./scripts/test-all.sh` on the v6.1 branch. Current root Vitest passes
      499/502; the three remaining exact-source evidence tests run after the
      image/evidence refresh.
- [x] `./scripts/run-contained-pnpm.sh run held-out:check` recomputed 10/10
      intake and matched the tracked evidence without rewriting it.
- [ ] `./scripts/run-contained-pnpm.sh run format:check` after all v6.1 changes.
- [x] Repository secret scan: passed across 767 files while excluding generated
      browser-profile state.
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
