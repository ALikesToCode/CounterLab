# Architecture

## Components and authority

| Component                  | Runtime                        | Responsibility                                                                           |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| `apps/web`                 | Cloudflare Vite Worker + React | UI, typed routes, D1 state, R2 private objects, optional GPT analyst                     |
| `packages/contracts`       | TypeScript                     | Zod contracts, JSON Schema, shared result/state types                                    |
| `packages/notebook-parser` | TypeScript                     | Non-executing intake and Artifact Manifest                                               |
| `packages/belief-analyst`  | TypeScript/server              | Responses API structured Belief Spec and deterministic approved fallback                 |
| `packages/session-core`    | TypeScript                     | Legal transitions, immutable prediction, event chain                                     |
| `packages/codex-client`    | Container/local Node           | App Server stdio, bounded scientific compiler, replay/disabled clients, sanitizer        |
| `services/hosted-runner`   | Cloudflare Container           | Scoped jobs, bounded artifacts, repairs, fixed-kernel/patch process bridge               |
| `services/runner`          | Advanced local Python + Docker | Legacy adapter workspace/AST policy and candidate execution                              |
| `services/kernel`          | Container/local Python         | Both Subject Pack fixtures, fixed operations, Boundary, transfer, patch, canonical truth |
| `packages/plan-verifier`   | Worker                         | Fixed candidate scorer and independent contract/IR/result/patch invariants               |
| `packages/proof-bundle`    | TypeScript                     | Hash chain verification, Reasoning Diff, Proof Bundle                                    |
| `packages/proof-capsule`   | TypeScript                     | Native Proof Capsule v2 archive and semantic authority                                   |

The React shell keeps learner actions in fixed components. `json-render` may
compose a read-only proof summary from already-sanitized public events using a
closed component catalogue and an empty action registry. Generated layout has
no transition, verifier, kernel, or patch authority.

## Request and evidence sequence

```text
Notebook -> parser -> Artifact Manifest -> D1/R2
Question + manifest -> GPT/approved analyst -> Belief Spec
Learner confirmation -> immutable Prediction
Belief Spec -> Codex -> Discrimination Contract + Experiment IR + scene/rationale
bounded candidates -> fixed scorer -> selected Experiment IR
selected IR -> independent verification -> fixed Subject Pack kernel
fixed result -> epistemic verifier -> SUPPORTS | INCONCLUSIVE | REJECTED
verified result -> fixed Boundary Map -> learner revision -> fixed transfer
TRANSFER_PASSED -> source-free Patch Plan -> copied-notebook fixed patch -> verifier
native evidence chain -> Reasoning Diff v2 + Proof Capsule v2
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

The Container starts Codex App Server over stable stdio JSONL. The scientific
compile may write only `discrimination-contract.json`, `experiment-ir.json`,
`lab-scene.json`, and `public-rationale.md`; the separate repair turn may write
only `patch-plan.json` and `public-rationale.md`. Typed artifacts contain
registered operation IDs and lineage—never executable code or commands. The
fixed scorer, kernel, verifier, and patch engine run outside Codex's decision
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

Every scientific-state mutation appends a canonical Evidence Event with
sequence, hashes, previous hash, actor, timing/model/commit fields where
available, and concise payload. Native sessions produce Proof Capsule v2;
historical sample and replay may retain Proof Bundle contracts. Either is called
signed only when the configured key actually produces a signature. Privacy-safe
learner interaction records use a separate append-only store and do not enter
evidence authority.

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

## v5.1 production boundary

Belief Spec v2, Experiment IR v5, the fixed discrimination scorer, epistemic
tri-state verdict, Boundary Map, scientific-engine registry, Reasoning Diff v2,
and Proof Capsule v2 are implemented and locally integration-tested. They have
not completed the exact-source production qualification described in
`docs/PROGRESS.md`. Existing deployed and replayed Belief Test, Experiment Plan,
binary-verifier, and Proof Bundle artifacts remain readable through adapters and
retain their historical hashes. Local implementation evidence must not be
described as current public deployment authority.
