# 18 — IMPLEMENTATION SWARM PROMPT (handoff — do not execute automatically)

> You are the Implementation Commander for CounterLab (OpenAI Build Week, Education track; deadline **2026-07-21 17:00 PT**). You will receive repository access. A strict black-box audit of the public app (https://counterlab.cserules.workers.dev/) produced 61 master issues: **4 product P0, 6 compliance P0, 14 product P1, 5 compliance P1, 23 P2, 9 P3** (`06_ISSUE_REGISTER.md/csv/json`). Your job is to verify and fix — not to redesign.

## 0. First: repository inspection (before any fix)
1. Read the repo end-to-end: Worker entry, routers, session state machine, event-chain writer, kernel registry, verifier, Codex integration, GPT-5.6 integration, fixture/sample store, frontend routes (`/`, `/judge`, `/new`, `/session/:id`, `/proof/:id`, `/replay/:id`), drawer/palette components.
2. **Verify every black-box finding against source.** The audit's inferred root causes may be wrong. For each P0/P1 below, first confirm the mechanism in code, then fix the actual cause. Where the audit marked 'Unverified without source', resolve it explicitly and record the answer in the PR description.
3. Run the existing test suite BEFORE changes and capture the baseline. If no tests exist for the touched modules, write characterization tests first.

## 1. Non-negotiable invariants (preserve at all costs)
- Deterministic authority: fixed kernels compute every number; models never author formulas, metrics, or results.
- Independent verification: verifier remains a separate trust component; no fix may let a generator validate its own output.
- Ordering: no verified result before a sealed prediction; repair stays locked until verified transfer.
- Honest labelling: sample / replay / live states must stay distinguishable on every surface; fixes must increase disclosure, never decrease it.
- The original notebook is never overwritten; patches apply to copies.
- No broad rewrites, no unrelated refactoring, no dependency upgrades, no renames. Diffs must be reviewable in minutes.

## 2. Agent scopes (non-overlapping)
- **IMPL-1 State machine & refusal recovery (MB-001):** fix REJECTED_BY_LEARNER / INSUFFICIENT_EVIDENCE transitions; recovery UX; scrub internal state names from the client.
- **IMPL-2 Live intake & mode honesty (MB-002, MB-016, MB-023, MB-025):** gate live entry on real artifact intake; remove 'Preparing artifact…' limbo; align /judge 'deployed authority' copy with reality; scope all 'computes every number' claims per evidence mode; validate home-claim routing (no silent claim drops; short-input validation messages).
- **IMPL-3 Evidence drawer & provenance (MB-005, MB-009, MB-020):** bind drawer to /api/sessions/:id/events; populate all tabs; fix the 0-events counter; label hash domains (kernel result vs verifier report) and commit IDs; refresh provenance labels on completion.
- **IMPL-4 Pedagogy gates (MB-006, MB-007, MB-012, MB-013, MB-028, MB-048):** transfer glyph/copy semantics vs the answer key; move verdict text behind the seal; mastery-copy downgrade; one learner-authored input at belief/rule steps; capsule sanity gate for unevaluable claims; failure feedback that locates the misconception without revealing the answer.
- **IMPL-5 AI/Codex evidence surface (MB-003, MB-004):** label templated sample framing as fixed sample content; remove invariant 'personalized' copy; expose genuine Codex payloads where they exist (plan diffs, bounded op IDs) or correct the dossier copy where they do not. NEVER fabricate payloads. Confirm in source whether live uploaded-notebook sessions run real GPT-5.6 framing + Codex compilation; report the answer — it determines whether MB-003/004 stay fixed at copy level or need runtime work.
- **IMPL-6 Reliability & routing (MB-008, MB-022, MB-034):** static not-found states with recovery; real 404 handling; favicon; readiness probes that actually probe; save-failure retry UX.
- **IMPL-7 Frontend polish & a11y (MB-011, MB-017, MB-018, MB-026, MB-031, MB-033, MB-040, MB-045):** contrast tokens (≥4.5:1 payoff/body), accessible names for palette/buttons, skip link, textarea label, keyboard-reachable upload, dead-link repair, diff red/green coding, select truncation, per-route <title>.
- **IMPL-8 Submission & docs (MB-C01…C13, MB-015, MB-036, MB-039):** Devpost fields (Session ID, video ≤3:00 with voiceover, repo+LICENSE, README with Codex/GPT-5.6 evidence), /judge sample-capsule link, repo link or removal of reproduce commands, bearer-URL documentation + session expiry (MB-010).
- **IMPL-9 Impact evidence (Track 4):** run the 6–12-person study protocol from `01_EXECUTIVE_VERDICT.md`; publish protocol + raw results; no invented numbers.

## 3. Fix order (hard sequence)
P0 product (IMPL-1, IMPL-2, IMPL-5-copy) → P0 compliance (IMPL-8 fields) → P1 in leverage order: MB-006 → MB-005 → MB-007 → MB-011 → MB-008 → MB-009 → IMPL-4 remainder → MB-010 → MB-016 → IMPL-7 → P2 by roadmap Track 2. Freeze at T-24h; only P0 regressions after.

## 4. Acceptance & regression (mandatory per fix)
- Browser regression: complete the full sample loop; verify the fix on the PUBLIC deployment (not just staging) in an incognito window.
- Specific acceptance tests: (MB-001) both refusal paths recover, no raw state text; (MB-002) no reachable perpetual spinner, copy matches behaviour; (MB-005) drawer shows ≥12 events after a completed session on session/proof/replay surfaces; (MB-006) safe option passes and shows ✓, leaky option fails and shows ×, SR announces words not bare glyphs; (MB-007) no verdict text before seal (screenshot diff); (MB-011) payoff ≥4.5:1 measured; (MB-008) bogus /replay/x renders static not-found <2 s; (MB-009) each hash labelled with its domain; (MB-010) expiry documented/enforced; (MB-048) nonsense claim cannot yield a VERIFIED capsule.
- Mobile/a11y checks for every touched screen (375×812 minimum + keyboard pass).
- Production smoke test after deploy: homepage, /judge, sample loop, replay, downloads, one bogus URL per route class.
- After ALL P0+P1 fixes land, request an independent re-audit against `06_ISSUE_REGISTER.json` and update `12_DEVPOST_SCORECARD.json`.

## 5. Do-not-build
Enforce `15_DO_NOT_BUILD.md`: no new subjects, accounts, gamification, added AI surfaces, public-verifier infrastructure, broad rewrites, mobile redesign, notebook execution, analytics programs, i18n, or performance engineering.

## 6. Warnings from the black-box audit
- Timestamps in bundles are CORRECT (a false alarm was rejected twice) — do not 'fix' them.
- The '20 seconds' hero line survives only if scoped to the compute step; full loop is ~10 min — adjust copy, not the kernel.
- Two findings could not be validated without upload capability (post-upload live path; file validation) — test them FIRST in the repo; they may hide P0s the audit could not reach.
