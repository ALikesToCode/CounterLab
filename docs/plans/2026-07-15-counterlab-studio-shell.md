# CounterLab Studio shell design

## Decision

Upgrade the existing guided lesson into an editorial experiment workspace while
preserving its proven one-decision-at-a-time learning path. The selected
direction is a progressive Studio shell: a quiet project/evidence rail on the
left, the current learner action in the center, a public agent-status rail on
the right, and a collapsible proof console below. Landing remains sparse and is
not wrapped in application chrome.

Two alternatives were rejected. A full route/component rewrite would produce
the cleanest file tree but needlessly risks the already-green sample, replay,
refresh, keyboard, and mobile flows. Keeping the current single-column lesson
and merely restyling it would be safer, but it would continue hiding the product
thesis: notebook evidence becomes a Plan, the verifier can reject it, fixed code
produces truth, and repair unlocks only after transfer.

## Experience model

The center canvas always has one dominant learner action. Evidence stays beside
the claim or hypothesis it supports. The left rail gives orientation: current
notebook, exact evidence cells, completed stages, and recent anonymous sessions.
The right rail explains the five authority phases—Analyze, Plan, Verify, Teach,
Patch—with status and the next action, never private reasoning. During compile,
the proof console opens automatically and makes Plan, command summaries,
verifier counterexamples, repair, and result readiness visible. Outside compile
it stays collapsed so it does not turn the product into a developer dashboard.

The memorable visual is an “evidence instrument”: warm paper in the learner
canvas, dark navy rails, fine notebook rules, serif conclusions, monospaced
provenance, aqua verification seals, and gold locked predictions/patches. Motion
is limited to 160–240 ms opacity/transform transitions and is disabled for
reduced motion.

## Live data flow

After prediction commitment, live mode immediately calls lab compile. If a
runner job is returned, the browser reconnects from the last event cursor,
persists only sanitized events, and polls canonical session state. A rejected or
failed job shows its public counterexample and cannot call lab run. A verified
Plan starts the separate fixed-kernel job; results appear only after the session
reaches `EXPERIMENT_COMPLETED`. Patch compilation uses the same cursor-safe job
flow and ends only at `REASONING_DIFF_ISSUED`.

Result rendering resolves runs by fixed operation, not model-selected run IDs.
Interactive controls will submit bounded fixed-operation configurations; they
will never mutate the authoritative committed result or accept literal metrics.

## Component boundaries

- `app/CounterLabStudio.tsx`: responsive workspace composition.
- `components/studio/ProjectSidebar.tsx`: artifact/evidence/progress/history.
- `components/studio/AgentRail.tsx`: public authority phase status.
- `components/studio/ProofConsole.tsx`: sanitized event tabs and provenance.
- `components/studio/CommandPalette.tsx`: keyboard and visible command access.
- `hooks/useRunnerEvents.ts`: cursor reconnect and terminal state polling.
- Existing lesson screens remain together until each extraction has a focused
  behavior test; no one-function fragments.

## Verification

Add unit tests for queued live compile/run/patch, cursor reconnect, operation-
based result rendering, commands, history, and mode labels. Extend CloakBrowser
coverage for live test runner, refresh, proof console visibility, mobile shell,
and keyboard palette. Keep the current 13 judged tests green throughout.
