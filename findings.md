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
- Current Cloudflare guidance provides a first-party `@cloudflare/vite-plugin` path for a React SPA and Worker API in one deployment. It runs the Worker locally in `workerd`, builds frontend assets, and supports Worker bindings.
- The Worker can host the judge UI, route handlers, replay, GPT calls, static assets, D1 session/event data, and R2 artifact objects. `nodejs_compat` does not provide functional child processes or native SQLite.
- Runtime Codex, Docker, Git worktrees, and the Python/scikit-learn kernel must remain on a process-capable local runner unless a separate authenticated runner is intentionally configured. The deployed app will report that boundary explicitly.
- pnpm 11 replaces the removed `onlyBuiltDependencies` setting with an `allowBuilds` map and treats unreviewed install scripts as errors by default.
- Milestone 1 seed 1729 produces 2,880 rows across 480 customers. Computed accuracies are 0.984722 random row split, 0.594444 customer-group split, and 0.673611 identity ablation.
- The random test set overlaps 389 customer identities (rate 1.0); customer-group overlap is exactly zero.
- Canonical result hash is `2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0` in the locked environment.
- Generated notebook SHA-256 is `92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024`; safe intake returns `SUPPORTED`, five cells, and the stored accuracy/AUC evidence.
- The published verifier matrix detects 12/12 seeded critical mutations. OS/network/resource/isolation probes are validated when attached but are not yet themselves established by the Milestone 1 process.
- The authenticated App Server evidence contains one run rejected after two
  repairs and a separate later verified run. The verified adapter hash is
  `1b5cb8d48621372ea6fb0894114cd6054046481e1f0764a2c8a49126e6504adb`.
- The host generation trace inspected global skill files outside the generation
  directory. Generation isolation is therefore `PARTIAL`; candidate execution
  isolation remains independently verified.

## Technical decisions

| Decision | Rationale |
|---|---|
| Use source-level packages under the requested monorepo layout | Keeps contracts, parser, proof, verifier, compiler, UI, and kernel boundaries reviewable. |
| Generate notebook stored outputs from the kernel | Prevents fabricated headline metrics and makes notebook evidence reproducible. |
| Hash canonical JSON with stable key ordering and normalized numeric values | Enables deterministic result and evidence-chain reproduction. |
| Keep hidden verifier and held-out data outside generated workspaces | Enforces the core authority boundary. |
| Deploy edge-safe replay/sample behavior to Cloudflare and gate local-only live capabilities | Honest alignment with Cloudflare Workers limitations. |
| Use React + Vite with the Cloudflare Vite plugin, D1, and R2 | Follows the user's Vite preference and the current first-party Cloudflare full-stack React path while retaining the product's relational/artifact persistence split. |

## Issues encountered

| Issue | Resolution |
|---|---|
| Skill instruction output truncation | Read every selected `SKILL.md` in separate bounded calls. |
| Findings patch targeted a template heading that did not exist | Inspected the actual file and applied the research notes under repository discovery. |
| pnpm 11 ignored required native dependency builds | Its current warning says package-level `pnpm.onlyBuiltDependencies` is ignored; moved the narrow allowlist to `pnpm-workspace.yaml`. |
| pnpm workspace allowlist still failed | Current pnpm 11 docs show `onlyBuiltDependencies` was removed and replaced by `allowBuilds`; approved only esbuild, sharp, and workerd. |
| Cloudflare Vite transitive declarations conflict with TypeScript 7 and Zod 4 | Kept source checking strict while enabling `skipLibCheck` only for the web app; runtime/build verification remains authoritative for the external toolchain declarations. |

## Resources

- Product constitution: `AGENTS.md`
- Current build brief: `CounterLab_Codex_Master_Build_Prompt.md`
- OpenAI official docs and current Codex manual will be consulted before implementing external API/process protocols.
- Cloudflare developer docs and the installed Wrangler schema will be consulted before finalizing Worker/D1 configuration.
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI GPT-5.6 guide: https://developers.openai.com/api/docs/guides/latest-model.md
- Codex App Server manual: https://learn.chatgpt.com/docs/app-server.md
- pnpm 11 build policy: https://pnpm.io/settings#allowbuilds
- Cloudflare Next.js Workers guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- Cloudflare Vite plugin: https://developers.cloudflare.com/workers/vite-plugin/
- Cloudflare React + Vite guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- Cloudflare D1 migrations: https://developers.cloudflare.com/d1/reference/migrations/
- Cloudflare Node.js compatibility: https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Browser findings

- The judged path was completed with Playwright using
  `/home/mysterious/.local/bin/cloakbrowser-chromium`.
- The browser suite covers the full instant flow, refresh reconstruction,
  persistent replay labelling, immutable prediction, result gating, transfer
  fail/pass lock behavior, Proof Bundle validation, missing live capability,
  and unsupported upload refusal.
