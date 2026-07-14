# Progress

Updated: 2026-07-14

## Current status

The leakage P0 is complete for the deterministic learner/replay path and the
post-generation candidate boundary. GPT live mode is implemented but has not
been exercised with an API key. Runtime Codex has genuine rejected and verified
evidence, while generation-time host read isolation remains `PARTIAL`.
Class-imbalance P0.5 has not started because the constitution requires every
leakage gate—including generation isolation—to pass first.

## Acceptance matrix

| Gate | Status | Evidence |
| --- | --- | --- |
| Sample notebook parses without execution with stable references | pass | `SUPPORTED`, five cells, file SHA `92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024`; parser and artifact tests pass. |
| Leakage kernel produces a real discriminating gap | pass | Accuracy: random 0.984722, group 0.594444, identity ablation 0.673611 from 2,880 generated rows. |
| Group split has zero entity overlap | pass | Canonical result reports count/rate 0; random split overlaps 389 customers. |
| All published critical leakage mutations are rejected | pass | `./scripts/run-mutations.sh leakage`: 12/12 detected. |
| Deterministic canonical result hash | pass | Kernel, row-order probe, Docker replay, and repeated generation reproduce `2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0`. |
| Complete deterministic learning loop | pass | Claim through Reasoning Diff/Proof Bundle completes in the CloakBrowser Playwright path; refresh reconstructs state and no chart appears before verified results. |
| Prediction immutability and legal state transitions | pass | API/unit/browser checks reject a second prediction and illegal/early result, transfer, and patch transitions. |
| Append-only event chain and replay | pass | D1 trigger protection, hash-chain validation, Proof Bundle validation, refresh reconstruction, and persistent replay banner are tested. |
| GPT-5.6 Belief Test live path | partial | Official Responses structured-output client, privacy identifier, `store: false`, local Zod/evidence validation, refusal, and no-key states are tested; no real API call was made because `OPENAI_API_KEY` is absent. |
| Codex compile/verify/repair | partial | Authenticated `gpt-5.6-sol` traces contain one run rejected after two repairs and a separate verified run. Candidate passed 18 invariants/12 mutations, but host generation read isolation is `PARTIAL`. |
| Candidate sandbox and hidden-mount boundary | pass | Real Docker reproduction is no-network, non-root, read-only, capability-dropped, resource-bounded, credential-free, and does not mount verifier/held-out paths. This is not a formal sandbox proof. |
| Transfer-gated verified patch | pass | Failure keeps patch locked; pass unlocks a copied-notebook patch with zero overlap and four unrelated source hashes unchanged. |
| Unsupported notebook refusal | pass | Browser uploads a notebook with unsupported magic/network content, receives typed reasons, and cannot advance. |
| Required local scripts | pass | `test-all`, mutations, clean demo, session reproduction, patch replay, replay recording, and achieved-metrics generation execute successfully in the working checkout. |
| Full release check and secret scan | pass | `./scripts/release-check.sh` passes tests, typecheck, production build, 12 mutations, Docker smoke/reproduction, patch replay, metrics generation, and a scan of every tracked file. |
| Fresh temporary clone acceptance | pass | A no-local Git clone installed locked Node/Python dependencies, applied local D1 migration, ran `clean-demo.sh`, and passed the complete release check. |
| Accessibility and responsive judged path | pass | A 390×844 CloakBrowser run completes entirely by keyboard with reduced motion, visible semantic controls, and no horizontal overflow; primary text/status contrast pairs are unit-checked at ≥4.5:1. |
| Cloudflare replay/sample deployment | pass | Remote D1 migration, R2 binding, Worker/assets, health, Try Instantly, upload refusal, Replay, Proof Bundle, and production CloakBrowser paths pass at `https://counterlab.cserules.workers.dev`; version `8ff021f8-2b1e-46d8-9d3a-f86e6c4e1a0c`. |
| Class-imbalance P0.5 | not run | Deliberately deferred until the partial generation-isolation leakage gate passes. |

## Latest verified suite

- Root Vitest: 78 tests passed.
- Web Vitest: 20 tests passed.
- Pytest kernel/runner: 98 tests passed.
- CloakBrowser Playwright: 7 judged-path tests passed locally; the same judged
  flows, including mobile keyboard/reduced-motion completion, pass against the
  Cloudflare production URL.
- Mutation matrix: 12/12 detected.
- Docker replay: canonical result and patch reproduced.

## Highest-risk remaining issue

The host Codex App Server process could inspect global skill files outside the
generation directory. The next security milestone is an OS-enforced generation
container or equivalent boundary that mounts only the approved prompt/workspace
and necessary authentication material, followed by a live hidden-path denial
test.
