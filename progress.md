# CounterLab progress log

## Session: 2026-07-14

### Phase 0: Repository discovery and architecture

- **Status:** complete
- Read the repository constitution and supplied master build brief.
- Loaded the required planning, brainstorming, TDD, frontend, Cloudflare, OpenAI, and verification workflows.
- Audited the empty repository, Git state, and primary runtimes.
- Created persistent working plans and requested project documentation.

### Phase 1: Deterministic evidence spine

- **Status:** complete
- Defined Python and TypeScript acceptance tests before production modules.
- Verified red state: Vitest failed on missing contracts/parser modules; pytest failed on missing kernel/verifier modules; CLI tests failed on missing `counterlab_kernel.cli`.
- Installed locked Node and Python dependencies; Python 3.14-compatible scientific wheels are available.
- Implementing fixture/kernel, parser/contracts, verifier/policy, public-artifact generation, and CLI in independent slices.
- Confirmed Docker daemon access, configured user Git identity, current Codex App Server schema generators, and missing Python test/ML dependencies.
- Generated and committed the actual public fixture, verified result, and stored-output notebook.
- Verified the real sample is supported by the intake parser and records stable file/cell/output hashes.
- Full Milestone 1 suite: 14 TypeScript tests and 35 Python tests passed; strict TypeScript passed.
- Published mutation matrix: 12/12 detected.

### Phase 2: Deterministic learning loop

- **Status:** in progress
- Next action: extend shared schemas and state-machine tests for sessions, evidence events, predictions, transfer, patch, Reasoning Diff, and Proof Bundle before implementation.

## Test results

| Test | Command | Expected | Actual | Status |
|---|---|---|---|---|
| Repository audit | `git status`, runtime version probes | Establish clean baseline | Empty uncommitted repository and runtimes recorded | pass |
| TypeScript red gate | `pnpm exec vitest run` | Fail because implementation is absent | 2 suites failed on missing modules | expected fail |
| Python red gate | `PYTHONPATH=services/kernel/src .venv/bin/python -m pytest services/kernel/tests` | Fail because implementation is absent | 4 collection errors on missing package | expected fail |
| CLI red gate | focused pytest for `test_cli.py` | Fail because CLI is absent | 3 behavior failures on missing module | expected fail |
| Milestone 1 TypeScript | `pnpm exec vitest run` | Contracts/parser pass | 14 passed | pass |
| Milestone 1 Python | `pytest services/kernel/tests` | Kernel/verifier/CLI pass | 35 passed | pass |
| Mutation matrix | `./scripts/run-mutations.sh leakage` | Every critical mutation detected | 12/12 detected | pass |
| Public notebook intake | Node 26 TypeScript parser invocation | Sample is supported with stable evidence | `SUPPORTED`, 5 cells, SHA `92ba6389...` | pass |

## Error log

| Timestamp | Error | Attempt | Resolution |
|---|---|---:|---|
| 2026-07-14 | Combined instruction read was truncated | 1 | Re-read selected files separately. |
| 2026-07-14 | Findings update targeted a nonexistent heading | 1 | Read the current file and patched the correct section. |
| 2026-07-14 | pnpm ignored required native build scripts | 3 | Workspace allowlist remained ineffective; switched to configuration/docs diagnosis rather than repeating install. |
| 2026-07-14 | pnpm 11 removed `onlyBuiltDependencies` | 4 | Verified current docs and migrated to a scoped `allowBuilds` map. |
| 2026-07-14 | pnpm generated a duplicate placeholder YAML key | 1 | Removed only the placeholder block and retained explicit reviewed approvals. |
| 2026-07-14 | Full Python suite found 3 verifier hardening failures | 1 | Sent exact contract gaps to the verifier implementation agent; 31 other tests passed. |
| 2026-07-14 | Public notebook parsed as `UNSUPPORTED` | 1 | Root cause was the parser treating stdlib `pathlib` as unknown; regression test and real-notebook parse now pass. |
| 2026-07-14 | Bookkeeping patch syntax was invalid | 1 | Reissued with valid multi-file patch context. |

## Reboot check

| Question | Answer |
|---|---|
| Where am I? | Milestone 2, deterministic learning loop. |
| Where am I going? | Deterministic loop, live integrations, patch gate, hardening, Cloudflare/release. |
| What is the goal? | A verified, judge-ready CounterLab P0 with honest replay and live setup paths. |
| What have I learned? | See `findings.md`. |
| What have I done? | Discovery and persistent planning are complete. |
