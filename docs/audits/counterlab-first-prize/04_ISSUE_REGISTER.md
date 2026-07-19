# CounterLab first-prize issue register

Audit checkpoint: `2026-07-18T19:39:42Z`
Public Worker version: `bef5edb7-6a76-4c72-94be-fcb2b94e668d` (deployment 82)
Source checkpoint: `dd451c77606ec270cfba030784df50cb3aa19969`

## Counts and classification

| Severity  |  Count |
| --------- | -----: |
| P0        |      1 |
| P1        |      9 |
| P2        |     11 |
| P3        |      1 |
| **Total** | **22** |

- **A — Submission blocker:** CL-001.
- **B — First-prize blockers:** CL-002 through CL-010.
- **C — Material improvements:** CL-011 through CL-021.
- **D — Optional differentiation:** one cross-domain pack only after every release gate is green; tracked as the deferred response to CL-009, not as permission to expand scope now.
- **E — Do not build:** see `14_DO_NOT_BUILD.md`.

P0 and P1 records were independently challenged in `evidence/test-results/red-team.md`. “Observed live,” “verified in source,” “verified by test,” “documented only,” “inferred,” and “unverified” are used explicitly in Evidence fields.

---

Issue ID: CL-001
Title: The official Devpost entry is an empty, unsubmitted pre-draft
Severity: P0 — Submission or integrity blocker
Confidence: confirmed
Reproducibility: always
Category: submission
Affected route or component: Devpost project 1330312 and submission package
Affected user: judges and submitter
Affected Devpost criterion: all four criteria and Stage One eligibility
Environment: official Devpost state captured 2026-07-18 UTC
Prerequisites: authenticated access to the project record
Reproduction steps: Open project 1330312; inspect title, status, description, tagline, category, video, repository, live URL, feedback ID, slug, and submission timestamp.
Expected behaviour: A complete Education entry is publicly judgeable and submitted before `2026-07-22T00:00:00Z`.
Actual behaviour: Status is `submission_pre_draft`; title is `Untitled`; description is empty; no tagline, video, public slug, website, or submitted timestamp exists.
Evidence: **Observed official state** in `evidence/test-results/devpost-project-baseline.md`; requirements in `evidence/test-results/devpost-official-baseline.md`.
Console or network evidence: Devpost project record returned the empty fields; no mutation was attempted.
Source-code evidence: `docs/DEVPOST_COPY.md`, `docs/DEMO_SCRIPT.md`, and `docs/SCREENSHOT_PLAN.md` are local plans only and cannot substitute for submission.
Root-cause hypothesis: Submission preparation remained in repository documents and was never transferred into a final entry.
Learner impact: None directly.
Judge impact: The project is not judgeable and receives no criterion credit.
Trust or integrity impact: Any claim of current submission readiness would be false.
Recommended correction: Populate every mandatory field, verify repository access and the public video, preview logged out, submit, then verify public slug and `submitted_at`.
Smallest acceptable fix: A valid submitted entry with Education category, description, live Judge URL, repository access, public sub-three-minute narrated video, Codex/GPT explanation, `/feedback` session ID, and required submitter fields.
Acceptance criteria: The official record is no longer pre-draft; all mandatory links work anonymously or are shared with required judges; video duration/audio comply; submission receipt is captured before the deadline.
Regression test: Reopen the public submission logged out and run the official requirement checklist immediately before the deadline.
Dependencies: Frozen release receipt, video, repository-sharing decision, feedback ID.
Estimated effort: S
Score leverage: very high
Related issues: CL-002, CL-006, CL-010

---

Issue ID: CL-002
Title: Public Worker 82 is healthy but not bound to an exact qualified source and Container release
Severity: P1 — First-prize blocker
Confidence: confirmed
Reproducibility: always
Category: reliability
Affected route or component: public Worker, hosted runner, release evidence, all authoritative journeys
Affected user: judges and learners relying on live authority
Affected Devpost criterion: Technological Implementation
Environment: Worker version `bef5edb7-6a76-4c72-94be-fcb2b94e668d`; deployment `dad4cd71-3dcd-4b00-a1b6-d16068d53c81`
Prerequisites: Public app and repository access
Reproduction steps: Read `/ready` and `/api/health`; inspect current release records for source commit, Container digest, and exact-version live/sample/replay/reconnect/download/no-secret/browser qualification.
Expected behaviour: One immutable receipt binds commit, assets, Worker, Container digest, schemas, migrations, smoke results, browser matrix, and evidence exports.
Actual behaviour: Health checks are green, but the public build exposes no source commit or Container digest and no exact-Worker-82 full journey qualification exists.
Evidence: **Observed live** health in `evidence/network/public-api-baseline.md`; **verified in documentation** release gap in `evidence/test-results/red-team.md` and `09_REPOSITORY_AND_TEST_AUDIT.md`.
Console or network evidence: `/ready` and `/api/health` return 200; readiness says configured/available, not completed end to end.
Source-code evidence: `scripts/production-smoke.sh`, `scripts/release-evidence.mjs`, deployment manifests, and older receipts demonstrate machinery but do not bind Worker 82.
Root-cause hypothesis: Deployment advanced without running or recording the complete source-bound release gate.
Learner impact: A transient or configuration-specific failure could appear only in the real journey.
Judge impact: The strongest architecture remains asserted rather than demonstrated on the exact public build.
Trust or integrity impact: Historical evidence could be mistaken for current production proof.
Recommended correction: Freeze a release tuple and run the complete public matrix against it.
Smallest acceptable fix: Commit/asset/Worker/Container receipt plus one genuine supported live run, sample, replay, SSE reconnect, patched-copy download, Capsule export, browser smoke, and secret scan, all linked to the same tuple.
Acceptance criteria: Every receipt names matching immutable identifiers; public UI exposes a build identifier; all required journeys pass twice from clean state; failures are retained rather than concealed.
Regression test: Source-bound production-smoke gate blocks release when any identifier or journey evidence differs.
Dependencies: Stable release candidate, credentials, supported fixture, non-destructive production test account/path.
Estimated effort: M
Score leverage: very high
Related issues: CL-001, CL-004, CL-007, CL-008

---

Issue ID: CL-003
Title: The plain-language question CTA leads to a notebook-required dead end
Severity: P1 — First-prize blocker
Confidence: confirmed
Reproducibility: always
Category: UX
Affected route or component: `/` question form to `/new`
Affected user: first-time learner without a prepared notebook
Affected Devpost criterion: Design
Environment: public Chromium 150 at desktop and mobile viewports
Prerequisites: Clean first visit
Reproduction steps: Enter “Does high accuracy mean the rare cases are being caught?” on `/`; submit; inspect destination.
Expected behaviour: The app routes the learner to a supported guided/sample path or clearly asks them to choose whether they have a notebook.
Actual behaviour: It navigates to `/new`, headed “Test my notebook,” even though the landing copy presents a notebook as optional.
Evidence: **Observed live** in `evidence/screenshots/red-team-plain-claim-destination.png` and `evidence/test-results/live-chrome-public-routes-20260719.json`; independently confirmed by red team.
Console or network evidence: No failed request and no write request; this is deterministic routing, not an outage.
Source-code evidence: `apps/web/src/App.tsx` routes plain prompt submission through the live notebook mode and then renders notebook setup.
Root-cause hypothesis: The chat-first shell was layered onto an artifact-first flow without a claim-only state transition.
Learner impact: Immediate abandonment or confusion before the scientific loop begins.
Judge impact: The primary CTA contradicts the product’s “Ask like chat” promise.
Trust or integrity impact: Support-boundary copy becomes misleading.
Recommended correction: Add an explicit claim-only handoff with two honest choices: run the fast sample/guided lesson or attach a supported notebook.
Smallest acceptable fix: After a plain claim, preserve the claim and show one dominant sample CTA plus a secondary upload CTA with one-sentence support boundary.
Acceptance criteria: A no-notebook learner reaches Prediction in at most two further actions; the question persists; no route calls a notebook optional and then requires it without explanation.
Regression test: Playwright clean-state test for claim-only landing at 390×844 and 1440×900.
Dependencies: Copy and routing only; no backend change required.
Estimated effort: S
Score leverage: very high
Related issues: CL-005, CL-014

---

Issue ID: CL-004
Title: Legacy replay adds an unlabeled local-practice completion over read-only evidence
Severity: P1 — First-prize blocker
Confidence: confirmed
Reproducibility: always
Category: verification
Affected route or component: `/replay/leakage-01`, Judge replay card, local replay state
Affected user: judges and learners inspecting proof
Affected Devpost criterion: Technological Implementation and Design
Environment: public Chromium 150, clean profile
Prerequisites: Open legacy replay and continue through revision, transfer, and repair
Reproduction steps: Load replay; enter/accept a revision; perform local transfer; proceed to repair; inspect banner and completion language.
Expected behaviour: Stored replay remains strictly read-only, or any browser-local practice branch is persistently labelled non-authoritative and separate.
Actual behaviour: With zero post-load network writes, the UI authors a local revision, scores transfer, marks repair complete, and shows Reasoning Diff while Judge copy says “Read-only stored events. No new experiment.”
Evidence: **Observed live** screenshots `evidence/screenshots/red-team-legacy-replay-after-continue.png` and `evidence/screenshots/red-team-legacy-replay-local-completion.png`; **verified in source** and red-team confirmed.
Console or network evidence: Zero post-load network requests during local completion; stored replay evidence was not mutated.
Source-code evidence: Replay branch and `counterlab.replayTransferState` handling in `apps/web/src/App.tsx`; read-only promise in `apps/web/src/features/judge/JudgeModeView.tsx`.
Root-cause hypothesis: Learner-practice UI was reused for legacy replay without a separate authority discriminant.
Learner impact: Learners cannot tell recorded proof from their local rehearsal.
Judge impact: A central epistemic-integrity promise appears internally inconsistent.
Trust or integrity impact: Local state can look verified even though it is not part of the stored run; no server corruption was found.
Recommended correction: Split read-only replay from practice, or label every local branch and suppress verified completion language/download authority.
Smallest acceptable fix: Persistent “Local practice — not recorded or verified” label, separate styling, no “verified/patched/completed proof” wording, and a reset that cannot affect stored evidence.
Acceptance criteria: Replay network remains GET-only; local choices never alter or impersonate recorded evidence; Capsule v2 replay remains exact; labels persist at every viewport and exported screenshot.
Regression test: Browser test asserts no non-GET, immutable replay hashes, persistent practice label, and absence of authoritative completion terms.
Dependencies: Mode/state contract and copy.
Estimated effort: M
Score leverage: very high
Related issues: CL-002, CL-013

---

Issue ID: CL-005
Title: The judge fast sample promises a complete loop but does not provide a real Boundary exploration
Severity: P1 — First-prize blocker
Confidence: high
Reproducibility: always
Category: pedagogy
Affected route or component: Judge sample CTA and non-live leakage sample Boundary stage
Affected user: time-constrained judge and sample learner
Affected Devpost criterion: Design and Quality of the Idea
Environment: public Judge/sample behavior plus current source
Prerequisites: Start the fast sample and reach Boundary
Reproduction steps: Click “Start the 2-minute sample”; complete prediction/result; inspect Explore/Boundary controls.
Expected behaviour: “Complete learning loop” includes one bounded control or fixed Boundary Map whose values come from authoritative computation.
Actual behaviour: The non-live leakage sample presents a static overlap explanation and says live recomputation is elsewhere; no actual bounded exploration occurs.
Evidence: **Verified in source** and independently confirmed in `evidence/test-results/red-team.md`; Judge promise is visible in public UI.
Console or network evidence: Not applicable; the missing interaction is deterministic.
Source-code evidence: `apps/web/src/features/judge/JudgeModeView.tsx` advertises the complete loop; non-live Boundary branches in `apps/web/src/App.tsx` render explanatory content.
Root-cause hypothesis: Judge copy advanced to the v5 thesis before the sample path acquired its Boundary Map.
Learner impact: The learner is told a boundary rather than discovering where the rule changes.
Judge impact: The fastest judging path omits one of the category-defining mechanisms.
Trust or integrity impact: “Complete” overstates demonstrated scope.
Recommended correction: Add one deterministic sample Boundary control/mini-map using bundled fixed-kernel evidence, or narrow the promise until it exists.
Smallest acceptable fix: A single allowlisted control with fixed precomputed/signed sample cells, accessible table, changed-condition explanation, and explicit sample label.
Acceptance criteria: Learner changes one bounded condition; result updates from fixed bundled evidence; the boundary insight is elicited before transfer; all values hash-bind to sample provenance.
Regression test: Component and browser tests validate control bounds, deterministic cells, accessible table, and no live/sample authority leakage.
Dependencies: Existing sample evidence and Boundary presentation.
Estimated effort: M
Score leverage: very high
Related issues: CL-003, CL-011

---

Issue ID: CL-006
Title: Potential-impact claims have no observed learner data
Severity: P1 — First-prize blocker
Confidence: confirmed
Reproducibility: always
Category: impact
Affected route or component: submission narrative, learner pilot, impact evidence
Affected user: judges assessing educational value and target learners
Affected Devpost criterion: Potential Impact
Environment: repository evidence at audit checkpoint
Prerequisites: Inspect learner study records
Reproduction steps: Open `docs/LEARNER_PILOT_RESULTS.json` and study protocol; compare claims with recorded participants, completions, transfer, timing, confusion, and retention.
Expected behaviour: Submission distinguishes measured behavior from targets and provides at least a small credible learner/usability dataset.
Actual behaviour: Status is `NO_DATA`; participants and completions are zero; metrics are null; the prepared protocol has no comparison arm.
Evidence: **Documented only/no measured evidence** in `docs/LEARNER_PILOT_RESULTS.json`; red-team confirmed.
Console or network evidence: None.
Source-code evidence: Software transfer tests and mutation scores exist but are not learner-impact evidence.
Root-cause hypothesis: Engineering validation was prioritized ahead of recruiting and observing learners.
Learner impact: Unknown completion, confusion, transfer, and retention performance.
Judge impact: Strongest likely objection under Potential Impact; architecture cannot compensate for absent outcomes.
Trust or integrity impact: Overclaiming learning effects would be unsupported; current `NO_DATA` honesty is a strength.
Recommended correction: Run a small consented paired/counterbalanced explanation-only versus CounterLab study; otherwise run usability-only sessions and keep learning-effect claims absent.
Smallest acceptable fix: Five to eight participants if feasible, reporting every count, first unassisted transfer attempt, time, completion, confusion/abandonment, qualitative reactions, and limitations; three-person usability-only evidence is the fallback.
Acceptance criteria: Raw de-identified records exist; protocol and analysis were fixed before results; all denominators and exclusions are visible; no mastery or retention claim exceeds data.
Regression test: Submission claim table maps each numeric/qualitative claim to a study record or labels it a target.
Dependencies: Participant recruitment, consent/privacy handling, stable release.
Estimated effort: M
Score leverage: very high
Related issues: CL-001, CL-009

---

Issue ID: CL-007
Title: No repository-visible inbound abuse or cost control protects expensive public routes
Severity: P1 — First-prize blocker
Confidence: high
Reproducibility: always
Category: security
Affected route or component: public artifact/session/GPT/compile/patch endpoints
Affected user: operators and legitimate learners
Affected Devpost criterion: Technological Implementation
Environment: current Worker source/config; Cloudflare account rules unverified
Prerequisites: Source inspection only; no load test
Reproduction steps: Trace public expensive routes and middleware; search config for caller quota, rate, challenge, or cost budget enforcement.
Expected behaviour: Server-side per-origin/session budgets and bounded concurrency reject abuse with typed retry guidance before model/runner cost.
Actual behaviour: Source exposes public expensive routes without repository-visible inbound rate middleware; only upstream 429 handling was found.
Evidence: **Verified in source**, production-account controls **unverified**; `08_AI_CODEX_VERIFICATION_SECURITY.md` and red-team matrix.
Console or network evidence: No abuse, load, quota-exhaustion, or denial-of-wallet test was attempted.
Source-code evidence: Route inventory in `apps/web/worker/api.ts` and deployment config lacks an in-repository caller budget.
Root-cause hypothesis: Bounded job execution was implemented, but admission/cost policy was left to an undocumented external layer.
Learner impact: Legitimate runs could be delayed or unavailable during abuse/quota exhaustion.
Judge impact: Production-readiness doubt on a public model/Container product.
Trust or integrity impact: Cost and availability boundary is not auditable from the release.
Recommended correction: Add a small in-repository admission limiter and document any Cloudflare account-level layer.
Smallest acceptable fix: Per-IP/session sliding budget for expensive starts, global concurrency cap, typed 429 with `Retry-After`, idempotency exemption, metrics, and judge-path allowance without bypassing safety.
Acceptance criteria: Bounded safe tests show allowed burst, enforced limit before downstream calls, recovery, no duplicate charge, and no effect on GET/replay paths.
Regression test: Worker tests for budget windows, forwarded-address trust policy, concurrency, idempotent retries, and upstream 429 mapping.
Dependencies: Durable state/rate primitive and deployment configuration.
Estimated effort: M
Score leverage: high
Related issues: CL-002, CL-017

---

Issue ID: CL-008
Title: Hosted Codex read isolation is described more strongly than the OS boundary enforces
Severity: P1 — First-prize blocker
Confidence: high
Reproducibility: always
Category: AI usage
Affected route or component: hosted runner launch boundary, App Server client, architecture claims
Affected user: judges evaluating generated-versus-fixed authority
Affected Devpost criterion: Technological Implementation
Environment: current source and final runner image definition; Worker 82 exact Container source unbound
Prerequisites: Inspect hosted launch boundary and image permissions
Reproduction steps: Trace UID/GID, credential staging, mount/chroot/user namespace, read allowlist, image paths, and capability assertions.
Expected behaviour: If documentation claims Codex cannot see hidden source/verifiers, OS isolation makes those paths absent/unreadable and proves it in the production image.
Actual behaviour: Credentials are staged/revoked and privileges dropped, but there is no mount namespace, chroot, or read allowlist; `/app/runner.mjs` and runtime files are world-readable. Structured output still fails closed.
Evidence: **Verified in source** in `services/hosted-runner/src/launch-boundary.ts`, `packages/codex-client/src/app-server.ts`, and `Dockerfile.runner`; independently confirmed. No read/exfiltration exploit was attempted or found.
Console or network evidence: No live Codex request or hidden-file probe ran in production.
Source-code evidence: Launch boundary applies `setpriv`/`no-new-privs` and path checks but no filesystem namespace; client treats the boundary as satisfying generation read isolation.
Root-cause hypothesis: Credential/privilege isolation was conflated with filesystem unreadability.
Learner impact: Fixed verification still prevents generated output from becoming authority, but the architectural explanation is less clean than claimed.
Judge impact: A sophisticated technical judge can invalidate a headline security claim.
Trust or integrity impact: Claim gap, not demonstrated leakage or unverified-result release.
Recommended correction: Immediately label the property partial; then isolate the generator with a minimal read-only runtime/workspace view and black-box probes.
Smallest acceptable fix: Replace “OS-enforced hidden-source isolation” with “credential-and-privilege boundary; filesystem read isolation partial” in all public evidence and health receipts.
Acceptance criteria: Claims match enforcement; prize-quality completion additionally proves `/app`, verifier, fixtures, repository, unrelated jobs, and credentials absent while allowed runtime/workspace works.
Regression test: Production-image black-box test attempts every forbidden read and allowed generation operation, retaining exact digest-bound output.
Dependencies: Release qualification; full isolation may require image/runner architecture work.
Estimated effort: XS for honest claim; L for full isolation
Score leverage: high
Related issues: CL-002, CL-010

---

Issue ID: CL-009
Title: Two adjacent ML packs do not yet prove a reusable scientific-debugger category
Severity: P1 — First-prize blocker
Confidence: medium
Reproducibility: always
Category: novelty
Affected route or component: supported Subject Packs, Judge narrative, submission positioning
Affected user: judges comparing category breadth
Affected Devpost criterion: Quality of the Idea
Environment: public app and current repository
Prerequisites: Inspect available sample/live packs
Reproduction steps: Inventory shipped and publicly reachable verified packs.
Expected behaviour: The product either proves its reusable abstraction across domains or makes a deliberately narrow ML-learning claim.
Actual behaviour: Only entity leakage and class imbalance—two adjacent notebook/ML evaluation misconceptions—are released; guided physics is not public.
Evidence: **Observed/documented scope** in README, Judge copy, route inventory, and `11_NOVELTY_AND_COMPETITIVE_GAPS.md`.
Console or network evidence: No hidden public physics route was discovered.
Source-code evidence: Registered Subject Pack and route inventories contain the two ML packs.
Root-cause hypothesis: Scientific-engine generalization remains planned behind core release gates.
Learner impact: Current usefulness is limited to a narrow but real learner population.
Judge impact: The “new category” may look like a polished two-lesson notebook debugger.
Trust or integrity impact: Broad STEM/system claims would exceed evidence.
Recommended correction: First qualify the core. If time remains, ship exactly one fully verified cross-domain guided pack; otherwise narrow positioning and show pack interfaces/tests as extensibility evidence.
Smallest acceptable fix: Honest “two ML misconceptions” scope plus one clear reusable-pack architecture diagram and no all-STEM claim.
Acceptance criteria: Submission names exactly what is supported; any cross-domain addition passes full kernel/oracle/unit/boundary/transfer/mutation/Capsule/release gates.
Regression test: Public capability manifest and submission claim test fail on unregistered/unqualified pack claims.
Dependencies: CL-002 must be green before optional physics work.
Estimated effort: XS for narrowing; XL for a prize-quality third pack
Score leverage: high
Related issues: CL-005, CL-006, CL-010

---

Issue ID: CL-010
Title: Public metadata and prepared Devpost copy use stale category and legacy authority vocabulary
Severity: P1 — First-prize blocker
Confidence: high
Reproducibility: always
Category: documentation
Affected route or component: public document title, `docs/DEVPOST_COPY.md`, demo/submission narrative
Affected user: submission-only judges
Affected Devpost criterion: Quality of the Idea and Technological Implementation
Environment: repository at source checkpoint; actual Devpost remains empty
Prerequisites: Compare submission draft with current README, Judge Mode, and contracts
Reproduction steps: Open `/` or `/judge` and inspect the document title; read the opening/category and artifact names in `docs/DEVPOST_COPY.md`; compare with current product vocabulary.
Expected behaviour: App, README, video, screenshots, and submission use one accurate product thesis and authority map.
Actual behaviour: The live document title is “CounterLab — CI for understanding”; the draft leads with the same weaker category and legacy Belief Test, Experiment Plan, and Proof Bundle terms rather than scientific debugger, Belief Spec, Discrimination Contract/IR, and Proof Capsule.
Evidence: **Observed live** in `evidence/test-results/final-public-recheck.json` and **verified in documentation**; red-team confirmed the draft drift. The Devpost draft itself is not published because CL-001 remains open.
Console or network evidence: Final public recheck returned the stale document title on both `/` and `/judge` with no route error.
Source-code evidence: Current vocabulary and authority contracts appear in `AGENTS.md`, `README.md`, shared contracts, and Judge UI.
Root-cause hypothesis: Submission draft predates the current scientific-engine/product constitution.
Learner impact: None directly.
Judge impact: Makes the product sound developer-centric, in flux, and less novel; hides tri-state evidence, Boundary, transfer gate, and four-authority split.
Trust or integrity impact: Could create contradictions with the public build/video.
Recommended correction: Rewrite one canonical submission narrative from the frozen release and derive video/screenshots/judge instructions from it.
Smallest acceptable fix: Public document metadata and submission title “CounterLab — A scientific debugger for beliefs,” current six-step vocabulary, two-pack boundary, exact AI/fixed authority roles, impact `NO_DATA` or measured data, and release receipt.
Acceptance criteria: Browser title/metadata, claim-by-claim consistency table, Devpost, README, video, and screenshots have no unsupported or legacy term; every major claim has a live timestamp, source/test evidence, or explicit limitation.
Regression test: Manual submission preflight comparing public copy, README opening, video captions, and exact build manifest.
Dependencies: CL-001, CL-002, final impact evidence.
Estimated effort: S
Score leverage: high
Related issues: CL-001, CL-008, CL-009

---

Issue ID: CL-011
Title: The sample reflection begins with the complete correct rule and already passes its gate
Severity: P2 — Material quality issue
Confidence: confirmed
Reproducibility: always
Category: pedagogy
Affected route or component: sample revision/reflection stage
Affected user: learner using the fastest lesson
Affected Devpost criterion: Design and Potential Impact
Environment: public sample source/current UI
Prerequisites: Reach reflection after result
Reproduction steps: Inspect initial reflection text and continuation condition.
Expected behaviour: Learner must interpret the evidence in their own words or make a meaningful explicit choice.
Actual behaviour: The full correct leakage rule is prefilled and exceeds the 20-character progression gate.
Evidence: **Verified in source** and red-team confirmed; `apps/web/src/App.tsx` default reflection and length gate.
Console or network evidence: None.
Source-code evidence: `defaultLeakageReflection` initializes the editor; gate tests length rather than learner action/meaning.
Root-cause hypothesis: Helpful scaffolding became an answer key and a mechanical gate.
Learner impact: Correction can be mistaken for understanding; the learner can click through.
Judge impact: Weakens the pedagogical claim of active rule revision.
Trust or integrity impact: Completion implies more agency than occurred.
Recommended correction: Start blank or with selectable sentence stems and require one explicit evidence-linked change.
Smallest acceptable fix: Remove the full answer; require one learner selection/edit and show supportive feedback without shaming.
Acceptance criteria: Untouched default cannot advance; a valid short learner choice can; wrong/uncertain answers receive useful feedback without revealing all reasoning immediately.
Regression test: UI tests for untouched, blank, short, wrong, and valid reflection states.
Dependencies: Copy and validation only.
Estimated effort: S
Score leverage: medium
Related issues: CL-005

---

Issue ID: CL-012
Title: Command-palette focus escapes the dialog and is not restored to its invoker
Severity: P2 — Material quality issue
Confidence: high
Reproducibility: always
Category: accessibility
Affected route or component: global command palette/modal
Affected user: keyboard and screen-reader users
Affected Devpost criterion: Design
Environment: Chromium keyboard audit at public desktop viewport
Prerequisites: Keyboard-only navigation
Reproduction steps: Open the command palette; tab beyond its controls; press Escape; inspect active element.
Expected behaviour: Focus is contained while open and returns to the invoking control when closed.
Actual behaviour: Focus can escape the dialog; Escape leaves focus on the document body.
Evidence: **Observed live/manual** in `evidence/test-results/ux-browser-runtime/keyboard-and-interaction-audit.json` and `06_DESIGN_ACCESSIBILITY_RESPONSIVENESS.md`.
Console or network evidence: No errors; behavioral accessibility defect.
Source-code evidence: Dialog focus management lacks a complete trap/restoration path.
Root-cause hypothesis: Visual modal behavior was implemented without a tested focus lifecycle.
Learner impact: Keyboard users can lose context or interact behind the overlay.
Judge impact: Noticeable consumer-product/accessibility incompleteness.
Trust or integrity impact: None.
Recommended correction: Implement standards-based initial focus, tab containment, Escape close, and invoker restoration.
Smallest acceptable fix: One focus-trap utility or native dialog behavior plus stored invoker reference.
Acceptance criteria: Tab/Shift+Tab cycle only inside; Escape closes; focus returns to invoker; screen-reader name/description remains correct.
Regression test: Playwright keyboard assertions for open, wrap, close, and restoration.
Dependencies: None.
Estimated effort: S
Score leverage: medium
Related issues: CL-014

---

Issue ID: CL-013
Title: Legacy replay contains multiple below-threshold text contrast pairs
Severity: P2 — Material quality issue
Confidence: confirmed
Reproducibility: always
Category: accessibility
Affected route or component: `/replay/leakage-01` labels and secondary text
Affected user: low-vision learners and judges
Affected Devpost criterion: Design
Environment: public Chromium; computed color audit
Prerequisites: Open legacy replay
Reproduction steps: Measure affected text/background pairs in replay.
Expected behaviour: Normal text meets WCAG AA 4.5:1; large text meets 3:1.
Actual behaviour: Recorded pairs include 3.59:1, 3.71:1, 4.17:1, and 4.32:1 for normal text.
Evidence: **Observed live/automated then manually inspected** in `06_DESIGN_ACCESSIBILITY_RESPONSIVENESS.md` and UX audit JSON.
Console or network evidence: None.
Source-code evidence: Legacy replay color tokens/components use muted foregrounds on tinted surfaces.
Root-cause hypothesis: New theme tokens did not fully cover legacy replay surfaces.
Learner impact: Reduced legibility and fatigue.
Judge impact: Visible polish/accessibility deduction in the longest replay path.
Trust or integrity impact: None.
Recommended correction: Adjust only the affected semantic tokens and verify all states.
Smallest acceptable fix: Raise each failing normal-text pair to at least 4.5:1 without flattening authority/status hierarchy.
Acceptance criteria: Computed audit passes AA in light/dark/status states; manual screenshots retain hierarchy.
Regression test: Token contrast unit checks plus browser computed-style scan.
Dependencies: Theme/token owners.
Estimated effort: XS
Score leverage: medium
Related issues: CL-004

---

Issue ID: CL-014
Title: Mobile first view hides alternate modes behind a generic Explore control
Severity: P2 — Material quality issue
Confidence: confirmed
Reproducibility: always
Category: UX
Affected route or component: landing navigation at 375×812 and 390×844
Affected user: mobile learner and mobile judge
Affected Devpost criterion: Design
Environment: public Chromium at representative phone viewports
Prerequisites: Clean landing
Reproduction steps: Load `/` at 375×812; inventory visible primary/secondary paths before opening Explore.
Expected behaviour: Sample, replay, and live/guided choices are discoverable with honest mode labels and one dominant CTA.
Actual behaviour: Alternate modes are compressed behind “Explore,” weakening mode discoverability and the no-notebook escape from CL-003.
Evidence: **Observed live** screenshots/DOM inventory in `evidence/test-results/ux-browser-runtime/viewport-and-dom-audit.json`.
Console or network evidence: None; no horizontal overflow was found.
Source-code evidence: Responsive navigation collapses mode choices at mobile breakpoint.
Root-cause hypothesis: Header simplification removed decision context rather than reprioritizing it.
Learner impact: More hunting and uncertainty about sample/replay/live availability.
Judge impact: First-minute product comprehension is weaker on mobile.
Trust or integrity impact: Mode authority labels arrive later than the choice.
Recommended correction: Keep one compact secondary “Try a sample” action visible and rename Explore to communicate modes.
Smallest acceptable fix: Visible sample link plus “Modes” control with sample/replay/live labels and status.
Acceptance criteria: At 375×812 the user can identify primary action, sample, and mode status without opening more than one disclosure; no overflow/tiny targets.
Regression test: Mobile screenshot and accessible-name assertions at 375×812 and 390×844.
Dependencies: CL-003 copy/routing decision.
Estimated effort: S
Score leverage: medium
Related issues: CL-003, CL-012

---

Issue ID: CL-015
Title: Missing and unknown deep links recover silently, while previous-session recovery is hidden
Severity: P2 — Material quality issue
Confidence: high
Reproducibility: always
Category: UX
Affected route or component: missing session/proof routes, unknown routes, landing resume discovery
Affected user: returning learner or judge following a stale link
Affected Devpost criterion: Design
Environment: public clean and returning browser states
Prerequisites: Load nonexistent session/proof and an unknown route; inspect landing
Reproduction steps: Direct-load each invalid route; observe document/API statuses and recovery guidance; return to landing with stored session history.
Expected behaviour: Durable not-found/recovery page explains the state, offers safe next steps, and exposes recent resumable work on landing.
Actual behaviour: Missing session/proof renders shell 200 plus API 404 and a transient toast over landing; unknown routes silently show landing; recent sessions are only inside an in-session drawer.
Evidence: **Observed live** in route JSON/screenshots and **verified in source**; `02_LIVE_ROUTE_AND_STATE_MAP.md`.
Console or network evidence: Expected 404 resource errors appear for deliberate missing session/proof; unknown route has no distinct HTTP/document state.
Source-code evidence: Client fallback routes converge on landing and resume affordance is scoped to active-session UI.
Root-cause hypothesis: SPA recovery optimized for continuity but erased route-specific explanation.
Learner impact: Lost confidence and difficulty resuming proof.
Judge impact: Deep links in submission/demo can fail opaquely.
Trust or integrity impact: A missing proof should never look like a generic fresh start.
Recommended correction: Add explicit 404/session-unavailable/proof-unavailable states and a landing “Recent work” surface.
Smallest acceptable fix: Persistent inline recovery card naming the failed resource, retry/back/home actions, and up to three local recent sessions with mode/status.
Acceptance criteria: Each bad deep link is distinguishable; no false proof content appears; browser back/forward is stable; resume clears stale entries gracefully.
Regression test: Playwright tests for missing session/proof/unknown, refresh, back-forward, and recent-session resume.
Dependencies: Routing and local-session index.
Estimated effort: S
Score leverage: medium
Related issues: CL-016

---

Issue ID: CL-016
Title: “Start over” can abandon an active backend job without invoking cancellation
Severity: P2 — Material quality issue
Confidence: high
Reproducibility: always
Category: reliability
Affected route or component: active journey reset/start-over action and hosted job lifecycle
Affected user: learner restarting during compile/run
Affected Devpost criterion: Technological Implementation and Design
Environment: current frontend/backend source; live cancellation not invoked in audit
Prerequisites: Active job/session
Reproduction steps: Trace Start over handler while a checkpoint references an active job; compare with cancel endpoint.
Expected behaviour: User receives a clear choice and active work is cancelled/idempotently detached before local state is cleared.
Actual behaviour: The reset clears the active checkpoint without calling the available cancel endpoint.
Evidence: **Verified in source** and journey audit; runtime production effect **unverified** because no state-changing job was created.
Console or network evidence: No production reset test was performed.
Source-code evidence: Frontend reset path and Worker cancellation route are not connected.
Root-cause hypothesis: Reset was treated as local navigation rather than a distributed lifecycle transition.
Learner impact: Orphaned work, confusing later events, or needless wait/cost.
Judge impact: Refresh/recovery story feels incomplete.
Trust or integrity impact: Late results must not bind to a new journey after reset.
Recommended correction: Confirm reset during active work, send idempotent cancel, wait for terminal acknowledgement or safely detach lineage, then clear.
Smallest acceptable fix: Best-effort cancel with typed timeout and lineage invalidation so late callbacks cannot advance cleared state.
Acceptance criteria: Start over produces one cancel; duplicate reset is safe; late events are ignored; UI explains outcome; no new session inherits old authority.
Regression test: Worker/UI integration test for cancel success, timeout, already-terminal, duplicate, offline, and late callback.
Dependencies: Existing cancellation API and state lineage.
Estimated effort: M
Score leverage: medium
Related issues: CL-002, CL-015

---

Issue ID: CL-017
Title: Multipart intake can buffer an absent-length upload before enforcing notebook size
Severity: P2 — Material quality issue
Confidence: high
Reproducibility: always
Category: security
Affected route or component: notebook upload parser
Affected user: operators and concurrent learners
Affected Devpost criterion: Technological Implementation
Environment: Worker source; no oversized production request attempted
Prerequisites: Multipart request without trustworthy `Content-Length`
Reproduction steps: Trace request parsing order from headers through `formData()` to `file.size` validation.
Expected behaviour: Streaming or bounded-body enforcement rejects oversized input before buffering it.
Actual behaviour: When content length is absent, `formData()` may buffer the body before the file-size check.
Evidence: **Verified in source** in Worker intake and reported in `08_AI_CODEX_VERIFICATION_SECURITY.md`; exploitability/edge behavior is **inferred**, not load-tested.
Console or network evidence: No denial-of-service or oversized upload was sent.
Source-code evidence: Size validation follows multipart materialization.
Root-cause hypothesis: Logical artifact-size validation was implemented without transport-level body bounds.
Learner impact: Potential memory pressure or rejected legitimate work during abuse.
Judge impact: Production-hardening concern, secondary to core journey proof.
Trust or integrity impact: No evidence-authority bypass.
Recommended correction: Enforce a trusted edge/body cap and bounded streaming parser before materialization.
Smallest acceptable fix: Reject absent/oversized lengths at edge where possible and impose a hard request-body limit with typed 413.
Acceptance criteria: Safe tests show oversized declared and chunked/unknown-length requests terminate before full buffering; valid maximum succeeds.
Regression test: Worker integration tests for exact max, max+1, absent length, wrong MIME, early disconnect, and multipart overhead.
Dependencies: Cloudflare request-body semantics and test harness.
Estimated effort: M
Score leverage: medium
Related issues: CL-007

---

Issue ID: CL-018
Title: Outbound artifact sanitization is heuristic and does not enforce declared privacy classes
Severity: P2 — Material quality issue
Confidence: high
Reproducibility: always
Category: security
Affected route or component: approved GPT-5.6 packet preview and notebook evidence extraction
Affected user: learner uploading a notebook with personal identifiers
Affected Devpost criterion: Technological Implementation and Potential Impact
Environment: current source/tests; no private data used
Prerequisites: Supported notebook containing common PII-like text/fields
Reproduction steps: Inspect sanitizer patterns and `privacyClass` handling; construct synthetic email/phone/identifier examples in local tests.
Expected behaviour: Product accurately states limits, suppresses declared sensitive fields, and makes disclosure explicit.
Actual behaviour: Common secrets/absolute paths are handled, but PII coverage is heuristic; `privacyClass` metadata does not itself suppress data. Up to 12 excerpts and schema fields may be previewed.
Evidence: **Verified in source**; production disclosure outcomes **unverified**. `08_AI_CODEX_VERIFICATION_SECURITY.md`.
Console or network evidence: No model request containing private data was made.
Source-code evidence: Packet builder/sanitizer recognizes selected patterns but is not a complete PII classifier.
Root-cause hypothesis: Security-secret redaction and privacy classification were treated as the same boundary.
Learner impact: A learner may approve more identifying context than expected.
Judge impact: Education privacy expectations are under-explained.
Trust or integrity impact: “Sanitized” must not imply guaranteed de-identification.
Recommended correction: Enforce sensitive privacy classes, add common identifier detection, minimize excerpts, and show a plain-language disclosure warning.
Smallest acceptable fix: Block declared-sensitive fields and email/phone/common ID patterns from the outbound packet unless an explicit per-field override is made.
Acceptance criteria: Synthetic PII fixtures are omitted/redacted; preview shows exactly what leaves; raw rows/paths/secrets remain absent; limitations are documented.
Regression test: Table-driven sanitizer tests for secrets, emails, phones, IDs, false positives, Unicode, and privacy-class suppression.
Dependencies: Evidence schema and copy.
Estimated effort: M
Score leverage: medium
Related issues: CL-019

---

Issue ID: CL-019
Title: Opaque session URLs act as bearer capabilities without clear sharing, retention, or revocation guidance
Severity: P2 — Material quality issue
Confidence: high
Reproducibility: always
Category: security
Affected route or component: session/proof URLs, stored evidence access, privacy copy
Affected user: learner sharing or revisiting a session URL
Affected Devpost criterion: Technological Implementation and Potential Impact
Environment: current route/access design; no cross-session probing performed
Prerequisites: Possession of an opaque session/proof URL
Reproduction steps: Inspect route authentication/capability model and user-facing sharing/retention/revocation language.
Expected behaviour: Users understand that the URL grants access, how long data remains, how to revoke/delete it, and what a shared proof contains.
Actual behaviour: UUID-like URLs are the practical bearer capability; explicit warnings and a revocation/retention surface were not found.
Evidence: **Verified in source/documentation**; predictability or unauthorized access **not tested/unverified**. `08_AI_CODEX_VERIFICATION_SECURITY.md`.
Console or network evidence: No enumeration, cross-session access, or private-data test was attempted.
Source-code evidence: Public resource routes rely on opaque IDs; no account layer is intended for current scope.
Root-cause hypothesis: No-account judgeability was prioritized without completing capability-URL UX.
Learner impact: Accidental link sharing can expose evidence/capsule metadata beyond expectations.
Judge impact: Privacy/data-handling story is incomplete.
Trust or integrity impact: Confidentiality depends on link secrecy; this must be explicit.
Recommended correction: Add capability-link warning, concise retention policy, redacted share preview, and bounded revocation/deletion where feasible.
Smallest acceptable fix: Persistent “Anyone with this link can view” notice before copy/export, content summary, expiry/retention statement, and support/contact path for revocation.
Acceptance criteria: Warning precedes sharing; Capsule omits raw secrets/rows; documentation matches actual retention; invalid/revoked IDs fail closed.
Regression test: UI/access tests for copy warning, expiry/revocation state, invalid ID, and proof redaction.
Dependencies: Data-retention decision and possibly storage lifecycle.
Estimated effort: S for disclosure; M for revocation
Score leverage: medium
Related issues: CL-015, CL-018

---

Issue ID: CL-020
Title: Hashed static assets are forced to revalidate and the main JavaScript chunk remains large
Severity: P2 — Material quality issue
Confidence: confirmed
Reproducibility: always
Category: performance
Affected route or component: initial app shell and repeat navigation
Affected user: mobile/poor-network learner and returning judge
Affected Devpost criterion: Design
Environment: public Chromium cold/warm and throttled measurements
Prerequisites: Load landing/Judge/replay cold then warm
Reproduction steps: Capture response caching and transfer/decoded sizes; compare cold/warm navigation.
Expected behaviour: Content-hashed immutable assets receive long cache lifetime and noncritical route code loads on demand.
Actual behaviour: Hashed JS/CSS use `max-age=0, must-revalidate`; warm transfer largely repeats. Initial transfer is about 296.6 KiB, decoded about 868.5 KiB; main JS is about 169.7 KiB transferred/598.9 KiB decoded.
Evidence: **Observed live/measured** in `evidence/performance/ux/live-performance-measurements.json` and `07_BACKEND_RELIABILITY_PERFORMANCE.md`.
Console or network evidence: Landing cold median TTFB 134.9 ms and LCP 1.080 s; throttled LCP 1.856 s. Performance is currently good, so this is production polish, not an outage.
Source-code evidence: Asset delivery cache headers and a broad client bundle expose the optimization opportunity.
Root-cause hypothesis: Conservative global caching policy overrides content-hash semantics; route surfaces share one bundle.
Learner impact: Extra repeat bytes and less resilience on poor networks.
Judge impact: Small responsiveness deduction; current first paint is already strong.
Trust or integrity impact: None.
Recommended correction: Cache hashed assets immutable and split only clearly cold route-heavy panels.
Smallest acceptable fix: `public, max-age=31536000, immutable` for fingerprinted assets while keeping HTML no-cache; verify one conservative route split if low risk.
Acceptance criteria: Warm load transfers no unchanged hashed body; HTML updates immediately; LCP/CLS do not regress; replay long tasks do not increase.
Regression test: Header integration test and repeat-load performance budget.
Dependencies: Worker/static asset header configuration.
Estimated effort: XS for caching; M for code splitting
Score leverage: medium
Related issues: CL-002

---

Issue ID: CL-021
Title: Core Worker and UI modules are highly concentrated and no hosted CI gate is visible
Severity: P2 — Material quality issue
Confidence: high
Reproducibility: always
Category: reliability
Affected route or component: `apps/web/worker/api.ts`, `apps/web/src/App.tsx`, test/release workflow
Affected user: maintainers making deadline-critical corrections
Affected Devpost criterion: Technological Implementation
Environment: repository structure and current automation
Prerequisites: Inspect source sizes and CI configuration
Reproduction steps: Measure core module concentration; inventory hosted CI workflows and release gates.
Expected behaviour: Critical boundaries have focused modules and every submitted commit is automatically type/test/build/release-evidence checked.
Actual behaviour: Worker API is roughly 8,700 lines/299 KB and App roughly 152 KB; no hosted CI workflow was found, despite strong local scripts.
Evidence: **Verified in repository** and `09_REPOSITORY_AND_TEST_AUDIT.md`.
Console or network evidence: None.
Source-code evidence: Large modules combine many route/state responsibilities; local test/release scripts are extensive.
Root-cause hypothesis: Hackathon velocity concentrated integration code while automated local checks outpaced hosted automation.
Learner impact: Indirect regression risk during rushed fixes.
Judge impact: Maintainability is not primary, but an accidental late regression damages all criteria.
Trust or integrity impact: Manual release claims are easier to drift without a pinned gate.
Recommended correction: Add minimal CI now; defer broad refactoring until after submission.
Smallest acceptable fix: One pinned workflow running type checks, focused authority/Worker/UI tests, build, secret scan, and artifact validation on the exact submitted commit.
Acceptance criteria: Clean checkout passes; failing test/type/secret blocks; generated evidence is deterministic; current dirty work is not swept into refactors.
Regression test: CI negative-control branch/fixture demonstrates each required gate fails correctly.
Dependencies: Repository hosting/access and stable commands.
Estimated effort: S for CI; XL for safe decomposition
Score leverage: medium
Related issues: CL-002

---

Issue ID: CL-022
Title: Static HTML responses omit common browser defense-in-depth headers
Severity: P3 — Minor polish issue
Confidence: confirmed
Reproducibility: always
Category: security
Affected route or component: `/`, `/judge`, and SPA document responses
Affected user: all browser users
Affected Devpost criterion: Technological Implementation
Environment: public HEAD/GET responses
Prerequisites: None
Reproduction steps: Inspect response headers for static document routes and compare with `/api/*`.
Expected behaviour: Document responses define CSP/frame/referrer/nosniff/Permissions Policy and transport policy appropriate to deployment.
Actual behaviour: Static HTML lacks CSP, frame denial, referrer policy, nosniff, Permissions Policy, and HSTS; API responses are more restrictive.
Evidence: **Observed live** in `evidence/network/public-api-baseline.md`; no unsafe sink/exploit was established.
Console or network evidence: Header capture only; no injection or clickjacking exploit was attempted.
Source-code evidence: API header helpers do not cover static asset/document delivery.
Root-cause hypothesis: Security headers were applied in API code but not at the static delivery boundary.
Learner impact: Defense-in-depth is weaker than necessary.
Judge impact: Low unless specifically inspected.
Trust or integrity impact: No demonstrated authority bypass; future injection impact could be larger without CSP/frame controls.
Recommended correction: Add tested static response headers with a CSP compatible with current assets.
Smallest acceptable fix: `nosniff`, strict referrer policy, frame denial/frame-ancestors, Permissions Policy, and a report-free enforced CSP after staging verification; configure HSTS at the correct edge scope.
Acceptance criteria: All document routes carry headers; app/Judge/replay render normally; inline/script/style/font/connect sources are narrowly allowed; no duplicate contradictory policy.
Regression test: Public-header smoke test on `/`, `/judge`, `/new`, replay, and missing routes.
Dependencies: Static asset/Worker routing ownership.
Estimated effort: S
Score leverage: low
Related issues: CL-002

## Integrity notes

- The live public app was available and healthy during safe GET-only checks.
- No evidence showed server-side replay mutation, a successful hidden-source read, secret leakage, denial of service, or current occurrence of a historical tuple-schema failure.
- Full public sample/live state-changing journeys were outside this read-only audit; they remain unverified, not failed.
- A transient font-token defect seen during concurrent work was corrected before the audit checkpoint and is intentionally excluded.
