# CounterLab first-prize deep audit

Audit window: 2026-07-18 UTC
Public target: `https://counterlab.cserules.workers.dev/` and `/judge`
Public Worker tested: `bef5edb7-6a76-4c72-94be-fcb2b94e668d` (#82), deployment `dad4cd71-3dcd-4b00-a1b6-d16068d53c81`
Final source checkpoint: `dd451c77606ec270cfba030784df50cb3aa19969`
Audit mode: read-only public inspection and repository analysis; audit files only were created.

## Verdict at a glance

- Stage One: **FAIL at audit time** because the official project is an empty, unsubmitted pre-draft.
- Official current score: **0/100**.
- Diagnostic shadow score if the current inspectable package were submitted honestly: **57/100**.
- Confirmed issues: **1 P0, 9 P1, 11 P2, 1 P3**.
- First-prize readiness: **not ready**. The underlying implementation is unusually strong, but submission state, exact-current production proof, core journey credibility, and learner evidence prevent a prize-one claim.
- Audit completeness: the report set is complete for evidence actually accessible, but the user’s full definition of done is **not fully met** because state-changing public sample/live jobs, model/runner degradation, reconnect during an active job, patch/Capsule downloads, and cross-session persistence were intentionally not executed in a read-only production audit. These are unverified, not failed.

## Canonical reports

| File                                        | Purpose                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `01_EXECUTIVE_VERDICT.md`                   | Stage One verdict, strengths, risks, P0s, top corrections, first-prize decision.       |
| `02_LIVE_ROUTE_AND_STATE_MAP.md`            | Public routes, controls, discoverability, observed and source-verified states.         |
| `03_END_TO_END_JOURNEY_MATRIX.md`           | Required journey results, safe-browser evidence, untested state-changing paths.        |
| `04_ISSUE_REGISTER.md`                      | Full exact-format records for all 22 issues.                                           |
| `04_ISSUE_REGISTER.csv`                     | Machine-readable issue register.                                                       |
| `04_ISSUE_REGISTER.json`                    | Structured issue register with counts/checkpoints.                                     |
| `05_LEARNER_UX_AND_PEDAGOGY.md`             | Learner agency, cognitive load, feedback, transfer, reflection, conclusion.            |
| `06_DESIGN_ACCESSIBILITY_RESPONSIVENESS.md` | Visual design, responsive matrix, keyboard/contrast/manual accessibility, performance. |
| `07_BACKEND_RELIABILITY_PERFORMANCE.md`     | APIs, storage, runner, recovery, release evidence, production risks, measurements.     |
| `08_AI_CODEX_VERIFICATION_SECURITY.md`      | GPT-5.6/Codex authority trace, fixed/verifier boundaries, adversarial/security review. |
| `09_REPOSITORY_AND_TEST_AUDIT.md`           | Repository map, tests, maintainability, configuration, reproducibility.                |
| `10_DEVPOST_SCORECARD.md`                   | Three strict score states with evidence, objections, intervals, and score levers.      |
| `10_DEVPOST_SCORECARD.json`                 | Structured scoring states.                                                             |
| `11_NOVELTY_AND_COMPETITIVE_GAPS.md`        | Current primary-source comparison and defensible novelty.                              |
| `12_SUBMISSION_READINESS.md`                | Official requirements, judge simulations, video/screenshots/instructions checklist.    |
| `13_PRIORITISED_FIX_ROADMAP.md`             | Exact deadline clock, priority formula, phase gates, go/no-go rules.                   |
| `14_DO_NOT_BUILD.md`                        | Scope-creep and integrity-theater exclusions.                                          |
| `15_EVIDENCE_INDEX.md`                      | Evidence provenance, hashes, limitations, and canonical-source notes.                  |
| `16_IMPLEMENTATION_SWARM_PROMPT.md`         | Complete follow-on implementation prompt; created but not executed.                    |

## Source-of-truth resolution

1. Public behavior and production API responses were used ahead of source claims.
2. Current source/tests established unreachable or unsafe-to-trigger states, but were labelled separately from live observations.
3. Historical release evidence did not qualify Worker 82.
4. Documentation-only features received no live implementation credit.
5. Red team independently confirmed every final P0/P1 or narrowed its wording/severity.

Important conflict resolutions:

- The site was available and healthy; it did not have a confirmed current outage.
- The public legacy replay did not mutate stored evidence. Its defect is an unlabeled local-practice overlay under read-only/verified language.
- Hosted Codex output authority fails closed. The finding is that claimed filesystem unreadability is not OS-enforced, not that a hidden read or leak occurred.
- A historical tuple-schema failure belongs to an older release and was not attributed to Worker 82.
- A transient font-token defect was fixed before synthesis and is excluded.
- The branch advanced through four release/design commits during synthesis. Their delta was inspected at `dd451c7`; release containment improved, but no executed Worker-82 source/image qualification appeared. See `evidence/test-results/final-source-delta.md`.
- `evidence/test-results/agent-live-journeys.md` contains stale pre-Chromium paragraphs; the executed route JSON, trace, console/network captures, screenshots, canonical journey matrix, and red-team report supersede those passages.

## Known-hypothesis disposition

| Hypothesis                                             | Result                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted runner may not complete every supported journey | **Unverified/refined:** Worker is ready; exact-current completion was not safely exercised.                                                 |
| Sample/replay/live are unclear                         | **Mostly rejected, one serious exception:** Judge labels are strong; legacy replay practice authority is ambiguous.                         |
| Judge Mode hides strongest work                        | **Mostly rejected:** first fold is excellent; exact runtime Codex/public-release proof remains below the visible claim.                     |
| Too much engineering terminology early                 | **Refined:** Judge is unusually clear; live setup and deep proof remain dense, and claim-only routing is artifact-centric.                  |
| Visual hierarchy breaks on small screens               | **Mostly rejected:** no required-viewport overflow; mobile mode discoverability and replay density/contrast remain.                         |
| Exact public journey matrix was not executed           | **Confirmed.**                                                                                                                              |
| Learner-impact evidence is weak/absent                 | **Confirmed: NO_DATA.**                                                                                                                     |
| Too few concept packs prove reuse                      | **Confirmed as first-prize differentiation risk, not a functional defect.**                                                                 |
| Codex is real in source but invisible live             | **Confirmed/refined:** substantive in source/tests and explained in Judge; no Worker-82 runtime call was observed.                          |
| GPT/Codex/fixed/verifier/learner authority is unclear  | **Mostly rejected in Judge/source; exact-current runtime proof is missing and isolation claim needs narrowing.**                            |
| Degraded states are honest but product-hostile         | **Partly confirmed:** typed fail-closed source is strong; missing/deep-link recovery is transient and active degradation was not induced.   |
| Novelty is unclear in 20 seconds                       | **Rejected for Judge Mode, partly confirmed for the generic landing:** Judge hook/category is clear; audience/Codex role needs more scroll. |
| Submission surfaces are inconsistent                   | **Confirmed:** actual entry is empty and local copy uses legacy framing.                                                                    |

## Browser and safety note

The hardened CloakBrowser endpoint was unavailable. After the owner explicitly authorized Chrome, the audit used Chromium 150.0.7871.128 through Playwright 1.61.1 with repository-contained profile/cache/output. Safe public passes were GET/HEAD/OPTIONS-only; no production session, upload, model call, job, patch, download, storage object, or deployment was created or changed. A final recheck at `2026-07-18T20:04:20Z` returned 200 for `/` and `/judge`, green `/ready` and `/api/health`, the same public asset, and zero console/request/error responses.

## Start here

Read `01_EXECUTIVE_VERDICT.md`, then `04_ISSUE_REGISTER.md`, `10_DEVPOST_SCORECARD.md`, and `13_PRIORITISED_FIX_ROADMAP.md`. Use `15_EVIDENCE_INDEX.md` to inspect primary captures rather than relying on prose.
