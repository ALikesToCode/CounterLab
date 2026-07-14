# Guided learning navigation and state design

Date: 2026-07-14

## Problem observed

The evidence pipeline was correct, but the product behaved like a long report.
Later in the lesson, results, revision, transfer, patching, and provenance were
stacked on the same page. Refresh restoration was incomplete for replay, the
header was only a progress indicator, and returning home depended on an
unexplained logo action. On phones, the progress map reduced to unlabeled dots.

This created three learner problems:

1. The current decision was visually buried under completed material.
2. A learner could not confidently inspect a prior choice without risking the
   immutable evidence chain.
3. Refresh, backtracking, and restart did not have clear, consistent meanings.

## Approaches considered

### Browser history routes for every substep

This would make each screen addressable, but would duplicate the canonical
session state in URLs and introduce ambiguous behavior when a learner navigates
to a future or no-longer-editable step.

### One scrolling page with anchors

This was closest to the previous implementation. It preserved context but made
the lesson feel increasingly complex and did not solve immutable backtracking.

### Focused phases with a read-only lesson map

Chosen. The current task owns the main viewport. Completed stages are reviewable
through the header, future stages are disabled, and the learner returns to the
canonical current phase with one action. Editing a historical Prediction
Contract is impossible; Start over creates a fresh path.

## State and restoration rules

- Instant and live modes persist only the session identifier, mode, and learner
  claim in the browser. The Worker session is authoritative for the current
  state and all immutable evidence.
- A committed prediction restores both its normalized UI choice and exact
  confidence value from the server payload.
- Revision, transfer, patch, and Proof Bundle state derive from the restored
  session, so a final refresh returns to the Reasoning Diff.
- Replay mode stores a narrow UI checkpoint because it intentionally has no
  mutable learner session. The checkpoint includes build/reality position,
  transfer phase, and learner revision. The replay banner remains visible after
  every refresh.
- Start over deletes only CounterLab-owned browser keys and resets the React
  state. It does not delete or rewrite server evidence.

## Interaction model

- `Question → Your guess → Fair test → Learn & apply` is a labelled navigation
  map, not decorative status text.
- Completed stages open dedicated read-only review pages with a clear lock
  explanation and Return to current step action.
- Future stages remain disabled. Selecting the current stage returns from review
  to the active task.
- Reality, transfer, patch unlock, and completion are separate screens. No chart
  or result is introduced before the verified-result state.
- Every screen and subphase transition disables browser scroll anchoring,
  returns to the top synchronously, and focuses the phase heading when useful.
- Mobile retains stage labels in a two-row sticky header and exposes Reset as a
  text control.

## Verification contract

The browser suite proves:

- refresh restores the current lesson and exact committed prediction;
- replay refresh preserves both the visible screen and replay banner;
- completed steps have no editable radio controls;
- reset returns to the landing page and removes the saved session identifier;
- each transfer/patch subphase starts at the top and hides the prior phase;
- transfer failure keeps patch compilation unavailable;
- the complete mobile path is keyboard operable with reduced motion and no
  horizontal overflow.

Release evidence: 104 root Vitest tests, 29 web/Worker Vitest tests, 98 Pytest
tests, and 13 CloakBrowser Playwright journeys passed locally. The same 13
browser journeys passed against Cloudflare Worker version
`fd8fafd7-ae39-4580-8fac-9b4bc14d1d24`.
