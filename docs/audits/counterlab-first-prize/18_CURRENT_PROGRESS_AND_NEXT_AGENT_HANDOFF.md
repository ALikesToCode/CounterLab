# Current progress and next-agent handoff

> Historical handoff checkpoint: the status and counts below were recorded at
> `2026-07-19T14:36:42Z` for committed source `24262ea6`. They are preserved as
> audit history and are superseded for current-tree decisions by the latest
> checkpoint in `docs/PROGRESS.md`. Nothing in this file is production-closure
> evidence for a later source, image, Worker, browser pass, or submission.

Checkpoint: `2026-07-19T14:36:42Z`  
Branch: `feat/learner-ux-v6.1`  
Committed source: `24262ea6f40e988d7be054bdba6f531531b1679f`  
Official deadline used by both audits: `2026-07-22T00:00:00Z`  
Time remaining at this checkpoint: **57 hours 23 minutes**

## One-line goal

> Freeze, qualify, deploy, and submit one exact CounterLab release where a judge sees the verified belief break within 10 seconds, completes an honest source-bound learner loop, can inspect GPT-5.6/Codex/kernel/verifier provenance, and the submission carries real learner evidence without overstating authority.

## Bottom line

Substantial engineering has landed, but CounterLab is not release-closed or submission-closed. Of the original 12 internal P0/P1 findings, **4 are implemented in current source, 5 are partial, and 3 remain open**. That is 33% source-complete and 75% at least started, but **0 of 12 can be called production-closed** until one exact current source/image tuple is qualified, deployed, browser-tested, and tied to the final submission.

The separate black-box audit is valuable public-production evidence, but it did not expose a build identity and therefore must not be treated as a test of this branch. Its strict public score was 73/100. Its 18 product P0/P1 issues reconcile to the current source as approximately:

- 2 source-addressed but not production-verified: MB-008 and likely MB-011;
- 5 partially addressed: MB-002, MB-003, MB-010, MB-014, and MB-016;
- 11 still open or unreconciled in source: MB-001, MB-004, MB-005, MB-006, MB-007, MB-009, MB-012, MB-013, MB-015, MB-017, and MB-048.

All 11 black-box submission P0/P1 requirements (MB-C01 through MB-C11) remain externally unverified. Local copy, scripts, and checklists are preparation, not submission evidence.

## Evidence boundary

- The user-supplied `/home/mysterious/github/CounterLab/counterlab-black-box-audit/` path is outside the repository safety boundary and was not accessed.
- The in-repository `counterlab-black-box-audit/` copy was reviewed. It contains the 2026-07-19 public black-box audit, 61 issues, and 386 screenshots.
- No new public browser claim was made in this reconciliation. `CLOAK_CDP_ENDPOINT` is currently missing, so the required CloakBrowser-backed pass could not run.
- The worktree is dirty with active release-containment, scientific-evidence, runner, and `VerifiedBeliefBreakTheater` work. Those changes belong to the current workers and must not be overwritten, reformatted, or swept into an unrelated commit.

## Original internal P0/P1 status

| Status                                          | IDs                                    | Current evidence                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implemented in source; production proof pending | CL-003, CL-004, CL-005, CL-010         | Claim-only routing now offers an honest fixed sample or notebook upload; replay is read-only; the sample has a fixed-evidence Boundary and learner reflection; current vocabulary and metadata are substantially aligned.                                                                                      |
| Partial                                         | CL-002, CL-007, CL-008, CL-009, CL-023 | Release containment, admission controls, isolation, category scoping, and visual work improved, but no exact current deployment exists; filesystem read isolation remains `PARTIAL`; only two adjacent ML packs ship; the Belief Break component is unreachable and no verified Lab Scene reaches the browser. |
| Open                                            | CL-001, CL-006, CL-024                 | Final Devpost state is unverified; learner pilot remains `NO_DATA` with 0 participants; GPT-5.6 remains a one-shot structured analyst rather than a bounded continuing learning agent.                                                                                                                         |

## What is genuinely done

### Learner/product source

- `ClaimPathChooser` preserves the learner question and explicitly distinguishes the fixed leakage practice path from artifact-specific notebook evidence.
- `RouteRecovery` provides explicit unknown-route, missing-session, missing-proof, proof-not-ready, and missing-replay states.
- Sample Boundary exploration and learner-authored reflection exist and have focused tests.
- Replay paths are labelled and the legacy replay is no longer allowed to masquerade as a newly computed run.
- Capability-link disclosure, revocation affordances, recent work, a start-over dialog, keyboard focus work, and a hosted quality workflow now exist.
- The sample analyst is server-labelled as `approved-sample`; the current sample UI no longer needs to pretend its fixed framing is a live GPT call.

### Visual work

- `VerifiedBeliefBreakTheater` now verifies checked-in sample bytes, result lineage, the Boundary fixture, and controlled runs before showing values.
- It has preview/full presentations, fixed-sample labelling, a non-colour mechanism, accessible exact-value table, reduced-motion-safe behavior, and fail-closed states.
- It is **not imported by `App.tsx`, Judge Mode, or any other production consumer**. It therefore earns component/test credit only, not product or judging credit.

### Release and evidence work

- Multiple source-bound runner builds, OCI archive fixes, scanner identity checks, qualification preflight, runtime IPC/FIFO/shim/runc/telemetry containment, scientific evidence generation, and pilot-evidence hardening have landed or are active.
- The active rootless runtime work has not yet completed a real exact-image sentinel and full qualification. No current image has been promoted or deployed.
- The pilot toolchain now fails closed on malformed assignment, consent, linkage, release binding, path, and aggregate evidence, but the result remains `NO_DATA`.

### Verification run for this reconciliation

The following current-worktree checks passed:

```text
8 focused learner/Judge/component files: 41 tests passed
App + CounterLabStudio:                 47 tests passed
session-core:                           27 tests passed
Total:                                  11 files, 115 tests passed
```

These green tests do not close the issues below. The current “Not enough evidence” UI test, for example, stops after returning to the claim screen and never submits again; the server transition table still makes the session terminal.

## Source-confirmed blockers from the black-box audit

### MB-001 — refusal recovery is still broken

- `packages/contracts/src/index.ts` gives `INSUFFICIENT_EVIDENCE` and `REJECTED_BY_LEARNER` no outgoing transitions.
- `stopBeliefTest` in `App.tsx` sends the terminal response and then returns the same session to the claim screen.
- A second proposal therefore targets a terminal session and can surface the raw transition error observed publicly.

Required acceptance: both offered refusal actions preserve the claim and lead to an explicit revise-with-new-session or restart choice; resubmission works; no raw state-machine name reaches the UI.

### MB-002 — live entry is better explained but still not gated by upload

- `LiveSetup` can show “Continue with my notebook” before a notebook exists.
- That action enters the claim screen with `artifact === null`, which renders “Preparing artifact…” and disables the main action.
- An upload control is present, so the current source is more recoverable than the audited build, but the CTA remains misleading and the no-upload limbo is still reachable.

Required acceptance: live analysis cannot advance beyond intake until a supported artifact was successfully created; no “Preparing artifact…” state persists without an active upload request; Judge copy reflects the exact deployed capability.

### MB-005 — the proof drawer still ignores stored session events

- `CounterLabApi.getEvents(sessionId)` exists.
- `ProofConsole` renders `context.events`.
- `App.tsx` passes only `runner.events`; it does not hydrate the drawer from the session event endpoint for restored, sample, proof, replay, or completed sessions.

Required acceptance: a completed sample/live session shows the canonical event chain and populated relevant tabs; reconnect and restored sessions preserve ordered, deduplicated events; replay remains read-only and labelled.

### MB-006 — transfer question and visual semantics still conflict

- The UI asks “Which feature crosses NOW?” and correctly marks later-outcome information with `×` while safe available information gets `✓`.
- The fixed transfer evaluator passes only when the learner selects the future-leaking feature, because the scored task is actually “identify the risk.”
- The symbols describe the feature property while the pass/fail key scores risk identification, which caused the black-box inversion finding.

Required acceptance: rewrite the prompt and feedback around one explicit task—identify the leaking feature—or change the answer key. The selected correct answer, visible symbol, spoken label, and evaluator result must agree in both success and failure tests.

### MB-007 — pre-seal evidence still contains verdict language

- The approved sample evidence relevance says: “This is the deceptive random-split headline under test.”
- That relevance can be opened before the Prediction is sealed.

Required acceptance: pre-seal copy describes observations and competing predictions without calling either explanation deceptive, correct, or the fix. A text/screenshot regression must prove that no verdict or result is exposed before the immutable Prediction.

### MB-012, MB-013, and MB-048 — learner agency and claim sanity remain weak

- Completion still says “You applied the rule correctly” and “You can now distinguish” after one small transfer interaction.
- The system authors both competing explanations and their predicted outcomes; learner confirmation is still close to acceptance rather than construction.
- The approved sample hashes any supplied learner claim into the Belief Test and can carry an unrelated or nonsense “Before” claim into a verified Capsule even though the fixed lesson answers only the leakage question.

Required acceptance: require a minimal learner-authored interpretation or rule; downgrade completion to “completed this verified loop”; reject, reframe, or explicitly mark an unrelated sample claim as not evaluated; no nonsense claim can appear as a verified scoped conclusion.

### MB-015 — Judge Mode still has no one-click Capsule proof

Judge Mode explains Proof Capsules but offers only Start sample and Watch replay. It has no direct inspect/download action for a checked-in, integrity-verified sample Capsule.

Required acceptance: one click from the first Judge page opens or downloads an honestly labelled sample Capsule and explains what can be independently recomputed.

### MB-017 — command accessibility remains partial

The command palette has focus containment, but shortcut `<kbd>` text remains in button accessible names. This preserves black-box names such as “N Analyze notebook.” Recheck every download/export/patch control for a stable accessible name.

Required acceptance: shortcut glyphs are hidden from the accessibility tree or included in a deliberate accessible description; all controls have concise names; keyboard-only and screen-reader smoke tests pass.

### CL-023 — the highest-leverage visual is unreachable

The product still explains the scientific transformation before a judge experiences it. The new theater is isolated; Judge Mode still uses a static two-number comparison and the learner landing remains primarily a prompt shell.

Required acceptance:

- at 1440×900 and 390×844, the first fold shows claim → changed condition → fixed result → learner benefit without scrolling;
- within 10 seconds a novice can say what CounterLab does and why it differs from a chatbot;
- within 20–30 seconds the judge sees the sealed-prediction mechanism, the fixed-vs-generated boundary, and the Boundary consequence;
- all values bind to verified data, sample/live/replay labels persist, unknown bindings fail closed, and an accessible table provides the same facts;
- visual integration must not expose result values before the learner seals a Prediction in the interactive flow.

### CL-024 — GPT-5.6 is not yet agentic in the learner loop

GPT-5.6 currently receives one approved packet and returns one structured Belief Spec. It does not clarify, choose a pedagogical view, continue after evidence, or direct later learning stages.

If this is attempted before submission, give GPT-5.6 more control only over **pedagogy, inquiry, and presentation proposals**, never evidence authority:

- at most one clarification and four read-only/proposal tool calls per relevant stage;
- validated `LearningDirectorPlan` and scene intent only;
- no ability to select the authoritative experiment, compute values, verify, grade transfer, unlock repair, patch, or issue proof;
- invalid tools/arguments, prompt injection, timeouts, and refusal fail closed or degrade to clearly labelled fixed UI;
- two Subject Pack fixtures must produce meaningfully different bounded actions.

Do this only after exact release, core P0 paths, proof visibility, and visual integration are green. If time is insufficient, keep the one-shot analyst and describe it honestly; do not inflate the claim.

## Paste-ready TODO for the next Codex agent

Copy everything inside the following block.

```text
You are the CounterLab Finish Commander. Work in /home/mysterious/storage/github/CounterLab and obey AGENTS.md exactly.

ONE-LINE GOAL
Freeze, qualify, deploy, and submit one exact CounterLab release where a judge sees the verified belief break within 10 seconds, completes an honest source-bound learner loop, can inspect GPT-5.6/Codex/kernel/verifier provenance, and the submission carries real learner evidence without overstating authority.

CURRENT TRUTH
- Branch checkpoint: feat/learner-ux-v6.1 at committed HEAD 24262ea6f40e988d7be054bdba6f531531b1679f, plus a dirty worktree.
- Deadline: 2026-07-22T00:00:00Z. Recalculate remaining time immediately.
- Read docs/audits/counterlab-first-prize/18_CURRENT_PROGRESS_AND_NEXT_AGENT_HANDOFF.md first.
- Also read AGENTS.md, docs/PROGRESS.md, the internal issue register, counterlab-black-box-audit/01_EXECUTIVE_VERDICT.md, /06_ISSUE_REGISTER.json, /14_PRIORISED_FIX_ROADMAP.md, and /18_IMPLEMENTATION_SWARM_PROMPT.md.
- Do not assume the black-box public build equals current source; it exposed no exact build identity.
- Do not overwrite or stage unrelated dirty release/runtime/scientific-evidence/VerifiedBeliefBreakTheater changes. Inspect git status before every work slice and coordinate file ownership.
- Current reconciliation: internal P0/P1 = 4 source-done, 5 partial, 3 open; none production-closed. Black-box product P0/P1 = 2 source-addressed but unverified, 5 partial, 11 open. Submission P0/P1 = externally unverified.

NON-NEGOTIABLE AUTHORITY RULES
- GPT-5.6 and Codex may propose. Fixed scorers/kernels and frozen verifiers decide.
- No result before immutable Prediction; no repair before deterministic transfer passes.
- Sample, replay, and live authority never mix or silently fall back.
- Never fabricate a model call, Codex payload, event, learner result, signature, deployment, or submission state.
- Never execute uploaded notebook cells or model-authored unrestricted code.
- Preserve the original artifact; patch only a copy.
- No broad refactor, dependency upgrade, new Subject Pack, account system, gamification, dashboard, voice tutor, or optional physics work while any gate below is red.

WORK ORDER — DO NOT REORDER OPTIONAL WORK ABOVE CORE FAILURES

0. BASELINE AND OWNERSHIP
[ ] Read the required files and inspect git status/diff without mutating user work.
[ ] Identify which worker owns the active contained-runtime and VerifiedBeliefBreakTheater files. Do not edit an owned file concurrently.
[ ] Run the smallest current baseline tests for each file you will touch; add a characterization test before behavior changes.
[ ] Create a short live issue matrix: issue ID, source mechanism, planned file owner, acceptance test, production proof status.

1. CORE JOURNEY INTEGRITY
[ ] MB-001: make Reject and Not enough evidence recoverable. Preserve claim, create or explicitly offer a new session, and never resubmit against a terminal session. Scrub raw state names. Test both actions through successful resubmission and browser back/refresh.
[ ] MB-002: gate live continuation on a successfully uploaded, SUPPORTED artifact. Remove the no-upload Preparing artifact limbo. Test upload absent, malformed, unsupported, supported, interrupted, and retry states. Scope Judge live status to exact release readiness.
[ ] MB-006: align transfer prompt, feature symbols, screen-reader text, answer key, and evaluator. Test safe/leaky choices for pass and fail; Repair must remain locked on failure.
[ ] MB-007: remove verdict/fix language from all pre-seal surfaces. Add a regression that searches rendered pre-seal text and proves result values and verdict language appear only after Prediction.
[ ] MB-048/012/013: prevent unrelated or nonsense sample claims from becoming verified conclusions; require a small learner-authored interpretation; replace mastery language with bounded completion language.

2. MAKE THE TRUST ARCHITECTURE VISIBLE
[ ] MB-005: hydrate Evidence & proof from /api/sessions/:id/events, not only runner.events. Merge live streamed and stored events deterministically, deduplicate by canonical identity/cursor, preserve ordering, and populate relevant tabs on active, restored, completed, proof, and replay surfaces.
[ ] MB-004/003/016: show genuine GPT-5.6 and Codex provenance only in modes where those calls occurred. Label approved sample framing as fixed sample content. Surface real bounded operation IDs, plan summary, repair feedback, and verifier events; if unavailable, say unavailable. Never manufacture payloads.
[ ] MB-009: either unify hashes that claim the same domain or label each domain precisely: kernel result, verifier report, event chain, Boundary result, Capsule root, and release commit.
[ ] MB-010: complete capability-link expiry/retention/revocation behavior and copy. Test invalid, revoked, expired, private, and public replay links.
[ ] MB-015: add a one-click, checked-in, integrity-verified sample Proof Capsule inspect/download action to Judge Mode.

3. DELIVER THE 10-SECOND VISUAL BELIEF BREAK
[ ] Integrate VerifiedBeliefBreakTheater into the landing and Judge first fold and reuse its verified mechanism in the sample journey without violating pre-Prediction result locks.
[ ] At 1440x900 and 390x844, show: learner claim; familiar-row vs unseen-entity evaluation; one changed variable; controls held fixed; the post-seal 98.5% to 59.4% break; Boundary consequence; learner benefit.
[ ] Keep the first fold learner-facing. Put implementation detail in progressive disclosure.
[ ] Preserve persistent Sample/Replay/Live labels, fixed-data bindings, non-colour meaning, accessible exact-value table, reduced motion, stable layout, touch targets, and fail-closed unknown/stale bindings.
[ ] Add component tests plus CloakBrowser Playwright tests for 10/20/30-second comprehension proxies, first-fold visibility, no pre-seal leak, mobile/desktop screenshots, keyboard access, console errors, failed requests, and performance budgets.
[ ] Do not connect arbitrary generated React/HTML/CSS. If Lab Scene is used, render only through a closed trusted component registry with verified binding manifests.

4. RELEASE ONE EXACT BUILD
[ ] Finish the active contained-runtime work and prove a real exact-image sentinel. Do not infer success from unit tests.
[ ] Freeze one clean source commit, rebuild the runner once, regenerate source/image-bound SBOM, VEX, scientific-engine, license, health, held-out, and qualification evidence, and run all negative controls.
[ ] Run focused checks first, then complete TypeScript, Vitest, Pytest, mutation, held-out, build, secret, formatting, and release gates. Do not weaken a test to pass.
[ ] Deploy only the qualified tuple. Verify the public build exposes the exact source/image/release identity and that health readiness reflects real capability.
[ ] Through CloakBrowser, run clean desktop/mobile sample, replay, supported live, unsupported, malformed, refusal, transfer fail/pass, patch, Capsule, refresh/reconnect, back/forward, deep-link, restored session, console/network, accessibility, and Web Vitals journeys.
[ ] Re-run every black-box P0/P1 against the public deployment and record evidence paths. No issue is closed by source alone.

5. SUBMISSION AND IMPACT — PARALLEL, BUT NEVER FAKE COMPLETION
[ ] Populate the Devpost draft now: Education category, title/tagline, current honest description, live Judge URL, exact repo/license/setup/sample instructions, GPT-5.6 evidence, Codex build narrative, and /feedback Session ID. External submission/publishing requires the owner's authorization and a captured receipt.
[ ] Add the public repo link or remove non-actionable local reproduction commands.
[ ] Run the existing source-bound learner pilot with real consented participants. Publish participant count, completion, first-unassisted transfer, time/confusion/abandonment, closed qualitative reactions, and limitations. If no data, keep NO_DATA.
[ ] Record the <=3:00 public voiceover video only from the frozen deployed tuple. Show the visual belief break, sealed Prediction, proof drawer, transfer gate, repair, Capsule, and truthful GPT-5.6/Codex roles.
[ ] Verify every link and claim logged out/incognito; submit before a safety buffer, capture submitted_at/public slug, and monitor uptime through judging.

6. GPT-5.6 AGENTIC CONTROL — ONLY AFTER 1-5 ARE GREEN ENOUGH TO SHIP
[ ] Decide from remaining time whether CL-024 can land safely. If not, retain the one-shot analyst and narrow claims.
[ ] If proceeding, implement a bounded Learning Director with at most one clarification and four read-only/proposal tool calls, a validated plan/scene intent, budget/admission control, and provider-neutral failure copy.
[ ] GPT may choose questions, hints, visual emphasis, and proposed next evidence views. It may not select authoritative experiments, compute values, verify, grade transfer, unlock Repair, patch artifacts, or issue Capsules.
[ ] Test two-pack divergence, invalid/unknown/state-changing tools, argument limits, prompt injection, refusal, timeout, replay/no-call behavior, private-reasoning exclusion, and invariant state transitions under presentation mutation.

FINAL GO/NO-GO GATES
[ ] Exact deployed tuple qualified and public identity matches receipts.
[ ] Full public sample and one supported live flow pass from a clean browser.
[ ] All product P0s and highest-leverage P1s pass acceptance tests and public re-audit.
[ ] Visual belief break is understood and visible in the first 10-30 seconds on desktop and mobile.
[ ] Proof events and one-click Capsule are inspectable.
[ ] No authority, sample/live/replay, result timing, or claim-scope ambiguity remains.
[ ] Learner evidence is real or honestly NO_DATA.
[ ] Devpost, README, video, screenshots, app, repo, /feedback ID, and exact release all agree.

FINAL REPORT FORMAT
- Exact source commit, image digest, Worker version/deployment ID
- Files changed by logical slice
- Tests run with exact counts and failures
- Public routes/journeys verified with evidence paths
- Issues closed, partial, still open, and why
- Devpost/video/repo/feedback/submission receipt status
- Learner-study status and limitations
- Remaining P0/P1 and explicit no-go risks
- No claim of deployment, model/Codex call, learner outcome, or submission unless directly evidenced
```

## Highest-leverage first action

Keep the current runtime/release worker on exact-image qualification. Give the next non-overlapping product worker **MB-001 + MB-002 + MB-006**, then **MB-005**, while the visual owner integrates the already-built theater into Judge/landing without revealing results before Prediction. In parallel, a submission owner should fill every Devpost field except final public receipts; no optional agentic or cross-domain work should delay those gates.

## Do not mistake these for completion

- a passing component test for an unreachable component;
- a green health capability string without a completed live journey;
- a source fix without deployment and CloakBrowser reproduction;
- a sample plan marker without a real Codex payload;
- local Devpost copy without a submitted public entry;
- a hardened pilot harness with zero participants;
- a build receipt for a source checkpoint superseded by later changes;
- a static Judge explanation in place of a visible learner experience.
