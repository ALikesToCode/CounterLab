# CounterLab — Codex master build prompt

> Historical build prompt. The current product constitution is `AGENTS.md`,
> and current submission copy is `docs/DEVPOST_COPY.md`. Do not use the legacy
> vocabulary or product thesis below as current release or submission evidence.

Paste this prompt into Codex from the repository root **after saving the companion file as `AGENTS.md`**.

---

You are the principal engineer, product designer, test engineer, and release owner for **CounterLab**. Build the complete competition-grade project in this repository now. Do not merely describe an architecture or stop after scaffolding.

You are authorized to inspect files, initialize the repository if empty, create and edit in-scope files, install compatible local dependencies, run non-destructive commands, start local services, run tests, and iterate until the acceptance gates pass. Ask only for missing credentials, destructive actions, external writes, or a material expansion of scope.

Read `AGENTS.md` first and treat it as the product constitution. Then inspect the repository and existing work. Preserve useful code; replace weak scaffolding when necessary. If the repository is empty, initialize the implementation described below.

## Outcome

Ship a locally runnable, judge-friendly Education-track product with this thesis:

> **CounterLab is CI for understanding. It treats a learner's claim like code: formalize it, run a discriminating test, reject invalid evidence, verify transfer, and only then merge the repair.**

The judged hero story is:

1. A customer-churn notebook reports approximately 99% test accuracy.
2. The learner claims this proves generalization to new customers.
3. GPT-5.6 creates an evidence-linked Belief Test with two competing hypotheses.
4. The learner commits a prediction before seeing results.
5. Runtime Codex creates an experiment plan and constrained artifact adapter.
6. An external mutation verifier either rejects the candidate with a concrete counterexample or verifies it.
7. The learner observes real computed random-split, group-split, and identity-ablation results.
8. The learner revises the mental model.
9. A fixed forecasting transfer task checks whether the rule generalizes without model hints.
10. Only a passing transfer unlocks a minimal, independently verified patch to a copy of the original notebook.
11. The final screen shows a Reasoning Diff and exports a replayable Proof Bundle.

The memorable line is:

> **Chatbots explain. CounterLab lets reality answer.**

## First actions

Perform these immediately:

1. Read `AGENTS.md`.
2. Inspect the repository tree, package files, Git status, available runtimes, and existing tests.
3. Create or update:
   - `docs/PROGRESS.md`
   - `docs/DECISIONS.md`
   - `docs/BUILD_PLAN.md`
4. In `docs/BUILD_PLAN.md`, record the current repository state, the architecture you will use, milestone gates, and any environment constraints you actually detected.
5. Continue directly into implementation. Do not wait for approval after writing the plan.

## Build strategy

Use vertical slices. The proof spine comes before visual polish.

### Milestone 1 — Deterministic evidence spine

Implement first:

- Public synthetic customer-churn fixture generator
- Public sample `.ipynb` with stored outputs
- Safe notebook parser that never executes uploaded cells
- Canonical Artifact Manifest and evidence references
- Leakage reference kernel
- Canonical result serialization and integrity hashes
- External mutation verifier
- Mutation suite with at least ten critical failures
- CLI scripts to run the kernel, verifier, and mutation matrix

Exit gate:

- The sample notebook parses into stable hashes and exact cell references.
- The kernel computes a dramatic but non-hardcoded gap between random row split and group split.
- Group split has zero customer overlap.
- Every published critical mutation is rejected.
- Running the same fixture and seed twice produces equal canonical result hashes.

Do not start the full UI until this gate passes.

### Milestone 2 — Complete learning loop without live models

Implement a deterministic sample path using stored approved artifacts:

- Four-screen product flow
- Belief Test display and edit/reject/insufficient-evidence controls
- Immutable prediction and confidence
- Verified lab view driven only by canonical kernel output
- Learner revision
- Fixed forecasting transfer evaluator
- Patch locked before transfer
- Verified sample-notebook patch after transfer
- Reasoning Diff
- Proof Bundle
- Append-only event log and replay
- Try Instantly and Replay Verified Session Judge Mode paths

Exit gate:

- A fresh user can complete claim → prediction → lab → revision → transfer → patch → Reasoning Diff without builder explanation.
- Refreshing or replaying reconstructs the same visible event sequence from stored evidence.
- No chart renders before a verified result payload is available.
- The original notebook is never overwritten.

### Milestone 3 — GPT-5.6 Belief Test integration

Implement the live reasoning analyst behind an interface with a deterministic sample/replay fallback.

Requirements:

- Official OpenAI JavaScript/TypeScript SDK
- Responses API
- Default model from `OPENAI_MODEL`, defaulting to `gpt-5.6`
- Current structured-output mechanism validated again with local Zod schemas
- `reasoning.effort` configurable through `OPENAI_REASONING_EFFORT`, default `medium`
- `store: false` where supported
- Stable privacy-preserving safety identifier derived from the local session, never raw PII
- Server-side API key only
- Input contains only sanitized notebook evidence, schema summary, learner claim, support status, and concept-pack definitions
- Output is rejected if evidence references do not resolve to the Artifact Manifest
- “Insufficient evidence” is a valid result

The Belief Test schema must include:

```ts
type BeliefTest = {
  id: string;
  concept: "entity_leakage" | "class_imbalance";
  learnerClaim: string;
  currentHypothesis: {
    statement: string;
    predictedOutcome: string;
  };
  competingHypothesis: {
    statement: string;
    predictedOutcome: string;
  };
  evidenceRefs: Array<{
    cellIndex?: number;
    outputIndex?: number;
    kind: "code" | "metric" | "schema" | "output" | "learner_claim";
    hash: string;
    excerpt: string;
    relevance: string;
  }>;
  alternatives: Array<{
    label: string;
    rationale: string;
  }>;
  decisiveIntervention: {
    id: string;
    description: string;
    controlledVariables: string[];
    changedVariables: string[];
    discriminatesBecause: string;
  };
  uncertainty: {
    confidence: number;
    limitations: string[];
    insufficientEvidence: boolean;
  };
  requiresLearnerConfirmation: true;
};
```

Keep the permanent product instructions and concept rules in a stable cacheable prefix. Do not send raw rows, secrets, local paths, or unnecessary notebook content.

Exit gate:

- With a valid key, the model produces a schema-valid, evidence-resolving Belief Test.
- With no key, the product clearly offers Try Instantly and Replay instead of pretending a live call occurred.
- An invalid or unsupported response cannot advance the session state.

### Milestone 4 — Runtime Codex compile–verify–repair

Implement a real runtime Codex client behind a clean interface.

Use Codex App Server for the product's rich live integration:

- Spawn `codex app-server` as a child process using the default stable `stdio` JSONL transport.
- Perform the required initialize/initialized handshake.
- Start a thread and turn using `CODEX_MODEL` when provided; otherwise use the current compatible default discovered from the installed Codex version.
- Parse JSONL messages with runtime validation.
- Stream sanitized state to the browser over server-sent events.
- Show only plan summaries, inspected file names, unified diffs, command summaries, stdout/stderr excerpts, durations, exit codes, verifier counterexamples, and final status.
- Never surface private chain-of-thought.
- Do not depend on the experimental App Server WebSocket transport.

Create a `CodexCompiler` interface with at least:

```ts
interface CodexCompiler {
  compileLab(input: CompileLabInput): AsyncIterable<CompilerEvent>;
  repairLab(input: RepairLabInput): AsyncIterable<CompilerEvent>;
  compilePatch(input: CompilePatchInput): AsyncIterable<CompilerEvent>;
  health(): Promise<CompilerHealth>;
}
```

Provide implementations:

- `AppServerCodexCompiler` for live generation
- `ReplayCodexCompiler` for actual stored sessions
- A disabled implementation that returns a typed setup error rather than fake success

The lab turn receives only:

- Approved Belief Test
- `experiment-plan.schema.json`
- Public Concept Pack SDK documentation
- Redacted fixture schema and evidence references
- Resource limits
- Permitted files and commands
- The generation target directory

It may create only:

```text
generated/<session-id>/experiment-plan.json
generated/<session-id>/artifact-adapter.py
generated/<session-id>/public_tests.py
```

Use a fresh Git worktree or equivalent isolated copy pinned to the Concept Pack template commit. Keep hidden verifier, mutation catalogue, held-out fixtures, secrets, and unrelated files outside the mounted workspace.

Before execution, run a strict AST policy over `artifact-adapter.py`. Deny:

- `open`, filesystem traversal, environment reads, dynamic imports
- `eval`, `exec`, `compile`, reflection-based escape patterns
- `os`, `sys`, `subprocess`, sockets, HTTP libraries, package installation
- direct metric implementations or direct access to hidden result files

Execute the candidate in a hardened local container/process boundary:

- No network
- Non-root user
- Read-only root/files except output mount and temporary directory
- Read-only public fixtures and SDK
- CPU, wall-clock, memory, process, file-count, and output-size limits
- No credentials in the environment

Run the external verifier from the host/outside the Codex-visible workspace. If rejected, send only structured invariant names, observed values, and minimal counterexamples. Permit at most two live repairs. Preserve every prompt hash, event, patch, command, duration, exit code, and commit hash.

Do not intentionally inject a bug to manufacture a dramatic demo. Persist and replay a genuine prior reject-repair session when one exists. If a live candidate passes first try, present that honestly.

Exit gate:

- Live mode generates an artifact-specific plan and adapter or returns a clear environment/setup error.
- Replay mode reconstructs a genuine stored Codex trace and remains visibly labelled.
- Codex cannot read the hidden verifier path.
- A rejected candidate cannot produce a lab result.
- A verified candidate can be reproduced from the recorded contract, template, and fixture.

### Milestone 5 — Transfer-gated patch and dual diff

After `TRANSFER_PASSED`, start a separate Codex turn in a separate worktree.

The patch task must:

- Operate on a copy of the original supported notebook
- Apply the smallest correction to the evaluation path
- Replace row-wise random evaluation with customer-group evaluation
- Remove customer identity from model features where required
- Preserve unrelated cells byte-for-byte at the source level
- Recompute the supported notebook path under the fixed kernel/sandbox
- Produce a unified notebook-cell diff and patch metadata

The patch verifier must reject:

- Changes to unrelated cells
- New dependencies outside the allowlist
- Broad rewrites when a local correction exists
- Invalid notebook JSON/nbformat
- Remaining group overlap
- Hardcoded metrics
- Nondeterministic output
- A patch that changes the conclusion without changing the actual evaluation design

The final Reasoning Diff must present:

| Dimension | Before | After |
|---|---|---|
| Belief | Learner's original claim | Revised reusable rule |
| Prediction | Pre-result expectation | Observed verified result |
| Code | Original evaluation design | Minimal verified patch |
| Transfer | Initial model applied to new case | Fixed evaluator outcome |

Below it, expose an expandable technical proof containing hashes, commands, mutations, fixture/kernel/verifier versions, replay ID, limitations, and reproduction commands.

Exit gate:

- The patch button is unavailable before transfer.
- Passing transfer unlocks the patch.
- The public notebook patch verifies and leaves unrelated cell hashes unchanged.
- Failed transfer returns the learner to the evidence without generating a patch.

### Milestone 6 — Judge hardening, P0.5, and release

Only after all previous gates pass:

- Add the class-imbalance Concept Pack as an anti-template proof.
- Add at least two untouched notebook variants per implemented concept.
- Implement honest unsupported/refusal cases.
- Add end-to-end Playwright coverage for the judged path.
- Add clean-clone scripts and dependency checks.
- Finish accessibility, responsive layout, error states, and performance.
- Generate achieved metrics from real test logs; do not hand-type success rates.
- Finish README and submission documentation.

Do not add a third polished concept unless everything above is already stable and reproducible.

## Required architecture

Use a repository structure close to this, adapting only when the existing codebase has a demonstrably better structure:

```text
counterlab/
├── AGENTS.md
├── apps/
│   └── web/                         # Next.js App Router, React, strict TypeScript
├── services/
│   └── kernel/                      # Python package/API: fixtures, ML kernel, canonical results
├── packages/
│   ├── contracts/                   # Zod, JSON Schema, shared state and API types
│   ├── notebook-parser/             # Safe .ipynb parser and Artifact Manifest
│   ├── codex-client/                # App Server stdio client, replay client, event sanitizer
│   ├── verifier/                    # Host-side invariant and mutation engine
│   ├── proof-bundle/                # Event hash chain, export, replay
│   └── ui/                          # Reusable accessible components
├── concept-packs/
│   ├── leakage/
│   │   ├── public/
│   │   ├── verifier/                # Never mounted into generation workspace
│   │   └── transfer/
│   └── imbalance/
├── fixtures/
│   ├── public/
│   ├── held-out/                    # Never mounted into generation workspace
│   └── notebooks/
├── evals/
│   ├── mutations/
│   └── held-out/
├── replays/
│   └── leakage-01/
├── scripts/
├── docs/
├── data/                            # Local SQLite and generated artifacts; gitignored as appropriate
├── .env.example
├── package.json
├── pnpm-lock.yaml
└── pyproject.toml
```

Use:

- Next.js + React + TypeScript for the product surface
- Server-side Node routes/orchestrator for session state, OpenAI calls, Codex process control, SSE, and SQLite
- Python with pandas, NumPy, and scikit-learn for the fixed reference kernel
- Zod and generated JSON Schema for contracts
- SQLite for sessions and append-only evidence events
- Pytest for kernel/verifier tests
- Vitest for TypeScript unit/contract tests
- Playwright for the judged end-to-end path
- Docker or an equivalent OS-enforced local sandbox for generated adapter execution

Prefer a small number of stable dependencies. Lock all versions. Keep the sample/replay path runnable without OpenAI credentials. Live mode may require the OpenAI key, Codex CLI authentication, and Docker.

## Data and notebook implementation

Create a deterministic generator for the public leakage fixture. The fixture should have roughly:

- Hundreds of customers
- Multiple observations per customer
- A categorical `customer_id`
- A mostly customer-stable target or customer-specific shortcut
- A few weak but genuinely predictive non-identity features
- Controlled noise

The public notebook should use a pipeline that one-hot encodes `customer_id` and performs a random row split. Because the same customers occur in train and test, the baseline should look excellent. Under `GroupShuffleSplit` by `customer_id`, unseen-customer performance should fall materially. Removing identity features should also remove the shortcut.

Do not hardcode 99.1%, 68.4%, or any other result. Tune only the fixture-generation parameters, then freeze the seed. Tests should assert:

- `random_split_accuracy > group_split_accuracy + meaningful_margin`
- `random_split_accuracy > id_ablation_accuracy + meaningful_margin`
- `group_entity_overlap == 0`
- `random_entity_overlap > 0`
- Metrics fall inside broad credible ranges
- Same input and seed yield the same canonical hash

Store displayed outputs in the sample notebook by running the actual generator/kernel during a build script. The UI must read verified result payloads, not notebook headline text, as the source of experimental truth.

## Core contracts

Implement and validate at least these shared contracts:

### Artifact Manifest

```ts
type ArtifactManifest = {
  artifactId: string;
  fileName: string;
  fileSha256: string;
  nbformat: number;
  support: {
    status: "SUPPORTED" | "PARTIAL" | "UNSUPPORTED";
    reasons: Array<{ code: string; message: string; cellIndex?: number }>;
  };
  cells: Array<{
    index: number;
    type: "code" | "markdown" | "raw";
    sourceSha256: string;
    sourceExcerpt: string;
    executionCount?: number | null;
    outputHashes: string[];
    symbols: string[];
    metricCandidates: Array<{ name: string; value: number; outputIndex: number }>;
  }>;
  schemaSummary: {
    fields: Array<{ name: string; inferredType: string; privacyClass: string }>;
    rowCount?: number;
    entityCandidates: string[];
    targetCandidates: string[];
  };
  packageHints: string[];
  createdAt: string;
};
```

### Prediction Contract

```ts
type PredictionContract = {
  id: string;
  sessionId: string;
  beliefTestId: string;
  choice: string;
  numericRange?: { min: number; max: number };
  confidence: number;
  committedAt: string;
  immutableHash: string;
};
```

### Experiment plan

```ts
type ExperimentPlan = {
  schemaVersion: "1";
  concept: "entity_leakage" | "class_imbalance";
  datasetAdapter: string;
  competingHypotheses: [string, string];
  expectedDiscrimination: Array<{
    runId: string;
    expectedUnderCurrent: string;
    expectedUnderCompeting: string;
  }>;
  runs: Array<{
    id: string;
    split: "random" | "group" | "time";
    groupBy?: string;
    dropFeatures?: string[];
    model: string;
    seed: number;
  }>;
  metrics: string[];
  views: string[];
  invariants: string[];
  resourceLimits: {
    wallSeconds: number;
    memoryMb: number;
    maxProcesses: number;
    maxFiles: number;
    maxOutputBytes: number;
  };
};
```

### Evidence event

```ts
type EvidenceEvent = {
  eventId: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
  actor: "learner" | "gpt-5.6" | "codex" | "verifier" | "kernel" | "system";
  kind: string;
  inputHashes: string[];
  outputHashes: string[];
  payload: Record<string, unknown>;
  modelId?: string;
  promptHash?: string;
  commitHash?: string;
  durationMs?: number;
  exitCode?: number;
  previousEventHash?: string;
  eventHash: string;
};
```

Also implement `VerifiedResultSet`, `TransferResult`, `PatchResult`, `ReasoningDiff`, and `ProofBundle` with explicit schema versions.

## API and routes

Implement typed endpoints or server actions equivalent to:

```text
POST /api/artifacts
POST /api/sessions
POST /api/sessions/:id/belief-test
POST /api/sessions/:id/belief-test/confirm
POST /api/sessions/:id/prediction
POST /api/sessions/:id/lab/compile
GET  /api/sessions/:id/events
POST /api/sessions/:id/lab/run
POST /api/sessions/:id/revision
POST /api/sessions/:id/transfer
POST /api/sessions/:id/patch/compile
GET  /api/sessions/:id/reasoning-diff
GET  /api/sessions/:id/proof-bundle
GET  /api/replays/:replayId
GET  /api/health
```

Every mutating route must validate the current session state and reject illegal transitions. Every response must be schema-valid and include a typed error body on failure.

## UI requirements

Build a polished, coherent experience rather than a developer dashboard.

### Landing / Judge Mode

- Product name, tagline, one-sentence thesis
- Three large actions:
  - Try instantly
  - Generate live
  - Replay verified session
- Small support note: judged path supports Jupyter notebooks in the documented ML subset
- No login

### Screen 1 — Claim

- Sample notebook card and upload control
- Notebook evidence summary with exact cells and outputs
- One claim text area
- Clear warnings for unsupported content
- Continue only when a supported artifact and claim exist

### Screen 2 — Belief Test

- Learner claim
- Current and competing hypotheses displayed side-by-side
- Three or fewer evidence chips with cell references
- Predicted result under each hypothesis
- Alternatives and limitations in a compact disclosure
- Confirm, edit, reject, insufficient-evidence actions
- Prediction choices, optional numeric range, confidence slider, immutable commit

### Screen 3 — Build and verify

- Stepper showing plan → generate → public tests → external verifier → repair → verified/rejected
- Diff viewer
- Command/event timeline
- Concrete verifier counterexample, such as overlapping customer IDs, when present
- Persistent replay badge in replay mode
- No private reasoning text

### Screen 4 — Reality and transfer

- Cards for random split, group split, and ID ablation
- Real chart and accessible data table
- Entity-overlap visualization
- Original prediction beside observed result
- Revision prompt focused on a reusable rule
- Fixed forecasting transfer task
- Patch lock state before pass
- Patch diff and verification after pass
- Reasoning Diff and expandable Proof Bundle provenance

Design details:

- Use the color semantics in `AGENTS.md`.
- Use clear typography and generous spacing.
- Provide loading, rejected, insufficient-evidence, unsupported, live-unavailable, replay, and verified states.
- Ensure keyboard-only completion and reduced-motion behavior.
- Keep charts honest: include sample sizes, units, split strategy, and seed.

## Persistence and replay

Use SQLite with migrations. Persist:

- Sessions and state
- Artifact metadata and hashes, not unnecessary raw content
- Belief Tests and confirmations
- Prediction Contract
- Compiler events
- Verifier events
- Results
- Revision and transfer
- Patch metadata
- Event hash chain
- Replay metadata

Store uploaded files and generated workspaces outside the public web root. Apply safe filenames and generated IDs. Never trust a client-provided path.

A replay must be produced from stored events and result payloads. Display a persistent “Verified replay” banner and the original run timestamp, model, fixture, verifier, and commit identifiers.

## Security implementation

At minimum:

- File-size and content-type limits
- JSON parsing with bounded depth/size where practical
- Notebook output sanitization
- No execution during intake
- Path containment checks
- Random server-generated IDs
- Server-only secrets
- Generated-code AST allowlist
- No-network sandbox
- Non-root execution and resource limits
- Hidden evaluator isolation
- Dependency allowlist
- No raw chain-of-thought in logs or UI
- Secret scanning in the release script
- Explicit security limitations in documentation

Do not claim formal sandbox proof. State exactly what is enforced and what remains outside the hackathon guarantee.

## Tests and evaluation

Implement:

### Python

- Fixture determinism
- Kernel metric correctness against independent simple fixtures
- Split overlap checks
- Canonical serialization
- Adapter AST policy
- Every verifier invariant
- Every seeded mutation
- Patch verifier
- Held-out notebook variants

### TypeScript

- Contract validation
- State transitions
- Evidence-reference resolution
- Event hash chain
- Replay reconstruction
- API error handling
- GPT output rejection
- Codex event sanitization

### End-to-end

- Try Instantly complete path
- Replay complete path and persistent label
- Prediction immutability
- No results before prediction
- Rejected lab cannot run
- Transfer failure keeps patch locked
- Transfer pass unlocks verified patch
- Proof Bundle downloads and validates
- Unsupported notebook state
- Live mode missing-credential state

Generate an achieved-metrics artifact from actual test results. It may include mutation detection, held-out generation, clean-clone reproducibility, and timing only when those measurements have been run. Never fabricate learner-study outcomes.

## Required scripts

Implement executable cross-platform-friendly shell scripts, with clear failures:

```bash
./scripts/dev.sh
./scripts/clean-demo.sh
./scripts/test-all.sh
./scripts/generate-fixtures.sh
./scripts/run-mutations.sh leakage
./scripts/reproduce-session.sh leakage-01
./scripts/record-replay.sh <session-id>
./scripts/replay-patch.sh leakage-01
./scripts/release-check.sh
```

`clean-demo.sh` must:

- Check required runtimes
- Install or explain dependencies without hidden global assumptions
- Initialize the database
- Generate/verify public fixtures
- Start the kernel and web app
- Print the local URL
- Explain whether live GPT/Codex mode is available

## Documentation and submission assets

Create a strong README that includes:

1. One-sentence problem and product thesis
2. 30-second judged path
3. Judge Mode choices and exact replay meaning
4. Supported notebook contract
5. What GPT-5.6 generates
6. What runtime Codex generates and repairs
7. What fixed code computes
8. What the external verifier proves
9. What is not claimed
10. Architecture and authority boundaries
11. Setup and one-command sample
12. Live mode requirements
13. Mutation benchmark and reproduction commands
14. Achieved metrics, targets, failures, and unsupported cases
15. Privacy and security limitations
16. How Codex accelerated the build and where key human decisions were made
17. License and attribution

Also complete all documentation required by `AGENTS.md` and create:

- `docs/DEMO_SCRIPT.md` with a 2:45 voiceover plan
- `docs/DEVPOST_COPY.md` with title, tagline, short description, longer description, and judge instructions
- `docs/SCREENSHOT_PLAN.md`
- `docs/RELEASE_CHECKLIST.md`

The demo script must visibly show:

- The deceptive notebook result
- Evidence-linked Belief Test
- Immutable prediction
- Codex generation
- Genuine verifier rejection/repair via live run or labelled replay
- Verified result
- Revision
- Transfer
- Patch unlocking
- Reasoning Diff

## Environment variables

Create `.env.example` with at least:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
OPENAI_REASONING_EFFORT=medium
CODEX_MODEL=
COUNTERLAB_CODEX_MODE=replay
COUNTERLAB_DATABASE_PATH=./data/counterlab.sqlite
COUNTERLAB_SIGNING_KEY=
COUNTERLAB_MAX_NOTEBOOK_BYTES=10485760
COUNTERLAB_SANDBOX_IMAGE=counterlab-runner:local
```

`COUNTERLAB_CODEX_MODE` accepts `live`, `replay`, or `disabled`.

## Quality rules

- Keep all generated metrics derived from kernel output.
- No dead controls or decorative traces.
- No hidden manual edits between generation, verification, transfer, and patch.
- No “works for any notebook,” “proves mastery,” “world first,” or “100% secure” copy.
- No generic AI prose where a deterministic status or evidence table is better.
- No model voting.
- No third concept until the proof spine is stable.
- No success report without commands and test evidence.

## Final acceptance test

Before declaring completion, run from a clean checkout or fresh temporary clone:

1. `./scripts/test-all.sh`
2. `./scripts/run-mutations.sh leakage`
3. `./scripts/clean-demo.sh`
4. Complete the Try Instantly path in a browser
5. Complete the Replay path and verify the replay banner never disappears
6. Reproduce `leakage-01`
7. Replay and verify the notebook patch
8. Run the release check and secret scan

Then update `docs/PROGRESS.md` with an acceptance matrix showing each gate as pass, fail, partial, or not run. Do not mark a gate complete without evidence.

## Completion response

When the repository is ready, give a concise release report containing:

- Implemented architecture and user journey
- Exact files and major modules created
- Commands/tests run and their results
- Measured achieved metrics
- Live-mode requirements and replay status
- Known unsupported cases and limitations
- The highest-risk remaining issue, if any

Proceed now: inspect the repository, write the build plan, and implement Milestone 1. Continue through later milestones automatically as each exit gate passes.
