# 01 — EXECUTIVE VERDICT

```text
Stage One readiness:     AT RISK — 6 unverified submission-compliance P0 risks (MB-C01…C06) must be closed by 2026-07-21 17:00 PT
Current strict score:    73/100 (Tech 17 · Design 18 · Impact 17 · Idea 21), range 70–75
Likely score range:      70–75 current · 83–87 after confirmed P0+P1 corrections · 88–90 realistic prize-one ceiling without a working live leg + outcome evidence
P0 count:                10 (4 product defects, multi-agent reproduced · 6 submission-compliance risks, unverified)
P1 count:                19 (14 product · 5 compliance)
P2 count:                23
P3 count:                9 (includes 1 rejected finding kept for transparency)
First-prize readiness:   NOT READY — winnable within the T-72h window if Tracks 0–3 of the roadmap land; the idea scores highest, the proof surface scores lowest
Public build tested:     https://counterlab.cserules.workers.dev/ (+ /judge, /new, /session/*, /proof/*, /replay/leakage-01, /api/health, /api/sessions/*, /api/replays/*)
Audit date:              2026-07-19 (deadline verified: 2026-07-21 17:00 PT / 2026-07-22T00:00Z)
```

## Five strongest aspects
1. **A real falsification arc, not confirmation-bait.** A sealed wrong prediction (98% @ 72% confidence) is genuinely contradicted by computed evidence (98.5% → 59.4% under entity-respecting splits); ordering is enforced (prediction sealed ~77 s before result release); repair stays locked until transfer. Reproduced by 3+ independent agents and confirmed in the signed event log.
2. **Verifiable artifacts.** Downloads are real: a hash-chained event bundle (12–20 events; all 20 chain links re-validated; repaired-notebook SHA-256 recomputed locally = `patchedArtifactHash`) and a valid patched .ipynb with a genuine GroupShuffleSplit repair. Caveat per red team: 'HMAC-signed' is declared, not key-verifiable black-box.
3. **Fail-closed trust behaviour.** Unknown session/replay IDs withhold results ('will not substitute bundled sample evidence'); replay carries a persistent honest banner; scope disclosures ('not global mastery', two Subject Packs) are unusually candid for a hackathon.
4. **A genuinely novel, ownable composition.** Independent novelty scan + red team concur: sealed-prediction + fixed-kernel adjudication + frozen verifier + transfer-gated repair + signed Proof Capsule has no public equivalent. The line a judge remembers: 'Ask like chat. Prove it like science.'
5. **Design craft at the key moments.** Experiment-Theater reveal, gold prediction-seal ritual, transfer timeline visualization, editorial /judge dossier with a four-authority story (GPT-5.6 frames → Codex compiles → kernel computes → verifier decides).

## Five largest risks
1. **MB-003/MB-004 (P0): the AI-authority story is falsified in every publicly reachable path.** 'GPT-5.6' belief framing is a byte-identical template across sensible, absurd, and contradictory claims (confidence 0.93, insufficientEvidence:false); Runtime Codex events are empty markers over a 2026-07-14 stored fixture (compile→verify in ~360 ms). A sceptical judge who pokes the surface will conclude the core claim is theatre. (Scope caveat: live upload path untestable — see 17.)
2. **MB-001 (P0): the product punishes epistemic virtue.** The two most honest learner moves — 'Reject' and 'Not enough evidence' — permanently brick the session with raw state-machine errors and no recovery. Reproduced by 3 agents.
3. **MB-002 (P0): the advertised live journey dead-ends.** Entering live mode without an upload hangs forever at 'Preparing artifact…' while /judge asserts 'deployed live authority is configured' — live-vs-sample ambiguity on the flagship differentiator.
4. **MB-005 (P1): the flagship transparency surface is empty.** The Evidence & proof drawer shows '0 events' on every surface despite 12–20 server-side events — the single most-reproduced defect (7 agents).
5. **MB-C01…C06 (P0, unverified): submission compliance.** Session ID, voiceover video, repo/README/license, GPT-5.6 evidence, uptime through judging — any one missed = incomplete submission regardless of app quality.

## All P0 findings (product) — summary
- **MB-001** Refusal paths brick session, raw internal state names, no recovery (A4/A16/A10, reproduced).
- **MB-002** Live no-upload entry infinite 'Preparing artifact…' vs 'configured' claims (A1/A3/A4/A6/A9/A16; post-upload untestable).
- **MB-003** Templated 'GPT-5.6' framing with personalizing copy across all claim classes (A10/A5/A16).
- **MB-004** Runtime Codex not demonstrable; stored-fixture artifacts in live-styled sessions (A10/A2/A9/A16/A3).
(Compliance P0s MB-C01…C06: see 12_DEVPOST_REQUIREMENTS_AND_SCORECARD.md.)

## Ten highest-value corrections (leverage-ordered)
1. Fix transfer-gate ✓/× semantics (MB-006) — XS effort, restores the one scored interaction's integrity.
2. Wire the evidence drawer to the existing event API (MB-005) — S–M, converts the product's best hidden asset into its headline surface.
3. Un-brick refusal paths + scrub state names (MB-001) — S, removes the demo-killer.
4. Gate live entry on real intake or disable it honestly (MB-002) — S–M, kills the live-vs-sample P0.
5. Label templated framing; scope GPT-5.6/Codex claims per mode (MB-003/004/016) — S, converts 'faked AI' risk into 'honest sample' strength.
6. Move the verdict behind the seal (MB-007) — XS, restores the prediction contract.
7. Restore the Boundary payoff to ≥4.5:1 contrast (MB-011) — XS, the lesson's key sentence is currently unreadable.
8. Put a 1-click sample Proof Capsule on /judge + link repo/Session ID (MB-015/036/039) — XS, satisfies the default submission-only judging path.
9. Static not-found states (MB-008/022) — XS–S, stops eternal spinners on judge probes.
10. Run the minimum credible learner study and publish it (Track 4) — M, the only cure for an Impact score built on zero outcome evidence.

## The most likely reason the project LOSES
A judge (or the submission-only page review) concludes the AI story is decorative: templated 'GPT-5.6' framing, empty Codex events, a dead live path, and an evidence drawer that shows nothing — while the Devpost criteria explicitly score 'how thoroughly and skillfully the project uses Codex'. Second-place pressure comes from any competitor with a humbler but *demonstrably real* model loop.

## The most likely reason the project WINS
No other submission owns this category: a learning tool where reality — not fluent prose — grades the learner's sealed belief, with fail-closed verification, honest sample/replay labelling, and signed artifacts a sceptic can recompute. The idea, the falsification moment, and the trust architecture are all first-prize grade if the proof surface is made visible and the claims are scoped truthfully.

## Highest-leverage next action (do first)
In the next 4 hours: (a) fix MB-006 glyphs (XS), (b) wire the drawer to the events API (MB-005), (c) patch the live-entry gate copy/behaviour (MB-002 smallest fix), (d) fill every Devpost compliance field (MB-C01…C05). These four move the expected score from 73 to ≈80 before any deeper work.

## Critical facts that CANNOT be verified without repository access
1. Whether live uploaded-notebook sessions run genuine GPT-5.6 framing + Codex compilation (decides if MB-003/004 are copy fixes or runtime fixes).
2. Build-time Codex usage (the hackathon's actual requirement) and the /feedback Session ID.
3. HMAC key custody / verifier trust-domain separation.
4. Root causes: dual result hashes (MB-009), empty drawer (MB-005), transfer-gate key vs glyphs (MB-006).
5. Docker sandbox enforcement and rate limiting.
