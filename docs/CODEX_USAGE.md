# Runtime Codex usage

CounterLab uses Codex as a bounded Plan compiler. Codex proposes how to compose
registered experiments or repairs; it never owns numeric truth, learner transfer
scoring, or final verification.

## Product modes

| Mode            | Model calls                 | Meaning                                                                                         |
| --------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| Sample lesson   | None                        | Bundled approved evidence and fixed results; always labelled sample.                            |
| Live notebook   | New analyst and Codex calls | Artifact-specific Belief Spec, bounded scientific artifacts, fixed execution, patch, and proof. |
| Verified replay | None                        | Read-only reconstruction of stored public events/results with a persistent replay label.        |

No mode silently falls into another. Missing runner credentials or capability
returns a typed setup error.

## Hosted Plan compiler

The process-capable runner starts `codex app-server` and uses stable stdio JSONL:

1. `initialize`, then `initialized`;
2. one fresh thread and turn for the bounded scientific compile artifacts;
3. runtime validation and browser-safe event sanitization;
4. independent contract/IR verification and fixed candidate scoring outside
   Codex context;
5. at most two repairs using only structured counterexamples; and
6. a separate fresh thread for a Patch Plan after deterministic transfer passes.

The experimental App Server WebSocket transport is not on the critical path.
`CODEX_MODEL` is sent only when configured; otherwise App Server selects its
compatible default.

### Inputs

Codex receives only the approved Belief Spec, sanitized Artifact Manifest,
resolved evidence, selected Subject Pack capabilities/schema, resource limits,
and permitted outputs. It does not receive notebook bytes, raw rows, secrets,
hidden verifier source, mutation implementations, held-out fixtures, R2/D1
credentials, or unrelated files.

### Outputs

```text
discrimination-contract.json
experiment-ir.json
lab-scene.json
public-rationale.md
```

The separate patch turn is limited to `patch-plan.json` and
`public-rationale.md`. Schemas reject executable source, shell, SQL, arbitrary
formulas, imports, raw paths, network actions, and literal verified result
values. `lab-scene.json` and `public-rationale.md` describe presentation only
and cannot affect pass/fail.

The fixed scorer filters and selects only registered eligible experiments. The
independent verifier resolves every evidence reference, checks lineage and
registered operations, enforces controlled comparisons and resource limits, and
returns only invariant, observed, expected, and a minimal counterexample. A
rejected final candidate releases no result.

## Browser-safe event boundary

Only validated `PublicCompilerEvent` values are stored and streamed:

- job start and public plan summary;
- resolved evidence references;
- allowed file creation and bounded unified Plan diff;
- command label, exit code, duration, and short excerpt;
- structured verifier rejection/repair/verified status;
- fixed result hash; or
- typed public failure.

Private reasoning, raw App Server messages, arbitrary tool arguments, notebook
bytes, rows, local paths, environment variables, credentials, hidden tests, and
complete stdout/stderr are never browser event fields. Reconnect resumes from a
persisted cursor.

## Cloudflare runner authority

The Worker issues a short-lived signed job token authorizing one job, manifest
hash/input object, output prefix, callback, state version, and expiration. The
Container runner cannot query D1, list R2, mint tokens, or attach a result to a
session. It uploads scoped outputs and sends an idempotent callback; the Worker
re-hashes and independently verifies the Plan/result before advancing state.

The hosted runner executes only fixed Python operations. It does not execute
model-authored Python, and it does not require nested Docker. Missing binding,
credential, timeout, or process capability is a typed failure—not replay or
sample success.

## Advanced local adapter proof

The checked-in `leakage-01` replay also preserves the earlier local compiler
that produced `experiment-plan.json`, `artifact-adapter.py`, and
`public_tests.py`. That path applies exact-file and AST policy, then runs the
candidate in a no-network, non-root, read-only Docker boundary before host
verification. It remains useful security evidence but is not the hosted
critical path.

The first genuine stored run was rejected after two repairs and authorized no
result. A separate later run passed 18 invariants and 12/12 mutations; the UI
never calls it repair attempt 3. The original recorded App Server process had
partial read isolation, which remains disclosed in replay provenance. Current
advanced local launches fail closed without their OS boundary.

## Configuration

```dotenv
CODEX_MODEL=
COUNTERLAB_CODEX_MODE=replay
COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY=
COUNTERLAB_SANDBOX_IMAGE=counterlab-runner:local
```

Hosted live mode additionally needs the Container binding and runner-side Codex
credential. Advanced local mode needs a compatible `codex` CLI, local CLI
authentication, and Docker.

Focused checks:

```bash
pnpm exec vitest run packages/codex-client/src/index.test.ts
pnpm exec vitest run services/hosted-runner/src/job-processor.test.ts
pnpm exec vitest run apps/web/worker/runner-control-plane.test.ts
PYTHONPATH=services/kernel/src .venv/bin/python -m pytest \
  services/kernel/tests/test_plan_interpreter.py \
  services/kernel/tests/test_hosted_patch.py
```

The native scientific compile, fixed scorer, tri-state verdict, Boundary
authority, and Proof Capsule v2 are implemented and integration-tested in the
repository. A fresh public deployment and production live-artifact smoke remain
required before attributing those contracts to the public URL; historical
sample/replay artifacts retain their original labels and hashes.
