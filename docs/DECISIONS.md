# Decisions

## 2026-07-15 — Make hosted patch generation plan-only

- Runtime Codex receives the approved Belief Test, sanitized manifest, verified
  result summary, passed transfer summary, registered patch operations, and
  allowed cell indices. It may create only `patch-plan.json` and
  `public-rationale.md`.
- Uploaded notebook bytes remain private while Codex runs. The Worker reruns the
  external Patch Plan verifier before the authenticated runner may fetch the
  one scoped source object.
- A fixed Python entrypoint applies registered operations to a copied notebook,
  invokes the proven notebook patch verifier, and returns canonical patch
  metadata. The original upload is never overwritten.
- Live sessions use Proof Bundle v2 so artifact-specific Plan, result, patch,
  compiler events, and verifier lineage are not replaced with replay evidence.
  Proof Bundle v1 remains compatible with the approved sample and replay.

## 2026-07-14 — Make lesson progress resumable and reviewable

- The server session remains authoritative for instant/live progress; refresh
  derives the visible phase, committed prediction, confidence, revision,
  transfer outcome, and patch state from that record.
- Replay has a small browser checkpoint because it intentionally has no mutable
  server session. The checkpoint preserves its current replay screen and
  transfer phase, while the persistent replay banner continues to distinguish
  it from a live run.
- Completed steps are navigable from the lesson map but render as read-only
  evidence pages. Immutable predictions and prior evidence are never reopened
  for editing; making a different choice requires Start over and a new session.
- The reality/transfer/patch journey uses separate focused phases instead of a
  single accumulating page. Every phase change resets the viewport and focus so
  keyboard and pointer users begin at the new question.
- On small screens the lesson map keeps text labels rather than collapsing to
  unexplained dots. Design and test rationale are recorded in
  `docs/plans/2026-07-14-guided-learning-navigation.md`.

## 2026-07-14 — Revoke staged Codex authentication before the model turn

- The host creates a private temporary Codex home containing only the minimum
  launch authentication, starts App Server inside the Bubblewrap filesystem
  boundary, and completes the required handshake.
- Before `thread/start`, CounterLab deletes every staged credential file and
  revokes access to the temporary home. Model-invoked commands therefore run
  after the credential has left the guest filesystem.
- A genuine installed-App-Server run passed the revocation probe, generated only
  the three allowed files, received a structured external-verifier rejection,
  and passed after one repair. Direct or unisolated launches still fail closed.
- This supersedes the earlier requirement for a separate credential broker for
  the currently installed App Server lifecycle. It remains a version-sensitive
  OS boundary, not a formal sandbox proof, and must be requalified after material
  authentication or protocol changes.

## 2026-07-14 — Make the learning action obvious before exposing proof machinery

- Replaced the dark proof-console landing page with a bright adult-learning
  studio organized around one question, one action, and one result.
- The recommended path is now “Start the 3-minute lesson.” Notebook and replay
  paths remain visible but secondary.
- Reworded the learner state rail as `Your idea`, `Your prediction`, `What
happened`, and `Try it again`; technical product terms remain in provenance
  rather than navigation.
- Show plain-language hypothesis summaries first. Exact analyst wording,
  compiler events, result tables, hashes, and reproduction commands are still
  present behind keyboard-operable disclosures.
- Added a browser comprehension gate: the landing must keep the primary action
  in view, remain below 210 visible words, omit proof-system jargon, and avoid
  horizontal overflow on the judged mobile viewport.
- Preserved the narrow notebook support contract. Clear copy is not permission
  to claim biology, mathematics, or arbitrary-file verification without a fixed
  concept pack and evaluator.

## 2026-07-14 — Evidence-editorial product surface

- Adopted a two-polarity visual system: near-black evidence instrument for the
  product promise, bright gridded canvas for the learning workflow.
- Added a real canonical-result preview to the landing hero so judges can see
  the problem, intervention, verifier, and provenance before choosing a mode.
- Added stage-specific learner guidance framed as known, unknown, and next move.
- Added local variable-font assets through locked packages; the experience has
  no runtime font CDN dependency.
- Kept unsupported subjects honest. Broad biology, mathematics, and arbitrary
  file support still require independent concept packs, deterministic kernels,
  transfer evaluators, and frozen verifiers before they may be labelled
  supported.
- Design rationale and reference synthesis are recorded in
  `docs/plans/2026-07-14-evidence-editorial-redesign.md`.

## 2026-07-14 — Establish authority boundaries before product UI

The first implementation milestone is the deterministic leakage evidence spine. No full product UI will be started until the public fixture, safe parser, fixed kernel, canonical hashes, external verifier, and published mutation matrix pass their gates. This keeps visual presentation downstream of verified numeric truth.

## 2026-07-14 — Split local live runtime from Cloudflare replay runtime

CounterLab's complete live path needs Python and Codex child processes with OS isolation. The deployed Cloudflare surface will support edge-compatible sample/replay behavior and persistence; local-only live features will expose a typed availability result instead of fake success. A separately hosted compute service will not be invented solely to erase this platform boundary.

The concrete Cloudflare target is a React SPA and Worker API built with Vite and the official `@cloudflare/vite-plugin`, with D1 for relational session/event state and R2 for notebooks, patch copies, replays, and Proof Bundles. Cloudflare's `nodejs_compat` exposes some Node APIs, but child processes and native SQLite are non-functional stubs; this is an authority boundary, not an implementation gap to hide.

This replaces the initial OpenNext assumption after the user recommended Vite and the current Cloudflare documentation confirmed a first-party full-stack React path. It avoids carrying a Next.js compatibility layer when CounterLab's judged flow is naturally a client application backed by typed Worker endpoints. `Vite+` is not placed on the critical path because the documented Cloudflare integration is the Vite plugin itself.

## 2026-07-14 — Generate Codex wire types from the installed CLI

The live compiler will follow the stable App Server stdio JSONL lifecycle and validate only the message shapes CounterLab consumes. Version-specific types/schema will be generated from the installed Codex CLI during development and protocol checks. Browser relay code will discard reasoning items and reasoning notifications, use completed items as authority, truncate command output, and omit the model field when `CODEX_MODEL` is unset so App Server selects its current compatible default.

## 2026-07-14 — Use an evidence-notebook visual language

The interface will feel like an editorial lab notebook crossed with a CI report: warm paper surfaces, navy evidence rails, precise monospaced provenance, blue learner actions, purple hypotheses, aqua verification, gold prediction/patch state, and red only for rejected invariants. Motion will be restrained and values will never animate before verified payloads exist.

## 2026-07-14 — Freeze leakage fixture seed 1729 after gate evidence

The public fixture is frozen at 480 customers with six observations each. In the locked environment it produces a 0.390278 random-versus-group accuracy gap and a 0.311111 random-versus-ablation gap without hardcoded metrics. Seed, fixture hash, feature fingerprints, split provenance, and result hash are part of the canonical payload. Exact floating-point hashes remain environment-sensitive, so reproducibility claims are tied to the locked dependency set.

## 2026-07-14 — Distinguish core verifier truth from OS probe evidence

The Milestone 1 verifier can verify canonical numeric/provenance/chart/control invariants and reject 12 seeded mutations. It validates OS network/resource/isolation evidence when attached, but does not create the sandbox itself. Until Milestone 4 supplies those probes, reports must preserve the listed limitations and the product must not imply that kernel verification alone proves sandbox enforcement.

## 2026-07-14 — Preserve the real rejection and separate verified run

The first authenticated Codex run remained rejected after two repairs. A later
run verified only after the public SDK contract was corrected. CounterLab keeps
both traces, labels the later one as separate, and never rewrites history as a
successful third repair. A rejected run releases no result.

## 2026-07-14 — Keep generation isolation partial and defer P0.5

The recorded host App Server process inspected global skill files outside its
generation directory. Candidate execution is strongly constrained, but that
does not prove generation-time hidden-path unreadability. The gate remains
`PARTIAL`, this limitation is visible in the replay and Proof Bundle, and the
class-imbalance P0.5 concept is deferred because the constitution forbids
starting it before every leakage gate passes.

## 2026-07-14 — Keep Responses endpoint configuration provider-neutral

The live Belief Test continues to use the official OpenAI JavaScript SDK and
Responses API contract, while `OPENAI_BASE_URL` may select a compatible HTTPS
endpoint. CounterLab accepts a host root, `/v1` base, or full `/v1/responses`
URL and canonicalizes it before SDK construction. The hostname and credential
are never exposed in UI, health, evidence, logs, or replay metadata. All model
output remains subject to the same local Zod and Artifact Manifest evidence
checks; a compatible transport does not receive verifier authority.

## 2026-07-14 — Fail closed on generation read isolation

The recorded host Codex traces remain honest evidence, including their partial
read isolation, but current code will not repeat that launch. Live
`AppServerCodexCompiler` now requires a trusted launch boundary and otherwise
returns `CODEX_ISOLATION_UNAVAILABLE`; direct spawning exists only for fake unit
processes under the test environment. A real Bubblewrap probe proves the
repository, verifier, and held-out paths are absent from the intended guest
root. Because stable authentication is file-backed and workspace-write is not a
read allowlist, the product will not mount that credential merely to turn the
status green. A host credential-injecting proxy is required before the live gate
can pass.
