# Repository and test audit

## Baseline

- Audited repository: `/home/mysterious/storage/github/CounterLab`.
- Audit began at `6f5513674e6db3a6222580121f4b5c11b2f53dda`; focused tests ran at `f9ca9bce2bb88921614d3e7ee6d195ba0c099c70`, and concurrent owner work advanced the final inspected HEAD to `dd451c77606ec270cfba030784df50cb3aa19969`.
- Git history: 362 commits at the final checkpoint, from 2026-07-14 through 2026-07-19. This is strong hackathon-period provenance.
- Worktree was already dirty and changed concurrently. No product source was modified by this audit.

## Architecture inventory

| Area             | Principal implementation                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Product UI       | Vite, React, strict TypeScript; landing, Judge Mode, studio, Boundary, replay/proof components               |
| Control plane    | Cloudflare Worker/Hono API; D1 sessions/jobs/events; private R2 objects; Container/Durable Object dispatcher |
| Contracts        | Zod and shared TypeScript schemas for sessions, Belief Spec, Experiment IR, Boundary, proof, generative UI   |
| GPT analyst      | Structured Responses-compatible client with sanitized packet preview and validation                          |
| Codex compiler   | App Server stdio JSONL, bounded plans, two repairs, credential/privilege launch boundary                     |
| Fixed authority  | Experiment scorer, plan/epistemic verifier, Python kernels, transfer, patch verifier                         |
| Subject Packs    | Entity leakage and class imbalance/metric choice; no released cross-domain pack                              |
| Evidence         | Legacy replay, Proof Capsule v2, Reasoning Diff, Boundary Map, mutation/held-out artifacts                   |
| Release/security | Wrangler, runner Dockerfile, production smoke scripts, SBOM, VEX, secret scan, scientific-engine registry    |

No public `physics/free-fall`, arbitrary subject generation, generic notebook execution, account system, or classroom/LMS product was found. That matches the constitution’s sequencing and explicit cuts.

## Repository strengths

- The central behavior is not mocked away: parser, scorer, verifier, kernel, transfer, patch, proof, runner token/callback, and state-transition logic have substantive deterministic tests.
- Narrow support and refusal behavior are documented in `docs/SUPPORT_CONTRACT.md` and implemented at intake.
- Architecture/authority/threat documents distinguish proposals from fixed authority and record known partial generation isolation.
- Checked-in replay artifacts preserve a genuine rejected two-repair run and a separate later verified run without calling the latter “repair 3.”
- Held-out intake passed 10/10; fixed completion passed 7/8, with human review still `PENDING` rather than concealed.
- Mutation evidence reports 13/13 leakage and 15/15 imbalance detections in the current metrics artifact.
- Dependencies/toolchains are pinned; runner bases use immutable digests; Python wheels are hash-locked.
- MIT license, CycloneDX SBOMs, scientific-engine role/licence/integrity manifests, vulnerability scan, and VEX/reachability evidence exist.

## Test execution

All temp/cache output for this audit was directed under `docs/audits/counterlab-first-prize/evidence/test-results/agent-repo-runtime`.

### Authority slice

```text
./node_modules/.bin/vitest run --no-file-parallelism \
  packages/notebook-parser/src/index.test.ts \
  packages/experiment-scorer/test/scorer.test.ts \
  packages/plan-verifier/src/scientific-candidate-v5.test.ts \
  packages/plan-verifier/src/epistemic.test.ts \
  packages/plan-verifier/src/epistemic-imbalance.test.ts \
  packages/proof-capsule/src/index.test.ts \
  packages/proof-capsule/src/authority.test.ts \
  packages/proof-capsule/src/node-cli.test.ts \
  services/hosted-runner/src/job-processor.test.ts \
  services/hosted-runner/src/control-plane-client.test.ts \
  services/hosted-runner/src/fixed-kernel.test.ts \
  services/hosted-runner/src/fixed-patch.test.ts \
  services/hosted-runner/src/startup-probe.test.ts
```

Result: **13 files, 106/106 tests passed** in 3.76 s.

### Worker/API/current UI slice

From `apps/web`:

```text
../../node_modules/.bin/vitest run --config vitest.config.ts \
  --no-file-parallelism worker/api.test.ts src/api.test.ts \
  src/App.test.tsx src/features/judge/JudgeModeView.test.tsx
```

Result: **4 files, 124/124 tests passed** in 13.35 s.

An independent browser specialist also ran five focused route/Judge/replay/theater files: **49/49 passed**.

### Python kernel/runner

```text
PYTHONDONTWRITEBYTECODE=1 \
PYTHONPATH=services/kernel/src:services/runner/src \
.venv/bin/python -m pytest services/kernel/tests services/runner/tests \
  -p no:cacheprovider -qq --tb=short
```

Result: **227/231 passed**. Four failures were confined to managed-audit-sandbox behavior:

- loopback socket creation denied;
- three expected filesystem modes remapped to `0700` by the managed filesystem.

These do not prove a product regression, but exact socket/permission behavior was not requalified here.

### Codex process slice

Two Codex client files produced **24 passes / 18 failures**. In all failures the fake child process exited before the protocol scenario completed and the client correctly returned `CODEX_PROCESS_EXITED`; no external Codex call occurred. Treat this as an audit-environment limitation until rerun outside the managed process sandbox, not as a pass and not as a confirmed defect.

### Type and secret checks

- Root TypeScript `tsc --noEmit`: passed.
- Web `tsc --noEmit -p tsconfig.json`: passed.
- Worker `tsc --noEmit -p tsconfig.worker.json`: passed.
- `scripts/secret-scan.py`: passed across **1,085 files**.

Exact command environment and failure text are preserved in `evidence/test-results/agent-repo-technical.md`.

## Browser/release tests

- The Playwright suite contains 22 current tests; two credentialed live tests are intentionally skipped unless `COUNTERLAB_E2E_LIVE=1`.
- Project configuration fails closed without `CLOAK_CDP_ENDPOINT` and only accepts a loopback base URL. The official current public build therefore needs a separate production browser/smoke receipt.
- The audit ran read-only public Chromium route, viewport, keyboard, network, console, and performance captures after the owner explicitly authorized Chrome/Chromium.
- Full `scripts/test-all.sh`, release gate, Docker build, and scientific admission were not run because they generate/change evidence while the worktree and those outputs were changing concurrently.
- Current public Worker #82 is newer than the checked-in production smoke records and has no exposed source commit. Historical success/failure artifacts remain factual only for their named builds.

## Test-quality gaps

1. **No exact-current release matrix.** Green unit/integration suites do not prove public sample/live/replay/download/reconnect behavior for Worker #82.
2. **No hosted CI workflow.** Comprehensive local scripts exist, but no `.github/workflows` or equivalent hosted gate was found.
3. **Credentialed Codex and live E2E are environment-gated.** Appropriate for safety, but their last exact successful release receipt must be prominent and current.
4. **Current browser suite does not target the public URL directly.** The production smoke/browser pairing needs a source-bound mechanism.
5. **Human review remains pending** for held-out cases, and one of eight fixed completion probes did not pass; neither should be generalized as universal support.
6. **Learner outcomes are not tests.** Mutation/transfer/software completion cannot substitute for a learner study.

## Maintainability

`apps/web/worker/api.ts` and its test are each roughly 8,700 lines/299 KiB; `apps/web/src/App.tsx` is roughly 152 KiB. These files combine many state, protocol, persistence, and UI responsibilities. That concentration raises review and regression risk during the remaining deadline window.

Do not attempt broad modularization before submission. The smallest useful action is hosted CI for typecheck, focused authority/API/UI tests, secret scan, and a source-bound release receipt. Extract modules only after the release is stable.

## Documentation consistency

Current conflicts:

- README says v6.1 local work is not deployed/browser-qualified; actual Worker #82 is newer than named docs but unbound to source.
- `docs/PROGRESS.md` presents an older failed Worker as current.
- `packages/codex-client/README.md` says authenticated live generation is unavailable/replay-only, while hosted runner code contains a Container launch boundary and public health reports Codex configured.
- `docs/DEVPOST_COPY.md` uses `CI for Understanding`, Belief Test, Experiment Plan, and Proof Bundle instead of the current scientific-debugger category and learner vocabulary.
- `docs/DEMO_SCRIPT.md` and `SCREENSHOT_PLAN.md` are plans; no public video/current curated submission set exists.
- Impact protocol is prepared; results correctly say `NO_DATA`.

Archive or label historical material, and generate one current-truth page from the frozen release manifest.

## Dependency/licensing risk

- License: MIT.
- SBOM manifest at the captured evidence checkpoint binds source `6f551367…` and runner image `sha256:8946…`, not current HEAD/public Worker.
- Grype 0.112.0 scan records seven Critical and 23 High raw matches, mostly base-OS/unfixed or deduplicated; it does **not** claim zero vulnerabilities.
- One fixable High Python binary match has a reviewed exact-image VEX/reachability exception; remaining “fixed” Python versions cited by NVD are pre-release 3.15 builds. Do not broadly upgrade scientific/runtime dependencies only to silence the scanner.
- The final release must regenerate SBOM/VEX/scientific-engine evidence for the exact source/image and preserve licences/integrity.

## Reproducibility verdict

Local reproducibility documentation and deterministic evidence are strong. Public reproducibility is not yet prize-ready because the exact deployed Worker, Container digest, source commit, full live/session IDs, browser result, and submission video are not one frozen tuple.

Final-delta validation at `dd451c7…` passed 52/52 focused web/release/UI tests. The focused production-smoke Python file passed 13/13 when rerun outside the managed loopback-socket restriction. The final secret scan passed 1,572 repository files. Details are in `evidence/test-results/final-synthesis-validation.md`.

## Limitations

The worktree moved concurrently. Focused tests name HEAD `f9ca9bce…`; the later four-commit delta through `dd451c7…` was inspected separately in `evidence/test-results/final-source-delta.md`. It strengthens contained release/build mechanics and design documentation but does not alter the core route/authority files or provide an executed exact-public release receipt. No Docker/container release, public POST, credentialed model/Codex call, deployment, or full release gate was performed.
