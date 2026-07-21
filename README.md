# CounterLab

**Ask like chat. Prove it like science.** CounterLab is a scientific debugger
for beliefs: it formalizes a claim, commits a prediction, runs a discriminating
test, refuses invalid evidence, verifies transfer, and only then unlocks repair.

> Chatbots explain. CounterLab lets reality answer.

CounterLab is a narrow Education-track product for machine-learning evaluation
misconceptions in supported Jupyter notebooks. Its released Subject Packs cover
entity leakage and class imbalance/metric choice; it is not a generic notebook
copilot or an unrestricted code runner.

**Live judge surface:** <https://counterlab.cserules.workers.dev/judge>

The v6.1 learner UX is implemented locally on
`feat/learner-ux-v6.1` and has current local CloakBrowser evidence. It has not
yet been pushed, deployed, or qualified as one exact public source/image/Worker
tuple. The public URL represents its separately recorded historical deployment
and must not be treated as running this branch.

The first screen states the operating contract directly: CounterLab is a
**belief debugger, not a tutor or notebook linter**. Its visible sequence is
`State claim → lock Prediction → controlled test runs → result passes
verification`. GPT-5.6 proposes a bounded belief frame, Runtime Codex compiles
an allowlisted experiment plan, fixed kernels compute values, and the frozen
verifier decides whether evidence may be released. No live call begins on the
landing screen.

## Learner journey

CounterLab presents one six-stage path while preserving the existing scientific
state machine and authority gates:

1. **Question** — state a claim or attach a supported notebook. Sample prompts
   are optional. **Start verified sample** and **Judge Mode** are the first
   visible cold-user paths; claim testing remains available immediately below.
2. **Prediction** — review exact notebook evidence and the sanitized packet,
   confirm that the two-model comparison captures the learner's view, then seal
   an immutable categorical prediction and confidence.
3. **Test** — see why the selected intervention is fair, what changes, and what
   remains controlled while the bounded compiler, scorer, runner, and verifier
   do their separate jobs.
4. **Boundary** — inspect one verified comparison, try a bounded Boundary Hunt,
   and reveal the full accessible Boundary Map without asking a model or
   calculating authoritative metrics in the browser.
5. **Apply** — write or assemble a reusable rule and complete the deterministic
   timeline or cost transfer.
6. **Repair** — preview the exact correction and preserved scope, download the
   verified notebook copy, review the Reasoning Diff, and export the Proof
   Capsule.

Desktop shows compact reviewable progress. Mobile shows `Step n of 6` with an
accessible progress dialog. Technical contracts, hashes, event detail, and raw
proof remain available on demand in **Evidence & proof**. The implementation and
local verification record is in
[the v6.1 learner UX evidence](docs/LEARNER_UX_V6_1_EVIDENCE.md).

## Judge Mode

| Path            | Session mode      | GPT-5.6 / Runtime Codex                                                                            | Numerical source                                                 | Mutability                                                                                          | May claim                                                                  | Must not claim                                                                                   |
| --------------- | ----------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Verified sample | `sample_lesson`   | No live call; reviewed Subject Pack framing                                                        | Integrity-checked bundled fixed-kernel fixture                   | Learner inputs may advance a new Sample session; the verified fixture is immutable                  | The scoped fixed Sample demonstrates the recorded mechanism                | A live run, artifact-specific analysis, or newly calculated browser result                       |
| Live notebook   | `live_notebook`   | Server-side calls may occur only after supported upload, packet approval, and capability admission | Fixed scorer, kernel, and frozen verifier bound to that artifact | Explicit persisted state transitions; original upload remains read-only and patching targets a copy | The bounded artifact-specific result and provenance that actually occurred | Authority when capability is absent, an unsupported notebook result, or a Sample/Replay fallback |
| Verified replay | `verified_replay` | No new model or compiler call                                                                      | Stored validated events and signed or integrity-bound payloads   | Read-only                                                                                           | A reconstruction of the specific recorded verified session                 | A current rerun, a new configuration, or live capability                                         |

Sample is not live and cannot enter a live session. Replay does not make a new
model call or borrow sample authority. The rejected compiler run authorized no
result; the replayed result is tied to the separately verified candidate and
fixed kernel hash. The v6.1 pass adds one interactive leakage Boundary Hunt
backed by a versioned, precomputed fixed-kernel fixture. It does not add an
arbitrary sample configuration matrix, and the browser never computes a
substitute authoritative result.

Visible source labels preserve that separation: learner-authored framing is
`Your input`; reviewed fixed framing is `Reviewed Subject Pack draft`;
`AI-suggested draft` appears only with genuine model provenance. During a live
test, `Generated planning`, `Fixed testing`, and `Verified result` are derived
from the real runner job kind and result-ready evidence. Artifact surfaces say
`Bundled sample artifact`, `Uploaded notebook`, or `Replay artifact`; a
route/session mode mismatch withholds proof instead of guessing.

## Supported notebook contract

CounterLab accepts `nbformat` 4 `.ipynb` files up to 10 MiB containing the
documented Python/scikit-learn subset, safe text/JSON outputs, and evidence for
either entity leakage or class imbalance/metric choice. Intake hashes and
sanitizes the file; it never executes a cell.

Unsupported magics, active HTML/JavaScript/SVG/widgets, network dependencies,
unknown packages, corrupt JSON, oversized files, and missing decisive evidence
produce typed reasons. Unsupported uploads cannot advance. See
[the support contract](docs/SUPPORT_CONTRACT.md).

## Who generates and who decides

### GPT-5.6 proposes

The official OpenAI JavaScript SDK and Responses API produce a structured
Belief Spec from sanitized evidence, the learner's claim, and Subject Pack
rules.
The server defaults to `OPENAI_MODEL=gpt-5.6` and
`OPENAI_REASONING_EFFORT=medium`, uses `store: false`, hashes the session into a
safety identifier, and resolves every evidence reference locally. Invalid,
unsupported, or unresolved output cannot advance state.

`OPENAI_BASE_URL` optionally selects a compatible Responses API endpoint. It is
server-only and may be configured as an HTTPS host root, a `/v1` base, or the
full `/v1/responses` endpoint; CounterLab normalizes all three to the SDK base
and never returns the endpoint in health, events, evidence, or browser state.

Before a live call, Studio shows the exact sanitized packet: concept routing,
claim, schema summary, support state, and bounded evidence excerpts. The learner
must approve that packet; sensitive-looking excerpts require a second explicit
confirmation. Editing the claim or artifact invalidates the approval.

### Runtime Codex generates

For the hosted scientific compile, Codex App Server over stdio JSONL generates
only:

```text
discrimination-contract.json
experiment-ir.json
lab-scene.json
public-rationale.md
```

The separate hosted repair turn may generate only `patch-plan.json` and
`public-rationale.md`. Typed JSON can compose registered fixed operations but
cannot contain source code, commands, SQL, formulas, imports, arbitrary paths,
or literal verified results. `lab-scene.json` and `public-rationale.md` are
display-only. Codex may receive structured verifier counterexamples and gets at
most two repair attempts. Browser events contain sanitized plans, files, diffs,
command summaries, durations, exit codes, and verifier counterexamples—never
private reasoning.

The separate advanced local proof retains the older three-file adapter path
(`experiment-plan.json`, `artifact-adapter.py`, and `public_tests.py`) behind AST
policy and a no-network container. It is never used silently by hosted Studio.

### Fixed code selects and computes

The Subject Pack scorer alone applies eligibility gates, scores candidates, and
selects the final experiment. Fixed kernels own fixture generation,
random/group/stratified splits, preprocessing, model training, entity overlap,
majority baselines, confusion counts, accuracy, precision, recall, F1, PR-AUC,
contextual ROC-AUC, threshold and prevalence scenarios, Boundary Map cells,
transfer scoring, canonical serialization, and chart-ready results.

### The frozen verifier releases

For the documented concept contracts, the verifier establishes named properties
such as zero group overlap, identity removal, controlled variables, majority
baseline computation, confusion-matrix consistency, threshold/prevalence
response, label responsiveness, deterministic hashes, honest chart payloads,
runner controls, result-to-UI binding, and changed-cell scope. Only verified
payloads may drive result-bearing learner visuals. It does not prove global
mastery, causality, or formal sandbox security.

### The learner decides

The learner owns the Question, confirms whether the Belief Spec captures their
meaning, seals the Prediction, authors the revision, takes the transfer action,
and approves repair. CounterLab never reduces that role to accepting a model's
answer and never grades learner prose as experimental authority.

The complete authority matrix is in
[docs/AUTHORITY_BOUNDARIES.md](docs/AUTHORITY_BOUNDARIES.md).

## Architecture

Evidence release follows one bounded authority chain:

```text
Question / supported artifact
          │
          ▼
sanitized packet ──► GPT-5.6 proposal
          │
          ▼
Runtime Codex typed plan ──► fixed candidate scorer
          │
          ▼
fixed kernel result ──► frozen verifier
          │
          ▼
verified UI + Boundary Map + Proof Capsule
```

The proposal and presentation layers never supply numerical truth. A result
cannot cross the final boundary until the learner has sealed a Prediction and
the fixed evidence has passed verification.

```text
Vite React Studio
    │ typed requests + reconnectable public events
Cloudflare Worker ── D1 sessions/jobs/event chain
    │              └─ R2 private inputs/artifacts/results/patches/proofs
    ├─ Responses API (optional live analyst)
    ├─ stored sample/replay path
    └─ Container-backed Durable Object
          ├─ Codex App Server over stdio JSONL
          ├─ bounded scientific compiler + two-repair cap
          ├─ fixed pandas/scikit-learn interpreter
          ├─ independent verifier
          └─ fixed copy-patch engine

Advanced local proof (separate)
    └─ AST policy + no-network Docker adapter runner
```

The Worker never spawns a host process directly. It dispatches a short-lived,
single-job token to the process-capable Container binding; when that binding or
its credentials are absent, live mode fails with a typed unavailable state and
never substitutes sample or replay evidence. Details are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
The browser route, component, and styling map is in
[docs/FRONTEND_MAP.md](docs/FRONTEND_MAP.md); `DESIGN.md` is the visual contract.

The proof console also uses `json-render` for a constrained generative view of
sanitized public events. The catalogue contains only trusted CounterLab cards,
tables, and status components, exposes no actions, and has no authority over
session state or verification. Core learning actions always remain ordinary
visible React controls.

## Setup

Required for local reproduction: Node 22+, pnpm 11.13.1, Python 3.12+, and the
locked dependencies. A Docker-compatible engine is required for local
Cloudflare Container development and for the advanced local adapter proof.

The two ready-to-use supported notebook fixtures are:

- `fixtures/notebooks/customer_churn_leakage.ipynb`
- `fixtures/notebooks/fraud_class_imbalance.ipynb`

Use them for the entity-leakage and class-imbalance live paths respectively;
do not treat them as evidence that arbitrary notebooks are supported.

```bash
cp .env.example .env.local
./scripts/clean-demo.sh
```

Open <http://127.0.0.1:5173>. `clean-demo.sh` installs missing local
dependencies, initializes local D1, regenerates and checks public fixtures,
starts the fixed kernel and Vite/Worker app, and prints honest live capability
status.

The deployed surface is <https://counterlab.cserules.workers.dev>. Exact-version
production smoke passed sample, replay, and untouched live leakage/imbalance on
Worker `7c67c0f4-a4cb-4503-80b0-5a5bd491f3ab` with Cloudflare Container image
digest `sha256:bdd65feebad10d4b0f232e945eb1bd1195b803d13fddf8eee558b2efdd5dc8c6`.
Both historical live proof artifacts (legacy Proof Bundle v1) bind
scientific-engine authority `d7677c79…`. The
secret-free evidence is committed in
[docs/PRODUCTION_SMOKE.json](docs/PRODUCTION_SMOKE.json).

For foreground development:

```bash
./scripts/dev.sh
```

## Live mode

Configure server-side values only:

```dotenv
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5.6
OPENAI_REASONING_EFFORT=medium
CODEX_MODEL=
COUNTERLAB_CODEX_MODE=replay
COUNTERLAB_SANDBOX_IMAGE=counterlab-runner:local
COUNTERLAB_ADMIN_DIAGNOSTIC_SECRET=
```

For hosted mode, configure the Worker secrets and P-256 runner signing private
key; only its public verification key is injected into the Container. The App
Server remains internal to the Container and uses stdio JSONL. For the
advanced local adapter proof, authenticate the local CLI with `codex login` and
ensure Docker is running. A missing runner, model credential, or isolation
boundary produces a typed setup error and never falls back to sample or replay.

For local Vite development, server-only Responses settings are read from the
repository-root `.env` and bound only to the Worker runtime. For Cloudflare,
store the same values as Worker secrets; do not use public `VITE_` variables.

Operators can inspect privacy-preserving queue, phase timing, repair, token,
concept, support, and failure aggregates at `/api/admin/diagnostics` when
`COUNTERLAB_ADMIN_DIAGNOSTIC_SECRET` is set. The endpoint is otherwise absent
and never returns artifact, session, notebook, credential, or endpoint data.

## Verification and reproduction

```bash
./scripts/test-all.sh
./scripts/run-mutations.sh leakage
./scripts/run-mutations.sh imbalance
pnpm run held-out:run
./scripts/reproduce-session.sh leakage-01
./scripts/replay-patch.sh leakage-01
./scripts/release-check.sh
./scripts/production-smoke.sh https://your-deployed-counterlab.example
```

The current measured artifact is
[docs/ACHIEVED_METRICS.json](docs/ACHIEVED_METRICS.json). Highlights:

- 2,880 rows and 480 customers, seed 1729;
- random accuracy 0.984722, group accuracy 0.594444, ablation accuracy 0.673611;
- group entity overlap 0;
- canonical result hash
  `a6ae7652e04e4d70196f991c63b8f7bcb3b76f8c4ab833d3ce2b626df0ab6c94`;
- 14/14 published leakage critical mutations detected;
- class-imbalance majority accuracy 0.989333 with 0 rare-class recall, and
  15/15 published imbalance mutations detected;
- held-out intake/routing 10/10 and fixed full-loop completion 7/8; the
  Random Forest patch is explicitly outside the registered non-sample patch
  contract;
- verified live candidate passed 18 invariants;
- verified patch preserved four unrelated cell source hashes and has zero group
  overlap.

These are software/evidence measurements, not learner-study outcomes.

## Achieved, failed, and unsupported

Achieved locally: deterministic kernels and parser, D1 state machine, R2-private
upload path, native Belief Spec/Experiment IR authority, immutable Prediction,
fixed scoring and tri-state verification, verified-only charts and Boundary
Map, fixed transfer, patch lock, copied-notebook repair, Reasoning Diff v2,
Proof Capsule v2, resumable six-stage learner navigation, and privacy-safe
interaction evidence. Historical production evidence separately covers the
legacy sample/replay and hosted leakage/imbalance paths identified above. The
v6.1 landing, Judge, proof-navigation, keyboard, and fixed-Sample journeys have
been executed locally with CloakBrowser at mobile and desktop sizes. Those
mutable-development checks are non-qualifying; the full matrix against one
exact public release is still pending.

Failed honestly: the first live Codex run used an unsupported SDK argument; two
repairs then left an unexpected `__pycache__`, so that run remained rejected and
released no result.

Unsupported: arbitrary datasets/packages, generic Python files, active notebook
content, non-Python kernels, source shapes or estimators outside a Subject
Pack's fixed patch contract, an arbitrary verified sample configuration matrix,
physics/free-fall in this release, accounts, LMS features, prose grading, and
claims of global mastery.

## Privacy and security limits

Raw rows and notebook bytes are not sent to GPT. API keys stay server-side.
Uploads and generated workspaces stay outside the public web root. Candidate
execution has no network and receives no credentials.

The recorded local host App Server replay could inspect global skill files
outside its generation directory, so that replay remains labelled `PARTIAL`.
The hosted source-free Plan path is separate: credentials are staged only for
App Server initialization and revoked before the generated turn; generated
child commands receive neither model credentials nor signing authority. Current
source refuses a live launch unless the exact runner reports a pinned
Bubblewrap boundary with an allowlisted runtime mount set, a writable
generation workspace, missing repository/held-out/verifier paths, a fixed
non-root UID, and `no-new-privs`. That is source-level admission logic, not production evidence:
until a newly built exact image passes the sentinel and release qualification,
hosted live authority remains unavailable and no `OS_ENFORCED` deployment claim
is made.
See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## How Codex accelerated the build

Build-time Codex helped map the monorepo, turn audit findings into focused
regressions, implement bounded UI and release slices, triage cross-language
failures, review authority drift, and keep the evidence documents synchronized
with executed checks. Changes were integrated as small independently reviewed
commits; a source test, deployment receipt, model call, or learner result was
never treated as successful without direct evidence.

That engineering role is separate from Runtime Codex inside CounterLab. Runtime
Codex acts only as a bounded Plan compiler. The real rejected trace exposed two
product-contract defects: incomplete public SDK documentation and transient
bytecode in an exact-file workspace. The public contract was strengthened; a
separate later run verified successfully.

Human decisions remained the product thesis, learner authority, concept scope,
fixture parameters, evidence contracts, verifier invariants, transfer design,
security claim discipline, and the choice not to relabel a failed repair as
success.

## License and attribution

CounterLab is licensed under the [MIT License](LICENSE). It uses React, Vite,
Cloudflare Workers/D1/R2, Hono, Zod, OpenAI's JavaScript SDK and Codex CLI,
pandas, NumPy, scikit-learn, Jupyter nbformat, Vitest, Pytest, and Playwright
under their respective licenses. Customer data is entirely synthetic.
