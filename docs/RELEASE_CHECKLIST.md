# Release checklist

Checked product-authority boxes are supported by committed tests or the exact
production report in `docs/PRODUCTION_SMOKE.json`. Release-command boxes are
unchecked whenever the current v5.1 tree has not yet rerun that gate; an older
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
- [x] `./scripts/run-mutations.sh leakage` reports 12/12.
- [x] Imbalance fixture/notebook, confusion metrics, threshold and prevalence
      response pass.
- [x] `./scripts/run-mutations.sh imbalance` reports 12/12.
- [x] Python v2 result hashes match Worker canonicalization.
- [x] Held-out intake/routing is 10/10 and fixed full-loop completion is 7/8
      with the failure documented.

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
- [ ] Native v5 Reasoning Diff and Proof Capsule bind Belief Spec, Experiment
      IR, Evidence Verdict, Boundary receipt, transfer, and verified patch.

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

- [ ] `./scripts/test-all.sh` after the latest production-recovery commit.
- [ ] `pnpm run held-out:run` after the v5.1 contract migrations.
- [ ] `pnpm run format:check` after all v5.1 changes.
- [ ] `python3 scripts/secret-scan.py` after all v5.1 changes.
- [ ] `./scripts/clean-demo.sh` after all v5.1 changes.
- [ ] `./scripts/reproduce-session.sh leakage-01` after all v5.1 changes.
- [ ] `./scripts/replay-patch.sh leakage-01` after all v5.1 changes.
- [ ] `./scripts/release-check.sh` on the final v5.1 tree (includes build and
      secret scan).
- [ ] Fresh temporary clone release check with locked Node and Python installs.

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

The checked browser items describe the released Studio journey. The following
v5.1 product gates remain pending and must not be inferred from them:

- [x] Belief Spec v2 and Experiment IR v5 with replay-safe adapters;
- [x] fixed experiment scorer and epistemic tri-state verdict;
- [x] signed Boundary Map authority for both ML packs: fixed execution,
      independent Worker verification, immutable receipt, retrieval, rejection,
      duplicate callback, and revision-gate tests pass locally;
- [ ] accessible Boundary Map learner renderer and final browser journey;
- [ ] chat-first six-stage experience with collapsed Activity and Evidence &
      proof drawers;
- [ ] verified physics free-fall pack or an explicit omission;
- [ ] Proof Capsule v2 and `/judge`;
- [ ] current mobile, keyboard, screen-reader, reduced-motion, and Web Vitals
      execution against the final UI;
- [ ] learner pilot rows, or an explicit `EVALUATION PENDING` release label.

Production release identifiers and the residual held-out limitation are recorded
in `docs/PROGRESS.md`; no learner-study outcome or formal sandbox proof is
claimed.
