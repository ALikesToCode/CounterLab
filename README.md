# CounterLab

**CounterLab is CI for understanding.** It treats a learner's claim like code:
formalize it, commit a prediction, run a discriminating test, reject invalid
evidence, verify transfer, and only then merge the repair.

> Chatbots explain. CounterLab lets reality answer.

CounterLab is a narrow Education-track product for machine-learning evaluation
misconceptions in supported Jupyter notebooks. The P0 concept is entity leakage
in a synthetic customer-churn notebook; it is not a generic notebook copilot or
an unrestricted code runner.

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

| Path | Meaning | Secrets required |
| --- | --- | --- |
| Try instantly | New D1-backed learner session using stored approved artifacts and real fixed-kernel payloads | No |
| Generate live | GPT-5.6 analyst at the Worker; Codex/Python/Docker compilation on the process-capable local runner | OpenAI key, Codex login, Docker |
| Replay verified session | Reconstructs checked-in evidence from actual prior runs; always visibly labelled | No |

Replay does not make a new model call. The rejected compiler run authorized no
result. The displayed result is tied to the separately verified candidate and
fixed kernel hash.

## Supported notebook contract

P0 accepts `nbformat` 4 `.ipynb` files up to 10 MiB containing the documented
Python/scikit-learn classification subset, safe text/JSON outputs, and evidence
needed for an entity-leakage Belief Test. Intake hashes and sanitizes the file;
it never executes a cell.

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

### Runtime Codex generates

Codex App Server over stdio JSONL generates only:

```text
experiment-plan.json
artifact-adapter.py
public_tests.py
```

It may receive structured verifier counterexamples and gets at most two repair
attempts. Browser events contain sanitized plans, files, diffs, command
summaries, durations, exit codes, and verifier counterexamples—never private
reasoning.

### Fixed code computes

The Python kernel owns fixture generation, random/group splits, preprocessing,
model training, accuracy, ROC AUC, entity overlap, transfer scoring, canonical
serialization, and chart-ready results. Generated adapters only declare fixed
SDK runs.

### The external verifier proves

For this documented fixture and contract, the verifier establishes named
properties such as zero group overlap, identity removal, controlled variables,
label responsiveness, row-order invariance, deterministic hashes, honest chart
payloads, candidate runner controls, hidden-mount absence, and supported-case
status. It does not prove global mastery, causality, or formal sandbox security.

The complete authority matrix is in
[docs/AUTHORITY_BOUNDARIES.md](docs/AUTHORITY_BOUNDARIES.md).

## Architecture

```text
Vite React UI
    │ typed requests
Cloudflare Worker ── D1 sessions + append-only event chain
    │              └─ R2 private uploads and patch copies
    ├─ OpenAI Responses API (optional live analyst)
    └─ stored sample/replay path

Local process runtime
    ├─ Codex App Server stdio compiler
    ├─ exact-file + Python AST policy
    ├─ Docker candidate runner (no network, non-root, read-only)
    ├─ fixed pandas/scikit-learn kernel
    └─ frozen host verifier
```

Cloudflare does not pretend it can spawn Codex, Python, or Docker. Those health
fields return `local-runner-required`. Details are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Setup

Required: Node 22+, pnpm 11.12.0, Python 3.12+, and the locked dependencies.
Docker is required for live candidate execution and replay reproduction.

```bash
cp .env.example .env.local
./scripts/clean-demo.sh
```

Open <http://127.0.0.1:5173>. `clean-demo.sh` installs missing local
dependencies, initializes local D1, regenerates and checks public fixtures,
starts the fixed kernel and Vite/Worker app, and prints honest live capability
status.

For foreground development:

```bash
./scripts/dev.sh
```

## Live mode

Configure server-side values only:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
OPENAI_REASONING_EFFORT=medium
CODEX_MODEL=
COUNTERLAB_CODEX_MODE=replay
COUNTERLAB_SANDBOX_IMAGE=counterlab-runner:local
```

Then authenticate the local CLI with `codex login`, ensure Docker is running,
and use `pnpm run codex:live`. Cloudflare-hosted live lab compilation returns a
typed local-runner requirement; it never substitutes replay.

## Verification and reproduction

```bash
./scripts/test-all.sh
./scripts/run-mutations.sh leakage
./scripts/reproduce-session.sh leakage-01
./scripts/replay-patch.sh leakage-01
./scripts/release-check.sh
```

The current measured artifact is
[docs/ACHIEVED_METRICS.json](docs/ACHIEVED_METRICS.json). Highlights:

- 2,880 rows and 480 customers, seed 1729;
- random accuracy 0.984722, group accuracy 0.594444, ablation accuracy 0.673611;
- group entity overlap 0;
- canonical result hash
  `2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0`;
- 12/12 published critical mutations detected;
- verified live candidate passed 18 invariants;
- verified patch preserved four unrelated cell source hashes and has zero group
  overlap.

These are software/evidence measurements, not learner-study outcomes.

## Achieved, failed, and unsupported

Achieved: deterministic kernel and parser, D1 state machine, R2-private upload
path, immutable prediction, verified-only charts, fixed transfer, patch lock,
minimal verified sample patch, event hash chain, Proof Bundle, authenticated
Codex traces, Playwright judge flow, and Cloudflare Vite deployment support.

Failed honestly: the first live Codex run used an unsupported SDK argument; two
repairs then left an unexpected `__pycache__`, so that run remained rejected and
released no result.

Unsupported: arbitrary datasets/packages, generic Python files, active notebook
content, non-Python kernels, uploaded notebooks outside the exact patch contract,
accounts, LMS features, and claims of global mastery.

## Privacy and security limits

Raw rows and notebook bytes are not sent to GPT. API keys stay server-side.
Uploads and generated workspaces stay outside the public web root. Candidate
execution has no network and receives no credentials.

The recorded host App Server run could inspect global skill files outside its
generation directory. Therefore generation-time hidden-verifier unreadability
is currently `PARTIAL`, even though post-generation candidate execution proved
the verifier and held-out paths were not mounted. This is the highest-risk
remaining boundary and is documented in [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

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
