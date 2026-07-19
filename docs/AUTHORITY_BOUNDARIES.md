# Authority boundaries

CounterLab separates proposal, computation, verification, and learner judgment. No model is allowed to both create an experiment and declare it valid.

## Responsibility matrix

| Authority                 | Owns                                                                                                       | May produce                                                                                                   | Must not decide or access                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Learner                   | Question, Belief Spec confirmation or rejection, immutable Prediction, revision, transfer, repair approval | Claim, confirmation, confidence, reusable rule, fixed transfer choices, patch approval                        | Experimental metrics before Prediction, verifier outcome, hidden answers                                                         |
| GPT-5.6 reasoning analyst | Evidence-linked hypothesis formalization                                                                   | Schema-valid Belief Spec, alternatives, uncertainty, candidate interventions                                  | Cell execution, experimental results, experiment selection, validity, mastery, patch unlock                                      |
| Runtime Codex compiler    | Bounded compilation of an approved contract                                                                | Discrimination Contract, Experiment IR, scene/rationale, or separate Patch Plan; advanced local adapter/tests | Metric formulas, executable hosted code, transfer scoring, final validity, hidden verifier, held-out data, secrets, upload bytes |
| Fixed Subject Pack scorer | Candidate eligibility, fixed score, deterministic selection                                                | Selected registered experiment and score breakdown                                                            | Hidden outcomes, model confidence as numeric truth, result verification                                                          |
| Fixed Python kernel       | Numeric and canonical truth for the documented Subject Pack                                                | Splits, models, metrics, overlap, Boundary cells, chart data, transfer result                                 | Learner-model diagnosis, compiler validity, prose grading                                                                        |
| Local candidate runner    | Static and OS execution policy                                                                             | Workspace-policy result, bounded execution evidence, command duration and exit status                         | Numeric truth, verifier verdict, credentials, network access                                                                     |
| Frozen verifier           | Technical and epistemic validity, result/UI binding, reproducibility, patch scope                          | `SUPPORTS`, `INCONCLUSIVE`, or `REJECTED`; invariant failures and bounded counterexamples                     | Repair implementation, learner judgment, model reasoning                                                                         |
| Cloudflare Worker         | Intake, API validation, D1/R2 control plane, sample/replay, analyst, job dispatch                          | Typed responses, scoped runner jobs/tokens, validated callbacks, reconnectable public events                  | Child processes, direct filesystem access, accepting runner self-attestation, pretending replay is live                          |
| Container runner          | Process-capable hosted workflow                                                                            | Codex stdio relay, bounded artifacts, fixed kernel/patch process evidence                                     | D1/R2 credentials, unrelated objects, browser secrets, weakening verifier contracts                                              |
| Advanced local runner     | Adapter-code proof                                                                                         | AST/workspace policy, no-network candidate evidence, host verification                                        | Weakening contracts during a session, accepting a rejected candidate                                                             |

## Evidence flow

```text
untrusted notebook
  -> safe parser (no execution)
  -> Artifact Manifest + learner claim
  -> GPT-5.6 proposal
  -> learner-confirmed Belief Spec
  -> immutable Prediction
  -> Runtime Codex bounded Discrimination Contract + Experiment IR proposal
  -> fixed eligibility/scoring/selection + structural/epistemic verification
  -> fixed allow-listed interpreter and kernel
  -> frozen result verifier -> SUPPORTS | INCONCLUSIVE | REJECTED
  -> fixed verified Boundary Map
  -> learner revision and fixed transfer evaluator
  -> separate patch compiler only after transfer passes
  -> patch verifier
  -> Reasoning Diff v2 + Proof Capsule v2
```

Each arrow narrows authority. Downstream evidence may reject an upstream proposal; upstream actors cannot override a downstream verifier.

The advanced local adapter proof follows a separate path through AST/workspace
policy and no-network candidate execution. Hosted Studio never silently falls
back to that code-authored path. Native v5 implements the epistemic tri-state
`SUPPORTS | INCONCLUSIVE | REJECTED` locally; historical binary-verifier sample
and replay artifacts retain their recorded contracts and hashes. Production
qualification for the native chain remains pending.

## GPT-5.6 boundary

The reasoning analyst receives sanitized notebook structure, code/output excerpts, metric candidates, schema summary, support state, learner claim, and concept rules. It does not receive raw fixture rows, local paths, secrets, or the complete notebook unless a future support contract explicitly requires and documents that expansion.

Live Studio first returns this sanitized input as a learner-visible preview.
The analyst call requires a hash of that exact preview; sensitive-looking
excerpts require explicit additional approval. A changed claim or artifact
invalidates the preview hash. This is an approval boundary, not a claim that a
heuristic can identify every sensitive value.

The official SDK may target an operator-configured, Responses-compatible HTTPS
base URL. Endpoint identity and credentials remain server-only configuration;
they are not part of prompts, provenance, event payloads, health responses, or
product branding. The same schema, evidence resolution, refusal handling, and
state-transition checks apply regardless of endpoint configuration.

Its output is locally validated against the Belief Spec schema and every
evidence reference must resolve to the Artifact Manifest.
`INSUFFICIENT_EVIDENCE` is a valid outcome. A model response cannot advance
session state until the learner confirms it.

GPT may explain verified evidence. It may not fabricate results, execute uploaded code, decide whether Codex output passes, or infer global mastery from learner prose.

## Runtime Codex boundary

The live implementation is `AppServerCodexCompiler` in `packages/codex-client`. It uses the installed Codex App Server over stdio JSONL, performs initialize/initialized, starts a thread and turn, and omits the model field unless `CODEX_MODEL` is configured. The experimental WebSocket transport is outside the critical path.

Launching additionally requires a trusted `AppServerLaunchBoundary`. Without
one, the compiler fails with `CODEX_ISOLATION_UNAVAILABLE`; direct spawn is
available only to fake unit-test processes. The hosted Container boundary
stages and revokes credentials, uses a fixed non-root UID plus
`setpriv --no-new-privs`, and constrains writes, but
does not provide a mount namespace or filesystem read allowlist. Filesystem
generation read isolation is therefore `PARTIAL`. The included Bubblewrap
probe proves a stronger target mount shape but is not the authenticated hosted
launcher.

The hosted lab turn is limited to approved belief evidence, public
schema/documentation, redacted fixture structure, resource limits, and permitted
outputs. Its complete generated file set is:

```text
discrimination-contract.json
experiment-ir.json
lab-scene.json
public-rationale.md
```

The hosted patch turn separately creates `patch-plan.json` and
`public-rationale.md`. Scene and rationale never determine validity. Typed
artifacts cannot contain source, commands, formulas, SQL, imports, arbitrary
paths, or literal verified results. The compiler cannot mark its own output
verified; the fixed scorer and Worker verifier check structure, lineage,
evidence, registered operations, and Subject Pack invariants before the
Container's fixed interpreter can release a result.

The advanced local proof keeps `artifact-adapter.py` and `public_tests.py`
behind its exact-file, AST, and Docker policy. It is never an implicit hosted
fallback.

If the verifier rejects a candidate, Codex receives only bounded structured counterexamples. Repair attempts are numbered `1` or `2`; both the TypeScript input contract and Python orchestrator cap repairs at two. A third repair is invalid.

After `TRANSFER_PASSED`, patch compilation uses a separate App Server process/thread and a separate generation directory. It may modify only a named notebook copy and patch metadata within the allowed cell indexes. The original upload is outside its write authority.

## Browser event boundary

App Server protocol messages are not relayed directly. CounterLab emits only validated, sanitized compiler events:

- plan summaries;
- inspected or changed file names and unified diffs;
- command summaries and bounded output excerpts;
- durations, exit codes, and command status;
- structured verifier counterexamples; and
- phase and final status.

Reasoning items and deltas, agent-message deltas and completed free-form prose, raw response items, arbitrary tool arguments, secrets, and full local paths are dropped. Unknown messages do not gain UI authority. Recognized messages with invalid shapes fail the compiler rather than being guessed at.

The hosted runner persists these events through the Worker as append-only
evidence. Browsers reconnect from a validated cursor. If the runner binding or
credential is unavailable, the Worker returns a typed setup state rather than
an artificial stream or replay substitution.

## Generated workspace and candidate execution boundary

The local runner creates a fresh direct child of a server-controlled generated root. Session IDs are constrained, existing workspaces are rejected, symlinks are rejected, and path containment is checked after resolution.

Before execution, the host requires exactly three bounded regular files, parses the plan with depth and shape limits, and applies the fixed Python AST policy to `artifact-adapter.py`. This policy rejects filesystem APIs, dynamic imports, environment access, evaluation/compilation escapes, subprocesses, sockets/HTTP clients, reflection escape patterns, and direct metric implementations within the documented adapter subset.

The candidate then runs in Docker with no network, read-only root, non-root UID/GID, dropped capabilities, no-new-privileges, process/memory/CPU/wall/output limits, a bounded temporary directory, read-only public inputs, and a dedicated output mount. No application credentials are passed to the container.

Only these targets are mounted for candidate execution:

```text
/workspace
/fixtures/customer_churn.csv
/output
```

The hidden verifier, mutation catalogue, held-out fixtures, repository secrets, and host kernel source are not candidate mounts. The host independently checks the output file set and recomputes result truth.

This is defense in depth for the documented local scope, not a claim of formal containment or resistance to every container-runtime vulnerability.

## Fixed kernel and verifier boundary

The adapter declares how to compose public SDK operations. It does not calculate accuracy, ROC AUC, entity overlap, or canonical hashes itself. The fixed kernel owns those values and produces the only payload eligible for a verified chart.

The external verifier executes outside the Codex-visible candidate workspace. It checks declared interventions, zero group overlap, identity ablation, canonical reproducibility, active label and row-order mutations, chart provenance, runner evidence, hidden-mount evidence, and supported-case status. A failure yields `REJECTED` and no verified result is released.

Verifier feedback is intentionally lossy: invariant name, observed value, expected value, and a minimal counterexample. Verifier code, mutation implementation, hidden paths, and held-out fixtures never become repair prompt content.

## Transfer and patch boundary

Transfer is scored by a fixed evaluator: forecasting/future leakage for the
entity-leakage pack and rare manufacturing defects for the imbalance pack. GPT
and Codex do not grade the learner's prose. Before `TRANSFER_PASSED`, the patch
endpoint remains locked and no patch compiler turn may start.

After transfer passes, Codex may propose a minimal change to a copy. The patch verifier owns notebook validity, allowed-cell scope, dependency allowlist, zero group overlap, recomputed metric provenance, determinism, and unchanged unrelated-cell hashes. A proposed patch that merely changes the displayed conclusion without changing evaluation design is rejected.

## Cloudflare control plane versus runner authority

The Vite/Cloudflare Worker owns edge-safe parsing, D1/R2 persistence, the
deterministic sample/replay flow, the optional analyst call, job authorization,
and final independent Plan/result verification. It does not spawn processes.

The process-capable Container runner owns one scoped job at a time and receives
only a signed input-bundle capability. It cannot query D1, list R2, mint another
token, or declare its own candidate valid. The same runner interface can target
an authenticated dedicated process service if Container compatibility changes.

This split prevents replay from being presented as generation and prevents an
unavailable runner from degrading into sample-derived success.

Operational diagnostics are private aggregate evidence only. Their bearer
secret grants no runner-job capability, and the response omits notebook text,
raw events, artifact/session/job identifiers, credentials, and configured model
endpoints.

## Replay and disabled authority

`ReplayCodexCompiler` validates stored sanitized compiler events and prepends immutable replay metadata. Replay UIs must keep the replay ID, original timestamp, and model visible for the entire session. Replay evidence has only the authority of its recorded source and integrity chain; replaying it is not a new model run.

`DisabledCodexCompiler` reports a typed setup error and cannot advance the session. Missing CLI authentication, missing sandbox, or an unsupported runtime are setup states, not verifier passes.

`replays/leakage-01/compiler` contains two authenticated App Server runs. The
first was rejected after the two-repair cap and authorized no result. A
separate later run passed the host pipeline and is the candidate associated
with the verified payload. The replay UI preserves that distinction and never
labels the later run as a third repair.

## Known limitations

- The authenticated App Server run used `gpt-5.6-sol` through Codex CLI
  0.144.4. It produced real candidate, event, prompt-hash, verifier, duration,
  exit, and status evidence; it does not establish behavior for every model or
  CLI version.
- The recorded App Server child ran as a local host process and inspected global
  skill files outside the generation directory, so that trace's generation
  isolation is explicitly `PARTIAL`. That replay remains historical evidence,
  not hosted authority. The hosted source-free Plan runner stages credentials
  for App Server initialization and revokes them before `thread/start`; child
  commands receive neither model credentials nor signing material.
- Candidate execution is containerized after generation; this does not retroactively strengthen App Server generation isolation.
- The real Docker smoke and replay reproduction return `VERIFIED` with the
  canonical fixture result hash after exercising the no-network, non-root,
  read-only boundary. Current suite totals belong in `docs/PROGRESS.md`, not in
  this architectural contract.
- Container controls are implementation evidence, not a formal sandbox proof.
- Replay mode is backed by the checked-in live compiler traces plus deterministic
  transfer and patch evidence; replaying them is not a new live run.
- The Container-backed hosted runner completed exact-version production smoke
  for untouched leakage and imbalance on Worker
  `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` and deployed image digest
  `sha256:bdd65feebad10d4b0f232e945eb1bd1195b803d13fddf8eee558b2efdd5dc8c6`.
  Both live Proof Bundles record scientific-engine authority `d7677c79…`;
  evidence is committed in `docs/PRODUCTION_SMOKE.json`.
- The hosted Container still requires outbound access for live model
  compilation. Phase-specific network denial for later fixed-process work has
  not yet been demonstrated and is not claimed.
