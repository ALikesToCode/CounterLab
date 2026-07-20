# CounterLab — AI/Codex Evidence Audit + Epistemic Red Team (Agents 10+11)

- Target: https://counterlab.cserules.workers.dev/ (black-box, no source access)
- Audit date: 2026-07-19 (UTC). Auditor: Agent 10+11 (merged scope).
- Sessions created by this auditor (ordinary-user, ≤ a handful):
  - `session_297ad7b7-ec53-459e-b562-d006ec8d79d2` — sample lesson completed end-to-end with an **absurd off-topic claim** ("Purple bananas taste better on Tuesdays, therefore this notebook's score is meaningless.").
  - `session_aadb0d7d-cf80-4cee-8621-a52fbc27f4f1` — sample lesson with a **self-contradictory claim**, then learner pressed **"Not enough evidence"** (terminal INSUFFICIENT_EVIDENCE).
  - 1 live-mode attempt via `/` claim box (class-imbalance claim) and 1 via `/new` (off-topic claim) — both dead-end at the notebook gate; **live path untestable** (browser cannot set file inputs).
- Cross-references: swarm proof bundle `evidence/agent5_proof_record.json` (an earlier independent sample session with a sensible churn claim), `/api/replays/leakage-01`.

Evidence labels used: **Directly observed / Reproduced / Observed in network response / Observed in generated artifact / Inferred from behaviour / Unverified / Could not test.**

---

## 1. Mission A — Authority classification of every visible step

### 1.1 Sample lesson (`/` → "Try verified sample" → `/session/<id>`)

| Step | UI element | Apparent authority | Actual authority (evidence) | Labelled? |
|---|---|---|---|---|
| 1 Question | Notebook card: `customer_churn_leakage.ipynb`, SHA-256 `d0e9f323…`, "SUPPORT decision SUPPORTED", cell excerpts, "we do not run them" | Fixed intake/static analysis | **Sample/fixture data** — artifact `artifact_d0e9f3238753f1ca55534446` is the same bundled artifact in every session and in agent5's bundle (Observed in network response + Reproduced) | Partially: "Instant sample" badge; not labelled "bundled fixture" in-flow |
| 1 Question | Learner claim textarea | **Learner decision** | Learner free text; echoed verbatim later (Directly observed) | Yes ("Your claim") |
| 2 Prediction | "Two explanations, one fair test" — current + competing hypothesis, predictions, conditions/limits, alternatives, `confidence 0.93` | Presented as **Model-generated proposal** (judge page: "GPT-5.6 frames the belief") | **Fixed template** — byte-identical across 3 independent sessions with semantically unrelated claims (Reproduced; §3). Event actor is `system`, `modelId: leakage-customer-churn-belief-v1` = prompt/template slug, no `gpt` actor in the event chain (Observed in network response) | **No.** Judge page admits sample mode = "no account or model credential", but in-flow nothing says the framing is pre-authored; "Your current explanation" attributes template text to the learner |
| 2 Prediction | "Seal my prediction" + confidence slider | **Learner decision** | Learner choice, recorded as `prediction.committed` with `immutableHash` (Observed in generated artifact) | Yes ("Prediction sealed 🔒") |
| 3 Test | "Test plan verified… The fixed test plan passed its recorded verification" | Presented as **Independent verifier result** | **Replay data** — `lab.verified` event payload: `source: stored-approved-leakage-v1`, `recordedAt: 2026-07-14T11:18:03Z` (5 days before session), emitted **360 ms** after `codex lab.compilation_started` (Observed in network response) | Partially: the word "recorded" appears only inside this small line |
| 3 Test | `codex lab.compilation_started` → (implied compilation) | Presented as **Codex-generated plan** (judge page: "Runtime Codex compiles the test plan") | **Decorative marker** — codex events have `payload: {}`, no outputHashes, no plan/adapter/test artifacts; the "compiled" plan/adapter/public-tests hashes in the bundle are identical to agent5's and the replay's (Reproduced; §2) | No — nothing says the Codex step is a stored fixture |
| 4 Boundary | Result theatre: 98.5%→59.4%, runs table, `result a6ae7652e04e…` | Presented as **Fixed deterministic computation** ("Result authority: Fixed kernel") | Same stored result set as replay (identical metrics to 12 dp) but **different hash domain**: sample bundle `resultHash a6ae7652…` vs replay `resultHash 25016542…`; featureSetFingerprints also differ between the two paths (Reproduced; §4). Kernel event has no `recordedAt`; cannot distinguish live kernel vs replayed fixture (Unverified) | Partially: "Fixed kernel" labelled; "recorded/stored" origin not labelled in-flow |
| 4 Boundary | Boundary/Apply rule builder ("CounterLab does not grade your prose") | **Human-authored content** (fixed scaffolding) + learner edit | Fixed clause scaffolding; learner text recorded verbatim in `revision.recorded` (Observed in generated artifact) | Yes |
| 5 Apply | Transfer gate (forecasting), "Fix still locked" | Presented as **Independent verifier result** ("transfer fixed-code scored") | **Fixed deterministic scoring** — `evaluatorVersion: counterlab-transfer-v1`, 3 fixed invariants; events `transfer.failed`/`transfer.passed` within ~0.3 s of `transfer.started` (Observed in network response) | Yes (fixed-code scoring is disclosed on judge page) |
| 6 Repair | "Verify notebook patch" → verified patch, diff, 7 patch invariants | Presented as **Codex-generated repair + independent verification** | **Replay data** — `patch.verified` 1.17 s after `codex patch.compilation_started` (empty payload); `patchHash 18712546…`, `patchedArtifactHash eb20dc7e…`, diff bytes identical to agent5's bundle and replay `patch.cellDiff` (Reproduced) | Partially ("Verified sample" badge) |
| Proof | Proof Capsule / Reasoning Diff, `integrity: hmac-signed` | Presented as tamper-evident record of *this* session | Contains real session ids/timestamps/learner texts, but embeds the stored verification and template framing without marking them as stored/template inside the bundle (Observed in generated artifact) | Partially |

### 1.2 Verified replay (`/replay/leakage-01`)

| Element | Apparent authority | Actual | Labelled? |
|---|---|---|---|
| Whole path banner | **Replay data** | Stored recorded session of 2026-07-14 | **Yes — exemplary**: "Replay mode / Stored evidence chain / This path reconstructs recorded events and computed payloads. It is not a live model run", recorded date, model `gpt-5.6-sol`, verifier `leakage-verifier-v1`, commit `4f2f6472…` |
| Step 3 text "CounterLab has now run and checked the fairer test" | sounds live | stored | Partially — present-tense prose conflicts with the replay banner (minor) |
| compilerTrace (2 rejected repairs + later separate verified run, generationIsolation PARTIAL) | — | **Replay data, API-only** | **No — never surfaced in UI**; only visible via `/api/replays/leakage-01` (Observed in network response) |

### 1.3 Live path (`/new`, `/` claim box)

| Element | Apparent authority | Actual | Labelled? |
|---|---|---|---|
| `/new` landing: "Live generation… Hosted notebook runner is ready" | Live pipeline | Gate page; no session created until notebook upload | Yes ("Live generation") |
| Artifact panel after "Continue with my notebook" | Live intake | Stuck "Preparing artifact… / Pending" forever without upload; no timeout, no refusal, no CTA | No honest "unavailable/blocked" state |
| Home claim box → "Test this claim →" | routes claim into analysis | **Claim text is discarded**; lands on `/new` notebook gate for any input (Reproduced with a class-imbalance claim) | No |

---

## 2. Mission A.2 — Event-log & proof-bundle forensics

### 2.1 Codex-actor events are empty markers (Observed in network response, Reproduced)

From `/api/sessions/session_297ad7b7…/events` (full 15-event chain):

- seq 5 `actor:"codex" kind:"lab.compilation_started"` — `inputHashes:[]`, `outputHashes:[]`, `payload:{}` (EMPTY).
- seq 13 `actor:"codex" kind:"patch.compilation_started"` — inputHashes present (3), `outputHashes:[]`, `payload:{}` (EMPTY).
- **No** `*.compilation_completed`, no plan JSON, no adapter source, no test file, no diff authored by codex appears anywhere in the event stream. The plan/adapter/tests exist only as hashes inside the *verifier* event and the bundle (`generatedAdapter.sha256 ed70072a…`, `commitHash 1050fa76…` — identical in agent5's independent session).
- Timing: `lab.compilation_started` 05:31:46.805 → `verifier lab.verified` 05:31:47.165 (**360 ms**). `patch.compilation_started` 05:37:39.431 → `patch.verified` 05:37:40.598 (**1.17 s**). A real Codex compile + Dockerized external verification cannot complete in 360 ms; the payload itself discloses `recordedAt: 2026-07-14T11:18:03.807233Z`, `source: stored-approved-leakage-v1`, `image: counterlab-runner:local`.
- Conclusion: in all publicly reachable paths, the "Runtime Codex" role is a **replayed stored-approved artifact fronted by an empty marker event**. Whether live `/new` mode invokes real Codex: **Could not test** (file input unreachable; `/api/health` claims `liveCodex: configured`).

### 2.2 Verifier output content (Observed in network response / generated artifact)

- `lab.verified` event payload: `status VERIFIED`, `planHash 7a1abdf0…`, `adapterHash ed70072a…`, `publicTestsReportHash 30663c3b…` (bundle: `passed:1 failed:0`, command `python /workspace/public_tests.py`), `externalVerifierReportHash 9304e077…`, `reportHash 0926dcec…`, `resultHash 25016542…`, `resourceEvidence` (containerUser 65532:65532, networkDenied, 5 resource limits, mounts `/workspace`,`/fixtures/customer_churn.csv`,`/output`, hiddenReadAttemptsDenied).
- Bundle `externalVerifier`: 18 verified invariants (baseline_overlap_exists … zero_group_overlap) + 12 mutations (group-overlap-leak, forged-canonical-hash, network-probe-escaped, hidden-verifier-mounted, unsupported-artifact-accepted, …) — identical list to agent5's session and to the replay's compilerTrace summary (18/12).
- The full per-invariant/per-mutation **report bodies are never exposed** — only report hashes. A third party cannot check *what* each invariant checked, only that a hash is claimed (Unverified whether reports are retrievable anywhere).
- Replay `compilerTrace` (API-only) shows: `generate` COMPLETED (141 s, files experiment-plan.json/artifact-adapter.py/public_tests.py) → external_verifier REJECTED (candidate_execution: unsupported dataset_adapter arg) → repair_1 REJECTED (generated_workspace_policy: __pycache__ left) → repair_2 REJECTED ("No result was authorized") → `later_generate` COMPLETED ("A separate later run used corrected public SDK documentation; it is not presented as repair attempt 3") → external_verifier VERIFIED (18 invariants, 12/12 mutations). Also `generationIsolation: PARTIAL` — "host App Server process read global skill files, so generation-time hidden-verifier unreadability is not proven"; `candidateExecutionIsolation: VERIFIED` with 5 properties. **This is genuinely honest disclosure — but it is invisible in the product UI; the replay UI shows only the success story.**
- Notably: in the recorded trace the repair loop **never succeeded**; verification passed only on a fresh later generation. The judge-page slogan "Inspect a genuine reject–repair trace" oversells: it is a reject–reject–*regenerate* trace.

### 2.3 What is missing from the event chain

- The **learner's claim text has no event** (claim submission is invisible; only the `system` `belief_test.proposed` outputHash binds it indirectly).
- No `gpt`/`model` actor exists; belief framing is attributed to `actor:"system"` + `modelId` template slug.
- `belief_test.insufficient_evidence` (learner refusal) has `inputHashes:[]` — it does **not** bind to the belief test it rejects.
- Session footer events counter showed "0 events" while the API returned 3 (cosmetic).

---

## 3. Mission A.3 — Controlled comparisons (input-sensitivity)

| Input claim (3 sessions) | Framed current hypothesis | Competing hypothesis | Evidence refs | Plan / adapter / tests | Result & hashes | Patch |
|---|---|---|---|---|---|---|
| Sensible churn claim (agent5 session) | "The notebook's random-row test accuracy demonstrates generalization to new customers." | "Customer identity crosses the random split…" | identical 3 refs | identical (`planHash 7a1abdf0…`, adapter `ed70072a…`, tests `30663c3b…`) | identical metrics; resultHash domain `a6ae…`(sample) | identical (`18712546…`) |
| **Absurd**: "Purple bananas taste better on Tuesdays…" (mine, completed) | **byte-identical** | **byte-identical** | identical | identical | identical | identical |
| **Self-contradictory**: "proves generalization … and simultaneously proves it cannot generalize at all" (mine) | **byte-identical** (contradiction not detected; system arbitrarily keeps "generalizes" framing) | **byte-identical** | identical | — (session ended at INSUFFICIENT_EVIDENCE by learner choice) | — | — |

- Only `learnerClaim` (verbatim echo), ids, timestamps, and the prediction/transfer learner choices differ. `uncertainty.confidence` is **0.93 and `insufficientEvidence:false` for all inputs including nonsense** (Observed in generated artifact).
- `belief_test.proposed` outputHash *does* differ per claim (`1464b7c9…` vs `c9d8bb68…`) — the hash binds input, but the framing content is constant: a templated "Belief Spec" with the claim pasted in.
- Verdict: **fixed template**, not "deterministic compilation from claim semantics", and certainly not input-sensitive GPT-5.6 framing in the sample path. Off-topic input is **not refused** — it is silently forced into the leakage frame and carried all the way into a signed "verified" proof whose Reasoning Diff "Before" reads "Purple bananas taste better on Tuesdays…".

### Live-path comparison (Mission B-relevant)

- Class-imbalance claim via home box → text discarded, `/new` gate (Reproduced).
- Off-topic "Why is the sky blue?" typed in `/new` after the gate → nothing happens; artifact stuck "Pending intake"; "Compare two explanations" never enabled; no refusal message (Directly observed). The advertised "Unsupported evidence is refused, not guessed" produces **no reachable refusal UX for text claims**; refusal exists only at notebook intake (Could not test).

---

## 4. Hash/provenance consistency across paths

| Item | Sample session bundle (mine) | Replay API | agent5 sample bundle |
|---|---|---|---|
| Metrics (3 runs) | 0.984722… / 0.594444… / 0.673611… | identical to 12 dp | identical |
| `resultHash` (result set) | `a6ae7652e04e…` (UI also shows `a6ae7652e04e…`) | `2501654264b9…` (replay UI shows `2501654264b9…`) | `a6ae…` domain (kernel event) |
| `lab.verified` payload resultHash | `2501654264b9…` | `2501654264b9…` | `2501654264b9…` |
| featureSetFingerprint random_row_split | `1fd4ea95…` | `621d1d17…` | `1fd4ea95…` |
| identity_ablation featureSetFingerprint | `9641773f…` | `25611036b…` | `9641773f…` |
| pipelineFingerprint | present (`23478229…`) | absent | present |

→ Two different "canonical" result hashes for the same verified numbers, depending on path; within a single proof bundle, `lab.verified.resultHash` (2501…) ≠ `verifiedResultSet.resultHash` (a6ae…). A judge reconciling the sample proof against the replay evidence finds **mismatching hashes for identical data** (Reproduced). At minimum the hash semantics are undocumented; at worst one of the two is not actually committing to the displayed payload.

---

## 5. Mission B — Outcome-state inventory (reachable paths)

| State | Where observed | Reachable? | Notes |
|---|---|---|---|
| Supported (artifact SUPPORTED) | sample intake, support decision | Yes (Directly observed) | fixture artifact only |
| Verified result released | sample + replay end-to-end | Yes (Reproduced) | always the same stored numbers |
| Transfer FAILED | my sample session, wrong split choice | Yes (Directly observed) "Transfer not yet passed… patch remains locked" | unlimited retries → eventual pass |
| Transfer PASSED | both sessions | Yes (Directly observed) | fixed-code scored, 3 invariants |
| Patch VERIFIED | sample completed | Yes (Reproduced) | stored patch, 1.17 s "verification" |
| INSUFFICIENT_EVIDENCE (terminal) | my 2nd session after learner pressed "Not enough evidence" | Yes (Directly observed) | **terminal brick**: UI renders editable Question step but any action → `Invalid transition from INSUFFICIENT_EVIDENCE to BELIEF_TEST_PROPOSED` (internal state-machine error leaked to UI) |
| RESULT WITHHELD | same bricked session | Yes (Directly observed) "No verified result was released. CounterLab will not substitute bundled sample evidence for this session." | genuine fail-closed, anti-substitution safeguard — good |
| Unavailable / fail-closed | unknown session id, unknown replay id | Yes (Reproduced) → HTTP 404 both | good |
| Pending/stuck | `/new` without upload: "Preparing artifact… Pending intake" forever | Yes (Directly observed) | no timeout, no error, no guidance |
| Inconclusive / "not enough evidence" **system verdict on a claim** | — | **Never observed** | the system never judges a claim; only the learner can trigger insufficiency |
| Unsupported-claim refusal (off-topic/nonsense) | — | **Never observed** — nonsense is framed and "verified" instead |
| Live-mode outcome states | — | **Could not test** | file input unreachable |
| Proof download from incomplete session | `/proof/<id>` mid-session → redirects to session; `/api/sessions/<id>` returns state only, no bundle | Yes — fail-closed (Directly observed) | events JSON *is* world-readable mid-session (unauthenticated) |

**Does the system ever refuse to conclude?** Only via (a) the learner self-declaring insufficiency (terminal brick), (b) transfer gating, (c) 404s, (d) result-withheld after a broken transition. It **never** refuses or flags *claims* — every textual claim, including absurd and self-contradictory ones, is accepted into the same verified pipeline. The one automatic epistemic safeguard observed (withholding + no substitution after a broken state) is real but triggered by a bug, not by evidence judgment.

### Confounders tried (Mission B.2)

- Self-contradictory claim → identical canned framing; contradiction undetected (Reproduced).
- Two-indistinguishable-hypotheses / same-result-supports-both: not separately needed — the mechanism is already visible: framing is fixed, so hypothesis distinguishability is never evaluated against the claim (Inferred from behaviour, supported by 3 sessions).
- Ordering: result never visible before prediction lock ✓ (Directly observed at step 3: "Verified plan; result not released").
- Change answer after commit: no edit affordance post-seal ✓ (Directly observed); API-level re-commit not attempted (ordinary-user constraint).
- Stale evidence after input change: claim is locked once framed; "Edit my explanation" exists pre-confirm only (Directly observed).
- Replay passed as live: replay is banner-labelled; however **sample mode is the same replay data with weaker labelling** — see §1.1 (this is the real "replay-as-live" seam).
- Repair unlock pre-transfer: enforced ✓ ("Fix still locked" / "The patch remains locked" — Directly observed, including while transfer FAILED).
- Proof metadata vs visible inputs: learnerClaim/prediction/revision match inputs ✓; but the signed bundle certifies a framing disconnected from the claim (purple bananas → leakage framing, `insufficientEvidence:false`, `confidence 0.93`) ✗.

### Always-positive path flag

A learner who clicks "Yes, this captures my view", picks any prediction, then brute-forces the 2×2 transfer gate (unlimited retries, instant feedback) **always** reaches "VERIFIED patch + signed Proof Capsule", for any claim text whatsoever. The only negative terminal state requires the learner to voluntarily choose "Not enough evidence"/"Reject" — and that bricks the session with a raw error. Incentives and friction both push toward the positive outcome (Reproduced).

---

## 6. Verdicts (with confidence)

1. **Codex runtime necessity (publicly reachable paths): NO substantive role — High confidence.** Codex events are empty markers; every "compiled" artifact is a stored-approved fixture (`stored-approved-leakage-v1`, recorded 2026-07-14) replayed in ≤1.2 s. In sample + replay paths, removing Codex changes nothing. Live mode: Could not test.
2. **Verifier independence: architecturally plausible but unprovable and mis-scoped in presentation — Medium confidence.** Verification evidence is real-looking (18 invariants, 12 mutations, isolation properties, rejections disclosed in API) but it verified a **stored artifact once on 2026-07-14**, not anything in the learner's session; the UI presents it as session verification ("Test plan verified"). Verifier and session share one Worker; no independent attestation is reachable. The verifier's own `generationIsolation: PARTIAL` limitation is hidden from users.
3. **GPT-5.6 belief framing in sample path: templated, input-invariant, and silently non-refusing — High confidence** (3 independent claims → byte-identical framing; `insufficientEvidence:false` for nonsense).
4. **Deterministic-kernel claims: numbers are stable and labelled "Fixed kernel", but the same result carries two different "resultHash" values across paths — Medium-high confidence** this is a provenance defect, not a computation difference (metrics identical to 12 dp).
5. **Streamed agent progress is decorative — High confidence** (360 ms compile→verify; empty codex payloads; recordedAt 5 days prior).
6. **Scientific authority is mostly kept away from prose generation in the *result* steps (fixed tables, no generated numbers) — but not in the *framing* step**, where template prose is presented as the learner's own explanation and never refuses.

---

## 7. Could-not-test list

- Live notebook path end-to-end (browser cannot set file inputs): real GPT-5.6/Codex/kernel/verifier live invocations, live refusal of unsupported notebooks, class-imbalance Subject Pack behaviour.
- HMAC signature verification of proof bundles (no key; black-box).
- Docker/sandbox enforcement claims (only self-reported `resourceEvidence` visible).
- POST/PUT API surface and whether predictions can be re-committed via API (ordinary-user constraint).
- Whether the home claim box ever carries text into a session for any input class.
