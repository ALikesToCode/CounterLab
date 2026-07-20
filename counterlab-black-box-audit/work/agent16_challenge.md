# Agent 16 — Challenge Pass on Swarm Consolidated Claims

**Independent basis:** my own audit (agent16_independent.md / agent16_issues.json), plus three fresh verifications run during this pass: (1) re-downloaded the repaired notebook on 2026-07-19 and recomputed its SHA-256 locally; (2) re-downloaded the proof bundle and locally validated all 20 event-chain links + inspected the `integrity` block; (3) host UTC confirmed as 2026-07-19; (4) novelty web search (3 queries). No other agent files read.

## Verdicts on positive claims

**P1 (falsification arc, ordering, repair lock) — AGREE.** Independently reproduced end-to-end: sealed wrong prediction (98% @72%) → verified 98.5%→59.4%; event order prediction.committed (seq 4) → experiment.completed (seq 7); "Fix still locked" until transfer passed. [Reproduced + Observed in generated artifact]

**P2 (artifacts real/verifiable) — QUALIFY (mostly agree, wording overclaims).** Fresh local verification this pass: re-downloaded repaired notebook SHA-256 = `eb20dc7e…a034`, exactly matching `patchedArtifactHash` and distinct from the source hash (DETERMINISTIC_PATCH_BYTES holds across days) [Reproduced]; all 20 event `previousEventHash` links valid; `eventChainHead` == final eventHash [Reproduced]. BUT "HMAC-signed" is only *declared*: `integrity{mode:"hmac-signed", algorithm:"hmac-sha256", signature:…}` exists, yet no public key, key id, or verification endpoint is exposed, so the signature is unverifiable black-box — it proves tamper-evidence, not third-party authenticity. Say "declared HMAC; chain integrity independently recomputed; signature not verifiable without key disclosure." [Observed in generated artifact + Unverified]

**P3 (fail-closed trust behaviour) — AGREE.** Reproduced: unknown replay → "Result withheld… will not substitute bundled sample evidence"; bricked session → same withholding; replay banner "not a live model run"; scope disclosures present. [Reproduced]

**P4 (best-in-class trust labelling) — QUALIFY.** Mode labels (INSTANT SAMPLE / LIVE GENERATION / Replay banner with model+verifier+commit provenance) are real and above average [Directly observed]. But "best-in-class" is execution-dependent and currently contradicted by: the dead Evidence drawer (N4), unlabelled hash-domain switch between modes (A16-06), personal-framing copy over a canned frame (A16-05/N3), the perpetual "Preparing artifact…" status with no file attached (A16-07), and the 2026-07-14 stored verification chained into sessions without UI disclosure. Intent: best-in-class. Execution: not yet. [Directly observed + Reproduced]

**P5 (design craft) — AGREE.** Experiment-Theater reveal, seal ritual, timeline visualization, and the dossier are genuinely strong. Note the same timeline visualization is the site of the N5 contradiction, so craft ≠ correctness. [Directly observed]

## Verdicts on negative findings

**N1 (P0, sceptical paths brick session) — AGREE with severity.** Reproduced both triggers independently (REJECTED_BY_LEARNER and INSUFFICIENT_EVIDENCE variants), raw state names shown, terminal "Result withheld", no working recovery. Crash-class defect on advertised interactions a judge will plausibly touch → P0 defensible. [Reproduced]

**N2 (P0, live journey dead-ends at "Preparing artifact…") — QUALIFY severity/grounding.** The stuck intake with readiness claims ("Hosted notebook runner is ready", /judge "Deployed live authority is configured") is reproduced [Directly observed]. However, no agent in this environment could set a file-upload input, so "dead-ends forever *after upload*" is Unverified — what is proven is: the no-upload state spins forever with no requirement message and the CTA silently disabled, while readiness is advertised. P0 defensible on the misleading-readiness + unusable-entry basis; the report must carry "upload path itself: Could not test" or cite an agent that actually uploaded. [Reproduced (no-upload state) / Unverified (post-upload)]

**N3 (P0, templated framing + empty Codex events + stored fixtures + nonsense→signed capsule) — QUALIFY.** Substance independently reproduced: byte-identical frame for misconception/ambiguous/nonsense-Unicode-HTML/injection claims; fixed `insufficientEvidence:false, confidence:0.93`; codex events with empty payloads; stored fixture `source:"stored-approved-leakage-v1"`, recordedAt 2026-07-14 [Reproduced + Observed in generated artifact]. Two caveats: (a) sample mode *is* labelled "Instant sample"/"Bundled approved evidence", so canned framing there is partially disclosed by design — the falsified part is the personalizing copy ("Your current explanation… capture what you mean?") and the dossier leading with GPT-5.6 while no reachable path shows it; (b) this bundles three distinct defects (framing / Codex markers / fixture-only artifacts) with different fixes — split for actionability. Severity P0 acceptable for the headline-claim falsification. [Reproduced]

**N4 (P1, dead Evidence drawer) — AGREE.** Reproduced in 3 sessions incl. completed proof page; all six tabs empty while the download contains 20 events. Flagship transparency surface non-functional. [Reproduced]

**N5 (P1, transfer ✓/× contradiction) — AGREE.** Matches my A16-01 exactly (safe combination failed 3×, leaky feature passed 1×; artifact confirms identify-the-risk semantics; instruction + ✓/× markers contradict it). "Glyphs inverted vs answer key" is fair shorthand. [Reproduced + Observed in generated artifact]

## Verdicts on scoring

**73/100 draft (17/18/17/21) — AGREE.** Matches my fully independent pre-swarm scores exactly (17/18/17/21); convergence is reassuring, not coordination. **"~85 after confirmed P0+P1 fixes" — QUALIFY:** defensible as 83–87 contingent on fixes being *verified in the app*, not just claimed. **"Prize-one ceiling ~93" — DISAGREE as stated:** a 93 ceiling additionally requires the live leg visibly working (N2/N3) and some learner-outcome evidence (C2); neither exists. 88–90 is the honest ceiling without those; do not publish 93 as fact. [Inferred from behaviour]

## Verdicts on other claims

**C1 (novelty real) — AGREE with standard caveat.** My own 3-query search this pass found no public equivalent of sealed-prediction + fixed-kernel + frozen-verifier + transfer-gated repair + signed capsule as an educational product (hits were all unrelated). Novelty is in the composition; Predict-Observe-Explain pedagogy itself is established. Absence-of-evidence caveat applies. [Documented publicly (search) + my audit]

**C2 (zero learner-outcome evidence) — AGREE.** Nothing in app, dossier, or artifacts measures learning; impact narrative is asserted, not evidenced. Correct weight: caps Potential Impact ~17. [Directly observed]

**C3 (completeness must be qualified) — AGREE.** Matches my verdict: sample+replay complete; live leg unverifiable and currently dead-ending. [Reproduced]

**C4 ("Codex necessary" not publicly demonstrable) — AGREE.** Matches A16-13: codex events are empty markers; plan/patch identical across inputs; build-time Codex proof, if any, is off-app and cannot count for "publicly demonstrable". [Observed in generated artifact]

**C5 (verification independence unproven/partly mis-presented) — AGREE.** Single Worker hosts app+verifier; sample verification is a stored 2026-07-14 record chained into later sessions (only visible in downloaded JSON); "generationIsolation: PARTIAL" not seen by me but consistent with everything observed. Independence is architectural assertion, not demonstrated separation. [Observed in generated artifact + Inferred]

**C6 (learner-centred but funnels to confirmation; pre-seal leak) — AGREE, with added direct evidence.** Beyond funneling, I independently observed the pre-seal leak: the Prediction step (before sealing) captions the notebook output "This is the **deceptive** random-split headline under test", telegraphing the verdict before the learner commits; the sample notebook's own markdown ("intentionally uses a row-wise split while retaining customer_id") does the same. The seal ritual is partly undermined in the sample. [Directly observed]

**C7 (A12's "future-dated 2026 timestamps") — DISAGREE with A12-05 (A12 is wrong).** Host UTC verified this pass at 2026-07-19T07:08Z; bundle events span 2026-07-18T20:55–21:05Z — internally consistent, nothing future-dated. The only time anomaly is the fixture's recordedAt 2026-07-14 (stored verification), which is by design and disclosed in the JSON. [Reproduced — local clock + artifact timestamps]

**C8 (A9's 12.8s "twenty seconds" defence) — QUALIFY (over-generous).** My completed session's event timestamps span ≈10 minutes end-to-end (20:55:40→21:05:46) [Observed in generated artifact]; the 12.8s kernel figure is Unverified by me and, even if accurate, covers only the compute slice. "See a belief break in twenty seconds" under a "Start sample" hero that requires 3 interactive steps before any reveal is marketing inflation — P3, not a defence. [Inferred from behaviour + Unverified]

## Issues from my audit the swarm MISSED or under-weighted

1. **A16-06 (P2): same metrics, two unlabelled "result" hashes across modes** (a6ae7652… session vs 25016542… replay) — a direct crack in the cross-mode verifiability story; not in N1–N5.
2. **A16-10 (P3): repaired notebook recomputes 0.625 vs lesson's verified 0.594** group-split accuracy, unexplained in UI (different dropped features; fingerprints differ).
3. **A16-08 (P3): homepage claim silently dropped** when routed into /new (input binding theatre at the front door).
4. **A16-11 (P3): in-step form state lost on reload** (transfer selections reset; selections never recorded as events).
5. **A16-12 (P3): stale progress chrome on error pages** ("Step 4 of 6, 3 steps ✓" shown for a non-existent replay).

## Swarm items that are duplicates / taste-only / over-severe

1. **N3 is a triple-bundle** (templated framing + empty Codex events + stored-fixture artifacts/nonsense-to-capsule) — split into three issues; different owners, fixes, and severities.
2. **N2's "dead-ends forever" overclaims certainty** — upload was untestable for every agent; downgrade the wording to the reproduced no-upload dead-end + misleading readiness, or attach an agent's successful-upload evidence.
3. **P4 "best-in-class trust labelling" is partly taste/aspiration** — fine as a positive, but it must not inflate Design while N4/A16-06/A16-05 labelling failures stand.
4. **P2's "HMAC-signed" stated as verified fact** — signature is declared, not verifiable black-box; reword (chain recomputed ✓, signature unverifiable without key).
5. **C8's 12.8s kernel timing used to validate the 20-second marketing line** — conflates compute slice with the ~10-minute interactive loop; over-generous.

## Final recommended score range

**Current public app: 70–75 (point estimate 73/100).** After verified P0+P1 fixes: **83–87**. Prize-one ceiling without a visibly working live leg and learner-outcome evidence: **88–90, not 93**. Fix leverage ranking: N5 (XS–S copy fix, largest trust payoff) → N4 (S–M, data already server-side) → N1 (S–M state-machine edge) → N3-split disclosures (S) → N2 intake-state honesty (S).
