# CounterLab delivery plan

## Goal

Ship a locally runnable, judge-ready CounterLab P0 whose leakage experiment, learning loop, replay, transfer gate, patch, and proof bundle are backed by deterministic evidence, with live OpenAI and Codex paths that fail honestly when unavailable.

## Current phase

Phase 1 — deterministic evidence spine

## Phases

### Phase 0: Repository discovery and architecture

- [x] Read `AGENTS.md` and the user build brief.
- [x] Inspect repository contents, Git state, and primary runtimes.
- [x] Record initial constraints and milestone architecture.
- **Status:** complete

### Phase 1: Deterministic evidence spine

- [ ] Write failing Python and TypeScript contract tests.
- [ ] Implement fixture generation, safe parser, kernel, canonical hashes, verifier, and mutations.
- [ ] Generate the public notebook from computed output.
- [ ] Pass parser, kernel, determinism, verifier, and mutation gates.
- [ ] Commit as independently reviewable proof-spine slices.
- **Status:** in_progress

### Phase 2: Deterministic learning loop

- [ ] Implement contracts, state machine, SQLite event chain, replay, transfer, patch, reasoning diff, and proof bundle.
- [ ] Implement typed API routes and four-screen Next.js experience.
- [ ] Pass unit and focused browser tests for the instant and replay paths.
- **Status:** pending

### Phase 3: Live analyst and compiler integrations

- [ ] Implement current Responses API structured-output integration and local validation.
- [ ] Implement Codex App Server stdio compiler, replay, disabled mode, event sanitization, SSE, and bounded repair.
- [ ] Implement AST and sandbox enforcement with clear setup failures.
- **Status:** pending

### Phase 4: Transfer-gated patch and judge hardening

- [ ] Verify patch isolation and unrelated cell hashes.
- [ ] Add held-out variants, unsupported paths, accessibility, responsive polish, and Playwright coverage.
- [ ] Add class-imbalance P0.5 only if all leakage gates pass.
- **Status:** pending

### Phase 5: Cloudflare and release proof

- [ ] Use Cloudflare Workers/static assets and D1 for the deployed replay/sample surface where runtime constraints permit.
- [ ] Run clean-clone, mutation, replay, patch, browser, release, and secret-scan acceptance checks.
- [ ] Record actual metrics and publish/deploy only after local acceptance evidence.
- **Status:** pending

## Key questions

1. Can Python 3.14 install the locked pandas/scikit-learn stack, or is a compatible interpreter/uv environment needed?
2. Is Docker usable by the current user for sandbox checks?
3. Which currently documented Codex App Server JSONL methods match installed Codex CLI 0.144.4?
4. Can the full Next.js runtime deploy to Cloudflare, or should the deployed surface intentionally expose only verified replay/sample while live local compilation remains local-only?

## Decisions made

| Decision | Rationale |
|---|---|
| Proof spine before UI | Required acceptance order; prevents polished but unverified output. |
| Monorepo with pnpm and a Python package | Matches required boundaries and keeps TypeScript/Python truth ownership explicit. |
| Deterministic replay is a first-class path | Enables an honest no-secret judged path without fake live model activity. |
| Cloudflare hosts edge-compatible replay/sample infrastructure | Workers cannot spawn local Codex or execute the Python kernel; those capabilities remain explicitly local/live-only. |
| Industrial evidence-notebook aesthetic | Visually reinforces CI, lab notebooks, and falsifiable checks without generic dashboard styling. |

## Errors encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Initial combined skill read was truncated | 1 | Re-read each selected skill and RTK file separately before editing. |
| Findings patch expected a missing template heading | 1 | Inspected the actual file, then patched the existing sections. |

## Notes

- The user explicitly authorizes `build`, `dev`, local services, and Cloudflare infrastructure for this task, overriding the repository default prohibition.
- Never present replay as live or a stored metric as newly computed.
- Re-read this file before each milestone transition.
