# 07 — Learner UX & Pedagogy Audit (Agent 5)

**Target:** https://counterlab.cserules.workers.dev/ — sample lesson (`Try verified sample`), sessions
`session_27c89195-…` (full run, prediction "Remain near 98%" @ 85%) and `session_e4c7ea89-…` (second run, starter-claim path).
**Method:** black-box completion of the full 6-step journey twice + deliberate-failure probes + inspection of the downloaded proof record JSON.
**Evidence labels:** Directly observed / Reproduced / Observed in generated artifact / Inferred from behaviour / Unverified / Could not test.
**Screenshots:** `evidence/screenshots/agent5_*.png`; proof record: `evidence/agent5_proof_record.json`.

## Journey actually performed

1. Question — wrote my own claim (free text, 160 chars) → accepted; second run used "Use a starter claim" (one click inserts canned 78-char claim).
2. Prediction — app presented two pre-written models; confirmed "Yes, this captures my view"; selected "Remain near 98%"; moved confidence slider from preset 72% to 85%; sealed.
3. Test — verified lock by navigating back (saved prediction is read-only); ran the fair test → 98.5% (389 shared customers) → 59.4% (0 shared); identity ablation 67.4%.
4. Boundary — Observe/Explore/Boundary/Apply tabs; Explore disabled in sample ("Sample result stays fixed"); Boundary tab states the boundary; built a rule from pre-selected clauses (also tested "Write freely" — pre-filled with app text; overwrote with my own rule).
5. Apply — forecasting transfer: deliberately chose wrong answers first ("Random daily rows" + "Known item price") → "Transfer not yet passed"; then correct answers ("Time-ordered holdout" + "Centered rolling target") → passed. Verified ✓/× glyph behaviour on both selections.
6. Repair — unlocked only after transfer; verified patch; reached /proof page with Reasoning Diff, code diff, downloads. Downloaded and parsed the proof record (14 hash-chained events).

---

## Criterion-by-criterion assessment

### 1. Does it elicit the learner's ACTUAL belief (or funnel to a canned one)? — **PARTIAL / FUNNELS**
- Free-text claim exists, is required (button disabled at 0 chars), and is carried verbatim through Prediction, proof page ("Before"), and `beliefTest.learnerClaim` in the proof record. *Directly observed.*
- BUT: (a) "Use a starter claim" inserts a canned claim ("I think the high score means the model will work for completely new customers.") — one click, zero generation (agent5_28). *Reproduced.*
- (b) The operationalized belief — "Your current explanation" — is **system-written and identical across different learner claims** (run 1 custom claim and run 2 starter claim both produced exactly "The notebook's random-row test accuracy demonstrates generalization to new customers."). *Reproduced across 2 sessions.*
- (c) Proof record event 2 is `belief_test.proposed` with `actor=system`; the learner's only belief-level act is `belief_test.confirmed` (event 3). *Observed in generated artifact.*
- (d) "Edit my explanation" routes back to the Question step to rewrite the raw claim; the paraphrase itself is never editable. *Directly observed.*
- Net: the learner's own words are elicited at the surface, then mapped onto a fixed pair of canned models. There is no check that the paraphrase is faithful beyond a single confirm click.

### 2. Are two genuinely competing models presented? — **YES (strongest feature), but app-authored**
- Story A (reusable signal → "Accuracy should remain close to the notebook result when complete customers are held out") vs Story B (identity memorization → "Accuracy should fall materially under a customer-group split and after identity ablation"). Both fit the 0.985; their predictions genuinely diverge; the test discriminates (98.5% vs 59.4%, ablation 67.4%). *Directly observed.*
- Each model carries "Conditions and limits" and an explicit "does not claim" disclaimer. Good epistemic hygiene.
- Weakness: the learner never generates the alternative hypothesis; both are handed over fully written (actor=system, §1c). The "competition" is watched, not built.

### 3. Is the correct answer revealed prematurely? — **YES — FAIL (core mechanism undermined)**
- On the Prediction step, **before any seal**, the evidence card reads: "Cell 3 · output 0 — **This is the deceptive random-split headline under test.** accuracy: 0.985" (agent5_05/06). *Reproduced* (visible pre-seal in both sessions; also baked into `beliefTest.evidenceRefs[1].relevance` in the proof record).
- Same screen pre-discloses the fix: "The fairer test: Keep each customer's rows together, then remove customer ID," plus a hint accordion "Ask what each explanation predicts for customers that never appeared in training."
- A learner told the headline is "deceptive" can seal "Fall materially" and appear prescient; the sealed-prediction mechanic (whose entire pedagogical purpose is to defeat hindsight bias) is leaky by design. The lock moment (23:00:31) precedes result release (23:01:48) in the event chain, so the *result* is genuinely withheld — it is the *verdict language* that leaks. *Observed in generated artifact + Directly observed.*

### 4. Is the prediction immutable once committed? — **YES — PASS**
- After sealing, revisiting Prediction shows "Saved evidence is read-only. Start a new lesson if you want to make different choices." No edit affordance. *Reproduced.*
- `predictionContract.immutableHash` present; `prediction.committed` (learner, 23:00:31) strictly precedes `experiment.completed` (kernel, 23:01:48). *Observed in generated artifact.*

### 5. Is confidence elicited usefully? — **PARTIAL (recorded, never used)**
- Slider is **preset at 72%** (anchoring default); changeable (set to 85%, accepted). *Reproduced.*
- After sealing, confidence is never referenced again: no calibration feedback ("you were 85% confident and wrong"), no Brier-style scoring, absent from the Reasoning Diff except inside the "before" string. My sealed 85%-confident wrong prediction ends with "You can now distinguish…" — the metacognitive lesson (overconfidence) is silently dropped. *Directly observed + artifact.*

### 6. Are prediction consequences made visible? — **YES — PASS**
- Experiment Theater pins "Locked Prediction: Accuracy remains near 98%" directly above the 98.5% → 59.4% result (agent5_12). The falsification is visually unavoidable. *Directly observed.*

### 7. Is there productive cognitive conflict? — **PARTIAL (real discrepancy, pre-defused)**
- The 39-point drop is a genuinely strong discrepancy event for anyone who believed the headline.
- But conflict is blunted: the verdict ("deceptive") precedes the seal (§3); the interpretation is delivered instantly ("The model looked excellent on familiar customers. It struggled on customers it had never seen."); and the prediction options carry the reasoning in their subtitles ("The random split is benefiting from repeated identities"), so a cue-follower never has to commit to a genuine belief.

### 8. Does the learner interpret evidence, or is interpretation done for them? — **DONE FOR THEM**
- The result headline sentence, the "why" explanation, and the Boundary tab's conclusion ("The conclusion changes at the entity boundary. The verified whole-customer run has 0 shared customers; the random-row run has 389.") are all pre-written. *Directly observed.*
- The "Observe" tab self-marks "Completed" with no learner action. *Directly observed.*
- At no point does the app ask "what does 59.4% tell you?" or "which model survived, and why?" in the learner's words.

### 9. Does it explain WHY the evidence supports one model? — **PARTIAL-YES (controls pedagogy is good)**
- Test step explicitly teaches controlled comparison: Changed = evaluation unit (random rows → whole customers); Held fixed = model family, target, metric, preprocessing, seed; "Matches deployment" rationale. Identity ablation run (67.4%) triangulates the identity story. *Directly observed.*
- Gaps: the inferential leap from "score falls under group split" to "the model memorized customers" is asserted, not argued; the class-imbalance alternative hypothesis is mentioned only inside a collapsed accordion and is never tested interactively in the sample.

### 10. Does it distinguish "wrong answer" from "wrong mental model"? — **PARTIAL-YES**
- The framing is mental-model-first throughout: "Both models can fit the evidence so far," the rule is labeled "Your revised mental model," and the Reasoning Diff contrasts before/after beliefs — the artifact literally encodes model revision, not answer correction. *Directly observed + artifact.*
- Missing: the app never explicitly consoles/normalizes ("your prediction failed because your model of the evidence was incomplete, not because you reasoned badly"), and the transfer gate grades answer *choices*, not the model behind them.

### 11. Are boundary conditions taught? — **PARTIAL (stated, not discovered)**
- Boundary tab names the entity boundary; both models carry "Conditions and limits"; the proof record's `limitations` are honest ("does not prove global learner mastery").
- But the learner never *derives* a boundary: the one place they could probe it (Explore tab: change split boundary/identity feature/entity field/test size) is disabled in the sample ("Sample result stays fixed for a reproducible lesson"). *Directly observed.* Live-notebook path: *Could not test* (file inputs unavailable in audit environment).

### 12. Gotcha interactions? — **YES, several**
- (a) Pre-seal "deceptive headline" spoiler (§3).
- (b) **Transfer glyph inversion:** in the NOW timeline, selecting "Known item price" (wrong answer to "Which feature crosses NOW?") renders "**uses available information ✓**"; selecting "Centered rolling target" (the correct answer) renders "**reads later outcomes ×**" (agent5_21/23). The glyphs encode the feature's safety property, but sit directly beside the learner's selection where ✓/× conventionally means right/wrong — the correct answer is visually punished, the wrong one rewarded. *Reproduced in both directions.*
- (c) Rule-builder dropdowns default to the already-correct combination (zero-construction click-through).
- (d) "Write freely" textarea arrives pre-filled with the app's own rule text.
- (e) Failed-transfer hint dictates the answer, making the retry near-trivial (§14).
- (f) "Observe Completed" with no observation act.

### 13. Is transfer meaningfully different (surface change) or cosmetic? — **MEANINGFULLY DIFFERENT — PASS (well designed, over-scaffolded)**
- Genuine surface change: entity leakage (customers) → temporal leakage (forecasting). Same deep rule (evaluation must match what exists at decision time), new sub-discrimination (feature provenance across a NOW line) — this is structurally sound far-transfer design. *Directly observed.*
- Over-scaffolding: option subtitles ("Known when the prediction is made" / "Reads outcomes from later days") nearly answer the questions, and only one fixed transfer task exists (`forecasting-future-leakage-01`). *Observed in generated artifact.*

### 14. Is feedback given after failed transfer? — **YES — PASS with two flaws**
- Observed: "Transfer not yet passed. Use the NOW line: pick a test where training happens before testing, then remove any feature that reads values to the right of NOW. The patch remains locked." Non-punitive ("not yet"), actionable, and the Repair gate stays locked. `transfer.failed` recorded in the hash chain. *Reproduced + artifact.*
- Flaw 1: feedback does not say **which** of the two answers failed (split vs feature); the learner must guess the locus.
- Flaw 2: the hint restates the rule so directly that attempt 2 is answer-copying; unlimited silent retries; the UI's summary ("Transfer: Rule not yet tested → passed") erases the failure from the learner-facing record (only the JSON chain preserves it).

### 15. Can mastery be awarded from one task? — **YES — RISK REALIZED**
- After a single 2-item multiple-choice gate — passed on my second attempt, after an answer-revealing hint — the app declares "You applied the rule correctly," "Transfer status: Passed," and headlines "You can now distinguish 'good on familiar rows' from 'generalizes to new entities'." *Directly observed.*
- Credit where due: the proof record's own `limitations` concede "Passing transfer verifies fixed choices for this task; it does not prove global learner mastery." But the learner-facing UI language still overclaims relative to the evidence collected. For an education-track submission, this is the crux: the *impact claim* outruns the *assessment*.

### 16. Is learner agency preserved? — **PARTIAL**
- Real agency: free-text claim; "I am unsure" prediction; "Not enough evidence" / "Reject" escapes; "Write freely" rule mode; editable composed rule; genuine prediction choice; start-over control.
- Constrained agency: canned paraphrase and models (§1); pre-filled rule clauses and free-write; fixed sample experiment (no explorable variables); exactly one transfer task; repair performed by the system (§degeneration).

### 17. Is language non-humiliating on failure? — **YES — PASS**
- "Transfer not yet passed," "Both ideas could explain the high score," "CounterLab does not grade your prose," "Sealing an expectation before the fair test makes the later comparison honest." No blame, no shame framing observed anywhere in either run. *Directly observed.*

### 18. Is reflection supported? — **PARTIAL-YES**
- The When/I-should/because rule scaffold is an explicit reflection structure with evidence links per clause; the Reasoning Diff (belief/prediction/code/transfer, before→after, in the learner's own words) is a genuinely excellent reflective artifact and is downloadable in the proof bundle. *Directly observed + artifact.*
- But reflection is unresponded-to: prose is ungraded and unremarked; defaults allow skipping all generative reflection; no prompt asks the learner to explain the 39-point gap in their own words.

### 19. Useful final takeaway? — **YES**
- Portable rule + repaired notebook diff (train_test_split → GroupShuffleSplit, identity drop, overlap assert) + hash-chained proof record + reproduction commands. Concrete, inspectable, and behaviorally actionable. *Directly observed + artifact.*

### 20. Later review possible? — **PARTIAL-YES**
- Session and /proof URLs persist and restore full state (revisited across tabs/steps). Replay page (`/replay/leakage-01`) reconstructs the canned session ("not a live model run") with model/verifier/commit identifiers. *Directly observed.*
- No accounts, no library: lose the URL, lose the work. No spaced review, retrieval practice, or revisit prompt. One lesson exists (plus a second prompt-starter topic); nothing to return *to*.

### 21. Could this plausibly change future behaviour? — **PARTIAL (mechanism sound, engagement optional)**
- For an engaged learner, the loop (commit → falsify → revise → transfer → repair) matches strong evidence on prediction-update learning, and the repaired notebook gives a concrete behaviour to copy on Monday morning.
- But every generative moment has a one-click bypass (starter claim → canned paraphrase → cued prediction → pre-filled rule → answer-revealing hint → auto-repair). A passive finisher receives the same "You can now distinguish…" certificate as an active reasoner, and there is no follow-up measurement. Behaviour change is plausible for the engaged; unverifiable and unsupported for the passive.

---

## Degeneration map — where the design collapses into lesser genres

| Step | Intended genre | Degenerates into | Evidence |
|---|---|---|---|
| 1 Question | Belief elicitation | **Click-through wizard** (one-click starter claim, zero generated content) | agent5_28; Reproduced |
| 2 Prediction | Hypothesis comparison + sealed forecast | **Lecture + confirmation dialog** (both models and their predictions fully pre-written; learner clicks "Yes, this captures my view"); the seal is **quiz theatre** because the "deceptive headline" verdict already cues the correct option | agent5_05/06; artifact actor=system |
| 3 Test | Discriminating experiment | **Static simulation / canned demo** — "Run the fair test" plays a fixed recording; no learner-controllable variable; Explore disabled in sample | agent5_14 ("Sample result stays fixed") |
| 4 Boundary | Boundary discovery | **Lecture** — boundary stated verbatim ("The conclusion changes at the entity boundary"); Observe auto-completes | agent5_15 |
| 5a Apply (rule) | Generative reflection | **Cloze quiz with pre-selected correct answers**; ungraded prose; free-write pre-filled | agent5_17/18 |
| 5b Apply (transfer) | Far-transfer check | **Quiz** — 2 MC items, inverted ✓/× feedback semantics, answer-revealing hint, unlimited retries | agent5_21–24 |
| 6 Repair | Learner-guided fix | **Developer dashboard** — system-generated diff, hashes, verifier output; learner never edits code; repair is a reward screen | agent5_25/26 |
| Proof | Reflective certificate | **Developer dashboard + certificate** — strong artifact, but "You can now distinguish…" certifies mastery from one MC gate | agent5_26; artifact |

It does **not** degenerate into an AI answer generator in the sample path — no free-form LLM tutoring was observed; responses are fixed/recorded (replay: "not a live model run"). The risk is the opposite: so little generation that the learner is a witness.

## Acceptance tests for every pedagogical gap (black-box checkable)

1. **Pre-seal verdict leak (P1).** GIVEN a fresh sample session, WHEN on step 2 before pressing "Seal my prediction", THEN the DOM must not contain "deceptive", "under test"-style verdict strings, or the fixed-test description; verdict language appears only after `prediction.committed`. Check: text search on the Prediction screen pre-seal.
2. **System-authored models (P1).** GIVEN two sessions with materially different claims (e.g., "score is meaningless" vs "model works for new customers"), WHEN reaching Prediction, THEN "Your current explanation" must differ in substance, or the UI must ask the learner to state the explanation in their own words (empty-by-default textarea). Check: string equality across runs; presence of a required empty field.
3. **Transfer glyph semantics (P1).** GIVEN the transfer gate, WHEN the learner selects the keyed-correct feature ("Centered rolling target"), THEN no ×/red marker may appear adjacent to that selection; WHEN selecting the keyed-wrong feature, THEN no ✓/green marker may appear. Check: screenshot diff + DOM class inspection of the timeline annotation after each selection.
4. **Confidence consequences (P2).** GIVEN a sealed confidence c and a falsified prediction, WHEN the result and proof pages render, THEN they must display a calibration statement referencing c (e.g., "You were 85% confident; the score fell 39 points"). Check: text search for the sealed confidence value post-result.
5. **Learner-generated interpretation (P1).** GIVEN the result reveal, WHEN the learner proceeds, THEN at least one required free-text field (non-empty, not pre-filled) must ask for the interpretation or the boundary before the app states its own. Check: button disabled until N>0 chars in a learner-authored field; app conclusion text absent before submission.
6. **Rule construction (P2).** GIVEN the rule builder, WHEN it loads, THEN dropdowns have no default selection (or "Write freely" starts empty), and at least one distractor clause exists per slot. Check: initial select values; option counts ≥3 with at least one keyed-wrong option.
7. **Mastery evidence (P1).** GIVEN transfer passed, WHEN the proof page renders, THEN mastery language ("You can now distinguish…") is gated on ≥2 transfer tasks passed on first attempt, or is replaced with task-scoped language ("You applied the rule once — try it on a new surface"). Check: attempt count in proof record; UI string match.
8. **Failed-attempt visibility (P2).** GIVEN a failed then passed transfer, WHEN the proof page/Reasoning Diff renders, THEN the failed attempt and its feedback are visible. Check: "failed" appears in learner-facing summary, not only in the hash chain.
9. **Feedback locus (P2).** GIVEN a mixed wrong answer (one of two items wrong), WHEN feedback renders, THEN it identifies which sub-answer failed without naming the correct option. Check: feedback string references the failed dimension only.
10. **Sample interactivity (P2).** GIVEN the Explore tab in the sample, WHEN opened, THEN at least one variable (split type or identity feature) is manipulable with recomputed verified output, or the tab is labeled "demo only — disabled in sample". Check: presence of enabled controls; recomputation on change.
11. **Repair agency (P2).** GIVEN the Repair step, WHEN the patch is presented, THEN the learner must make at least one substantive choice (e.g., pick the grouping column, or select which of 3 candidate diffs is correct) before the patch is generated. Check: gate blocks "Verify notebook patch" until a learner selection exists.
12. **Prior-knowledge scaffolding (P2).** GIVEN a first-time session, WHEN technical terms first appear (split, ROC AUC, ablation, entity), THEN each has an inline definition affordance; a "new to ML?" path exists from the home page. Check: glossary elements present in DOM at first occurrence.
13. **Review persistence (P3).** GIVEN a completed proof, WHEN the learner returns to the home page from the same browser, THEN a "your sessions" list or equivalent restores past work without the URL. Check: home page lists prior session(s).
14. **Starter-claim labelling (P3).** GIVEN the starter claim is used, WHEN the belief is later displayed as "Your claim", THEN it is marked as template-assisted, or the seal requires ≥1 learner edit. Check: claim provenance flag in UI or proof record.

## Is the learning objective well-chosen? Prior-knowledge scaffolding?

**Objective quality — YES, well-chosen for the claimed audience.** Entity leakage and class imbalance in scikit-learn notebooks are (a) endemic in real practitioner work, (b) rarely taught experientially (usually as a bullet point), (c) perfectly suited to the "competing models + discriminating test" format because the fix and its effect are mechanically demonstrable. The churn scenario is concrete, and the class-imbalance alternative is at least acknowledged. For data-science practitioners and advanced students — the audience implied by "attach your Jupyter notebook" and the prompt starters — this is high-value content.

**Non-expert accessibility — NO, scaffolding insufficient.** The lesson assumes, without defining: train/test splits, accuracy vs ROC AUC, features vs identifiers, "identity ablation," seeds, preprocessing. First uses carry no glossary or definition affordance; hint accordions explain *why steps exist*, not *what terms mean*. The home page offers no novice path. A non-expert can click through (the canned path guarantees completion) but cannot build the prerequisite concepts from anything in the product. Severity P2 for the education track: the demo is fully usable only by people who mostly already know the trap.

## Summary scores (0 = absent, 1 = partial, 2 = convincing)

Belief elicitation 1 · Competing models 2 · No premature reveal 0 · Immutability 2 · Confidence use 1 · Consequences visible 2 · Cognitive conflict 1 · Learner interprets 0 · Why-explanation 1 · Wrong-model framing 1 · Boundaries 1 · No gotchas 0 · Transfer quality 2 · Failure feedback 1 · Mastery evidence 0 · Agency 1 · Non-humiliating 2 · Reflection 1 · Takeaway 2 · Review persistence 1 · Behaviour-change plausibility 1 — **Total 23/42.**

**Verdict: PARTIAL.** The architecture (sealed immutable prediction → verified falsification → rule → surface-changed transfer → repair → reasoning diff) is genuinely learner-centred in design and unusually honest in its artifacts. The execution funnels the learner into confirming system-authored content at nearly every generative moment, leaks the verdict before the seal, and certifies mastery from a single cued quiz — so the realised experience is closer to a well-instrumented lecture with a locked answer sheet than to the "scientific debugger for beliefs" it promises.
