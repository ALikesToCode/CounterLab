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
- [ ] Production vulnerability policy passes. The current local candidate has
      eight unreviewed fixable High findings.
- [ ] Proof Capsule v2 validates `scientificEngineSnapshotHash`.
- [ ] `scripts/release-check.sh` invokes the full engine gate.
- [ ] The exact engine-qualified image is deployed and production smoke records
      its authority hash.

## Learning and patch loop

- [x] Prediction is immutable and no result exists before commitment.
- [x] Refresh restoration, recent sessions, completed-stage review, and Start
      over have React/API tests.
- [x] Interactive controls dispatch fixed verified configurations.
- [x] Leakage and manufacturing transfers are deterministic and model-free.
- [x] Both patch engines edit copies, preserve unrelated cells, recompute
      outputs, and reject seeded patch mutations.
- [x] Reasoning Diff and Proof Bundle bind artifact/Plan/result/transfer/patch.

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

## Exact production gate — 2026-07-15

- [x] Worker `ae01fe03-731f-4939-849f-e8f4eaec7f51` is deployed with the
      Container binding.
- [x] Container version 10 resolves to image digest
      `sha256:2b15a35b7f938d754467cadabf8a2f12d085c4436d5f28791cb6add6d2b7bbe1`.
- [x] `/ready`, capability health, and the public response secret scan passed.
- [x] Sample, replay, untouched live leakage, and untouched live imbalance
      passed with artifact/Plan/result/patch/proof hashes recorded.
- [x] Production patch downloads opened and both Proof Bundles validated.
- [x] The report contains no secrets, raw notebook bytes, or private reasoning.

Report SHA-256:
`d74795a13034293483a1a0375d3906643a3dd2ba3472d8fae3498b6894430bb2`.

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

The checked browser items describe the released Studio journey. The following
v5.1 product gates remain pending and must not be inferred from them:

- [ ] scientific-engine production promotion; the local registry, licenses,
      integrity manifests, SBOM, health, and drift evidence now pass;
- [ ] Belief Spec v2 and Experiment IR v5 with replay-safe adapters;
- [ ] fixed experiment scorer and epistemic tri-state verdict;
- [ ] one signed Boundary Map;
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
