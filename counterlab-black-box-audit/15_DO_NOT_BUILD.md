# 15 — DO-NOT-BUILD LIST (pre-submission and near-term)

Each item below would dilute the central idea, create scope creep, weaken verification, overpromise generality, clone the AI-tutor pattern, or consume the remaining ~72 hours without adding judge-visible evidence. Every entry names the pressure that will make it tempting and why it loses.

1. **New subject packs / domains (beyond entity leakage + class imbalance).**
   Temptation: "generality = impact." Reality: each pack needs documented notebook patterns, kernels, and verifier invariants; an unverified second pack re-creates MB-003-class risk. The honest two-pack scope is currently a *strength* (judges praised bounded claims in similar hackathons). Revisit only after the live path is verified end-to-end.

2. **Accounts, login, learner profiles, classrooms, teacher dashboards.**
   Adds auth surface (new security obligations), state complexity, and zero judging-criteria coverage. Bearer-URL sharing (MB-010) needs expiry + documentation, not an account system.

3. **Gamification (streaks, badges, XP, leaderboards).**
   Dilutes the epistemic brand; the product's differentiation is proof, not engagement mechanics. The mastery-overclaim issue (MB-012) is already too much unearned reward language.

4. **More AI in the loop (chat tutor, free-form Q&A, AI-graded explanations, 'ask the verifier').**
   Every added model surface re-opens the authority problem (MB-003/MB-004) and the evaluation-integrity problem (prose grading vs fixed-code scoring). The product wins by *restricting* what AI may assert.

5. **A public verifier / cryptographic attestation service (key publication, remote attestation, zk-anything).**
   Correct long-term direction, impossible to do credibly in the window; a half-built version deepens the 'self-signed proof' scepticism (MB-036). Instead: a static 'How to verify this bundle' doc + labeled signature status.

6. **Broad UI rewrite / design-system swap / mobile app.**
   The design foundation is good (Agent 6); targeted fixes (MB-005/006/011/031/032-spot) recover most of the Design score. A rewrite guarantees new P0s at T-72h.

7. **Real-time collaboration, comments, sharing feeds, public galleries of learner capsules.**
   Scope creep + privacy obligations; no criterion coverage.

8. **Notebook execution in the browser / arbitrary code runner.**
   The product's safety story is 'we read evidence and never run cells'. Breaking that inverts the security model and the trust pitch.

9. **Analytics/telemetry dashboards (for the team or the user).**
   No judge-visible value; the needed impact evidence is a small honest study (Track 4), not instrumentation.

10. **Internationalization, new onboarding tours, marketing pages, blog.**
    The comprehension fix (MB-014) is one sentence of delta copy and a track-fit anchor — not a content program.

11. **'Just make the sample live' — i.e., quietly serving stored fixtures under live labelling.**
    This is the single most dangerous path: it converts fixable P1s into a permanent integrity P0 if discovered. All sample/replay/live labelling fixes must move toward *more* disclosure, never less (MB-002/003/004/016/023).

12. **Performance engineering, caching layers, Workers optimization.**
    No measured user-facing performance problem exists (Agent 9+13: server phases are sub-second to ~13 s by design). Do not spend hours here.
