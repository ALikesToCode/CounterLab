# CounterLab build plan

## Current repository state

On 2026-07-14 the repository had no commits and contained only the constitution (`AGENTS.md`) and the supplied master brief. There was no package manifest, Python project, application, fixture, test, script, database, replay, or deployment configuration to preserve.

Detected runtimes:

- Node.js 26.2.0, npm 11.16.0, pnpm 11.12.0
- Python 3.14.5
- Docker 29.5.2
- Codex CLI 0.144.4
- Git 2.54.0

Wrangler was not present as a direct PATH executable in the first audit. The project will lock Wrangler as a local dependency and use `pnpm exec wrangler`. Docker availability and Python scientific-package compatibility still require runtime verification.

The user explicitly authorized build, dev-server, local-service, and Cloudflare actions for this task. External deployment remains contingent on the project passing local acceptance checks.

## Architecture

The implementation uses the requested monorepo boundaries:

- `apps/web`: strict React/TypeScript product surface built with Vite and the official Cloudflare Vite plugin, with a co-deployed Worker API.
- `services/kernel`: deterministic Python fixtures, metrics, transfer scoring, and canonical result serialization.
- `packages/contracts`: Zod schemas, JSON Schema export, state transitions, and typed API errors.
- `packages/notebook-parser`: non-executing notebook intake, output sanitization, stable evidence references, and support classification.
- `packages/codex-client`: App Server stdio client, replay and disabled implementations, and event sanitization.
- `packages/verifier`: host-side invariant checks and generated-adapter policy integration.
- `packages/proof-bundle`: append-only event hashing, replay reconstruction, and export.
- `packages/ui`: accessible evidence, status, chart/table, diff, and stepper components.
- `concept-packs/leakage`: public SDK/fixture contract, hidden verifier, and deterministic forecasting transfer.
- `fixtures`, `evals`, and `replays`: generated public assets, held-out inputs, seeded mutations, and genuine recorded evidence.
- `data`: SQLite and private local artifacts outside the web root.

The Cloudflare deployment uses the first-party `@cloudflare/vite-plugin`
full-stack React path. D1 stores sessions, jobs, callbacks, and append-only
events; R2 stores private notebook bytes, scoped input bundles, Plans, results,
patch copies, and Proof Bundles. A Container-backed Durable Object supplies the
process plane: Codex App Server uses stdio JSONL, while fixed Python interprets
source-free Plans and creates copied-notebook patches. The Worker retains final
Plan/result verification authority and issues short-lived single-job tokens.

Hosted generation never executes model-authored Python. Codex writes only
`experiment-plan.json`, `patch-plan.json`, and display-only
`public-rationale.md`; registered fixed operations own numeric truth. The older
adapter compiler remains a separately labelled advanced local proof.

## Milestone gates

1. **Deterministic evidence spine** — stable notebook hashes; real random/group/ablation gap; zero group overlap; equal canonical hashes; all critical mutations caught.
2. **Deterministic learning loop** — four screens; immutable prediction; verified-only result rendering; transfer lock; patch copy; Reasoning Diff; event replay and Proof Bundle.
3. **GPT-5.6 analyst** — current official Responses API structured output; local schema/evidence validation; honest no-key fallback.
4. **Codex compile/verify/repair** — App Server stdio handshake; bounded generated files; sanitized SSE; AST and OS policy; at most two repairs; replay/disabled paths.
5. **Transfer-gated patch** — separate copied notebook; narrow source-cell diff; no collateral hashes; deterministic patch verification.
6. **Judge hardening and release** — held-out variants, unsupported cases, Playwright, accessibility, clean-clone scripts, release metrics, Cloudflare deployment. Class imbalance starts only if every leakage gate passes.

## Test and commit strategy

Each behavioral slice begins with a focused failing test, followed by the minimum implementation and focused green verification. Logical slices are committed separately after their staged diff and tests are inspected. Before release, the full required script matrix, browser paths, replay, patch, clean clone, and secret scan are rerun from fresh state.

## Environment constraints

- Scientific Python dependencies must be proven compatible with Python 3.14 or installed with a compatible local interpreter.
- Codex live mode depends on installed CLI authentication and the documented App Server protocol.
- GPT live mode requires a server-side `OPENAI_API_KEY`. An optional
  `OPENAI_BASE_URL` selects a compatible `/v1/responses` endpoint without
  changing product copy, evidence, or provider authority.
- Hardened generated-code execution requires a working Docker daemon or a documented equivalent local boundary.
- Cloudflare Workers do not spawn Codex or Python directly; the bound Container
  is the explicit process boundary. Missing Container, model, or signing
  configuration fails with a typed live-unavailable state and never silently
  selects sample or replay.
- The first-party Cloudflare Vite plugin can run configured Containers during
  local Vite development when a Docker-compatible engine is available. Remote
  runner callbacks require HTTPS; loopback HTTP is accepted only for local
  runner development.
- The current worktree has not built or deployed the upgraded Container because
  the active repository instructions prohibit this agent from running `build`
  or `dev` without user action.

## 2026-07-14 journey refinement

The judged journey now treats navigation as part of evidence integrity:

- Instant/live refresh restores the current server-authoritative state instead
  of resetting the learner or reconstructing editable client state.
- Replay refresh restores a labelled browser checkpoint without presenting it as
  a new live session.
- Completed stages are read-only review destinations; future stages remain
  unavailable and the current stage returns to the active task.
- Start over is explicit, clears CounterLab browser keys, and creates no hidden
  rewrite of the prior evidence chain.
- The final learning sequence is split into evidence and revision, fixed
  transfer, patch unlock, and completion/Reasoning Diff phases. Each transition
  has a focused browser assertion for viewport reset and result gating.
