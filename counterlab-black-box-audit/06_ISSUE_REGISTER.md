# 06 — MASTER ISSUE REGISTER

Cross-validated, deduplicated register of the CounterLab black-box audit (2026-07-19). 198 raw findings from 15 audit agents were clustered, then challenged by an independent red team, yielding **61 master issues**: **10 P0** (4 product defects + 6 submission-compliance risks), **19 P1** (14 product + 5 compliance), **23 P2**, **9 P3** (one P3 record is a rejected finding kept for transparency).

Validation legend: every product P0/P1 was reproduced by ≥2 independent agents unless marked otherwise. MB-002 carries an explicit post-upload 'could not test' caveat per the independent red team. Source-issue IDs reference per-agent JSON in `work/`.

# P0 — Submission, safety, or integrity blockers

## MB-001 — Learner scepticism paths ('Reject belief frame', 'Not enough evidence') permanently brick the session with raw internal state-machine error and no recovery
```text
Issue ID: MB-001
Severity: P0
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Reliability / state machine
Affected route: /session/<id> step 2 → 'More ways to respond' → 'Not enough evidence'; /session/<uuid> (step 2 Prediction → 'More ways to respond'); /session/<uuid> (terminal bricked states); /session/{id} — Step 2 P
Affected journey: V2 (also J34); Sample lesson, Prediction step, 'More ways to respond' → Reject; Sample lesson, Prediction step, 'More ways to respond' → Not enough evidence; Sample lesson; J34, J26
Affected user: learner or judge exploring the offered alternative responses at the Prediction step; learner or sceptical judge; learner; learner returning to a closed session
Affected Devpost criterion: Design
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Any sample session advanced to step 2 (claim submitted)
Reproduction steps: ["Step 2: expand 'More ways to respond'", "Click 'Not enough evidence' (session B: session_64faa932) or 'Reject' (session C: session_ed15dccb)", 'App returns to Step 1 with claim preserved and a refined hint, implying refinement is possible', "Click 'Compare two explanations' again"]
Expected behaviour: Resubmission succeeds (or the app clearly states the session is closed and offers a guided new-session path); no internal state names shown
Actual behaviour: Raw banner text 'Invalid transition from INSUFFICIENT_EVIDENCE to BELIEF_TEST_PROPOSED' (session B) and 'Invalid transition from REJECTED_BY_LEARNER to BELIEF_TEST_PROPOSED' (session C). Repeating the click repeats the error. No in-session recovery; 'Start over' abandons the session. Revisiting the URL later shows 'Result withheld. No verified result was released... Return to the test and try again.' with no actionable element. || Raw internal state-machine error text is displayed; the session then transitions to a terminal 'Result withheld' state; the suggested recovery ('Return to the test a…
Direct evidence:
  - [Reproduced] Exact raw error strings on screen after resubmission, both variants (evidence/screenshots/agent4_v2_resubmit_after_noevidence.png; agent4_v2_reject_brick.png)
  - [Reproduced] Repeat click yields identical error (persistent brick) (evidence/screenshots/agent4_v2_brick_repeat.png)
  - [Directly observed] Stale bricked session shows 'Result withheld' dead page; Studio drawer routes to it (evidence/screenshots/agent4_j34_stale_bricked.png; agent4_j26_switched.png)
  - [Reproduced] Exact strings 'Invalid transition from REJECTED_BY_LEARNER to BELIEF_TEST_PROPOSED' then 'Result withheld… CounterLab will not substitute bundled sample evidence for this session.' (agent16_nonsense_result.png, agent16_stuck_error.png)
  - [Directly observed] No retry control on the withheld screen; 'Start over' navigates to / and discards the session (agent16_stuck_error.png)
  - [Reproduced] Exact string 'Invalid transition from INSUFFICIENT_EVIDENCE to BELIEF_TEST_PROPOSED' displayed at top of Step 1 (agent16_resubmit_after_noevidence.png)
  - [Directly observed] error text and withheld screen (evidence/screenshots/agent10_invalid_transition_error.png)
  - [Observed in network response] state INSUFFICIENT_EVIDENCE; event belief_test.insufficient_evidence (/api/sessions/session_aadb0d7d-cf80-4cee-8621-a52fbc27f4f1)
  - [Reproduced] Dead page on both bricked sessions (evidence/screenshots/agent4_j34_stale_bricked.png; agent4_j26_switched.png)
Likely cause (inference, unverified): State machine records terminal learner states (INSUFFICIENT_EVIDENCE / REJECTED_BY_LEARNER) but the Question-step resubmission path attempts the BELIEF_TEST_PROPOSED transition without a permitted edge; error surfaces uncaught as raw text; UI misleadingly re-presents the Step-1 form as if refinement were possible || The learner-facing state machine lacks a REJECTED_BY_LEARNER → BELIEF_TEST_PROPOSE…
What remains unverified without source access: Whether an edited claim (vs identical text) also fails; whether live mode shares the bug || Whether the same gap exists in live sessions (upload not testable) and whether event log records the failure (drawer broken — see A16-04). || Whether the withheld terminal screen follows here as well (not re-…
Learner impact: A learner who engages with the two most pedagogically interesting buttons loses their whole session and sees developer internals || High: a learner who pushes back on the framing — an advertised, pedagogically desirable action — loses their whole session. || High: declaring insufficient evidence — a scientifically correct stance the UI explicitly o…
Judge impact: A judge clicking 'Reject' during evaluation bricks the demo with a raw state error — highly visible failure of the core loop || High: sceptical probing is the first thing an evaluator does; hitting an internal error and a dead session reads as fragile engineering. || High: both sceptical escape hatches are broken in the same way, suggesting the sad…
Trust impact: Undermines 'refused, not guessed' / robustness claims; leaks internal state names || Medium-high: raw state names undermine the 'frozen verifier/state discipline' story even though failing closed is the right instinct. || Medium-high. || Medium — the one honest refusal path is the buggiest path in the product. || Error copy promises a path that doe…
Recommended correction: Allow claim re-proposal from INSUFFICIENT_EVIDENCE/REJECTED_BY_LEARNER (add transitions) OR close those states explicitly: hide the resubmit form, show a human message ('This session is closed — start a new question') with a one-click new-session action; never render raw transition errors || Add the legitimate transition (re-proposal after learner rejection) as a first-class edge with its own event kind (e.g., belief_test.reproposed); gate the CTA on state validity; render user-safe error copy w…
Smallest acceptable correction: Catch the transition error client-side and replace the Step-1 form with a closed-session panel + 'Start a new question' button || Catch the transition error client-side, keep the session at Step 1, and show 'That response closed this explanation — edit your claim and compare again' while allowing resubmission through the valid endpoint. || Same client-side guard as A16-02: keep session at Step 1 w…
Acceptance criteria: After Reject/Not-enough-evidence, resubmission either succeeds or shows a closed-session panel with a working next action; no raw state text; deep-link to the session shows the same actionable panel || Reject → edit → resubmit reaches Prediction again with a new belief-test event recorded; no internal identifiers visible; session id unchanged and completable through Repair. || Not enough evidence → resubmit reaches Prediction again; no internal i…
Required regression test: E2E: sample session → step 2 → Reject → resubmit → assert no 'Invalid transition' text and a usable path forward; same for Not enough evidence || e2e: for both 'Reject' and 'Not enough evidence', resubmit and assert HTTP 2xx, Prediction step reached, and no /Invalid transition/ text in the DOM. || S…
Dependencies: State machine transition table; error boundary on session view; Session state machine; error-surfacing layer; A16-04 (drawer) for diagnosing recorded events.; Session state machine; A16-02.; None; A4-…
Estimated effort: S-M
Score leverage: Very high — removes a demo-killing crash on a judge-visible path
Related source issues: A4-01, A16-02, A16-03, A10-06, A4-07
```

## MB-002 — Live notebook journey (no-upload entry) silently dead-ends forever at 'Preparing artifact…' while /judge and /api/health claim live authority is 'configured' (misleading live-vs-sample state; post-upload path untestable)
```text
Issue ID: MB-002
Severity: P0
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Live-vs-sample integrity
Affected route: /new; /new (LIVE GENERATION) → step 1 Question; /new (Live generation) and /judge; /new -> Question step (live); /new → 'Continue with my notebook' (no file selected)
Affected journey: J04, J29, J33, V3; Judge or learner chooses Live notebook analysis ('Run live →' on /judge, or submits a claim on the homepage), then clicks 'Continue with my notebook →'.; judge 10-minute test — live…
Affected user: learner or judge attempting the advertised live notebook path; Learner with their own notebook; judge testing the live path; judge attempting the only unscripte…
Affected Devpost criterion: Technological Implementation
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Visit /new (readiness checks resolve green: 'Notebook lesson tools are ready to try', 'Hosted notebook runner is ready')
Reproduction steps: ["Click 'Continue with my notebook' without attaching a file", "Question step renders with 'Preparing artifact…', SHA-256 'Pending intake', 'Support decision: Pending', metric 'Not available'", "Type a claim — 'Compare two explanations' CTA never becomes enabled (observed ≥2 min across re-renders)", 'Navigate/scroll away: view resets to intake panel and typed claim is lost']
Expected behaviour: CTA blocked until an artifact is attached ('attach a notebook to continue'), or intake completes/fails with a visible error and retry; claims persist
Actual behaviour: Silent indefinite hang; no error, timeout, retry, or remediation; green readiness claims contradict the dead flow; /judge simultaneously advertises 'Deployed live authority is configured' and 'Run live' || The page immediately renders 'Uploaded notebook evidence — Preparing artifact…' with a perpetual loading chip although nothing was uploaded and no picker was shown. Integrity panel shows 'Notebook SHA-256: Pending intake, Evidence cells: 0, Support decision: Pending'. The primary CTA 'Compare two explanations' is disabled. The loading never resolves and no guidance appears; the only way forw…
Direct evidence:
  - [Reproduced] 'Preparing artifact…' + 'Pending intake' persist; submit CTA absent from interactive elements (evidence/screenshots/agent4_v3_live_continue.png; agent4_v3_live_deadend.png)
  - [Directly observed] /judge 'Deployed live authority is configured'; /new readiness checks green (evidence/screenshots/agent4_j02_judge_mid2.png; agent4_j04_new.png)
  - [Directly observed] 'Preparing artifact…' + 'Pending intake'/'Pending' integrity panel with disabled CTA; unchanged across two attempts and after waiting/scrolling. (evidence/screenshots/agent1_new_preparing.png)
  - [Directly observed] Claim typed on homepage ('agent1 inert probe…') present in the stalled step-1 textarea, confirming state carry-over. (evidence/screenshots/agent1_new_upload.png)
  - [Reproduced] perpetual 'Preparing artifact…' across interactions and revisit (evidence/screenshots/agent3_new_upload.png, agent3_new_upload_input.png)
  - [Directly observed] preflight passes on /new (evidence/screenshots/agent3_new_live_entry.png)
  - [Directly observed] False-loading state persisted through the session; starter-claim fill works but CTA stays disabled (agent6_51_live_upload.png, agent6_52_starter_claim.png, agent6_53_live_cta.png)
  - [Directly observed] 'Preparing artifact…', 'Pending intake', 'Pending' with no file chosen; CTA never enabled after typing 125-character claim (agent16_live_upload.png, agent16_home_correct_claim.png)
Likely cause (inference, unverified): No artifact-presence gate on the primary CTA; intake promise neither resolves nor rejects when no file was provided; no watchdog/timeout; readiness check measures config presence, not end-to-end liveness || The live flow navigates to the question step optimistically and waits for an artifact-intake event that is only triggered by the secondary 'Use a different notebook' input; no empty-artifact br…
What remains unverified without source access: Post-upload live behaviour COULD NOT BE TESTED (automation browser cannot set file inputs). Verified: entering live mode WITHOUT an upload dead-ends indefinitely at 'Preparing artifact… / Pending intake' with a disabled submit, while /judge and /api/health claim live authority 'configured'. Whether an uploaded notebook completes the live journey remains unverified.
Learner impact: The headline 'Test my notebook' journey silently dead-ends; typed work is lost || The flagship 'test your own notebook' path stalls on first click with a misleading 'Uploaded notebook evidence' label — users may believe an upload is in progress and wait indefinitely. || medium — first-time learners with a notebook may conclude live mode is broken |…
Judge impact: Judge clicking 'Run live' hits a dead flow that the dossier claims is configured — reads as misleading live-vs-sample || Judges exercising the Live mode (one of three advertised evidence modes) hit an apparent hang within two clicks. || medium-high — live mode is the only answer to 'is this a real product?'; its entry currently looks hung || A judg…
Trust impact: Direct contradiction between advertised capability and observed behaviour || A loading state that claims an artifact exists when none does undermines the 'we never guess' posture. || medium-high || Moderate: fake loading erodes trust in real loading states elsewhere. || Low-medium.
Recommended correction: Gate the CTA on artifact presence; add intake timeout + visible error + retry; make the readiness check end-to-end (ping a real runner) or downgrade the /judge claim to 'live mode unavailable in this deployment' || Gate the Question step on artifact presence: show an explicit attach dropzone as the primary state; only enter 'Preparing artifact…' after a file is selected; add timeout + error if intake stalls. || Make upload the primary CTA of step 1 in live mode; show the skeleton only during act…
Smallest acceptable correction: Disable 'Continue with my notebook' until a file is attached, and add a 30s intake timeout that surfaces an error with a 'use the sample lesson instead' escape || Change the empty state copy to 'No notebook attached yet — use Attach notebook below' and point the primary CTA at the file input. || Replace the pre-upload skeleton with 'Awaiting notebook — choose a supported .ipynb to begin' and renam…
Acceptance criteria: Without an upload the live flow cannot be entered; with intake failure the user sees a clear message and recovery within 60s; /judge live-availability text matches reality || With no file selected, no perpetual loading indicator is shown; the upload affordance is the primary visible action; after selecting a file, intake visibly progresses or errors within a bounded time. || No indefinite loading state without an in-flight task; primary upload CT…
Required regression test: E2E: /new with no file → CTA disabled; stubbed intake failure → visible error + sample escape; /judge availability text asserted against runner health endpoint || Fresh /new → Continue with my notebook → assert no spinner without an upload and a visible attach control; then attach a supported fixtur…
Dependencies: Artifact intake service; /judge availability probe; Real upload path (untestable in this audit) must be verified after the fix by Agent with file-input-capable tooling.; optional: expose sample notebo…
Estimated effort: M
Score leverage: Very high — fixes the largest honesty gap in the submission
Related source issues: A4-02, A1-03, A3-06, A6-07, A16-07
```

## MB-003 — In every publicly reachable flow the 'GPT-5.6' belief framing is a byte-identical template across unrelated claim classes (sensible/absurd/contradictory; insufficientEvidence:false; confidence 0.93), presented with personalizing copy ('does this capture your view?') — the model-facing authority claim is falsified in all testable paths
```text
Issue ID: MB-003
Severity: P0
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: AI authority / verification integrity
Affected route: /proof/<id> and /api/sessions/<id> (completed sample session); /session/<id> (Step 2 Prediction); /session/<id> (sample lesson), step 2 Prediction; /session/<id> step 2; /session/{id} — Step 2 Predict
Affected journey: Start sample → enter any claim → 'Compare two explanations'; Complete sample with an off-topic claim; Question -> Prediction; Sample lesson, Question → Prediction; Sample lesson
Affected user: learner (also judge evaluating AI claims); learner, judge, anyone verifying the capsule; learner who wrote a custom claim vs learner who used starter claim; lea…
Affected Devpost criterion: Technological Implementation
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: None (no account)
Reproduction steps: ["Open / and click 'Try verified sample'.", "Enter claim A: 'Purple bananas taste better on Tuesdays, therefore this notebook's score is meaningless.' → Compare two explanations.", 'Repeat in a fresh sample with claim B: a self-contradictory claim asserting both generalization and its negation.', 'Compare framed hypotheses across sessions and against swarm bundle agent5_proof_record.json (sensible churn claim).', 'Fetch /api/sessions/<id> and inspect beliefTest.']
Expected behaviour: Framing sensitive to the claim; off-topic/nonsense claims refused or flagged ('unsupported evidence is refused, not guessed'); contradictory claims detected.
Actual behaviour: currentHypothesis/competingHypothesis/evidenceRefs/alternatives/decisiveIntervention/uncertainty are BYTE-IDENTICAL across all three claims; only learnerClaim echoes input verbatim; uncertainty.confidence=0.93 and insufficientEvidence=false even for nonsense; the contradiction is never detected and the system arbitrarily keeps the 'generalizes' framing. belief_test.proposed event actor is 'system' with modelId 'leakage-customer-churn-belief-v1' (a prompt-template slug); there is no model/gpt actor in the event chain; proposed event outputHash differs per claim, so the hash binds the claim but …
Direct evidence:
  - [Reproduced] 3 sessions: agent5 (sensible), session_297ad7b7 (absurd), session_aadb0d7d (contradictory) → identical framing text (/api/sessions/session_297ad7b7-ec53-459e-b562-d006ec8d79d2 ; /api/sessions/session_aadb0d7d-cf80-4cee-8621-a52fbc27f4f1 ; evidence/agent5_proof_record.json)
  - [Observed in generated artifact] beliefTest.uncertainty {confidence:0.93, insufficientEvidence:false} for the purple-bananas claim (/api/sessions/session_297ad7b7-ec53-459e-b562-d006ec8d79d2)
  - [Directly observed] screenshots of step-2 framing for absurd and contradictory claims (evidence/screenshots/agent10_sample_step2_framing.png ; agent10_contradictory_framing.png)
  - [Observed in generated artifact] proof bundle fields (/api/sessions/session_297ad7b7-ec53-459e-b562-d006ec8d79d2)
  - [Directly observed] proof page Before/After (evidence/screenshots/agent10_sample_patch_verified.png)
  - [Reproduced] Identical paraphrase across two sessions with different claims (agent5_04 vs agent5_29; session_27c89195 vs session_e4c7ea89)
  - [Observed in generated artifact] events[1] belief_test.proposed actor=system; events[2] belief_test.confirmed actor=learner (evidence/agent5_proof_record.json)
  - [Reproduced] Identical framing across misconception, injection, ambiguous, nonsense inputs (agent16_after_claim.png, agent16_injection_result.png, agent16_ambiguous_result.png, agent16_nonsense_result.png)
  - [Observed in generated artifact] beliefTest.currentHypothesis/competingHypothesis identical across sessions; versions.model='leakage-customer-churn-belief-v1' (proof record JSON)
  - [Directly observed] Replay banner separately claims Model 'gpt-5.6-sol' for the recorded session (agent16_replay.png)
Likely cause (inference, unverified): Sample mode uses a stored Belief Spec template (modelId=leakage-customer-churn-belief-v1); no model is invoked in sample mode (judge page: 'no account or model credential'), and no input validation/refusal layer exists for claim text. || No semantic gate between claim intake and proof issuance; proof integrity covers tamper-evidence only, not meaningfulness. || Fixed belief-test template per conce…
What remains unverified without source access: Sample mode IS labelled canned ('Instant sample','bundled approved evidence') — the falsified elements are (a) the personalizing framing copy and (b) the GPT-5.6-forward dossier language; whether live uploaded-notebook sessions produce genuinely input-sensitive GPT-5.6 framing is untestable black-box.
Learner impact: Any words a learner writes are 'understood' as the same leakage misconception; the product pretends to have read and framed the learner's idea when it has not. || A learner can generate an authoritative-looking certificate for gibberish; the certificate's epistemic meaning collapses. || The learner's role collapses to confirming the tutor's framing…
Judge impact: The headline claim 'GPT-5.6 frames beliefs' is not demonstrated in the only two inspectable paths; judges testing with creative claims get canned output. || Judges can reproduce a 'verified proof' for a nonsense claim in ~3 minutes. || A judge testing two different claims sees identical follow-through, reading as scripted || High: two different typ…
Trust impact: Core epistemic promise ('reality answers, not prose') is violated at the framing layer: prose is templated and never refuses. || High — the product's output artifact does not mean what it appears to mean. || Claim of learner-centred elicitation is overstated || Medium-high: mild illusion of understanding at the product's signature step. || Medium —…
Recommended correction: Label sample framing as a pre-authored example ('In this sample, the belief spec is pre-written; live mode frames your claim'), and/or invoke the real model in sample mode; add claim-level sufficiency checks that set insufficientEvidence=true and refuse off-topic input. || Gate proof issuance on a meaningful claim-binding check; at minimum surface claim/framing mismatch warnings in the capsule. || Require a learner-authored model statement (empty textarea) before showing the system pair; or visi…
Smallest acceptable correction: Add an in-flow disclosure line on step 2: 'These two explanations are pre-authored for the bundled sample, not generated from your claim.' || Add a visible 'claim was not analyzed' flag in the capsule when running in template mode. || Relabel 'Your current explanation' as 'One explanation that fits your claim' and add required 1-sentence learner restatement before the seal || One disclosure line o…
Acceptance criteria: Two different claims produce visibly different framings OR the UI explicitly labels the framing as pre-authored; nonsense claims trigger a visible insufficient-evidence state. || Nonsense claims cannot yield a VERIFIED capsule without explicit warning. || Different claims yield visibly different explanation cards, or a mandatory learner-authored explanation field (empty by default) gates the seal || A judge typing two different claims sees either…
Required regression test: Submit 3 semantically distinct claims; assert framings differ or disclosure banner present; assert nonsense claim yields insufficientEvidence=true or refusal. || E2E: nonsense claim → assert refusal or conspicuous warning in bundle. || Two sessions with claims 'the score is meaningless' vs 'model ge…
Dependencies: None for disclosure; model-backed framing depends on live pipeline.; A10-01; none; None (copy-only in sample mode).; None
Estimated effort: S (disclosure) / M (input-sensitive framing + refusal)
Score leverage: High — directly undermines the Technological Implementation narrative if unaddressed.
Related source issues: A10-01, A5-02, A16-05, A10-10
```

## MB-004 — 'Runtime Codex' is not demonstrable in any reachable path: codex events carry empty payloads, compile→verify completes in ~360 ms, and every compiled artifact is the 2026-07-14 stored fixture (sample-styled evidence served inside live-styled /new sessions)
```text
Issue ID: MB-004
Severity: P0
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: AI authority / Codex evidence
Affected route: /judge, /; /session/<id> (sample) vs /replay/leakage-01; /session/<id> steps 3 and 6; /api/sessions/<id>/events; /session/<uuid> (sample), /replay/<id>, /judge; /session/{id}, /replay/leakage-01, /jud
Affected journey: Sample lesson through Test and Repair; all steps; Learner/judge runs the sample fair test believing the kernel computed it live; judge 20s/60s tests; Sample lesson Test step and Proof page; All observ…
Affected user: judge (technical due diligence); learner (indirect); first-time learner; OpenAI Build Week judge; Learner and judge; judge who browses the app before/alongside …
Affected Devpost criterion: Technological Implementation
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Complete prediction lock in a sample session
Reproduction steps: ['Complete a sample session; fetch /api/sessions/<id>/events.', 'Inspect codex-actor events (lab.compilation_started, patch.compilation_started).', 'Compare timestamps with the following verifier events; inspect lab.verified payload.']
Expected behaviour: Codex compiles a bounded plan at runtime, emitting artifacts (plan, adapter, tests) attributable to the session; verification follows compilation.
Actual behaviour: codex events carry payload:{} and empty outputHashes — no plan, adapter, tests, or diff anywhere in the event stream. lab.verified fires 360ms after compilation_started with source 'stored-approved-leakage-v1', recordedAt 2026-07-14T11:18:03Z (5 days before the session), image counterlab-runner:local. patch.verified fires 1.17s after patch.compilation_started; patchHash 18712546… and diff bytes are identical across independent sessions and to the replay's stored patch. No *.compilation_completed event exists. || No Codex/model attribution anywhere in the product UI; attribution exists only in …
Direct evidence:
  - [Observed in network response] events seq 5/6 and 13/14 with timestamps and payloads (/api/sessions/session_297ad7b7-ec53-459e-b562-d006ec8d79d2/events)
  - [Reproduced] generatedAdapter.sha256 ed70072a…, commitHash 1050fa76…, publicTestsReportHash 30663c3b…, patchHash 18712546… identical in agent5's independent bundle (evidence/agent5_proof_record.json)
  - [Directly observed] Zero Codex mentions on homepage, all 6 wizard steps, proof page, drawers, palette (evidence/screenshots/agent2_01..agent2_38)
  - [Observed in generated artifact] proof bundle events with actor='codex'; generatedAdapter sha256 ed70072a..., commit 1050fa76... (evidence/artifacts/agent2_proof_record_leakage-01.json)
  - [Directly observed] Replay metadata 'Model: gpt-5.6-sol' (evidence/screenshots/agent2_35_replay.png)
  - [Observed in network response] lab.verified payload: source 'stored-approved-leakage-v1', recordedAt 2026-07-14, image counterlab-runner:local; identical resultHash across my session and three prior agents' bundles. (/api/sessions/session_f0a81fbb-.../events and artifacts/agent2_proof_record_leakage-01.json)
  - [Observed in generated artifact] versions.environment = 'Cloudflare Worker with recorded local Docker runner evidence'. (artifacts/agent2_proof_record_leakage-01.json (versions block))
  - [Directly observed] Judge page authority C copy 'Fixed kernel - Computes every number'; replay banner 'This path reconstructs recorded events and computed payloads. It is not a live model run.' (browser visits to /judge and /replay/leakage-01)
  - [Directly observed] strings absent on /judge (browser_find results 2026-07-19)
  - [Documented publicly] Devpost requires repo URL, README, <3min video with audio covering Codex and GPT-5.6 use, /feedback Session ID (https://openai-build-week.devpost.com/rules)
Likely cause (inference, unverified): Sample/replay modes serve the stored-approved fixture from 2026-07-14 and emit marker events to simulate the live pipeline; live Codex is only wired to the untestable /new path. || Attribution surfaced only in the proof bundle schema, never projected into UI components. || Workers cannot run the Docker sandbox, so sample/replay serve the pre-verified recorded result for determinism and cost; marke…
What remains unverified without source access: Whether /new live mode performs real Codex compilation (health endpoint claims liveCodex: configured). || Whether Judge Mode (/judge) surfaces Codex usage (assigned to another agent). || Whether the LIVE path (/new, uploaded notebook) genuinely executes on a live kernel (untestable: file input unava… 'HMAC-signed' is declared (integrity.mode) but not key-verifiable black-box; no public verification endpoint.
Learner impact: Streamed 'compiling/verifying' progress is theatre; learners watching 'Codex at work' see a replay. || Low for learning; relevant to 'what is generated?' comprehension (cold-pass Q9 unanswerable). || A learner may believe a live computation just happened for their specific session when it is a canned result; the pedagogy still works but the claim i…
Judge impact: Criterion 1 asks 'how thoroughly and skillfully does the project use Codex' — in every judge-reachable path the answer is: it doesn't run; the only genuine Codex/verifier trace (compilerTrace in the replay API) shows two REJECTED runs and a later regeneration, and is never shown in the UI. || High for an OpenAI Build Week submission: a judge using …
Trust impact: The four-authority architecture diagram ('Runtime Codex compiles the test plan… No blurred hand-offs') is not operative in demo paths. || Generated artifacts (reframed explanation, patch diff) look hand-authored; provenance story incomplete. || Medium-High - the product is otherwise unusually candid; this one gap stands out. || medium || Medium-hig…
Recommended correction: Either wire sample mode to the real pipeline (cheap fixture-backed kernel but genuinely compiled plan), or label the sample as 'recorded pipeline evidence' at the Test/Repair steps, and surface the compilerTrace (including rejections) in the replay UI. || Attribute Codex-generated artifacts in place: e.g. 'Patch generated by Codex (model gpt-5.6-sol, commit 4f2f6472), verified by leakage-verifier-v1' on the diff; mark the explanation reframe as AI-generated (see A2-15). || Label the sample path …
Smallest acceptable correction: Change step-3 copy from 'CounterLab verified the plan' to 'This plan was verified once on 2026-07-14; the sample replays that evidence' and link the compilerTrace. || Add one provenance line under the verified notebook change and under 'Your current explanation' naming the generator model. || Add one line on step 3 of the sample ('Result authority: Fixed kernel - recorded verified run, replayed de…
Acceptance criteria: codex events contain compiled artifact hashes produced after session start, or UI/API clearly marks the compilation as recorded replay. || A learner can state where Codex appears after using the product; attribution matches bundle actor/model fields. || A user can tell, without reading the API, that sample/replay results are recorded; live vs recorded modes are explicitly distinguished in the UI. || /judge contains resolvable pointers to all thre…
Required regression test: Create session; assert (lab.verified.timestamp - lab.compilation_started.timestamp) is consistent with real compilation OR lab.verified.payload.recordedAt is disclosed in UI. || Text search for 'Codex' or model id on /session and /proof pages in E2E test. || Run two sample sessions; if hashes are id…
Dependencies: None for labelling; real compilation needs live worker pipeline.; None.; final Session ID / video / repo URL; None; A16-05 (same disclosure pattern).
Estimated effort: S (label) / L (real per-session compilation)
Score leverage: High — the Codex-usage criterion is the published tiebreaker.
Related source issues: A10-02, A2-04, A9-04, A3-09, A10-03, A16-13
```

## MB-C01 — Submission: /feedback Codex Session ID may be missing — required field; absence = incomplete submission (UNVERIFIED — submission page not public)
```text
Issue ID: MB-C01
Severity: P0
Confidence: high (requirement documented); unverified whether CounterLab has entered one
Reproducibility: not reproducible externally — submission form requires entrant account
Category: Submission compliance
Affected route: Devpost 'Enter a Submission' form (openai.devpost.com)
Affected journey: pre-submission
Affected user: CounterLab entrant (preparing submission); judge screening for required fields
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Entrant built majority of core functionality in a Codex thread and ran /feedback in it
Reproduction steps: ['Open the submission form', 'Locate the /feedback Codex Session ID field', 'Paste the Session ID from the primary build thread (not a side/test thread)']
Expected behaviour: A valid Session ID from the thread where the majority of core functionality was built is present in the form
Actual behaviour: Could not test — form is entrant-only; no public evidence a Session ID exists
Direct evidence:
  - [Requirement (homepage)] "/feedback Codex Session ID where the majority of the core functionality where you built your Project, get the /feedback session ID and input it into your submission form" (https://openai.devpost.com/ (accessed 2026-07-19))
  - [Requirement (FAQ)] "In Codex, run /feedback in the thread where you did the majority of your core work... Copy it and paste it into the submission form. You should use the thread where most of your core functionality was built — not a side (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
Likely cause (inference, unverified): Team unaware the ID must come from the primary build thread, or build happened outside Codex
What remains unverified without source access: True
Learner impact: none (submission-side)
Judge impact: Cannot verify mandated Codex usage; Stage One/screening risk
Trust impact: high if missing — core proof-of-process absent
Recommended correction: Run /feedback in the primary Codex build thread now; paste ID into the form; reference the thread's role in the README
Smallest acceptable correction: Paste the existing primary-thread Session ID into the form field
Acceptance criteria: Submission form contains a Session ID generated from the thread where the majority of core functionality was built
Required regression test: Before final submit, re-open form draft and confirm the Session ID field is populated and matches the main build thread
Dependencies: ['A14-04']
Estimated effort: S
Score leverage: high — gating artifact for the Codex-usage requirement
Related source issues: A14-01
```

## MB-C02 — Submission: video must carry audible voiceover covering what was built + how Codex was used + how GPT-5.6 is used; music-only explicitly fails (UNVERIFIED — video not public)
```text
Issue ID: MB-C02
Severity: P0
Confidence: high (requirement documented verbatim); unverified whether CounterLab's video complies
Reproducibility: not reproducible — video not yet public / not findable
Category: Submission compliance
Affected route: Submission form video field (public YouTube URL)
Affected journey: submission-only judging
Affected user: judge watching the video; entrant producing it
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Video recorded, narrated, uploaded as PUBLIC YouTube
Reproduction steps: ['Record <=3:00 demo with audible narration', 'Narration states: what the project does; how Codex was used to build it (specific workflow moments); how GPT-5.6 is integrated and what it does', 'Upload to YouTube as public; paste link in form']
Expected behaviour: Public YouTube video, <=3:00, with voiceover explicitly covering all three mandated topics
Actual behaviour: Could not test — no video found
Direct evidence:
  - [Video rules (FAQ)] "Your demo video must: Be 3 minutes or under... Be uploaded to YouTube as a public video... Include a voiceover (you can use AI to help record or narrate)... Cover what you built AND how you used Codex AND how you used G (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
  - [Voiceover strictness] "A screencast with background music won't cut it. Judges need to hear, in your own words (or AI-assisted narration), what you built and how you built it." (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
  - [Homepage what-to-submit] "Upload a <3-minute public YouTube video showing your project working, audio covering how you used Codex AND GPT-5.6" (https://openai.devpost.com/ (accessed 2026-07-19))
Likely cause (inference, unverified): Team records a silent or music-only screencast, or narrates the product but not the Codex/GPT-5.6 usage
What remains unverified without source access: True
Learner impact: none
Judge impact: Explicit requirement failure on the artifact judges are most likely to consume; Technological Implementation evidence lost
Trust impact: high — signals non-reading of the rules
Recommended correction: Script the narration around the three mandated topics; show one Codex workflow moment on screen (optional 'strong signal'); keep <=2:50
Smallest acceptable correction: Add an AI-narrated voiceover track covering the three topics to the existing cut
Acceptance criteria: Video is public, <=3:00, English (or translated), and a first-time viewer can point to the seconds where Codex use and GPT-5.6 use are each explained
Required regression test: Play the final upload muted-check: confirm there IS a voice track; timestamp the Codex and GPT-5.6 segments; verify public visibility in a logged-out browser
Dependencies: 
Estimated effort: M
Score leverage: high — the video is the default-path judging artifact
Related source issues: A14-02
```

## MB-C03 — Submission: GPT-5.6 must be meaningfully in-product AND evidenced in video/repo/README; reachable app surfaces show templated framing only (partly verified in-app)
```text
Issue ID: MB-C03
Severity: P0
Confidence: high (requirement documented); product compliance unverified (app unreachable)
Reproducibility: not reproducible — app fetch refused ('audit rejected') on all attempts
Category: Submission compliance
Affected route: https://counterlab.cserules.workers.dev/ + repo + README
Affected journey: hands-on judging; repo review
Affected user: judge verifying GPT-5.6 integration
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Product actually calls GPT-5.6 for belief framing (as claimed in briefing)
Reproduction steps: ['Judge opens README and searches for GPT-5.6', 'Judge watches video for the GPT-5.6 segment', 'Judge (optionally) opens the app and looks for model identification']
Expected behaviour: GPT-5.6 usage is explicit, non-decorative, and referenced in README + video; ideally visible in UI/API config
Actual behaviour: Could not test — app refused all fetches; no public repo found via search
Direct evidence:
  - [Mandate] "Do I have to use GPT-5.6? Yes. Your project must use GPT-5.6. Judges will look for evidence of this in your demo video and code repository; make sure it's clearly referenced in your README." (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
  - [Meaningfulness] "your project must meaningfully use both Codex and GPT-5.6 — they can't be incidental or decorative." (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
Likely cause (inference, unverified): Model name not surfaced anywhere a judge can see; or a different model is actually used at runtime
What remains unverified without source access: True
Learner impact: none
Judge impact: Eligibility-level doubt if no GPT-5.6 evidence is found in video/repo
Trust impact: severe if the model used differs from the claim
Recommended correction: Surface the model identifier in the app footer or verdict metadata; pin exact model string in code; README section 'How GPT-5.6 is used'
Smallest acceptable correction: Add a README line naming the exact GPT-5.6 model string and where it is called
Acceptance criteria: A judge can find GPT-5.6 named in README, hear it in the video, and see it in code/config within 2 minutes
Required regression test: grep repo for the model identifier; re-watch video segment; reload app and locate model label
Dependencies: 
Estimated effort: S
Score leverage: high — gating requirement
Related source issues: A14-03
```

## MB-C04 — Submission: Codex-in-build (required) must not be conflated with Codex-in-product ('Runtime Codex'); both roles need documentation (UNVERIFIED)
```text
Issue ID: MB-C04
Severity: P0
Confidence: high on the rule; medium on the risk (depends on team's reading)
Reproducibility: rule reproducible from FAQ; team behaviour unverifiable
Category: Submission compliance
Affected route: Devpost submission form + README + video
Affected journey: pre-submission
Affected user: CounterLab entrant interpreting the rules
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Team's architecture markets 'Runtime Codex (compiles bounded test plans)' as a product component
Reproduction steps: ["Team reads 'Codex usage is required'", 'Team assumes in-product Runtime Codex satisfies it', 'Team skips documenting the build-time Codex thread / Session ID']
Expected behaviour: Build-time Codex usage documented (Session ID + README + video audio) regardless of in-product Codex
Actual behaviour: Unverified — cannot see form, README, or video
Direct evidence:
  - [What counts as using Codex] "Building your project with Codex — whether through the ChatGPT app, the Codex CLI, the IDE extension, or the SDK. You'll verify this by submitting the /feedback Session ID from the main thread where you did the majority (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
  - [Criterion wording] "How thoroughly and skillfully does the project use Codex?" (https://openai.devpost.com/ (accessed 2026-07-19))
  - [Product claim] Briefing: CounterLab uses 'Runtime Codex (compiles bounded test plans)' inside the product (audit briefing (unverified context))
Likely cause (inference, unverified): Dual role of Codex in CounterLab's architecture creates a false sense of compliance
What remains unverified without source access: True
Learner impact: none
Judge impact: If only in-product Codex is evidenced, judges cannot verify the mandated build-time usage
Trust impact: high — looks like rules were gamed if unaddressed
Recommended correction: Document BOTH roles explicitly: 'Built with Codex (Session ID ..., see README build log)' AND 'Codex also runs inside the product compiling bounded test plans'
Smallest acceptable correction: One README paragraph separating the two roles + Session ID in the form
Acceptance criteria: README and video each contain an unambiguous statement of build-time Codex use; Session ID present in form
Required regression test: Ask a third party to find, in <=2 min, the build-time Codex evidence in README/video
Dependencies: ['A14-01']
Estimated effort: S
Score leverage: high — protects the first-listed (tiebreak) criterion
Related source issues: A14-04
```

## MB-C05 — Submission: repository must be public-with-license or shared with testing@devpost.com + build-week-event@openai.com; README with setup/sample-data/testing path (UNVERIFIED — no public repo found)
```text
Issue ID: MB-C05
Severity: P0
Confidence: high (requirement documented); repo state unverified (none found publicly)
Reproducibility: not reproducible — no CounterLab repo locatable via search as of 2026-07-19
Category: Submission compliance
Affected route: Repo URL submitted on the form
Affected journey: hands-on judging; repo review
Affected user: judge attempting to inspect or run the project
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Repo exists; team chose public-with-license or private-shared-with testing@devpost.com and build-week-event@openai.com
Reproduction steps: ['Judge clicks repo URL', 'Looks for README with setup instructions, sample data, run/test guidance', 'If private: checks access was granted to the two official addresses']
Expected behaviour: Repo opens for judges; README lets a stranger run or understand the project; sample notebooks included
Actual behaviour: Could not test — no public repo found
Direct evidence:
  - [Repo rule] "The repository must be either public (with relevant licensing) or private and shared with testing@devpost.com and build-week-event@openai.com. Include a README with setup instructions, sample data (if needed), and clear (https://openai.devpost.com/ (accessed 2026-07-19))
  - [Judges not required to build] "Can judges build my project from scratch to test it? They are not required to. Make it easy — provide a working demo link, test account, or sandbox wherever possible." (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
Likely cause (inference, unverified): Repo kept private without sharing, README written for the team not for judges, sample notebooks omitted
What remains unverified without source access: True
Learner impact: indirect — the same sample notebooks serve learners
Judge impact: Cannot verify code quality or run anything; Technological Implementation unverifiable
Trust impact: high if repo 404s or README is empty
Recommended correction: Public repo + MIT/Apache LICENSE + README (setup, architecture, two sample notebooks for leakage/imbalance, judge quick-start pointing to /judge)
Smallest acceptable correction: Share private repo with both official addresses and add a minimal run-me README
Acceptance criteria: Incognito browser opens the repo (or access confirmed for the two addresses); README contains setup, sample data, testing guidance
Required regression test: Weekly until Aug 13: incognito-open repo URL; run README quick-start on a clean machine
Dependencies: 
Estimated effort: M
Score leverage: high — gate for any hands-on verification
Related source issues: A14-05
```

## MB-C06 — Submission: app must stay reachable, free, functional-as-depicted through judging end (~Aug 9–13, 2026) — includes fixing MB-002 live dead-end before any judge touches it
```text
Issue ID: MB-C06
Severity: P0
Confidence: high (requirement from template + FAQ); current uptime unknown (fetch layer refused the domain)
Reproducibility: not testable from this environment — all fetches to counterlab.cserules.workers.dev returned 'audit rejected'
Category: Submission compliance
Affected route: https://counterlab.cserules.workers.dev/ and /judge
Affected journey: hands-on judging
Affected user: judge opening the demo link during Jul 22 – Aug 9+
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Deployed Workers app (+ whatever backend runs notebook analysis)
Reproduction steps: ['Judge opens the URL any time during judging', 'Runs the canned demo path', 'Sponsor may request a live demonstration for verification']
Expected behaviour: App responds, demo path works, no paywall/login wall (or provided test account), behaviour matches video
Actual behaviour: Could not test
Direct evidence:
  - [Testing access (template)] "Access must be provided to an Entrant's working Project for judging and testing... free of charge and without any restriction... until the Judging Period ends... Entrants may be required to provide a live demonstration" (https://openai.devpost.com/rules (2025 document served at this URL on 2026-07-19 — Build Week wording unverified))
  - [Judges may test] "Do judges test my project? They may, but they're not required to. If they do, they'll use the demo link, sandbox, or test account you provide." (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
Likely cause (inference, unverified): Workers free-tier limits, sleeping backend for notebook compute, expired API keys, or post-deadline deploy breakage
What remains unverified without source access: True
Learner impact: learners hit the same outages
Judge impact: A dead link during judging ≈ automatic low scores on Design/Impact
Trust impact: severe if video shows features the live app can't reproduce
Recommended correction: Uptime monitoring + warm canned-demo path + freeze deploys after deadline except emergency fixes; health check from 3 regions daily until Aug 13
Smallest acceptable correction: Add a status/health endpoint and an external uptime monitor with alerts
Acceptance criteria: 200 OK on / and /judge from 3 regions daily through Aug 13; canned demo completes <60 s
Required regression test: Scheduled uptime probe every 5 min; daily manual run of the judge path
Dependencies: ['A14-13']
Estimated effort: M
Score leverage: high — protects the entire hands-on path
Related source issues: A14-06
```

# P1 — First-prize blockers
## MB-005 — Evidence & proof drawer permanently shows '0 events' and empty tabs on every surface (session, proof page, replay) despite 12–20 server-side hash-chained events — flagship transparency surface contradicts the signed record at the payoff moment
```text
Issue ID: MB-005
Severity: P1
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Trust surface / defect
Affected route: /proof/<id> (Evidence & proof panel; Provenance tab); /proof/<uuid> (also visible on /session/<uuid> throughout); /proof/<uuid> (palette); /session/<id>; /session/<id>, /proof/<id>, /replay/<id>; /ses
Affected journey: All journeys (drawer is global chrome); 12 - revisit completed evidence; judge 10-minute test; any judge who opens the transparency drawer; V4 (J01, J27); sample lesson end-to-end; Learner completes (…
Affected user: learner and judge; first-time learner (also the exact surface a judge opens to check the verification claim); hackathon judge (hands-on), sceptical technical ev…
Affected Devpost criterion: Design
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Complete a sample session through Repair (proof page reachable)
Reproduction steps: ["Open 'Evidence & proof' drawer (counter reads '0 events')", 'Click Activity tab', 'Click Plan tab', 'Click Verifier tab']
Expected behaviour: Drawer lists the session's events (12 exist in the signed record) and per-tab evidence
Actual behaviour: Counter stays at '0 events' for the entire journey; all six tabs are empty in all observed states, including on the completed proof page whose own 'Download proof record' yields a rich 20-event chain. || Counter reads '0 events' for the whole journey; after completion every tab shows 'No <activity/plan/diff/tests/verifier> evidence yet. It will appear here when the session produces it.' Only Provenance has content. State persists after full reload. || Counter reads '0 events'; every tab shows an empty state ('No activity evidence yet. It will appear here when the session produces it.', 'No pla…
Direct evidence:
  - [Reproduced] Empty Activity tab on completed /proof page; empty Verifier and Plan tabs same page; '0 events' observed at every step of every session (agent16_events_drawer.png, agent16_verifier_tab.png)
  - [Observed in generated artifact] Proof record JSON contains 20 events with hashes, experimentPlan, externalVerifier report, patchResult — i.e., the data the drawer should render exists (proof record JSON)
  - [Reproduced] All five tabs empty post-completion; persists after reload of /proof/session_db9778ae-2e82-456a-a193-9c03292e1eba (evidence/screenshots/agent2_29_evidence_drawer.png, agent2_31_drawer_tests_empty.png)
  - [Observed in generated artifact] Downloaded proof bundle contains 12 events (session.created, belief_test.proposed/confirmed, prediction.committed, lab.compilation_started, lab.verified, experiment.completed, revision.recorded, transfer.started/passed,  (evidence/artifacts/agent2_proof_record_leakage-01.json)
  - [Reproduced] Observed empty drawer across all six tabs in completed sample session and in replay mode (evidence/screenshots/agent3_studio_drawer.png)
  - [Observed in generated artifact] Downloaded proof record for the identical session contains 16 events (session.created through patch.verified; actors system/learner/codex/verifier/kernel) (evidence/artifacts/agent3_proof_record_sample_session.json)
  - [Reproduced] Empty drawer tabs + 0 counter after completion (evidence/screenshots/agent4_v4_events_drawer.png; agent4_v4_verifier_tab.png)
  - [Observed in generated artifact] Downloaded proof record contains 12 hash-chained events for the same session (evidence/artifacts/agent4_proof_record.json)
  - [Directly observed] All 5 non-provenance tabs empty after completed session; counter '0 events' (agent6_39_evidence_drawer.png, agent6_40_drawer_plan.png, agent6_41_drawer_diff.png, agent6_45_verifier.png)
  - [Directly observed] Provenance tab populated with hashes while sibling tabs are empty (agent6_42_drawer_provenance.png)
Likely cause (inference, unverified): Drawer data source never wired (or a failed fetch is silently rendered as the empty state); the '0 events' counter suggests the events query returns nothing while the proof-download endpoint assembles the chain separately. || Drawer event feed is not wired to the session/proof event store (or is gated to live-notebook sessions only); empty-state copy assumes events exist ('when the session produce…
What remains unverified without source access: Whether the drawer works in live sessions (upload not testable) or is empty there too. || Whether live (uploaded-notebook) sessions populate the drawer; live path could not be tested (no file upload). || whether the drawer populates correctly for live sessions (could not upload a notebook in the bro…
Learner impact: Medium: curious learners clicking 'Evidence & proof' conclude the machinery is decorative. || At the reflective moment when a learner goes to check WHY they should trust the result, the product says no evidence exists - directly contradicting everything they just experienced. || low for learning itself; learners are told evidence exists that the ap…
Judge impact: Severe: the single most relevant surface for 'show me the verification' is empty; only judges who think to download the JSON discover the real content. || High: the flagship verification surface appears broken in the primary demo path; undermines the core 'prove it' thesis on inspection. || high — a judge's natural 'show me the telemetry' click ret…
Trust impact: High: a product whose pitch is visible proof shows an empty proof drawer — reads as decorative status theatre. || Severe contradiction: UI claims 'verified' everywhere while the evidence drawer claims nothing was produced. || high — direct, visible contradiction of the core differentiator || In-app display disagrees with the signed record; undermin…
Recommended correction: Wire the drawer to the same event/proof endpoints backing the download; make the empty state a loud error (not 'will appear here') when the session already has events; show the real event count in the footer. || Wire the drawer to the same event/artifact store that backs the proof download; show event chain, plan, diff, public-test report and verifier invariants per tab; fix the counter. || Populate the drawer from the session event chain for all modes (sample and replay already possess one), in…
Smallest acceptable correction: Populate at least the Activity tab from the existing events endpoint and fix the counter; hide the remaining tabs until wired. || For sample/replay sessions, render the recorded session's events and verifier invariants from the stored bundle instead of the live feed. || Change the empty state to link the truth: 'This session's signed event chain (16 events) is available in the downloadable proof r…
Acceptance criteria: In a completed sample session the footer shows 20 events and each tab renders the corresponding section of the proof record. || After completing the sample, the drawer shows >=12 events with actor/kind, the Verifier tab lists the accepted invariants (e.g. baseline_overlap_exists, canonical_result_hash), Tests tab shows publicTests 1/0, Diff tab shows the cell-3 patch. || After completing sample and replay, the drawer event count matches the capsu…
Required regression test: e2e: complete sample session; assert footer count > 0 and Activity tab contains 'prediction.committed' and 'experiment.completed'. || Complete sample lesson in a fresh browser; open drawer; assert non-empty Activity and Verifier tabs and counter > 0. || e2e: complete sample lesson -> assert drawer c…
Dependencies: Events/proof API (exists — backs the download).; ['proof event store', 'sample session bundle']; event feed endpoint for non-live modes; Session event API; Proof-event store; sample payload serializat…
Estimated effort: M
Score leverage: High — restores the central 'proof' differentiator in-app
Related source issues: A16-04, A2-01, A3-01, A4-03, A6-01, A9-01, A12-07, A10-13, A2-02, A1-05
```

## MB-006 — Transfer gate ✓/× glyphs are inverted against the answer key: the deployment-safe option renders ✓ and fails, the future-leaking option renders × and passes (screen readers announce bare glyphs; correct reasoners punished)
```text
Issue ID: MB-006
Severity: P1
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Pedagogy / accessibility
Affected route: /session/<id> (Step 5 Apply, transfer gate); /session/<id> step 5 Apply (transfer); /session/<uuid> step 5 (Apply - Timeline transfer); /session/<uuid> step 5 Apply (Timeline transfer); /session/<uuid
Affected journey: Sample lesson, Apply step, forecasting transfer challenge; Apply -> Timeline transfer; Sample lesson, step 5 transfer challenge; V1, J31, J01; judge 3-minute story walk; learner sample lesson; Sample/…
Affected user: learner; learner answering the transfer gate; All learners; screen-reader learners hear bare 'cross'/'check' with inverted-feeling semantics; learner at the tra…
Affected Devpost criterion: Design
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Reach Step 5 Apply transfer gate
Reproduction steps: ["Select 'Known item price' for 'Which feature crosses NOW?' -> timeline shows 'uses available information' with a check glyph", "Select 'Centered rolling target' (keyed-correct) -> timeline shows 'reads later outcomes' with an x glyph"]
Expected behaviour: Glyphs adjacent to the learner's selection communicate answer correctness (or use neutral property icons that cannot be confused with right/wrong)
Actual behaviour: The gate passes only when the learner selects the future-leaking feature ('Centered rolling target'), and fails the deployment-safe feature. The instruction says choose the feature 'that match[es] what is available when a real prediction is made' (safe-feature semantics); the timeline marks the leaky feature with × and the safe one with ✓; the failure hint ('remove any feature that reads values to the right of NOW') implies identify-the-risk semantics. Three signals contradict. The proof artifact confirms the gate intends identification semantics: selectedStrategy=time_ordered_holdout, identif…
Direct evidence:
  - [Reproduced] Time-ordered holdout + Known item price → 'Transfer not yet passed' (3 attempts, including after full state reset); Time-ordered holdout + Centered rolling target → 'Transfer passed · Patch unlocked' (agent16_transfer_wrong.png, agent16_transfer_correct.png, agent16_transfer_pass.png)
  - [Observed in generated artifact] Downloaded proof record transferResult: identifiedRisks=['centered_window_reads_future'], evidenceChoices=['center_true_uses_later_targets','random_split_mixes_dates'], EVIDENCE_GROUNDED check requires selecting center=T (proof record JSON, keys transferResult / events[9..18])
  - [Directly observed] Timeline visual annotates 'Known item price — uses available information ✓' and 'Centered rolling target — reads later outcomes ×' while × marks the required answer (agent16_transfer_correct.png)
  - [Reproduced] Both directions observed live (evidence/screenshots/agent5_21_wrong_selected.png; agent5_23_correct_selected.png)
  - [Directly observed] Selected 'Known item price' -> timeline caption 'uses available information' with check glyph, screenshots step5_wrong.png; earlier run: 'Centered rolling target' -> 'reads later outcomes' with cross glyph (shots/step5_wrong.png, step5_fail2.png)
  - [Directly observed] Check-transfer verdict itself is textual ('Transfer not yet passed... The patch remains locked'), so the failure IS communicated in words - but after the misleading glyph cue (shots/step5_fail2.png)
  - [Inferred from behaviour] Screen readers announce isolated times/check glyphs inconsistently ('multiplication sign', 'check mark') without the safe/leaky meaning (glyph text content)
  - [Reproduced] Attempt 2 (Time-ordered holdout + ✓ Known item price) → 'Transfer not yet passed' (evidence/screenshots/agent4_v1_wrong_attempt2.png)
  - [Reproduced] ×-marked Centered rolling target + holdout → 'Transfer passed · Patch unlocked' (twice) (evidence/screenshots/agent4_j31_passed_after_3_fails.png; agent4_j01_step5_transfer_correct.png)
  - [Directly observed] Marker semantics: ✓='uses available information', ×='reads later outcomes' (evidence/screenshots/agent4_j01_step5_options.png)
Likely cause (inference, unverified): The two sub-questions were designed with opposite semantics (pick the good split; identify the bad feature) but share one instruction written for pick-the-good semantics; the ✓/× timeline annotation encodes feature safety, not answer correctness; no copy disambiguates 'select the feature to use' from 'select the feature that crosses NOW'. || Timeline annotation reuses feature-safety icons (safe=ch…
What remains unverified without source access: Whether the class-imbalance pack's transfer task has the same inversion (no entry without upload). || Colour perception (red/green) verified only via text + glyph in DOM dump || Whether failure feedback ever updates the glyphs || whether failure-then-success is an intended 'productive struggle' desi…
Learner impact: Severe: the correctly reasoning learner is told they are wrong at the climactic scored moment and must select a leaky feature to proceed, inverting the lesson. || Learners are visually punished for the correct choice and rewarded for the wrong one; confusion or mislearning at the single assessed moment || Actively teaches the wrong association at t…
Judge impact: Severe: a judge replaying the natural 'right answers' hits an unexplained failure loop and may conclude the fixed-code scoring is broken or arbitrary. || Any judge clicking the correct transfer answer sees an x beside it; reads as a bug in the flagship gate || A judge probing the transfer step sees a check mark beside the wrong answer - reads as a …
Trust impact: High: the scored, 'fixed-code' gate — the integrity centerpiece — contradicts the product's own labels. || Directly contradicts 'verified' branding at the one place the learner is graded || Perceived inverted feedback erodes trust in all other check marks in the app || Perceived inverted grading at the release gate || medium — invites the question …
Recommended correction: Decide one semantics. Preferred: make the feature question explicitly 'Which feature crosses NOW and must be removed?', remove ✓/× safety framing from the timeline (or relabel as 'identified risk ✓'), and update the top instruction to 'Choose the split that matches deployment and identify the feature that leaks future information.' Accept 'Known item price' as a correct non-risk identification only if paired with naming the risk. || Replace check/x property glyphs with neutral labels ('available…
Smallest acceptable correction: Change the instruction sentence and the ✓/× marker semantics; add one line under the feature question: 'Select the feature that reads information from after NOW.' || Swap the two glyphs to neutral text badges without check/x iconography || Replace the standalone check/cross characters in the timeline echo with the words 'safe'/'leaky' (or add them), and state answer correctness in the verdict line…
Acceptance criteria: With a fresh session, selecting time-ordered holdout + Known item price plus explicit identification of the centered window as the risk passes; selecting the leaky feature as the feature-to-use fails; instruction, markers, hint, and gate agree on first attempt. || Selecting the keyed-correct feature never renders x/red adjacent to the selection; selecting the keyed-wrong feature never renders check/green || ['No check/cross glyph appears adjacent…
Required regression test: Scripted e2e: for each of the 4 split×feature combinations, assert gate outcome matches the documented intended semantics and that hint copy is consistent with the outcome. || Black-box: select each feature, screenshot timeline annotation, assert no x adjacent to 'Centered rolling target' and no che…
Dependencies: Transfer evaluator counterlab-transfer-v1; Apply step UI copy.; none; Transfer UI component; content/design review of step 5 copy; None
Estimated effort: S
Score leverage: high
Related source issues: A16-01, A5-03, A8-02, A4-04, A3-02, A10-11
```

## MB-007 — Verdict leaks before the prediction seal: 'This is the deceptive random-split headline' and the fix ('keep each customer's rows together') are visible on the Prediction step pre-lock, defeating hindsight-bias protection
```text
Issue ID: MB-007
Severity: P1
Confidence: High
Reproducibility: always
Category: Pedagogy / prediction integrity
Affected route: /session/<id> (Step 2 Prediction, sample lesson); /session/<uuid> (step 2 Prediction)
Affected journey: Question -> Prediction (pre-seal); 6 - commit prediction
Affected user: first-time learner, sample lesson; first-time learner
Affected Devpost criterion: Potential Impact
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Start 'Try verified sample', submit any claim, land on Prediction step before sealing
Reproduction steps: ["Open sample lesson, enter any claim, click 'Compare two explanations'", "On Prediction step, before 'Seal my prediction', read the evidence cards", "Observe 'Cell 3 - output 0: This is the deceptive random-split headline under test. accuracy: 0.985'", "Observe 'The fairer test: Keep each customer's rows together, then remove customer ID' displayed pre-seal"]
Expected behaviour: No verdict or fix language before the seal; the learner chooses an expectation without being told the headline is deceptive
Actual behaviour: The UI calls the 0.985 accuracy 'the deceptive random-split headline under test' and describes the fix before the learner seals anything, cueing the 'correct' prediction || The chip calls the 0.985 headline 'deceptive' pre-commit, signaling the 'right' answer; similarly the collapsed 'Why?' text on step 1 telegraphs the generalization catch. The falsification loses force for attentive readers.
Direct evidence:
  - [Reproduced] Verdict string visible pre-seal in two independent sessions (evidence/screenshots/agent5_05_prediction_lower.png; agent5_06_prediction_confirm.png)
  - [Observed in generated artifact] proof record beliefTest.evidenceRefs[1].relevance = 'This is the deceptive random-split headline under test.' (evidence/agent5_proof_record.json)
  - [Directly observed] Chip text verbatim: 'This is the deceptive random-split headline under test. accuracy: 0.985' (evidence/screenshots/agent2_05_step2_prediction.png, agent2_06_step2_full.png)
Likely cause (inference, unverified): Evidence-card 'relevance' annotations are authored as post-hoc verdicts and rendered statically regardless of seal state || Cell-output caption written from the post-hoc narrator voice; not gated behind the lock.
What remains unverified without source access: Whether the live (uploaded-notebook) path shows the same pre-seal annotations || Whether wording differs in live sessions.
Learner impact: Hindsight-bias protection of the sealed prediction is defeated; learners can appear calibrated without ever committing to a genuine belief || Reduces genuine commitment/surprise; a cue-seeking learner guesses 'Fall materially' without understanding.
Judge impact: The signature mechanic ('sealed before result') is demonstrably leaky on screen; undermines the thesis demo || Moderate: undermines the signature 'locked prediction' mechanic on close reading.
Trust impact: A learning scientist judge will flag that the app grades predictions it itself cued || Minor: the app appears to have prejudged the 'verified' outcome.
Recommended correction: Gate all verdict/fix language ('deceptive', 'fairer test' description, directive hints) behind the prediction.committed event; show neutral evidence descriptions pre-seal || Pre-lock, caption outputs neutrally ('The notebook's reported headline. accuracy: 0.985'); reveal evaluative framing after the result.
Smallest acceptable correction: Replace pre-seal relevance string with neutral 'accuracy displayed in notebook (random row split)' until sealed || Delete the word 'deceptive' from the pre-lock caption.
Acceptance criteria: Pre-seal Prediction DOM contains no verdict terms ('deceptive', 'leak', 'fairer test'); identical screenshot test passes across fresh sessions || No outcome-judging adjectives appear before prediction.committed in the event chain's UI.
Required regression test: Black-box: fresh sample session, text-search Prediction step pre-seal for 'deceptive'; assert absent; assert present post-result || DOM assertion at step 2: absence of 'deceptive' before seal.
Dependencies: none
Estimated effort: S
Score leverage: high
Related source issues: A5-01, A2-07
```

## MB-008 — Bogus /replay/<id> (judge probe or stale link) yields a perpetual 'Opening this replay…' spinner with stale progress chrome and no recovery CTA
```text
Issue ID: MB-008
Severity: P1
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Reliability / error recovery
Affected route: /replay/<unknown-id>; /replay/<unknown-id> (tested /replay/bogus-id); /replay/<unknown_id>; /replay/bogus-id (any unknown replay id)
Affected journey: error handling; User follows or mistypes a replay link; User opens a replay link with an unknown id.; Replay / judge deep-link error handling
Affected user: any user who mistypes or follows a stale replay link; Learner / judge; Judge/learner with a stale replay link; Any learner following a bad link; SR users in par…
Affected Devpost criterion: Design
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: None (state bleed requires a prior in-progress session in the same browser)
Reproduction steps: ['Visit /replay/bogus-id', 'Observe the error toast and main content', 'Wait/reload and observe again']
Expected behaviour: A designed 404 state: 'Replay not found', explanation, and a primary action home (or to the replay index); stepper cleared.
Actual behaviour: Toast pill 'Replay bogus-id was not found' top-right, while the main area shows a permanent 'CHECKING STORED EVIDENCE / Opening this replay…' loading message that never resolves; header still shows 'REPLAY MODE' and the stepper shows stale progress (checkmarks and '3 Test') leaked from the previous session; the only exit is 'START OVER' in the header. || Toast 'Replay bogus-id-xyz was not found' appears, but the main panel stays in a perpetual 'CHECKING STORED EVIDENCE / Opening this replay...' loading state that never resolves; the wizard header misleadingly shows step 3 'Test' with Question …
Direct evidence:
  - [Directly observed] Permanent loader + error toast coexisting; rechecked after waiting — unchanged (agent6_47_replay_404.png, agent6_48_replay_404_after.png)
  - [Directly observed] Stepper shows previous session's progress on the error page (agent6_47_replay_404.png)
  - [Directly observed] Toast plus indefinite spinner, URL unchanged, misleading step-3 progress chrome. (evidence/screenshots/agent9_replay_bogus.png)
  - [Reproduced] Agent 1 independently recorded the same 'Replay <id> was not found' + perpetual spinner. (02_PUBLIC_ROUTE_AND_STATE_MAP.md (R6))
  - [Directly observed] 'was not found' text coexists with 'Checking stored evidence / Opening this replay…'; state persists. (evidence/screenshots/agent1_replay_bogus.png)
  - [Directly observed] Two consecutive loads show unchanged loading UI with toast present (shots/error.png, error2.png)
  - [Unverified] Whether the toast is role=status/alert (SR-announced) cannot be confirmed without DOM access (-)
Likely cause (inference, unverified): Replay loader has no failure branch — fetch error surfaces as toast but the loading view is never replaced; session stepper state is read from local storage regardless of route validity. || The replay loader has no terminal error branch: after the fetch rejects, the toast fires but the loading state is never cleared and the route never redirects. || Loading branch not cleared when the not-found br…
What remains unverified without source access: Whether the toast auto-dismisses after a long interval (persisted through my observation window). || Whether the spinner ever times out (observed for several minutes; never resolved). || Whether the spinner eventually times out (not observed within ~1 minute). || True
Learner impact: Dead-end screen; app looks hung. || A learner with a bad link is stuck on a fake loading screen with false progress and no explanation of what to do next. || Minor confusion. || Screen-reader users may wait indefinitely on a page that claims to be loading; sighted users see a stuck loader
Judge impact: A judge probing a bad URL concludes error handling is absent. || A judge probing robustness hits an amateur indefinite-spinner dead end on a flagship route. || Minor. || A judge typo-ing or guessing a replay id sees an apparently hung app
Trust impact: Stale 'verified-style' progress on an error page blurs state integrity. || High - indefinite loading after a visible error signals fragile state handling. || Low; positive that no verified banner is shown for an unknown replay. || Medium-High (a broken deep-link is likely during judging)
Recommended correction: Add an error branch to the replay loader: full-width 404 card with retry/home actions; reset stepper and mode badge when the replay id is invalid. || On replay fetch failure, render a terminal error panel (message + 'Watch the verified replay' and 'Back to home' CTAs) and reset the wizard chrome to a neutral state. || Make not-found terminal: remove the opening/checking spinner and offer a link to the valid replay. || Add an error branch: replace loader with 'Replay not found' heading, explanati…
Smallest acceptable correction: Replace the eternal loader with the toast's message plus a 'Back to start' button when the replay fetch 404s. || Stop the spinner and show static 'Replay not found' text with a home link. || Hide the loading block when the not-found message renders. || After fetch failure, render an error view with one recovery link
Acceptance criteria: Unknown replay id renders a static error screen with a working exit within one second; no stale progress indicators. || Visiting /replay/<unknown> shows a stable not-found page within one load cycle, with no spinner and at least one working recovery CTA; header shows no fake step progress. || Unknown replay id → static not-found view, no spinner. || ['Bad replay id shows persistent in-content error within ~2s', 'At least one recovery link present…
Required regression test: Visit /replay/does-not-exist; assert error card visible, no 'Opening this replay…' text, stepper has no completed steps. || Visit /replay/does-not-exist; assert no loading indicator remains after load settles and a recovery CTA is present. || Visit /replay/bogus → assert not-found text and absence o…
Dependencies: Replay fetch layer; session state store; None.; None
Estimated effort: S
Score leverage: medium
Related source issues: A6-02, A9-02, A1-09, A8-09
```

## MB-009 — Proof-integrity appearance: identical verified metrics carry two different result_hash values (kernel/session a6ae7652… vs verifier/replay 25016542…), two commit IDs, and per-path featureSetFingerprints — unexplained in any UI
```text
Issue ID: MB-009
Severity: P1
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Verification integrity
Affected route: /api/sessions/<id>/events; /proof/{id} — 'Download repaired notebook' vs Boundary verified runs; /replay/leakage-01 vs /session/<uuid> + downloaded proof records; /session/<id> (Boundary + /proof), /r
Affected journey: Compare sample proof and replay evidence; J01, J03, J27; judge 10-minute test — deep evidence inspection; A verifier compares the hashes shown in the sample session's Experiment Theater and proof page…
Affected user: judge, technical auditor; judge cross-checking the replay against a live run; sceptical technical judge cross-checking hashes; Judge or technical verifier check…
Affected Devpost criterion: Technological Implementation
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: One completed sample session
Reproduction steps: ['Note result hash shown in sample result table and in bundle verifiedResultSet.resultHash.', 'Compare with lab.verified payload resultHash and replay API result.resultHash.', 'Compare featureSetFingerprint per run across the two payloads.']
Expected behaviour: One canonical hash for one canonical result payload; the displayed hash matches the verifiable artifact regardless of path.
Actual behaviour: Sample UI and verifiedResultSet show a6ae7652e04e…; lab.verified payload and replay (API + UI) show 2501654264b9…. Within ONE proof bundle the two resultHash fields disagree. featureSetFingerprint random_row_split: 1fd4ea95… (sample) vs 621d1d17… (replay); identity_ablation: 9641773f… vs 25611036b…. Metrics identical to 12 decimal places, so the numbers are the same fixture; the hash domains differ. 'canonical_result_hash' is a verified invariant, yet the canonical value is path-dependent. || Hashes differ (a6ae7652e04e… vs 2501654264b9…) while the proof page simultaneously asserts replay_id=l…
Direct evidence:
  - [Reproduced] hash comparisons across my bundle, agent5 bundle, replay API (/api/sessions/session_297ad7b7…; /api/replays/leakage-01; evidence/agent5_proof_record.json)
  - [Directly observed] UI truncation 'result a6ae7652e04e…' (sample) vs 'result 2501654264b9…' (replay) (evidence/screenshots/agent10_sample_result.png ; agent10_replay_step.png)
  - [Directly observed] Live: 'result a6ae7652e04e…' (sessions A and D); Replay: 'result 2501654264b9…' (evidence/screenshots/agent4_j01_step3_result.png; agent4_j03_replay_result.png)
  - [Observed in generated artifact] proof record result_hash=a6ae7652e04e…, replay_id=leakage-01 (evidence/artifacts/agent4_proof_record.json)
  - [Reproduced] hash values captured in-app from replay and sample session result panels (evidence/screenshots/agent3_replay_result.png, agent3_proof_page_full.png)
  - [Observed in generated artifact] events[5].payload.resultHash=2501654264b9… (recordedAt 2026-07-14T11:18:03Z) vs events[6].payload.resultHash=a6ae7652e04e… in the same bundle (evidence/artifacts/agent3_proof_record_sample_session.json)
  - [Observed in generated artifact] identical dual-hash pattern in Agent 2's independent session capsule (session_db9778ae) (evidence/artifacts/agent2_proof_record_leakage-01.json)
  - [Directly observed] Sample theater/proof: result a6ae7652e04e…; replay theater/technical: result 2501654264b9… — same metrics/seed. (evidence/screenshots/agent1_proof_bottom.png)
  - [Observed in generated artifact] Repaired notebook metadata.counterlab.resultHash=2501654264b9aa85…; COUNTERLAB_PATCHED_RESULT.resultHash=26b6ad52ef36…, metrics accuracy 0.625, rocAuc 0.662. (evidence/agent1_download_repaired_notebook.bin)
  - [Observed in generated artifact] Proof record contains yet more hashes (contentHash, eventChainHead, event hashes, publicTests.reportHash) — all individually plausible but unnamed in UI. (evidence/agent1_download_proof_record.bin)
Likely cause (inference, unverified): Two serialization/canonicalization versions of the result set (replay payload lacks pipelineFingerprint; different feature-set fingerprint inputs), or the verifier-approved hash commits to a different payload than the kernel-emitted one. || Replay recorded under an older kernel/verifier version ('legacy v1'); live sample recomputes under current versions; hash inputs include versioned code, so val…
What remains unverified without source access: Which hash (if either) is reproducible via ./scripts/reproduce-session.sh (no shell internet). || Exact hash inputs (no repo access); whether any UI text reconciles the versions || exact serialization cause (no repo access from the web surface) || Exact hash preimages; whether the sample session is … Agent 16 recomputed the repaired-notebook SHA-256 locally = patchedArtifactHash exactly, and validated all 20 event-chain links; dual-hash domains remain unlabelled in UI.
Learner impact: Low direct, but a curious learner comparing sample and replay sees contradictory 'fingerprints'. || Low for learners || none direct || Low directly. || Low-medium: only verification-curious users notice. || Low-medium: a careful learner notices 'the fix scored 62.5%, but the test said 59.4%' and gets no answer. || Indirect — the audit trail underst…
Judge impact: A judge verifying hash-chain claims finds the displayed result hash is not stable across the product's own paths. || A judge comparing the two 'verified' surfaces finds mismatched hashes for the same replay_id — looks like a proof mismatch || medium — most judges won't diff hashes, but the one who does (the technical judge this product is built to …
Trust impact: Hash-chaining is the product's integrity story; ambiguity here is material. || Apparent inconsistency in the integrity story || high for verifier-minded evaluators; it is exactly the class of contradiction CounterLab exists to catch || Moderate-high: the product's core claim is verifiable determinism; ambiguous hash naming blunts that claim even if…
Recommended correction: Publish the canonicalization (hash domain separation labels, e.g., 'kernel-result-hash' vs 'verifier-approved-hash'), or unify to one canonical hash and explain any intentional difference in the bundle. || Display the kernel/verifier version beside each result hash and add one line on the proof page: 'this session recomputed the leakage-01 scenario under kernel vX; replay was recorded under v1' || Add explicit lineage: label the 2026-07-14 recorded hash as the v1 canonical reference, the fresh h…
Smallest acceptable correction: Rename fields to distinct names (kernelResultHash vs verifierApprovedResultHash) and document both in the proof bundle. || Add version labels next to the truncated hashes on step 4, replay, and proof pages || One sentence on the replay and proof screens: 'Result hash schema upgraded after this v1 recording; metrics are byte-identical (98.5/59.4/67.4, seed 1729)' || Add a one-line gloss under 'Tech…
Acceptance criteria: A third party can recompute or at least explain every displayed hash from the bundled payload. || A judge can explain any hash difference from information on the page || Every surface that shows a result hash identifies its schema/version; capsule contains an explicit supersedes/recorded-vs-recomputed field; replay banner and lab.verified use the same commit identifier or explain the two formats || Every hash shown in UI has a named definition; a…
Required regression test: Cross-path hash equality test for identical fixture results, or explicit schema fields distinguishing the two. || Snapshot test asserting version label presence wherever a result hash renders || unit/e2e: sample capsule must contain a lineage field linking recorded and recomputed hashes; UI snapshot…
Dependencies: None; Version metadata in payloads; none for copy; schema field for full fix; Coordination with integrity/proof agent (Agent for proof verification) to confirm preimage definitions.; None.
Estimated effort: S-M
Score leverage: Medium-high
Related source issues: A10-04, A4-05, A3-04, A1-10, A16-06, A16-10, A10-08
```

## MB-010 — Entire session/replay API is unauthenticated bearer-capability: any link holder reads claim, confidence, full event chain and downloads the signed bundle + repaired notebook; no expiry/revocation observed (≥6 h persistence)
```text
Issue ID: MB-010
Severity: P1
Confidence: High
Reproducibility: Always (any valid session id)
Category: Security surface
Affected route: /api/sessions/<id>, /api/sessions/<id>/events, /api/replays/<id>; /session/<id>, /proof/<id>, /api/sessions/<id>, /api/sessions/<id>/events
Affected journey: Anyone who obtains a session URL (shared link, screenshot, referrer, log) reads the full session; Any learner session; link sharing
Affected user: Learner (whose data is exposed); teacher/judge (assessing data handling); Learner sharing a proof link; anyone the link leaks to
Affected Devpost criterion: Technological Implementation
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: A session id (format session_<uuidv4>)
Reproduction steps: ['Complete a session and note its id.', 'From any unauthenticated context, GET /api/sessions/<id> and /api/sessions/<id>/events.', 'Observe the full response.', "Revisit a 6+ hour-old completed session's /proof/<id> and downloads."]
Expected behaviour: A documented, deliberate exposure model: e.g. short-lived or revocable share links, session TTL/expiry, or at minimum an explicit 'anyone with the link can view' notice and robots/noindex.
Actual behaviour: GET /api/sessions/<id> returns the complete session with no authentication: the learner's free-text claim, their written revision, the sealed prediction with confidence, the full notebook patch diff, and the entire HMAC-signed proof bundle including its signature. A session completed 6.2 hours earlier was still fully readable and its downloads still worked. No expiry, no auth challenge, no robots.txt. || Zero authentication on every route and API; URL holder reads everything including the learner's raw claim text, confidence, and signed artifacts; no delete/expire affordance observed
Direct evidence:
  - [Observed in network response] GET /api/sessions/session_4301ab06-... returned ~34KB JSON with beliefTest, prediction, patchResult.diff, proofBundle.events and integrity.signature, unauthenticated. (browser visit step 32)
  - [Observed in network response] GET /api/sessions/<id>/events returned the full hash-chained event log, unauthenticated. (browser visit step 34)
  - [Directly observed] Completed session session_4301ab06 (created 2026-07-18T22:15Z) still fully accessible at /proof/<id> with working downloads at 2026-07-19T04:27Z (6.2h). (browser visit step 21)
  - [Directly observed] GET /api/replays/leakage-01 returns the full replay payload unauthenticated. (browser visit step 33)
  - [Directly observed] GET /api/sessions/session_522276e6-975b-4c54-aa65-266545b035db returned full session incl. learnerClaim with no credentials (evidence/screenshots/agent12_api_session_12.png)
  - [Directly observed] GET /api/sessions/<id>/events returned hash-chained event log with internal event kinds (evidence/screenshots/agent12_api_events_13.png)
  - [Observed in generated artifact] Proof bundle JSON downloaded unauthenticated from /proof/<id> (34,841 bytes, valid signature block) (evidence/screenshots/agent12_proof_download_22.png)
  - [Unverified] Session expiry reportedly >=6h server-side; no expiry observable within the audit window (11_SECURITY_SURFACE_AUDIT.md section 5)
Likely cause (inference, unverified): No authN/Z layer on read endpoints (demo scope); session ids are the only capability; no TTL/lifecycle job on the session store. || Deliberate no-account design: session ID in URL is the only capability; no auth layer implemented on Worker routes
What remains unverified without source access: Whether session ids are truly unguessable at scale (uuidv4 suggests yes); whether ids leak via referrers/analytics; whether any expiry exists beyond the observed 6.2h window. || Whether any server-side expiry or access logging exists; whether live-notebook (non-sample) sessions add any guard
Learner impact: A learner's written reasoning and predictions are world-readable to anyone who gets the link; for an education product used by minors this is a serious data-handling gap. || A shared or leaked link permanently exposes the learner's verbatim 'before' reasoning and confidence; learner may not understand links are public-read
Judge impact: Judges (esp. the VP of Education) may view unauthenticated persistence of learner writing as a maturity/compliance gap for an education tool. || A security-minded evaluator will flag the absence of any access control or expiry story, even if acceptable for a demo
Trust impact: High - conflicts with the product's careful-evidence posture if learner data is silently persistent and public-by-link. || Moderate: the product's proof narrative implies controlled sharing, but any link holder reads everything forever
Recommended correction: Add an explicit sharing model: expiring signed share links for proof pages, a session TTL with clear messaging, and a visible privacy note; add robots.txt/noindex; consider redacting free-text learner fields from the public read model. || Document the capability-URL model in the UI; add session expiry and a delete/forget affordance; separate proof IDs from session IDs; add an interstitial warning before first share/download
Smallest acceptable correction: Add a clear 'Anyone with this link can view this session' notice on /session and /proof, plus a session expiry (e.g. 24h) and robots.txt disallowing /session and /proof. || Add a visible 'Anyone with this link can view this session' label on session and proof pages
Acceptance criteria: A documented TTL or revocation exists; expired/unauthorized reads return 401/404; UI discloses link-based visibility; /api/sessions/<id> for an expired session no longer returns learner free text. || UI states the bearer-link model; sessions expire or are deletable; proof and session IDs are distinct capabilities
Required regression test: Create a session, attempt unauthenticated read after the TTL (or after revocation), assert 401/404; assert robots.txt exists and disallows session/proof paths. || Automated: create session, read it unauthenticated (expect 200 while valid), delete it, expect 404 afterwards
Dependencies: Storage lifecycle support (Workers KV/D1 TTL) if expiry is implemented.; None
Estimated effort: Medium.
Score leverage: Medium (protects Potential Impact credibility for the education audience; avoids a judge downgrade on data handling).
Related source issues: A9-03, A12-01
```

## MB-011 — The lesson's key payoff sentence (Boundary tab) renders at measured ~1.6–1.8:1 contrast — effectively unreadable, including post-completion
```text
Issue ID: MB-011
Severity: P1
Confidence: High
Reproducibility: Always
Category: Accessibility / visual
Affected route: /session/<uuid> step 4 - Experiment Theater - Boundary tab; /session/<uuid> step 4 Boundary tab
Affected journey: Sample lesson, step 4 (Boundary) - the core 'where the conclusion changes' insight; sample lesson — boundary
Affected user: Low-vision learner; any learner in bright light; aging judges; learner trying to read where the conclusion changes
Affected Devpost criterion: Design
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Start 'Try verified sample'; complete steps 1-3; on step 4 open the Boundary tab of the Experiment Theater
Reproduction steps: ['Open Boundary tab in Experiment Theater', "Read 'Verified sample boundary' card text"]
Expected behaviour: Body text >= 4.5:1 against card background
Actual behaviour: 'The conclusion changes at the entity boundary.' and 'The verified whole-customer run has 0 shared customers; the random-row run has 389.' measure ~1.8:1 (text rgb(167-169,183-184,201-202) on rgb(240,242,243)) || Heading and body render in light blue-gray on near-white: measured heading 1.82:1, body 1.63:1 (text (167,183,202)/(179,193,213) on (240,242,243)). The most important sentence of the step is the lowest-contrast text in the product; it remains ghosted after full session completion.
Direct evidence:
  - [Directly observed] Text visibly faint gray-on-light-gray; hardest-to-read element on the page (shots/step4b.png)
  - [Directly observed (measured)] PIL color sampling: dominant text cluster rgb(167,183,201) vs bg rgb(240,242,243) = 1.82:1; second line 1.80:1 (PIL quantization of step4b.png regions (600,875)-(1250,945))
  - [Inferred from behaviour] Matches independent measurements by other swarm agents (~1.6-1.8:1) (cross-agent note)
  - [Directly observed] Ghosted text confirmed visually with zoom crop (agent6_23_step4_boundary.png, agent6_23z_boundary_zoom.png, agent6_24_step4_boundary_full.png)
  - [Directly observed] Pixel-sampled contrast ratios 1.82:1 and 1.63:1 (agent6_23_step4_boundary.png (PIL analysis))
Likely cause (inference, unverified): Muted 'secondary text' token applied to the highest-value sentence; token likely intended for captions on dark surfaces || A 'locked/preview' or low-emphasis style applied to the sample boundary card (opacity or muted token) with no state transition to solid after verification.
What remains unverified without source access: Whether a live-session boundary map (interactive) renders at full contrast; sample variant only.
Learner impact: The single most important sentence of the lesson (the boundary insight) is illegible for many low-vision learners || Learners literally cannot read the concept the step exists to teach.
Judge impact: Judges with vision impairments or on projectors cannot read the payoff; looks unpolished in the exact moment the product proves its thesis || Looks like a rendering bug on a core screen.
Trust impact: Core claim 'conclusion changes at the entity boundary' undermined when it is physically hard to read || A 'VERIFIED SAMPLE BOUNDARY' that cannot be read undermines the verified claim.
Recommended correction: Use the default body-text color token (>= 4.5:1) for payoff sentences; reserve muted tokens for captions/metadata || Render the verified boundary statement at full contrast with the same emphasis treatment as other verified outcomes (solid card, statement in display type, overlap numbers as stats).
Smallest acceptable correction: Change the two <p> elements in the Verified-sample-boundary card from the muted gray to the standard body color (one class/token swap) || Remove the muted/ghost style (opacity or gray token) from the boundary card text.
Acceptance criteria: ['Payoff text measures >= 4.5:1', 'Re-check with contrast tool on Boundary tab'] || Boundary statement measures >=4.5:1 contrast and is legible without zoom in the sample journey.
Required regression test: Automated contrast snapshot test on the Boundary card computed colors (fail if ratio < 4.5) || Screenshot the Boundary tab in the sample session; assert text/card contrast >=4.5:1.
Dependencies: Design tokens; boundary card component
Estimated effort: XS
Score leverage: High - fixes the demo's money-shot moment
Related source issues: A8-01, A6-03
```

## MB-012 — Mastery language ('You applied the rule correctly','you can now distinguish…') is awarded from a single 2-item multiple-choice gate passed on retry after an answer-revealing hint — contradicting the product's own 'not global mastery' limitation
```text
Issue ID: MB-012
Severity: P1
Confidence: high
Reproducibility: always
Category: Pedagogy / impact claim
Affected route: /session/<id> (Step 5 Apply -> Step 6 -> /proof)
Affected journey: Transfer -> Repair -> proof
Affected user: learner completing the lesson
Affected Devpost criterion: Potential Impact
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Fail transfer once, then pass; reach proof page
Reproduction steps: ["Choose wrong transfer answers -> 'Transfer not yet passed' + hint that restates the answer", "Choose keyed answers -> 'You applied the rule correctly'; proof page: 'You can now distinguish...'"]
Expected behaviour: Mastery claims gated on multiple tasks / first-attempt success, or scoped to the single task; attempts surfaced
Actual behaviour: Global-sounding capability claim after one gate; retry count invisible in UI; proof record limitation ('does not prove global learner mastery') is not reflected in learner-facing language
Direct evidence:
  - [Reproduced] Failed attempt 1 (transfer.failed 23:05:57), passed attempt 2 (transfer.passed 23:07:21); UI shows only 'Passed' (evidence/screenshots/agent5_22_wrong_verdict.png; agent5_24_transfer_passed.png; agent5_26_proof_lower.png)
  - [Observed in generated artifact] limitations: 'Passing transfer verifies fixed choices for this task; it does not prove global learner mastery.' (evidence/agent5_proof_record.json)
Likely cause (inference, unverified): Single fixed transfer task + celebratory proof copy written independently of the limitations
What remains unverified without source access: none
Learner impact: Overconfidence in a fragile one-shot skill; no incentive for further practice
Judge impact: Education-track judges probing evidence of learning find one MC gate behind a mastery headline
Trust impact: The app's own limitations contradict its UI headline
Recommended correction: Add a second, structurally different transfer task (e.g., class imbalance or group-leakage variant); gate 'You can now distinguish' on first-attempt passes; show attempt history
Smallest acceptable correction: Change headline to 'You applied this rule once - first attempt: no' with a 'try another surface' prompt
Acceptance criteria: Proof page shows attempt count and task-scoped capability language; global mastery phrasing absent unless >=2 distinct tasks passed first-try
Required regression test: Complete with a failed first attempt; assert proof page displays the failed attempt and no unqualified mastery claim
Dependencies: A5-03
Estimated effort: M
Score leverage: high
Related source issues: A5-07
```

## MB-013 — Generative moments are done for the learner: system authors both competing models, both predictions, the result interpretation, and the boundary conclusion; the learner only confirms — realised experience ≈ well-instrumented lecture
```text
Issue ID: MB-013
Severity: P1
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Pedagogy
Affected route: /session/<id> (Step 1 Question); /session/<id> (Step 4 Boundary -> Apply tab, rule builder); /session/<id> (Step 4 Boundary, Experiment Theater); /session/<uuid> (step 2 Prediction)
Affected journey: Test result -> Boundary; Boundary -> rule construction; Question; 5-6 - state belief, commit prediction
Affected user: learner at the result stage; learner building the carry-forward rule; passive learner; first-time learner
Affected Devpost criterion: Potential Impact
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Run the fair test
Reproduction steps: ["After result, open Observe tab (already 'Completed' with no learner act)", "Open Boundary tab: 'The conclusion changes at the entity boundary. The verified whole-customer run has 0 shared customers; the random-row run has 389.'", 'Note no prompt ever asks the learner to interpret 59.4% in their own words']
Expected behaviour: The learner states what the result means and where the conclusion changes before (or instead of) the app stating it
Actual behaviour: All interpretation text is pre-written; the only learner act in the Theater is tab-clicking || Zero-construction click-through is the default path; free-write starts from app text; rule content receives no response || Full canned claim inserted and accepted unchanged; flows into 'Your claim' everywhere with no provenance mark || The only required learner inputs are a claim sentence, one radio choice, and optional confidence. Click-through without thinking is possible at the product's signature step.
Direct evidence:
  - [Directly observed] Boundary stated verbatim; Observe auto-Completed (evidence/screenshots/agent5_13_boundary.png; agent5_15_boundary_tab.png)
  - [Directly observed] Pre-selected dropdowns; pre-filled free-write (evidence/screenshots/agent5_17_transfer.png; agent5_18_write_freely.png)
  - [Reproduced] Starter claim inserted verbatim (78 chars), accepted (evidence/screenshots/agent5_28_starter_claim.png)
  - [Directly observed] Confirmation-only flow; seal UI disabled until radio chosen; slider preset 72% (evidence/screenshots/agent2_07_prediction_confirm.png, agent2_08_seal_prediction_ui.png)
Likely cause (inference, unverified): Sample path optimized for deterministic demo; no generative checkpoint implemented between result and rule || Template-first design; no evaluator for learner prose || Accessibility/anti-dropoff affordance without provenance tracking || Scaffolding chosen for reliability over generative learning; radio options bound to fixed lesson models.
What remains unverified without source access: Live path may insert generative steps (could not test) || none || Whether live sessions require more learner-authored prediction.
Learner impact: The core sense-making act (evidence -> conclusion) is watched, not performed; retention and transfer suffer || Reflection step can be completed without a single generated word; illusion of competence || Belief elicitation can be bypassed entirely; downstream 'your belief' artifacts may contain no learner content || Weak generation effect; commitmen…
Judge impact: A pedagogy-savvy judge sees lecture, not inquiry, at the pivotal moment || Moderate; visible on first walkthrough || Low-moderate || Moderate: judges probing the 'locked prediction' claim find it is a confirm-click.
Trust impact: Moderate || Low-moderate || Low || Neutral.
Recommended correction: Insert a required learner interpretation ('In one sentence: which model survived and how do you know?') before revealing the app's reading; make Observe completion contingent on it || Empty defaults with at least one distractor per slot; blank free-write; echo the learner's rule at transfer and proof with a self-rating ('does the forecasting case match your rule?') || Use sentence frames with blanks instead of complete claims; flag template-assisted claims in UI and proof record || Ask for a fre…
Smallest acceptable correction: Add one required empty textarea at Observe; reveal app interpretation after submission || Start free-write empty and remove dropdown defaults || Require >=1 edit to the starter text before 'Compare two explanations' enables || Remove the 72% preset (start empty) and require a one-line 'why I expect this' before sealing.
Acceptance criteria: Progress past Observe requires a non-empty learner-authored interpretation entered before the app's conclusion text is visible || Rule builder loads with no clause pre-selected (or blank free-write); at least one keyed-wrong clause exists per slot || Unedited starter claim cannot advance; or claim is labeled 'template-assisted' at seal and on proof page || Sealed prediction contains at least one learner-authored token beyond a radio id.
Required regression test: Attempt to advance with empty interpretation (blocked); submit text, assert app conclusion appears only after || Load rule builder, assert select values are empty; assert option count >= 3 per slot || Insert starter, click through unchanged, assert blocked or flagged || E2E: seal button remains disa…
Dependencies: none
Estimated effort: M
Score leverage: high
Related source issues: A5-05, A5-06, A5-08, A2-08
```

## MB-014 — One-sentence novelty/track-fit failure: 'CI for understanding' reads as developer tooling; homepage first-20-second test fails who-it's-for / why-prediction / what-Codex-does; Education-track student/teacher anchor absent
```text
Issue ID: MB-014
Severity: P1
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Judge comprehension
Affected route: /; /, /judge; Submission category field + project description
Affected journey: judge-first-20-seconds / judge-3-minute; Stage One screening; submission-only judging; 1-3 (land, understand, choose action)
Affected user: judge; screener checking theme fit; Education judge (Leah Belsky, VP of Education); first-time learner with no notebook and no prior context
Affected Devpost criterion: Quality of the Idea
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: CounterLab enters the Education track
Reproduction steps: ['Screener reads the short description', "Asks: does this 'specifically push forward AI for education — helping students, teachers, or educational organizations'?"]
Expected behaviour: First two lines name the education audience and the learning problem (misunderstanding detection in student notebooks; grading/feedback for teachers)
Actual behaviour: Strong tagline exists ('Ask like chat. Prove it like science.') and /judge has 'Generated vs. computed vs. verified', but nowhere is the delta stated in one sentence, no lineage is cited, and no named contrast is made. A judge with education background sees Mazur 1997; a technical judge sees a leakage linter with chat; the distinctive composition (sealed prediction + fixed-kernel computed evidence + frozen verifier + signed artifact + transfer-gated repair on the learner's own notebook) must be self-assembled. || Briefing framing is engineering-flavored ('CI for understanding', kernels, verifi…
Direct evidence:
  - [Inferred from behaviour] Home + /judge copy as mapped: tagline, 4 authorities (GPT-5.6 frames / Codex compiles / fixed kernel computes / frozen verifier decides), 3 modes, limits; no lineage or vs-comparison text observed (02_PUBLIC_ROUTE_AND_STATE_MAP.md §R1, §R2)
  - [Documented publicly] POE pedagogy since White & Gunstone 1992 (from Champagne et al. 1979): predict-observe-explain discrepancy loop (https://bioresscientia.com/article/the-taxonomy-of-predict-observe-explain-poe-as-a-teaching-strategy-and-thinking-process-of-chemistry-stakeholders (accessed 2026-07-19))
  - [Documented publicly] Peer Instruction: students commit to an answer before reveal/discussion (Mazur 1997); commitment is the active ingredient (https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2018.00033/full (accessed 2026-07-19))
  - [Documented publicly] LAMS POE template already includes prediction + confidence level + explanation + reflection (https://teach.lams.es/pedagogies/poe (accessed 2026-07-19))
  - [Documented publicly] sklearn-diagnose: LLM diagnosis of sklearn models for overfitting, data leakage, class imbalance + chatbot (https://github.com/leockl/sklearn-diagnose (accessed 2026-07-19))
  - [Education track definition] "Projects that specifically push forward AI for education - either helping students, teachers, or educational organizations." (https://openai.devpost.com/ (accessed 2026-07-19))
  - [Stage One (template)] "pass/fail whether the ideas meet a baseline level of viability, in that the Project reasonably fits the theme" (https://openai.devpost.com/rules (2025 doc served 2026-07-19; Build Week wording unverified))
  - [Education welcome note] "The Education track in particular welcomes projects from students, educators, and learners." (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
  - [Directly observed] Cold-pass transcript and 10-question table in 03_FIRST_TIME_LEARNER_AUDIT.md section 1 (evidence/screenshots/agent2_01_homepage_cold.png)
Likely cause (inference, unverified): Team built the mechanism but wrote the surface copy for mechanism appreciation, not for 20-second novelty comprehension; no lineage/competitive section was produced || Team describes the mechanism (CI/verification) instead of the learner outcome || Fold optimized for atmosphere over comprehension; key explainer copy lives in-session; no 'how it works' visual.
What remains unverified without source access: Whether the Devpost submission text or demo video states the delta (not publicly observable at audit date) || True || Intended audience may be judges rather than true learners; /judge may carry the framing.
Learner impact: low — learners feel the loop even if they can't name it || framing drives whether the UX serves learners first || Learner starts without a mental model of the loop they are about to enter; prediction-first mechanic is a surprise.
Judge impact: critical — 'Quality of the Idea' is scored on perceived novelty vs existing concepts; a judge who files CounterLab as 'Socratic tutor #47' or 'leakage linter with chat' scores it down || Theme-fit doubt at Stage One; weaker Impact story for the education judge || Moderate: judges get the thesis quickly via sample, but the product's education identi…
Trust impact: medium — unclaimed lineage can read as unawareness of the literature once noticed || medium || Trust words without referents read as marketing.
Recommended correction: Add a 'Why this is new' block to /judge and the Devpost page: one sentence of invariant ('No number on this page was written by an AI — every number is recomputed by a pinned kernel from downloadable evidence'), one line of lineage ('POE gave science class the loop; CounterLab makes it machine-checked'), three named contrasts (Study Mode/Khanmigo explain; Kaggle teaches leakage as content; NBLyzer/sklearn-diagnose lint code — none seal a prediction and issue a checkable learning artifact) || Rew…
Smallest acceptable correction: One sentence under the /judge hero: 'Chatbots explain your notebook. CounterLab seals your prediction, recomputes the answer with a pinned kernel, and signs the belief change. Predict-Observe-Explain, machine-checked.' || Lead the description with one student and one teacher scenario || Replace the tagline block with: 'For learners with a Python notebook: state what you believe your result means, …
Acceptance criteria: ['A first-time visitor can find and quote the novelty sentence within 20 s on / and /judge', 'Lineage (POE and/or Peer Instruction) explicitly cited on a public surface', 'At least 3 named competitor/prior-art contrasts present on /judge'] || A screener can classify the project as Education within 15 seconds of reading || Cold users can answer 8/10 questions in hallway testing; 'prediction' appears on the fold.
Required regression test: Greppable marker text on / and /judge (e.g. the invariant sentence); re-audit: new judge persona can state the delta unprompted after reading the hero || 3-person classification test on the final short description || Snapshot test asserting key explainer strings present on /.
Dependencies: 
Estimated effort: S
Score leverage: medium-high — protects Stage One and Impact
Related source issues: A15-01, A14-08, A2-05
```

## MB-015 — Flagship Proof Capsule is not inspectable from /judge: no sample capsule link; reaching one needs ~25 clicks / ~10 min; category-owning proof exists only in the (broken) live mode
```text
Issue ID: MB-015
Severity: P1
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Judge experience
Affected route: /judge; /new, /session/<uuid>; /replay/leakage-01, /judge
Affected journey: judge-10-minute deep dive; judge live verification; judge 60-second test; judge-3-minute replay verification
Affected user: judge; time-boxed judge
Affected Devpost criterion: Technological Implementation
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Attempt the live path: /new -> 'Continue with my notebook' without attaching a supported .ipynb
Reproduction steps: ["1. From /judge choose 'Run live' (/new)", "2. Click 'Continue with my notebook' without an upload", '3. Observe step-1 state', '4. Attempt to find any public end-to-end live trace on a non-sample notebook']
Expected behaviour: The mode that proves the headline claim ('reality answers about YOUR notebook') is runnable by a judge end-to-end, or a public live trace on a reviewer-visible notebook exists
Actual behaviour: Without an upload the live path dead-ends in perpetual 'Preparing artifact...' labelled 'Uploaded notebook evidence' with no prompt to upload (Agent 1, Reproduced 2x). Upload itself is untestable from black-box seats. All publicly reachable evidence (sample session, replay leakage-01) is canned on a seeded lesson. No public live trace on a non-sample notebook was found. || The single most persuasive technical asset is reachable only after ~25 interactions || Replay is honest about its limits but the capsule — the product's signature object — is precisely what the replay cannot produce; replay …
Direct evidence:
  - [Inferred from behaviour] R3: dead end, misleading 'Uploaded notebook evidence' label, only escape is 'Use a different notebook' file input (02_PUBLIC_ROUTE_AND_STATE_MAP.md §R3)
  - [Could not test] File upload end-to-end from either audit seat (02_PUBLIC_ROUTE_AND_STATE_MAP.md §4)
  - [Documented publicly] Judges 'may, but are not required to' test; they may judge solely on description/images/video (https://openai.devpost.com/details/faqs via work/agent14_devpost_rules.md §2.5 (accessed 2026-07-19))
  - [Directly observed] no artifact link anywhere on /judge (evidence/screenshots/agent3_judge_scroll1.png, agent3_judge_scroll4_bottom.png)
  - [Observed in generated artifact] capsule richness: 16 chained events, codex/verifier actors, externalVerifier invariants, HMAC (evidence/artifacts/agent3_proof_record_sample_session.json)
  - [Inferred from behaviour] Replay final buttons disabled; 'legacy v1 replay is genuine but does not offer a Proof Capsule download'; only replay id is leakage-01 (Recorded 2026/7/14) (02_PUBLIC_ROUTE_AND_STATE_MAP.md §R2, §R6)
  - [Inferred from behaviour] Four distinct hash values presented as 'the' result hash across sample/replay/notebook metadata (A1-10) (02_PUBLIC_ROUTE_AND_STATE_MAP.md §3)
Likely cause (inference, unverified): Live mode depends on upload + configured live authority; demo effort concentrated on the deterministic sample/replay paths; no fallback 'cannot attach? watch this live trace' path || capsule treated as a session output rather than a marketing artifact; anti-'prerecorded' stance made the team avoid publishing a canned capsule || Replay format predates capsule issuance (v1), no v2 replay recorded
What remains unverified without source access: Whether live mode works for a judge with a supported notebook and a real browser (no black-box seat could attach a file) || none || Whether a v2 replay with capsule is planned
Learner impact: medium — first-time learners hitting /new from the home claim submit land in the same dead end || none || low
Judge impact: critical — a skeptical judge can dismiss the category claim as one scripted lesson; the strongest evidence mode is exactly the one that may not demo || high for the 60-second test: 'a verified result' and 'meaningful Codex use' remain claims, not inspectable evidence || medium — the fully deterministic verification path ends one step short of the f…
Trust impact: high — 'unsupported evidence is refused, not guessed' promise is undermined if supported evidence can't be tried || medium-high || medium — honest labelling mitigates, but the asymmetry is noticeable
Recommended correction: Ship (a) a public 'verified live trace' on a reviewer-visible non-sample notebook (replay-style, clearly labelled), and (b) fix the /new dead end: detect no-artifact and route to an explicit upload prompt or the sample, never a perpetual 'Preparing artifact' || Publish one featured, labelled sample capsule (download + pretty viewer) and link it from the /judge hero and the replay's disabled-download explanation || Record a v2 replay whose final state includes a downloadable capsule; disambiguate…
Smallest acceptable correction: Record one live session on a fresh sklearn notebook (not the sample), publish it as /replay/live-01 labelled 'live capture', and link it from /new's failure state || Link a completed sample /proof/<uuid> ('Inspect a finished proof page') from the sample-mode card || Add one line on the replay final state: 'Capsule issuance was added after this recording; start the sample to receive one.'
Acceptance criteria: ['A judge can reach a complete computed-evidence trace without uploading anything', "No path shows 'Uploaded notebook evidence' when no artifact exists", '/new without an artifact offers explicit upload affordance + sample fallback'] || A judge can inspect a real capsule within 2 clicks of /judge || ['At least one public replay ends with a downloadable capsule', 'Hash terminology disambiguated wherever shown']
Required regression test: Fresh-session walk of /new with no upload terminates in an actionable state within 2 clicks; public live trace id resolves || e2e: /judge contains a working link to a completed proof page and/or capsule download || Replay walkthrough test asserts capsule download enabled at final state for v2 replay…
Dependencies: ['Agent 1 issue A1-03 (live-mode dead end)']; a stable featured session id; ['A1-10', 'A1-07']
Estimated effort: M
Score leverage: high
Related source issues: A15-02, A3-12, A15-11
```

## MB-016 — Determinism/computation claim scoping: 'fixed kernels calculate the result' / 'Computes every number' is presented on surfaces where results are a stored 2026-07-14 recording replayed into fresh sessions; claim must be scoped per evidence mode
```text
Issue ID: MB-016
Severity: P1
Confidence: High
Reproducibility: Reproduced by multiple independent agents
Category: Claim accuracy
Affected route: /session/<id> (Step 4, Explore tab); /session/<id> (sample) vs /replay/leakage-01; /session/<uuid> (sample), /replay/<id>, /judge; https://counterlab.cserules.workers.dev/ (and /judge)
Affected journey: hands-on judging; Learner/judge runs the sample fair test believing the kernel computed it live; Sample lesson Test step and Proof page; Test -> Explore
Affected user: judge re-running the same question/notebook; Learner and judge; learner, judge; learner wanting to probe the result
Affected Devpost criterion: Technological Implementation
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: GPT-5.6 frames belief (stochastic); kernels deterministic (as claimed)
Reproduction steps: ['Judge submits the same input twice', 'Compares framing text and verdict']
Expected behaviour: UI/copy scope determinism precisely: plans/kernels/verifier deterministic; LLM framing may vary — and the verdict itself is stable
Actual behaviour: Could not test; risk that copy implies end-to-end determinism while visible text varies run-to-run || The experiment result is byte-identical across every observed session (resultHash a6ae7652e04e...; accuracy 0.9847/0.5944/0.6736) and the lab.verified payload states source 'stored-approved-leakage-v1', recordedAt 2026-07-14T11:18:03Z, image 'counterlab-runner:local'. The versions block states environment 'Cloudflare Worker with recorded local Docker runner evidence'. Yet the four-authorities copy says 'Fixed kernel - Computes every number - Runs registered split, metric ... deterministically …
Direct evidence:
  - [Product claim] 'fixed deterministic kernels (compute results)' alongside 'GPT-5.6 (frames belief)' (audit briefing (unverified context))
  - [Functionality-depiction rule (template)] Project "must function as depicted in the video and/or expressed in the text description" (https://openai.devpost.com/rules (2025 doc served 2026-07-19))
  - [Observed in network response] lab.verified payload: source 'stored-approved-leakage-v1', recordedAt 2026-07-14, image counterlab-runner:local; identical resultHash across my session and three prior agents' bundles. (/api/sessions/session_f0a81fbb-.../events and artifacts/agent2_proof_record_leakage-01.json)
  - [Observed in generated artifact] versions.environment = 'Cloudflare Worker with recorded local Docker runner evidence'. (artifacts/agent2_proof_record_leakage-01.json (versions block))
  - [Directly observed] Judge page authority C copy 'Fixed kernel - Computes every number'; replay banner 'This path reconstructs recorded events and computed payloads. It is not a live model run.' (browser visits to /judge and /replay/leakage-01)
  - [Directly observed] replay banner vs sample step-3 copy (evidence/screenshots/agent10_sample_step3_test.png ; agent10_replay_ui.png)
  - [Observed in network response] lab.verified payload recordedAt/source fields (/api/sessions/session_297ad7b7-ec53-459e-b562-d006ec8d79d2/events)
  - [Directly observed] Explore panel text: 'Change the test, then let the kernel recompute it... Sample result stays fixed' (evidence/screenshots/agent5_14_explore.png)
Likely cause (inference, unverified): Marketing shorthand ('Prove it like science') not scoped in UI || Workers cannot run the Docker sandbox, so sample/replay serve the pre-verified recorded result for determinism and cost; marketing copy was written around the architecture rather than the deployment reality. || Intentional differentiation of 'sample' vs 'replay' labelling; sample treated as sufficient disclosure. || Reproducibility …
What remains unverified without source access: True || Whether the LIVE path (/new, uploaded notebook) genuinely executes on a live kernel (untestable: file input unavailable); health endpoint reports liveKernel 'configured' only. || — || Live-path interactivity (file upload blocked in audit environment)
Learner impact: learners may over-trust a 'deterministic' label || A learner may believe a live computation just happened for their specific session when it is a canned result; the pedagogy still works but the claim is slightly overstated. || Learners plausibly believe a computation/verification just ran for them. || No experimentation = no inquiry skill practiced…
Judge impact: A falsified determinism impression undercuts the core thesis mid-demo || A technically probing judge who diffes two sessions finds identical hashes and may discount 'working non-trivial implementation' unless the recorded-evidence design is clearly presented as intentional. || Judge page claims sample is 'always labelled as a sample' — technically …
Trust impact: high — the product's epistemic claim is its brand || Medium-High - the product is otherwise unusually candid; this one gap stands out. || Medium-high; the product's core value is epistemic hygiene, so half-labelled provenance cuts deep. || Moderate
Recommended correction: Label layers in UI: 'LLM framing (may vary)' vs 'Deterministic kernel result (reproducible)' vs 'Verifier decision'; show a 'same input → same verdict' replay badge || Label the sample path as 'recorded verified evidence (deterministic replay of the 2026-07-14 verified run)' wherever the four-authorities story appears, and state plainly which modes compute live. || Apply replay-grade disclosure to sample mode: persistent 'Recorded evidence — replayed for this session' note at Test/Repair/Proof. …
Smallest acceptable correction: One scoping sentence next to each verdict || Add one line on step 3 of the sample ('Result authority: Fixed kernel - recorded verified run, replayed deterministically') and a matching footnote on /judge. || One-line provenance note under 'Test plan verified'. || Relabel Explore tab honestly as 'available with your own notebook' and add one precomputed side-by-side comparison the learner can reveal…
Acceptance criteria: Two identical runs produce identical kernel results/verdicts; any framing-text variance is visibly labeled as such || A user can tell, without reading the API, that sample/replay results are recorded; live vs recorded modes are explicitly distinguished in the UI. || A first-time user can state, unprompted, that no computation ran for their session. || Sample Explore offers >=1 control whose change produces a different verified metric; or tab is c…
Required regression test: Automated double-run diff on the canned demo before submission || Run two sample sessions; if hashes are identical, assert the UI discloses recorded provenance on the result screen. || Copy audit of steps 3/6/proof for the words 'recorded'/'replayed'. || Toggle identity feature in sample; assert met…
Dependencies: ['A14-06']; None.; None; none
Estimated effort: M
Score leverage: medium-high
Related source issues: A14-12, A9-04, A10-03, A5-09
```

## MB-017 — Command palette and several download/patch buttons expose shortcut letters ('N','E','V') or no accessible name at all — screen-reader users hear 'N button, button'
```text
Issue ID: MB-017
Severity: P1
Confidence: High (element list)
Reproducibility: Always
Category: Accessibility
Affected route: /session/<uuid> - Command palette (opened via Studio drawer > Commands or Ctrl+K)
Affected journey: Any journey using the command palette
Affected user: Screen-reader learner/judge
Affected Devpost criterion: Design
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Open Studio drawer (Project & evidence) then 'Commands', or press Ctrl+K
Reproduction steps: ['Open palette', 'Inspect interactive elements']
Expected behaviour: Each command is a single control whose accessible name is its descriptive label (e.g. 'Analyze notebook')
Actual behaviour: Commands render as button+span siblings: button names are 'N', 'E', 'V' (the keyboard-badge letters); 'Review patch' and 'Download patched notebook' buttons have empty names; the descriptive text sits in a separate non-focusable span. SR users hear 'N button, E button, V button, button, button'
Direct evidence:
  - [Directly observed] Element list: [2]<button N/>, [3]<span Analyze notebook Start a new live notebook session./>, [4]<button E/>, [6]<button V/>, [8]<button /> ('Review patch'), [10]<button /> ('Download patched notebook') (palette element dump; shots/palette.png)
  - [Directly observed] Typing 'proof' filters correctly to 'Export proof', so palette works for sighted mouse/keyboard users (shots/palette2.png)
  - [Directly observed] Palette footer states 'All commands also have visible controls in the workspace' - a real mitigation (shots/palette.png)
Likely cause (inference, unverified): Card layout splits kbd badge (inside <button>) from label (sibling <span>); accessible name computed from badge text only; missing aria-label/aria-labelledby
What remains unverified without source access: 
Learner impact: Palette unusable non-visually: commands indistinguishable
Judge impact: A judge testing with a SR or inspecting the a11y tree finds broken naming in a signature power-feature
Trust impact: Signals a11y was not tree-checked; undermines 'proof' positioning
Recommended correction: Wrap badge+label in one <button> and put the description inside it (or aria-labelledby to the label span); hide kbd badge with aria-hidden=true
Smallest acceptable correction: Add aria-label='Analyze notebook' etc. to each palette command button and aria-hidden to the letter badges
Acceptance criteria: ['Every palette command has a non-empty accessible name equal to its visible label', 'Letter badges not exposed to AT']
Required regression test: Accessibility-tree snapshot test: assert each palette item's name matches its visible label
Dependencies: 
Estimated effort: XS
Score leverage: Medium-High
Related source issues: A8-03
```

## MB-C07 — Submission: judges are not required to test — Devpost page must self-contain the verdict/rejection/replay artifacts and the strongest moment
```text
Issue ID: MB-C07
Severity: P1
Confidence: high
Reproducibility: rule reproducible; page content unverifiable (not yet public)
Category: Submission compliance
Affected route: CounterLab Devpost project page (not yet publicly observable; gallery still shows 2025 hackathon)
Affected journey: submission-only judging
Affected user: judge who never opens the app
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Judge chooses not to test (explicitly permitted)
Reproduction steps: ['Judge reads title/thumbnail/short description', 'Watches <=3 min of video', 'Scans screenshots and description']
Expected behaviour: Problem, audience, verdict story, evidence modes, GPT-5.6 + Codex roles, and verify-it-yourself links all present on the page
Actual behaviour: Could not test — page not public
Direct evidence:
  - [Default judging path] "Judges are not required to test the Project and may choose to judge based solely on the text description, images, and video provided in the Submission." (https://openai.devpost.com/rules (2025 doc served 2026-07-19) + confirmed by FAQ 'They may, but they're not required to')
  - [Impact criterion is demonstration-bound] "does the solution actually address that problem based on what's demonstrated?" (https://openai.devpost.com/ (accessed 2026-07-19))
Likely cause (inference, unverified): Team assumes judges will click through to the live app
What remains unverified without source access: True
Learner impact: none
Judge impact: Page-only judges score on whatever is on the page — missing artifacts = missing points
Trust impact: medium
Recommended correction: Design the page as the product: headline verdict screenshot, 3 evidence-mode panels, GIF of a real leakage catch, links block (live app, /judge, repo)
Smallest acceptable correction: Add 3 annotated screenshots: verdict, verifier rejection, replay receipt
Acceptance criteria: A reader who never opens the app can state the problem, audience, one real catch, and how GPT-5.6/Codex were used
Required regression test: Hallway test: 2 people read only the page for 3 minutes and recount the above
Dependencies: 
Estimated effort: M
Score leverage: high — this is the modal judging path
Related source issues: A14-07
```

## MB-C08 — Submission: README must name Codex acceleration points, key decisions, GPT-5.6 integration (feeds two criteria)
```text
Issue ID: MB-C08
Severity: P1
Confidence: high (documented); README unverified
Reproducibility: not reproducible — repo not found
Category: Submission compliance
Affected route: Repo README
Affected journey: hands-on judging; repo review
Affected user: judge scoring Technological Implementation and Quality of the Idea
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Repo accessible (see A14-05)
Reproduction steps: ['Judge opens README', 'Looks for Codex acceleration points, key decisions, GPT-5.6 integration']
Expected behaviour: Dedicated README section with concrete Codex moments (e.g., 'Codex scaffolded the verifier kernel; key decision: frozen verifier')
Actual behaviour: Could not test
Direct evidence:
  - [README mandate] "Make sure to highlight where Codex accelerated your workflow, where key decisions were made and how GPT-5.6 and Codex were used. This is an important part of how judges evaluate technical implementation and quality of t (https://openai.devpost.com/ (accessed 2026-07-19))
Likely cause (inference, unverified): README written as engineering doc, not as judging evidence
What remains unverified without source access: True
Learner impact: none
Judge impact: Two criteria lose their primary written evidence
Trust impact: medium
Recommended correction: Add 'Built with Codex' section: 3-5 concrete acceleration examples, 2-3 key decisions, GPT-5.6 call sites, link to Session ID context
Smallest acceptable correction: One bulleted README subsection with 5 bullets
Acceptance criteria: Judge can quote one Codex acceleration example and one key decision after 2 minutes in the README
Required regression test: Fresh-eyes README scan before submission
Dependencies: ['A14-05']
Estimated effort: S
Score leverage: high — direct feed to two criteria
Related source issues: A14-09
```

## MB-C09 — Submission: video hard limits ≤3:00, public listing, English, rights-clean (UNVERIFIED)
```text
Issue ID: MB-C09
Severity: P1
Confidence: high (documented); video unverified
Reproducibility: not reproducible — video not public/found
Category: Submission compliance
Affected route: Submission video URL
Affected journey: submission-only judging
Affected user: judge with a 3-minute attention budget
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Video produced (see A14-02)
Reproduction steps: ['Check runtime', 'Check public visibility logged-out', 'Check audio/language/rights']
Expected behaviour: <=3:00, public, English or translated, rights-clean
Actual behaviour: Could not test
Direct evidence:
  - [3-minute rule] "should be less than three (3) minutes. Judges are not required to watch beyond three minutes" (https://openai.devpost.com/rules (2025 doc) and FAQ (2026-07-19))
  - [Rights rule (template)] "must not include third party trademarks, or copyrighted music or other material unless the Entrant has permission" (https://openai.devpost.com/rules (2025 doc served 2026-07-19))
Likely cause (inference, unverified): Overlong cut; 'unlisted' instead of 'public'; stock music without license
What remains unverified without source access: True
Learner impact: none
Judge impact: Key content past 3:00 may be ignored; unlisted video may be treated as non-public
Trust impact: medium
Recommended correction: Cut to <=2:50 with the verdict moment in the first 45 s; verify visibility incognito
Smallest acceptable correction: Trim to 3:00 and flip YouTube visibility to Public
Acceptance criteria: Incognito playback works; runtime <=3:00; narration intelligible
Required regression test: Pre-submit checklist: runtime, visibility, language, music rights
Dependencies: ['A14-02']
Estimated effort: S
Score leverage: medium-high
Related source issues: A14-10
```

## MB-C10 — Submission: if project predates 2026-07-13, 'what's new' + timestamped Codex/GPT-5.6 evidence required (UNVERIFIED)
```text
Issue ID: MB-C10
Severity: P1
Confidence: medium (whether the project pre-existed is unknown)
Reproducibility: not verifiable externally
Category: Submission compliance
Affected route: Repo commit history + submission description
Affected journey: pre-submission; judge verification
Affected user: judge/verifier checking period compliance
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: Any part of CounterLab existed before the Submission Period (began 2026-07-13 09:00 PDT)
Reproduction steps: ['Team determines if project pre-existed', 'If yes: document what is new + timestamped session logs/commit history showing Codex and/or GPT-5.6 use during the period']
Expected behaviour: Clear 'what's new' statement with period evidence, or an all-new project
Actual behaviour: Unverified
Direct evidence:
  - [FAQ] "If your project existed before the hackathon, you'll need to clearly document what's new, including evidence that Codex and/or GPT-5.6 was used during the Submission Period (timestamped session logs, commit history, etc (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
  - [Rules quote via FAQ] pre-existing projects "must have been meaningfully extended using Codex and/or GPT-5.6 after the Submission Period start date." (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
Likely cause (inference, unverified): Workers project or notebook corpus existed before Build Week
What remains unverified without source access: True
Learner impact: none
Judge impact: Undocumented pre-existing work can be read as period-rule violation
Trust impact: high if discovered undocumented
Recommended correction: Add README 'What's new during Build Week' section with dated commits and Codex session references
Smallest acceptable correction: One description paragraph + link to commit range
Acceptance criteria: A verifier can match every pre-Jul-13 artifact to a documented extension
Required regression test: git log audit against Jul 13 09:00 PDT boundary
Dependencies: ['A14-09']
Estimated effort: S
Score leverage: medium
Related source issues: A14-11
```

## MB-C11 — Deadline: T-72h from 2026-07-19 00:00 UTC to Tue 2026-07-21 17:00 PDT; no post-deadline edits; freeze T-24h, submit by T-5h
```text
Issue ID: MB-C11
Severity: P1
Confidence: high (deadline triply documented; math verified)
Reproducibility: deterministic
Category: Submission compliance
Affected route: Devpost submission form
Affected journey: pre-submission
Affected user: CounterLab entrant
Affected Devpost criterion: All four
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: none
Reproduction steps: ['Compute remaining time', 'Schedule video upload, README freeze, form submission with buffer']
Expected behaviour: Submission complete well before 2026-07-21 17:00 PDT
Actual behaviour: At audit: ~3 days remain (75.6 h from actual audit moment 2026-07-18T20:24Z; 72.0 h from canonical 2026-07-19T00:00Z; 65.0 h from 2026-07-19T00:00 PDT)
Direct evidence:
  - [Deadline (homepage)] "Submissions are due Tuesday, July 21 at 5:00 PM PT." (https://openai.devpost.com/ (accessed 2026-07-19))
  - [No edits after] "No changes can be made to your submission after the Submission Period ends on July 21 at 5:00 PM PT." (https://openai.devpost.com/details/faqs (accessed 2026-07-19))
  - [Dates table cross-check] Submissions end Jul 22 08:00 GMT+8 = Jul 21 17:00 PDT (https://openai.devpost.com/details/dates (accessed 2026-07-19))
Likely cause (inference, unverified): Underestimating video production + upload + form time
What remains unverified without source access: 
Learner impact: none
Judge impact: Late or rushed submission = not judged or weakly judged
Trust impact: n/a
Recommended correction: Internal freeze at T-24h (2026-07-20 17:00 PDT); submit by T-5h; keep editing window until T-1h for typos only
Smallest acceptable correction: Put the PDT deadline with timezone on the team wall
Acceptance criteria: Form shows 'submitted' state before 2026-07-21 12:00 PDT
Required regression test: Countdown check at each daily standup
Dependencies: ['A14-02', 'A14-05']
Estimated effort: S
Score leverage: high (fatal if missed)
Related source issues: A14-18
```

## MB-048 — A nonsense claim rides all the way into an HMAC-signed 'VERIFIED' Proof Capsule (Reasoning Diff 'Before' = gibberish); the only escape valve ('Not enough evidence') bricks the session
```text
Issue ID: MB-048
Severity: P1
Confidence: High
Reproducibility: Reproduced (Agent 10); mechanism cross-checked by Agent 16
Category: Verification integrity
Affected route: /proof/<id> and /api/sessions/<id> (completed sample session); /session/<id> (Step 2 Prediction); /session/<id> (sample lesson), step 2 Prediction; /session/<id> step 2; /session/{id} — Step 2 Predict
Affected journey: Start sample → enter any claim → 'Compare two explanations'; Complete sample with an off-topic claim; Question -> Prediction; Sample lesson, Question → Prediction; Sample lesson
Affected user: learner (also judge evaluating AI claims); learner, judge, anyone verifying the capsule; learner who wrote a custom claim vs learner who used starter claim; lea…
Affected Devpost criterion: Technological Implementation
Environment: Production https://counterlab.cserules.workers.dev/ (Cloudflare Workers), desktop browser 1920×1080, 2026-07-19
Prerequisites: None (no account)
Reproduction steps: ["Open / and click 'Try verified sample'.", "Enter claim A: 'Purple bananas taste better on Tuesdays, therefore this notebook's score is meaningless.' → Compare two explanations.", 'Repeat in a fresh sample with claim B: a self-contradictory claim asserting both generalization and its negation.', 'Compare framed hypotheses across sessions and against swarm bundle agent5_proof_record.json (sensible churn claim).', 'Fetch /api/sessions/<id> and inspect beliefTest.']
Expected behaviour: Framing sensitive to the claim; off-topic/nonsense claims refused or flagged ('unsupported evidence is refused, not guessed'); contradictory claims detected.
Actual behaviour: currentHypothesis/competingHypothesis/evidenceRefs/alternatives/decisiveIntervention/uncertainty are BYTE-IDENTICAL across all three claims; only learnerClaim echoes input verbatim; uncertainty.confidence=0.93 and insufficientEvidence=false even for nonsense; the contradiction is never detected and the system arbitrarily keeps the 'generalizes' framing. belief_test.proposed event actor is 'system' with modelId 'leakage-customer-churn-belief-v1' (a prompt-template slug); there is no model/gpt actor in the event chain; proposed event outputHash differs per claim, so the hash binds the claim but …
Direct evidence:
  - [Reproduced] 3 sessions: agent5 (sensible), session_297ad7b7 (absurd), session_aadb0d7d (contradictory) → identical framing text (/api/sessions/session_297ad7b7-ec53-459e-b562-d006ec8d79d2 ; /api/sessions/session_aadb0d7d-cf80-4cee-8621-a52fbc27f4f1 ; evidence/agent5_proof_record.json)
  - [Observed in generated artifact] beliefTest.uncertainty {confidence:0.93, insufficientEvidence:false} for the purple-bananas claim (/api/sessions/session_297ad7b7-ec53-459e-b562-d006ec8d79d2)
  - [Directly observed] screenshots of step-2 framing for absurd and contradictory claims (evidence/screenshots/agent10_sample_step2_framing.png ; agent10_contradictory_framing.png)
  - [Observed in generated artifact] proof bundle fields (/api/sessions/session_297ad7b7-ec53-459e-b562-d006ec8d79d2)
  - [Directly observed] proof page Before/After (evidence/screenshots/agent10_sample_patch_verified.png)
  - [Reproduced] Identical paraphrase across two sessions with different claims (agent5_04 vs agent5_29; session_27c89195 vs session_e4c7ea89)
  - [Observed in generated artifact] events[1] belief_test.proposed actor=system; events[2] belief_test.confirmed actor=learner (evidence/agent5_proof_record.json)
  - [Reproduced] Identical framing across misconception, injection, ambiguous, nonsense inputs (agent16_after_claim.png, agent16_injection_result.png, agent16_ambiguous_result.png, agent16_nonsense_result.png)
  - [Observed in generated artifact] beliefTest.currentHypothesis/competingHypothesis identical across sessions; versions.model='leakage-customer-churn-belief-v1' (proof record JSON)
  - [Directly observed] Replay banner separately claims Model 'gpt-5.6-sol' for the recorded session (agent16_replay.png)
Likely cause (inference, unverified): Sample mode uses a stored Belief Spec template (modelId=leakage-customer-churn-belief-v1); no model is invoked in sample mode (judge page: 'no account or model credential'), and no input validation/refusal layer exists for claim text. || No semantic gate between claim intake and proof issuance; proof integrity covers tamper-evidence only, not meaningfulness. || Fixed belief-test template per conce…
What remains unverified without source access: Sample mode IS labelled canned ('Instant sample','bundled approved evidence') — the falsified elements are (a) the personalizing framing copy and (b) the GPT-5.6-forward dossier language; whether live uploaded-notebook sessions produce genuinely input-sensitive GPT-5.6 framing is untestable black-box.
Learner impact: Any words a learner writes are 'understood' as the same leakage misconception; the product pretends to have read and framed the learner's idea when it has not. || A learner can generate an authoritative-looking certificate for gibberish; the certificate's epistemic meaning collapses. || The learner's role collapses to confirming the tutor's framing…
Judge impact: The headline claim 'GPT-5.6 frames beliefs' is not demonstrated in the only two inspectable paths; judges testing with creative claims get canned output. || Judges can reproduce a 'verified proof' for a nonsense claim in ~3 minutes. || A judge testing two different claims sees identical follow-through, reading as scripted || High: two different typ…
Trust impact: Core epistemic promise ('reality answers, not prose') is violated at the framing layer: prose is templated and never refuses. || High — the product's output artifact does not mean what it appears to mean. || Claim of learner-centred elicitation is overstated || Medium-high: mild illusion of understanding at the product's signature step. || Medium —…
Recommended correction: Label sample framing as a pre-authored example ('In this sample, the belief spec is pre-written; live mode frames your claim'), and/or invoke the real model in sample mode; add claim-level sufficiency checks that set insufficientEvidence=true and refuse off-topic input. || Gate proof issuance on a meaningful claim-binding check; at minimum surface claim/framing mismatch warnings in the capsule. || Require a learner-authored model statement (empty textarea) before showing the system pair; or visi…
Smallest acceptable correction: Add an in-flow disclosure line on step 2: 'These two explanations are pre-authored for the bundled sample, not generated from your claim.' || Add a visible 'claim was not analyzed' flag in the capsule when running in template mode. || Relabel 'Your current explanation' as 'One explanation that fits your claim' and add required 1-sentence learner restatement before the seal || One disclosure line o…
Acceptance criteria: Two different claims produce visibly different framings OR the UI explicitly labels the framing as pre-authored; nonsense claims trigger a visible insufficient-evidence state. || Nonsense claims cannot yield a VERIFIED capsule without explicit warning. || Different claims yield visibly different explanation cards, or a mandatory learner-authored explanation field (empty by default) gates the seal || A judge typing two different claims sees either…
Required regression test: Submit 3 semantically distinct claims; assert framings differ or disclosure banner present; assert nonsense claim yields insufficientEvidence=true or refusal. || E2E: nonsense claim → assert refusal or conspicuous warning in bundle. || Two sessions with claims 'the score is meaningless' vs 'model ge…
Dependencies: None for disclosure; model-backed framing depends on live pipeline.; A10-01; none; None (copy-only in sample mode).; None
Estimated effort: S (disclosure) / M (input-sensitive framing + refusal)
Score leverage: High — directly undermines the Technological Implementation narrative if unaddressed.
Related source issues: A10-05
```

# P2 — Material quality issues (condensed)
### MB-018 (P2, high (existence); medium (novelty attribution)) — Dead navigation: 'How proof works' and 'Review the supported evidence boundary' links are no-ops; sample-mode Explore tab dead-ends
- **Category/criterion:** Navigation → Design  
- **Observed:** Nothing happens: URL stays '/', no new content, no modal, no scroll. The link is an anchor with no effective target. Because unknown routes silently redirect to '/', the click is indistinguishable from a no-op. || No navigation, no modal, no content change; URL stays '/'. || No navigation, modal, scroll, or expansion; only the link's active styling changes. The one-line 'How proof works:' summary   
- **Fix (smallest):** Add href='/judge' (which already contains the 'Generated vs. computed vs. verified' explainer) or an anchor to the footer explainer text. || Repurpose existing /judge 'Known boundary' section as the href target. || Remove the link or point it at the replay page, which already demonstrates the concep  
- **Effort / leverage:** S / high  
- **Sources:** A1-01, A1-02, A2-06, A3-08, A6-12, A15-03, A2-12  
- **Unverified:** Whether the link once targeted a /proof-explainer route or an on-page section removed before submission; exact href not inspectable without DOM access. || Intended target (doc page or modal). || Wheth

### MB-019 (P2, High) — Proof page 'Before'/Reasoning Diff leaks the ambient draft claim during in-app navigation, diverging from the signed record (cold reload correct)
- **Category/criterion:** State consistency → Technological Implementation  
- **Observed:** During SPA navigation (Studio drawer → Recent sessions) with an ambient unsubmitted claim draft present, both the 'Before' card and the Reasoning Diff 'Belief → Before' cell render the NEW draft claim ('agent1 inert probe: does accuracy prove generalization?') — text that was never part of this session — while the downloaded signed record keeps the original claim. A subsequent cold reload of the s  
- **Fix (smallest):** On /proof/<id>, populate 'Before' from beliefTest.learnerClaim of the loaded record only.  
- **Effort / leverage:** S / Protects the single most important screen for the 'Reasoning Diff + Proof Capsule' thesis.  
- **Sources:** A1-04  
- **Unverified:** Precise storage key/scope; whether the divergence can also affect other record-bound strings (prediction text, revision text) on the page.

### MB-020 (P2, medium) — Stale provenance/status labels post-completion: 'Boundary: Locked until verification', 'Capsule: Issued after verified repair', Studio history stale statuses
- **Category/criterion:** State consistency → Design  
- **Observed:** Labels read 'Boundary: Locked until verification' and 'Capsule: Issued after verified repair' even though verification and verified repair have completed — reading as if the boundary is still locked and the capsule only conditionally available. || 'Boundary: Locked until verification' and 'Capsule: Issued after verified repair' are shown even though lab.verified and patch.verified events already e  
- **Fix (smallest):** After verified repair, switch the two lines to past tense with ids. || Change copy to explicit status values derived from the bundle ('Boundary: verified', 'Capsule: issued - proof_<id>'). || Reword rows as static facts ('Boundary check: verified on whole-customer split') or mark policy rows distinc  
- **Effort / leverage:** S / medium  
- **Sources:** A1-13, A2-03, A6-13, A4-08  
- **Unverified:** Whether the labels ever change (e.g., in live mode). || Whether the states ever flip (could not find any UI where they do). || Whether 'Boundary' here refers to a separate Boundary Map feature that is

### MB-021 (P2, high) — Replay chrome defects: stepper frozen at 'Step 4 of 6 · Boundary', 'Preparing proof' never resolves, enabled-looking dead download buttons, tense copy conflicts with the recorded banner
- **Category/criterion:** Replay experience → Design  
- **Observed:** Header remains 'Step 4 of 6 · Boundary' with steps 5 and 6 greyed/unchecked at every later stage, including the final read-only proof view that shows 'Transfer status: Passed'. || Both buttons render in the same blue styling as the functional live-page versions but are non-interactive (absent from the clickable-element set). 'Preparing proof' persists indefinitely, reading as a loading state that   
- **Fix (smallest):** Map replay stages to step numbers for the header only. || Add aria-disabled + grey styling + one-line reason under the buttons. || Replace the spinner label with 'Proof Capsule unavailable for this 2026-07-14 v1 recording' and add a one-line reason under the disabled buttons || Change to past tense   
- **Effort / leverage:** XS-S / medium-high (Design; converts an apparent bug into disclosed honesty)  
- **Sources:** A1-06, A1-07, A3-03, A2-16, A10-12, A2-13, A3-07, A6-16  
- **Unverified:** Whether step state is recorded in the replay event stream or derived client-side. || Intended long-term behavior for legacy replays. || whether 'Preparing proof' ever resolves on very long waits (obse

### MB-022 (P2, High) — No real 404: unknown routes silently redirect to / or render homepage under the bogus URL with only a toast; robots.txt/sitemap swallowed by SPA fallback; favicon request hangs
- **Category/criterion:** Routing / production polish → Technological Implementation  
- **Observed:** Both URLs silently land on '/' with no message. Mistakes are invisible; combined with the app's dead anchors (A1-01/A1-02), bad navigation cannot be distinguished from working navigation. HTTP status code could not be observed (tooling). || A red toast 'Session not found: bogus-agent1' appears top-right while the full homepage renders underneath; the address bar keeps the bogus /session/ or /proof  
- **Fix (smallest):** Catch-all route → toast or banner 'Page not found — returned home'. || Redirect to '/' after showing the toast (consistent with the catch-all) or persist a visible not-found banner. || After the toast, redirect the URL to / so location and content agree. || Add a two-line robots.txt route in the Wor  
- **Effort / leverage:** Small. / Low-Medium.  
- **Sources:** A1-08, A1-11, A9-06, A9-07, A12-08, A16-12  
- **Unverified:** Returned HTTP status (200 vs 3xx) — network layer not observable with allowed tooling. || Toast persistence/auto-dismiss timing; whether an expired-but-real session id behaves the same. || The HTTP st

### MB-023 (P2, high) — Sample/live copy ambiguity: sample mode says 'Uploaded notebook'/'original upload'; 'Run the fair test' implies a live run though the result is a recorded fixture; AI-reframed 'Your current explanation' lacks a generated-by label
- **Category/criterion:** Trust labelling → Technological Implementation  
- **Observed:** Copy says 'Uploaded notebook evidence' and 'The original upload will not be overwritten'. Header badge 'INSTANT SAMPLE' mitigates but the component-level labels conflict. || Button says 'Run'; the fair-test card honestly says 'result not released' two lines above, and badges say 'Verified sample' / 'Result authority: Fixed kernel' - partial mitigation - but the verb promises execution that does no  
- **Fix (smallest):** Replace 'Uploaded' with 'Sample notebook evidence (instant demo)' when mode=sample. || Rename sample-mode CTA to 'See the verified result'. || Add a small 'AI restatement - editable' tag on the card.  
- **Effort / leverage:** XS / medium  
- **Sources:** A2-09, A2-10, A2-15  
- **Unverified:** n/a || Whether live sessions actually execute in the Worker (upload untestable). || Whether the reframe is model-generated per session or template-based (bundle shows a codex actor for lab compilation

### MB-024 (P2, high) — Jargon wall with no glossary (30+ undefined terms: entity leakage, evidence binding, Boundary Map, Subject Pack, Reasoning Diff, Proof Capsule, frozen verifier…); no non-expert scaffolding
- **Category/criterion:** Comprehension → Potential Impact  
- **Observed:** 30+ undefined terms; the flagship concept 'entity leakage' is never defined in plain language during the lesson that teaches it; 'the tutor' appears exactly once with no antecedent; history status 'REASONING DIFF ISSUED' is jargon. || No glossary or definitions anywhere; hints explain why steps exist, not what terms mean; home page targets notebook-owning practitioners  
- **Fix (smallest):** Add a one-sentence plain definition of entity leakage at step 1 and of 'verified' at first badge. || Glossary tooltips on split/ROC AUC/ablation/entity at first use  
- **Effort / leverage:** M / medium  
- **Sources:** A2-11, A5-12  
- **Unverified:** Target audience may be ML-adjacent learners for whom part of the register is fine. || none

### MB-025 (P2, High) — Home 'Test this claim' accepts arbitrary text, discards the claim, and routes into the dead live flow — contradicting 'unsupported evidence is refused, not guessed'
- **Category/criterion:** Input validation / routing → Technological Implementation  
- **Observed:** All text is accepted with zero validation and routed to the broken live flow; the user's words may be silently discarded; gibberish claims proceed through the sample lesson as if meaningful || Claim text vanishes; /new shows a notebook gate; continuing without upload leaves artifact 'Preparing artifact… / Pending intake / Support decision Pending' indefinitely — no timeout, no error, no refusal, n  
- **Fix (smallest):** On home submit without attachment, label the /new page 'Live testing needs a notebook — or continue with the sample' and carry the claim through reliably || Carry the claim into the /new textarea and show a 'Waiting for notebook evidence' notice instead of 'Preparing artifact…'. || Persist draft to   
- **Effort / leverage:** S-M / Medium-high (first impression)  
- **Sources:** A4-06, A10-09, A12-10, A16-08, A16-09  
- **Unverified:** Off-topic claim ('Why is the sky blue?') end-to-end (inferred identical to J08) || Behavior with an actual notebook file (file input untestable). || Whether attaching a notebook on the homepage change

### MB-026 (P2, high) — Repaired-notebook polish: patched cell keeps stale id 'random-row-split'; stored outputs match no UI-displayed run; verified diff has no red/green coding
- **Category/criterion:** Artifact quality → Design  
- **Observed:** The patched cell still carries the id 'random-row-split' although its source now performs a customer GroupShuffleSplit (misleading provenance label inside the artifact). Its stored outputs read 'Customer group-split accuracy: 0.625 / ROC AUC: 0.662 / overlap 0' — a result that matches neither the session's customer group split (59.4%/0.641) nor its identity ablation (67.4%/0.725); that fourth cond  
- **Fix (smallest):** Add a cell-level metadata flag counterlab.patched=true and surface the 0.625/0.662 run in the UI. || Color - lines #f87171-ish and + lines #34d399-ish (or tinted row backgrounds) based on the leading glyph.  
- **Effort / leverage:** XS / medium  
- **Sources:** A1-12, A6-06  
- **Unverified:** Whether the 0.625 run is reproducible via the published scripts (could not execute them). || Whether syntax highlighting was intended and failed, or never implemented.

### MB-027 (P2, high) — Session continuity gaps: no resume affordance on homepage; 'Start over' has no confirm and no in-app resume despite server-persisted sessions; URL-only persistence
- **Category/criterion:** State / continuity → Design  
- **Observed:** Homepage is byte-identical to the cold state; the completed session ('REASONING DIFF ISSUED') is reachable only by opening a (new) session and using Project & evidence > Recent sessions, or by bookmarking the /proof URL. || Clicking 'Start over' immediately navigates to / with no confirmation. The session still exists server-side (proof URL remains valid), but the app offers no link back to it; a   
- **Fix (smallest):** Add a 'Resume last session' link on the homepage when an active session exists. || Add a one-step confirm dialog to Start over. || Show 'your recent sessions' from local storage on the home page || sessionStorage for radio/textarea drafts keyed by session id.  
- **Effort / leverage:** S / medium  
- **Sources:** A2-14, A9-09, A5-13, A16-11  
- **Unverified:** Whether 'Start with evidence' rail label is intended to become a history link. || Whether the studio drawer reliably resurfaces this exact session for recovery in all cases. || Cross-device persistenc

### MB-028 (P2, high) — Transfer-failure feedback reveals the answer instead of locating the misconception; failed attempts hidden from the learner-facing record; no confidence calibration use
- **Category/criterion:** Pedagogy → Potential Impact  
- **Observed:** Single undifferentiated message that restates the rule so directly the retry is answer-copying; unlimited silent retries || Reasoning Diff shows 'Rule not yet tested -> passed'; failure exists only in the machine-readable event chain || Preset 72% anchors the estimate; after the falsification no screen references the sealed confidence; Reasoning Diff omits calibration || Confidence is captured at   
- **Fix (smallest):** Say which question failed without giving its answer || Append '(2 attempts)' to the transfer after-state || Add one calibration sentence on the result screen referencing the sealed value || Display 'You sealed 72% confidence; the computed result moved the metric 39.1 points — calibration note' line   
- **Effort / leverage:** S / medium  
- **Sources:** A5-10, A5-14, A5-04, A15-09  
- **Unverified:** none || Whether judge mode displays calibration || Any private analytics

### MB-029 (P2, high) — Learner never performs the repair: patch is system-generated; ending is a developer-dashboard proof page with a flat, no-onward-CTA finish
- **Category/criterion:** Pedagogy / completion → Design  
- **Observed:** Repair is fully pre-built; the learner's only act is pressing verify || One summary line ('You can now distinguish...'), the Reasoning Diff table, technical material and downloads; the only onward actions are file downloads. The second supported concept (class imbalance) is never offered as a next step.  
- **Fix (smallest):** Require selecting customer_id as the grouping entity from the schema list before 'Verify notebook patch' enables || Add two CTA buttons under the Reasoning Diff.  
- **Effort / leverage:** M / medium  
- **Sources:** A5-11, A2-17  
- **Unverified:** none || Whether a class-imbalance lesson exists elsewhere (none offered on this path).

### MB-030 (P2, high) — Split visual identity (dark chat homepage vs light editorial lesson/dossier feel like two products); unstaged instant reveal with no delta/direction encoding; no charts anywhere
- **Category/criterion:** Visual design → Design  
- **Observed:** Homepage is near-black, sans-only, chat-app chrome (sidebar + textarea, like ChatGPT/Claude); every other surface is cream paper with serif display type and dossier/editorial chrome. No shared element except the logo and the navy accent; the transition between them is a hard cut. || The screenshot taken immediately after the click already shows the fully settled theater (instant swap, no observed   
- **Fix (smallest):** Restyle the homepage hero headline in the editorial serif and add the cream/mint accents used elsewhere (or vice versa: give the wizard header a dark mode echo of the home sidebar). || Add a paired horizontal-bar graphic (98.5 vs 59.4) inside the theater, and a 400-800ms fade/scale-in on the theater  
- **Effort / leverage:** M / high  
- **Sources:** A6-14, A6-08, A6-17, A6-15  
- **Unverified:** Whether the split is a deliberate 'ask in chat, prove in print' concept; even so, no visual bridge exists. || Sub-300ms animations cannot be confirmed from static screenshots. || Whether neutrality wa

### MB-031 (P2, High (measured)) — Measured contrast failures beyond the Boundary payoff: dark sidebar labels 2.1–3.1:1, washed-out disabled CTAs, small-text cluster 3.6–4.5:1
- **Category/criterion:** Accessibility / visual → Design  
- **Observed:** 'START WITH EVIDENCE' measures 3.07:1 ((92,92,99) on (5,5,6)); 'No account needed' 2.14:1 ((69,69,74) on same); main subtext passes at 4.87:1 but is borderline. || 'Start with evidence' label rgb(78,78,84) on rgb(5,5,6) = 2.47:1; 'No account needed' rgb(67,67,73) = 2.07:1 ('Explore' label same style). Nav links themselves pass (8.2-8.6:1) || Homepage disabled CTA measures 2.52:1 (text (36,44,62) o  
- **Fix (smallest):** Lighten the two label classes to meet 4.5:1. || Token value change || Add a one-line reason under disabled CTAs on gated steps. || Adjust 2-3 color tokens || Bump small-text utility classes from 13px to 14px.  
- **Effort / leverage:** XS / Medium  
- **Sources:** A6-04, A8-08, A6-09, A8-10, A7-16  
- **Unverified:** Exact design-token values (measured from rendered pixels). || Tooltip-on-hover for disabled buttons (no hover tool). || Exact computed font sizes (no CSS access); any mobile type scale.

### MB-032 (P2, Medium-High (geometry measured; mobile reflow unverifiable)) — Mobile-readiness unproven and at-risk: ≥1220 px header+stepper, ~995 px 7-column verified-runs table, 1015 px Reasoning-Diff table, 191–233 px fixed chrome, sub-44 px target cluster, selects truncating values at 1920 px — no mobile affordance observed (viewport testing blocked by tooling; structural inference)
- **Category/criterion:** Responsive → Design  
- **Observed:** Header is a single fixed row requiring >=~1220px (logo ~235px, 6-step pill stepper 685px wide with ~40px-tall step buttons, right-side caps-text actions ~230px). No hamburger, overflow menu, or collapse affordance observed at desktop width on any route. Stepper step buttons are ~40px tall (<44px). || 7-column table ~995px wide with ~13-14px cell text, rendered inside a <details> inside the Theater  
- **Fix (smallest):** Make the stepper horizontally scrollable (overflow-x:auto) and hide the right-side caps actions behind one icon button below 768px. || Add 'overflow-x:auto; -webkit-overflow-scrolling:touch' on the table wrapper and min-width on the table. || CSS: table, tbody, tr, td { display:block; width:100% } b  
- **Effort / leverage:** S / Medium  
- **Sources:** A7-01, A7-02, A7-07, A7-06, A7-05, A7-04, A7-03, A7-08  
- **Unverified:** Existence of media queries / hamburger at <768px; meta viewport tag (raw HTML not fetchable). || Presence of overflow handling or a card layout for the table on small screens. || Small-screen renderin

### MB-033 (P2, Medium-High (element list; association unverifiable black-box)) — Accessibility barriers: no skip link on any route; homepage claim textarea nameless (placeholder-only); homepage upload keyboard-inaccessible; live-region announcements unverified; identical <title> on all routes
- **Category/criterion:** Accessibility → Design  
- **Observed:** First focusable elements are header/sidebar controls (logo 'C', New question, nav buttons); on wizard steps the learner tabs through logo, stepper buttons (Question..Boundary), Start over, Project & evidence, hint disclosure before reaching the step's content; no skip link observed on any route || Textarea exposes an empty accessible name; the only cue is placeholder text ('State a claim you want   
- **Fix (smallest):** One <a href='#main' class='skip-link'>Skip to content</a> + id on main || One aria-label on the textarea || Replace hidden-input pattern with the same native input used in the wizard || role='status' on the selection-echo + verdict containers; role='alert' on toast || Router-level title map || Two a  
- **Effort / leverage:** XS / Medium  
- **Sources:** A8-05, A8-06, A8-07, A8-14, A8-12, A8-04, A8-15  
- **Unverified:** True

### MB-034 (P2, Medium-High) — /new readiness checks render pre-passed instantly with no observable probe ('ready' vs health endpoint's 'configured'); transient 'could not reach the API' save failures (retry succeeds)
- **Category/criterion:** Reliability → Technological Implementation  
- **Observed:** On first load, both 'Notebook lesson tools are ready to try' and 'Hosted notebook runner is ready' are already displayed with no pending/spinner state and no observable verification; /api/health separately reports the live components only as 'configured' (not 'available'). || User-visible failure requiring manual retry; error text itself is generic and leaks nothing (positive)  
- **Fix (smallest):** Change copy to 'Live mode is configured for this deployment' instead of implying a completed device check. || One automatic retry before surfacing the error  
- **Effort / leverage:** Small-Medium. / Medium.  
- **Sources:** A9-05, A12-09  
- **Unverified:** Whether a background probe fires after first paint (no state change observed); whether the live path then actually works (upload untestable). || Underlying failure rate; whether live-mode calls fail m

### MB-035 (P2, High) — Learner text stored verbatim, unbounded (no length cap found), and embedded into HMAC-signed proof bundles — single-layer escaping defence; latent stored-XSS if any render path changes
- **Category/criterion:** Security surface → Technological Implementation  
- **Observed:** Text stored and signed verbatim; safety relies entirely on client-side escaping (which currently works on all observed surfaces); repaired notebook correctly excludes learner text || Both submissions accepted and stored; no maxlength or server rejection observed; character counter displays but does not limit  
- **Fix (smallest):** Add maxlength + server-side length validation on claim and revision fields || maxlength attribute + server-side length check  
- **Effort / leverage:** S / Medium — cheap hardening that directly strengthens the integrity story  
- **Sources:** A12-02, A12-06  
- **Unverified:** Live-mode GPT path may introduce additional rendering surfaces (LLM-generated echoes) not reachable with sample lesson; exact server-side max length if any || Behaviour at very large sizes (KB-MB): Wo

### MB-036 (P2, high) — Judge-visible sceptic bait: orphan './scripts/*' reproduce commands with no repo link; HMAC signature not judge-verifiable (no public verifier); 'Proof' overclaims vs independent attestation
- **Category/criterion:** Judge experience / proof credibility → Technological Implementation  
- **Observed:** Commands presented as bare code lines with no resolvable source; a judge cannot run or even read them || Only internal consistency (hash chain) is checkable; the signature's authenticity is unverifiable without server cooperation. Mitigation present: capsule limitations already concede 'Docker enforcement is evidence for this local run, not a formal sandbox proof' || The capsule's integrity rests   
- **Fix (smallest):** One line: 'Code and these scripts: see the Devpost submission repository (shared with testing@devpost.com)' || One limitation line: 'The HMAC signature attests server-side integrity; independent verification requires the repository verifier' || Add to /judge: the capsule schema, the HMAC key-custody  
- **Effort / leverage:** XS / medium-high for Technological Implementation; trivial cost  
- **Sources:** A3-05, A3-11, A15-04, A9-08  
- **Unverified:** whether the Devpost submission itself includes the repo link (likely, per rules) || whether a verify endpoint exists outside the sitemap || Key independence; verifier determinism; whether scripts repr

### MB-037 (P2, high) — Category framing gaps vs prior art: no framing against leakage linters (NBLyzer/sklearn-diagnose) and Socratic incumbents (Study Mode/Khanmigo); subject matter mirrors Kaggle's canonical leakage lesson; single legacy v1 replay
- **Category/criterion:** Novelty positioning → Quality of the Idea  
- **Observed:** The only category phrase is the CI metaphor (zero public search presence — ownable but unexplained, and it puns on 'CI for ML' tooling like CML, which technical judges may read first). Meanwhile Google's NotebookLM was renamed 'Gemini Notebook' on 2026-07-16 and gained code execution — the noun 'notebook' + learning + AI is increasingly crowded, diluting CounterLab's surface vocabulary. || No such  
- **Fix (smallest):** Add a one-line gloss under the tagline: 'CounterLab is evidence-first learning: your claim, your sealed prediction, a recomputed answer, a signed record.' || One sentence on /judge: 'Leakage linters (NBLyzer, LeakageDetector, sklearn-diagnose) tell you the answer; CounterLab makes you predict it, th  
- **Effort / leverage:** S / medium-high  
- **Sources:** A15-05, A15-06, A15-07, A15-10  
- **Unverified:** Devpost tagline/video wording (not publicly observable) || Devpost text contents || Whether the imbalance pack exists behind live mode || Actual Build Week Education-track field composition

### MB-038 (P2, High) — Always-positive funnel: no system-initiated refusal/inconclusive verdict ever observed on claims; nonsense/contradictory claims are framed and 'verified'; transfer gate brute-forceable by retry
- **Category/criterion:** Epistemic trust → Technological Implementation  
- **Observed:** The only gates are: confirm pre-written framing (one click), lock a prediction (no wrong answer — even 'I am unsure' proceeds), and a 2×2 multiple-choice transfer with instant feedback and unlimited retries. Every persistent user reaches 'VERIFIED patch + signed Proof Capsule'. The sole negative terminal state requires voluntarily choosing 'Not enough evidence'/'Reject' — which bricks the session   
- **Fix (smallest):** Cap transfer retries and add a reflective 'why was this wrong' step before retry. || Link 'View the full compiler trace (JSON)' from the replay proof panel.  
- **Effort / leverage:** S-M / Medium (converts a hidden asset into visible trust)  
- **Sources:** A10-14, A10-07  
- **Unverified:** Whether live mode has stricter gates. || —

### MB-039 (P2, high on the rule; medium on the risk (depends on team's reading)) — Missing Codex build provenance anywhere in product: no /feedback Session ID pointer, no README/repo link, no 'built with Codex' evidence reachable from the app or /judge
- **Category/criterion:** Submission evidence → Technological Implementation  
- **Observed:** In-product Codex claims exist ('Runtime Codex compiles the test plan') but zero build-time provenance || Unverified — cannot see form, README, or video  
- **Fix (smallest):** One footer line on /judge: 'Built with Codex — Session ID, video and repo: see the Devpost submission' || One README paragraph separating the two roles + Session ID in the form  
- **Effort / leverage:** S / high — protects the first-listed (tiebreak) criterion  
- **Sources:** A3-09, A14-04  
- **Unverified:** Devpost listing content itself (not public at audit time) || True

### MB-C12 (P2, high on the wording; medium on materiality) — Submission: /judge must be 1-click from landing and reproducible in main flow; one track only; LICENSE file expected; eligibility self-check
- **Category/criterion:** Submission compliance → All four  
- **Observed:** Could not test || Unverified  
- **Fix (smallest):** Add 'Judges: start here' link on the landing page || GitHub 'Add license' button || Confirm single-track selection before final submit || 15-minute eligibility standup + written confirmation  
- **Effort / leverage:** S / low  
- **Sources:** A14-13, A14-14, A14-15, A14-16  
- **Unverified:** True

# P3 — Minor polish / records (condensed)
### MB-040 (P3, high) — Cosmetic chrome: 'Next:' bar ~4–6 px card tuck; Theater tab row ~1040 px; code line clipped mid-token at 1920 px; native file input styling; truncated clause selects; transient H1 focus ring
- **Category/criterion:** Visual polish → Design  
- **Observed:** The cards are tucked ~30px underneath the Next bar (negative-margin stacking): the left card's title 'Uploaded notebook evidence' is half-clipped behind the bar; the right card's top corner/border is hidden. Repeats on steps 1-3. || ~1040px tab row; each tab carries a title + sub-label, so compressing to ~90px per tab at 375px would crowd badly unless sub-labels are dropped. || Line is cut mid-tok  
- **Fix (smallest):** Add margin-top equal to the overlap to the card row, or set the Next bar position static in flow. || Hide tab sub-labels under 640px; overflow-x:auto on the strip. || CSS text-overflow:ellipsis on excerpt lines. || Visually hide the native input and trigger it from a styled button with chosen-file n  
- **Effort / leverage:** XS / medium  
- **Sources:** A6-05, A7-09, A7-10, A6-10, A6-11, A6-18, A7-11, A2-18, A7-15  
- **Unverified:** Whether intentional 'stacked cards' aesthetic — the clipped title strongly suggests bug. || Mobile tab behaviour. || Whether full source is viewable elsewhere (likely via Studio drawer navigator - par

### MB-041 (P3, Medium-High) — Replay/Studio micro-copy: 'has now run' vs recorded banner; identical session names, 3-entry cap; provenance labels static post-completion
- **Category/criterion:** Copy polish → Design  
- **Observed:** Present-perfect 'has now run' sits under a banner stating nothing is running. || The Reject-bricked session is labelled 'BELIEF TEST PROPOSED' (its state before rejection) yet opens a dead 'Result withheld' page; every entry is named 'customer_churn_leakage.ipynb' with no timestamp/claim; list caps at 3 (an older completed session is unreachable from the drawer) || Labels read 'Boundary: Locked un  
- **Fix (smallest):** Change to past tense in replay mode. || Use current state for the label and append a short session id/time to each row || After verified repair, switch the two lines to past tense with ids.  
- **Effort / leverage:** XS / Small consistency win in the only populated drawer tab.  
- **Sources:** A2-16, A4-08, A1-13  
- **Unverified:** n/a || Cap size and eviction policy || Whether the labels ever change (e.g., in live mode).

### MB-042 (P3, High) — Information disclosure (low risk, partly intentional transparency): /api/health exposes component provisioning; model/tool versions (gpt-5.6-sol, codex-cli 0.144.4, kernel 0.1.0) and commit hashes in every bundle
- **Category/criterion:** Security hygiene → Technological Implementation  
- **Observed:** {"ok":true,"data":{"platform":"cloudflare-workers","sample":"available","replay":"available","liveGpt":"configured","liveCodex":"configured","liveKernel":"configured","sandbox":"configured","requestId":"a1d791636d7afd02"}} || modelId gpt-5.6-sol, codex-cli 0.144.4, repositoryCommitAtRun 4f2f6472..., templateCommit 1050fa76..., kernel 0.1.0, verifier leakage-verifier-v1, internal paths (replays/lea  
- **Fix (smallest):** Remove the *configured fields from the public payload || None required — document the choice  
- **Effort / leverage:** S / Low  
- **Sources:** A12-03, A12-04  
- **Unverified:** Whether the same endpoint gates any privileged action (none observed) || Whether disclosed commits map to a private repo (assumed private; hashes alone low value)

### MB-043 (P3, High) — Claimed 2026 future-dated timestamps in signed bundles — REJECTED on cross-validation: bundle timestamps (2026-07-18/14) verified accurate against host UTC; audit clock is 2026-07-19 (kept for transparency, severity: none)
- **Category/criterion:** Cross-validation record → Technological Implementation  
- **Observed:** REJECTED on double cross-validation (A1 host-UTC check + A16 host UTC 2026-07-19T07:08Z): bundle event timestamps 2026-07-18 are consistent with the audit clock; fixture recordedAt 2026-07-14 is earlier by design. No defect.  
- **Fix (smallest):** Add 'simulated demo clock' note in bundle limitations  
- **Effort / leverage:** S / Low-Medium — cheap fix that protects the core proof claim  
- **Sources:** A12-05  
- **Unverified:** Whether this is deliberate demo configuration or a misconfigured clock

### MB-044 (P3, Medium (geometry measured; stacking conventional but unverifiable)) — Judge-page micro: 4-col grid + 505 px hero card; 'How proof works' one-sentence anchor; unbreakable hashes/filenames; textarea keyboard-overlap risk (mobile-inferred)
- **Category/criterion:** Visual / responsive polish → Design  
- **Observed:** 4-col and 3-col grids plus a 505px fixed-looking hero card at desktop; no responsive behaviour verifiable. || Anchor scroll to one sentence already on screen || All fit at 1920; nothing observed that guarantees wrapping at 320-390px. || Could not test. Desktop shows textarea positioned mid-page between an 80px sticky header and 53px fixed bottom bar - the conditions for keyboard squeeze.  
- **Fix (smallest):** Same as above - single CSS change if grids are already utility-based. || Point the link at /judge#generated-vs-computed || CSS: code, .hash { overflow-wrap:anywhere }. || On focus of textarea, window.scrollTo field top + 100px.  
- **Effort / leverage:** S / Medium (judge-facing).  
- **Sources:** A7-12, A3-08, A7-13, A7-14  
- **Unverified:** Small-screen stacking. || none || Small-screen wrapping. || Entirely.

### MB-045 (P3, Low (unverified)) — A11y polish: weak control names ('C','NB','0 events Open'); scrollable diff/palette regions possibly not keyboard-scrollable; single-letter accelerators (2.1.4) unverified; disabled-gating not programmatically indicated
- **Category/criterion:** Accessibility polish → Design  
- **Observed:** Header logo button name is just 'C'; notebook card button in Studio drawer is 'NB'; evidence drawer trigger name mashes state and action ('0 events Open'); palette search input's label text is the search glyph plus 'Esc' hint, so its name may announce as 'Esc' rather than its purpose || Unified diff renders in a fixed-height region with its own scrollbar (palette list similar); whether the contain  
- **Fix (smallest):** 4 aria-labels || Add tabindex='0' role='region' aria-label='Notebook diff' to the scroll container || Confirm scoping; add note in palette footer || Add aria-required to the claim textarea and a one-line instruction near each disabled CTA  
- **Effort / leverage:** XS / Low  
- **Sources:** A8-13, A8-16, A8-17, A8-11  
- **Unverified:** True

### MB-046 (P3, Low (single observation)) — One-off unverified anomalies: single misroute of 'Use the sample lesson' into live flow (once, not reproduced); judge caption 4.18:1; diff cells 4.46:1
- **Category/criterion:** Anomalies → Design  
- **Observed:** Once (of three tries) the page entered 'Live generation / Preparing artifact…' with 0 characters (claim discarded); two other times it correctly created an Instant sample session with the claim || Measured: wizard stepper upcoming steps 3.71:1; textarea placeholder 3.59:1; palette command descriptions 3.59:1; palette unavailable commands ~1.4-3.1:1 (dimmed; partially exempt as inactive); 'VERIFIED  
- **Fix (smallest):** Disable all three CTAs while any navigation/intake is in flight || Adjust 2-3 color tokens || Add maxlength + counter limit to the two claim textareas  
- **Effort / leverage:** S / Low-medium  
- **Sources:** A4-09, A8-10, A4-10  
- **Unverified:** Reproduction rate and root cause || Behaviour at very large payloads (server limits)

### MB-047 (P3, high) — Scope-clause travel: hero claims lack attached scope clause off-/judge; no calibration/outcome metric shown for sealed predictions
- **Category/criterion:** Claim polish → Quality of the Idea  
- **Observed:** The honest limits exist on /judge ('scoped verification — not global mastery') but the learner-facing hero and claim surfaces present the numbers and the science metaphor without the clause; an epistemically literate judge can frame the hero as a rigged-seed synthetic demo if the scope is one click away || Confidence is captured at seal time (slider, default 72%) but no calibration score appears i  
- **Fix (smallest):** Add the clause as a sub-caption under the 98.5->59.4 comparison on /judge and under the home hero || Display 'You sealed 72% confidence; the computed result moved the metric 39.1 points — calibration note' line in the Reasoning Diff || Subhead: '…in twenty seconds on the card above — or run the ten-  
- **Effort / leverage:** XS / low-medium  
- **Sources:** A15-08, A15-09, A3-10  
- **Unverified:** Final copy state after any post-audit edits || Any private analytics || whether an expert fast-path can finish materially quicker

### MB-C13 (P3, high (both texts documented)) — Devpost upstream defects: /rules and /project-gallery serve 2025 content (use homepage/FAQ/dates as operative); judging-end ambiguity Aug 7 vs Aug 9 — keep app alive to Aug 13; free Codex credit window closed Jul 17
- **Category/criterion:** Submission compliance → All four  
- **Observed:** 2025 gpt-oss hackathon rules served; search index titles the page 'OpenAI Build Week (the "Hackathon") Official Rules' while body text is 2025 content || 2-day discrepancy in judging end (Aug 7 vs Aug 9 17:00 PDT) || Unverified  
- **Fix (smallest):** Bookmark FAQ; note the defect in team notes || Calendar hold: no teardown before Aug 13 || Settings → Usage check  
- **Effort / leverage:** S / low-medium  
- **Sources:** A14-17, A14-19, A14-20  
- **Unverified:** True

# Appendix — Verified strengths (recorded as positive findings)
- **VS-1** Sealed prediction is genuinely immutable and hash-committed before result release (A5-15, artifact-verified).
- **VS-2** Transfer task is a genuine surface change (entity→time); failure tone non-humiliating (A5-16).
- **VS-3** Kernel compute ≈12.8 s server-side (A9); the '/judge' hero line 'belief break in twenty seconds' is nonetheless marketing inflation vs the ~10-min learner loop (A3-10, A16 C8) — P3, see MB-047.
- **VS-4** Downloads are genuine: hash-chained event bundles (12–20 events; all 20 chain links re-validated by Agent 16; repaired-notebook SHA-256 recomputed = patchedArtifactHash) and valid patched .ipynb. NOTE: 'HMAC-signed' is declared in the bundle but NOT key-verifiable black-box (no public verification endpoint) — wording per red-team challenge.
- **VS-5** Fail-closed behaviour on unknown session/replay IDs (A16/A4, reproduced).
- **VS-6** Injection battery rendered as escaped literal text on every observed surface; no secrets/key material in responses; UUIDv4 session IDs (A12).