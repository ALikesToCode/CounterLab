# Learner pilot support

This directory contains a preregistered, descriptive usability-pilot format. No learner pilot has been conducted in this repository.

- `randomization.json` is a seeded, balanced 24-slot concept-order schedule.
- `schemas/session-result.schema.json` permits only pseudonymous structured outcomes; it has no raw learner-prose or direct-identifier field.
- `schemas/analysis-result.schema.json` distinguishes `NO_DATA` from `DESCRIPTIVE_ONLY`.
- `scripts/analyze-learner-pilot.ts` validates newline-delimited session records before aggregation.

Generate the allocation schedule and analyze records with:

```bash
pnpm exec tsx scripts/generate-pilot-randomization.ts
pnpm exec tsx scripts/analyze-learner-pilot.ts evals/learner-pilot/data/session-results.jsonl
```

If the input file does not exist, analysis writes an explicit `NO_DATA` artifact. It does not invent a sample size, pass rate, learner quote, or effect estimate.
