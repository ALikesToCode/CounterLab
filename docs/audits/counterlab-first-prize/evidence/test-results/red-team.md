# Independent red-team review

Audit role: Agent 13, independent challenge and P0/P1 validation.

## Method and evidence boundary

I completed the source and public-route pass before reading the three specialist draft reports. The independent browser pass used Chromium 150.0.7871.128 through Playwright 1.61.1 after the owner explicitly authorized Chrome. Every non-GET request was intercepted and blocked; the executed landing, Judge, setup, plain-question, and legacy-replay checks attempted no write. No production session, artifact, job, model call, patch, download, or database/object-storage mutation was created.

The source checkout was moving concurrently. At the source checkpoint (`2026-07-18T19:30:22Z`), HEAD was `f9ca9bce2bb88921614d3e7ee6d195ba0c099c70`, with substantial pre-existing/unrelated uncommitted UI, lockfile, SBOM, and scientific-engine changes. Before handoff, HEAD advanced again to `087f3cfd282cd185cabbdbbefea3546b8d87db66` (`2026-07-18T19:35:14Z`) as the concurrent UI work was committed. The relevant `App.tsx` content remained hash `bc7a8e4e15175717b64eb2671a20a998ff0e5427`, and the Judge, Worker API, launch-boundary, README, and Devpost-draft hashes were unchanged. Public behavior belongs to Worker version 82 (`bef5edb7-6a76-4c72-94be-fcb2b94e668d`), whose source commit was not exposed.

Independent public observations:

- `/`, `/judge`, `/new`, and `/replay/leakage-01` returned 200 and rendered without console errors, failed requests, or error responses.
- Judge Mode's first fold is excellent: the thesis, 98.5% versus 59.4% comparison, changed evaluation unit, primary sample CTA, and replay CTA are immediately understandable.
- Submitting the plain prompt `Does high accuracy mean the rare cases are being caught?` navigated to `/new`, headed `Test my notebook`, without any write request.
- The legacy replay advanced through a locally recorded revision, locally passed transfer, and locally marked patch/completion state with zero post-load network requests. It rendered `You can now distinguish`, `Passed`, repair preview, and Reasoning Diff under the persistent replay banner.

## Critical-finding confirmation matrix

| Candidate | Red-team result | Adjusted severity | Confidence | Evidence boundary |
| --- | --- | --- | --- | --- |
| Devpost is an empty pre-draft | **Confirmed.** Project 1330312 is `Untitled`, `submission_pre_draft`, with empty description and no tagline, video, URL, slug, publication, or submission timestamp. | **P0** | Confirmed | Official Devpost connector baseline; administrative blocker, not product-code defect. |
| Current public release is unqualified | **Confirmed as an evidence/provenance gap.** Worker 82 is healthy and renders; no source commit/image tuple or exact-version sample/live/replay/patch/proof smoke was found. Historical Worker 7c67 evidence cannot qualify Worker 82. | **P1** | Confirmed | Do not restate this as public outage or current live failure. Readiness/configured responses are not journey proof. |
| Plain-claim CTA is a notebook dead end | **Confirmed live and in source.** The optional-notebook landing submits to `chooseMode("live")` (`App.tsx:4345-4348`), then displays notebook setup (`3211-3240`). | **P1** | Confirmed | Observed public behavior; screenshot `red-team-plain-claim-destination.png`. |
| Legacy replay is mutable despite read-only copy | **Confirmed, with narrower wording.** Stored evidence is not mutated and no model/experiment/write runs. The defect is an unlabeled browser-local practice overlay that authors revision, scores transfer, and marks repair complete (`2141-2183`, `2250-2304`) while Judge says `Read-only stored events` (`JudgeModeView.tsx:208-220`). | **P1** | Confirmed | Integrity/copy contradiction, not database corruption. Screenshots `red-team-legacy-replay-after-continue.png` and `red-team-legacy-replay-local-completion.png`. |
| No measured learner impact | **Confirmed.** `LEARNER_PILOT_RESULTS.json` is `NO_DATA`, participant and completion counts are zero, and metrics are null. The prepared protocol explicitly has no comparison arm. | **P1** | Confirmed | Software mutation/transfer results are not learner evidence. CounterLab is honest about this; the issue is first-prize evidence strength. |
| No inbound abuse/rate control | **Confirmed as a repository-visible risk.** Public artifact/session/GPT/compile/patch routes have no caller authentication or rate middleware; source/config search found only upstream-429 handling. | **P1** | High | No load/exploit was attempted. Cloudflare account-level WAF/rate rules were not visible, so final wording must say `no repository-visible control`, not `production definitely has none`. |
| Codex OS read isolation is overstated | **Confirmed in current source, deployment reach unverified.** `ContainerCodexLaunchBoundary` stages/revokes auth, constrains paths, applies `setpriv` and `--no-new-privs`, but creates no mount namespace/chroot/read allowlist (`launch-boundary.ts:79-207`). The image makes `/app/runner.mjs` and installed runtime readable (`Dockerfile.runner:79-100`). Structured turns are read-only/no-network, tell the model not to use tools, and reject command/file events (`app-server.ts:1370-1427`), so no unverified result or exfiltration is proven. | **P1** | High | This is a claim/invariant gap with a strong fail-closed compensating control. Public Worker 82's exact Container source is unbound. |
| Only two adjacent ML Subject Packs | **Fact confirmed; severity is judging-dependent.** README and Judge copy explicitly limit release to entity leakage and class imbalance. | **P1 for first-prize differentiation; not a functional P1** | Medium | It weakens proof that `scientific debugger for beliefs` is cross-domain. Do not build physics before the exact core release is green; accept the score ceiling if time is insufficient. |
| Submission copy drifts from product vocabulary | **Confirmed.** `DEVPOST_COPY.md` says `CI for Understanding`, `Belief Test`, `Experiment Plan`, and `Proof Bundle`; current primary copy says scientific debugger, Belief Spec, Discrimination Contract/Experiment IR, and Proof Capsule. | **P1 if used for submission** | High | The actual Devpost is empty, so this is a stale source draft, not a currently published misrepresentation. Keep separate from the P0 missing submission. |
| Judge promises a complete sample loop, but Boundary is static | **Confirmed in source.** Judge says `Try the complete learning loop` (`JudgeModeView.tsx:162-170`). For non-live leakage, Explore only advertises live recomputation and Boundary is a static overlap paragraph (`App.tsx:1841-1919`, `2867-2900`), not Boundary Hunt/Map exploration. | **P1** | High | The sample still has prediction, result, reflection, transfer, and repair; the overstatement concerns the central Boundary promise and judge fast path. |
| Sample reflection starts with the correct rule | **Confirmed.** `defaultLeakageReflection` is the complete correct rule (`App.tsx:96-97`), initializes the editor (`2141-2145`), and already satisfies the 20-character progression gate (`2923-2929`). | **P2** | Confirmed | It weakens learner construction but does not break the flow. Require one explicit learner selection/edit rather than adding more content. |

## Attempts to disprove the strongest positive claims

1. **Judge Mode explains the product in twenty seconds — survives.** The public first fold is unusually strong and materially better than the initial hypothesis. A judge can identify the problem, result, evidence authority, and first CTA. Codex's role requires a modest scroll; that is a P2 communication opportunity, not a P1 by itself.
2. **Generated components propose while fixed components decide — mostly survives.** Source and focused tests show real schema, scorer, kernel, verifier, result-binding, transfer, patch, and Capsule authority. The Codex read-isolation claim must be narrowed, but structured no-tool output and independent re-verification are substantive compensating controls.
3. **Modes have three explicit meanings — only partially survives.** Labels are excellent and the hosted Capsule v2 replay is genuinely read-only. The public legacy v1 route reuses mutable learner UI without a `local practice / not recorded` authority label, directly contradicting its Judge card.
4. **The sample demonstrates the complete scientific learner loop — does not survive strictly.** It completes a staged lesson, but its central Boundary/Explore surfaces are explanatory placeholders rather than the bounded exploration advertised by the product thesis, and the revision starts solved.
5. **The current public app proves full end-to-end implementation — does not survive.** It proves availability, fast rendering, a strong dossier, setup health, and legacy replay GET behavior. The read-only mandate prevented a current sample/live session, model/Codex job, fixed result, Boundary Map, transfer, copied patch, Capsule download, reconnect, timeout, or recovery test; the deployed source/image is also unbound.

The following severe interpretations should be rejected:

- Do **not** say the public app is unavailable; all safe routes rendered successfully.
- Do **not** say Worker 82 currently has the historical tuple-schema failure; that record belongs to another deployment.
- Do **not** say replay data is corrupted or server-mutated; the flaw is misleading local overlay authority.
- Do **not** claim a successful hidden-source read, data leak, denial of wallet, or outage; the rate-limit and isolation items are source-confirmed risks/claim gaps.
- Do **not** retain the transient cyclic-font-token issue as a current P1. HEAD briefly contained it, the current worktree fixes it, and the public build rendered expected typography. Recheck only when freezing the release candidate.

## Score challenge

The actual official score is **0/100** because there is no submitted, judgeable entry. Do not average this with latent product quality.

The specialist shadow score of **57/100** is defensible and should not be inflated merely for architectural sophistication:

| Criterion | Strict current package | Red-team rationale |
| --- | ---: | --- |
| Technological Implementation | 17/25 | Substantive runtime architecture and tests, offset by unbound/unqualified public release and Codex isolation overclaim. |
| Design | 15/25 | Excellent Judge dossier and responsive first fold, offset by the plain-claim dead end, replay semantics, incomplete sample Boundary, and unqualified core journey. |
| Potential Impact | 7/25 | Specific costly misconception and meaningful transfer design, but zero observed learners, no time/completion/confusion/retention data, and no comparison arm. |
| Quality of the Idea | 18/25 | Memorable category and distinctive synthesis, but most individual mechanisms are established and only two adjacent ML packs demonstrate it. |
| **Shadow total** | **57/100** | Plausible range **48-69**. |

Recommended planning states:

- Current public submission: **0/100 official; 57/100 shadow package**.
- After confirmed P0/P1 corrections: **about 81/100**, only if the exact deployed build is source/image-bound and captured completing the core evidence journey.
- Realistic prize-one ceiling: **about 89/100**. A score above 90 is not credible without real learner behavior evidence, exact-current public proof, and a stronger answer to system breadth.

Technological Implementation is the first tie-break. The highest-leverage technical action is to freeze one source/image/deployment tuple and record a genuine end-to-end public run whose visible sequence proves `Codex proposal -> fixed selection/kernel -> independent release -> transfer -> copied repair -> Proof Capsule`. Populating and submitting Devpost must happen in parallel because otherwise every criterion remains administratively worth zero.

## Novelty, impact, and completeness challenge

The targeted market scan supports **distinctive synthesis**, not proof of categorical uniqueness. Scientific inquiry labs, controlled-variable checks, Socratic tutoring, artifact-grounded notebook assistants, transfer assessment, AI-generated experiments, and notebook repair all have current comparables. CounterLab's defensible novelty is their intersection with immutable prediction, non-authoritative generation, fixed epistemic release, transfer-gated copy repair, and portable evidence. `Scientific debugger for beliefs` is the memorable category; `CI for Understanding` is developer-centric and weaker.

Impact is currently aspirational. The smallest credible pre-deadline evidence is a five-to-eight-person paired/counterbalanced explanation-only versus CounterLab usability-and-transfer comparison, reporting every count, first unassisted transfer attempt, completion/time, confusion/abandonment, and limitations. If that cannot be recruited and consented safely, use three people for usability only and keep `NO_DATA` for learning-effect claims.

End-to-end completeness is **unverified for Worker 82**, not disproven. Because state-changing production paths were intentionally excluded, the final audit must state that the full definition of done was not met for current sample/live execution, runner/model degradation, exports/download integrity, refresh/reconnect during a job, and cross-session resumption.

## Deduplication and synthesis advice

- Keep one P0 umbrella for the unsubmitted Devpost entry. Treat description, video, repository access, website, `/feedback`, category, and final timestamp as its acceptance checklist rather than separate P0s.
- Keep public release provenance/qualification separate from stale documentation. The former is P1 execution evidence; the latter is P1 submission-copy or P2 general-documentation credibility.
- Keep plain-question dead end, incomplete sample Boundary, and pre-solved reflection separate: different roots and user impacts.
- Merge all `replay not read-only`, `mode confusion`, and `local replay patch` variants into one P1 whose precise subject is the unlabeled local-practice overlay; explicitly preserve the read-only hosted Capsule replay as a strength.
- Keep no-impact-data separate from two-pack breadth. One affects Potential Impact evidence; the other affects idea/category generality.
- Keep rate control, multipart buffering, and opaque session-capability concerns separate. Only the first merits P1; the latter are bounded P2 hardening findings.
- Keep Codex read isolation separate from generic authority separation. The latter is real; the former is a narrower invariant/claim failure.
- Static HTML security headers are absent live, but absent an exploit or unsafe sink they are P3 defense-in-depth, not a first-prize blocker.

## Specialist-draft corrections

`agent-live-journeys.md` contains stale pre-Chromium wording after its successful fallback run: its opening/baseline correctly records 11 rendered states and screenshots, but some route-map rows and mandatory journey records still say public rendering was unverified, the browser was blocked, and screenshots were absent. Canonical reports should take executed facts from `live-chrome-public-routes-20260719.json`, network/console JSON, trace, and screenshots—not copy those stale journey paragraphs.

The first-fold and accessibility hypotheses should also be narrowed: required public viewports had no horizontal page overflow; Judge had logical headings, named controls, visible focus, no detected contrast failures, reduced-motion compliance, and no overflow under the available 200% proxies. This does not substitute for a real screen-reader session, Axe/Lighthouse, or a stateful learner-flow accessibility pass.

## Primary evidence

- `evidence/test-results/devpost-project-baseline.md`
- `evidence/test-results/devpost-official-baseline.md`
- `evidence/network/public-api-baseline.md`
- `evidence/test-results/live-chrome-public-routes-20260719.json`
- `evidence/test-results/ux-browser-runtime/run-summary.json`
- `evidence/performance/ux/live-performance-measurements.json`
- `evidence/screenshots/red-team-judge-1440x900.png`
- `evidence/screenshots/red-team-plain-claim-destination.png`
- `evidence/screenshots/red-team-legacy-replay-local-completion.png`
- `evidence/test-results/red-team-browser-audit.mjs`
- `evidence/test-results/red-team-safe-interactions.mjs`
- `apps/web/src/App.tsx`
- `apps/web/src/features/judge/JudgeModeView.tsx`
- `apps/web/worker/api.ts`
- `services/hosted-runner/src/launch-boundary.ts`
- `packages/codex-client/src/app-server.ts`
- `Dockerfile.runner`
- `README.md`, `docs/DEVPOST_COPY.md`, `docs/LEARNER_PILOT_RESULTS.json`, and `docs/USER_STUDY_PROTOCOL.md`
