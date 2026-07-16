# Decisions

## 2026-07-16 — Freeze native v5 patch authority before proof issuance

- Keep the Experiment IR transfer contract ID distinct from the fixed transfer
  evaluator task ID and bind both through the Subject Pack registry.
- Let Codex create only `patch-plan.json` and display-only
  `public-rationale.md`; keep notebook bytes sealed until the external Patch
  Plan verifier accepts the current candidate.
- Close the runner boundary on an exact ordered four-output hash set and freeze
  the Patch Plan, rationale, verification report, Patch Result, and copied
  notebook under Worker-owned immutable authority.
- Reconstruct the complete frozen compile/result/verdict/transfer tuple at
  dispatch, candidate, source, and callback boundaries. A self-consistent
  runner bundle is not enough if current session authority differs.
- Preserve legacy Proof Bundle v1/v2. A native Belief Spec/Experiment IR session
  stops at `PATCH_VERIFIED` until Reasoning Diff v2, Boundary Map authority, and
  Proof Capsule v2 exist; it must never be cast into a Belief Test proof.
- Repair the reproduced `__proto__` canonicalization ambiguity under a new
  explicit profile before issuing new Capsule hashes. Historical signed bytes
  remain unchanged.

## 2026-07-16 — Treat interactive runs as verified exploration, not new evidence

- Give v5 interactive jobs a separate strict `INTERACTIVE` bundle rather than
  weakening the authoritative LAB_RUN schema.
- Derive every control change in fixed TypeScript and Python code from the
  selected Experiment IR projection; metric focus remains display-only.
- Read compiler artifacts and completed results from Worker-owned frozen
  authority prefixes. Mutable runner output is not retrieval authority.
- Verify and publish the selected exploratory run, but never create a new
  epistemic verdict or replace the session's original result/verdict/report.
- Permit both `SUPPORTS` and valid `INCONCLUSIVE` evidence to support
  exploration; the existing patch lock for `INCONCLUSIVE` remains unchanged.

## 2026-07-16 — Normalize downstream evidence authority before learner transitions

- Treat a persisted session aggregate as untrusted input whenever revision,
  transfer, or patch eligibility is evaluated.
- Resolve one explicit legacy or v5 authority tuple and reject partial, mixed,
  hash-mismatched, concept-mismatched, or artifact-mismatched combinations.
- Allow both `SUPPORTS` and `INCONCLUSIVE` evidence to reach deterministic
  revision and transfer. Only `SUPPORTS` plus a passing transfer may unlock
  repair; `REJECTED` releases no result.
- Select the transfer evaluator from the resolved Belief Spec/result concept;
  never use a fallback concept.
- Preserve legacy sample/replay behavior as an explicit compatibility branch.
  V5 interactive, Patch Plan, and Proof Capsule contracts remain separate
  migrations and must not cast v2 objects into v1 schemas.

## 2026-07-16 — Make the Worker own v5 result readiness

- A v5 `LAB_RUN` reaches the runner only after the Worker reconstructs and
  re-verifies the complete scientific compile authority.
- The runner may execute only the fixed projected Plan and upload
  `verified-result.json`; it emits a bounded command-completed event but no
  `result.ready` event.
- Python independently validates the Experiment IR v5 schema, hash lineage,
  selected experiment, registered fixture descriptor, and resulting fixture
  content hash before returning a result.
- The Worker will emit result readiness only after its frozen technical and
  epistemic verification accepts the result. This prevents reconnect clients
  from observing a result before independent verification.
- Legacy v1/v2 runner behavior and replay evidence remain unchanged.

## 2026-07-15 — Admit only the scientific engines required by released packs

- Register the CounterLab fixed ML kernel, NumPy 2.4.6, pandas 2.3.3, and
  scikit-learn 1.9.0 as the bounded authoritative solver stack for the current
  ten operation IDs.
- Keep fixture/oracle, renderer-binding, and mutation authorities internal and
  independently integrity-bound. SciPy remains transitive only; physics and
  chemistry candidates are not admitted by roadmap mention.
- Treat the registry, Subject Pack bindings, locks, licenses, installed files,
  health checks, SBOMs, vulnerability evidence, image digest, source commit,
  tolerance profile, and golden hashes as one fail-closed authority snapshot.
- A local candidate cannot inherit production authority. Promotion requires a
  source-bound non-root image, fresh evidence, no unreviewed fixable Critical or
  High findings, Proof Capsule linkage, deployment, and production smoke.
- Keep vulnerability risk explicit. The then-current v3 candidate's eight
  fixable High findings blocked promotion; no VEX suppression was applied to
  that historical image.

## 2026-07-15 — Bundle the hosted runner into a minimal non-root image

- Bundle the Worker-facing Node service with pinned esbuild at build time and
  copy only Node, the bundle, Codex, the fixed Python environment, and public
  fixtures into the final image.
- Do not ship npm, pnpm, TypeScript, tsx, build-time node_modules, or the SBOM
  toolchain in the runner image.
- Start the Container as `10001:10001`. When the runner already has the target
  identity, use `setpriv --no-new-privs` without a redundant privileged UID/GID
  transition; retain the explicit privilege-drop branch for root-launched local
  compatibility.
- This reduced the measured local candidate from roughly 604 MB to 333 MB. It
  is a local image-size observation, not a Cloudflare cold-start claim.

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

## 2026-07-15 — Use source-free Plans for hosted execution

- Hosted runtime Codex may create only `experiment-plan.json`,
  `patch-plan.json`, and display-only `public-rationale.md`.
- The Plans contain registered operation IDs and lineage but no Python, shell,
  SQL, formulas, imports, paths, network actions, or literal results.
- A fixed Python interpreter and fixed patch engine own execution. The Worker
  independently verifies Plans and results before session state can advance.
- The adapter-code compiler remains a separately labelled advanced local proof;
  hosted Studio never falls back to it silently.

## 2026-07-15 — Attach a process-capable runner to the Cloudflare control plane

- Keep Vite/React, the Worker, D1, and R2 as the public control plane.
- Attach one Cloudflare Container through a Durable Object for scoped Codex,
  kernel, verifier, and patch jobs.
- Authorize a runner with a short-lived token bound to one job, input bundle,
  output prefix, callback, state version, and expiration.
- Treat Container disk as ephemeral and preserve authoritative inputs/outputs in
  R2/D1. The same interface can target an authenticated dedicated service if
  Container compatibility changes.

## 2026-07-15 — Constrain generative UI to public proof composition

- Use `json-render` only in the Proof Console, with a trusted registry of
  `ProofSequence` and `ProofStep` components and an empty action catalogue.
- Generate the view from already-sanitized `PublicCompilerEvent` values. The
  generated spec cannot run code, issue a command, mutate session state, or
  decide validity.
- Keep core learning actions as explicit React components and visible buttons;
  generative UI is presentation, not authority.

## 2026-07-15 — Version cross-language canonical hashing without changing replay

- Preserve the legacy Python canonical encoding for schema-v1 fixtures and
  recorded replay hashes.
- Hash hosted schema-v2 results with a browser-compatible number encoding so
  Python `0.0` and the same parsed JavaScript number `0` have identical bytes.
- Verify the exact v2 result again in TypeScript before release. This closes a
  real runner/Worker integrity mismatch without rewriting historical evidence.

## 2026-07-15 — Report held-out fixed completion separately from live generation

- Held-out v2 safely parses four leakage, four imbalance, and two refusal
  notebooks, then sends supported cases through a labelled
  `deterministic_contract_probe` for Plan verification, fixed result, transfer,
  and patch.
- Report intake/routing (10/10) separately from full fixed completion (7/8).
- Do not call the deterministic probe GPT/Codex plan-generation success. Keep
  human review `PENDING` and preserve the Random Forest patch refusal as a
  documented contract limit.

## 2026-07-15 — Keep runner signing authority asymmetric

- The Worker retains the P-256 private key and signs short-lived, purpose-bound
  job capabilities.
- The Container receives only the derived public verification key. The former
  symmetric `COUNTERLAB_RUNNER_SIGNING_KEY` secret was removed from production.
- Generated commands, the browser, and persisted public events receive neither
  signing material nor model credentials.

## 2026-07-15 — Recover ambiguous dispatches without duplicating authority

- Treat an unanswered or 5xx Container dispatch acknowledgement as ambiguous,
  not as proof that the named job was never accepted.
- Redeliver the same scoped job once. Never retry a definitive 4xx rejection.
- On refresh, idempotently reacquire an authoritative fixed run when the
  session is verified but no signed result exists, even if an earlier run
  checkpoint is present. A rejected or timed-out job still releases no result.

## 2026-07-15 — Close the v5.1 public production authority gate with exact evidence

- Bind production claims to Worker
  `ae01fe03-731f-4939-849f-e8f4eaec7f51`, Container version 10, and image digest
  `sha256:2b15a35b7f938d754467cadabf8a2f12d085c4436d5f28791cb6add6d2b7bbe1`.
- Require readiness, capability, public-secret scan, sample, replay, untouched
  leakage, and untouched imbalance to pass in one fail-closed smoke run.
- Commit the sanitized report byte-for-byte as `docs/PRODUCTION_SMOKE.json`;
  later deployments must generate new evidence rather than inheriting this
  release's authority.

## 2026-07-16 — Qualify vulnerability exceptions as exact, expiring authority

- Upgrade the runner candidate to CPython 3.13.14 and retain the complete raw
  Grype scan instead of reducing the report to a severity summary.
- Permit a fixable High only when one reviewed exception maps one-to-one to the
  exact CVE, package, version, image digest, VEX statement, and bounded
  reachability report. Fixable Critical findings remain non-exceptable.
- Prove VEX application with three scanner artifacts: unsuppressed baseline,
  exact VEX application, and a wrong-subcomponent negative control. Preserve
  the match multiset and fail if anything except the intended finding moves to
  ignored.
- Bind hosted run and patch entrypoints, source commit, SBOM, Python version,
  vulnerable module bytes, KEV check, review owner, expiry, and revalidation
  triggers. This is bounded reachability evidence, not whole-program proof.
- Keep the qualified snapshot `local_candidate` until the exact image is
  deployed and production smoke is recorded. A local pass or reviewed exception
  cannot be relabelled as Cloudflare production evidence.
- Require live Proof Bundle v2 output to include the canonical scientific-engine
  authority hash, and make a mismatched expected authority fail validation.

## 2026-07-16 — Requalify after every source-bound runner change

- Rebuild the runner whenever a Docker-copied contract, schema, or package
  changes; do not inherit evidence from an earlier locally qualified image.
- Bind the current candidate to source commit
  `095d485370e70d3b502023665fea4ebf156697ad`, local image digest
  `sha256:94c1987e54b5074b3eb075f5924ec9d757d8579584d6d59b129124065272f934`,
  and authority hash
  `d7677c79914505c11cc0474a0f3e4be7527173ea27c5640b65c7b8a373a8e881`.
- Keep local OCI identity distinct from a future Cloudflare registry/deployment
  digest. Promotion requires deployment evidence and a new public smoke.
- Record build-tool provenance separately from installed runtime tools and
  reject malformed or truncated base-image digests in release evidence.

## 2026-07-16 — Promote one-shot runner authority with distinct image identities

- Bind the qualified runner source to commit
  `095d485370e70d3b502023665fea4ebf156697ad`, local OCI digest
  `sha256:94c1987e54b5074b3eb075f5924ec9d757d8579584d6d59b129124065272f934`,
  and scientific-engine authority hash
  `d7677c79914505c11cc0474a0f3e4be7527173ea27c5640b65c7b8a373a8e881`.
- Record Cloudflare's separately produced registry digest
  `sha256:bdd65feebad10d4b0f232e945eb1bd1195b803d13fddf8eee558b2efdd5dc8c6`,
  Container version 13, and Worker
  `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab`. Never infer equality between local
  and registry digests.
- Run production Containers as one-shot job processes after the browser-safe
  response stream settles. The post-smoke inventory recorded zero active
  instances rather than retaining completed jobs as artificial capacity.
- Require one fail-closed smoke to pass readiness, capability health, public
  secret scan, sample, replay, and both untouched live concepts. Both live
  Proof Bundles must record the qualified authority hash.
- Commit that exact report as `docs/PRODUCTION_SMOKE.json`, SHA-256
  `cd5c0c05b2f007c577905630a61f7be84c71908a511ca9bffad68f76bd86431a`.
  Any later bound source, image, engine, exception, or deployment change must
  requalify and produce a new smoke instead of inheriting this authority.

## 2026-07-16 — Close runner writes before epistemic result release

- Move a v5 `LAB_RUN` to `AWAITING_APPROVAL` before independent verification so
  late runner events or output writes cannot race control-plane authority.
- Freeze and re-read the exact result bytes under a Worker-owned object prefix;
  reconstruct all compile/run hashes rather than trusting callback claims.
- Reserve verifier and result-readiness events for the Worker. Persist the
  technical report, epistemic report, and tri-state verdict before projecting
  any learner-visible result.
- Release `SUPPORTS` and valid `INCONCLUSIVE` evidence. For `REJECTED`, retain
  structured findings and release no result.
- Reconcile Worker-owned event prefixes and compare immutable evidence on
  duplicate callbacks so retries remain safe after learner progression.

## 2026-07-16 — Bind fixed result metadata outside runner claims

- Record each released Subject Pack's exact fixed fixture summary and kernel
  version in the frozen Concept Pack registry; retain the existing three-field
  execution descriptor separately so runner bundle compatibility does not drift.
- Require a result's complete fixture summary and kernel version to match that
  fixed authority, and require its top-level seed to match the selected Plan.
- Treat a valid canonical hash as integrity, not truth: rows, positives,
  prevalence, kernel version, or seed can be rehashed after tampering and must
  still fail an independent named invariant.
- Use the generated public fixed-kernel result as the class-imbalance Worker
  integration source. Do not reuse the older synthetic helper as live authority.
