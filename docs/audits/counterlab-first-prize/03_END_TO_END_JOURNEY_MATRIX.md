# End-to-end journey matrix

Environment: public Worker #82; Chromium 150.0.7871.128 / Playwright 1.61.1; clean repository-contained profile; 390×844, 1366×768, and 1440×900 for route journeys, with the broader responsive matrix reported separately. Audit traffic was constrained to GET/HEAD/OPTIONS. `N/E` means not executed against production because the action would create or change state.

## Summary

| ID  | Journey                       | Public status                      | Evidence basis                                         | Failure severity                      |
| --- | ----------------------------- | ---------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| J01 | First-time landing            | Pass with first-use caveat         | Observed live                                          | P1 caveat: claim-only path mismatch   |
| J02 | Fast deterministic sample     | N/E                                | Source, 49 focused tests, older release evidence       | P1 qualification gap                  |
| J03 | Judge Mode fast path          | Pass for dossier comprehension     | Observed live                                          | None for route; submission remains P0 |
| J04 | Verified replay               | Fail its current read-only promise | Observed live + source                                 | P1                                    |
| J05 | Supported live artifact       | N/E                                | Health/configuration + source + older release evidence | P1 qualification gap                  |
| J06 | Unsupported artifact          | N/E                                | Source/tests                                           | Unverified public                     |
| J07 | Malformed safe artifact       | N/E                                | Source/tests                                           | Unverified public                     |
| J08 | Model/runner unavailable      | N/E                                | Source/tests                                           | Unverified public                     |
| J09 | Timeout/interruption          | N/E                                | Source/tests                                           | P1 qualification gap                  |
| J10 | Transfer failure              | N/E                                | Source/tests                                           | Unverified public                     |
| J11 | Transfer success              | N/E                                | Source/tests                                           | P1 qualification gap                  |
| J12 | Patch approval/rejection      | N/E                                | Source/tests                                           | P1 qualification gap                  |
| J13 | Refresh active journey        | N/E                                | Source/tests                                           | P1 qualification gap                  |
| J14 | Back/forward                  | Partial                            | Router tests; public shell only                        | P2 evidence gap                       |
| J15 | Direct deep-link              | Partial                            | Observed missing IDs/replay                            | P2 recovery quality                   |
| J16 | Reopen previous session       | N/E                                | Source                                                 | P2 discoverability gap                |
| J17 | Start second project          | N/E                                | Source                                                 | P2 orphan-job risk                    |
| J18 | Export/inspect evidence       | Partial                            | Replay UI/API/source; no download                      | P1 qualification gap                  |
| J19 | Judge → learner               | Pass                               | Observed/source link                                   | None                                  |
| J20 | Core flow without terminology | N/E with copy review               | Browser copy + source/tests                            | P1 evidence gap                       |

## Journey records

### J01 — First-time landing

- **Start URL / browser state / viewport:** `/`; clean profile; 1440×900 and 390×844.
- **Exact actions:** Open; inspect first fold; tab through visible controls; open mobile `Explore`; enter a long synthetic claim; submit without a notebook.
- **Expected:** Recognizable learner goal, clear first action, honest support/mode boundary, usable claim-only or explicitly notebook-required handoff.
- **Actual:** Landing rendered quickly with a clear question, sample/replay on desktop, prompt starters, proof and support copy. Mobile hid alternate modes behind `Explore`. Claim-only submit navigated to `/new`, headed `Test my notebook`, even though the landing said “If you have a notebook, attach it.”
- **Elapsed:** Cold LCP samples 1.036–1.588 s unthrottled; 1.856 s under the tested 150 ms/1.6 Mbit/s profile.
- **Console / failed requests:** 0 / 0 for normal landing.
- **Screenshots:** `evidence/screenshots/ux/landing-*`; `evidence/screenshots/ux/plain-question-cta-result.png`.
- **Confusion / status / severity:** Input flexibility is overstated; completion **failed expectation**, P1.

### J02 — Fast deterministic sample

- **Start / state / viewport:** `/`; clean required; desktop/mobile.
- **Actions:** Start sample; frame Question; confirm models; seal Prediction; reveal Test; explore Boundary; fail and pass Apply; unlock Repair; inspect/download proof.
- **Expected:** Complete, persistently labelled sample without credentials; no result before Prediction; deterministic transfer gate and repair copy.
- **Actual / elapsed:** N/E against Worker #82. Source and focused tests cover the path; historical production evidence belongs to Worker `7c67c0f4…`, not #82.
- **Console/network/screenshots:** None for a current public sample session.
- **Confusion / status / severity:** Current release equivalence is unknown; **unverified**, P1 qualification gap rather than a confirmed functional failure.

### J03 — Judge Mode fast path

- **Start / state / viewport:** `/judge`; clean; 390×844, 1366×768, 1440×900.
- **Actions:** Inspect first fold at 20 s; scroll authority and mode sections; inspect method, limitations, and reproduction; follow learner-view link.
- **Expected:** Understand product, contrast, authorities, modes, bounded claim, and next action at increasing time depths.
- **Actual:** Hero and 98.5% versus 59.4% proof communicate the thesis within 20 s. Authority roles are explicit below the hero; three modes and scope are explicit; the full page is coherent and unusually strong. Live card reported configured, not completed.
- **Elapsed:** Cold LCP 1.064 s unthrottled; 1.804 s throttled. CLS 0.0028.
- **Console / failed requests:** 0 / 0.
- **Screenshots:** `evidence/screenshots/ux/judge-*`.
- **Confusion / status / severity:** A judge can understand the system, but cannot infer current live completion or learner impact. Route **passed**; those are separate P1 evidence gaps.

### J04 — Verified replay

- **Start / state / viewport:** `/replay/leakage-01`; clean; 375×812, 768×1024, 1440×900.
- **Actions:** Load; continue; reveal recorded result; enter a new local reasoning revision and transfer choices; progress toward patch/completion; inspect storage/network.
- **Expected:** Judge copy promises read-only stored events, no new model call, and no new experiment; displayed transfer/patch should be the recorded run only.
- **Actual:** Replay banner and metadata persisted. Without any request after initial GET, locally authored choices advanced to `Passed` and `patched`, set `counterlab.replayTransferState=patched`, and rendered learner-specific Reasoning Diff/download controls. No server verifier authorized those new choices.
- **Elapsed:** Cold LCP 1.144 s; CLS 0.0442.
- **Console / failed requests:** 0 / 0 for valid replay.
- **Screenshots:** `evidence/screenshots/live-chrome-replay-*`; `evidence/screenshots/ux/legacy-replay-*`.
- **Confusion / status / severity:** Stored playback and non-authoritative reenactment are conflated; **failed**, P1 integrity/design.

### J05 — Supported live artifact

- **Start / state / viewport:** `/new`; clean; repository leakage and imbalance notebooks.
- **Actions:** Capability check; upload each untouched notebook; approve packet; confirm models; Prediction; Codex compile/repair; fixed run; Boundary; transfer; patch; Capsule.
- **Expected:** Both supported packs complete artifact-specifically on the exact public build, with no mode fallback.
- **Actual:** `/new`, `/ready`, and `/api/health` were green/configured. No production session was created. Older smoke evidence cannot qualify Worker #82, and deployment metadata exposes no source commit.
- **Elapsed:** Readiness median about 0.408 s; full journey N/E.
- **Console/network/screenshots:** `evidence/network/public-api-baseline.md`; `evidence/screenshots/live-chrome-new-1440x900.png`.
- **Confusion / status / severity:** “Ready/configured” can be mistaken for journey proof; **unverified**, P1.

### J06 — Unsupported artifact

- **Start / state / viewport:** Live intake; clean; synthetic notebook with safe unsupported magic/network/package indicators.
- **Actions:** Upload without executing; inspect support decision and recovery guidance.
- **Expected:** Typed unsupported decision, exact reason codes, no model/runner/advance, constructive next step.
- **Actual:** N/E publicly. Parser/API source and tests reject unsupported patterns before execution.
- **Elapsed / console / requests / screenshots:** N/E / none.
- **Confusion / status / severity:** Public product quality unknown; **verified by test only**, not classified as a current defect.

### J07 — Malformed but safe artifact

- **Start / state / viewport:** Live intake; invalid JSON, wrong nbformat, active-content and oversized synthetic fixtures.
- **Actions:** Upload each safe fixture; inspect typed validation and state preservation.
- **Expected:** 4xx typed errors; no execution/storage beyond bounded intake; learner-readable recovery.
- **Actual:** N/E publicly. Extension, type, size, parse, version, and active-content validation exist and are tested.
- **Elapsed / console / screenshots:** N/E.
- **Confusion / status / severity:** **Verified by source/test; live unverified**.

### J08 — Model or runner unavailable

- **Start / state / viewport:** `/new` and Judge Mode with missing capability.
- **Actions:** Observe capability failure; retry; use honest sample/replay fallback.
- **Expected:** No fake live success; actionable typed state and stable layout.
- **Actual:** Only ready state observed. Missing-key/runner branches and tests exist.
- **Elapsed / console / screenshots:** N/E for degraded state.
- **Confusion / status / severity:** **Unverified public failure UX**; no current failure observed.

### J09 — Timeout or interrupted connection

- **Start / state / viewport:** Active live compile.
- **Actions:** Interrupt SSE/network; reconnect after cursor; cancel twice; refresh; inspect result authority.
- **Expected:** Ordered cursor resume, idempotent cancel, no result after cancellation, explicit timeout/retry.
- **Actual:** N/E. Source and credentialed E2E definition cover it; current public build has no executed record.
- **Elapsed / console / screenshots:** N/E.
- **Confusion / status / severity:** Central production-readiness claim remains **unverified**, P1.

### J10 — Transfer failure

- **Start / state / viewport:** Apply stage after verified Boundary.
- **Actions:** Submit wrong fixed choices and inspect feedback/patch lock.
- **Expected:** Respectful targeted feedback, no mastery judgment, repair remains locked.
- **Actual:** Source/tests implement deterministic failure and locked patch; N/E publicly.
- **Elapsed / console / screenshots:** N/E.
- **Confusion / status / severity:** **Verified by test only**.

### J11 — Transfer success

- **Start / state / viewport:** Apply stage.
- **Actions:** Submit correct surface-different leakage and imbalance choices.
- **Expected:** Fixed-code pass, evidence shown, repair becomes eligible.
- **Actual:** Source/tests and older smoke show behavior; N/E on Worker #82.
- **Elapsed / console / screenshots:** N/E.
- **Confusion / status / severity:** Core differentiator **unqualified on current release**, P1.

### J12 — Patch approval or rejection

- **Start / state / viewport:** Before and after transfer pass.
- **Actions:** Try patch while locked; request after pass; test rejection/repair; download copy; compare original hashes.
- **Expected:** Typed locked state before pass; source-free Plan; copy only; scope/recompute/reproducibility checks; no result on rejection.
- **Actual:** Strong source/Python/TypeScript tests and prior artifacts exist; no current public job/download was executed.
- **Elapsed / console / screenshots:** N/E.
- **Confusion / status / severity:** **Unqualified on current release**, P1.

### J13 — Refresh during active journey

- **Start / state / viewport:** Question, locked Prediction, active job, result, transfer, patch.
- **Actions:** Refresh each state; reconnect cursor; compare immutable Prediction and hashes.
- **Expected:** Exact legal state resumes; no duplicate job/result; active job remains cancellable.
- **Actual:** Restoration/idempotency source and tests exist; N/E against public data.
- **Elapsed / console / screenshots:** N/E.
- **Confusion / status / severity:** **Unqualified**, P1.

### J14 — Back and forward

- **Start / state / viewport:** Landing → Judge → learner/replay and data-backed stages.
- **Actions:** Browser back/forward across routes and stages.
- **Expected:** Route/state stay aligned; no duplicate requests or stale evidence.
- **Actual:** `popstate` and route parser tests pass. No data-backed public history journey executed.
- **Elapsed / console / screenshots:** N/E beyond shell navigation.
- **Confusion / status / severity:** **Partial**, P2 evidence gap.

### J15 — Direct deep links

- **Start / state / viewport:** Unknown path; `/session/audit-nonexistent-read-only`; `/proof/audit-nonexistent-read-only`; `/replay/leakage-01`.
- **Actions:** Load directly and inspect URL, response, console, recovery.
- **Expected:** Valid replay/session/proof loads; missing routes give stable contextual recovery and correct HTTP semantics.
- **Actual:** Valid replay loaded. Unknown path silently became `/`. Missing IDs returned document 200, API 404, two expected console errors across tests, and a transient toast over the landing screen.
- **Elapsed:** Route loads under about 1.2 s in the collected run.
- **Console / failed requests:** Two expected 404 console resource messages; no Playwright request failures.
- **Screenshots:** `evidence/screenshots/live-chrome-missing-*`; `live-chrome-unknown-route-1366x768.png`.
- **Confusion / status / severity:** Recovery lacks a durable explanation/CTA; **partial**, P2.

### J16 — Reopen previous session

- **Start / state / viewport:** Landing after a prior session.
- **Actions:** Look for recent work; use remembered deep URL.
- **Expected:** Privacy-safe resume/revisit affordance from landing.
- **Actual:** Direct restore and Recent sessions exist, but Recent is mounted only inside the in-session Project & evidence drawer. No landing resume surface.
- **Elapsed / console / screenshots:** N/E with a real session.
- **Confusion / status / severity:** **Source-confirmed discoverability gap**, P2.

### J17 — Start a second project

- **Start / state / viewport:** Existing or active job; shared `Start over`.
- **Actions:** Start over during active compile; create second analysis.
- **Expected:** Cancel active job or preserve a resumable reference before clearing local state.
- **Actual:** `restart()` clears checkpoints/UI without calling the dedicated runner-cancel endpoint. N/E publicly.
- **Elapsed / console / screenshots:** N/E.
- **Confusion / status / severity:** Possible orphan work/cost and lost handle; **source-confirmed**, P2.

### J18 — Export or inspect evidence

- **Start / state / viewport:** Replay/completed proof.
- **Actions:** Open evidence drawer; inspect activity/provenance; download patched copy/Capsule; hash-check.
- **Expected:** Exact run-bound evidence and valid downloads.
- **Actual:** Legacy replay UI was inspected; its public Capsule endpoint correctly returned 404 because v1 has no Capsule. Native v2 source/tests are strong. No current public download occurred.
- **Elapsed / console / screenshots:** N/E for downloads.
- **Confusion / status / severity:** **Unqualified on current release**, P1.

### J19 — Judge Mode to learner

- **Start / state / viewport:** `/judge`; desktop/mobile.
- **Actions:** Activate masthead/footer learner links.
- **Expected:** Return to `/` with a clean learner view.
- **Actual:** Links target `/`; route rendered in the same browser audit. No writes.
- **Elapsed / console / screenshots:** Normal route latency; 0 errors.
- **Confusion / status / severity:** **Pass**.

### J20 — Complete flow without CounterLab vocabulary

- **Start / state / viewport:** Clean landing; novice learner.
- **Actions:** Follow dominant CTA without prior terms; interpret Prediction, Test, Boundary, Apply, Repair.
- **Expected:** Learner can complete and explain the evidence loop without developer vocabulary.
- **Actual:** Copy review shows the six-stage vocabulary is plain and Judge Mode is exceptionally explanatory. No novice study or current complete public flow was performed; claim-only CTA fails before the loop for a learner without a notebook.
- **Elapsed / console / screenshots:** N/E as human study.
- **Confusion / status / severity:** **Unverified learner-completion evidence**, P1 impact/design gap.

## Acceptance questions for supported journeys

The repository verifies by source/test that artifact evidence binds to claim references; competing models differ; learner confirmation and immutable Prediction precede results; scorer/verifier/fixed kernel separate authority; Boundary Map and transfer use fixed code; repair remains locked and modifies a copy; Proof Capsule v2 binds exact run provenance. The audit did **not** observe these together on Worker #82. The legacy v1 replay specifically fails the “every replay element labelled honestly” acceptance question once new local choices are entered.

## Evidence limitations

This matrix is intentionally not marked fully complete. The audit’s read-only constraint conflicts with public POST/session/upload/runner journeys. Existing tests and historical release artifacts reduce uncertainty but do not replace exact-version public execution.
