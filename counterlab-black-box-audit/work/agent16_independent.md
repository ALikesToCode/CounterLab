# Agent 16 — Independent Red-Team Audit: CounterLab

**Target:** https://counterlab.cserules.workers.dev/ (+ /judge, /new, /replay/leakage-01, /session/*, /proof/*)
**Method:** Strict black-box, browser-only, ordinary-user interactions, inert strings. No source access. No other agent output read.
**Sessions exercised:** 4 sample sessions (1 completed end-to-end, 2 deliberately bricked via sceptical paths, 1 in-progress), 1 replay, judge dossier, live entry point, error routes.

---

## 1. Scope covered

| Area | Covered | Notes |
|---|---|---|
| Homepage | Yes | Claim box, Question/Notebook tabs, prompt starters, sample/replay/judge entries |
| Sample lesson | Yes — completed all 6 steps | Prediction sealed → test → boundary → apply → transfer → repair → proof downloads |
| Live notebook path | Partially | Upload blocked by tool limits (browser cannot set file inputs); entry flow and no-notebook behaviour observed |
| Replay (leakage-01) | Yes | Walked Test→Boundary→Apply; mode labelling checked |
| Judge mode (/judge) | Yes | Full dossier read |
| Hostile input battery | Yes | Correct claim, misconception, ambiguous, nonsense, one-word, Unicode/emoji/CJK/accented, inert HTML `<b>test</b>`, prompt injection |
| Error routes | Yes | /replay/does-not-exist-99, /session/session_garbage-… |
| Downloads | Yes | Proof record JSON (full 20-event hash chain), repaired notebook .ipynb |

**Could not test:** notebook upload (file-input limitation) and therefore the entire genuinely-live leg (live GPT-5.6 framing, live Codex plan, live kernel execution, live verification, unsupported-notebook refusal, upload validation); browser console/HAR; reproduction scripts (`./scripts/*`); whether the "external verifier" is a genuinely separate trust domain.

---

## 2. Five strongest positive aspects

1. **A real falsification arc, not confirmation-bait.** I sealed the wrong prediction ("remain near 98%", 72% confidence); the verified result contradicted it (98.5% → 59.4% on zero-overlap customers) and the UI foregrounded the contradiction ("You can now distinguish: good on familiar rows from generalizes to new entities"). [Directly observed] Wrong transfer answers were rejected with pedagogical guidance, repair stayed locked. [Reproduced]
2. **Genuinely inspectable proof artifacts.** The downloadable proof record is a 20-event, hash-chained, actor-attributed log (system/learner/codex/verifier/kernel) with immutable prediction hash, plan/result/report hashes, resource-limit evidence (networkDenied, containerUser 65532, wall/memory/process/file limits), 18 verifier invariants and 12 mutation tests. The repaired notebook is a valid .ipynb with only cell 3 changed, an overlap assertion, and fresh recomputed outputs. [Observed in generated artifact]
3. **Fail-closed trust behaviour.** Unknown replay id → "Result withheld… CounterLab will not substitute bundled sample evidence." Bricked session → same withholding. Replay banner: "reconstructs recorded events… not a live model run." Homepage: "Unsupported evidence is refused, not guessed." [Directly observed / Reproduced]
4. **Enforced prediction-before-result and repair-after-transfer ordering.** Event chain confirms `prediction.committed` (seq 4) precedes `experiment.completed` (seq 7); UI shows "Verified plan; result not released" until the learner runs the test; "Fix still locked" until transfer passes. [Observed in generated artifact + Directly observed]
5. **Honest boundary and limitation disclosures.** Judge dossier states only two reviewed Subject Packs are supported, refuses unknown packages/arbitrary execution, says "A Proof Capsule proves integrity and scoped verification—not global mastery or formal sandbox security"; every hypothesis card carries "does not prove global model quality or learner mastery"; the legacy replay is labelled as not offering a Proof Capsule. [Directly observed]

## 3. Five most severe defects

1. **P1 — Transfer gate contradicts its own instructions and visuals (reproduced).** The Apply step instructs: "Choose the split and feature that match what is available when a real prediction is made," and the timeline marks "Known item price" with ✓ "uses available information" and "Centered rolling target" with × "reads later outcomes." Yet the fixed-code gate FAILED the deployment-safe combination (time-ordered holdout + known price) three times and PASSED only when the future-leaking feature (centered rolling target) was selected. The proof artifact reveals the intended semantics ("identifiedRisks: centered_window_reads_future"; "Both center=True and the shuffled date split must be selected as code evidence") — i.e., the learner must *identify the leaky feature*, while the split question asks to *pick the good design*. The copy, the ✓/× markers, and the gate point in opposite directions on the feature axis. A correctly reasoning learner is punished; a learner who picks the leaky feature without understanding why passes. [Reproduced + Observed in generated artifact]
2. **P1 — Sceptical options brick the session with a raw internal error (reproduced twice, two triggers).** Prediction step → "More ways to respond" → "Reject" → edit claim → "Compare two explanations" yields `Invalid transition from REJECTED_BY_LEARNER to BELIEF_TEST_PROPOSED`; via "Not enough evidence" it yields `Invalid transition from INSUFFICIENT_EVIDENCE to BELIEF_TEST_PROPOSED`. The session then fails closed to "Result withheld" with no working recovery except abandoning the session ("Start over"). Internal state-machine names leak to the UI. Any judge or learner who pushes back on the framing — a core advertised interaction — kills their session. [Reproduced]
3. **P1 — The "Evidence & proof" drawer is dead in every observed state.** Footer shows "0 events" throughout a full 6-step session; all six tabs (Activity, Plan, Diff, Tests, Verifier, Provenance) report "No <tab> evidence yet. It will appear here when the session produces it." — even on the completed proof page whose own download contains 20 events. The flagship transparency surface is non-functional; the content exists only inside the downloaded JSON. [Reproduced across 3 sessions]
4. **P2 — Sample-mode "belief framing" is input-invariant while presented as personal.** The same "Your current explanation" ("The notebook's random-row test accuracy demonstrates generalization to new customers") and the same alternative appeared for a genuine misconception, an ambiguous claim, a nonsense/Unicode/HTML string, and a prompt-injection string — followed by "Does your current explanation capture what you mean?" The learner's claim is echoed but demonstrably does not shape the frame in the sample path (proof artifact: modelId is the template `leakage-customer-churn-belief-v1`). Judges who type two different claims will see identical framing and conclude the GPT framing is theatre in the only path most will try. Safety upside: the injection was completely inert. [Reproduced]
5. **P2 — Same result table carries two different "result" hashes across modes.** Sample session Boundary view: `result a6ae7652e04e…`; replay of the same recorded lesson: `result 2501654264b9…` — identical metrics. The artifact shows these are different hash domains (canonical result-set hash vs the stored verification's resultHash), but the UI labels both simply "result," silently undermining the cross-mode verifiability the product exists to provide. [Directly observed + Observed in generated artifact]

## 4. Devpost scores (0–25 each)

- **Technological Implementation: 17/25.** The verifiable-evidence architecture (event sourcing, hash chains, kernel/verifier separation, bounded plans, resource-limit evidence, mutation-tested verifier claims) is far above hackathon norm, and the sample leg demonstrably works end-to-end. But a session-bricking state-machine bug on advertised interactions, a completely dead evidence drawer, a self-contradictory scored gate, and an unverifiable live leg cap the score.
- **Design: 18/25.** Editorial, confident, unusually honest microcopy; strong step choreography and hint system. Dragged down by contradictory ✓/× signals at the scored moment, silently disabled CTAs (no validation message for short claims or missing notebook), raw internal error text, and stale step chrome on error pages.
- **Potential Impact: 17/25.** "CI for understanding" addresses a real, growing need (trusting ML results naively) with a credible wedge (ML-evaluation misconceptions). Near-term scope is two Subject Packs; impact depends on the unproven live path generalizing beyond canned fixtures.
- **Quality of the Idea: 21/25.** Genuinely novel packaging — sealed predictions, fixed-kernel adjudication, frozen verifier, hash-chained proof, transfer-gated repair — with rare honesty about what the evidence does not prove. Predict-Observe-Explain pedagogy is established, but this verified software embodiment is fresh.

**Total: 73/100.**

## 5. Verdicts on the challenge questions

1. **Is the end-to-end journey complete?** **Yes for sample and replay** (all six steps, proof record, repaired notebook, persistence across reloads). **The live leg is not completable without a notebook upload** (could not test); the claim-only homepage path routes into the upload-gated flow and silently drops the typed claim. Qualified pass with one unreachable leg.
2. **Is Codex visibly necessary?** **No.** In every observable path the plan and patch are fixed; Codex appears only as an actor label in the event JSON (`lab.compilation_started`, `patch.compilation_started`). Nothing visible demonstrates runtime compilation earning its place versus a template.
3. **Is verification visibly independent?** **Partially.** Distinct verifier actor, separate report hashes, invariant/mutation lists, and resource evidence are surfaced; but everything is self-hosted on the same deployment, the "external verifier" cannot be attested black-box, and the sample's verification is a stored 2026-07-14 record chained into a 2026-07-18 session as if at seq 6 — legitimate, but the interleaving is only visible if you download and read the JSON.
4. **Is it learner-centred?** **Yes in structure, undermined in practice.** Sealed predictions, ungraded reflection, evidence-linked clause builder, transfer-before-repair, hints with "Why?" — all genuinely learner-first. But the transfer gate punishes correct reasoning (defect 1) and the sceptical-response buttons crash the session (defect 2), which is anti-learner at the exact moments of engagement.
5. **Is novelty real?** **Yes.** The combination — belief contracts, immutable sealed predictions, fixed-kernel adjudication, frozen verification, proof capsules, repair gating — is not a chatbot skin. Scope is narrow (two packs, one concept each), but the idea is original and well-bounded.

## 6. Could-not-test list

- Notebook upload and the full live leg (browser cannot set file-upload inputs): live GPT-5.6 belief framing, live Codex plan compilation, live kernel execution, live independent verification, unsupported-notebook refusal, file validation, intake errors.
- Console/HAR/network-layer inspection (no tool access): cannot confirm which calls are live vs bundled.
- Reproduction scripts (`./scripts/reproduce-session.sh`, `replay-patch.sh`, `run-mutations.sh`, `test-all.sh`) — documented, not executable from this environment.
- Whether the frozen verifier is a separate trust domain (keys, environment) or same-process code.
- Behaviour under a genuinely unsupported notebook (refusal path) — requires upload.
- The class-imbalance Subject Pack (second advertised pack) — no entry point found without upload.
