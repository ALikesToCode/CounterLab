# Runtime Codex usage

CounterLab uses Codex as a bounded artifact compiler. Codex proposes an experiment plan, an adapter that composes the public fixed SDK, and public tests. It does not own metric formulas, experiment truth, transfer scoring, or verification.

## Runtime modes

`COUNTERLAB_CODEX_MODE` has three valid values.

| Mode       | Implementation           | Behavior                                                                                                                                                                               |
| ---------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `live`     | `AppServerCodexCompiler` | Runs the locally installed Codex App Server over stdio JSONL. This mode requires the process-capable local runner, Codex CLI authentication, and the local sandbox pipeline.           |
| `replay`   | `ReplayCodexCompiler`    | Validates and re-emits stored, already-sanitized compiler events. The first event carries the replay ID, original timestamp, and model so the UI can retain a persistent replay label. |
| `disabled` | `DisabledCodexCompiler`  | Reports unavailable health and throws a typed `CODEX_DISABLED` setup error when compilation is attempted. It never returns fake success.                                               |

Replay is a transport for actual stored compiler evidence, not permission to
manufacture a trace. `replays/leakage-01/compiler` contains an authenticated
rejected run with two attempted repairs and a separate authenticated verified
run. It also contains the bounded generated files, prompt hashes, sanitized
events, command/exit evidence, and external verifier report.

## Live protocol

The implemented live client targets the installed Codex CLI App Server protocol and uses its stable stdio transport:

1. Spawn `codex app-server --stdio`.
2. Send `initialize` with CounterLab client information and explicit capabilities.
3. Send the `initialized` notification.
4. Send `thread/start` for the generation directory with `approvalPolicy: "never"`, `sandbox: "workspace-write"`, and an ephemeral thread.
5. Send `turn/start` with one bounded text prompt.
6. Runtime-validate JSONL responses and the notification shapes CounterLab consumes.
7. Stop on the matching `turn/completed`, timeout, protocol failure, server request, or early process exit.
8. Close stdin and terminate the child process; timed-out processes receive a forced cleanup fallback.

The client does not use the experimental App Server WebSocket transport.

When `CODEX_MODEL` is non-empty, it is sent to both `thread/start` and `turn/start`. When it is unset, the `model` field is omitted entirely so the installed CLI selects its current compatible default. `health()` checks the executable and returns its version or a typed unavailable result; it does not start a model turn.

Interactive App Server requests, including command or file-change approvals, are denied and terminate the compilation. CounterLab does not proxy an approval prompt to the learner during a compiler turn.

## Inputs sent to Codex

The lab compilation prompt contains only:

- the learner-approved Belief Test;
- the experiment-plan JSON Schema;
- public Concept Pack SDK documentation;
- a redacted fixture schema;
- approved evidence references;
- resource limits;
- exact permitted files; and
- exact permitted commands.

It does not intentionally include raw fixture rows, uploaded notebook bytes, secrets, hidden verifier source, held-out fixtures, or unrelated repository content. Server-side orchestration is responsible for constructing these sanitized inputs; the browser does not provide a filesystem path.

The live client starts the App Server with an environment allowlist containing process essentials such as `PATH`, `HOME`, `CODEX_HOME`, locale, terminal, and XDG settings. It does not forward `OPENAI_API_KEY`, `COUNTERLAB_SIGNING_KEY`, or arbitrary application environment variables to the App Server child.

## Permitted generated artifacts

Lab generation is rejected unless the requested file set is exactly:

```text
generated/<session-id>/
├── experiment-plan.json
├── artifact-adapter.py
└── public_tests.py
```

The host workspace validator subsequently requires exactly these three regular, non-symlink files, applies size and JSON-depth bounds, validates the plan contract, and runs the adapter AST policy before candidate execution.

Patch compilation is a separate compiler call with a separate generation directory. Its prompt permits only a named copy of the notebook and a named patch-metadata JSON file, limits changes to approved cell indexes, and explicitly forbids locating or overwriting the original upload.

## Browser-safe compiler events

`sanitizeAppServerMessage` is the only supported App Server-to-browser event boundary. It emits this narrow event set:

- plan summaries;
- changed file names and unified diffs;
- command summaries, bounded stdout/stderr excerpts, durations, exit codes, and status;
- structured verifier counterexamples containing invariant, observed value, and minimal counterexample;
- phase status; and
- final turn status.

Reasoning notifications, reasoning items, raw response items, agent-message deltas, completed free-form agent messages, tool arguments, arbitrary local paths, and unknown notification bodies are not emitted. File paths are reduced to safe file names. Known secret patterns are redacted. Plan text and command output are bounded to approximately 4 KiB, and unified diffs are bounded to 64 KiB.

The compiler returns an `AsyncIterable<CompilerEvent>`. A process-capable local HTTP orchestrator may serialize those sanitized events as server-sent events. The deployed Cloudflare Worker does not run Codex and therefore does not claim a live Codex SSE stream.

## Compile, verify, and repair

The local sequence is:

1. Create a fresh server-generated workspace for the session.
2. Compile the three permitted files.
3. Validate exact file membership, containment, content bounds, experiment-plan shape, and adapter AST policy on the host.
4. Execute only the prevalidated candidate in the constrained Docker runner.
5. Compute authoritative results with the fixed host kernel.
6. Run the frozen verifier outside the candidate workspace.
7. If rejected, reduce the verifier report to structured invariant names, observed values, expected values, and minimal counterexamples.
8. Send that structured feedback into repair attempt 1 or 2.
9. Stop after verification or two repairs. A rejected final candidate produces no verified lab result.

`RepairLabInput` accepts only repair attempt `1` or `2`, and the host `CompileVerifyOrchestrator` independently caps repairs at two. Repair prompts include the approved original inputs, previous artifact hashes, and sanitized verifier feedback; they do not include hidden verifier implementation details.

## Candidate execution boundary

Generated Python is not executed by the App Server client. After static validation, the local runner uses Docker with:

- no network;
- a read-only root filesystem;
- a non-root numeric user;
- all capabilities dropped and `no-new-privileges` enabled;
- no inherited credentials;
- read-only generated workspace and public fixture mounts;
- a writable output mount and bounded temporary directory; and
- CPU, wall-clock, memory, process, file-count, open-file, and output-size controls.

The host kernel and verifier are not mounted into the candidate container. The verifier recomputes numeric truth and active probes outside that container.

These controls reduce risk for the documented hackathon scope; they are not a formal sandbox proof.

## Cloudflare and local-runner split

The Cloudflare Vite Worker owns the edge-compatible product surface, D1-backed session state, notebook intake, sample/replay flow, and server-side GPT request when configured. Its health response explicitly reports live Codex, the native kernel, and the sandbox as `local-runner-required`.

For a live Cloudflare session, `/api/sessions/:sessionId/lab/compile` returns the typed `LOCAL_RUNNER_REQUIRED` error. Cloudflare does not silently substitute replay data for a requested live Codex run. Codex App Server, Python, Docker, Git/worktree isolation, and native local SQLite belong on the process-capable local runner.

## Local configuration

```dotenv
CODEX_MODEL=
COUNTERLAB_CODEX_MODE=replay
COUNTERLAB_SANDBOX_IMAGE=counterlab-runner:local
```

Live mode additionally requires:

- an installed compatible `codex` CLI on `PATH`;
- working Codex CLI authentication available through `CODEX_HOME`;
- Docker and the pinned local runner image; and
- the local orchestration service that creates isolated workspaces and invokes the host verifier.

Focused implementation checks are:

```bash
pnpm exec vitest run packages/codex-client/src/index.test.ts
pnpm exec tsc -p packages/codex-client/tsconfig.json --noEmit
PYTHONPATH=services/kernel/src:services/runner/src .venv/bin/python -m pytest services/runner/tests
```

## Honest current status

The stdio client, protocol validation, sanitizer, replay/disabled behavior,
constrained prompts, workspace policy, Docker execution, host pipeline, and
two-repair cap are implemented and covered by the release suite.

The stored evidence is deliberately unpolished: the first authenticated
`gpt-5.6-sol` run failed on an unsupported public SDK constructor. Repair 1
corrected that contract but created `__pycache__`; repair 2 did not remove the
existing directory, so the exact-file verifier rejected the run and no result
was released. A separate later authenticated run produced exactly three files,
reproduced the canonical result, passed 18 named invariants, and detected 12/12
published mutations. The UI says plainly that this is a later run, not repair
attempt 3.

The most important remaining isolation limitation is that
`AppServerCodexCompiler` starts App Server as a local host process with Codex's
`workspace-write` policy. The recorded run inspected global skill files outside
the generation directory. Consequently generation isolation is `PARTIAL` even
though post-generation candidate execution proves the hidden verifier and
held-out paths were not mounted. A future accepted live path must add an
OS-enforced generation boundary and demonstrate hidden-path denial.
