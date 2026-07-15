# Release checklist

Checked boxes are supported by recorded command output from the current
worktree, a fresh temporary clone, and the deployed Worker/Container.

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
- [x] Constrained generated proof UI has no actions or validity authority.
- [x] Secret-protected operational diagnostics aggregate timing, repairs,
      tokens, concept/support, and failures without private identifiers.
- [x] Upgraded Container image deployed with secrets and migration.
- [x] One untouched live leakage notebook completes on the public URL.
- [x] One untouched live imbalance notebook completes on the public URL.
- [x] Public event reconnect, patch download, proof share, and no-secret check
      pass against production.

## Release commands

- [x] `pnpm test` — 170 root TypeScript, 79 web, 136 Python.
- [x] `pnpm run typecheck`.
- [x] `pnpm run held-out:run`.
- [x] `pnpm run format:check`.
- [x] `python3 scripts/secret-scan.py` — 334 repository files.
- [x] Thirteen local CloakBrowser journeys passed; the two credentialed live
      journeys were skipped locally and passed separately against production.
- [x] `./scripts/test-all.sh` on the current version (includes browser E2E).
- [x] `./scripts/clean-demo.sh` on the current version.
- [x] `./scripts/reproduce-session.sh leakage-01` on the current version.
- [x] `./scripts/replay-patch.sh leakage-01` — verified patch, group overlap 0.
- [x] `./scripts/release-check.sh` on the current version (includes build and
      secret scan).
- [x] Fresh temporary clone release check with locked Node and Python installs.

## Browser/accessibility

- [x] Try the 3-minute sample in CloakBrowser.
- [x] Live own-notebook leakage and imbalance flows with the configured runner.
- [x] Persistent replay label and refresh/event reconnect.
- [x] Mobile 390px completion, keyboard-only completion, reduced motion, focus,
      contrast, and no horizontal overflow.

Production release identifiers and the residual held-out limitation are recorded
in `docs/PROGRESS.md`; no learner-study outcome or formal sandbox proof is
claimed.
