# GPT-5.6, Codex, verification, and security

## Technical verdict

The AI implementation is substantive. GPT-5.6 and runtime Codex are not cosmetic chat wrappers: GPT-5.6 proposes an evidence-linked Belief Spec from an approved sanitized packet; Codex compiles or repairs bounded, source-free scientific plans; fixed scorers, kernels, transfer evaluators, and frozen verifiers decide what can become authoritative. Invalid or tool-using Codex output fails closed.

Two separate first-prize gaps limit the visible credit. GPT-5.6 is currently a one-shot structured analyst with no bounded tool loop or continued inquiry state. Runtime Codex already emits a schema-constrained `labScene` that is validated and hash-bound, but the browser session/API does not expose it and the learner UI does not render it. The public `json-render` surface is only a deterministic event sequence in the collapsed proof drawer, not learner-visible generative UI.

The main claim gap is generation read isolation. The hosted Container boundary stages credentials, changes UID/GID, and sets `no-new-privs`, but does not create a filesystem namespace/read allowlist. The Codex UID can read the world-readable runner bundle and installed runtime. Output authority still fails closed, and no exfiltration was demonstrated, but the architecture cannot honestly say hidden verifier/source unreadability is enforced on the hosted path.

## Traced authority map

```text
learner claim + notebook bytes
  -> non-executing parser/support decision
  -> exact hashed evidence references
  -> learner-approved outbound packet preview
  -> GPT-5.6 structured Belief Spec proposal
  -> local schema/evidence/claim validation
  -> learner confirmation + immutable Prediction
  -> runtime Codex candidate experiment proposal and Lab Scene draft
  -> schema-valid CounterLab Experiment IR
  -> fixed eligibility gates + deterministic scorer/tie-break
  -> frozen technical + epistemic plan verification
  -> fixed Python operation interpreter/kernel
  -> independent result/binding/tri-state verification
  -> SUPPORTS | INCONCLUSIVE | REJECTED
  -> fixed Boundary Map + verifier receipt
  -> learner revision
  -> deterministic transfer evaluator
  -> separate source-free Codex Patch Plan after pass
  -> fixed copied-notebook patch + scope/result verifier
  -> Reasoning Diff + exact-byte Proof Capsule v2
```

| Actor           | May do                                                                               | Cannot authorize                                                                            | Audit status                                                                         |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GPT-5.6         | Route intent; frame two models; explain bounded signed outcomes                      | Execute notebook, choose final experiment, compute metrics, grade transfer, declare mastery | One structured Belief Spec call verified in source/tests; no live call made in audit |
| Runtime Codex   | Produce/repair bounded plan artifacts with registered operation IDs                  | Formulas, unrestricted code/commands, fixed results, verifier decision, transfer grade      | Verified in source/tests; protocol child-process scenarios partly sandbox-blocked    |
| Fixed scorer    | Apply hard eligibility and deterministic ranking                                     | Model confidence as truth; hidden result inspection                                         | Verified by tests                                                                    |
| Fixed kernel    | Own splits, preprocessing, metrics, chart data, Boundary cells, transfer scoring     | Generated formulas or result literals                                                       | Verified in TS/Python tests                                                          |
| Frozen verifier | Decide technical/epistemic validity, bindings, release, reproducibility, patch scope | Learner intention or free-form grading                                                      | Verified in tests/mutations                                                          |
| Learner         | Frame/confirm claim, lock Prediction, revise, transfer action, approve repair        | Numerical/verifier authority                                                                | Verified in state contracts/UI                                                       |

## GPT-5.6 implementation

- Official SDK/Responses-compatible interface, model default `gpt-5.6`, bounded reasoning effort.
- Structured output followed by local Zod validation; timeout/retry bounds and `store: false` where supported.
- Privacy-preserving hashed safety identifier.
- Sends a bounded packet: selected cell excerpts/hashes, output/metric evidence, schema summary, claim, support state, and stable pack rules.
- Refuses unresolved/invented/irrelevant evidence and keeps the learner confirmation gate.

Privacy limitation: sanitization recognizes common secrets and absolute paths, not all personal data. It can send up to 12 source excerpts plus field names/types and claim; `privacyClass` metadata does not itself suppress a field. Exact packet preview and extra approval mitigate this, but copy must not imply guaranteed de-identification. Add common email/phone/identifier detection, suppress explicitly sensitive fields, and state that the learner controls disclosure.

### Agentic-control and generative-UI gap

Current source behavior:

- `packages/belief-analyst/src/index.ts` makes one `responses.parse` request for a Belief Spec. It supplies no tools, does not continue with `previous_response_id`, and does not preserve an agentic reasoning thread through Test, Boundary, Apply, or Repair.
- `packages/generative-ui-contracts/src/index.ts` already defines trusted blocks for hypotheses, Prediction, controls, metrics/charts, Boundary Maps, motion, notebook evidence/diffs, transfer, Reasoning Diff, proof, and limitations.
- Codex emits `labScene` alongside the Discrimination Contract and Experiment IR; the App Server validates/materializes it, and the Worker/verifier binds its lineage.
- `apps/web/src` has no `LabSceneV2` consumer, and the browser session contract has no scene payload. `ExperimentTheater` is hand-assembled. `GeneratedProofView` translates recent sanitized events into fixed `ProofStep` rows inside a collapsed technical drawer.

Prize-quality correction is a bounded **Learning Director**, not authority expansion. GPT-5.6 may inspect only learner-approved evidence references, ask one needed clarification, select the narrative order and allowlisted trusted scene blocks, choose a verified Boundary view, provide calibrated hints, and explain signed results/limitations. It must never select the authoritative experiment, compute values, see hidden tests, decide verification, grade transfer, unlock Repair, or issue proof. Every tool call and scene decision must be schema-validated, budgeted, sanitized, auditable, and tied to current lineage; invalid output falls back to a deterministic safe presentation without changing evidence.

The browser should render the verified Lab Scene through a fixed registry. The model chooses block IDs and bindings; React owns the components; the Worker supplies only allowlisted signed result paths; the verifier checks scene/result agreement; accessible tables and reduced-motion parity are mandatory. This closes CL-023 and CL-024 without allowing generated UI to become scientific authority. Detailed acceptance tests are in `17_VISUAL_JUDGE_GENERATIVE_UI_AND_AGENTIC_CONTROL.md`.

## Runtime Codex implementation

Strengths:

- Stable App Server stdio JSONL handshake and bounded structured schema.
- At most two repairs after the first attempt; a first pass is accepted without staged failure.
- Only registered operation IDs and display-only rationale/scene descriptions.
- Tool/command/file events are rejected; output is materialized only after schema and binding validation.
- Structured verifier counterexamples are lossy and bounded; hidden test source/mutations are not included in repair prompts.
- Separate Patch Plan after deterministic transfer passes.
- Credentials are staged in a private home and revoked before the scientific turn; environment excludes model/signing credentials.

Isolation limitation:

- `ContainerCodexLaunchBoundary` checks paths, stages/removes auth, chmod/chowns workspace/home, drops groups/UID/GID, and sets `no-new-privs`.
- It does **not** use chroot, mount/user namespaces, Bubblewrap, or a read allowlist.
- The final image sets `/app/runner.mjs`, `/opt/codex`, and the installed Python environment world-readable; Codex runs as the same non-root UID as the service.
- The client treats any healthy launch boundary as satisfying an “OS-enforced generation read-isolation” requirement.

This is a P1 technological-implementation claim/invariant gap. Smallest honest fix: call it a credential-and-privilege boundary and mark generation unreadability `PARTIAL` everywhere. Prize-quality fix: a minimal mount namespace/sidecar/proxy plus a production-image black-box probe showing `/app`, verifier, fixtures, unrelated jobs, and repository paths are absent while the exact generation workspace/runtime remains available.

## Verification and epistemic trust

Confirmed strengths:

- Experiment IR rejects unknown fields, arbitrary code/imports/SQL/shell/network, raw paths, formulas, and verified result literals.
- Scorer enforces separable hypotheses, one changed variable, required controls, valid observables, decisive and inconclusive patterns, bounded cost, and deterministic tie-break.
- Epistemic verifier returns `REJECTED` for confounding, nondiscrimination, unresolved bindings, stale results, over-broad claims, or visual/explanation disagreement.
- Valid but non-discriminating evidence becomes `INCONCLUSIVE`, never a forced winner.
- Worker reconstructs compile/run/Boundary/patch authority and validates canonical hashes before release.
- Mutation suites attack stale/hard-coded values, swapped axes, units, bindings, nondeterminism, overlap, intervention drift, hidden mounts, patch scope, and unsupported cases.
- Proof Capsule v2 binds mode, artifact, Belief Spec, Prediction, selection score, IR, compiler/repair events, verifier reports, result/verdict, Boundary, revision, transfer, patch, event chain, versions, engines, limitations, and reproduction.

Trust defect:

The public legacy v1 replay retains a verified banner and real recorded metadata, but new browser-local revision, transfer, and “patched” state can be projected without server authority. Stored bytes are not mutated; the problem is an unlabeled practice overlay. Split it from read-only playback or label every local choice non-authoritative and never call its completion verified.

## Security review

### Confirmed defenses

- Intake treats notebook cells as data and does not execute them.
- Extension, MIME, size, JSON/nbformat, active HTML/JS/SVG/widgets, magics, packages, network requirements, estimators, evidence sufficiency, paths, and filenames are validated/sanitized.
- Generated paths are allowlisted; traversal, symlink, nested/unexpected output, stale binding, and oversized output cases are tested.
- Runner tokens are signed, purpose/lineage/origin/version/expiry bound, and callback/event writes are idempotent.
- API routes use no-store, restrictive API CSP, no-referrer, nosniff, and frame denial.
- Admin diagnostics require a sufficiently long secret and constant-time comparison.
- No permissive CORS opt-in was found.
- Secret scan passed 1,085 files; no secret was found in public bundle/log evidence inspected.
- Digest-pinned base images, hash-locked dependencies, non-root runner, read-only `/app`, SBOM/VEX, and scientific-engine role/integrity manifests exist.

### Confirmed or high-confidence gaps

- No repository-visible rate/cost control on public expensive routes; safe source finding only, no load test.
- Multipart parsing may buffer an absent-length body before file-size enforcement.
- Static HTML lacks the security headers applied to `/api/*`; live HEAD confirmed missing CSP/frame/referrer/nosniff/Permissions-Policy/HSTS.
- Opaque session URLs are bearer capabilities without a clear sharing/retention/revocation warning.
- Sanitization is not full PII classification.
- Hosted Codex filesystem read isolation is not enforced as claimed.

### Safely attempted adversarial questions

Source/test evidence rejects non-discriminating/confounded plans, stale evidence, forged hashes, generated self-approval, result release without verifier authority, sample/live lineage mismatch, patch-before-transfer, patching original, unsupported notebooks, traversal/symlinks, unexpected outputs, unsafe imports/network, and replay-v2 Capsule mismatch. No denial-of-service, quota exhaustion, credential probing, cross-session access, private-data access, or production prompt injection was attempted.

## Codex visibility to judges

Judge Mode explains the four authorities extremely well, but Codex appears below the first fold and the strongest public replay is legacy. The video/core live journey must make the runtime contribution visible as a bounded plan receipt:

1. show artifact-specific evidence inputs;
2. show Codex proposed registered operations and a sanitized repair counterexample if genuine;
3. show fixed scorer/verifier acceptance separately;
4. show fixed result values only after Prediction;
5. show exact Proof Capsule provenance.

Do not award implementation credit to historical adapter code, unreachable paths, or replay-only components as if they ran live.

## Test evidence

- Authority slice: 106/106 passed.
- Worker/API/UI: 124/124 passed.
- Python: 227/231 passed; four audit-sandbox permission/socket failures.
- Codex process slice: 24 passed / 18 audit-sandbox child-process failures; no external Codex call.
- Secret scan: 1,085 files passed.
- Exact commands and limitations: `evidence/test-results/agent-repo-technical.md`.

## Claim labels

- Public capability health: **Observed live**.
- Authority separation and fail-closed bindings: **Verified in source and by test**.
- Runtime Codex/GPT use on Worker #82: **Configured, not end-to-end observed**.
- Historical genuine Codex traces: **Documented and stored replay evidence; generation isolation labelled partial**.
- No secrets/exploits in public path: **No secret found in inspected evidence; absence of all vulnerabilities unverified**.
- Formal sandbox or hidden-source unreadability: **Not established**.
