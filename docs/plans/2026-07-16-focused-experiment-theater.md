# Focused Experiment Theater refinement

## Decision

Refine the existing evidence-editorial interface instead of replacing the proven learning journey. The learner canvas remains warm and typographically expressive, while the project/evidence rail becomes the single dark authority surface. The permanent right-side agent rail is removed because it competes with the learner action and conflicts with the current no-cockpit product rule. Public compiler activity and authority details remain available in the collapsed proof drawer.

## Changes

- Move the Studio shell from three columns to a two-column evidence-rail and learner-canvas layout.
- Increase all persistent Studio labels to at least 12 px, secondary text to at least 13 px, and interactive targets to at least 44 px.
- Widen the central Experiment Theater and preserve its existing route, state, evidence, and action behavior.
- Restyle the evidence rail as deep navy with clear selected, completed, and verified states.
- Increase the proof drawer, command palette, top progress map, mode label, and footer typography without exposing new data.
- Retain current real notebook evidence, sample/replay labels, reduced-motion behavior, and mobile recomposition.

## Verification

- Focused React tests for the Studio shell and navigation.
- Web Vitest suite and strict TypeScript checks without `build` or `dev`.
- Static DESIGN.md lint.
- Deployed pre-change audit plus post-change DOM and screenshot audit after the user runs the updated surface, because this repository forbids starting a local dev server.
