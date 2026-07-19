# Prioritised fix roadmap

Roadmap updated: `2026-07-19T07:52:19Z`
Official deadline: `2026-07-22T00:00:00Z` / Tuesday July 21, 5:00 PM PT
Exact remaining time at update: **230,861 seconds — 2 days, 16 hours, 7 minutes, 41 seconds**.

This is a sequencing plan, not authorization to implement. The audit made no product change and did not execute `16_IMPLEMENTATION_SWARM_PROMPT.md`.

## Priority calculation

For transparent comparison:

- severity: P0=4, P1=3, P2=2, P3=1;
- judge impact: very high=4, high=3, medium=2, low=1;
- confidence: confirmed=1.00, high=0.85, medium=0.65, low=0.40;
- score leverage: very high=4, high=3, medium=2, low=1;
- effort divisor: XS=0.5, S=1, M=2, L=4, XL=8.

`priority = severity × judge impact × confidence × score leverage ÷ effort`

The score orders work **within a release phase**. Gate precedence overrides arithmetic: submission eligibility and broken/misleading core journeys come before P2 polish, and optional features cannot outrank an unqualified release.

| Gate rank | Issue  | Smallest-fix effort | Judge impact | Formula score | Required response                                                                  |
| --------: | ------ | ------------------- | ------------ | ------------: | ---------------------------------------------------------------------------------- |
|         1 | CL-001 | S                   | very high    |         64.00 | Complete and submit mandatory Devpost package.                                     |
|         2 | CL-003 | S                   | very high    |         48.00 | Repair claim-only handoff.                                                         |
|         3 | CL-008 | XS                  | high         |         45.90 | Correct the isolation claim immediately; full isolation remains later.             |
|         4 | CL-002 | M                   | very high    |         24.00 | Freeze and qualify exact release tuple.                                            |
|         5 | CL-023 | M                   | very high    |         24.00 | Put a verified visual belief break in the fast path and render trusted Lab Scenes. |
|         6 | CL-004 | M                   | very high    |         24.00 | Separate/label local replay practice.                                              |
|         7 | CL-006 | M                   | very high    |         24.00 | Gather small honest learner evidence or retain no-effect claims.                   |
|         8 | CL-010 | S                   | high         |         22.95 | Replace stale submission vocabulary.                                               |
|         9 | CL-005 | M                   | very high    |         20.40 | Add real sample Boundary or narrow complete-loop claim.                            |
|        10 | CL-009 | S                   | high         |         17.55 | Narrow scope now; third pack is gated optional work.                               |
|        11 | CL-024 | M                   | high         |         13.50 | Add a bounded GPT-5.6 inquiry/presentation loop without authority expansion.       |
|        12 | CL-007 | M                   | high         |         11.48 | Add/document cost admission control.                                               |
|        13 | CL-013 | XS                  | medium       |         16.00 | Correct replay contrast after core gates.                                          |
|        14 | CL-020 | XS                  | medium       |         16.00 | Fix immutable caching after release behavior stabilizes.                           |
|        15 | CL-011 | S                   | medium       |          8.00 | Require real learner reflection.                                                   |
|        16 | CL-012 | S                   | medium       |          6.80 | Trap/restore palette focus.                                                        |
|        17 | CL-014 | S                   | medium       |          6.80 | Expose mobile sample/modes.                                                        |
|        18 | CL-015 | S                   | medium       |          6.80 | Add durable recovery/resume.                                                       |
|        19 | CL-019 | S                   | medium       |          6.80 | Add capability-link privacy guidance.                                              |
|        20 | CL-021 | S                   | medium       |          6.80 | Add minimal CI; defer refactor.                                                    |
|        21 | CL-016 | M                   | medium       |          3.40 | Connect reset to cancellation/lineage invalidation.                                |
|        22 | CL-017 | M                   | medium       |          3.40 | Enforce request-body bound before buffering.                                       |
|        23 | CL-018 | M                   | medium       |          3.40 | Strengthen PII/privacy-class minimization.                                         |
|        24 | CL-022 | S                   | low          |          1.00 | Static-header hardening only after higher gates.                                   |

The apparent numerical advantage of CL-013/CL-020 over CL-007 is not a sequencing override: P2 polish cannot precede a P1 production-readiness gap.

## Immediate stabilisation

Target window: **now through T−54h**. Keep at least six hours of final buffer; do not plan to use all 230,861 seconds.

1. **Create the submission skeleton immediately (CL-001).** Populate title, category, concise current description, Judge URL, repository field, and required custom fields as a draft. Do not claim it submitted until the official record says so. Identify the `/feedback` session ID and repository sharing state.
2. **Freeze one release candidate (CL-002).** Stop feature intake. Record commit, asset hashes, Worker version/deployment, Container digest, migrations, schemas, model/config receipt, and generated SBOM/evidence hashes.
3. **Run the clean pre-change baseline.** Type checks, authority slice, Worker/API/UI slice, Python suite in a supported local environment, Codex protocol/process suite, build, secret scan, and existing production-smoke dry validation. Preserve failures.
4. **Correct claims before architecture work (CL-008, CL-009, CL-010).** Label Codex generation unreadability `PARTIAL`; state exactly two ML packs; replace legacy category/vocabulary. This prevents a truthful build from being sold inaccurately.
5. **Repair the first-judge path (CL-003).** A claim-only learner must get a preserved claim and honest sample/upload choice, not a surprise notebook requirement.

Exit gate: one frozen candidate, no unsupported public/submission claim, mandatory Devpost draft fields populated, focused baseline retained, and no optional feature started.

## Highest-score fixes

Target window: **T−54h through T−30h**.

1. **Visual belief break and trusted Lab Scene (CL-023):** put an 8–12 second fixed-evidence entity-split transformation above the fold on landing and Judge desktop/mobile. Render the already-bounded scene contract through a fixed React registry across Prediction, Test, Boundary, Apply, and Repair. Every numeric binding must come from signed/fixed evidence, with accessible-table and reduced-motion parity.
2. **Replay authority (CL-004):** separate read-only playback from local practice or label local practice persistently; assert GET-only playback and unchanged stored hashes.
3. **Sample scientific loop (CL-005, CL-011):** provide one deterministic Boundary interaction backed by bundled fixed evidence and require an actual learner revision. If the full Boundary cannot pass its gate quickly, change the Judge promise from “complete learning loop” to an exact honest description; do not fabricate a control.
4. **Bounded GPT-5.6 Learning Director (CL-024):** add only allowlisted read/proposal tools for approved evidence, one clarification, trusted scene ordering, verified Boundary selection, hints, and signed-result explanation. Persist auditable lineage and budgets. Fixed scorer/kernel/verifier/state gates remain exclusive authority. If this cannot pass fail-closed tests before T−30h, retain the honest one-shot claim rather than shipping uncontrolled agent autonomy.
5. **Cost/admission control (CL-007):** implement the smallest repository-visible budget/concurrency policy and document external Cloudflare rules if they exist. Test without load or denial-of-service behavior.
6. **Learner evidence (CL-006):** in parallel with engineering, recruit and run the smallest consented study. Prefer 5–8 paired/counterbalanced explanation-only versus CounterLab sessions. If recruitment cannot finish safely, run three usability sessions and retain `NO_DATA` for learning effects.
7. **High-value P2 only after P1 gates:** fix replay contrast, command focus, mobile sample discoverability, and capability-link disclosure. Add minimal CI before the release candidate changes again.

Exit gate: all P0/P1 acceptance tests pass or remaining item is explicitly represented as a limitation that no longer produces a false claim. Do not call narrowing alone a functional fix when the score gap remains.

## Submission and video proof

Target window: **T−30h through T−12h**.

1. Run the complete source-bound public matrix against the exact frozen tuple: clean sample, supported live notebook, unsupported/malformed intake, GPT/runner degraded states, prediction lock, rejected/inconclusive paths, Boundary, transfer fail/pass, repair lock/unlock, copied patch, refresh/SSE reconnect, resume, download integrity, Capsule exact bytes, browser console/network, desktop/mobile, and no-secret evidence.
2. Repeat every failure before classification. Retain the first failed evidence and the repaired pass. Never present a historical run as current.
3. Record the public sub-three-minute narrated video from the frozen release. Open with the verified animated 98.5%/59.4% belief break, then show a genuine bounded GPT-5.6/Codex inquiry/plan receipt, fixed selection/result, independent verifier, Boundary, transfer, copied repair, and exact Capsule. Use captions and a clear voiceover; do not autoplay audio in the product and do not stage a rejection.
4. Capture four current screenshots from the frozen release, not from audit-only or earlier builds.
5. Update README opening, Devpost copy, video captions, judge instructions, and limitation table to one claim set. Map every major claim to live/source/test/documented/inferred/unverified evidence.
6. Verify anonymous public app and repository access, or private sharing with both official judge addresses. Verify video duration, audio, public access, and content.
7. Submit no later than **T−6h**, then verify public slug, `submitted_at`, fields, links, category, and video from a logged-out session. Keep the last six hours for recovery, not development.

Exit gate: official submission receipt captured, exact release receipt attached/indexed, video and links anonymously judgeable, no claim drift, and public smoke green twice.

## Only if all critical work passes

Attempt in this order and stop on the first regression:

1. CL-015 durable missing-route/recent-session recovery.
2. CL-016 reset/cancellation lifecycle.
3. CL-017 early request-body enforcement.
4. CL-018 stronger PII/privacy-class suppression.
5. CL-020 immutable hashed-asset caching; code splitting only if measurements and tests stay green.
6. CL-022 static document headers with nonbreaking CSP.
7. **Exactly one cross-domain `physics/free-fall` pack only if the complete admission, kernel/oracle/unit/convergence/Boundary/transfer/mutation/Capsule/browser/release gate can finish before T−12h.** Given the audit state and time, the likely correct choice is to defer it and accept the documented breadth ceiling.

## Do not attempt before submission

- Broad refactoring of `api.ts` or `App.tsx`; add CI now and decompose after the deadline.
- Arbitrary subjects, all-STEM claims, arbitrary notebook/code execution, or additional ML lessons.
- Accounts, classroom/LMS surfaces, leaderboards, certificates, social/community, voice, native mobile, or analytics platforms.
- Full bespoke privacy classifier, identity system, scientific solver, or security sandbox rewrite when an honest claim correction and bounded adapter suffice.
- Broad visual redesign, a new design system, gamification, agent cockpit, arbitrary model-generated UI/code, or animation unrelated to the fixed evidence journey. The bounded verified Lab Scene and Belief Break Theater in CL-023 are required core proof, not optional visual bloat.
- Any deployment, screenshot, video, or submission claim not bound to the frozen receipt.

## Final go/no-go rules

- **Go:** official entry complete; exact public tuple qualified; primary judge path honest and finishable; no P0; all P1 either corrected or precisely narrowed with no misleading behavior; video matches live build.
- **No-go for optional work:** any P0/P1 acceptance test is red, any release identifier drifts, any public journey differs from video, or less than 12 hours remains.
- **Submission fallback:** if live model/runner qualification cannot complete, submit an honest sample plus strictly labelled replay path only if official rules still regard the project as working and all claims clearly state the limitation. Never silently substitute modes.

See `04_ISSUE_REGISTER.md` for exact acceptance criteria and `16_IMPLEMENTATION_SWARM_PROMPT.md` for the non-executed follow-on prompt.
