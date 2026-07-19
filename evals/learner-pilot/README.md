# Learner pilot support

This directory contains a preregistered, descriptive usability-pilot format.
No learner pilot has been conducted, and no participant records are stored in
the repository.

## Restricted pseudonymous v2 boundary

- `randomization.json` is a seeded, balanced 24-slot concept-order schedule.
- `schemas/session-result-v2.schema.json` accepts pseudonymous outcomes only.
  It records the first unassisted transfer attempt, bounded confusion
  categories, a bounded session-abandonment reason, and closed clarity and
  usefulness reactions. Each row is bound to one exact qualified-release
  receipt hash. It has no free-text, quote, name, email, IP address, notebook,
  or consent-content field.
- `schemas/consent-reference-v1.schema.json` contains only an opaque reference,
  pseudonymous participant ID, consent version, and timestamp. The actual
  consent record and withdrawal material stay outside this export.
- `validatePilotSessions` resolves every session against the fixed assignment
  registry, enforces the assigned task order, and requires a unique matching
  consent reference recorded before the session begins.
- `schemas/analysis-result-v2.schema.json` reports aggregates only and
  distinguishes `NO_DATA` from `DESCRIPTIVE_ONLY`. A descriptive result retains
  the one frozen qualified-release receipt hash without retaining participant
  or consent-reference IDs.
- `data/.gitignore` prevents pseudonymous row-level exports from being staged
  accidentally. Do not override that safeguard or commit participant rows.

Exact timestamps and linked pseudonymous IDs are restricted study data, not
anonymous data. Keep row-level session and consent-reference exports outside
Git with access limited to the facilitator and project owner. The repository
contains no real participant rows.

The original v1 JSON Schemas remain as historical protocol artifacts. New data
collection must use the v2 session and analysis schemas and the consent-reference
schema. A non-empty call to `analyzePilot` fails closed unless it receives the
fixed randomization, consent-reference, and qualified-release validation
context.

Generate the allocation schedule and aggregate the default protected exports
with:

```bash
node --import tsx scripts/generate-pilot-randomization.ts
node --import tsx scripts/analyze-learner-pilot.ts
```

The analyzer accepts optional repository-contained session and consent JSONL
paths as its first and second positional arguments. Only an absent default
session file produces `NO_DATA`; a missing explicit input fails. Non-empty
sessions require consent references, the tracked fixed randomization, and one
64-character qualified-release receipt hash shared by every session. The
aggregate never invents a sample size, pass rate, reaction, learner quote, or
effect estimate.
