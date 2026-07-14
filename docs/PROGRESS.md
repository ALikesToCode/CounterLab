# Progress

Updated: 2026-07-15

## Current status

The leakage P0 is complete for the deterministic learner/replay path, the live
Belief Test, and the post-generation candidate boundary. GPT live mode supports
a provider-neutral custom Responses base URL and, after the credential was
corrected, produced a schema-valid, evidence-resolving Belief Test through both
the local Worker and deployed Cloudflare Worker. Runtime Codex has genuine
rejected and verified evidence, while generation-time host read isolation is
enforced by a Bubblewrap launch boundary. Credentials are staged only for the
App Server handshake, then revoked before the model turn; the installed runtime
completed a genuine reject-repair-verify run after that revocation. This boundary
remains version-sensitive and is not claimed as a formal sandbox proof.
Class-imbalance P0.5 has not started; the completed leakage gates now make that
the next eligible concept slice rather than a blocker on the leakage release.

The hosted own-notebook leakage path is now complete in the repository through
artifact-specific patch download and Proof Bundle v2. Codex generates strict,
source-free Experiment and Patch Plans; the Worker independently verifies both;
the fixed Python kernel and patch engine own numeric truth and notebook edits.
The source notebook remains sealed from Codex and is released only to the fixed
patch process after the Patch Plan passes. Production deployment and one real
public runner smoke remain not run for this new slice.

The judged surface now uses a plain-first learning studio. The first visit asks
one concrete question and one recommended three-minute lesson leads the page.
Each phase keeps one learner decision in focus; evidence, forecasting transfer,
patch unlock, and the Reasoning Diff no longer accumulate into one long screen.
The four-stage lesson map reads “Question → Your guess → Fair test → Learn &
apply.” Completed steps open as read-only review pages, refresh restores the
canonical session or replay checkpoint, and a persistent Start over control
clears the saved lesson. Exact analyst wording, run traces, tables, hashes, and
reproduction details remain available through closed disclosures. All displayed
metrics remain derived from the canonical payload.

## Acceptance matrix

| Gate                                                            | Status  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sample notebook parses without execution with stable references | pass    | `SUPPORTED`, five cells, file SHA `92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024`; parser and artifact tests pass.                                                                                                                                                                                                                                                                                          |
| Leakage kernel produces a real discriminating gap               | pass    | Accuracy: random 0.984722, group 0.594444, identity ablation 0.673611 from 2,880 generated rows.                                                                                                                                                                                                                                                                                                                               |
| Group split has zero entity overlap                             | pass    | Canonical result reports count/rate 0; random split overlaps 389 customers.                                                                                                                                                                                                                                                                                                                                                    |
| All published critical leakage mutations are rejected           | pass    | `./scripts/run-mutations.sh leakage`: 12/12 detected.                                                                                                                                                                                                                                                                                                                                                                          |
| Deterministic canonical result hash                             | pass    | Kernel, row-order probe, Docker replay, and repeated generation reproduce `2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0`.                                                                                                                                                                                                                                                                                  |
| Complete deterministic learning loop                            | pass    | Claim through Reasoning Diff/Proof Bundle completes in the CloakBrowser Playwright path; refresh reconstructs state and no chart appears before verified results.                                                                                                                                                                                                                                                              |
| Prediction immutability and legal state transitions             | pass    | API/unit/browser checks reject a second prediction and illegal/early result, transfer, and patch transitions.                                                                                                                                                                                                                                                                                                                  |
| Append-only event chain and replay                              | pass    | D1 trigger protection, hash-chain validation, Proof Bundle validation, refresh reconstruction, and persistent replay banner are tested.                                                                                                                                                                                                                                                                                        |
| GPT-5.6 Belief Test live path                                   | pass    | Official Responses structured-output client, privacy identifier, `store: false`, local Zod/evidence validation, refusal/no-key states, and custom `/v1/responses` routing are tested. A real deployed request on 2026-07-14 returned `BELIEF_TEST_PROPOSED`, concept `entity_leakage`, three resolving evidence references, and `requiresLearnerConfirmation: true`.                                                           |
| Codex compile/verify/repair                                     | pass    | Credential-safe Bubblewrap launch, App Server handshake, pre-turn credential revocation, strict generated-file boundary, and host verifier were exercised in a genuine `gpt-5.6-sol` run. The first plan was rejected with a structured `experiment_plan_runs` counterexample; repair 1 passed the exact canonical result hash and 12/12 mutations. Unisolated launches still fail closed. This is not a formal sandbox proof. |
| Candidate sandbox and hidden-mount boundary                     | pass    | Real Docker reproduction is no-network, non-root, read-only, capability-dropped, resource-bounded, credential-free, and does not mount verifier/held-out paths. This is not a formal sandbox proof.                                                                                                                                                                                                                            |
| Transfer-gated verified patch                                   | pass    | Failure keeps patch locked; pass unlocks a copied-notebook patch with zero overlap and four unrelated source hashes unchanged.                                                                                                                                                                                                                                                                                                 |
| Hosted own-notebook leakage loop                                | pass    | Worker/runner integration tests complete artifact-specific Plan compile, independent verification, fixed-kernel execution, transfer, source-sealed Patch Plan, fixed patch, private download, Reasoning Diff, and Proof Bundle v2 without substituting sample result or patch authority.                                                                                                                                         |
| Hosted runner production deployment                             | not run | The updated Container image builds during `test-all.sh`; the new image/control-plane version has not yet been deployed and smoke-tested at the public URL.                                                                                                                                                                                                                                                                      |
| Unsupported notebook refusal                                    | pass    | Browser uploads a notebook with unsupported magic/network content, receives typed reasons, and cannot advance.                                                                                                                                                                                                                                                                                                                 |
| Required local scripts                                          | pass    | `test-all`, mutations, clean demo, session reproduction, patch replay, replay recording, and achieved-metrics generation execute successfully in the working checkout.                                                                                                                                                                                                                                                         |
| Full release check and secret scan                              | pass    | `./scripts/release-check.sh` passes tests, typecheck, production build, 12 mutations, Docker smoke/reproduction, patch replay, metrics generation, and a scan of every tracked file.                                                                                                                                                                                                                                           |
| Fresh temporary clone acceptance                                | pass    | A no-local Git clone installed locked Node/Python dependencies, applied local D1 migration, ran `clean-demo.sh`, and passed the complete release check.                                                                                                                                                                                                                                                                        |
| Accessibility and responsive judged path                        | pass    | A 390×844 CloakBrowser run completes entirely by keyboard with reduced motion, visible semantic controls, and no horizontal overflow; primary text/status contrast pairs are unit-checked at ≥4.5:1.                                                                                                                                                                                                                           |
| Cloudflare replay/sample deployment                             | pass    | Remote D1, R2, Worker/assets, health, plain-first Try Instantly, upload refusal, Replay, Proof Bundle, live Belief Test, refresh restoration, read-only stage review, reset, and all 13 production CloakBrowser paths pass at `https://counterlab.cserules.workers.dev`. The first-visit gate keeps the primary action in view and rejects technical landing jargon. Version `fd8fafd7-ae39-4580-8fac-9b4bc14d1d24`.           |
| Class-imbalance P0.5                                            | not run | The leakage prerequisites now pass, but this separate concept pack, evaluator, mutations, untouched variants, and learning path have not been implemented. It is not represented as supported.                                                                                                                                                                                                                                 |

## Latest verified suite

- Root Vitest: 142 tests passed.
- Web Vitest: 45 tests passed.
- Pytest kernel/runner: 103 tests passed.
- CloakBrowser Playwright: 13 judged-path tests passed locally and against
  Cloudflare production, including committed-prediction restoration, replay
  restoration with its persistent banner, read-only completed-step review,
  explicit reset, one-decision-at-a-time phases, configured/missing live states,
  and mobile keyboard/reduced-motion completion. The 390px layout has labelled
  stage navigation and no horizontal overflow.
- Mutation matrix: 12/12 detected.
- Docker replay: canonical result and patch reproduced.

## Highest-risk remaining issue

The highest-risk remaining issue is the credential-revocation Codex boundary:
it is tied to the installed App Server authentication lifecycle and must be
requalified after a material Codex CLI protocol change. It is an enforced local
boundary, not a formal sandbox proof. Class-imbalance P0.5 also remains
unimplemented and must not be represented as a supported concept.
