# Task Plan: CounterLab Studio first-prize upgrade

## Goal

Upgrade the existing CounterLab release into an honest hosted, artifact-specific
Studio with strict sample/live/replay separation, a process-capable runner plane,
two verified concept packs, and a complete public notebook-to-proof journey.

## Current Phase

Phase 2 — Upgrade plan and regression boundary

## Phases

### Phase 1: Repository and blocker discovery

- [x] Read the required product, progress, authority, threat, and master documents.
- [x] Inspect the current API, contracts, session core, parser, analyst, Codex,
      kernel, verifier, runner, replay, UI, migrations, and tests.
- [x] Prove each stated blocker in current code/tests.
- **Status:** complete

### Phase 2: Upgrade plan and regression boundary

- [x] Create `docs/FIRST_PRIZE_UPGRADE_PLAN.md` from repository evidence.
- [x] Add failing tests for sample leakage, concept advertising, and configured
      runner dead ends.
- [x] Separate sample/live/replay contracts and route validation.
- **Status:** complete

### Phase 3: Hosted artifact-specific leakage vertical slice

- [ ] Add runner job/event/token contracts and D1 persistence.
- [ ] Add authenticated runner service/test runner and fixed plan interpreter.
- [ ] Compile, verify, repair, run, patch, and stream an uploaded leakage notebook.
- [ ] Add artifact-specific proof and patch download.
- **Status:** in_progress

### Phase 4: CounterLab Studio product shell

- [ ] Refactor only product-responsibility boundaries covered by tests.
- [ ] Add Studio navigation, evidence navigator, agent rail, proof console,
      history, commands, and interactive leakage controls.
- **Status:** pending

### Phase 5: Class imbalance and held-out evidence

- [ ] Implement the imbalance kernel, verifier, transfer, patch, fixture, notebook,
      mutations, UI controls, and end-to-end path.
- [ ] Freeze and run the supported/unsupported held-out matrix.
- [ ] Add learner-pilot protocol and non-fabricated achieved metrics.
- **Status:** pending

### Phase 6: Release verification and deployment

- [ ] Run the full local and clean-clone acceptance matrix.
- [ ] Run production smoke and a real uploaded live notebook.
- [ ] Update all required documentation and achieved metrics.
- [ ] Commit reviewable slices, deploy Cloudflare control/runner planes, and
      verify the public URL.
- **Status:** pending

## Key Questions

1. Which current notebook patterns contain enough sanitized evidence to compile
   an artifact-specific fixed plan without raw data or arbitrary generated code?
2. Can the installed Cloudflare account run the required Container shape, or is
   an authenticated dedicated runner the compatible release path?
3. Which session/event schema changes can remain backward compatible with the
   genuine leakage replay and current proof bundles?

## Decisions Made

| Decision | Rationale |
| --- | --- |
| Preserve the fixed kernel/verifier/parser/evidence chain | They are already proven and remain the numeric/integrity authority. |
| Start with leakage regression tests | The user explicitly prioritizes eliminating sample leakage before runner/UI expansion. |
| No generated Python on the hosted path | A fixed plan interpreter gives a smaller, auditable authority surface. |
| Bind sample authority to sample artifact ID and hash | Identical uploaded bytes remain a live artifact; provenance cannot be inferred from content hash alone. |

## Errors Encountered

| Error | Attempt | Resolution |
| --- | ---: | --- |
| Initial full `AGENTS.md` output was truncated | 1 | Re-read the file in bounded line ranges. |
| Worker API remainder output exceeded the available model context | 1 | Re-read `apps/web/worker/api.ts` in chunks of at most 200 lines. |
| Combined plan/progress patch used stale task-plan table context | 1 | Split the plan document creation from exact-context status updates. |
| Root Vitest config found no Worker test for a direct `apps/web/worker` filter | 1 | Run the test through `apps/web/vitest.config.ts`. |
| A combined Git diff command produced output too large for the tool response | 1 | Switched to `git status`, `git diff --stat`, and bounded per-file diffs. |
| Focused mode-migration test output expanded to a large DOM dump and was truncated | 1 | Used the failure summary and reran individual failing tests after correcting their explicit assumptions. |
| Repository-wide Prettier check reported 46 pre-existing style issues, mostly generated/replay and unrelated files | 1 | Kept scope reviewable, formatted every changed code file, and used `git diff --check`; the repository-wide backlog remains explicit. |

## Notes

- Re-read this file before every architecture or release decision.
- Log every failed command and change approach rather than repeating it.
