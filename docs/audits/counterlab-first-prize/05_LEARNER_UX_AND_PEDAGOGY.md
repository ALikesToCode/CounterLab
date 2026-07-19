# Learner UX and pedagogy

## Verdict

CounterLab contains a pedagogically serious loop, not a quiz wrapper: it requires a pre-result commitment, reveals a controlled counterexperiment, asks the learner to revise a rule, tests it in a surface-different context, and withholds repair until transfer. The strongest implementation choices are the immutable Prediction, `Why this test?`, tri-state evidence, Boundary Map, deterministic transfer, and Reasoning Diff.

The public learner experience does not yet prove that loop end to end. The dominant claim-first CTA suggests a notebook is optional, then sends the learner to `Test my notebook`. The fast sample is advertised as the complete loop but uses a static Boundary explanation rather than the full Boundary Hunt/Map. Its reflection begins with the correct rule already supplied, allowing the learner to advance with limited constructive reasoning. Finally, there is no human evidence that learners complete, understand, transfer, or retain the lesson.

## Learner-loop audit

| Stage              | Pedagogical requirement                                    | Implementation/evidence                                                                                                                             | Verdict                                                                 |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Question           | Begin with a recognizable goal and exact artifact evidence | Plain “What result are you trying to understand?”, concrete prompt starters, cell/evidence references, supported-boundary copy                      | Strong for supported notebook learners; misleading for claim-only users |
| Competing models   | Make plausible explanations meaningfully different         | Belief Spec requires exactly two hypotheses, predicted patterns, alternatives, uncertainty, and evidence references; learner confirms/edits/rejects | Strong in source/tests; current public live path unqualified            |
| Prediction         | Require commitment before answer                           | Qualitative prediction plus confidence; immutable server transition; results/Boundary prohibited before lock                                        | Excellent architecture                                                  |
| Test               | Explain discrimination, not merely show a simulation       | Discrimination Contract records changed variable, controls, observable, decisive/inconclusive patterns, and `Why this test?`; fixed scorer chooses  | Strong, distinctive                                                     |
| Evidence           | Generated plans propose; fixed code decides                | Fixed kernel owns numbers; technical and epistemic verifiers release `SUPPORTS`, `INCONCLUSIVE`, or `REJECTED`                                      | Excellent, provided current release is qualified                        |
| Interpretation     | Learner interprets rather than passively consumes          | Reflection Builder and evidence links; Reasoning Diff captures before/after                                                                         | Weakened in sample by pre-populated correct rule                        |
| Boundary           | Show where the rule changes/stops                          | Native v5 Boundary Hunt/Map is bounded, signed/integrity-hashed, keyboard/table accessible                                                          | Strong in live architecture; fast sample substitutes static copy        |
| Apply              | Test generalization in a meaningfully different context    | Leakage transfers to time-ordered forecasting; imbalance transfers to manufacturing defects with changed prevalence/cost                            | Strong and appropriately deterministic                                  |
| Repair             | Distinguish understanding from correction                  | Patch locked before transfer; separate source-free plan; fixed copied-artifact transformation and verification                                      | Excellent architecture                                                  |
| Conclusion/revisit | Satisfying closure and replayable proof                    | Reasoning Diff and Proof Capsule v2; recent sessions exist only inside an active session; public legacy replay lacks Capsule                        | Strong artifact, weak return-visit discovery                            |

## Learner agency and emotional quality

Positive:

- The product never needs to label the learner “wrong”; evidence supports, is inconclusive, or the test is rejected.
- Learners own the Question, model confirmation, Prediction, interpretation, transfer action, and patch approval.
- Wrong transfer choices receive fixed, targeted feedback and keep Repair locked.
- Unsupported cases are refused rather than guessed; lower-level copy explains the narrow two-pack contract.
- `Why this test?` connects the intervention to the deployment claim, turning a metric surprise into a scientific comparison.

Risks:

- A learner without a notebook is invited to state a claim but cannot actually start the promised scientific loop.
- The sample can be clicked through more easily than the live pedagogy suggests: its Boundary is explanatory text and its correct revision is substantially supplied.
- The studio exposes “Evidence & proof,” Plan, Verifier, hashes, and commands. These are valuable on demand, but a novice can still experience the product as a verification dashboard when drawers are opened too early.
- The legacy replay permits new local transfer/repair choices beneath a verified-replay banner; this teaches the wrong lesson about what was recorded versus what the learner just reenacted.
- Returning to proof depends on retaining a URL; the landing does not surface recent investigations.

## Cognitive load and language

The six primary words—Question, Prediction, Test, Boundary, Apply, Repair—are excellent. They are simpler and more memorable than the older `Belief Test`, `Experiment Plan`, and `Proof Bundle` vocabulary still present in submission documents. The UI progressively discloses technical artifacts and keeps the primary stage visible.

The learner landing nevertheless has two mismatches:

1. `Question` and `Notebook` look like alternative input modes, while both ultimately require a notebook for live authority.
2. `Ask like chat. Prove it like science.` sets the category, but the screen does not explicitly say “for ML learners with a notebook result they do not know whether to trust.”

Judge Mode resolves most of the conceptual ambiguity. Its 98.5% versus 59.4% proof, fixed-computation copy, four-authority map, three mode cards, and bounded non-claims are clear and memorable. That explanatory success should be pulled into the learner’s first handoff and video, not replaced by more terminology.

## First-20-seconds test

| Question               | Learner landing                                                                      | Judge Mode                                            |
| ---------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| What is CounterLab?    | A place to state a claim and attach notebook evidence; category only partly explicit | A verified experiment for a notebook belief           |
| Who is it for?         | Inferred Python/scikit-learn learner                                                 | Implied notebook/ML learner; still not directly named |
| Problem solved         | Understanding what a result actually supports                                        | High scores can support the wrong deployment claim    |
| First action           | State a claim                                                                        | Start sample                                          |
| Different from ChatGPT | Fixed kernels/frozen checks, but technical                                           | Fixed computation, not fluent prose                   |
| Codex role             | Absent                                                                               | Clear after one section/scroll                        |
| Trusted evidence       | Fixed calculation plus frozen verification                                           | Fixed-kernel card, then explicit verifier             |
| Mode/status            | Desktop alternatives visible; mobile behind Explore; primary route unlabeled         | Full sample/live/replay separation below fold         |

## Impact evidence

Measured learner evidence is currently **none**:

- `docs/LEARNER_PILOT_RESULTS.json`: `NO_DATA`, zero participants, zero completed sessions.
- No measured completion rate, time to complete, first-attempt transfer, confusion/abandonment point, retention, or learner quote.
- Deterministic transfer and mutation results are system-quality evidence, not learner outcomes.

The current protocol is honest but cannot support “better than explanations” because it lacks an explanation-only comparator. The smallest credible pre-deadline study is five to eight consenting adult Python learners in a paired counterbalanced comparison: one misconception receives a concise explanation-only baseline and the other CounterLab, followed by surface-different fixed transfer for both. Record unassisted first attempt, completion, time, confusion point, and one structured reaction. Report counts and limitations only; do not claim causal efficacy. If recruitment cannot be done safely, three-person usability evidence may inform design but must be labelled usability, not learning impact.

## Highest-leverage corrections

1. On claim submit without a file, preserve the claim and show two explicit paths: attach a supported notebook for live evidence, or use an honestly labelled sample/guided lesson.
2. Make the sample’s Boundary and revision genuinely learner-active, or stop calling the sample the complete learning loop.
3. Split legacy stored playback from optional, explicitly non-authoritative practice; never project new local choices as verified replay completion.
4. Name the audience and concrete expensive misconception in the learner/video opening.
5. Surface recent investigations/proofs on the landing page without adding accounts.
6. Run the smallest credible learner comparison only after the exact public core path is stable.

## Do not add

Gamification, mastery scores, leaderboards, more chat, broad subject generation, and classroom dashboards would dilute learner agency and evidence authority. The current pedagogical loop needs completion and proof, not more mechanics.
