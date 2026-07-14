# Progress

Updated: 2026-07-14

## Current status

Milestone 1 is complete with local evidence. Milestone 2, the deterministic learning loop and judge-facing sample/replay path, is in progress.

## Acceptance matrix

| Gate | Status | Evidence |
|---|---|---|
| Sample notebook parses without execution with stable references | pass | Real sample returned `SUPPORTED`, 5 cell manifests, file SHA `92ba6389...`; parser tests 14/14 passed. |
| Leakage kernel produces a real discriminating gap | pass | Accuracy: random 0.984722, group 0.594444, identity ablation 0.673611. |
| Group split has zero entity overlap | pass | Kernel output and focused tests report `{count: 0, rate: 0.0}`. |
| All published leakage mutations are rejected | pass | `./scripts/run-mutations.sh leakage`: 12/12 detected. |
| Deterministic canonical result hash | pass | Repeated and row-shuffled runs both produce `2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0`. |
| Complete deterministic learning loop | not run | Milestone 2 has not started. |
| GPT-5.6 Belief Test live path | not run | Milestone 3 has not started. |
| Codex compile/verify/repair live or typed setup error | not run | Milestone 4 has not started. |
| Transfer-gated verified patch | not run | Milestone 5 has not started. |
| Full test and clean-demo scripts | partial | `scripts/test-all.sh` passes Milestone 1; clean-demo is not implemented yet. |
| Cloudflare replay/sample deployment | not run | Local acceptance comes first. |

## Detected environment

- Node.js 26.2.0 and pnpm 11.12.0
- Python 3.14.5
- Docker 29.5.2 client
- Codex CLI 0.144.4
- Empty Git history on `main`
