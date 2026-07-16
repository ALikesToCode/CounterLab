# CounterLab

**Ask like chat. Prove it like science.** CounterLab is a scientific debugger
for beliefs: it formalizes a claim, commits a prediction, runs a discriminating
test, refuses invalid evidence, verifies transfer, and only then unlocks repair.

> Chatbots explain. CounterLab lets reality answer.

CounterLab is a narrow Education-track product for machine-learning evaluation
misconceptions in supported Jupyter notebooks. Its released concept packs cover
entity leakage and class imbalance/metric choice; it is not a generic notebook
copilot or an unrestricted code runner.

**Live judge surface:** <https://counterlab.cserules.workers.dev>

## The 30-second judged path

1. Choose **Try instantly**.
2. Inspect the notebook's computed 98.5% random-row accuracy and exact cell
   evidence.
3. Claim that it generalizes to unseen customers.
4. Confirm the evidence-linked Belief Test and immutably predict the group-split
   outcome.
5. Open the Verified Lab: random rows score 98.5%, whole-customer holdout scores
   59.4%, identity ablation scores 67.4%, and group overlap is zero.
6. Write a reusable evaluation rule and pass the fixed forecasting transfer.
7. Verify the unlocked notebook-copy patch, inspect the Reasoning Diff, and
   export the Proof Bundle.

The **Replay verified session** path adds a persistent replay banner and shows a
real authenticated Codex App Server trace: one run rejected after two capped
repairs and a separate later run that passed 18 invariants and 12/12 mutations.
The UI explicitly says the later run is not “repair attempt 3.”

## Judge Mode

| Path                    | Meaning                                                                                                                               | Secrets required                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Try instantly           | New D1-backed learner session using stored approved artifacts and real fixed-kernel payloads                                          | No                                         |
| Generate live           | Artifact-specific GPT analyst plus the authenticated Container runner, typed Plans, fixed kernel, verifier, and copied-notebook patch | Server-side model and runner configuration |
| Replay verified session | Reconstructs checked-in evidence from actual prior runs; always visibly labelled                                                      | No                                         |

Replay does not make a new model call. The rejected compiler run authorized no
result. The displayed result is tied to the separately verified candidate and
fixed kernel hash.

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

### GPT-5.6 generates

The official OpenAI JavaScript SDK and Responses API produce a structured
Belief Test from sanitized evidence, the learner's claim, and concept rules.
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

For the hosted Studio, Codex App Server over stdio JSONL generates only:

```text
experiment-plan.json
patch-plan.json
public-rationale.md
```

Only the JSON Plans are authoritative; the rationale is display-only. Plans can
compose registered fixed operations but cannot contain source code, commands,
SQL, formulas, imports, paths, or literal results. Codex may receive structured
verifier counterexamples and gets at most two repair attempts. Browser events
contain sanitized plans, files, diffs, command summaries, durations, exit
codes, and verifier counterexamples—never private reasoning.

The separate advanced local proof retains the older three-file adapter path
(`experiment-plan.json`, `artifact-adapter.py`, and `public_tests.py`) behind AST
policy and a no-network container. It is never used silently by hosted Studio.

### Fixed code computes

The Python kernel owns fixture generation, random/group/stratified splits,
preprocessing, model training, entity overlap, majority baselines, confusion
counts, accuracy, precision, recall, F1, PR-AUC, contextual ROC-AUC, threshold
and prevalence scenarios, transfer scoring, canonical serialization, and
chart-ready results.

### The external verifier proves

For the documented concept contracts, the verifier establishes named properties
such as zero group overlap, identity removal, controlled variables, majority
baseline computation, confusion-matrix consistency, threshold/prevalence
response, label responsiveness, deterministic hashes, honest chart payloads,
runner controls, and changed-cell scope. It does not prove global mastery,
causality, or formal sandbox security.

The complete authority matrix is in
[docs/AUTHORITY_BOUNDARIES.md](docs/AUTHORITY_BOUNDARIES.md).

## Architecture

```text
Vite React Studio
    │ typed requests + reconnectable public events
Cloudflare Worker ── D1 sessions/jobs/event chain
    │              └─ R2 private inputs/Plans/results/patches/proofs
    ├─ Responses API (optional live analyst)
    ├─ stored sample/replay path
    └─ Container-backed Durable Object
          ├─ Codex App Server over stdio JSONL
          ├─ source-free Plan compiler + two-repair cap
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

The proof console also uses `json-render` for a constrained generative view of
sanitized public events. The catalogue contains only trusted CounterLab cards,
tables, and status components, exposes no actions, and has no authority over
session state or verification. Core learning actions always remain ordinary
visible React controls.

## Setup

Required for local reproduction: Node 22+, pnpm 11.12.0, Python 3.12+, and the
locked dependencies. A Docker-compatible engine is required for local
Cloudflare Container development and for the advanced local adapter proof.

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
Both live Proof Bundles bind scientific-engine authority `d7677c79…`. The
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
  `2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0`;
- 12/12 published critical mutations detected;
- class-imbalance majority accuracy 0.989333 with 0 rare-class recall, and
  12/12 imbalance mutations detected;
- held-out intake/routing 10/10 and fixed full-loop completion 7/8; the
  Random Forest patch is explicitly outside the registered non-sample patch
  contract;
- verified live candidate passed 18 invariants;
- verified patch preserved four unrelated cell source hashes and has zero group
  overlap.

These are software/evidence measurements, not learner-study outcomes.

## Achieved, failed, and unsupported

Achieved: deterministic kernel and parser, D1 state machine, R2-private upload
path, immutable prediction, resumable lesson navigation, read-only completed-step
review, verified-only charts, fixed transfer, patch lock, minimal verified sample
patch, event hash chain, Proof Bundle, authenticated Codex traces, Playwright
judge flow, and artifact-specific hosted leakage and imbalance through the
Cloudflare Vite/Worker/Container deployment.

Failed honestly: the first live Codex run used an unsupported SDK argument; two
repairs then left an unexpected `__pycache__`, so that run remained rejected and
released no result.

Unsupported: arbitrary datasets/packages, generic Python files, active notebook
content, non-Python kernels, source shapes or estimators outside a concept
pack's fixed patch contract, accounts, LMS features, and claims of global
mastery.

## Privacy and security limits

Raw rows and notebook bytes are not sent to GPT. API keys stay server-side.
Uploads and generated workspaces stay outside the public web root. Candidate
execution has no network and receives no credentials.

The recorded local host App Server replay could inspect global skill files
outside its generation directory, so that replay remains labelled `PARTIAL`.
The hosted source-free Plan path is separate: credentials are staged only for
App Server initialization and revoked before the generated turn; generated
child commands receive neither model credentials nor signing authority. The
Container still needs outbound access for live model compilation, and formal
sandbox proof is not claimed; see [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## How Codex accelerated the build

Codex helped implement and test the monorepo, then CounterLab used Codex itself
as a bounded runtime compiler. The real rejected trace exposed two product
contract defects: incomplete public SDK documentation and transient bytecode in
an exact-file workspace. The public contract was strengthened; a separate later
run verified successfully.

Human decisions remained the product thesis, learner authority, concept scope,
fixture parameters, evidence contracts, verifier invariants, transfer design,
security claim discipline, and the choice not to relabel a failed repair as
success.

## License and attribution

CounterLab is licensed under the [MIT License](LICENSE). It uses React, Vite,
Cloudflare Workers/D1/R2, Hono, Zod, OpenAI's JavaScript SDK and Codex CLI,
pandas, NumPy, scikit-learn, Jupyter nbformat, Vitest, Pytest, and Playwright
under their respective licenses. Customer data is entirely synthetic.
