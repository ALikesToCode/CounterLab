# CounterLab learner-pilot protocol

Status: protocol prepared; recruitment and data collection have not started.

## Purpose

This pilot evaluates whether adult learners can complete CounterLab's evidence workflow and apply each fixed rule to its deterministic transfer task. It is a usability and preliminary learning-signal pilot. It is not designed to prove mastery, establish causality, certify competence, or estimate a population effect.

## Participants

The planned convenience sample is 12–24 adults who:

- are at least 18 years old;
- can read English;
- have used Python or scikit-learn enough to understand train/test evaluation; and
- are not completing the pilot for a grade, employment decision, or required certification.

Recruitment must report the number invited, declined, consented, started, completed, and excluded. The target is a planning range, not an achieved sample size.

## Design and randomization

The pilot is a single-product, two-task, counterbalanced design. It has no untreated control arm.

Participants are assigned the next unused pseudonymous slot from `evals/learner-pilot/randomization.json` after consent. The fixed seed creates 24 permuted slots, balanced 1:1 between:

- `leakage_first`: entity leakage, then class imbalance; and
- `imbalance_first`: class imbalance, then entity leakage.

The assignment reduces concept-order effects. It does not support a claim that CounterLab outperforms another teaching method. Facilitators must not choose a slot based on participant characteristics or observed performance.

## Procedure

The expected session length is 20–30 minutes.

1. Present the consent form and answer questions before collecting data.
2. Assign a randomization slot and pseudonymous participant ID.
3. Give a two-minute orientation that identifies interface controls but does not explain either misconception.
4. Record the SHA-256 of the exact qualified-release receipt used for the session. Do not mix builds within one pilot dataset.
5. Run the first assigned concept through Question, immutable Prediction, Verified Test, Boundary, revision, and the fixed Apply task.
6. Run the second assigned concept through the same sequence.
7. Show the Reasoning Diff only after the relevant transfer result.
8. Debrief the participant, explain the synthetic cases, and provide the withdrawal procedure.

Facilitators may resolve navigation or accessibility problems. They must not suggest a prediction, revision, transfer choice, or correct answer.

## Measures

The structured pilot export records only:

- session completion;
- first-unassisted deterministic transfer pass/fail per concept;
- whether the committed prediction differed from the observed result;
- per-task duration in seconds;
- bounded confusion categories;
- a bounded abandonment reason for an incomplete session;
- closed clarity and usefulness reactions;
- randomized assignment slot; and
- session timestamps, a separate opaque consent reference, and the exact qualified-release receipt SHA-256.

The pilot export intentionally excludes names, email addresses, IP addresses, raw learner claims, revision prose, notebook uploads, model reasoning, and free-form quotes.

Primary descriptive measure:

- transfer pass rate across completed concept tasks.

Secondary descriptive measures:

- session completion rate;
- prediction/result difference rate;
- confusion-observed rate and bounded confusion-category counts;
- abandonment rate and bounded abandonment-reason counts;
- closed clarity and usefulness reaction counts;
- median task duration; and
- task count and transfer passes by concept.

These measures are behavioral events inside two fixed tasks. They do not measure durable retention or general mastery.

## Data quality and exclusions

A session is included only when:

- consent version `1` was recorded before the start time;
- participant and assignment IDs are unique;
- its assignment exists in the tracked seed-1729 randomization and task order matches that assignment;
- the session is bound to the same frozen qualified-release receipt SHA-256 as every other included session;
- a completed session contains one task for each concept; and
- timestamps and durations pass the published schema.

Incomplete sessions remain in the completion denominator and contribute only tasks they actually finished. Invalid or duplicate records fail analysis instead of being silently repaired. Every exclusion and its rule must be reported without exposing identity.

## Analysis plan

`scripts/analyze-learner-pilot.ts` validates every JSONL record against the local Zod schema and produces `docs/LEARNER_PILOT_RESULTS.json`.

The analysis is descriptive:

- counts and rates use all schema-valid records under the rules above;
- task duration uses the median;
- concept results are reported separately;
- bounded confusion, abandonment, and reaction categories are reported only as aggregate counts;
- the exact qualified-release receipt SHA-256 is reported once for a non-empty aggregate;
- `NO_DATA` is emitted when no records exist; and
- no p-value, confidence interval, effect size, or causal comparison is produced for this uncontrolled pilot.

If fewer than 12 participants complete both tasks, the report must state that the planning range was not reached. Regardless of sample size, results must retain the convenience-sample, no-control, fixed-task, and short-term limitations.

## Privacy, retention, and access

Use random pseudonymous IDs unrelated to contact details. Exact timestamps and linked pseudonymous IDs remain restricted data; do not describe them as anonymous. Recruitment contact information and consent records must be stored separately from session exports. Do not place participant rows, consent rows, contact information, or withdrawal material in the repository.

Only the study facilitator and named project owner should access row-level session records. Publish aggregates only. Delete row-level exports after the retention period disclosed during recruitment or immediately after a valid withdrawal request when the pseudonymous record can still be located.

The machine-readable aggregate does not contain recruitment denominators. Invited, declined, consented, started, completed, and excluded counts must be reported separately as aggregate-only operational evidence.

## Safety and stopping rules

Participation is voluntary and may stop at any time without penalty. Stop a session if the participant withdraws, becomes distressed, or encounters an accessibility barrier that cannot be resolved without revealing answers. The facilitator records only an incomplete structured session unless the participant requests deletion.

Any change to eligibility, measures, task content, randomization, or analysis after data collection begins must be versioned and disclosed as a protocol deviation.

## Reporting discipline

Do not report a learner-study outcome until consented records have been validated and the analysis artifact has been generated. Never invent participant quotes, completion rates, effect sizes, or sample counts. CounterLab may report this protocol as prepared; it may not report the pilot as conducted while the analysis status is `NO_DATA`.
