# Progress Log: CounterLab Studio upgrade

## Session: 2026-07-15

### Phase 1: Repository and blocker discovery

- **Status:** in_progress
- **Started:** 2026-07-15
- Actions taken:
  - Re-read the complete 1,187-line repository constitution in bounded ranges.
  - Loaded the file-planning and strict test-first workflows.
  - Created persistent task, findings, and progress working files.
  - Read the current README and progress/acceptance matrix; recorded the gap
    between verified leakage evidence and the hosted artifact-specific path.
  - Read achieved metrics and the authority matrix; identified the existing
    local adapter compiler as a separate proof to preserve, not the hosted plan
    execution model.
  - Read the threat model and original master prompt; catalogued new runner-token,
    callback, cursor, and queue threats without weakening the established model,
    kernel, verifier, learner, or replay authority.
  - Inspected the complete repository tree, package scripts, Git baseline, and
    installed runtimes; confirmed the absence of a hosted runner, registry,
    imbalance pack, held-out matrix, and study support.
  - Completed the Worker API route audit and located the exact hard-coded
    sample/live boundaries for the first regression suite.
  - Read the first 700 lines of the React application and recorded the false
    two-concept claim, local string modes, leakage-specific Belief copy, and
    local-storage-only resume architecture.
  - Audited React through the result/transfer state boundary; found hidden
    verifier evidence, sample-only accessible chart text, and browser-only
    replay progression.
  - Completed `App.tsx`; verified that live setup starts on the sample artifact,
    uploads are assigned instant mode, replay discards its API payload, and live
    compile is a dead-end screen.
  - Completed the React API/sample/bootstrap audit; confirmed strict envelope
    validation is reusable, while health/mode/session schemas and bundled sample
    fallbacks need explicit authority separation.
  - Completed the shared contract implementation audit; identified reusable
    integrity/state invariants and the exact v2 plan, runner, mode, result, and
    proof contract gaps.
  - Read session domain/service logic; confirmed strong append-only optimistic
    state handling and found missing artifact/plan/result/patch cross-bindings.
  - Completed SQLite/D1 persistence audit; confirmed atomic optimistic patterns
    and catalogued the runner/project/event-cursor schema missing from migration
    0001.
  - Completed notebook parser audit; preserved its intake safety model and
    identified schema-metadata dependence plus imbalance evidence gaps.
  - Completed Belief Analyst audit; confirmed its provider-neutral Responses
    safety/integrity path is reusable and isolated concept routing, preview,
    sensitivity approval, and output-index resolution gaps.
  - Audited Codex types/prompts/fallbacks/sanitizer; isolated the hosted
    plan-only compiler/event additions from the proven local adapter compiler.
  - Completed App Server transport audit; confirmed stable stdio lifecycle and
    isolation checks are reusable inside a process-capable runner.
  - Completed credential/read-isolation audit; recorded the strong local proof
    boundary that should remain separate from hosted plan interpretation.
  - Audited the fixed leakage fixture/experiment/service/transfer/AST policy;
    preserved deterministic numeric authority and identified the missing plan
    interpreter and generic concept routing.
  - Completed public patch engine audit; preserved its strict sample proof and
    scoped the new artifact-specific patch-plan interpreter/verifier boundary.
  - Completed the 890-line frozen leakage verifier audit; retained its exact
    active-mutation authority and scoped concept-dispatched plan/result verifier
    additions.
  - Completed runner workspace/pipeline/orchestrator/Docker audit; established
    the exact reusable local controls and the missing hosted job-service layer.
  - Audited proof/replay/sample builders; retained full chain validation and
    identified the API/UI summary replay and hard-coded sample proof boundary.
  - Read the Cloudflare Container skill/references, current official docs,
    installed Wrangler schema/config, and performed a read-only account probe;
    confirmed the account can host the native runner plane.
  - Inventoried unit/Python/browser tests and read the Worker/React critical
    suites; found missing sample-leakage tests and blocker-encoding UI tests.
  - Audited the E2E harness and stylesheet structure; confirmed CloakBrowser is
    configured and found multiple cascade generations in the CSS monolith.
  - Added red authority regressions. They reproduced sample session acceptance
    (201), sample result attachment (200), sample patch persistence before a 500,
    false two-concept copy, and rejection of configured runner health.
  - Added artifact/mode/result/patch guards and configured runner capability;
    the focused Worker/UI suite now passes 22 tests.
  - Added and passed a copied-sample regression: an upload with identical bytes
    cannot acquire the registered sample lesson's authority.
  - Added the strict discriminated `SessionMode` contract for sample lesson,
    live notebook, and verified replay; cross-mode fields are rejected.
  - Migrated session aggregates, D1/SQLite reads, Worker endpoints, API client,
    and React restore logic to the discriminated mode contract. Legacy stored
    strings normalize on read but are rejected for newly created sessions.
  - Added separate sample/live/replay session routes, retired generic client
    mode selection, made replays read-only, and blocked sample transfer reuse
    by live artifacts.
  - Changed live entry to require an uploaded notebook before creating the live
    session; the bundled sample is no longer substituted for live analysis.
  - Added hosted Runner Job, browser-safe compiler event, callback, token, fixed
    operation, and Experiment Plan v2 contracts with terminal transition rules.
  - Added D1 migration 0002 and a repository that atomically persists optimistic
    jobs, cursor-ordered public events, and append-only callback receipts.
  - Added short-lived HMAC runner grants bound to one job, manifest, sanitized
    input object, output prefix, callback path, state version, and expiration.
  - Generated one Plan v2 JSON Schema into TypeScript and packaged Python
    locations, then added Python schema/lineage/evidence validation and a fixed
    leakage plan interpreter with deterministic interactive run configuration.
- Files created/modified:
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `docs/FIRST_PRIZE_UPGRADE_PLAN.md`

## Test Results

| Test | Input | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| Root Vitest | pre-upgrade tree | Existing contracts/core/client suites stay green | 104 passed | pass |
| Web Vitest | pre-upgrade tree | Existing Worker/UI/API suites stay green | 29 passed | pass |
| Pytest | pre-upgrade tree | Existing kernel/verifier/runner suites stay green | 98 passed | pass |
| Typecheck | pre-upgrade tree | TypeScript and Worker generated types pass | passed | pass |
| CloakBrowser E2E | pre-upgrade tree | Existing judged path stays green | 13 passed in 28.3s | pass |
| Authority regressions (red) | pre-fix Worker/UI | Reproduce all five release blockers | 5 expected failures reproduced | pass |
| Authority regressions (green) | guarded Worker/UI | Prevent sample lineage leaks and accept configured runner health | 22 passed | pass |
| Copied-sample authority regression (red) | sample hash with a different artifact ID | Reject copied upload as a sample lesson | Expected 201-to-409 failure reproduced | pass |
| Copied-sample authority regression (green) | sample ID and hash binding | Reject copied upload as a sample lesson | 1 focused test passed | pass |
| Root Vitest | authority and mode-contract slice | Preserve all contract/core/client behavior | 105 passed | pass |
| Web Vitest | authority and runner-capability slice | Preserve Worker/UI/API behavior | 34 passed | pass |
| Typecheck | authority and mode-contract slice | Strict TypeScript remains valid | passed | pass |
| CloakBrowser E2E | authority and copy slice | Existing lesson, replay, resume, upload, keyboard paths remain valid | 13 passed in 27.6s | pass |
| Mode route regressions (red) | pre-migration Worker | Separate mode endpoints and strict cross-mode bodies | 2 expected 404 failures reproduced | pass |
| Live transfer/replay mutation regressions (red) | pre-guard Worker | Reject sample transfer for live and all replay writes | 2 expected 200-to-409 failures reproduced | pass |
| Root Vitest | mode-migrated tree | Contracts, persisted state, proof, clients remain green | 106 passed | pass |
| Web Vitest | mode-migrated tree | Worker, API, and React mode boundaries remain green | 38 passed | pass |
| Typecheck | mode-migrated tree | Strict TypeScript and Worker types pass | passed | pass |
| CloakBrowser E2E | mode-migrated tree | Existing 13 judged paths remain green | 13 passed in 27.7s | pass |
| Repository Prettier check | full repository | No formatting differences | 46 pre-existing/unrelated files reported | fail |
| Runner contracts (red) | pre-contract tree | Plan, job, event, callback, and token schemas exist | 4 expected undefined-schema failures reproduced | pass |
| Runner job service (red) | pre-service tree | Optimistic jobs, cursors, callbacks | Missing module reproduced | pass |
| Runner token (red) | pre-token tree | Signed bounded grants | Missing module reproduced | pass |
| Python Plan interpreter (red) | pre-interpreter tree | Shared schema and fixed execution | Missing module reproduced | pass |
| Runner contract/service tests | hosted runner substrate | Structural policy, optimistic transitions, event reconnect, idempotency | 21 passed | pass |
| D1/token tests | hosted runner substrate | D1 atomic persistence and signed grant enforcement | 3 passed | pass |
| Python Plan/kernel tests | hosted runner substrate | Schema/evidence policy, determinism, unchanged reference hash | 8 passed | pass |
| Full `test-all.sh` | runner substrate checkpoint | Shared, Worker/UI, Python/runner, typecheck, D1 migration, browser | 113 TS + 41 web + 101 Python + 13 browser passed | pass |

## Error Log

| Timestamp | Error | Attempt | Resolution |
| --- | --- | ---: | --- |
| 2026-07-15 | Full `AGENTS.md` output truncated | 1 | Re-read using bounded `sed` ranges. |
| 2026-07-15 | Worker API remainder output exceeded the available model context | 1 | Switched to bounded reads of at most 200 lines. |
| 2026-07-15 | Combined plan/progress patch used stale task-plan table context | 1 | Split document creation from exact-context progress updates. |
| 2026-07-15 | Root Vitest config excluded the targeted Worker test | 1 | Switched to the web Vitest configuration. |
| 2026-07-15 | Combined Git diff output exceeded the response budget | 1 | Switched to bounded status, stat, and per-file diff inspection. |
| 2026-07-15 | Focused mode-migration failures emitted a truncated DOM dump | 1 | Isolated the four failures from the summary and switched to individual reruns. |
| 2026-07-15 | Repository-wide Prettier check reported 46 existing style differences | 1 | Formatted all changed code and kept unrelated generated/replay files untouched; use diff-local validation for this slice. |
| 2026-07-15 | Full typecheck rejected the D1 test adapter's `unknown` SQL values and cross-runtime URL overload | 1 | Cast binds to Node `SQLInputValue` and resolved migration files through `fileURLToPath`. |

## 5-Question Reboot Check

| Question | Answer |
| --- | --- |
| Where am I? | Phase 3 runner jobs and hosted leakage vertical slice. |
| Where am I going? | Regression boundary, hosted leakage runner, Studio UX, imbalance, held-out release. |
| What's the goal? | A real public artifact-specific CounterLab Studio with two verified concepts. |
| What have I learned? | See `findings.md`. |
| What have I done? | Re-read constitution and initialized persistent working records. |
