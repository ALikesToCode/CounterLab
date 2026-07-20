# 04 — Judge Mode & Hackathon Story Audit (Agent 3)

**Target:** https://counterlab.cserules.workers.dev/judge (+ cross-reference: `/`, `/new`, `/session/<uuid>`, `/proof/<uuid>`, `/replay/leakage-01`)
**Audit date:** 2026-07-19 · **Deadline:** 2026-07-21 5PM PT (~3 days)
**Method:** black-box, ordinary-user browser interactions only. Four timed judge simulations (20s / 60s / 3min / 10min), then deep inspection of all judge-facing evidence, including two downloaded artifacts (proof record JSON, repaired .ipynb) analyzed locally.
**Artifacts collected:** 33 screenshots (`evidence/screenshots/agent3_*.png`), proof record (`evidence/artifacts/agent3_proof_record_sample_session.json`), repaired notebook (`evidence/artifacts/agent3_repaired_notebook_sample.ipynb`). Hash-mismatch corroborated against `agent2_proof_record_leakage-01.json` (independent session by Agent 2).

---

## SIMULATION A — TWENTY-SECOND TEST (cold open of /judge)

Above the fold + one scroll. Verbatim answers a cold judge can give:

| Question | Answer after ~20s | Clear? | Cause if unclear |
|---|---|---|---|
| What is CounterLab? | "Turns a notebook claim into two competing models, locks the learner's prediction, and lets fixed computation — not fluent prose — decide what the evidence supports." (hero subhead, verbatim) | **Yes** | — |
| Who is it for? | Not stated on /judge. Inferable only as "learners" (header link "Learner view") working on "Python/scikit-learn Jupyter notebooks" (fine print) — i.e., ML/data-science students. | **No** | Missing copy: no audience statement anywhere on the page ("for ML students / instructors" never appears). |
| What problem does it solve? | A high notebook score can be an artifact: "Random rows 98.5% (389 shared customers) ≠ Whole customers 59.4% (0 shared customers)" — the demo itself shows the problem. That chatbots give fluent but unverified answers is implied ("not fluent prose"). | **Mostly** | Requires one inference step (the reader must connect "leakage" to "why learners are misled"); terminology ("entity leakage") unexplained above the fold. |
| What should I click? | "Start sample →" (primary button) or "Watch verified replay" (secondary). | **Yes** | — |
| What makes it different from ChatGPT? | "Chatbots explain. CounterLab lets reality answer." + Four-authorities strip: GPT-5.6 frames, Codex compiles, fixed kernel computes, frozen verifier decides. | **Yes** (conceptually) | The *mechanism* difference (fixed code vs. prose) is clear; what Codex concretely generates is not visible without running the loop. |
| Real product or prerecorded demo? | Both, explicitly labelled: three evidence modes — Sample ("always labelled as a sample"), Live ("Deployed live authority is configured" + preflight on /new), Replay ("persistent replay banner", "no new model call"). | **Yes** | Residual scepticism: the live mode is the only unscripted one and cannot be exercised without uploading a supported notebook (judges won't have one). |
| What does Codex do? | "Runtime Codex — Compiles the test plan" (authority B). In-product depth (adapter source hash, commit hash, compilation events) exists but only inside a downloaded proof record. | **Mostly** | Hidden info: no build-time Codex provenance at all (no Session ID, README, video, or repo mention — verified absent via find: "Session ID", "repository", "github" all not found on /judge). |
| What evidence is trustworthy? | The page pre-answers this unusually well: "What the evidence can claim — Bounded proof, visible limitations" + "Known boundary — CounterLab does not claim universal notebook support… A Proof Capsule proves integrity and scoped verification — not global mastery or formal sandbox security." | **Yes** | Weakened later by in-app contradictions (empty telemetry drawer, dual result hashes — see Findings F4, F6). |

**20s verdict:** The hero communicates the insight, the differentiator, and the next click fast. The two gaps a cold judge hits immediately: *who is this for* (never said) and *Codex-in-the-build* provenance (absent from the surface where judges land).

---

## SIMULATION B — SIXTY-SECOND TEST

Can a judge see each item in ≤60s? (Clicks counted from /judge cold load.)

| # | Item | ≤60s? | Exactly where | Clicks |
|---|---|---|---|---|
| 1 | Central product insight | **Yes** | Hero card: "This score proves the model works for customers it has never seen. Random rows 98.5% ≠ Whole customers 59.4%." | 0 |
| 2 | A learner prediction | **Static proxy yes / interactive no** | Hero shows the *claim* ("This score proves…"); an actual sealed learner prediction requires entering the sample: Start sample → starter claim → "Compare two explanations" → "Yes, this captures my view" → choose expectation → "Seal my prediction" | 0 (static) / ~6 (real) |
| 3 | A discriminating experiment | **Yes (static)** | Hero card shows both conditions with shared-customer counts (389 vs 0). A *live* discriminating run needs the full sample loop | 0 (static) |
| 4 | A verified result | **Partial** | Hero badge "VERIFIED TEST / FIXED-KERNEL EVIDENCE" is a claim; the actual verification evidence (hash chain, verifier report, HMAC) only exists inside the full loop (~25 clicks) or its downloaded proof record. The replay shows a stored verified result in ~4 clicks but its proof download is disabled | 0 (claim) / 25+ (artifact) |
| 5 | Clear AI-generated vs fixed separation | **Yes** | "Generated vs. computed vs. verified — Four authorities. No blurred hand-offs." strip; reinforced in-session ("Mode: Verified sample · Result authority: Fixed kernel · Release state: Verified plan; result not released") | 0 (1 scroll) |
| 6 | Meaningful use of Codex | **Yes (claim level)** | Authority B card "Runtime Codex compiles the test plan". Substance (codex-actor events, adapter sha256, commit hash) only in downloaded capsule | 0 (claim) |
| 7 | Credible education outcome | **Partial** | 6-step loop (Question→Prediction→Test→Boundary→Apply→Repair) + release gate ("Repair stays locked until the learner applies the rule in a changed context") + Reasoning Diff concept. **No measured learning outcomes anywhere** (no data, pilot, or learner evidence) | 0 (mechanism only) |

**60s verdict:** Mechanism story: excellent (6/7 visible in one scroll). *Demonstrated evidence* story: weak — every artifact-level proof (sealed prediction event, verified hash chain, capsule) is gated behind a ~10-minute interactive loop; nothing downloadable or inspectable is offered directly from /judge.

---

## SIMULATION C — THREE-MINUTE TEST (full planned demo story)

Planned arc: **belief → prediction → experiment → verification → boundary → transfer → repair → proof**. Walked end-to-end in the sample lesson (session_8fca6bad, INSTANT SAMPLE badge).

| Beat | Supported without developer explanation? | Notes |
|---|---|---|
| Belief | **Yes** | Starter claims provided; "I think the high score means the model will work for completely new customers." |
| Prediction | **Yes** | Two competing explanations framed (GPT-5.6); expectation + confidence sealed *before* result visible; gating enforced (Run button appears only after sealing) |
| Experiment | **Yes** | "Run the fair test" → 3-run table (random rows 98.5%/0.984 AUC, customer group 59.4%/0.641, identity ablation 67.4%/0.725; seed 1729; overlap counts) + result hash |
| Verification | **Yes (labels)** | "Test plan verified", "Result authority: Fixed kernel", release states shown. Depth only in capsule |
| Boundary | **Yes** | "The conclusion changes at the entity boundary… 0 shared customers vs 389" |
| Transfer | **BREAK #1** | Gate failed twice with the combination the UI's own instruction + ✓ icon point to ("Known item price — uses available information ✓"); it passes only with the ×-marked "Centered rolling target" as the answer to "Which feature crosses NOW?" (Issue A3-02). Recovered via error hint; a judge speed-running will very likely stumble here |
| Repair | **Yes** | Bounded patch preview (changes vs preserves); raw unified diff of cell 3; unrelated hashes unchanged |
| Proof | **Yes (payoff strong)** | /proof/<uuid>: Reasoning Diff table, downloads. Proof record = 16 hash-chained events (system/learner/codex/verifier/kernel actors), HMAC-signed, honest limitations. **BREAK #2:** the on-page "Evidence & proof" drawer simultaneously claims "0 events / No activity evidence yet" across all six tabs (Issue A3-01) |

**Measured duration:** 9m55s for the full interactive loop (proof events 21:32:48→21:42:43) — the story **cannot actually be completed in 3 minutes**; the "twenty seconds" hero claim covers only the static card. Replay walkthrough: ~4–5 min, and it is *not* passive — the judge must re-solve the transfer gate (Issue A3-03 family).

**Breaks summary:** (1) transfer polarity contradiction; (2) empty telemetry drawer contradicting the capsule; (3) replay "Preparing proof" perpetual spinner + unexplained disabled downloads; (4) duration mismatch vs marketing. Arc is completable and the payoff artifact is genuine — but a sceptical judge hits 2–3 moments that look like bugs.

---

## SIMULATION D — TEN-MINUTE TEST (every judge path)

| Path | Result |
|---|---|
| Sample mode (/judge → Start sample) | **Works end-to-end** → /session/<uuid> → /proof/<uuid>; badges "INSTANT SAMPLE" throughout; result hash a6ae7652e04e…; downloads genuine |
| Live mode (/judge → Run live → /new) | Preflight **passes** ("Notebook lesson tools are ready to try", "Hosted notebook runner is ready"). **Break at upload:** wizard shows perpetual "Preparing artifact…" LOADING card; the only upload control is a low-prominence "Use a different notebook → Choose File" link; no primary CTA (Issue A3-06). Full live generation **could not be tested** (browser cannot set file inputs; no downloadable sample .ipynb offered for re-upload) |
| Replay mode (/replay/leakage-01) | **Works end-to-end**; persistent "Verified replay · Recorded 2026/7/14" banner + REPLAY MODE badge + stored chain (Model gpt-5.6-sol, Verifier leakage-verifier-v1, Commit 4f2f6472…). **Breaks:** disabled "Download proof record"/"Download repaired notebook" + perpetual "Preparing proof" with zero explanation (the /judge disclosure "legacy v1 replay… does not offer a Proof Capsule download" is never repeated in-app — Issue A3-03); stepper stuck at "Step 4 of 6" on the final screen (Issue A3-07) |
| "Checking deployed authority…" status | **Could not capture transient** (browser tools read DOM after ready); resolved to "Deployed live authority is configured" (green dot) on both cold loads. What it proves is not explained on-page — it is a self-reported config check, not a demonstrated live run |
| Reproduce-locally section | Shows `./scripts/test-all.sh`, `./scripts/run-mutations.sh leakage`, `./scripts/reproduce-session.sh leakage-01`, `./scripts/replay-patch.sh leakage-01`. **No repository URL, no pointer to the Devpost-submitted repo, no README link** (find: "repository"/"github" absent). Commands are unverifiable decoration for a web judge (Issue A3-05) — Devpost rules require a repo URL with README, but /judge never tells the judge where it is |
| Proof/artifact links from /judge | **None.** No way to inspect a Proof Capsule without completing the ~10-min loop; replay's capsule disabled. This is the single biggest judge-experience gap |
| Cross-links | /judge ↔ "Learner view" / ✓; /judge → /new ✓; /judge → /replay/leakage-01 ✓; sidebar "How proof works" is an anchor to a **single sentence**, not a method page (Issue A3-08) |
| /proof gating | Bogus UUID → graceful "Session not found" toast + redirect ✓; completed proof URL **persists and is shareable** across visits ✓ |
| ⌘K palette | **Could not test** — no keyboard-input tool; no clickable ⌘K trigger found in session/home DOM (Agent 1's screenshots suggest it exists) |
| Downloaded artifacts | Proof record: valid JSON, schemaVersion 1, 16 chained events (previousEventHash→eventHash), codex events `lab.compilation_started`/`patch.compilation_started`, externalVerifier with ~15 verified invariants (network_isolation, repeat_run_reproducibility…), fixture sha256, integrity block (hmac-sha256 signature), reproduction commands, candid limitations. Repaired notebook: valid nbformat 4, 5 cells, patch correctly applied (GroupShuffleSplit, customer_id dropped, overlap assertion) |

---

## FINDINGS

**Unclear CTAs:** F1. Live-mode upload has no primary CTA — "Preparing artifact…" loads forever while the real control is a tertiary "Use a different notebook" link (A3-06). F2. "How proof works" navigates nowhere (anchor to one sentence) (A3-08).

**Hidden technical strengths:** F3. The proof capsule is far stronger than its marketing: hash-chained event log with 5 actor types, codex compilation events, external-verifier invariants (network isolation, repeat-run reproducibility, resource limits, hidden-read denial), adapter/fixture hashes, HMAC signature, and *candid limitations* ("Docker enforcement is evidence for this local run, not a formal sandbox proof"). None of this is previewable from /judge — the page's single most persuasive technical asset is invisible until minute ~10. F3b. Failure events are preserved in the chain (my two `transfer.failed` events are in the capsule) — genuine telemetry, not a happy-path script.

**Unsupported claims:** F4. Studio drawer "0 events / No activity evidence yet… will appear here when the session produces it" — the session *did* produce 16 events (A3-01). F5. "See a belief break in twenty seconds" — interactive truth is ~10 min (A3-10). F6. "canonical_result_hash" invariant vs. two coexisting result hashes (below) (A3-04).

**Contradictory numbers/hashes (sceptical-judge bait):** F6. Legacy replay shows result hash `2501654264b9…`; a fresh sample session of the *same replay_id* shows `a6ae7652e04e…` with byte-identical metrics (98.5/59.4/67.4%, seed 1729). The v2 capsule bundles **both** (verifier's `lab.verified` cites the 2026-07-14 recording; `experiment.completed` carries the fresh hash) with no lineage label. Replay banner commit `4f2f6472…` (40 hex) ≠ `lab.verified.commitHash 1050fa76…` (32 hex). Corroborated in Agent 2's independent capsule. Nothing on-site explains either mismatch (A3-04).

**Excessive jargon:** F7. Moderate and mostly tamed ("fixed kernel", "frozen verifier", "authority", "release state", "entity boundary") — but "Runtime Codex compiles the test plan" never says *what artifact* Codex emits (an adapter), and "INSTANT SAMPLE" badge vs "Verified sample" mode label vs "sample lesson" are three names for one thing.

**Weak visual proof:** F8. Hero "VERIFIED TEST" card is styled like a terminal — good — but every verification visual on /judge is static text; there is no image of a capsule, diff, or verifier report. The Studio drawer (the natural place) is empty in both non-live modes (A3-01).

**Broken routes:** None found. /feedback → SPA fallback to home (no route; expected — Session ID lives on Devpost, but see F10).

**Stale states:** F9. "Preparing proof" (replay, perpetual) — A3-03; "Preparing artifact…" (live, perpetual without upload) — A3-06; replay stepper frozen at Step 4 of 6 — A3-07; drawer "0 events" — A3-01.

**Missing evidence:** F10. No Codex build provenance anywhere in-product: no /feedback Session ID mention, no demo-video link, no README/repo link ("Session ID", "repository", "github" all absent from /judge). Devpost carries these, but the surface judges actually browse does not (A3-05, A3-09). F11. No measured learning-outcome evidence (no pilot data, pre/post, or even a single learner quote) — Potential Impact rests entirely on mechanism plausibility. F12. No inspectable sample Proof Capsule link.

**Confusing live-vs-replay behaviour:** F13. Replay is *interactive* — the judge must re-answer the transfer gate — despite "/judge: read-only stored events". Controls are editable; outcomes are stored. Label honest, behaviour surprising (A3-03 related). F14. Replay disables both downloads without saying why; the explanation exists only back on /judge.

**Sceptical-judge challenges (anticipated):**
1. *"'Checking deployed authority…' — does it resolve? what does it prove?"* → Resolves to "Deployed live authority is configured" within page load (observed 2×). It proves only that the deployment self-reports credentials/config — it is never explained on-page, and a judge cannot exercise live mode without a supported notebook.
2. *"'Legacy v1 replay without Proof Capsule' — does that undercut the flagship artifact claim?"* → Partially. /judge discloses it honestly, but the replay UI then shows a forever-spinning "Preparing proof" + greyed downloads, which reads as *broken*, not *legacy*. And the flagship capsule's hash doesn't match the replay's — unexplained (A3-03, A3-04).
3. *"Do reproduce-locally commands prove anything without a repo link?"* → No. They are unverifiable set-dressing from the web surface alone (A3-05).
4. *"Is the HMAC signature verifiable?"* → Not by a judge: symmetric HMAC with a server-held key, no public verify endpoint or key publication; only internal consistency is checkable. The capsule's own limitations partially concede this (A3-09).
5. *"Is the 'verified result' just a canned fixture?"* → The numbers are deterministic and fixture-backed (disclosed); the v2 session genuinely recomputes (fresh hash) but cites the v1 recording — the story is defensible only if the lineage is explained, which it isn't (A3-04).

---

## SCORING vs DEVPOST CRITERIA (hands-on judge, based ONLY on /judge and what it reaches)

| Criterion | Score /25 | Rationale | What's missing for full marks |
|---|---|---|---|
| **Technological Implementation** | **18** | Four-authority architecture is real and visible; Codex is meaningfully in-product (plan compilation; codex-actor events, adapter hash in capsule); GPT-5.6 frames beliefs; fixed-kernel determinism; signed hash-chained capsule; preflight capability checks; honest limits. | Any build-time Codex provenance (−); repo link for the reproduce commands (−); working in-app telemetry drawer (−); explained hash lineage (−); live mode exercisable without BYO notebook (−). |
| **Design** | **18** | Coherent narrative arc, strong hierarchy, exemplary mode labelling (INSTANT SAMPLE / REPLAY MODE / LIVE GENERATION), gated proof payoff, polished hero. | Transfer-step polarity bug (−); three perpetual/stale states (−); empty transparency drawer (−); live upload CTA buried (−). |
| **Potential Impact** | **17** | Specific, credible wedge (entity leakage + class imbalance in sklearn notebooks); bounded claims increase credibility; Reasoning Diff is a plausible assessment artifact for instructors. | No learning-outcome evidence whatsoever (−); only two subject packs (−); no instructor/institution story or pilot (−). |
| **Quality of the Idea** | **20** | "Release gate for reasoning" is genuinely novel: prediction locked before result, repair gated on transfer, machine-checkable Proof Capsule, Reasoning Diff. Clearly distinct from chat tutors and from generic eval harnesses. | Replay interactivity blurs "watch a replay" (−); "experiment theater" could be read as scripted if hash questions go unanswered (−). |

**Judge-mode total: 73/100.** The product underneath likely scores higher than the /judge surface currently demonstrates — the gap is concentrated in *evidence surfacing* (F3, F4, F10, F12), not in substance.

---

## TOP FIXES BY SCORE LEVERAGE (full detail in work/agent3_issues.json)

1. **A3-01** — Populate the Evidence & proof drawer for sample/replay sessions (or link the session's capsule from the empty state). *P1.*
2. **A3-04** — Add lineage labels for v1-recorded vs v2-recomputed result hashes (and reconcile the two commit identifiers). *P2, high leverage.*
3. **A3-05/A3-09** — Add repo/README/video/Session-ID pointers to /judge (match Devpost submission). *P2/P3, cheap.*
4. **A3-02** — Fix transfer-step polarity: align the top instruction and ✓/× affordances with the gate ("identify the feature that crosses NOW"). *P2.*
5. **A3-03** — Replace replay "Preparing proof" spinner with "Proof Capsule unavailable for this legacy v1 recording — run the sample to generate one." *P2, one string.*
6. **A3-06** — Give live mode a primary upload CTA; resolve "Preparing artifact…" to an explicit awaiting-upload state. *P2.*
7. **A3-12 (new, low cost)** — Offer a downloadable/inspectable sample Proof Capsule directly from /judge. *P2.*

## COULD-NOT-TEST
- Live generation with a real uploaded notebook (browser cannot set file inputs; no sample .ipynb offered for download+re-upload).
- "Checking deployed authority…" transient state (DOM read post-ready; resolved state observed twice).
- ⌘K palette (no keyboard tool; no clickable trigger found).
- Drawer content for *live* sessions (may be live-only by design — if so, the empty-state copy is the bug).
- Session history/rediscovery (Agent 1 evidence suggests a history mechanism exists; not found from /judge or home sidebar in this session).
