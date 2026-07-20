# 03 — First-Time Learner Audit (Agent 2)

**Target:** https://counterlab.cserules.workers.dev/ (sample lesson `leakage-01`, session `session_db9778ae-2e82-456a-a193-9c03292e1eba`)
**Method:** strict black-box. Cold pass performed before any click; full sample lesson completed end-to-end with genuine inputs; evidence revisited via history, replay, proof page, downloads, Evidence & proof drawer, ⌘K palette.
**Environment:** browser tools only; no file-upload possible (live notebook path = Could not test); no DevTools.
**Evidence labels:** Directly observed / Reproduced / Observed in generated artifact / Inferred from behaviour / Unverified / Could not test.

---

## 1. COLD PASS — raw first impressions (recorded verbatim BEFORE any click, above-the-fold only, screenshot `agent2_01_homepage_cold.png`)

**What I think this product does (verbatim):**
"It's a chat-style box where I state a claim about some 'result' — apparently a machine-learning result, because it talks about notebooks and 'my model' — and instead of just answering like a chatbot, it 'proves' the claim 'like science'. The tab title says 'CI for understanding', which I read as continuous-integration-for-understanding, but I honestly can't tell what that means day-to-day. It seems I can attach a Jupyter notebook and it checks whether the result in it is trustworthy ('we read the evidence and never run the cells'). Something about 'fixed kernels' and 'frozen checks' doing the proving. Only works for scikit-learn notebooks about 'entity leakage' and 'class imbalance', whatever those are."

**Who I think it's for (verbatim):**
"People who have ML notebooks — data-science students or junior practitioners ('Why did MY model score highly but fail on new customers?'). I can't tell if it's a learning product or a verification tool for professionals. 'No account needed' and the chat box say casual try-out; 'fixed kernels / frozen checks / evidence binding' says engineering tool. The word 'learn' or 'student' never appears above the fold."

**What I'd click first (verbatim):**
"'Try verified sample' — I have no notebook and no claim of my own, and 'verified sample' sounds like the safe guided demo. The giant textarea asks me to produce a claim before I know what kinds of claims are even supported, and 'Test this claim' without a notebook feels like it might just fail. 'Watch verified replay' sounds passive, so sample first."

### The 10 mandatory first-20-seconds questions

| # | Question | Answer in first 20s | Clear? | Precise cause if unclear |
|---|----------|--------------------|--------|--------------------------|
| 1 | What is this? | A claim-testing tool for ML notebook results that "proves" instead of chatting. The word "test/prove" is clear; the mechanism and the "CI for understanding" frame are not. | Partially | terminology ("CI", "proof", "evidence binding", "fixed kernels", "frozen checks") + no concrete example above the fold |
| 2 | Who is it for? | Implied: owners of Python/scikit-learn notebooks. Learner vs practitioner never stated; "Education demo" only appears in a tiny footer after entering a session. | No | copy — audience never named; missing info |
| 3 | What problem does it solve? | Implied: chatbots give unverified answers; this "proves like science". Also: high ML scores can mislead (prompt starters). Never stated as a problem. | Partially | copy/hierarchy — implicit, requires inference |
| 4 | What should the user do? | Primary: type a claim → "Test this claim". But four CTAs compete (New question / Try verified sample / Watch verified replay / Test this claim) and a notebook-less newcomer isn't told which path is theirs. | Partially | competing CTAs; no newcomer routing ("No notebook? Start here") |
| 5 | Why is prediction important? | **Nothing about prediction appears on the homepage.** The concept is introduced only inside the session (step 2, via the "Why?" toggle). | No | missing info — the product's core mechanic is invisible on the landing page |
| 6 | How is this different from an AI explanation? | Implied by "Prove it like science", "fixed kernels calculate", "frozen checks verify", "Unsupported evidence is refused, not guessed" — but a newcomer cannot articulate the difference; it's asserted, not shown. | Partially | terminology + lack of proof (no example of a refused/guessed answer) |
| 7 | Where does Codex appear? | **Nowhere.** No mention of Codex/OpenAI/model anywhere on the homepage, nor anywhere in the learner UI during the whole journey. Only found later inside the downloaded proof JSON (event actors `codex`) and as "Model: gpt-5.6-sol" on the replay page. | No | hidden info |
| 8 | What is verified? | "frozen checks verify the evidence binding before it appears" — grammatically the "evidence binding" is verified, but what that is, who checks, and what "verified sample/replay" mean is opaque. | No | terminology + lack of proof (no verification surfaced) |
| 9 | What is generated? | Not answerable. Nothing distinguishes generated vs fixed content on the fold. "fixed kernels calculate the result" hints results are NOT generated, but whether text/explanations are AI-generated is unsaid. | No | missing info |
| 10 | Live, replayed, sample-based, or mixed? | Mixed, and honestly labeled by name ("Try verified **sample**", "Watch verified **replay**") — but whether the main "Test this claim" path is live, and whether the sample computes live or replays, is not stated on the fold. | Partially | hidden info (labels exist but the live-ness of the primary path is ambiguous) |

**Cold-pass summary:** The fold communicates *vibe* (chat vs science) well but fails questions 2, 5, 7, 8, 9 outright. A first-time learner cannot predict what will happen after "Test this claim", does not know the product is educational, and sees trust-words ("fixed kernels", "frozen checks", "evidence binding", "verified") with no referent. The strongest above-the-fold asset is the honest "Unsupported evidence is refused, not guessed" line.

---

## 2. FULL LEARNER PASS — 12-step journey log

Session: `session_db9778ae-2e82-456a-a193-9c03292e1eba` (Instant sample, `leakage-01`). Completed fully, ending on `/proof/...` with transfer PASSED and patch VERIFIED.

### Step 1 — Land (homepage) ✔
Screenshot `agent2_01`. Single-viewport page (no scroll). See cold pass. Left rail "Start with evidence" looks like a link but is non-interactive (not focusable/clickable in the element tree). "How proof works" rail link clicks with **no visible effect** (no modal, no scroll, no expansion — only its hover state changes; screenshot `agent2_38`).

### Step 2 — Understand what the product does ✔ (partial)
From the fold alone: "test claims about notebook results". The *educational* nature (prediction-first learning loop) only became apparent inside the session. The footer line "Chatbots explain. CounterLab lets reality answer." (visible only after entering) is the clearest statement of the thesis — it should be on the homepage.

### Step 3 — Choose first action ✔
Clicked **"Try verified sample"** (screenshot `agent2_03_sample_start.png`). Instantly routed to `/session/session_db9778ae-...`, wizard step 1 of 6 (Question, Prediction, Test, Boundary, Apply, Repair), "INSTANT SAMPLE" badge in header — good provenance signal.

### Step 4 — Start sample lesson ✔
**Step 1 Question: "What do you think the score means?"** Left card: "Uploaded notebook evidence — customer_churn_leakage.ipynb", 0.985 accuracy, cell excerpts (accuracy 0.985, roc_auc 0.984), SHA-256, "Support decision: SUPPORTED". Right card: finish the thought "Because the notebook scored highly, I think the model…".
Observations:
- "Uploaded notebook evidence" is wrong framing for the sample — **I uploaded nothing**. The "INSTANT SAMPLE" badge mitigates, but the card title misleads (trust-label gap).
- Jargon on first screen: `roc_auc` (unexplained), `SUPPORTED` (support decision by whom, on what grounds?), `SHA-256`/`Evidence cells` (integrity detail a learner can't use yet).
- "Need a hint?" and "Why?" collapsed panels available; the Why? text ("…does not yet show whether it generalizes to completely new customers") already telegraphs the catch to anyone who opens it — pre-commit hint leak, though opt-in.

### Step 5 — State belief ✔
Typed genuinely (115 chars): *"I think the model will work for completely new customers, because a 0.985 accuracy means it is almost always right."* Character counter present; no minimum-length friction. CTA labeled **"Compare two explanations →"** — confusing: at this point I have seen zero explanations; the label refers to the *next* screen. (Screenshot `agent2_04`.)

### Step 6 — Commit prediction ✔ (with caveats)
**Step 2 Prediction** (screenshots `agent2_05`, `agent2_06`, `agent2_07`, `agent2_08`):
- My prose was reframed by the app into "Your current explanation": *"The notebook's random-row test accuracy demonstrates generalization to new customers."* — AI-generated interpretation presented under the label "Your". Editable via "Edit my explanation"; alternates hidden under "More ways to respond" (Not enough evidence / Reject — unexplained outcomes, not tested).
- The competing model is app-authored: "Customer identity crosses the random split…" with "Predicts: Accuracy should fall materially under a customer-group split and after identity ablation."
- **The app writes both predictions; the learner only clicks "Yes, this captures my view."** Click-through without thinking is possible (I verified no free-text prediction is required before the seal UI appears).
- **Pre-commit verdict leak:** an evidence chip reads *"This is the deceptive random-split headline under test. accuracy: 0.985"* — the word "deceptive" tells the learner the score is untrustworthy BEFORE they lock an expectation.
- Jargon: random-row test accuracy, generalization, customer-group split, identity ablation, entity boundary, schema ("Entity candidates: customer_id"), "evaluation leakage" and "does not prove global model quality or learner mastery" (duplicated disclaimer on both cards).
- Seal UI: expectation options ("Remain near 98%" / "Fall materially" / "I am unsure") each with an app-written rationale; confidence slider **preset to 72%** (arbitrary, unexplained). "Seal my prediction" stays disabled until a choice is made (good commit gate). I honestly chose "Remain near 98%" (consistent with my stated belief) and sealed (screenshot `agent2_09`).

### Step 7 — View experiment ✔
**Step 3 Test: "The fair test is ready."** (screenshots `agent2_10`, `agent2_11`)
- Sealed prediction card (🔒, yellow) is dramatic and clear: 0.985 → "Remain near 98%", confidence 72%, "locked before the verified result appears".
- Fair-test design is legible: "Changed: Evaluation unit: random rows → whole customers" vs "Held fixed: Model family, Target, Metric, Preprocessing, Seed". "Matches deployment" rationale in plain language — the best explanatory copy in the product.
- Verification surface: "Test plan verified", "Subject Pack test plan verified", "Evidence & proof: Mode: Verified sample / Result authority: Fixed kernel / Release state: Verified plan; result not released" — real provenance labels, though "Subject Pack", "fixed kernel", "release state" are jargon, and "the tutor" appears here for the first and only time ("the result comes from the verified fixed-kernel test rather than the tutor" — who is the tutor?).
- Clicked **"Run the fair test"**. Note: per the downloaded proof bundle, nothing runs live in the Worker — the result is a deterministic fixture computed in a recorded local Docker run ("Cloudflare Worker with recorded local Docker runner evidence"). "Run" overstates liveness; the honest framing already exists two lines above it ("result not released" → a "Reveal the verified result" label would be accurate).

### Step 8 — Interpret result ✔ (strong)
**Step 4 Boundary — Experiment Theater** (screenshots `agent2_11`–`agent2_12`): my locked prediction (98%) is pinned directly above the outcome: **Familiar rows 98.5% (389 shared customers) → New customers 59.4% (0 shared customers)**, "Held fixed: model, target, metric, preprocessing, and seed". Runs table: random row split 98.5%/0.984 vs customer group split 59.4%/0.641 vs identity ablation 67.4%/0.725, same seed 1729, result hash `a6ae7652e04e…`.
- **Fully interpretable without ML expertise**: the headline contrast (98.5 → 59.4 when only new customers are tested) needs no statistics background. ROC AUC / "proportions" / "identity ablation" in the table are unexplained but supplementary.
- My prediction was honestly wrong — the confrontation is genuinely instructive.
- Sub-tabs Observe/Explore/Boundary/Apply duplicate wizard step names (Boundary, Apply mean something different as theater tabs) — hierarchy muddle. "Explore" in sample mode is a **dead-end**: it advertises "Change the test, then let the kernel recompute it" but sample mode offers no controls and no CTA (only the badge "SAMPLE RESULT STAYS FIXED FOR A REPRODUCIBLE LESSON") (screenshots `agent2_13`, `agent2_14`). Boundary tab = one sentence ("The conclusion changes at the entity boundary… 0 vs 389 shared customers") (screenshot `agent2_15`).

### Step 9 — Revise rule ✔
**Apply tab: "Build the rule you will carry forward."** (screenshots `agent2_17`, `agent2_18`) Clause builder (When / I should / because), each option evidence-linked ("Evidence: zero-overlap whole-customer run" etc. — excellent provenance pedagogy). Composed sentence: *"When rows repeat the same entity, I should hold out whole entities, because random rows can share identity across train and test."*
- "CounterLab does not grade your prose" — good trust signal.
- **Defaults are pre-selected to the correct clauses** — a learner can accept the rule without constructing it. "Write freely" mode exists (not tested).

### Step 10 — Complete transfer ✔
**Step 5 Apply: "Try your rule on forecasting."** (screenshots `agent2_19`–`agent2_22`) Badge "New problem · No notebook hints" (honest: this step has no verified evidence). Scenario: demand forecast, centered rolling feature, random date mixing; timeline diagram TRAINING (Jan–Mar) | NOW | TEST (Apr–Jun). Two binary choices: split (Random daily rows vs **Time-ordered holdout**) and feature crossing NOW (Known item price vs **Centered rolling target**). Diagram updates live ("Centered rolling target — reads later outcomes ✕" crossing NOW). Clicked "Check transfer" → **"Transfer passed · Patch unlocked"** (screenshot `agent2_23`).
- Transfer is two binary choices → 25% pass-by-guessing; grading is a fixed deterministic check, not evidence (the "No notebook hints" badge implicitly concedes this).
- "Fix still locked" badge correctly communicates repair-gating ("CounterLab teaches before it repairs").

### Step 11 — Reach final outcome ✔
**Step 6 Repair → /proof/...** (screenshots `agent2_24`–`agent2_27`):
- Repair preview: changes (random rows → whole-customer holdout; identity removed; overlap reported) vs preserves (target, model family, unrelated cells, original notebook). "The original upload will not be overwritten" — again "upload" language in a no-upload sample.
- Proof page: "You can now distinguish: 'good on familiar rows' from 'generalizes to new entities'"; Before/After reasoning cards; Transfer status Passed; **Reasoning Diff** table (Belief/Prediction/Code/Transfer, before vs after); raw unified diff of cell 3 (train_test_split → GroupShuffleSplit, drop customer_id, `assert not customer_overlap`, overlap print) labeled "Cell 3 changed · unrelated source hashes unchanged · group overlap 0 · result reproduced"; Technical proof (result_hash, seed 1729, replay_id leakage-01, two reproduce scripts). Downloads: repaired notebook + proof record.
- Reasoning Diff "Prediction / After: 59.4% on new customers" substitutes the verified result into the "after" column — conflates "what I now predict" with "what the test found".
- **Downloaded proof record** (`evidence/artifacts/agent2_proof_record_leakage-01.json`, 34 KB): 12-event hash chain (actors system/learner/**codex**/verifier/kernel), generatedAdapter sha256+commit, publicTests 1/0, externalVerifier VERIFIED with named invariants, fixture descriptor (480 customers / 2880 rows / sha256), limitations list (honest: "Docker enforcement is evidence for this local run, not a formal sandbox proof"), HMAC-signed integrity, reproduction commands. **This artifact is the product's best trust object — and it is the ONLY place Codex visibly appears.**
- Ending is informative but emotionally flat: no acknowledgment of the corrected belief beyond the table, no pointer to a next lesson or to trying one's own notebook (only downloads). Wizard header never marks step 6 Repair complete (✓ stops at Apply, even after reload).

### Step 12 — Revisit completed evidence ✔ (partially broken)
- **Studio drawer ("Project & evidence")**: shows Current notebook, Evidence navigator (cell excerpts), and **Recent sessions: "customer_churn_leakage.ipynb — REASONING DIFF ISSUED"** — history works (screenshot `agent2_32`). But the homepage shows **no** recent/continue affordance; history is only reachable from inside a session (screenshot `agent2_37`).
- **⌘K palette** (CounterLab Studio, screenshot `agent2_33`): Analyze notebook / Show evidence / Lock prediction / Run fair test / Show verifier / Review patch / Download patched notebook / Export proof ("machine-readable Proof Capsule") / Start over. Honest footer: "All commands also have visible controls in the workspace."
- **Evidence & proof drawer — BROKEN**: counter reads "0 events" throughout the entire journey; after full completion, tabs Activity/Plan/Diff/Tests/Verifier all show *"No X evidence yet. It will appear here when the session produces it."* — **the session DID produce all of it** (12-event chain in the downloaded bundle). Reproduced after full page reload (screenshots `agent2_29`, `agent2_31`). Only Provenance has content (Artifact/Session/Result hashes), and it shows apparently stale states: "Boundary: Locked until verification" and "Capsule: Issued after verified repair" — after verification and repair both completed. The palette's "Show verifier — Inspect accepted invariants and concrete rejections" routes into this same empty Verifier tab (screenshot `agent2_34`).
- **Replay** `/replay/leakage-01` (screenshots `agent2_35`, `agent2_36`): best labeling in the product — purple "Verified replay · Recorded 2026/7/14" banner, "REPLAY MODE" header badge, "This path reconstructs recorded events and computed payloads. It is not a live model run.", metadata (Replay leakage-01 / Model gpt-5.6-sol / Verifier leakage-verifier-v1 / Commit 4f2f6472…). Minor: step copy says "CounterLab **has now run** and checked the fairer test" — present-tense conflicts with the recorded banner.

---

## 3. CONFUSION REGISTER (every observed learner friction point, in journey order)

| # | Route / step | Friction type | Observation | Evidence |
|---|--------------|---------------|-------------|----------|
| C1 | `/` | terminology | "CI for understanding" (title) — never expanded in-app; metaphor lands only for engineers | Directly observed, `agent2_01` |
| C2 | `/` | terminology | "fixed kernels", "frozen checks", "evidence binding" — the single trust sentence is the most jargon-dense line on the page | Directly observed, `agent2_01` |
| C3 | `/` | missing info | No audience, no "education" framing, no prediction mechanic, no Codex mention | Directly observed, `agent2_01` |
| C4 | `/` | competing CTAs | New question / Try verified sample / Watch verified replay / Test this claim — no newcomer routing | Directly observed, `agent2_01` |
| C5 | `/` | missing CTA feedback | "How proof works" rail link: click produces no visible change | Reproduced, `agent2_38` |
| C6 | `/` | layout | "Start with evidence" looks like a nav link; it is inert text | Directly observed, `agent2_01` |
| C7 | `/session` Q | conflicting info | "Uploaded notebook evidence" — nothing was uploaded (sample); "INSTANT SAMPLE" badge partially mitigates | Directly observed, `agent2_03` |
| C8 | `/session` Q | excessive detail / jargon | roc_auc, SHA-256, Evidence cells, SUPPORTED shown to a first-minute learner with no glossary | Directly observed, `agent2_03` |
| C9 | `/session` Q→P | terminology | CTA "Compare two explanations →" precedes any visible explanation | Directly observed, `agent2_04` |
| C10 | `/session` P | trust label | AI-reframed "Your current explanation" carries no generated-by label; only an Edit affordance | Directly observed, `agent2_05` |
| C11 | `/session` P | answer-before-commit | "This is the **deceptive** random-split headline under test" shown before the prediction lock | Directly observed, `agent2_05/06` |
| C12 | `/session` P | can click through without thinking | App authors both explanations AND both predictions; learner only confirms | Directly observed, `agent2_06/07` |
| C13 | `/session` P | jargon | generalization, customer-group split, identity ablation, entity boundary, schema, evaluation leakage, "learner mastery" | Directly observed, `agent2_05` |
| C14 | `/session` P | unexplained default | Confidence preset 72% | Directly observed, `agent2_08` |
| C15 | `/session` T | terminology | "Subject Pack", "fixed kernel", "Result authority", "Release state", first-ever mention of "the tutor" | Directly observed, `agent2_10` |
| C16 | `/session` T | liveness wording | "Run the fair test" — nothing runs; result is recorded/replayed (proof bundle: fixture + recorded Docker run) | Observed in generated artifact + Directly observed, `agent2_11` |
| C17 | `/session` B | hierarchy | Theater tabs Observe/Explore/Boundary/Apply collide with wizard steps Boundary/Apply | Directly observed, `agent2_12` |
| C18 | `/session` B | dead-end | Explore tab promises knobs ("change split boundary, identity feature, entity field, test size") that sample mode does not offer | Directly observed, `agent2_13/14` |
| C19 | `/session` B | jargon | ROC AUC, "proportions", identity ablation in runs table (supplementary) | Directly observed, `agent2_12` |
| C20 | `/session` Apply | can click through | Rule-builder defaults pre-select the correct clauses | Directly observed, `agent2_18` |
| C21 | `/session` Apply | terminology | "No notebook hints" = "this step is not evidence-backed" — cryptic phrasing | Directly observed, `agent2_19` |
| C22 | `/session` Apply | weak challenge | Transfer = two binary choices (25% blind-pass rate) | Directly observed, `agent2_20` |
| C23 | `/session` Repair | conflicting info | "The original upload will not be overwritten" — no upload exists in sample mode | Directly observed, `agent2_24` |
| C24 | `/proof` | jargon pile-up | Reasoning Diff, Proof Capsule, Capsule, Boundary (object), bounded repair scope, patch payload | Directly observed, `agent2_25/26` |
| C25 | `/proof` | semantics | Reasoning Diff "Prediction/After" shows verified result, not a revised learner prediction | Directly observed, `agent2_26` |
| C26 | `/proof` | broken evidence surface | Evidence & proof drawer "0 events"; Activity/Plan/Diff/Tests/Verifier empty after completion; survives reload | Reproduced, `agent2_29/31` |
| C27 | `/proof` | stale state | Provenance: "Boundary: Locked until verification", "Capsule: Issued after verified repair" — post-verification | Reproduced, `agent2_39` |
| C28 | `/proof` | missing feedback | Wizard step 6 Repair never receives ✓ | Reproduced, `agent2_25/26` |
| C29 | `/proof` | flat ending | No celebration of corrected belief, no next-lesson or own-notebook CTA on the page | Directly observed, `agent2_25` |
| C30 | `/` (return) | discoverability | No recent-session/continue affordance on homepage; history only via in-session Studio drawer | Directly observed, `agent2_37` |
| C31 | `/replay` | copy conflict | "CounterLab has now run and checked the fairer test" vs "It is not a live model run" banner | Directly observed, `agent2_36` |
| C32 | all steps | layout | Collapsed "Need a hint?" bars render as tall empty white containers (look broken until you notice the small blue label) | Directly observed, e.g. `agent2_05` |

**Jargon inventory (no in-app glossary found):** entity leakage, class imbalance, evidence binding, fixed kernel, frozen checks/verifier, roc_auc / ROC AUC, generalization, random-row split, customer-group split, identity ablation, entity boundary, entity candidates, schema, evaluation leakage, Subject Pack, Result authority, Release state, the tutor, Experiment Theater, Boundary Map (object "Boundary"), Reasoning Diff, Proof Capsule / Capsule, bounded repair scope, patch payload, No notebook hints, REASONING DIFF ISSUED, Verified replay, Stored evidence chain, gpt-5.6-sol.

---

## 4. TRUST-LABELLING TABLE (per screen: what each output IS vs whether the UI says so)

| Screen | Output | True class | Labeled in UI? | Label quality |
|--------|--------|-----------|----------------|---------------|
| `/` homepage | "fixed kernels… frozen checks… refused, not guessed" | unsupported marketing claim (no proof surfaced) | No label | Assertion only |
| `/` | Prompt starters | fixed content | n/a | Fine |
| Q (step 1) | Notebook card (0.985, cell excerpts, SHA-256) | deterministic sample evidence | Partially — "INSTANT SAMPLE" in header, but card says "Uploaded notebook evidence" | Mislabeled component |
| Q | "Support decision: SUPPORTED" | verifier/support decision | Yes, named | No explanation of criteria |
| P (step 2) | "Your current explanation" | AI-generated interpretation of learner text | Presented as "Your" — no generated-by marker | Weak |
| P | "Alternative CounterLab will test" + both "Predicts" | AI/fixed app-authored models | Attributed to CounterLab | OK |
| P | Evidence chips (cell source/output, schema) | notebook excerpts + app inference | Yes ("Cell 3 · source", "schema") | Good refs; "deceptive" wording prejudges |
| P | Seal UI (choice, confidence) | learner input | Yes ("Prediction sealed 🔒") | Good |
| T (step 3) | Test plan, Changed/Held-fixed | fixed plan | Yes ("Test plan verified") | Good |
| T | "Subject Pack test plan verified" | verifier decision | Yes, named | Jargon, no link to detail (drawer empty) |
| T | Mode/Result authority/Release state | provenance metadata | Yes | Good |
| B (step 4) | 98.5% vs 59.4%, runs table, result hash | fixed calculation on deterministic fixture | "Verified result", "Verified experiment metrics" | Good; "fixed kernel"/"fixture" distinction only in bundle |
| B | Explore notice | deterministic sample limitation | Yes ("SAMPLE RESULT STAYS FIXED…") | Honest but dead-end |
| B | "Verified sample boundary" | fixed calculation | Yes | Good |
| Apply | Clause options + "Evidence:" links | fixed clauses bound to verified runs | Yes, per-clause evidence links | Excellent |
| Apply | "Your revised mental model" | learner input (composed) | Yes | Good |
| Apply transfer | Scenario, grading, "Transfer passed" | deterministic fixed check, **not** evidence | Badge "No notebook hints" | Honest but cryptic |
| Repair | Preview changes/preserves | fixed scope summary | Yes ("does not change transfer result or patch payload") | Good |
| Proof | Reasoning Diff | mixed learner text + verified values | Per-dimension table | Good |
| Proof | Cell-3 unified diff | Codex-generated artifact, verifier-checked | "verified notebook change", hashes unchanged, "result reproduced" | Good — but Codex authorship invisible |
| Proof | Technical proof (hash, seed, replay_id, scripts) | verifier/integrity metadata | Yes | Good |
| Download | proof record JSON | machine-readable Proof Capsule (actors incl. codex/verifier/kernel, HMAC chain) | Yes | Best artifact; hidden behind download |
| Drawer | Activity/Plan/Diff/Tests/Verifier | should be verifier + event evidence | Tabs labeled; **content empty ("No evidence yet") + "0 events"** | Broken |
| Drawer | Provenance | integrity metadata | Yes, but states stale ("Locked until verification") | Misleading |
| Replay | Entire path | replayed recorded evidence | "Verified replay", "Recorded", "REPLAY MODE", "not a live model run", Model/Verifier/Commit | Best-in-class |
| Replay | "has now run and checked" step copy | — | Conflicts with replay banner | Minor inconsistency |

**Net trust-labelling verdict:** Label *coverage* is unusually good (mode badges, release states, hashes, replay banners, per-clause evidence links). The failures are concentrated and serious: (1) the one surface whose job is to show verification — the Evidence & proof drawer — is empty and contradicts the completed session; (2) AI-generated interpretation is dressed as the learner's own words; (3) Codex authorship is invisible except inside a downloaded JSON; (4) sample-mode copy repeatedly says "uploaded/original upload".

---

## 5. EDUCATION-EXPERIENCE VERDICT

**Would a real learner's understanding change?** Yes — the core mechanism works. I entered believing "0.985 accuracy ≈ always right", sealed that belief, and had it falsified by a legible contrast (98.5% → 59.4% when only unseen customers are tested) with every other variable held fixed. That is a genuine conceptual jolt a chat answer cannot produce. The clause-built rule ("hold out whole entities because random rows share identity") and the forecasting transfer (time-ordered holdout; centered rolling target crosses NOW) correctly generalize the principle to a new surface. The repair diff ties the idea back to concrete code. The loop in the thesis — belief → competing models → locked prediction → discriminating experiment → verified result → boundary → transfer → repair → replayable proof — is present and in the right order.

**What would they remember?** "A high score can be an artifact of who is in the test set; keep each customer on one side of the split; test the way deployment will meet the model." That is a durable, transferable lesson.

**What weakens the learning:**
1. The app does the epistemic work at the two most important moments: it writes the competing explanations AND both predictions (learner clicks "Yes"), and it pre-fills the correct rule clauses. Generation effect is largely bypassed.
2. "Deceptive random-split headline" tells the learner the verdict before they commit — the falsification loses some force.
3. Transfer is two binary choices (25% blind pass); nothing requires articulating *why* in the new domain.
4. The boundary concept ("entity boundary") is stated, never visualized or defined; the single-sentence Boundary tab is the thinnest step.
5. The finale under-invests in consolidation: the Reasoning Diff is a table, not a moment; no retrieval prompt, no next step, no "try this on your own notebook" CTA on the proof page.
6. The empty evidence drawer actively damages the "verified" claim at the exact moment a reflective learner goes to check it — the product teaches "distrust unverified claims" while its own verification surface says "No verifier evidence yet."

**One-line verdict:** A genuinely effective 10-minute micro-lesson with best-in-class provenance ambitions, undercut by scaffolded (sometimes pre-answered) thinking prompts and a broken evidence drawer at the payoff moment.

---

## 6. Evidence index
- Screenshots: `evidence/screenshots/agent2_01 … agent2_38` (homepage cold, every wizard step, theater tabs, transfer, proof, drawer states, palette, replay, homepage return).
- Downloaded artifact: `evidence/artifacts/agent2_proof_record_leakage-01.json` (34 KB; 12-event HMAC-chained proof bundle; actors system/learner/codex/verifier/kernel; externalVerifier VERIFIED; fixture descriptor; limitations; reproduction commands).
- Session id: `session_db9778ae-2e82-456a-a193-9c03292e1eba`; replay id: `leakage-01`; result hash: `a6ae7652e04e4d70…`; notebook SHA-256: `d0e9f3238753f1ca…`.

## 7. Could-not-test list
- Live notebook upload (browser cannot set file inputs) → entire live path: live Explore knobs, live refusal of unsupported notebooks, per-notebook boundary map.
- "Write freely" rule mode; "Edit my explanation"; "Not enough evidence" / "Reject" branches; "Use a starter claim".
- Failing the transfer (wrong-answer remediation path).
- ⌘K keyboard invocation (used the clickable "Commands Ctrl K" entry instead).
- `/new` route and text-only claim flow (no notebook attached) — out of assigned scope.
- Judge Mode `/judge` — assigned to another agent.
- Class-imbalance concept (second "Supported today" concept; no sample offered for it on the path I took).
