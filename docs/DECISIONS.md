# Decisions

## 2026-07-14 — Establish authority boundaries before product UI

The first implementation milestone is the deterministic leakage evidence spine. No full product UI will be started until the public fixture, safe parser, fixed kernel, canonical hashes, external verifier, and published mutation matrix pass their gates. This keeps visual presentation downstream of verified numeric truth.

## 2026-07-14 — Split local live runtime from Cloudflare replay runtime

CounterLab's complete live path needs Python and Codex child processes with OS isolation. The deployed Cloudflare surface will support edge-compatible sample/replay behavior and persistence; local-only live features will expose a typed availability result instead of fake success. A separately hosted compute service will not be invented solely to erase this platform boundary.

The concrete Cloudflare target is Workers via OpenNext, with D1 for relational session/event state and R2 for notebooks, patch copies, replays, and Proof Bundles. Cloudflare's `nodejs_compat` exposes some Node APIs, but child processes and native SQLite are non-functional stubs; this is an authority boundary, not an implementation gap to hide.

## 2026-07-14 — Generate Codex wire types from the installed CLI

The live compiler will follow the stable App Server stdio JSONL lifecycle and validate only the message shapes CounterLab consumes. Version-specific types/schema will be generated from the installed Codex CLI during development and protocol checks. Browser relay code will discard reasoning items and reasoning notifications, use completed items as authority, truncate command output, and omit the model field when `CODEX_MODEL` is unset so App Server selects its current compatible default.

## 2026-07-14 — Use an evidence-notebook visual language

The interface will feel like an editorial lab notebook crossed with a CI report: warm paper surfaces, navy evidence rails, precise monospaced provenance, blue learner actions, purple hypotheses, aqua verification, gold prediction/patch state, and red only for rejected invariants. Motion will be restrained and values will never animate before verified payloads exist.

## 2026-07-14 — Freeze leakage fixture seed 1729 after gate evidence

The public fixture is frozen at 480 customers with six observations each. In the locked environment it produces a 0.390278 random-versus-group accuracy gap and a 0.311111 random-versus-ablation gap without hardcoded metrics. Seed, fixture hash, feature fingerprints, split provenance, and result hash are part of the canonical payload. Exact floating-point hashes remain environment-sensitive, so reproducibility claims are tied to the locked dependency set.

## 2026-07-14 — Distinguish core verifier truth from OS probe evidence

The Milestone 1 verifier can verify canonical numeric/provenance/chart/control invariants and reject 12 seeded mutations. It validates OS network/resource/isolation evidence when attached, but does not create the sandbox itself. Until Milestone 4 supplies those probes, reports must preserve the listed limitations and the product must not imply that kernel verification alone proves sandbox enforcement.
