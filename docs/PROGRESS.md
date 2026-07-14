# Progress

Updated: 2026-07-14

## Current status

The leakage P0 is complete for the deterministic learner/replay path and the
post-generation candidate boundary. GPT live mode now supports a provider-neutral
custom Responses base URL and was exercised end to end through the local Worker,
but the configured endpoint rejected the current credential with HTTP 401.
Runtime Codex has genuine rejected and verified evidence, while generation-time
host read isolation is now enforced by a Bubblewrap launch boundary. Credentials
are staged only for the App Server handshake, then revoked before the model turn;
the installed runtime completed a genuine reject-repair-verify run after that
revocation. This boundary remains version-sensitive and is not claimed as a
formal sandbox proof.
Class-imbalance P0.5 has not started because the constitution requires every
leakage gate—including the credentialed live Belief Test—to pass first.

The judged surface now uses a plain-first learning studio. The first visit says
what the product does, what the learner should do, and what they will learn in
ordinary language; one recommended three-minute lesson leads the page. The
four-stage rail reads “Your idea → Your prediction → What happened → Try it
again.” Exact analyst wording, run traces, tables, hashes, and reproduction
details remain available through closed disclosures. All displayed metrics
remain derived from the canonical payload.

## Acceptance matrix

| Gate                                                            | Status  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sample notebook parses without execution with stable references | pass    | `SUPPORTED`, five cells, file SHA `92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024`; parser and artifact tests pass.                                                                                                                                                                                                                                                                                                 |
| Leakage kernel produces a real discriminating gap               | pass    | Accuracy: random 0.984722, group 0.594444, identity ablation 0.673611 from 2,880 generated rows.                                                                                                                                                                                                                                                                                                                                      |
| Group split has zero entity overlap                             | pass    | Canonical result reports count/rate 0; random split overlaps 389 customers.                                                                                                                                                                                                                                                                                                                                                           |
| All published critical leakage mutations are rejected           | pass    | `./scripts/run-mutations.sh leakage`: 12/12 detected.                                                                                                                                                                                                                                                                                                                                                                                 |
| Deterministic canonical result hash                             | pass    | Kernel, row-order probe, Docker replay, and repeated generation reproduce `2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0`.                                                                                                                                                                                                                                                                                         |
| Complete deterministic learning loop                            | pass    | Claim through Reasoning Diff/Proof Bundle completes in the CloakBrowser Playwright path; refresh reconstructs state and no chart appears before verified results.                                                                                                                                                                                                                                                                     |
| Prediction immutability and legal state transitions             | pass    | API/unit/browser checks reject a second prediction and illegal/early result, transfer, and patch transitions.                                                                                                                                                                                                                                                                                                                         |
| Append-only event chain and replay                              | pass    | D1 trigger protection, hash-chain validation, Proof Bundle validation, refresh reconstruction, and persistent replay banner are tested.                                                                                                                                                                                                                                                                                               |
| GPT-5.6 Belief Test live path                                   | partial | Official Responses structured-output client, privacy identifier, `store: false`, local Zod/evidence validation, refusal/no-key states, and custom `/v1/responses` routing are tested. A real local Worker request reached the configured endpoint on 2026-07-14 and received HTTP 401; CounterLab returned typed provider-neutral `LIVE_UNAVAILABLE` without advancing state. A valid credential is still required to pass this gate. |
| Codex compile/verify/repair                                     | pass    | Credential-safe Bubblewrap launch, App Server handshake, pre-turn credential revocation, strict generated-file boundary, and host verifier were exercised in a genuine `gpt-5.6-sol` run. The first plan was rejected with a structured `experiment_plan_runs` counterexample; repair 1 passed the exact canonical result hash and 12/12 mutations. Unisolated launches still fail closed. This is not a formal sandbox proof.        |
| Candidate sandbox and hidden-mount boundary                     | pass    | Real Docker reproduction is no-network, non-root, read-only, capability-dropped, resource-bounded, credential-free, and does not mount verifier/held-out paths. This is not a formal sandbox proof.                                                                                                                                                                                                                                   |
| Transfer-gated verified patch                                   | pass    | Failure keeps patch locked; pass unlocks a copied-notebook patch with zero overlap and four unrelated source hashes unchanged.                                                                                                                                                                                                                                                                                                        |
| Unsupported notebook refusal                                    | pass    | Browser uploads a notebook with unsupported magic/network content, receives typed reasons, and cannot advance.                                                                                                                                                                                                                                                                                                                        |
| Required local scripts                                          | pass    | `test-all`, mutations, clean demo, session reproduction, patch replay, replay recording, and achieved-metrics generation execute successfully in the working checkout.                                                                                                                                                                                                                                                                |
| Full release check and secret scan                              | pass    | `./scripts/release-check.sh` passes tests, typecheck, production build, 12 mutations, Docker smoke/reproduction, patch replay, metrics generation, and a scan of every tracked file.                                                                                                                                                                                                                                                  |
| Fresh temporary clone acceptance                                | pass    | A no-local Git clone installed locked Node/Python dependencies, applied local D1 migration, ran `clean-demo.sh`, and passed the complete release check.                                                                                                                                                                                                                                                                               |
| Accessibility and responsive judged path                        | pass    | A 390×844 CloakBrowser run completes entirely by keyboard with reduced motion, visible semantic controls, and no horizontal overflow; primary text/status contrast pairs are unit-checked at ≥4.5:1.                                                                                                                                                                                                                                  |
| Cloudflare replay/sample deployment                             | pass    | Remote D1, R2, Worker/assets, health, plain-first Try Instantly, upload refusal, Replay, Proof Bundle, live capability boundary, and all nine production CloakBrowser paths pass at `https://counterlab.cserules.workers.dev`. The first-visit gate limits visible copy to fewer than 210 words, requires the primary lesson action in view, and rejects technical landing jargon. Version `faaf9347-2a8e-4260-8a23-afa958940f6f`.    |
| Class-imbalance P0.5                                            | not run | Deliberately deferred until the credentialed live Belief Test gate passes.                                                                                                                                                                                                                                                                                                                                                            |

## Latest verified suite

- Root Vitest: 104 tests passed.
- Web Vitest: 29 tests passed.
- Pytest kernel/runner: 98 tests passed.
- CloakBrowser Playwright: 9 judged-path tests passed locally and against
  Cloudflare production, including configured/missing live-capability states
  and mobile keyboard/reduced-motion completion. The audited landing is 193
  visible words and 1,318 pixels tall at 1440x1000, down from 283 words and
  1,908 pixels; the 390px layout has no horizontal overflow.
- Mutation matrix: 12/12 detected.
- Docker replay: canonical result and patch reproduced.

## Highest-risk remaining issue

The configured live Responses credential is still rejected with HTTP 401, so
production cannot complete a live Belief Test until a valid credential is
provided. The replay and sample paths are complete and do not pretend a live
request occurred. The credential-revocation Codex boundary is also tied to the
installed App Server authentication lifecycle and must be requalified after a
material Codex CLI protocol change.
