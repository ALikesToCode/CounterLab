# CounterLab repository instructions

## Mission

Build **CounterLab**, a competition-grade education product whose core promise is:

> CounterLab is CI for understanding. It treats a learner's claim like code: formalize it, run a discriminating test, reject invalid evidence, verify transfer, and only then merge the repair.

The memorable line is:

> Chatbots explain. CounterLab lets reality answer.

The judged product is not a generic tutor, notebook copilot, quiz generator, arbitrary simulation platform, or unrestricted code generator. It is a narrow, evidence-producing workflow for machine-learning evaluation misconceptions in Jupyter notebooks.

## Working agreement

- Read this file before changing code.
- Inspect the repository, existing tests, and current state before proposing work.
- For an authorized build or fix, make all safe in-scope local changes and run non-destructive validation without asking for routine approval.
- Ask only when credentials are missing, an external write is required, a destructive action is unavoidable, or the requested scope would materially expand.
- Do not stop after planning. Implement, test, repair, document, and leave the repository runnable.
- Do not leave TODO markers, placeholder routes, fake counters, canned charts presented as live results, dead buttons, or stubbed production code.
- When a live integration cannot run because a credential or local executable is unavailable, finish the complete replay/test path, make the live path fail clearly, and document the exact command or environment variable needed.
- Keep `docs/PROGRESS.md` and `docs/DECISIONS.md` current after each milestone.
- Preserve an honest distinction between achieved results, targets, replays, unsupported cases, and evaluation still in progress.

## Scope contract

### P0 hero

Ship one impeccable end-to-end concept first:

- **Entity/data leakage in a scikit-learn classification notebook**
- One preloaded customer-churn notebook
- One uploaded `.ipynb` path within the documented support contract
- A learner text claim
- An evidence-linked Belief Test
- Immutable prediction and confidence
- Runtime Codex plan/adapter generation
- External mutation verification and, when needed, repair
- Real computed comparison: random row split versus customer-group split and identity-feature ablation
- Learner revision
- Surface-different fixed transfer task involving future leakage in forecasting
- Transfer-gated minimal notebook patch
- Learner-facing Reasoning Diff and machine-facing Proof Bundle
- Judge Mode with instant sample, live generation, and visibly labelled replay

### P0.5 anti-template proof

Only after every P0 acceptance gate passes, add **class imbalance and metric choice** as a second concept family. It exists to show that CounterLab is not merely a leakage template.

### Explicit cuts

Do not build these before submission:

- All STEM subjects or “any notebook” support
- Voice input, screenshot intake, generic `.py` upload, arbitrary package installation, or arbitrary datasets
- Calibration as a third polished concept before P0 and P0.5 are clean-clone reproducible
- Authentication, accounts, multi-tenancy, an instructor dashboard, LMS features, marketplace, collaboration, or native mobile apps
- Model-only grading of free-form explanations
- High-stakes mastery claims, proctoring, authorship detection, hiring scores, or certificates
- Multi-model voting or fusion with Kimi, GLM, DeepSeek, or other providers in the judged path
- Unrestricted model-authored code, network access, filesystem access, shell access, or dependency installation inside generated lab modules
- An unlabelled replay or a staged verifier failure presented as live

## Product language and claim discipline

Use these user-facing terms:

- **Belief Test**: a user-confirmed, evidence-linked hypothesis about the learner's current mental model and a stronger competing model
- **Prediction Contract**: the learner's immutable pre-result prediction and confidence
- **Verified Lab**: a lab that passed named deterministic checks for a documented scope
- **Reasoning Diff**: before/after belief, evidence, transfer outcome, and unlocked code correction
- **Proof Bundle**: machine-readable plan, commands, mutations, hashes, limitations, and replay metadata

Use “verified” only for named falsifiable properties. Never imply that CounterLab proves global mastery, proves causality beyond the experiment, or understands the learner's mind. Valid states are `VERIFIED`, `PARTIAL`, `REJECTED`, `UNVERIFIED`, and `INSUFFICIENT_EVIDENCE`.

## Authority boundaries

### GPT-5.6 reasoning analyst

May:

- Receive sanitized notebook structure, code excerpts, displayed outputs, metrics, schema summaries, and the learner's claim
- Produce a schema-constrained Belief Test with competing hypotheses, evidence references, alternatives, uncertainty, and the smallest discriminating intervention
- Ask Socratic questions grounded in verified results
- Explain a verified patch after transfer

Must never:

- Execute uploaded notebook cells
- Fabricate experimental results
- Decide whether generated code is valid
- Grade understanding from prose style
- Declare mastery or silently finalize a misconception diagnosis

Use the official OpenAI Responses API and a current structured-output mechanism. Default the API model through `OPENAI_MODEL`, with `gpt-5.6` as the default alias. Use intentional reasoning settings rather than blindly selecting the maximum. Keep raw data out of the request; send only the sanitized artifact context required for the Belief Test. Use `store: false` where supported and a stable privacy-preserving safety identifier for end-user requests.

### Runtime Codex lab compiler

May:

- Read the approved Belief Test, public Concept Pack SDK docs, redacted fixture schema, resource limits, and a bounded file list
- Create only `generated/<session-id>/experiment-plan.json`, `artifact-adapter.py`, and public tests
- Run allow-listed commands in an isolated worktree/container
- Receive structured verifier counterexamples and attempt at most two repairs
- After transfer passes, start a separate turn that creates a minimal patch to a copy of the original notebook

Must never:

- Read hidden verifier source, mutation catalogues, held-out fixtures, secrets, or unrelated user files
- Implement metric formulas, split primitives, chart rendering, transfer scoring, or the final validity decision
- Install arbitrary dependencies or use the network
- Modify the fixed kernel, verifier, transfer evaluator, or authoritative concept claims during a session

For rich live integration, use Codex App Server over its stable local `stdio` JSONL transport and relay sanitized events to the browser through server-sent events. Do not make the experimental App Server WebSocket transport part of the critical path. Use a stored, visibly labelled replay when live Codex is unavailable.

### Fixed experiment kernel

Owns:

- Synthetic fixtures and seeds
- Data splitting primitives
- Preprocessing primitives
- Model training
- Metric formulas
- Overlap computation
- Canonical result serialization
- Chart-ready data
- Transfer scoring

Generated code composes kernel APIs; it does not redefine numeric truth.

### Frozen verifier

Owns the final pass/fail decision for the documented invariants. It must run outside the Codex-visible workspace. Model-written public tests are useful diagnostics but are never the sole authority over model-written code.

### Learner

Owns confirmation or rejection of the Belief Test, the pre-result prediction, the revision, and the transfer attempt. The product must never reduce the learner to clicking “accept.”

## Supported notebook contract

P0 supports:

- Jupyter notebooks with `nbformat` 4
- Maximum file size defined in one central configuration value and documented in `docs/SUPPORT_CONTRACT.md`
- Python/scikit-learn classification patterns needed by the public customer-churn sample and held-out variants
- Code, markdown, and safe text/JSON outputs
- A text claim supplied by the learner

Parsing rules:

- Treat the notebook as untrusted data and never execute uploaded cells during intake
- Sanitize or omit HTML, JavaScript, SVG, widgets, and active output content
- Hash the original file, every cell source, and every accepted output
- Extract import hints, known estimator/split/metric symbols, displayed numeric metrics, feature names, and execution order
- Preserve exact evidence references to cell indexes and hashes
- Return typed unsupported reasons rather than guessing

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

Reject or mark unsupported:

- Unsupported magics, opaque custom binaries, embedded active content, corrupted JSON, oversized notebooks, external network dependencies, unknown package requirements, or missing evidence needed for a supported Belief Test

## Product flow

The user-facing experience is four screens, backed by a more detailed state machine.

1. **Claim**
   - Landing line and three Judge Mode choices
   - Preloaded sample or `.ipynb` upload
   - One prompt: “What do you think this result proves?”
   - Artifact evidence and support warnings

2. **Belief Test and prediction**
   - Learner claim
   - Current hypothesis and stronger competing hypothesis
   - Predicted result under each hypothesis
   - Three or fewer evidence chips
   - Alternatives and uncertainty
   - Confirm, edit, reject, or insufficient-evidence action
   - Immutable prediction and confidence committed before results exist

3. **Build and verify**
   - Sanitized Codex plan updates, file changes, commands, durations, structured verifier rejection, repair, and final commit
   - No private chain-of-thought
   - No result chart until a verified payload exists

4. **Reality, transfer, and repair**
   - Real baseline/intervention metrics and provenance
   - Original prediction shown beside observed results
   - Learner revision
   - Fixed forecasting transfer task with no model hints
   - Patch visibly locked before transfer and unlocked only after pass
   - Minimal notebook patch, patch verification, Reasoning Diff, Proof Bundle, and replay ID

## Canonical state machine

Use explicit, validated transitions:

```text
INGESTED
  -> BELIEF_TEST_PROPOSED
  -> BELIEF_TEST_CONFIRMED | INSUFFICIENT_EVIDENCE | REJECTED_BY_LEARNER
  -> PREDICTION_COMMITTED
  -> LAB_COMPILING
  -> LAB_REJECTED | LAB_VERIFIED
  -> EXPERIMENT_COMPLETED
  -> REVISION_RECORDED
  -> TRANSFER_IN_PROGRESS
  -> TRANSFER_FAILED | TRANSFER_PASSED
  -> PATCH_COMPILING
  -> PATCH_REJECTED | PATCH_VERIFIED
  -> REASONING_DIFF_ISSUED
```

Invalid transitions must be rejected server-side and tested.

## Generated artifact boundary

A runtime Codex turn may write only:

```text
generated/<session-id>/
├── experiment-plan.json
├── artifact-adapter.py
└── public_tests.py
```

The adapter must pass a static AST policy before execution. Allow only the fixed SDK and harmless standard-library typing/data declarations. Deny filesystem access, dynamic imports, `eval`, `exec`, subprocesses, sockets, HTTP clients, environment access, reflection used to escape the API, and direct implementation of metrics.

The post-transfer patch runs in a different worktree and may modify only a copy of the uploaded notebook plus a patch metadata file. It must never overwrite the original upload.

## Leakage experiment contract

The public fixture must be deterministic and must produce a real, inspectable failure mode:

- Multiple rows per customer
- A customer identity feature represented categorically
- A target that is highly predictable when the same customer appears in train and test
- Weak but nonzero generalizable signal after identity is removed
- A random row split that appears excellent
- A customer-group split that reveals substantially lower out-of-entity performance
- An identity ablation that removes the shortcut

Never hardcode displayed metrics. Tests may assert credible ranges, ordering, overlap invariants, and deterministic hashes, not a fabricated exact headline.

The fixed kernel must compute at least:

- Accuracy
- ROC AUC when valid
- Entity overlap count and rate
- Sample sizes
- Split strategy
- Seed
- Feature set fingerprint

## Active mutation verifier

The external verifier must attack candidates rather than merely run happy-path tests. Include at least these critical checks:

1. Group split has zero customer overlap
2. Displayed metrics respond when labels/data are mutated; literals and stale caches are rejected
3. Baseline and intervention differ only in declared variables
4. Identity ablation actually removes identity-derived features
5. Row reordering does not change canonical results beyond documented tolerance
6. Same seed and inputs produce the same canonical result hash
7. Chart labels, units, sample sizes, and data series match the verified payload
8. Network attempts fail under OS/container enforcement
9. Time, memory, process, file-count, and output-size limits are enforced
10. The experiment plan predicts observably different outcomes under the competing hypotheses
11. Hidden verifier and held-out files are not mounted or readable from the generation workspace
12. Unsupported or ambiguous cases are refused instead of verified

Keep independent seeded bad adapters under `evals/mutations/`. `scripts/run-mutations.sh leakage` must print a pass/fail matrix and exit nonzero on any missed critical mutation.

## Transfer and patch policy

The P0 transfer case is a surface-different forecasting scenario containing future leakage. The learner must choose a time-aware evaluation strategy and identify the future-information risk using fixed choices/evidence chips. The pass/fail decision is deterministic and does not depend on an LLM verdict.

Before transfer passes:

- Patch endpoint returns a locked state
- UI explains that CounterLab teaches before it repairs

After transfer passes:

- Start a separate Codex patch turn
- Apply the smallest viable correction to a copy of the supported notebook
- Verify notebook validity, allowed-cell scope, zero group overlap, recomputed metrics, reproducibility, and unchanged hashes for unrelated cells
- Reject broad edits, unexplained dependency changes, or collateral source changes

For the public sample, the patch must be fully verified. For an uploaded notebook outside the exact patch support contract, label a suggestion `UNVERIFIED` rather than stretching the claim.

## Judge Mode

The landing page must expose three honest paths:

- **Try instantly**: a no-account, no-secret path using a stored verified session and real computed payloads
- **Generate live**: uses GPT-5.6 and Codex when `OPENAI_API_KEY`, Codex authentication, and the sandbox are available
- **Replay verified session**: reconstructs an actual stored event log; a persistent banner must say it is a replay

Never stage a prerecorded sequence as live. If a live run passes on the first attempt, do not invent a rejection. The demo may use a labelled replay of a genuine prior reject-repair session for reliability.

## Data integrity and evidence

Store append-only evidence events. Canonicalize JSON before hashing. Chain event hashes using the previous event hash. Include actor, sequence, timestamp, input hashes, output hashes, model identifier, prompt hash, commit hash, duration, exit code, and a concise payload.

Use optional HMAC signing only when `COUNTERLAB_SIGNING_KEY` exists. Without a key, call the artifact “integrity-hashed,” not cryptographically signed.

The Proof Bundle must include:

- Artifact Manifest
- Approved Belief Test
- Prediction Contract
- Experiment plan
- Generated adapter hash and commit
- Public test results
- External verifier results and mutation names
- Canonical verified result set
- Learner revision
- Transfer result
- Patch diff and patch verifier result
- Event hash chain
- Environment, dependency, fixture, kernel, verifier, prompt, model, and template versions
- Known limitations and replay ID

## Visual and interaction standards

- Desktop-first, responsive, accessible, and polished enough for a judged product
- Navy for evidence/system state; blue for learner flow; purple for hypotheses/Reasoning Diff; aqua for verified computation; gold for prediction/patch; red only for rejected invariants or contradicted expectations
- Sparse first screen with one sentence and three Judge Mode choices
- No “AI command center” clutter
- Charts must show units, sample size, split strategy, and seed, plus an accessible table/provenance view
- Replays remain visibly labelled for the full session
- Support keyboard navigation, visible focus, reduced motion, readable contrast, and chart alternatives
- Never animate or preload experimental values before a verified result payload arrives

## Repository quality

Use strict TypeScript and typed Python. Keep business rules out of UI components. Validate every API boundary. Add structured error handling and typed unsupported states. Keep secrets server-side. Include `.env.example` with no real credentials.

Required runnable commands:

```bash
./scripts/dev.sh
./scripts/clean-demo.sh
./scripts/test-all.sh
./scripts/reproduce-session.sh leakage-01
./scripts/run-mutations.sh leakage
```

The clean demo must explain which capabilities work without secrets and which require live credentials.

Required documentation:

- `README.md`
- `docs/SUPPORT_CONTRACT.md`
- `docs/ARCHITECTURE.md`
- `docs/AUTHORITY_BOUNDARIES.md`
- `docs/THREAT_MODEL.md`
- `docs/EVALUATION.md`
- `docs/DEMO_SCRIPT.md`
- `docs/CODEX_USAGE.md`
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

The README must clearly separate what GPT-5.6 generates, what Codex generates, what fixed code computes, what the verifier proves, what remains unverified, and how replay differs from live generation.

## Acceptance gates

Do not start class imbalance until all leakage gates pass:

- One real `.ipynb` is parsed without execution and produces stable evidence references and hashes
- Belief Test is schema-valid, evidence-linked, editable, and can return insufficient evidence
- Prediction is immutable and no result exists before commitment
- Runtime Codex creates an artifact-specific plan/adapter in a fresh isolated workspace, or the live path is fully implemented and a genuine replay is available when credentials are absent
- Hidden verifier is inaccessible to Codex
- Every published critical leakage mutation is rejected
- At least one genuine reject-repair trace is persisted and replayable
- Verified charts use only canonical kernel output
- Fixed transfer evaluator passes/fails without an LLM
- Patch remains locked until transfer and then verifies on the public notebook without collateral changes
- Reasoning Diff and Proof Bundle reproduce from stored events
- `./scripts/test-all.sh` and `./scripts/clean-demo.sh` pass from a clean checkout
- README includes achieved metrics and known failures without invented claims

## Final reporting

At the end of a Codex work session, report:

1. What was implemented
2. Files changed
3. Commands and tests run, with results
4. Acceptance gates now passing
5. Honest blockers or unsupported cases
6. The next highest-value action

Do not expose private chain-of-thought. Report concise decisions, evidence, diffs, commands, and outcomes.
