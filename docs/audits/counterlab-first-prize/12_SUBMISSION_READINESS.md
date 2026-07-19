# Submission readiness

## Stage One verdict

**FAIL at audit time.** Devpost project `1330312` remained `Untitled` in `submission_pre_draft`, with empty description and no tagline, video URL, public slug, website URL, or submitted timestamp. The official submission deadline is `2026-07-22T00:00:00Z` (Tuesday July 21, 5:00 PM PT).

This is an administrative/integrity P0, not a judgment on the underlying product. Until the final entry is actually submitted, the official score is 0/100.

## Official requirement matrix

| Requirement                                     | Current evidence                                                                             | Status                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------- |
| Working Codex + GPT-5.6 project                 | Substantive source/tests; public health configured; exact-current live completion unverified | Partial                         |
| Education category                              | Intended throughout repo; no submitted entry                                                 | Missing from submission         |
| Project name/tagline/description                | Live entry Untitled/null/empty                                                               | Missing                         |
| Public YouTube video under 3 minutes with audio | 2:45 script plan only; no video URL/asset                                                    | Missing                         |
| Explain what was built and Codex/GPT-5.6 use    | Strong README/CODEX docs; absent actual entry/video                                          | Partial                         |
| Repository URL and access                       | Devpost field absent; local origin present; anonymous GitHub request returned 404            | Missing/unverified              |
| Public licence or private judge sharing         | MIT present; private sharing with both required addresses cannot be verified                 | Partial                         |
| README setup/sample/run guidance                | Present and detailed                                                                         | Pass, with release-state caveat |
| `/feedback` Codex Session ID                    | No ID found                                                                                  | Missing                         |
| Free test access through judging                | Public app responds; URL absent from entry; live exact build not qualified                   | Partial                         |
| Category/custom submitter fields                | No completed entry                                                                           | Missing                         |
| Existing/new work separation                    | Entire inspected 357-commit history starts 2026-07-14                                        | Strong                          |
| Current screenshots/thumbnail                   | Audit captures exist; no curated submission assets                                           | Missing                         |
| Honest impact evidence                          | `NO_DATA` correctly recorded                                                                 | Honest but weak                 |

If the GitHub repository is private, verify access for `testing@devpost.com` and `build-week-event@openai.com`. If public, verify anonymous access immediately before submission.

## Submission consistency

The public document title currently reads `CounterLab — CI for understanding`, and `docs/DEVPOST_COPY.md` is not safe to paste unchanged:

- title/category is `CI for Understanding`, weaker than `scientific debugger for beliefs`;
- uses legacy Belief Test, Experiment Plan, and Proof Bundle terminology;
- does not lead with Judge Mode, tri-state evidence, Boundary Map, transfer gate, or four-authority split;
- references release instructions that are not bound to Worker #82.

README is stronger but prominently says the best local v6.1 branch is separate from the public release. That honesty should remain, but must be resolved by freezing and qualifying one exact release before recording screenshots/video.

## Simulation A — submission-only judge

### Actual entry

Not judgeable. Likely administrative Stage One failure.

### If current draft copy were pasted unchanged

Likely mental model: “technically serious notebook verification demo.” The judge would understand entity leakage and generated-versus-fixed authority, but not see a coherent current visual story, measured impact, exact deployed build, or public video. Stale terminology would make the product feel in flux.

## Simulation B — hands-on judge

| Time       | What is understood                                                                          | What remains doubtful                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 20 seconds | Notebook belief, prediction lock, fixed computation, memorable 98.5% vs 59.4%, Start sample | Exact audience, Codex role, mode separation, impact                                                     |
| 60 seconds | Four authorities: GPT frames, Codex compiles, kernel computes, verifier releases            | Whether those roles ran in the clicked exact build                                                      |
| 3 minutes  | Three modes, six-stage loop, bounded claims, reproduction commands                          | Only two ML packs; replay legacy/no Capsule; live says configured rather than smoke-passed              |
| 10 minutes | Genuine replay provenance and much of the learner flow                                      | Local transfer/patch completion contradicts replay’s read-only promise; current live E2E still unproven |

Judge Mode itself is a major strength and should be the public URL in judge instructions. The video should move from its result hook into a real qualified live journey, not remain a dossier tour.

## Required submission package

### Title

`CounterLab — A scientific debugger for beliefs`

### Opening sentence

`A high notebook score can prove the wrong thing. CounterLab makes an ML learner predict first, lets Codex propose a fair test, and lets fixed computation plus an independent verifier decide what the evidence supports.`

### Three-minute video spine

1. 0:00–0:20 — learner/audience, misleading 98.5% score, category line.
2. 0:20–0:45 — immutable Prediction and two competing models.
3. 0:45–1:20 — runtime Codex bounded plan receipt; fixed scorer/verifier separate from generation.
4. 1:20–1:45 — fixed result and `SUPPORTS|INCONCLUSIVE|REJECTED` authority.
5. 1:45–2:15 — Boundary and surface-different transfer.
6. 2:15–2:35 — copied repair and exact Proof Capsule.
7. 2:35–2:55 — Judge authority map, two supported packs, honest limitations, Build Week/Codex collaboration.

Show a genuine reject/repair only if it happened in the demonstrated live run; do not stage one. Keep persistent sample/replay/live labels visible.

### Four screenshots

1. Judge 98.5%/59.4% proof with mode/route context.
2. Four-authority map.
3. Immutable Prediction plus `Why this test?` and controls.
4. Transfer-passed copied repair plus Proof Capsule provenance.

Audit screenshots are evidence inputs, not automatically polished submission assets; capture them again from the frozen release.

### Judge instructions

1. Open `/judge`.
2. Start the fast labelled sample for the no-credential loop.
3. Use the supplied supported notebook and claim for the exact qualified live path.
4. Inspect a strictly read-only verified replay.
5. Reproduce locally with exact source/image-bound commands.

Include expected duration, browser, sample filenames, support boundary, what requires no credential, and exact release receipt.

## Immediate checklist

- [ ] Populate title, tagline, current description, Education category, live Judge URL, repository, and `/feedback` ID.
- [ ] Verify repository public access or both private-share recipients.
- [ ] Freeze commit/Worker/Container; run exact live/sample/replay/download/browser/no-secret matrix.
- [ ] Correct claim-only handoff and legacy replay semantics.
- [ ] Record/upload public YouTube video under three minutes with audio.
- [ ] Capture four current screenshots and thumbnail.
- [ ] Update README opening, Devpost copy, Codex docs, Progress, and judge instructions to the same release/vocabulary.
- [ ] Report impact as `NO_DATA` unless a real study finishes.
- [ ] Preview every Devpost field/link while logged out where applicable.
- [ ] Submit before deadline and verify `submitted_at`/public slug.

## Highest-leverage action

Populate the Devpost entry now while freezing and qualifying one exact public release in parallel. A perfect unsubmitted build is worth zero; a submitted but unqualified build risks the first tie-break.

## Evidence

- `evidence/test-results/devpost-official-baseline.md`
- `evidence/test-results/devpost-project-baseline.md`
- `evidence/test-results/agent-submission-market.md`
- `evidence/network/github-access-baseline.md`
- `docs/DEVPOST_COPY.md`, `DEMO_SCRIPT.md`, `SCREENSHOT_PLAN.md`, `LEARNER_PILOT_RESULTS.json`

## Limitations

The connector cannot reveal whether a private GitHub repository has been shared with the two judge addresses. No public video exists to assess. The audit did not modify or submit any Devpost field.
