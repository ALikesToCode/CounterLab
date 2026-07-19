# Agent 1 + 2 evidence: live cartography and learner journeys

## Audit status

**Partially complete: public read-only routes were rendered in an explicitly user-authorized local Chromium fallback.** The preferred CloakBrowser surface was unavailable: `CLOAK_CDP_ENDPOINT` was absent and `playwright-cli` failed closed twice with `CloakBrowser is available only inside codex-safe`. After the owner explicitly authorized installed Chromium, a clean persistent profile inspected public GET routes while a request interceptor blocked every non-GET/HEAD/OPTIONS request. Chromium closed normally after the run.

This report therefore separates:

- **Observed live**: rendered public route, responsive, console, network, and local legacy-replay evidence captured in Chromium 150.0.7871.128 with Playwright 1.61.1.
- **Observed public API**: read-only public deployment/API evidence captured by a parallel audit agent.
- **Verified in source**: current workspace route, state, and control behavior read from React/TypeScript.
- **Verified by test**: five targeted jsdom/source-contract files, 49 tests, executed in this audit slice.
- **Documented historical**: repository release/smoke records tied to older deployments.
- **Inferred**: likely learner effect derived from source or CSS without rendered confirmation.
- **Unverified**: every state-changing production path, download integrity, upload path, live/sample session completion, runner recovery, and exact build-to-source identity.

No product source, production state, Cloudflare configuration, deployment, artifact, session, or job was changed by this audit slice. Only audit artifacts were created.

## Baseline

| Field | Evidence |
| --- | --- |
| Public learner URL | `https://counterlab.cserules.workers.dev/` |
| Public Judge URL | `https://counterlab.cserules.workers.dev/judge` |
| Audit time | Began `2026-07-18T18:54:21Z` |
| Preferred browser | CloakBrowser-backed `playwright-cli`; unavailable, reproduced twice |
| Authorized fallback | Local `/usr/bin/chromium`, explicitly authorized by the owner; GET/HEAD/OPTIONS only |
| Browser/version | Chromium 150.0.7871.128; Playwright 1.61.1 |
| Executed viewports | 390 x 844, 1366 x 768, 1440 x 900 |
| Browser interval | `2026-07-18T19:15:59.417Z`–`19:16:26.662Z` |
| Console/network/screenshots | 11 route/state records, 12 screenshots, 0 page exceptions, 0 failed requests, 2 expected 404 console/resource errors from deliberately nonexistent deep links, 0 attempted/blocked writes |
| Workspace at test start | `feat/learner-ux-v6.1`, `6f5513674e6db3a6222580121f4b5c11b2f53dda` |
| Concurrent workspace change | During the audit, HEAD advanced to `f9ca9bce2bb88921614d3e7ee6d195ba0c099c70`; route findings use the inspected tree, while the typography finding is explicitly time-stamped current-source evidence |
| Targeted source-contract tests | 5 files / 49 tests passed in 5.24 s |

### Current public deployment baseline

A parallel read-only API/deployment inspection recorded at `2026-07-18T18:57:27Z`–`18:59:06Z`:

- Cloudflare deployment `dad4cd71-3dcd-4b00-a1b6-d16068d53c81`.
- Worker version `bef5edb7-6a76-4c72-94be-fcb2b94e668d`, version number 82, at 100% traffic.
- Deployment created `2026-07-18T18:12:53.84457Z`.
- `/ready` returned 200 with analyst, persistence, private storage, runner, and signing checks true.
- `/api/health` returned 200 and reported GPT, Codex, kernel, and sandbox configured.
- The deployment metadata did not expose a source commit.

Evidence: `evidence/network/public-api-baseline.md`.

These readiness responses do **not** prove a completed notebook journey. They also supersede the repository documentation that still names Worker `89db95bc…` and its tuple-schema failure as the then-current deployment. The historical failure is not presented here as a current production failure. The GET-rendered behavior below belongs to the public deployment at audit time; state-changing notebook behavior remains unverified.

### Chromium GET-route baseline

| Route/state | Observed live result |
| --- | --- |
| `/`, 1440 x 900 | 200; question-first landing rendered with claim composer, optional notebook affordance, prompt starters, sample/replay/Judge links, proof boundary copy, no horizontal overflow |
| `/`, 390 x 844 | 200; no horizontal overflow; sample, replay, Judge Mode, and proof navigation absent until `Explore` is opened |
| `/judge`, desktop/mobile | 200; full evidence dossier rendered; current authority copy names GPT-5.6, Runtime Codex, fixed kernel, and frozen verifier; live card said authority was configured |
| `/new` | 200; heading `Test my notebook`; hosted runner and notebook tools both reported ready |
| `/replay/leakage-01` | 200; persistent replay banner and legacy metadata rendered |
| Legacy replay interaction | With no requests after initial load, locally entered revision/transfer choices advanced to `Passed`, `patched`, repaired-notebook/proof download controls, and learner-specific Reasoning Diff; localStorage became `counterlab.replayTransferState=patched` |
| Unknown route | 200 shell, canonicalized to `/` landing |
| Missing `/session/:id` and `/proof/:id` | Document 200 plus API GET 404 and visible `Session not found` notice over the landing screen |

Observed performance in this single unthrottled fallback run: landing cold LCP 1,776 ms, load end 1,871 ms, two long tasks (82 ms and 247 ms); later warm route LCPs 428–660 ms. Judge Mode CLS was 0.0363 desktop and 0.0028 mobile. These are evidence points, not a statistically representative benchmark.

Primary evidence:

- `evidence/test-results/live-chrome-public-routes-20260719.json`
- `evidence/network/live-chrome-network-20260719.json`
- `evidence/console/live-chrome-console-20260719.json`
- `evidence/test-results/live-chrome-public-routes-trace-20260719.zip`
- `evidence/screenshots/live-chrome-*.png`

### Historical evidence boundary

`docs/PRODUCTION_SMOKE.json` records a full seven-stage smoke for Worker `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` completed on `2026-07-16T05:03:38.850648Z`. `docs/PROGRESS.md` later recorded a different Worker (`89db95bc…`) whose live leakage flow failed closed, plus a local schema fix awaiting promotion. Neither record is exact-version evidence for public Worker version 82.

## Source-derived public route map

Source: `apps/web/src/app/AppRouter.ts:1-47`, route hydration in `apps/web/src/App.tsx:3745-3910`, and hosted replay rendering in `apps/web/src/App.tsx:4244-4276`.

| Route | Source behavior | Principal state/surface | Evidence status |
| --- | --- | --- | --- |
| `/` | Canonical landing route; unknown routes also parse to landing and `restart()` replaces the URL with `/` | Question-first learner landing | Verified in source; public render unverified |
| `/judge` | Sets Judge Mode, clears active learner projection, calls capability health | Evidence dossier with sample/live/replay paths | Verified in source; public render unverified |
| `/new` | Selects live mode, enters `live-setup`, calls capability health | Live capability gate and fallbacks | Verified in source; public render unverified |
| `/session/:id` | Loads persisted session then artifact; maps stored state to Question, Prediction, Test, live compile, or result | Resumed sample/live session | Verified in source; public data path unverified |
| `/proof/:id` | Uses the same persisted-session loader as `/session/:id`; completed sessions render completion/proof state | Completed session, Reasoning Diff, downloads/publication when authority exists | Verified in source; public data path unverified |
| `/replay/:id` | Loads replay. Schema v2 renders the read-only Capsule view; schema v1 uses the legacy staged learner shell | Legacy replay or hosted Proof Capsule replay | Verified in source; legacy endpoint observed 200 by parallel API audit; browser unverified |
| Any other path | `parseStudioLocation` returns landing; malformed percent encoding also returns landing | `/` after restart | Verified by route unit tests |

### Non-route anchors and deep sections

- `/#landing-support-note`: “How proof works” and supported evidence.
- Hosted replay anchors: `#replay-question`, `#replay-prediction`, `#replay-test`, `#replay-boundary`, `#replay-apply`, `#replay-repair`, and `#replay-proof`.
- Learner evidence anchors include `#experiment-theater-comparison`, `#leakage-verified-evidence`, `#learner-apply-evidence`, and verified Boundary Map targets.

### Source-derived state graph

```text
/
├─ attach notebook ─> live / claim + upload intake
├─ submit plain claim ─> /new ─> live capability gate ─> claim/upload
├─ Try verified sample ─> /session/<id> ─> Question
├─ Watch verified replay ─> /replay/leakage-01
└─ Judge Mode ─> /judge

/judge
├─ Start sample ─> /session/<id>
├─ Run live (only when health says all configured) ─> /new
├─ Check live status (when unavailable) ─> remain /judge
├─ Watch replay ─> /replay/leakage-01
└─ Learner view ─> /

session learner loop
Question ─> Prediction confirmation ─> immutable Prediction
  ─> Test compile/verify/run ─> Boundary result/exploration/map
  ─> Apply revision/transfer ─> Repair gate/patch copy
  ─> /proof/<session-id> + Reasoning Diff/Proof Capsule when issued
```

## Visible control inventory from source

This is a discoverability inventory, not proof that controls render or work on Worker version 82.

### `/` landing

- Responsive `Explore` menu toggle; Escape closes and restores focus.
- `New question`.
- `Try verified sample`.
- `Watch verified replay`.
- `Judge Mode` link.
- `How proof works` anchor.
- Input-type toggles: `Question` and `Notebook`.
- `Your question or claim` textarea.
- `Attach notebook` file input accepting `.ipynb`/JSON.
- `Test this claim` submit button, disabled for empty input.
- Two prompt starters: high score/new customers and high accuracy/rare cases.
- `Need a hint?` disclosure and evidence link.

### `/judge`

- CounterLab home wordmark.
- Learner view link in masthead.
- Hero `Start sample` and `Watch verified replay`.
- Mode-card `Start sample`.
- Conditional `Run live` link or `Check live status` button.
- Mode-card `Watch replay`.
- Footer `Open learner view`.
- No input fields or direct notebook upload on the dossier itself.

### `/new` live setup

- Conditional `Continue with my notebook`.
- Conditional `Check again` after capability-check error.
- `Use the sample lesson` fallback.
- `Watch the verified replay` fallback.

### Shared session shell

- CounterLab home wordmark and `Start over`.
- Six-stage progress: Question, Prediction, Test, Boundary, Apply, Repair; completed steps become `Review …` buttons.
- Mobile stage disclosure (`Step n of 6`).
- `Project & evidence` modal trigger and close control.
- Project drawer: New analysis, current notebook/evidence, up to five evidence-cell buttons, up to three recent-session buttons, and Commands.
- Command palette through Ctrl/Cmd-K or mobile `Open commands`; actions include Analyze notebook, Show evidence, Lock prediction, Run fair test, Show verifier, Review patch, Download patched notebook, Export proof, and Start over, gated by current state.
- Collapsible `Evidence & proof` console with Activity, Plan, Diff, Tests, Verifier, and Provenance tabs.
- Contextual `Need a hint?` disclosure.

### Question

- `Use a different notebook` upload.
- `Use a starter claim`.
- Claim textarea and character count.
- `Compare two explanations`, disabled until sufficient claim and supported artifact.
- Notebook evidence/integrity disclosure.
- On live analysis preview: `Review exact packet`, optional sensitive-content approval checkbox, `Send this evidence`, and `Change my claim`.

### Prediction

- Per-model `Conditions and limits` disclosures.
- `Yes, this captures my view` and `Edit my explanation`.
- `More ways to respond`: Not enough evidence and Reject.
- `Alternatives, limitations, and uncertainty` and `Why can this test teach us something?` disclosures.
- Three categorical prediction radios, confidence range, and `Seal my prediction`.

### Test/live compile

- `Run the fair test` or `Show me what happened` after result readiness.
- Collapsed test `Evidence & proof` disclosure.
- Live compile: `Cancel this test`, `Retry protected compile`, public event trace, and auto-opened proof console.

### Boundary and exploration

- Theater tabs: Observe, Explore, Boundary, Apply.
- Exact values/run details disclosure and accessible tables.
- Live leakage exploration: Mixed rows/Whole entities, entity-boundary select, Remove identity feature, test-size range, and `Run this configuration`.
- Live imbalance exploration: bounded scenario controls and `Run this configuration`.
- Live Boundary: `Map the boundary`/retry.
- Boundary Hunt: verified condition radios, `Check this condition`, `Reveal the map`, and `Skip the hunt`.
- Verified map: keyboard-inspectable cells, exact-value table, assumptions, non-claims, and integrity receipt disclosure.
- Sample Boundary uses a fixed explanatory panel rather than recomputation.

### Apply and Repair

- Reflection Builder clause selectors/free-text revision, evidence links, and `Try the rule on a new problem`.
- Leakage transfer: split radios, feature radios, `Check transfer`.
- Imbalance transfer: strategy/risk/evidence controls and `Check transfer`.
- Failed transfer leaves patch absent/locked.
- Passed transfer exposes `Verify notebook patch`/`Verify notebook repair`.
- Live failure exposes `Retry protected patch`.
- Completion: repaired-notebook download, proof record/Proof Capsule action, Evidence & proof disclosure, patch diff, and replay-publication action when native v2 authority is present.

### Hosted Proof Capsule replay

- Persistent `Verified replay` banner.
- `Start new analysis`.
- Six stage-anchor links.
- Repaired notebook copy download.
- Patch diff disclosure.
- Proof Capsule download.
- Provenance/activity/limitations disclosure.

## Mandatory journey records

All elapsed times are `N/A` because no CloakBrowser navigation occurred. “Source-described” means implementation and/or static E2E intent was inspected; it is not a live pass.

### J01 — First-time landing experience

- **Start URL:** `/`
- **Browser state:** Required clean profile; not created because browser gate failed.
- **Viewport:** Required 1440 x 900 and 390 x 844; not executed.
- **Exact actions:** Open `/`; observe first viewport; inspect question field, upload, paths, proof/support copy.
- **Expected result:** Plain-language Question first, no technical prerequisite, clear first CTA and support boundary.
- **Actual result:** Unverified live. Source provides the expected heading, claim field, notebook attachment, prompt starters, proof note, and desktop path rail.
- **Console errors / failed requests:** Not captured.
- **Screenshots:** None; see `evidence/screenshots/live-screenshots-not-captured.md`.
- **User confusion points:** Source says notebook is optional, but a plain claim routes to notebook setup; learner/audience and Codex role are not stated on the landing viewport.
- **Completion status:** Blocked by browser environment.
- **Severity of failure:** Audit limitation; candidate P1/P2 product issues below.

### J02 — Fast deterministic sample

- **Start URL:** `/`
- **Browser state:** Clean required; not executed.
- **Exact actions:** Try verified sample; enter/confirm claim; choose and seal prediction; reveal result; inspect Theater; record revision; fail/pass transfer; verify patch; download repaired copy and proof.
- **Expected result:** Complete labelled sample loop with no credential, prediction before result, transfer gate, patch copy, and valid proof.
- **Actual result:** Unverified live. Static E2E source defines this full path. Historical older-deployment evidence reports a pass, but version 82 is unqualified.
- **Console/network/screenshots:** None.
- **User confusion points:** Sample source offers a fixed Explore preview, not interactive recomputation; this is honestly labelled in source.
- **Completion status:** Blocked.
- **Severity:** P1 qualification gap, not a confirmed product failure.

### J03 — Judge Mode fast path and timed comprehension

- **Start URL:** `/judge`
- **Browser state:** Clean required; not executed.
- **Exact actions:** Inspect at 20 s, 60 s, 3 min, and 10 min; start sample; open replay; inspect live status; return learner view.
- **Expected result:** Thesis understood in 20 s; authority roles within 60 s; all modes/method within 3 min; bounded proof/reproduction within 10 min.
- **Actual result:** Unverified live. Source order is hero/twenty-second proof, four authorities, three modes, six-step method, bounded proof, reproduction commands. Public API reports all live capabilities configured, but the rendered conditional link was not observed.
- **Console/network/screenshots:** None.
- **User confusion points:** Source is strong and explicit, but timing and fold position cannot be inferred reliably without rendering.
- **Completion status:** Blocked.
- **Severity:** P1 qualification gap.

### J04 — Verified replay

- **Start URL:** `/replay/leakage-01`
- **Browser state:** Clean required; not executed.
- **Exact actions:** Open legacy replay, continue, reveal result, refresh, inspect transfer/repair, attempt downloads.
- **Expected result:** Persistent replay label; stored read-only evidence; no new experiment/model/repair; honest legacy no-Capsule boundary.
- **Actual result:** Public replay API returned 200 and legacy metadata/verified patch metadata. Browser behavior is unverified. Source keeps a replay banner but permits local revision, transfer, and patch progression for schema v1, conflicting with Judge copy that calls it read-only.
- **Console/network/screenshots:** No browser evidence; API baseline in `evidence/network/public-api-baseline.md`.
- **User confusion points:** Stored replay versus locally reenacted learner choices is not clearly separated in source.
- **Completion status:** Partially evidenced by API/source, browser blocked.
- **Severity:** Candidate P1 integrity issue.

### J05 — Supported live artifact journey

- **Start URL:** `/new` or `/` with a supported repository notebook.
- **Browser state:** Clean required; not executed.
- **Exact actions:** Confirm live health; upload untouched leakage and imbalance notebooks separately; approve packet; confirm models; seal Prediction; compile/verify/run; map Boundary; transfer; patch; export Capsule; publish/open replay.
- **Expected result:** Artifact-specific live authority completes for both packs with no sample/replay fallback.
- **Actual result:** Unverified. Worker version 82 reports GPT/Codex/kernel/sandbox configured, which proves configuration only. No exact-version end-to-end evidence or source commit is available. Older docs describe both a previous successful v2 smoke and a later failed v5.1 build; neither decides current behavior.
- **Console/network/screenshots:** None from browser.
- **User confusion points:** Capability “configured” can be mistaken for journey-proven readiness.
- **Completion status:** Not run.
- **Severity:** P1 release/first-prize blocker until passed.

### J06 — Unsupported artifact journey

- **Start URL:** Sample Question screen or live upload.
- **Browser state:** Clean required; not executed.
- **Exact actions:** Upload a safe notebook containing unsupported magic and an external-network dependency.
- **Expected result:** Parse without execution; show `UNSUPPORTED_MAGIC` and `EXTERNAL_NETWORK_DEPENDENCY`; disable advance; constructive refusal.
- **Actual result:** Source and a static Cloak E2E definition cover this. Current public behavior unverified.
- **Console/network/screenshots:** None.
- **User confusion points:** None confirmed.
- **Completion status:** Blocked.
- **Severity:** Unverified integrity gate.

### J07 — Malformed but safe artifact

- **Start URL:** Live upload surface.
- **Browser state:** Clean required; not executed.
- **Exact actions:** Upload malformed/corrupted but non-executable JSON with `.ipynb` name.
- **Expected result:** Typed refusal, no execution/session advancement, useful recovery.
- **Actual result:** Not exercised. Parser tests exist elsewhere, but no live browser evidence was produced in this slice.
- **Console/network/screenshots:** None.
- **User confusion points:** Recovery copy unverified.
- **Completion status:** Not run.
- **Severity:** Unverified.

### J08 — Model or runner unavailable

- **Start URL:** `/new` and `/judge`.
- **Browser state:** Clean required; not executed.
- **Exact actions:** Observe unavailable capability state; retry; choose sample/replay fallback.
- **Expected result:** Honest no-call/no-result message and working offline paths.
- **Actual result:** Source implements these states; static E2E mocks missing capabilities. Public API instead reported all configured at audit time. Failure UI not observed.
- **Console/network/screenshots:** None.
- **User confusion points:** “Configured” is not the same as a successfully proven request; source does say first request confirms connection.
- **Completion status:** Failure state not run.
- **Severity:** Unverified.

### J09 — API timeout or interrupted connection

- **Start URL:** Active live compile/boundary/patch.
- **Browser state:** Existing active job required; not created.
- **Exact actions:** Interrupt event connection, refresh, reconnect from persisted cursor, cancel/retry.
- **Expected result:** Same job resumes after cursor; duplicate actions are idempotent; no premature result.
- **Actual result:** Source and credentialed E2E intent cover reconnect/cancel. No current public job was started or interrupted.
- **Console/network/screenshots:** None.
- **User confusion points:** Unverified.
- **Completion status:** Not run.
- **Severity:** P1 qualification gap for a central live promise.

### J10 — Transfer failure

- **Start URL:** Sample/live Boundary Apply phase.
- **Browser state:** Completed verified result required; not created.
- **Exact actions:** Record revision; choose random daily rows and known item price; check transfer.
- **Expected result:** Clear corrective hint, patch remains locked, no patch action.
- **Actual result:** Source and static E2E describe this behavior; public browser unverified.
- **Console/network/screenshots:** None.
- **User confusion points:** Feedback quality cannot be assessed visually.
- **Completion status:** Not run.
- **Severity:** Unverified.

### J11 — Transfer success

- **Start URL:** Apply phase.
- **Browser state:** Same as J10; not created.
- **Exact actions:** Choose time-ordered holdout and centered future-reading feature; check transfer.
- **Expected result:** Deterministic pass, patch unlocked, clear cross-context explanation.
- **Actual result:** Source and static E2E describe this behavior; unverified public.
- **Console/network/screenshots:** None.
- **User confusion points:** None confirmed.
- **Completion status:** Not run.
- **Severity:** P1 qualification gap because transfer is core differentiation.

### J12 — Patch approval or rejection

- **Start URL:** Transfer-passed phase.
- **Browser state:** Sample/live session required; not created.
- **Exact actions:** Verify patch; observe progress; retry a rejected patch; download only after verification.
- **Expected result:** Copy only, source unchanged, rejected candidate unavailable, exact diff and proof.
- **Actual result:** Implemented in source and static E2E intent. No current public patch job or download was observed.
- **Console/network/screenshots:** None.
- **User confusion points:** Legacy replay uses a local `patched` transition without server verification; see issue register.
- **Completion status:** Not run.
- **Severity:** P1 qualification gap.

### J13 — Refresh during an active journey

- **Start URL:** `/session/:id`, `/proof/:id`, `/replay/:id`.
- **Browser state:** Active session required; not created.
- **Exact actions:** Refresh at Question, confirmed Prediction, committed Prediction, result, revision, transfer pass, patch, and active compile.
- **Expected result:** Persist exact phase/prediction; reconnect active job; preserve mode label.
- **Actual result:** Source restoration and static E2E coverage exist. No public refresh was executed.
- **Console/network/screenshots:** None.
- **User confusion points:** None confirmed.
- **Completion status:** Not run.
- **Severity:** P1 qualification gap for live recovery.

### J14 — Browser back and forward navigation

- **Start URL:** `/`, `/judge`, `/new`, `/session/:id`, `/replay/:id`.
- **Browser state:** Multi-route history required; not created.
- **Exact actions:** Navigate across routes, Back/Forward repeatedly, including from Judge and resumed session.
- **Expected result:** Route hydration follows history without state leakage or stale URL.
- **Actual result:** `popstate` is handled in source and routing unit tests pass; no real history traversal was executed.
- **Console/network/screenshots:** None.
- **User confusion points:** Stage changes inside one session reuse `/session/:id`, so browser history is route-oriented rather than stage-oriented.
- **Completion status:** Not run.
- **Severity:** Unverified.

### J15 — Direct deep-link loading

- **Start URL:** Each public route pattern plus invalid IDs/path encoding.
- **Browser state:** Clean required; not executed.
- **Exact actions:** Load direct Judge, New, Session, Proof, Replay, unknown, and malformed routes.
- **Expected result:** Correct surface or typed error; unknown/malformed route safely returns landing.
- **Actual result:** Route parser unit tests passed; public data-backed routes were not opened.
- **Console/network/screenshots:** None.
- **User confusion points:** Initial hydration may briefly use the default landing state before a data-backed route resolves; rendered behavior unverified.
- **Completion status:** Source contract passed, browser blocked.
- **Severity:** P2 if a visible flash/error is confirmed.

### J16 — Reopening a previous session

- **Start URL:** `/session/:id` or `/proof/:id`; also test discovery from `/`.
- **Browser state:** Existing session required; not created.
- **Exact actions:** Close/reopen direct URL; start another session; use Recent sessions.
- **Expected result:** Resume exact state and proof; obvious route back to prior work.
- **Actual result:** Direct restore and Recent sessions exist in source. Recent sessions are only exposed inside `Project & evidence` after entering a session; the landing has no resume surface.
- **Console/network/screenshots:** None.
- **User confusion points:** A returning learner at `/` cannot discover prior work unless retaining a deep URL or entering another session first.
- **Completion status:** Not run.
- **Severity:** Candidate P2 UX issue.

### J17 — Starting a second project

- **Start URL:** Any active/completed session.
- **Browser state:** Existing session/job required; not created.
- **Exact actions:** Start over/New analysis, then return via Recent sessions.
- **Expected result:** Clear separation, no mode/session leakage, active jobs safely handled.
- **Actual result:** Source clears local state and checkpoints and begins live mode. `restart()` does not issue a runner cancellation before discarding an active checkpoint.
- **Console/network/screenshots:** None.
- **User confusion points:** A job abandoned through Start over may continue remotely and becomes harder to resume.
- **Completion status:** Not run.
- **Severity:** Candidate P2 reliability issue.

### J18 — Exporting or inspecting evidence

- **Start URL:** Test/Boundary/Repair/Proof/Replay.
- **Browser state:** Completed states required; not created.
- **Exact actions:** Open Evidence & proof tabs/disclosures, exact tables, provenance; download patch, proof, Capsule; publish/open replay.
- **Expected result:** Downloads match exact run; no secret/private data; controls gated by authority.
- **Actual result:** Source and static E2E intent cover these paths. Parallel API audit confirms legacy replay has no Capsule endpoint. No browser download was made.
- **Console/network/screenshots:** None.
- **User confusion points:** Legacy replay’s lack of Capsule is disclosed in Judge source, but only after reading its small print.
- **Completion status:** Not run.
- **Severity:** P1 qualification gap.

### J19 — Returning from Judge Mode to learner experience

- **Start URL:** `/judge`.
- **Browser state:** Clean required; not executed.
- **Exact actions:** Use masthead Learner view, wordmark, and footer Open learner view; Back/Forward.
- **Expected result:** Land at `/` with no Judge state leakage.
- **Actual result:** All links target `/` in source; unverified public.
- **Console/network/screenshots:** None.
- **User confusion points:** None confirmed.
- **Completion status:** Not run.
- **Severity:** Unverified.

### J20 — Complete core flow without prior terminology

- **Start URL:** `/`.
- **Browser state:** Clean novice session required; not executed.
- **Exact actions:** Give no explanation; ask learner to proceed from first screen through sample completion; record hesitation/misinterpretation.
- **Expected result:** Understand every action using Question, Prediction, Test, Boundary, Apply, Repair without developer vocabulary.
- **Actual result:** Not performed with a learner or rendered UI. Static E2E checks that landing body avoids `formalize`, `discriminating`, `canonical`, and `mutation`; this is not a novice-comprehension result.
- **Console/network/screenshots:** None.
- **User confusion points:** Plain-claim/notebook mismatch; audience not explicit; first landing does not explain Codex’s role.
- **Completion status:** Not run.
- **Severity:** P1/P2 UX evidence gap.

## First-20-seconds test — observed first fold plus source trace

| Question | Source-derived answer | Clarity |
| --- | --- | --- |
| What is CounterLab? | The rendered landing presents a place to state a claim and prove it through fixed computation/checks; the explicit “scientific debugger for beliefs” category is absent. | Partial |
| Who is it for? | Implied: someone with a Python/scikit-learn notebook or confused by model results. No explicit learner persona appeared in the first fold. | Unclear |
| What problem does it solve? | Helps understand what a high result actually supports, especially generalization and rare-case metrics. | Clear |
| What should the visitor do first? | State a claim; desktop also exposes sample/replay in the rail. | Clear on desktop; alternative paths were hidden behind Explore at 390 px |
| Why is this different from ChatGPT/normal tutor? | “Ask like chat. Prove it like science” and fixed-kernel/frozen-check copy establish a truth boundary. ChatGPT is not explicitly contrasted on the landing screen. | Mostly clear |
| What role does Codex play? | Not stated on the rendered learner landing. Rendered Judge Mode says Runtime Codex compiles bounded test plans. | Unclear on learner landing; clear in Judge Mode |
| What evidence can be trusted? | Fixed kernels calculate; frozen checks bind/verify before release. | Clear |
| Is it live, sample, replay, or unavailable? | Desktop exposes sample/replay; claim submit implies live; `/new` reports live tools ready. Mobile hides mode navigation until Explore opens. | Partial |

This was a visual/copy inspection, not a timed human-comprehension study. Judge Mode's first fold communicates the result contrast and product thesis strongly, but the learner landing still omits the learner persona and Codex role.

## Targeted verification executed

Command from `apps/web`, using repository-contained HOME/XDG/TMP paths:

```text
./node_modules/.bin/vitest run --config vitest.config.ts \
  src/app/AppRouter.test.ts \
  src/App.test.tsx \
  src/features/judge/JudgeModeView.test.tsx \
  src/components/replay/ProofCapsuleReplayView.test.tsx \
  src/components/learner/ExperimentTheater.test.tsx
```

Result: 5 files passed, 49 tests passed, exit 0, 5.24 s. Evidence: `evidence/test-results/live-source-unit-tests.txt`.

The current Cloak suite statically defines 22 tests including three viewport landing/progress cases and two credentialed live cases, but this audit did not execute it. Repository documentation independently says zero current v6.1 browser journeys had run in its prior pass.

## Candidate issues

### Issue CL-LIVE-001

Issue ID: CL-LIVE-001

Title: Worker version 82 reports ready but has no exact-version end-to-end learner evidence or exposed source identity

Severity: P1 — First-prize blocker

Confidence: confirmed

Reproducibility: always for the inspected release-evidence state

Category: submission, reliability, functionality

Affected route or component: Public deployment; `/`, `/judge`, `/new`, `/session/:id`, `/proof/:id`, `/replay/:id`

Affected user: Devpost judge, learner attempting live notebook analysis, release operator

Affected Devpost criterion: Technological Implementation; Design

Environment: Public Worker version `bef5edb7-6a76-4c72-94be-fcb2b94e668d` (#82), deployment `dad4cd71-3dcd-4b00-a1b6-d16068d53c81`, observed 2026-07-18 UTC

Prerequisites: Read-only Cloudflare deployment metadata and public readiness endpoints

Reproduction steps: 1. Inspect current deployment identity. 2. Compare with `docs/PRODUCTION_SMOKE.json`, `docs/PROGRESS.md`, and release evidence. 3. Search for a smoke/browser record bound to Worker version 82 and its source commit. 4. Observe that source commit is not exposed and older reports bind other versions.

Expected behaviour: The exact public version is bound to source/container identities and has a completed untouched leakage flow, untouched imbalance flow, sample, replay, refresh/reconnect, patch download, Proof Capsule export, no-secret scan, and current browser matrix.

Actual behaviour: Readiness and capability health are green, but no exact-version completed journey record was found. Older success/failure reports belong to older Workers. Browser execution was unavailable in this audit.

Evidence: `evidence/network/public-api-baseline.md`; `docs/PRODUCTION_SMOKE.json:1-113`; `docs/PROGRESS.md:132-143,289-291`.

Console or network evidence: `/ready` and `/api/health` both 200 through a parallel read-only API audit; these prove configuration only.

Source-code evidence: Current workspace contains the full path and static E2E definitions, but deployment metadata exposes no commit to establish equivalence.

Root-cause hypothesis: A new Wrangler upload occurred after the last committed exact-version release evidence, without updating the source-bound smoke/browser ledger.

Learner impact: Live completion, recovery, downloads, and mode separation may work, but learners and auditors cannot rely on readiness alone.

Judge impact: A hands-on failure or inconsistent build would undercut the strongest technical claim; even a working app lacks audit-ready proof.

Trust or integrity impact: High. Green configuration can be misread as verified end-to-end authority.

Recommended correction: Bind Worker #82 (or its replacement) to exact source and Container identifiers, then execute and record the full production smoke and current CloakBrowser matrix without changing the release between checks and submission.

Smallest acceptable fix: Record source commit/build ID for the current deployment and pass one untouched live journey for each supported pack plus sample, replay, patch, Capsule, refresh/reconnect, and no-secret checks on that exact Worker.

Acceptance criteria: A factual report names deployment, Worker version, source commit, Container digest, timestamps, both live session IDs/hashes, download hashes, replay IDs, browser/viewport matrix, console/failed-request results, and all outcomes; the public deployment remains unchanged after the record.

Regression test: Make release automation reject publication/submission evidence unless production identity equals the identity in smoke and browser reports.

Dependencies: CloakBrowser CDP access; production runner/model capability; contained Cloudflare credentials for identity lookup only as authorized by release workflow.

Estimated effort: M

Score leverage: very high

Related issues: CL-LIVE-002, CL-LIVE-003

Second-agent confirmation: Confirmed by the parallel public API/deployment baseline; completion remains deliberately unverified rather than failed.

### Issue CL-LIVE-002

Issue ID: CL-LIVE-002

Title: Landing presents notebook attachment as optional but every plain claim routes to “Test my notebook”

Severity: P1 — First-prize blocker

Confidence: high

Reproducibility: always in inspected source

Category: UX, pedagogy, functionality

Affected route or component: `/`; Landing, QuestionComposer, `/new` LiveSetup

Affected user: First-time learner without a notebook; judge following the dominant claim CTA

Affected Devpost criterion: Design; Potential Impact; Quality of the Idea

Environment: Current workspace source inspected from `apps/web/src/App.tsx`

Prerequisites: No notebook selected; non-empty plain-language claim

Reproduction steps: 1. On landing, read “If you have a notebook, attach it.” 2. Enter a plain claim. 3. Select `Test this claim`. 4. Follow source handler to `chooseMode("live")`. 5. Observe next route/state is `/new`/`live-setup`, headed “Test my notebook.”

Expected behaviour: Either a claim-only guided/sample path exists, or landing plainly states that a supported notebook is required for a live test and routes the learner to a deliberate mode choice.

Actual behaviour: Source copy makes notebook sound optional. The dominant submit always chooses live notebook mode, then asks to continue with a notebook. There is no claim-only verified path.

Evidence: `apps/web/src/App.tsx:809-829,3173-3203,3952-3963,4297-4310`; `apps/web/src/components/learner/QuestionComposer.tsx:78-119`.

Console or network evidence: None; browser unavailable.

Source-code evidence: `testClaim` stores the claim then invokes `chooseMode("live")`; live mode sets `live-setup`; LiveSetup is titled “Test my notebook.”

Root-cause hypothesis: Chat-first copy was added over a notebook-only authority path without a distinct router decision for claim-only users.

Learner impact: Immediate expectation break and likely abandonment; the learner may feel baited into a technical artifact workflow.

Judge impact: Weakens the first-20-seconds promise and makes the product feel like a notebook debugger rather than a scientific debugger for beliefs.

Trust or integrity impact: Medium; the support boundary is technically honest lower on the page, but the dominant path overpromises input flexibility.

Recommended correction: Make the dominant landing decision explicit: attach a supported notebook for live artifact analysis, or start the verified sample/guided path for a claim without one.

Smallest acceptable fix: On plain claim submit with no file, show a two-path handoff in learner language—`Test with the verified sample` and `Attach my notebook`—while preserving the typed claim; never title the next screen as the learner’s notebook unless a file exists.

Acceptance criteria: From a clean state, a novice can enter a claim without a file and reaches a usable, honestly labelled path; a notebook-required message appears before live capability checks; no sample result is relabelled live.

Regression test: CloakBrowser journey submits a claim with no file and asserts no dead-end notebook screen, correct mode label, preserved claim, and no unintended upload/model request.

Dependencies: Product copy/route decision; no backend authority change required.

Estimated effort: S

Score leverage: high

Related issues: CL-LIVE-004

Second-agent confirmation: Required before final P1 inclusion; source-confirmed here, rendered journey not executed.

### Issue CL-LIVE-003

Issue ID: CL-LIVE-003

Title: Legacy “read-only” replay accepts new local transfer choices and advances to a synthetic patched completion state

Severity: P1 — First-prize blocker

Confidence: high

Reproducibility: always in inspected schema-v1 replay source path

Category: verification, UX, functionality, submission

Affected route or component: `/replay/leakage-01`; legacy LeakageRealityScreen

Affected user: Judge or learner inspecting the advertised verified replay

Affected Devpost criterion: Technological Implementation; Design; Quality of the Idea

Environment: Current workspace source; public legacy replay API observed 200

Prerequisites: Load schema-v1 replay `leakage-01`, advance to result/Apply

Reproduction steps: 1. Read Judge copy: “Read-only stored events. No new model call, no new experiment.” 2. Load legacy replay and reach Apply. 3. Edit revision. 4. Choose transfer answers. 5. Source branch with `session === null` computes pass/fail locally. 6. Click Verify notebook patch. 7. Source branch with `session === null` sets state directly to `patched`. 8. Completion renders “You can now distinguish,” transfer passed, Reasoning Diff, and fallback “Verified replay patch” copy.

Expected behaviour: A read-only replay renders only recorded learner decisions, transfer, patch, and evidence. If interactive reenactment is offered, it must be distinctly labelled non-authoritative and cannot create a verified/patched completion projection.

Actual behaviour: Persistent replay labelling is preserved, but locally authored choices advance the replay to learner-specific pass and patched UI without a server evaluator or patch-verifier call.

Evidence: Judge promise at `apps/web/src/features/judge/JudgeModeView.tsx:208-221`; local replay branches at `apps/web/src/App.tsx:2212-2266`; completion language/fallback patch at `apps/web/src/App.tsx:2461-2503,2530-2615`; public API baseline confirms the legacy replay exists.

Console or network evidence: No browser trace. Parallel API baseline shows `GET /api/replays/leakage-01` 200 and no legacy Capsule endpoint.

Source-code evidence: `session === null` branches bypass `recordRevision`, `submitTransfer`, and `compilePatch` APIs and directly mutate presentation state.

Root-cause hypothesis: The old interactive replay lesson was retained under new “read-only evidence” product copy without splitting playback from reenactment.

Learner impact: A learner may believe their newly entered transfer/repair was part of the verified stored run.

Judge impact: Direct contradiction of the authority-separation thesis; an attentive judge can interpret the replay as theater rather than evidence.

Trust or integrity impact: High. It blurs recorded authority and local presentation.

Recommended correction: Make schema-v1 replay strictly read-only or reclassify the interactive branch as an explicitly labelled non-authoritative guided reenactment separate from replay.

Smallest acceptable fix: Disable revision, transfer, and patch actions in legacy replay; render stored result and stored patch metadata only; keep explicit no-Capsule limitation. Alternatively route `leakage-01` to a static replay projection with no mutable learner controls.

Acceptance criteria: Every state on `/replay/leakage-01` retains replay label; no API mutation occurs; no new local choice is represented as passed/verified; all displayed transfer/patch claims bind recorded payload fields; refresh reproduces identical output.

Regression test: Browser test asserts replay contains no enabled revision/transfer/verify-patch inputs and hashes/text remain identical after interaction attempts and refresh.

Dependencies: Legacy compatibility decision; replay projection or UI branching.

Estimated effort: M

Score leverage: very high

Related issues: CL-LIVE-001

Second-agent confirmation: Required before final P1 inclusion; source and public payload existence confirmed, rendered contradiction not executed.

### Issue CL-LIVE-004

Issue ID: CL-LIVE-004

Title: Mobile first visit hides sample, replay, Judge Mode, and proof explanation behind an unexplained Explore menu

Severity: P2 — Material quality issue

Confidence: high

Reproducibility: always below 900 px in inspected CSS

Category: UX, accessibility, submission

Affected route or component: `/`; landing rail/navigation

Affected user: Mobile learner or judge

Affected Devpost criterion: Design; Potential Impact

Environment: Current source at viewport below 900 px; rendered effect not observed

Prerequisites: Narrow viewport; menu initially closed

Reproduction steps: 1. Inspect landing navigation controls. 2. Inspect CSS breakpoint. 3. At max-width 900 px, navigation is `display: none` until `.is-open`; only `Explore` indicates the disclosure.

Expected behaviour: The first viewport makes at least the primary claim path and one low-risk verified path/mode status obvious.

Actual behaviour: Sample, replay, Judge Mode, How proof works, and New question are hidden until the learner interprets and opens Explore.

Evidence: `apps/web/src/App.tsx:748-806`; `apps/web/src/styles.css:6638-6673`.

Console or network evidence: None.

Source-code evidence: Responsive CSS hides `.landing-rail-navigation`; the toggle label does not describe the available evidence modes.

Root-cause hypothesis: Desktop sidebar collapsed wholesale on mobile without promoting the highest-value secondary path.

Learner impact: Reduced discoverability of the safe sample and replay; a plain claim is more likely to hit the notebook mismatch.

Judge impact: A mobile judge may miss Judge Mode and explicit mode separation during the first 20 seconds.

Trust or integrity impact: Low to medium; mode evidence is present but concealed.

Recommended correction: Keep one compact, always-visible “Try verified sample” affordance beside the claim CTA and rename Explore to communicate modes/evidence.

Smallest acceptable fix: Add one visible sample link/button and label the menu `Sample, replay & proof` at narrow widths.

Acceptance criteria: At 390 x 844, sample and current input intent are discoverable without opening a menu; all targets remain 44 px; no overflow.

Regression test: 390 x 844 first-viewport screenshot and accessible-name assertions without menu interaction.

Dependencies: Responsive layout/copy only.

Estimated effort: XS

Score leverage: medium

Related issues: CL-LIVE-002

### Issue CL-LIVE-005

Issue ID: CL-LIVE-005

Title: Returning learners cannot discover recent sessions from the landing page

Severity: P2 — Material quality issue

Confidence: high

Reproducibility: always in inspected source

Category: UX, impact

Affected route or component: `/`; ProjectSidebar/useRecentProjects

Affected user: Learner returning to revisit proof or resume work

Affected Devpost criterion: Design; Potential Impact

Environment: Current workspace source

Prerequisites: At least one prior locally remembered session; visit `/`

Reproduction steps: 1. Complete or start a session. 2. Return to `/`. 3. Inspect landing controls. 4. Observe Recent sessions exists only inside the session-only Project & evidence modal.

Expected behaviour: Landing offers a privacy-safe resume/recent proof affordance when local sessions exist.

Actual behaviour: Recent sessions are mounted only after entering another session. Direct deep URLs can resume, but landing does not expose them.

Evidence: `apps/web/src/App.tsx:4297-4315`; `apps/web/src/app/CounterLabStudio.tsx:31-42`; `apps/web/src/components/studio/ProjectSidebar.tsx:104-128`.

Console or network evidence: None.

Source-code evidence: `CounterLabStudio` and `useRecentProjects` are rendered only when `stage !== "landing" && mode !== null`.

Root-cause hypothesis: Resume was designed as an in-session project tool, not a return-visit entry path.

Learner impact: Revisiting proof depends on preserving a URL; weakens continuity and practical impact.

Judge impact: Product feels demo-like rather than persistent.

Trust or integrity impact: Low.

Recommended correction: Add a local-only Recent investigations section on landing with clear mode/state labels and no raw claim/notebook content beyond already approved metadata.

Smallest acceptable fix: Show the most recent session/proof link when present, plus `View recent work`.

Acceptance criteria: From `/`, a returning learner can reopen a stored session/proof in one action; sample/live/replay label and last state are correct; cross-session access controls remain enforced server-side.

Regression test: Create two sessions, reload `/`, open each recent item, assert correct IDs/modes and no data leakage.

Dependencies: Reuse `useRecentProjects`; privacy review of displayed metadata.

Estimated effort: S

Score leverage: medium

Related issues: CL-LIVE-001

### Issue CL-LIVE-006

Issue ID: CL-LIVE-006

Title: Current workspace font tokens are cyclic and invalidate the intended typography hierarchy

Severity: P1 — First-prize blocker if shipped; public impact unverified

Confidence: confirmed in source; visual effect inferred

Reproducibility: always for the inspected current stylesheet

Category: design, UX, documentation

Affected route or component: All current-source routes using global `--sans`, `--display`, and `--mono`

Affected user: Every learner/judge on a build containing this stylesheet

Affected Devpost criterion: Design

Environment: Workspace HEAD advanced concurrently to `f9ca9bce2bb88921614d3e7ee6d195ba0c099c70`; public Worker #82 source identity unknown

Prerequisites: Build current stylesheet as inspected

Reproduction steps: 1. Inspect `:root` token definitions. 2. Observe `--sans: var(--sans)`, `--display: var(--sans)`, and `--mono: var(--mono)`. 3. Observe root and many components use `font-family: var(--sans|display|mono)` without fallback.

Expected behaviour: Each token resolves to a concrete fallback stack; display, body, and proof/code typography are distinct and deterministic.

Actual behaviour: `--sans` and `--mono` self-reference and are invalid at computed-value time; `--display` depends on invalid `--sans`. Declarations consuming them have no fallback and become invalid. Because `font-family` is inherited, the root falls to its initial serif and most descendants inherit it, while intended display/mono differentiation is lost.

Evidence: `apps/web/src/styles.css:1-4,46-51,120,285,305,6394,6531`.

Console or network evidence: None; rendered CSS was not inspected.

Source-code evidence: Exact cyclic declarations in current workspace source.

Root-cause hypothesis: A concurrent monochrome theme sweep mechanically replaced concrete font stacks with token self-references.

Learner impact: Likely broad typography regression, reduced hierarchy, broken code/hash differentiation, and unintended browser-default serif rendering.

Judge impact: Can make the product look unfinished despite strong interaction architecture.

Trust or integrity impact: Low for scientific authority, high for presentation credibility.

Recommended correction: Restore concrete, dependency-free stacks for all three root tokens and add a computed-style smoke assertion.

Smallest acceptable fix: Define `--sans`, `--display`, and `--mono` as explicit font stacks with system fallbacks; keep `:root { font-family: var(--sans); }`.

Acceptance criteria: In CloakBrowser, root/body compute to sans, headings intended as display compute to the display stack, code/hash surfaces compute to monospace, and no token is cyclic or unresolved.

Regression test: Browser computed-style assertions on body, one heading, and one code/provenance element; static lint rejects direct/indirect custom-property self-reference.

Dependencies: Resolve concurrent theme work; no public defect claim until exact public source is known.

Estimated effort: XS

Score leverage: high

Related issues: CL-LIVE-001

Second-agent confirmation: Source defect independently requested and confirmed; public-build presence remains unverified.

### Issue CL-LIVE-007

Issue ID: CL-LIVE-007

Title: Start over discards the active runner checkpoint without requesting job cancellation

Severity: P2 — Material quality issue

Confidence: high

Reproducibility: always in inspected source when Start over is used during active compile

Category: reliability, UX, performance

Affected route or component: Shared Header/command Start over; active live compile/patch

Affected user: Learner abandoning or starting a second project during a runner job; operator paying runner/model cost

Affected Devpost criterion: Technological Implementation; Design

Environment: Current workspace source

Prerequisites: Active runner job and visible Start over control

Reproduction steps: 1. Start a live compile. 2. Use Start over instead of Cancel this test. 3. Inspect `restart()`: local storage/checkpoints are cleared and UI returns `/`; no `cancelRunnerJob` request is made.

Expected behaviour: Starting over during an active job either cancels it safely first or preserves a resumable background-job reference and clearly explains it.

Actual behaviour: The local checkpoint is discarded immediately. The dedicated Cancel action performs server cancellation, but Start over does not.

Evidence: `apps/web/src/App.tsx:3687-3705` implements cancellation; `apps/web/src/App.tsx:3708-3734` implements restart without it.

Console or network evidence: None; no job created.

Source-code evidence: Direct comparison of `cancelLiveLab` and `restart`.

Root-cause hypothesis: Global reset predates persistent runner jobs or assumes navigation implicitly stops remote work.

Learner impact: Lost recovery handle and possible later confusion if server work completes after the learner left.

Judge impact: Weakens production-readiness story if demonstrated under interruption.

Trust or integrity impact: Medium; no wrong result is directly released, but lifecycle/accounting becomes ambiguous.

Recommended correction: Gate Start over when a job is active: cancel and await acknowledgement, or offer “Leave running and resume later” while preserving checkpoint/recent-session link.

Smallest acceptable fix: Reuse `cancelRunnerJob` before clearing an active LAB/PATCH checkpoint; failure must retain the checkpoint and explain recovery.

Acceptance criteria: Starting over during an active job results in a terminal cancelled state or a preserved resumable job; duplicate reset/cancel is idempotent; no orphaned job loses its session link.

Regression test: Browser/integration test starts a job, selects Start over, asserts cancellation endpoint/terminal state, no result release, and safe duplicate action.

Dependencies: Runner cancellation API and UX decision.

Estimated effort: S

Score leverage: medium

Related issues: CL-LIVE-001

## What was not tested and why

- No live route, control, modal, drawer, link, form, upload, download, export, history action, or focus behavior was rendered.
- No browser console, page error, request failure, SSE trace, HAR, screenshot, video, layout, color, typography, accessibility tree, target size, overflow, reduced-motion, mobile, zoom, or screen-reader evidence exists from this slice.
- No supported, unsupported, malformed, or adversarial notebook was uploaded to production.
- No session/job/artifact was created, cancelled, resumed, patched, published, or downloaded from production.
- No Judge Mode timing simulation was honestly executable.
- No exact public source commit/build identifier was discoverable from the parallel deployment metadata.

The cause is specific and reproducible: the required CloakBrowser session was unavailable and the approved wrapper refused to run. See `evidence/console/live-browser-gate.txt`.

## Evidence paths

- `evidence/console/live-browser-gate.txt`
- `evidence/network/live-browser-network-not-captured.md`
- `evidence/network/public-api-baseline.md` (parallel read-only API/deployment evidence)
- `evidence/screenshots/live-screenshots-not-captured.md`
- `evidence/test-results/live-source-unit-tests.txt`
- `evidence/test-results/agent-live-journeys.md`
