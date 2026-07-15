# Architecture

## Components and authority

| Component                  | Runtime                        | Responsibility                                                             |
| -------------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `apps/web`                 | Cloudflare Vite Worker + React | UI, typed routes, D1 state, R2 private objects, optional GPT analyst       |
| `packages/contracts`       | TypeScript                     | Zod contracts, JSON Schema, shared result/state types                      |
| `packages/notebook-parser` | TypeScript                     | Non-executing intake and Artifact Manifest                                 |
| `packages/belief-analyst`  | TypeScript/server              | Responses API structured Belief Test and deterministic approved fallback   |
| `packages/session-core`    | TypeScript                     | Legal transitions, immutable prediction, event chain                       |
| `packages/codex-client`    | Container/local Node           | App Server stdio, hosted Plan compiler, replay/disabled clients, sanitizer |
| `services/hosted-runner`   | Cloudflare Container           | Scoped jobs, Plan files, repairs, fixed-kernel/patch process bridge        |
| `services/runner`          | Advanced local Python + Docker | Legacy adapter workspace/AST policy and candidate execution                |
| `services/kernel`          | Container/local Python         | Both concept fixtures, fixed Plans, transfer, patch, canonical truth       |
| `packages/plan-verifier`   | Worker                         | Independent Plan/result/Patch Plan invariants                              |
| `packages/proof-bundle`    | TypeScript                     | Hash chain verification, Reasoning Diff, Proof Bundle                      |

The React shell keeps learner actions in fixed components. `json-render` may
compose a read-only proof summary from already-sanitized public events using a
closed component catalogue and an empty action registry. Generated layout has
no transition, verifier, kernel, or patch authority.

## Request and evidence sequence

```text
Notebook -> parser -> Artifact Manifest -> D1/R2
Claim + manifest -> GPT/approved analyst -> Belief Test
Learner confirmation -> immutable Prediction Contract
Belief Test -> Codex compiler -> source-free Experiment Plan
Plan -> independent verifier -> fixed concept interpreter
Verified result -> independent result verifier
Verified result -> revision -> fixed forecasting transfer
TRANSFER_PASSED -> source-free Patch Plan -> copied-notebook fixed patch -> verifier
Evidence chain -> Reasoning Diff + Proof Bundle
```

No chart is rendered until the session has a schema-valid
`VerifiedResultSet`. A rejected compiler run cannot call the experiment-result
transition.

## Cloudflare design

The official `@cloudflare/vite-plugin` builds the React assets and Worker API as
one deployment. D1 holds sessions, artifact manifests, state payloads, and
append-only events. Database triggers reject updates/deletes to evidence events.
Worker writes use D1 batches for state/event atomicity. R2 stores notebook bytes
and patch copies outside public assets.

Workers can call a configured Responses-compatible API server-side. Process work
is dispatched to a Container-backed Durable Object; the Worker itself never
spawns Codex or Python. D1 runner jobs use optimistic versions, semantic
request identity, idempotent callbacks, scoped cancellation, and recoverable
dispatch acknowledgement. Short-lived P-256 tokens bind one job to one
manifest/input object, purpose, origin, output prefix, callback, state version,
and expiration. The Worker retains the private key; the Container receives only
the public verification key. Sanitized public events are append-only and
reconnect from a persisted browser cursor.

The Container starts Codex App Server over stable stdio JSONL. Codex can write
only `experiment-plan.json`, `patch-plan.json`, and `public-rationale.md`. The
JSON Plans contain registered operation IDs and lineage—never executable code or
commands. The fixed kernel and patch engine run outside Codex's decision
authority. Container disk is ephemeral; authoritative inputs and outputs are
hash-bound in R2/D1.

Runner callbacks additionally carry private operational measurements: queue and
phase durations, repairs, current-turn token usage, failure code, concept pack,
and support state. A secret-protected Worker endpoint aggregates those values
without returning job, session, artifact, notebook, endpoint, or credential
identifiers. Public compiler events never include token accounting.

## Advanced local adapter proof

The separately labelled advanced local proof retains the adapter-code compiler.
`AppServerCodexCompiler` performs initialize/initialized, thread/start, and
turn/start over stable stdio JSONL. It validates consumed messages and drops
reasoning/prose. Workspace validation requires exactly three regular files and
applies a deny-by-default adapter AST policy.

Docker candidate execution mounts only a read-only validated workspace, the
public fixture, and an output directory. The host kernel and verifier are never
candidate mounts. The host recomputes truth from the declaration and runs active
mutations outside the candidate container.

## Persistence and replay

Every mutation appends a canonical Evidence Event with sequence, hashes,
previous hash, actor, timing/model/commit fields where available, and concise
payload. Proof Bundles are integrity-hashed; they are called signed only when
`COUNTERLAB_SIGNING_KEY` produces an HMAC.

The checked-in replay keeps raw evidence files, a compact browser summary, real
model/Codex versions, result/adapter hashes, and a visible limitation: host
generation isolation was partial. Replay never invokes a model.

That limitation belongs to the advanced local adapter proof and its recorded
replay. Hosted Studio uses source-free Plans in the dedicated runner plane; it
does not silently route through the adapter workspace.

New advanced-local App Server launches require an injected OS boundary and fail
closed without one. The Bubblewrap probe verifies the intended filesystem
shape. Hosted source-free compilation instead stages credentials for App Server
initialization, revokes them before `thread/start`, and never exposes signing or
model credentials to generated child commands.

## v5.1 migration boundary

The deployed architecture above currently uses Belief Test, Experiment Plan,
binary Plan verification, and Proof Bundle contracts. Belief Spec v2,
Experiment IR v5, the fixed discrimination scorer, epistemic tri-state verdict,
Boundary Map, scientific-engine registry, and Proof Capsule v2 are additive
versioned migrations. Existing signed artifacts remain readable through
adapters; documentation must not imply those pending contracts already own
production authority.
