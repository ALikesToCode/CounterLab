# 14 — PRIORITISED FIX ROADMAP (deadline-aware)

**Now:** 2026-07-19 · **Deadline:** Tue 2026-07-21 17:00 PT (2026-07-22T00:00Z) · **Remaining:** ~72 h from 2026-07-19 00:00 UTC (~65 h PT). Judges are **not required** to test the app — the Devpost page is the default evaluation surface; the app must survive sceptical hands-on probing.

Ranking ≈ severity × judge impact × confidence × score leverage ÷ effort. Rule: broken core journeys outrank all optional features; exposing hidden capability outrank new capability.

---

## Track 0 — Immediate submission protection (T-72 → T-48 h). Owner: submission lead. GATE: nothing else ships if these are undone.
1. **MB-C01..C05 compliance sweep** (~2–3 h): /feedback Codex Session ID entered; video ≤3:00 with audible voiceover covering built/Codex/GPT-5.6; repo public-or-shared with LICENSE; README (setup, sample data, testing path, Codex acceleration points, GPT-5.6 integration). Acceptance: every required Devpost field filled; links open in an incognito window.
2. **MB-C06 availability**: uptime check cadence through Aug 13; remove any paywall/credential need. 
3. **Devpost page self-containment (MB-C07, MB-014, MB-015)**: page must carry — one-sentence delta, the falsification moment (98.5%→59.4% screenshot/GIF), the sealed-prediction mechanic, a downloadable/visible sample Proof Capsule, the reject-withhold behaviour, honest scope. Assume the app is never opened.
4. **Track-fit anchor (MB-014)**: first two lines of the page + /judge name the student/teacher and the classroom problem before "CI" language.

## Track 1 — Core journey stabilisation (T-72 → T-36 h). These are P0 defects; each has multi-agent reproduction.
5. **MB-001 (P0)** — Un-brick the refusal paths: catch REJECTED_BY_LEARNER / INSUFFICIENT_EVIDENCE transitions; offer revise-or-restart; never render raw state names. Smallest fix: route both buttons to a recovery screen with the claim preserved. Effort S. Acceptance: both paths recoverable; no internal strings visible; regression test in 18.
6. **MB-002 (P0)** — Live intake honesty: either (a) make no-upload live entry impossible (gate the CTA behind a successful artifact intake, delete 'Preparing artifact…' limbo), or (b) complete the upload path. With T-72h, (a) is the safe fix. Effort S–M. Acceptance: no reachable perpetual spinner; /judge 'deployed authority' copy matches real behaviour.
7. **MB-003 (P0)** — Stop presenting templated framing as GPT-5.6 output: label the sample framing as fixed sample content; remove per-claim personalizing copy where the text is invariant; scope 'GPT-5.6 frames the belief' to the mode where it is true. Effort S (copy/labels).
8. **MB-004 (P0)** — Codex demonstrability: expose the real Codex contribution where it exists (plan compilation events with payload diffs, bounded op IDs) in the now-fixed evidence drawer (see MB-005); where Codex is not in the runtime path, say so and point to build-time Codex evidence instead. Do NOT fake payloads. Effort M.

## Track 2 — Highest judging-score improvements (T-48 → T-12 h).
9. **MB-005 (P1)** — Wire the Evidence & proof drawer to the server event chain (data already exists at /api/sessions/<id>/events): populate Activity/Plan/Diff/Tests/Verifier/Provenance, fix the counter. Effort S–M. Biggest single trust-surface win; five agents flagged it.
10. **MB-006 (P1)** — Fix transfer gate semantics: glyphs must encode the learner's correctness, not feature properties; align instruction copy with the identify-the-risk key. Effort XS. Highest effort-to-trust ratio in the register.
11. **MB-007 (P1)** — Move the 'deceptive headline' verdict and fix description behind the prediction seal. Effort XS–S.
12. **MB-011 (P1)** — Restore Boundary payoff text to ≥4.5:1 contrast. Effort XS.
13. **MB-008 (P1)** — Bogus replay/session: render a static not-found state with recovery links; kill the spinner. Effort XS–S.
14. **MB-009 (P1)** — Label hash domains (kernel result hash vs verifier report hash) or unify; explain the two commit IDs in the bundle. Effort S.
15. **MB-010 (P1)** — Minimum: add expiry + a 'share read-only link' affordance and document the bearer-URL model on /judge; better: tokenised share links with rotation. Effort M. (For a no-account demo, documentation may suffice for judging.)
16. **MB-012/013/048 (P1)** — Pedagogy truthfulness: require one learner-authored sentence at belief and rule steps (even if optional); mastery copy → 'you completed this loop'; block capsule issuance when the claim fails sanity intake (or stamp the capsule 'claim not evaluable'). Effort S–M.
17. **MB-016 (P1)** — Claim scoping pass: every 'fixed kernels calculate'/'computes every number' line carries its evidence-mode scope; sample surfaces disclose 'recorded 2026-07-14 approved evidence' as clearly as replay does. Effort XS–S.
18. **MB-014/A15 (P1)** — One-sentence novelty + prior-art framing on /judge ('not a linter: a linter finds bugs; CounterLab breaks beliefs and signs the evidence'). Effort XS.

## Track 3 — Judge Mode and video proof (T-36 → T-6 h).
19. **MB-015** — Add a direct 'Inspect a sample Proof Capsule' download/viewer on /judge (1 click). Effort XS.
20. **MB-036** — Link the public repo from the reproduce-locally section, or remove the commands; add the /feedback Session ID + 'built with Codex' evidence to /judge. Effort XS.
21. Video: record the golden path only AFTER Track 1 fixes (video must not demo behaviour absent from the public app — P0 risk). Show: claim → seal → falsification → drawer events → transfer → repair → capsule; narrate Codex + GPT-5.6 roles truthfully.
22. **MB-032/033 spot fixes** (as time allows): skip link, textarea label, upload keyboard access, select truncation, sidebar contrast. Effort XS each.

## Track 4 — Impact-evidence collection (parallel, T-48 → T-12 h).
23. Minimum credible study (see 13 + 01): 6–12 participants, pre-test → CounterLab loop → unassisted transfer task, completion metric + 3 qualitative questions; publish protocol + raw tallies + limitations on the project page. No invented results.

## Track 5 — Optional work ONLY after Tracks 0–3 pass re-audit
- Replay stepper/chrome fixes (MB-021); staged reveal with delta encoding (MB-030); diff red/green coding (MB-026); glossary/hint system (MB-024); second subject pack surface (only if live path verified).

## Do NOT attempt before submission (see 15_DO_NOT_BUILD.md)
- New subjects/packs, accounts/gamification/classroom dashboards, more AI features, broad rewrites, mobile redesign (spot fixes only), public verifier infrastructure beyond a static verification doc.

## Freeze protocol (MB-C11)
- **T-24 h:** feature freeze; only P0 regressions fixed. **T-6 h:** final smoke test of golden path + /judge + downloads in incognito. **T-5 h:** submit. Post-deadline: no edits; monitor uptime through Aug 13.
