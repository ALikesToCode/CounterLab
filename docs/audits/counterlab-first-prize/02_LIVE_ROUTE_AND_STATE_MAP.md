# Live route and state map

Audit window: 2026-07-18 18:54–19:17 UTC. Public deployment observed: Cloudflare Worker version `bef5edb7-6a76-4c72-94be-fcb2b94e668d` (#82), deployment `dad4cd71-3dcd-4b00-a1b6-d16068d53c81`. Its source commit was not exposed. Browser: Chromium 150.0.7871.128 through Playwright 1.61.1, clean repository-contained profile, with non-GET requests blocked.

## Public routes

| Route          | Live observation                                                                                                                                                                      | Principal controls                                                                                                                                                                                                     | Evidence status                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `/`            | 200. Question-first landing at desktop and mobile. No horizontal overflow.                                                                                                            | Question/Notebook intent, claim textarea, notebook attachment, `Test this claim`, prompt starters, sample, replay, Judge Mode, proof/support disclosure. On narrow screens the latter four paths sit behind `Explore`. | Observed live                                            |
| `/judge`       | 200. Editorial evidence dossier. Capability card reported GPT/Codex/kernel/sandbox configured.                                                                                        | Start sample, watch replay, run live, return to learner view; authority, mode, method, limitation, and reproduction sections.                                                                                          | Observed live; health only proves configuration          |
| `/new`         | 200. `Test my notebook`; runner and notebook tools reported ready.                                                                                                                    | Continue with notebook, sample fallback, replay fallback, project/evidence drawer, Start over.                                                                                                                         | Observed live; no session created                        |
| `/session/:id` | Loads a persisted sample or live session and projects its stored state into the six-stage shell. A deliberately absent ID produced an API 404 and a toast over the landing page.      | State-dependent learner and proof controls.                                                                                                                                                                            | Missing-ID behavior observed; real session untested live |
| `/proof/:id`   | Uses the same persisted-session loader; a deliberately absent ID produced the same 404/toast recovery.                                                                                | Reasoning Diff, repaired-copy and Proof Capsule actions when the stored authority exists.                                                                                                                              | Missing-ID behavior observed; real proof untested live   |
| `/replay/:id`  | `leakage-01` returned 200 with a persistent replay banner and recorded metadata. A v2 Capsule payload would use the dedicated read-only replay view; this public record is legacy v1. | Continue/reveal; the legacy branch also exposes locally mutable revision, transfer, and patch progression.                                                                                                             | Observed live for `leakage-01`                           |
| Unknown path   | 200 application shell, silently canonicalized to `/`.                                                                                                                                 | Landing controls.                                                                                                                                                                                                      | Observed live                                            |

Non-route anchors include `#landing-support-note` and, for native Proof Capsule replays, `#replay-question`, `#replay-prediction`, `#replay-test`, `#replay-boundary`, `#replay-apply`, `#replay-repair`, and `#replay-proof`.

## Learner state graph

```text
landing
├─ sample ──────────────> Question
├─ legacy replay ───────> recorded Test introduction
├─ live/notebook ───────> /new capability gate ─> intake
└─ Judge Mode ──────────> /judge

ARTIFACT_INGESTED
  -> QUESTION_FRAMED
  -> BELIEF_SPEC_PROPOSED
  -> BELIEF_SPEC_CONFIRMED | INSUFFICIENT_EVIDENCE | REJECTED_BY_LEARNER
  -> PREDICTION_LOCKED
  -> CANDIDATES_PROPOSED
  -> DISCRIMINATION_CONTRACT_VERIFIED | TEST_REJECTED
  -> EXPERIMENT_IR_VERIFIED | TEST_REJECTED
  -> TEST_RUNNING
  -> SUPPORTS | INCONCLUSIVE | REJECTED
  -> BOUNDARY_VERIFIED
  -> REVISION_RECORDED
  -> TRANSFER_IN_PROGRESS
  -> TRANSFER_FAILED | TRANSFER_PASSED
  -> PATCH_COMPILING
  -> PATCH_REJECTED | PATCH_VERIFIED
  -> REASONING_DIFF_ISSUED
  -> PROOF_CAPSULE_ISSUED
```

The first graph is the observed/source route projection; the second is the verified server domain contract. Not every domain transition was executed against Worker #82.

## Control inventory by stage

### Landing and intake

- Responsive `Explore`; `New question`; verified sample; verified replay; Judge Mode; `How proof works`.
- Question/Notebook intent buttons, labelled textarea, hidden `.ipynb` file input, submit, two prompt starters, hint disclosure.
- Live setup capability retry/fallbacks, notebook replacement, starter claim, exact evidence packet review, sensitive-content approval where required, send/change-claim actions.
- Intake parses notebooks as data. Source validates extension, content type, declared/actual size, JSON, nbformat, active content, magics, packages, network requirements, supported estimators, and evidence sufficiency; cells are not executed.

### Question and Prediction

- Competing-model review with conditions/limits, confirm/edit/insufficient/reject choices, alternatives and uncertainty disclosure.
- Three qualitative prediction radios, confidence range, immutable `Seal my prediction`.
- Source and tests enforce that no result or Boundary Map is released before the Prediction is locked.

### Test

- `Why this test?`, changed/controlled variables, observable, compile/verify progress, cancel, retry, sanitized public event stream, result reveal.
- Evidence/proof drawer has Activity, Plan, Diff, Tests, Verifier, and Provenance tabs.
- Fixed scorer selects among registered candidates; fixed kernel computes values; frozen technical and epistemic verifiers release or reject authority.

### Boundary

- Theater tabs: Observe, Explore, Boundary, Apply.
- Leakage controls include split mode, entity boundary, identity-feature ablation, and bounded test fraction. Imbalance controls include bounded metric/threshold/prevalence scenarios.
- Boundary Hunt, verified map, keyboard-inspectable cells, exact-value table, assumptions, non-claims, and integrity receipt.

### Apply and Repair

- Learner-authored reasoning revision, deterministic surface-different transfer, explicit failure feedback, and patch lock.
- Passing transfer unlocks bounded patch compilation; source applies it to a copy and verifies permitted cell scope, dependencies, recomputed results, reproducibility, and unrelated hashes.
- Completion surfaces Reasoning Diff, repaired-notebook copy, Proof Capsule/proof record, evidence disclosure, and replay publication when native v2 authority exists.

## Empty, loading, degraded, and recovery states

| State                          | Source/live finding                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Empty claim                    | Submit disabled; prompt starters and hint offered. Observed live.                                                     |
| Capability check               | Stable live-setup layout with pending, ready, unavailable, and retry variants. Ready observed live.                   |
| Unsupported/malformed notebook | Typed refusal and no advance in source/tests; not sent to production during this read-only audit.                     |
| Compiler rejection             | Releases no result, provides bounded counterexample and at most two repairs in source/tests.                          |
| `INCONCLUSIVE`                 | First-class Evidence Verdict in contracts/verifier; not observed in public browser.                                   |
| Runner/model timeout           | Typed failure, retry, cancellation, cursor reconnect, and idempotent callbacks in source/tests; not induced publicly. |
| Transfer failure               | Patch remains locked and feedback identifies failed fixed checks in source/tests; not induced publicly.               |
| Missing session/proof          | API 404 plus transient toast, then landing. Observed live.                                                            |
| Unknown route                  | Silent landing canonicalization. Observed live.                                                                       |
| Refresh/back/forward           | Router and state restoration covered by source/unit/E2E definitions; current public data-backed flow not exercised.   |

## Mode authority

| Mode                       | Intended authority                                                     | Audit result                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `sample`                   | Bundled approved lesson evidence, always labelled.                     | Source/test verified; public state-changing start not executed.                                                         |
| `replay` v2                | Read-only reconstruction of stored native Proof Capsule/events.        | Source/test verified; no public v2 replay ID available.                                                                 |
| Legacy `replay` v1         | Stored replay metadata plus an older interactive learner shell.        | Publicly observed; local choices can create synthetic learner progression, which conflicts with current read-only copy. |
| `live_notebook`            | Artifact-specific GPT/Codex/fixed-kernel/verifier/transfer/patch path. | Configured/ready observed; completion on Worker #82 unverified.                                                         |
| `guided_lab` / `challenge` | Contractual future modes.                                              | Contracts/plans only; no public route discovered.                                                                       |

## Evidence

- `evidence/test-results/live-chrome-public-routes-20260719.json`
- `evidence/network/live-chrome-network-20260719.json`
- `evidence/console/live-chrome-console-20260719.json`
- `evidence/screenshots/live-chrome-*.png`
- `evidence/test-results/agent-live-journeys.md`
- `apps/web/src/app/AppRouter.ts`
- `apps/web/src/App.tsx`
- `apps/web/worker/api.ts`

## Limitations

No POST, upload, session creation, model call, runner job, transfer, patch, export, or production data mutation was performed. Thus the route map is complete for source-discoverable top-level routes and public GET states, but not for every data-dependent state on Worker #82.
