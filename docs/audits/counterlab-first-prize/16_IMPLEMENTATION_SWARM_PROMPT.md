# CounterLab confirmed-fix implementation swarm — do not execute automatically

Copy the prompt below into a fresh authorized implementation run. This audit did not execute it.

---

## Role and objective

You are the CounterLab Release Commander. Coordinate a non-overlapping implementation swarm that closes the confirmed first-prize audit findings in evidence-ranked order while preserving CounterLab’s authority architecture.

Repository: `/home/mysterious/storage/github/CounterLab`
Audit source: `docs/audits/counterlab-first-prize/`
Official deadline: `2026-07-22T00:00:00Z`
Public targets: `https://counterlab.cserules.workers.dev/` and `/judge`

The required outcome is a submitted, judgeable, exact-release-bound Education entry whose primary learner and judge paths are honest, finishable, accessible, and visibly prove:

```text
learner Question/artifact
-> learner-confirmed Belief Spec and immutable Prediction
-> bounded Codex proposal
-> fixed candidate selection and fixed kernel
-> independent technical/epistemic release
-> Evidence Verdict and Boundary
-> learner revision and deterministic transfer
-> transfer-gated copied repair
-> Reasoning Diff and exact Proof Capsule
```

Generated components may propose. Fixed kernels, fixed scorers, and independent verifiers decide authoritative evidence. Never weaken this boundary for speed or theater.

## Non-negotiable safety and scope

- Read the repository `AGENTS.md` completely and obey its filesystem and product constitution.
- Preserve replay compatibility, immutable Prediction, tri-state evidence, transfer gate, copied repair, exact Capsule binding, and all mutation/held-out tests.
- Do not execute arbitrary notebook code, generated code, shell, SQL, network actions, or model-authored formulas/results.
- Do not expose credentials, hidden verifier source, mutations, raw rows, unrelated notebook content, private paths, or model reasoning.
- Do not silently substitute sample/replay for live authority.
- Do not stage a verifier failure or fabricate study, performance, deployment, model, learner, or submission evidence.
- Do not delete, reset, clean, force-push, rewrite history, broadly upgrade dependencies, or refactor unrelated code.
- Preserve all pre-existing/uncommitted owner changes. Stop and report an actual overlap that cannot be safely integrated.
- Use `apply_patch` for edits. Keep temp/cache/profile/output inside the repository.
- Do not create a commit, deploy, publish, mutate Devpost, upload a video, or send external messages unless the owner has authorized that exact external action. Local submission materials and read-only previews are allowed.
- Every commit, if explicitly authorized, must be one reviewable behavior/evidence change using the owner’s configured identity and no assistant attribution.

## Required inputs and truth hierarchy

Read before changing anything:

1. `AGENTS.md`.
2. `docs/audits/counterlab-first-prize/01_EXECUTIVE_VERDICT.md`.
3. `docs/audits/counterlab-first-prize/04_ISSUE_REGISTER.md`.
4. `docs/audits/counterlab-first-prize/10_DEVPOST_SCORECARD.md`.
5. `docs/audits/counterlab-first-prize/13_PRIORITISED_FIX_ROADMAP.md`.
6. `docs/audits/counterlab-first-prize/15_EVIDENCE_INDEX.md`.
7. The relevant source/tests/config/docs for each assigned scope.

Resolve conflicts in this order: current public behavior; production API/network/console; current source; tests/release artifacts; deployment config; docs; historical plans; assumptions.

## Commander preflight

Before spawning work:

1. Record UTC time and exact time remaining to `2026-07-22T00:00:00Z`.
2. Record `git rev-parse HEAD`, status, branch, relevant file hashes, active public Worker/deployment/Container identifiers, and Devpost state without changing them.
3. Identify all unrelated dirty files and assign ownership; agents may not touch them without coordination.
4. Freeze the candidate scope. Required fixes are CL-001 through CL-010. Selected P2s may proceed only where explicitly paired below. CL-022 and any new feature are gated optional work.
5. Create a release evidence directory inside the repository. Keep all test/runtime/browser cache there.
6. Run and retain the smallest relevant pre-change tests for every workstream. A pre-existing failure is recorded and reproduced; it is never hidden by weakening tests.
7. Create a shared issue/acceptance ledger. Only the Commander changes issue status. An implementation agent supplies evidence but may not self-certify its P0/P1 closure.

## Swarm design and file ownership

Use waves if concurrency is limited. No two active agents may edit the same file. The Commander resolves cross-file integration after agents stop. Agents may read any in-repository file but edit only their assigned scope.

### Agent 0 — Release Commander and integrator

Owns:

- task sequencing, dirty-worktree protection, release ledger, conflict resolution;
- final integration, exact identifiers, release receipts, production smoke orchestration;
- no feature implementation unless an integration conflict cannot be assigned safely.

Must not mark an issue closed without an independent acceptance run. Must keep optional work behind the phase gate.

### Agent 1 — Learner-flow and Judge fast-path implementer

Exclusive edit scope:

- `apps/web/src/App.tsx` and its directly corresponding tests;
- `apps/web/src/features/judge/JudgeModeView.tsx` and its tests;
- learner-flow/replay/sample-specific components and styles explicitly imported by those paths.

Issues: CL-003, CL-004, CL-005, CL-011, CL-014, CL-015, CL-016. CL-013 may be fixed here only in replay-owned tokens; otherwise hand it to Agent 5 after this agent finishes.

Required changes and acceptance:

1. **Claim-only handoff (CL-003).** Preserve the entered claim. Present one dominant “Try a verified sample” action and one secondary supported-notebook upload action with the support boundary. A no-notebook learner reaches Prediction within two actions. Test 390×844 and 1440×900 from clean state.
2. **Replay authority (CL-004).** Separate playback from local practice, or persistently label local actions `Local practice — not recorded or verified`. Replay remains GET-only; stored hashes never change; local revision/transfer/repair cannot display verified/patched/completed-proof authority. Capsule v2 playback remains exact. Test network methods, labels at every stage/viewport, refresh, local reset, and hash invariance.
3. **Sample Boundary (CL-005).** Add exactly one bounded allowlisted control/mini-map backed by bundled fixed sample evidence and an accessible table. It changes one condition, visibly explains what changes, is deterministic, retains the sample label, and hash-binds to sample provenance. If this cannot be completed without weakening authority, narrow `complete learning loop` copy instead and leave CL-005’s score gap explicit.
4. **Learner revision (CL-011).** Remove the complete prefilled answer. Untouched/default/blank cannot advance. Require one evidence-linked selection or edit; support wrong/uncertain answers without shaming or instant full-answer disclosure.
5. **Mobile modes (CL-014).** At 375×812 and 390×844, show a compact sample action and a control named `Modes` (or equally explicit), not generic `Explore`; sample/replay/live status is discoverable within one disclosure; targets and overflow pass.
6. **Recovery/resume (CL-015).** Missing session, missing proof, and unknown routes get durable distinct recovery cards with retry/back/home. Landing shows up to three recent sessions with mode/status and removes stale entries safely. Test refresh, direct load, back/forward, and resume.
7. **Start over (CL-016).** While a job is active, confirm reset, invoke idempotent cancel or invalidate lineage before clearing, handle timeout/already-terminal/offline, and reject late callbacks/events from advancing the next journey.

Do not change fixed kernels, scorer, verifier, proof schema, runner boundary, submission docs, or Worker admission policy.

### Agent 2 — Public admission and upload hardening

Exclusive edit scope:

- Worker admission/rate/budget middleware and its tests;
- upload request-bound enforcement and its tests;
- migrations/config directly required by those controls.

Issues: CL-007 and, after CL-007, CL-017.

Required changes and acceptance:

1. Add per-caller/session burst and sustained budgets for cost-bearing starts, plus a global bounded concurrency/daily circuit breaker where existing architecture supports it. Enforce before GPT/runner/storage cost. Return typed 429 with `Retry-After` and leave sample/replay GET paths available.
2. Define trusted client-address behavior; do not blindly trust arbitrary forwarded headers.
3. Count idempotent retries correctly so a duplicate cannot double-charge and cannot bypass limits.
4. Expose sanitized observability without caller secrets or identifiers.
5. Bound multipart bodies before full `formData()` materialization when length is absent/untrusted. Return typed 413; exact maximum valid input succeeds.
6. Test allowed burst, sustained limit, recovery window, concurrency, daily breaker, duplicate/idempotent requests, upstream 429 mapping, exact max, max+1, absent length, wrong MIME, early disconnect, and multipart overhead.

Do not change learner UI, state-machine semantics, fixed scientific authority, model prompts, or replay.

### Agent 3 — Codex isolation and claim-integrity implementer

Exclusive edit scope:

- `services/hosted-runner/src/launch-boundary.ts` and focused tests;
- `packages/codex-client/src/app-server.ts` isolation-capability reporting and focused tests;
- `Dockerfile.runner` only if a bounded isolation fix is attempted;
- `packages/codex-client/README.md`, `docs/CODEX_USAGE.md`, threat/authority docs that describe this boundary.

Issue: CL-008.

Required two-step response:

1. **Mandatory honest correction:** report the current property as a credential-and-privilege boundary with filesystem generation read isolation `PARTIAL`. Remove every claim that hidden source is OS-unreadable unless a test proves it. Health, Judge copy, release receipt, README, and Capsule limitations must agree.
2. **Only after the honest correction and stable baseline:** consider a minimal mount namespace/sidecar/proxy that exposes only the exact generation workspace and required runtime. Do not embark on a broad sandbox rewrite.

Prize-quality isolation acceptance:

- Digest-bound black-box test proves `/app`, verifier source, held-out fixtures, mutations, repository paths, unrelated job paths, credentials, and environment secrets are absent/unreadable.
- Allowed App Server handshake and bounded generation workspace remain functional.
- Network remains unavailable; tool/command/file events still fail closed.
- Credentials are staged only for initialization and revoked before the scientific turn.
- No result may release solely because isolation passed; scorer/kernel/verifier authority is unchanged.

Do not change Worker business routes, learner UI, kernels, scorers, verifiers, or submission copy outside the boundary-specific documents.

### Agent 4 — Submission, positioning, and learner-evidence owner

Exclusive edit scope:

- `docs/DEVPOST_COPY.md`, demo/video script, screenshot plan, judge instructions, README opening/scope sections, learner study protocol/results, claim-evidence matrix;
- local submission assets only. External Devpost/video/repository-sharing mutations require owner authorization.

Issues: CL-001, CL-006, CL-009, CL-010.

Required changes and acceptance:

1. Use title `CounterLab — A scientific debugger for beliefs` and product line `Ask like chat. Prove it like science.` Use Question, Prediction, Test, Boundary, Apply, Repair; Belief Spec, Evidence Verdict, Boundary Map, Reasoning Diff, Proof Capsule.
2. State exactly two released ML packs unless a third passes every gate. Never say arbitrary notebooks, all STEM, or global mastery.
3. Explain the four authorities precisely: GPT-5.6 frames; Codex proposes bounded plans; fixed scorer/kernel computes/selects; frozen verifier releases; learner owns prediction/revision/action/approval.
4. Distinguish observed live, source/test verified, documented, inferred, and unverified claims. Include the exact frozen release tuple.
5. Prepare every mandatory Devpost field, repository access instruction, `/feedback` session ID, free judge path, public sub-three-minute narrated video, four current screenshots, and logged-out preflight. Do not mark submitted until the official receipt exists.
6. Learner evidence: pre-register a minimal consented paired/counterbalanced explanation-only versus CounterLab study for 5–8 participants, recording every denominator, first unassisted transfer attempt, time, completion, confusion/abandonment, qualitative reaction, and limitations. If recruitment cannot be completed, run three usability-only sessions and retain `NO_DATA` for learning effects. Never backfill or exclude inconvenient observations silently.
7. The video must show a genuine exact-build authority chain and persistent mode labels; never stage rejection or edit sample/replay into live.

Do not edit product code, deployment config, verifier/kernel logic, or invent results.

### Agent 5 — Accessibility, privacy UX, delivery polish, and CI

Run after Agent 1 stops if any shared style/token file would overlap. Exclusive edit scope:

- command-palette component/focus tests;
- shared accessibility utilities/skip link;
- privacy/capability-link disclosure components and related sanitizer privacy-class enforcement if not in Agent 2’s files;
- static asset/document header config and caching tests;
- hosted CI workflow and no product refactor.

Issues: CL-012, CL-013 if unowned, CL-018, CL-019, CL-020, CL-021, and gated CL-022.

Acceptance:

- Palette initial focus, Tab/Shift+Tab containment, Escape, and invoker restoration pass keyboard tests.
- Every normal-text replay pair is at least 4.5:1; large text at least 3:1; status semantics remain distinguishable beyond color.
- `privacyClass` suppresses declared-sensitive fields; common synthetic email/phone/ID patterns are minimized; exact outbound preview remains mandatory; raw rows/paths/secrets stay absent; limitations say heuristic, not guaranteed de-identification.
- Before copying/exporting a capability URL, show `Anyone with this link can view`, a content summary, actual retention/expiry, and revocation/support behavior. Invalid/revoked IDs fail closed.
- Fingerprinted assets use long immutable caching; HTML remains revalidated; warm load transfers no unchanged hashed body; LCP/CLS do not regress. Do not code-split unless measurement proves a safe benefit.
- Add minimal pinned hosted CI for root/web/Worker type checks, focused authority tests, Worker/API/UI tests, secret scan, build/artifact validation. Demonstrate negative controls. Do not refactor `api.ts` or `App.tsx`.
- Static document security headers are optional after every P1: compatible enforced CSP, frame protection, referrer policy, nosniff, Permissions Policy, correct edge HSTS; all major routes still render.

Do not change scientific authority or release claims.

### Agent 6 — Independent acceptance and red-team reviewer

Read-only until the Commander asks for a narrowly scoped test correction. Complete an independent pass before reading implementer summaries.

Must attempt to disprove:

- every claimed P0/P1 closure;
- exact release/source/image binding;
- replay GET-only/hash invariance and practice labels;
- sample Boundary authority and learner revision gate;
- rate/budget enforcement and idempotency without load abuse;
- Codex isolation wording/enforcement;
- learner-data denominators;
- submission/video/build consistency;
- proposed score increase.

Repeat any P0/P1 failure. A single transient pass is insufficient. Reject closure if evidence belongs to another commit/build or if the fix merely hides the symptom/copy while misleading behavior remains.

### Agent 7 — Conditional cross-domain differentiation

Do not spawn unless Agents 0 and 6 certify all required gates green, the release is source-bound, no P0/P1 remains, and at least 12 hours remain.

Exclusive scope: `physics/free-fall` Subject Pack and its fixed engine adapters/tests/docs only.

It must pass every repository constitution gate: pinned/admitted SciPy/Pint/SymPy roles, analytic vacuum oracle, numerical convergence, dimensional validation, drag/mass controls, immutable Prediction, bounded Codex operation IDs only, signed/integrity-hashed result arrays, accessible animation/table, Boundary Map, deterministic transfer, mutations, Proof Capsule, browser/release evidence. Any partial result is omitted from public routes and submission.

## Required test discipline

Create an in-repository runtime directory and replace `<audit-runtime>` below with it. Before changing each scope, run the narrowest existing tests for that behavior. After the change, run the same tests plus new failure/edge tests. Before integration, run:

```text
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ./node_modules/.bin/vitest run --no-file-parallelism packages/notebook-parser/src/index.test.ts packages/experiment-scorer/test/scorer.test.ts packages/plan-verifier/src/scientific-candidate-v5.test.ts packages/plan-verifier/src/epistemic.test.ts packages/plan-verifier/src/epistemic-imbalance.test.ts packages/proof-capsule/src/index.test.ts packages/proof-capsule/src/authority.test.ts packages/proof-capsule/src/node-cli.test.ts services/hosted-runner/src/job-processor.test.ts services/hosted-runner/src/control-plane-client.test.ts services/hosted-runner/src/fixed-kernel.test.ts services/hosted-runner/src/fixed-patch.test.ts services/hosted-runner/src/startup-probe.test.ts
```

From `apps/web`:

```text
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ../../node_modules/.bin/vitest run --config vitest.config.ts --no-file-parallelism worker/api.test.ts src/api.test.ts src/App.test.tsx src/features/judge/JudgeModeView.test.tsx
```

Python:

```text
env TMPDIR=<audit-runtime> PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=services/kernel/src:services/runner/src .venv/bin/python -m pytest services/kernel/tests services/runner/tests -p no:cacheprovider -qq --tb=short
```

Type checks:

```text
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ./node_modules/.bin/tsc --noEmit
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ../../node_modules/.bin/tsc --noEmit -p tsconfig.json
env TMPDIR=<audit-runtime> XDG_CACHE_HOME=<audit-runtime> ../../node_modules/.bin/tsc --noEmit -p tsconfig.worker.json
```

Secret scan:

```text
env TMPDIR=<audit-runtime> PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/secret-scan.py
```

Also run the repository’s documented full test/build/release commands from a clean, stable worktree after inspecting their side effects. Do not treat the audit sandbox’s prior 4 Python permission/socket failures or 18 synthetic Codex child-process failures as acceptable forever: reproduce them in the intended supported environment and require the relevant production-image/protocol checks to pass before release.

Never delete, skip, weaken, snapshot-overwrite, or broadly update a test to obtain green. Each fix needs at least one negative test that would fail on the pre-change behavior.

## Integration sequence

### Wave 0 — truth and freeze

- Commander baseline, issue ledger, stable candidate, exact time/deadline.
- Agent 4 corrects local claims and prepares submission skeleton; no external submission yet.
- Agent 3 applies mandatory `PARTIAL` isolation wording.

### Wave 1 — core first-prize behavior

- Agent 1 fixes claim handoff, replay authority, sample Boundary/revision, and mobile/recovery/reset.
- Agent 2 adds admission/cost protection and early upload bounds.
- Agent 3 may add bounded isolation only if the honest correction and focused tests are green.
- Agent 4 runs learner evidence collection in parallel without changing product code.

### Wave 2 — material quality and automation

- Agent 5 addresses focus/contrast/privacy link/caching/CI and only then static headers.
- Commander integrates sequentially, rerunning the affected pre/post slice after each logical change.

### Wave 3 — exact release qualification

After all local gates pass and deployment is explicitly authorized:

1. Build from the frozen commit; record asset hashes, image digest, Worker/deployment, migrations, schemas, engine/SBOM hashes, model/config receipt.
2. Deploy without unrelated changes.
3. Use a clean browser profile and synthetic/repository fixtures only.
4. Execute twice: landing, fast sample, Judge fast path, verified replay, both supported live notebooks, unsupported/malformed input, model unavailable, runner unavailable, timeout/interruption, transfer fail/pass, repair locked/unlocked/approve/reject, refresh during active job, back/forward, direct links, resume, second project, downloads/exports, Judge return, no-prior-terminology completion.
5. Capture timestamps, build IDs, viewport/browser, exact actions, elapsed time, console, failed/slow requests, screenshots, and output hashes.
6. Verify sample/replay/live labels at every screen; no silent fallback.
7. Verify SSE cursor reconnect, idempotency, cancellation, late events, exact patched-copy preservation, Capsule bytes/run binding, event chain, and no secrets.
8. Repeat any failure before classifying it. Do not redeploy between the two qualification passes.
9. Agent 6 independently replays every P0/P1 acceptance test and challenges the score.

If production testing would mutate private user data, create uncontrolled cost, require missing credentials, or exceed existing authorization, stop and request the narrow authority needed. Never use private data or destructive/flood traffic.

### Wave 4 — submission and proof

After the exact public tuple passes:

- Record the sub-three-minute narrated video from that tuple.
- Capture four current submission screenshots with mode/build context.
- Run the claim-evidence consistency table.
- Verify anonymous/public access or both required private repository shares.
- Obtain explicit authorization for external Devpost/video writes if not already granted.
- Submit by T−6h and verify public slug and `submitted_at` logged out.
- Run a final GET-only public smoke without changing the release.

## Required versus optional

### Required before submission

- CL-001 through CL-010.
- CL-011 because it is part of the fast sample credibility fix.
- Minimal CI from CL-021.
- Exact public production qualification and independent P0/P1 validation.
- Honest limitations for anything that cannot be fully corrected.

### Material only after required gates

- CL-012 through CL-020 in the phase order above, with accessibility/privacy fixes ahead of caching polish.
- CL-022 static headers after compatibility verification.

### Optional only if all critical work passes

- Exactly one complete `physics/free-fall` pack under Agent 7.

### Forbidden before submission

- Broad monolith refactor, generic tutor/chat features, arbitrary subjects/code/notebooks, more adjacent lessons, accounts/LMS/social/gamification/voice/mobile apps, dependency churn, new providers/databases, staged failures, unlabelled replay, invented metrics, or a visual redesign.

## Stop and rollback criteria

Stop the affected workstream and preserve evidence if:

- a fixed authority, prediction immutability, transfer gate, copied repair, replay hash, or Capsule binding weakens;
- a mode silently falls back or loses its label;
- a pre-existing passing focused test regresses;
- release identifiers drift after recording begins;
- the video/screenshot behavior differs from live;
- an agent touches another owner’s scope or unrelated dirty file;
- a security fix requires broad unreviewed architecture work;
- an optional feature begins with any P0/P1 red or less than 12 hours remaining.

Use reversible commits only if authorized. Do not use destructive reset/checkout/clean. Revert only the agent’s own isolated change through a reviewed inverse patch if needed.

## Definition of implementation done

- Official entry is submitted and independently viewable.
- One exact public release tuple is immutable and fully qualified twice.
- Every CL-001 through CL-010 acceptance criterion passes and is independently reproduced.
- Claim-only learner path, sample Boundary/revision, replay authority, and Judge fast path are honest and finishable.
- Runtime Codex contribution is visible but never authority; isolation claims exactly match enforcement.
- Rate/cost control, failure/degraded behavior, reconnect/cancel/resume, patch copy, and Capsule integrity are proven.
- Desktop/mobile keyboard/contrast/focus checks pass; console/network are clean except documented expected failures.
- Learner impact is measured honestly or remains explicitly `NO_DATA`; no fabricated inference.
- README, Devpost, video, screenshots, judge instructions, public UI, and release receipt use one vocabulary and claim set.
- No unrelated refactor, dependency upgrade, secret, personal data, stale generated noise, or assistant attribution enters the diff/publication.
- Agent 6 challenges and signs off every P0/P1 closure with evidence.

## Final implementation response

Report concisely:

```text
Deadline remaining
Final commit
Public Worker/deployment/Container tuple
Official submission URL and submitted_at
Closed P0/P1/P2/P3 IDs
Unresolved IDs and exact reason
Tests run and exact results
Production journeys run and evidence paths
Learner study status and denominators
Top residual risk
Rollback receipt
```

Do not say complete if the exact public live journey, mandatory submission, or independent P0/P1 validation is missing.
