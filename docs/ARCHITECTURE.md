# Architecture

## Components and authority

| Component | Runtime | Responsibility |
| --- | --- | --- |
| `apps/web` | Cloudflare Vite Worker + React | UI, typed routes, D1 state, R2 private objects, optional GPT analyst |
| `packages/contracts` | TypeScript | Zod contracts, JSON Schema, shared result/state types |
| `packages/notebook-parser` | TypeScript | Non-executing intake and Artifact Manifest |
| `packages/belief-analyst` | TypeScript/server | Responses API structured Belief Test and deterministic approved fallback |
| `packages/session-core` | TypeScript | Legal transitions, immutable prediction, event chain |
| `packages/codex-client` | Local Node | App Server stdio, replay/disabled implementations, event sanitizer |
| `services/runner` | Local Python + Docker | Workspace/AST policy, candidate execution, repair cap |
| `services/kernel` | Local Python | Fixture, experiments, transfer, patch, canonical truth, verifier |
| `packages/proof-bundle` | TypeScript | Hash chain verification, Reasoning Diff, Proof Bundle |

## Request and evidence sequence

```text
Notebook -> parser -> Artifact Manifest -> D1/R2
Claim + manifest -> GPT/approved analyst -> Belief Test
Learner confirmation -> immutable Prediction Contract
Belief Test -> Codex compiler -> 3-file candidate
Candidate -> AST/exact-file policy -> Docker public tests
Declaration -> fixed host kernel -> frozen verifier
Verified result -> revision -> fixed forecasting transfer
TRANSFER_PASSED -> copied-notebook patch -> patch verifier
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

Workers can call the OpenAI Responses API server-side. They cannot spawn Codex,
Python, Docker, or native SQLite, so health and live compile routes expose the
local-runner boundary explicitly.

## Local process design

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
