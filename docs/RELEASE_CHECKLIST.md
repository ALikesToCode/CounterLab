# Release checklist

Checked boxes are supported by the current worktree's recorded command output.
Production/browser/build boxes deliberately remain open until the upgraded
Worker/Container is exercised.

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
- [ ] Upgraded Container image deployed with secrets and migration.
- [ ] One untouched live leakage notebook completes on the public URL.
- [ ] One untouched live imbalance notebook completes on the public URL.
- [ ] Public event reconnect, patch download, proof share, and no-secret check
      pass against production.

## Release commands

- [x] `pnpm test` — 164 root TypeScript, 76 web, 90 Python.
- [x] `pnpm run typecheck`.
- [x] `pnpm run held-out:run`.
- [x] `pnpm run format:check`.
- [x] `python3 scripts/secret-scan.py` — 333 repository files.
- [x] Fifteen Playwright journeys discovered, including opt-in real hosted
      leakage and imbalance flows; this is test discovery, not browser
      execution.
- [ ] `./scripts/test-all.sh` on the current version (includes browser E2E).
- [ ] `./scripts/clean-demo.sh` on the current version.
- [ ] `./scripts/reproduce-session.sh leakage-01` on the current version.
- [x] `./scripts/replay-patch.sh leakage-01` — verified patch, group overlap 0.
- [ ] `./scripts/release-check.sh` on the current version (includes build and
      secret scan).
- [ ] Fresh temporary clone release check.

## Browser/accessibility

- [ ] Try the 3-minute sample in CloakBrowser.
- [ ] Live own-notebook leakage and imbalance flows with the configured runner.
- [ ] Persistent replay label and refresh/event reconnect.
- [ ] Mobile 390px completion, keyboard-only completion, reduced motion, focus,
      contrast, and no horizontal overflow.

The current AGENTS instructions prohibit this agent from running `dev` or
`build`; the unchecked browser/build/deploy items require a user-started server
or explicit permission.
