# CounterLab findings

## Requirements

- The repository must ship the complete leakage P0 before class-imbalance P0.5.
- The source of numeric truth is the fixed Python kernel; uploaded notebooks are parsed but never executed during intake.
- The user journey is claim, Belief Test, immutable prediction, constrained lab, verified results, revision, deterministic transfer, unlocked patch, Reasoning Diff, and Proof Bundle.
- Live GPT uses the official Responses API; live Codex uses App Server stdio JSONL. Missing credentials or runtime capability must become typed setup errors.
- Replay and Try Instantly must work without secrets and remain visibly honest.
- Cloudflare infrastructure is authorized and requested, while local Python/Codex execution still needs OS process isolation.

## Repository discovery

- Initial tree contained only `AGENTS.md` and `CounterLab_Codex_Master_Build_Prompt.md`.
- Git branch is `main`, with no commits yet; both initial files are untracked.
- Available primary runtimes: Node 26.2.0, npm 11.16.0, pnpm 11.12.0, Python 3.14.5, Docker 29.5.2, Codex CLI 0.144.4, Git 2.54.0.
- `wrangler` was not found as a direct executable during the first PATH audit; a project-local Wrangler dependency is the reproducible route.
- Python 3.14 is newer than many scientific-Python compatibility baselines, so dependency installation must be verified rather than assumed.
- Docker daemon access is working and reports server version 29.5.2.
- Git is configured with the user's identity (`Abhyudaya Baiju Tharakan`), so commits must preserve that configuration.
- NumPy and pandas are present globally; scikit-learn, pytest, and nbformat are not. The project still needs an isolated locked Python environment.
- Codex App Server defaults to `stdio://`, and the installed CLI can generate TypeScript bindings or JSON Schema with `codex app-server generate-ts` and `generate-json-schema`. This is safer than hand-maintaining protocol shapes.
- A fresh official Codex manual was cached at `/tmp/openai-docs-cache/codex-manual.md`; its App Server section is lines 10166-10437.
- The current official Structured Outputs guide recommends Responses `text.format` with native Zod SDK support and explicit refusal handling; it identifies `gpt-5.6` as the recommended new-project alias.
- The current model guide confirms `gpt-5.6` routes to `gpt-5.6-sol`, supports `reasoning.effort: medium`, and recommends a stable privacy-preserving `safety_identifier` for end-user apps.
- The official Responses reference exposes `store`, `safety_identifier`, `reasoning`, and structured `text` format fields. The implementation will still validate parsed output locally and resolve every model evidence reference against the Artifact Manifest.
- Codex App Server uses JSON-RPC-like messages without the `jsonrpc` header. Stable stdio is JSONL: `initialize` request, `initialized` notification, `thread/start`, `turn/start`, then streamed `item/*` and `turn/completed` notifications.
- Installed Codex 0.144.4 generated its own protocol bindings successfully. The client will validate the version-matched shapes it consumes and exclude reasoning-text notifications from browser events.

## Technical decisions

| Decision | Rationale |
|---|---|
| Use source-level packages under the requested monorepo layout | Keeps contracts, parser, proof, verifier, compiler, UI, and kernel boundaries reviewable. |
| Generate notebook stored outputs from the kernel | Prevents fabricated headline metrics and makes notebook evidence reproducible. |
| Hash canonical JSON with stable key ordering and normalized numeric values | Enables deterministic result and evidence-chain reproduction. |
| Keep hidden verifier and held-out data outside generated workspaces | Enforces the core authority boundary. |
| Deploy edge-safe replay/sample behavior to Cloudflare and gate local-only live capabilities | Honest alignment with Cloudflare Workers limitations. |

## Issues encountered

| Issue | Resolution |
|---|---|
| Skill instruction output truncation | Read every selected `SKILL.md` in separate bounded calls. |
| Findings patch targeted a template heading that did not exist | Inspected the actual file and applied the research notes under repository discovery. |

## Resources

- Product constitution: `AGENTS.md`
- Current build brief: `CounterLab_Codex_Master_Build_Prompt.md`
- OpenAI official docs and current Codex manual will be consulted before implementing external API/process protocols.
- Cloudflare developer docs and the installed Wrangler schema will be consulted before finalizing Worker/D1 configuration.
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI GPT-5.6 guide: https://developers.openai.com/api/docs/guides/latest-model.md
- Codex App Server manual: https://learn.chatgpt.com/docs/app-server.md

## Browser findings

- No browser run yet.
