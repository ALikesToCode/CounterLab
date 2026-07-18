import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { migrateBeliefTestV1ToV2 } from "@counterlab/contracts";

import { App } from "./App";
import { replayFixture } from "./components/replay/ProofCapsuleReplayView.fixture";
import { sampleArtifact, sampleResult } from "./sample";

const artifact = {
  artifactId: "artifact_sample",
  fileName: sampleArtifact.fileName,
  fileSha256: sampleArtifact.fileSha256,
  nbformat: 4,
  support: { status: "SUPPORTED", reasons: [] },
  cells: [],
  schemaSummary: {
    fields: [],
    rowCount: sampleArtifact.rows,
    entityCandidates: ["customer_id"],
    targetCandidates: ["churned"],
  },
  packageHints: ["sklearn"],
  createdAt: "2026-07-14T09:00:00.000Z",
};

const uploadedArtifact = {
  ...artifact,
  artifactId: "artifact_uploaded",
  fileName: "uploaded_customer_model.ipynb",
  fileSha256: "a".repeat(64),
};

const liveBeliefTest = {
  schemaVersion: "1",
  id: "belief_live_ui",
  concept: "entity_leakage",
  learnerClaim: "The notebook accuracy proves generalization to new customers.",
  currentHypothesis: {
    statement: "Live current hypothesis from the submitted claim.",
    predictedOutcome: "Accuracy remains high for held-out customers.",
  },
  competingHypothesis: {
    statement:
      "Live competing hypothesis: repeated identity crosses the split.",
    predictedOutcome: "Accuracy falls when complete customers are held out.",
  },
  evidenceRefs: [
    {
      kind: "schema",
      hash: "c".repeat(64),
      excerpt: "customer_id identifies the evaluation boundary",
      relevance: "The claim targets unseen customers.",
    },
  ],
  alternatives: [
    {
      label: "Metric choice",
      rationale: "Accuracy can hide class-specific errors.",
    },
  ],
  decisiveIntervention: {
    id: "live-group-split",
    description: "Hold out complete customers.",
    controlledVariables: ["model", "metric", "seed"],
    changedVariables: ["split boundary"],
    discriminatesBecause: "The hypotheses predict different held-out accuracy.",
  },
  uncertainty: {
    confidence: 0.88,
    limitations: ["This test covers the supplied notebook evidence only."],
    insufficientEvidence: false,
  },
  requiresLearnerConfirmation: true,
};

const imbalanceBeliefTest = {
  ...liveBeliefTest,
  id: "belief_live_imbalance_ui",
  concept: "class_imbalance" as const,
  learnerClaim:
    "The 99 percent accuracy means this fraud model catches rare fraud.",
  currentHypothesis: {
    statement: "High accuracy means the classifier is useful.",
    predictedOutcome: "Rare-class recall should be strong.",
  },
  competingHypothesis: {
    statement: "Class rarity lets a majority predictor appear highly accurate.",
    predictedOutcome:
      "The majority baseline stays high while rare-class recall is poor.",
  },
  evidenceRefs: [
    {
      kind: "metric" as const,
      cellIndex: 4,
      outputIndex: 0,
      hash: "e".repeat(64),
      excerpt: "accuracy: 0.99",
      relevance: "Overall accuracy does not reveal rare-class misses.",
    },
  ],
};

const liveBeliefSpec = {
  ...migrateBeliefTestV1ToV2(liveBeliefTest),
  learnerDecision: "UNDECIDED" as const,
};

const liveImbalanceBeliefSpec = {
  ...migrateBeliefTestV1ToV2(imbalanceBeliefTest),
  learnerDecision: "CONFIRMED" as const,
};

const livePreview = {
  schemaVersion: "1" as const,
  concept: "entity_leakage" as const,
  conceptTitle: "Entity leakage",
  previewHash: "d".repeat(64),
  requiresSensitiveApproval: false,
  sanitizedContent: {
    learnerClaim:
      "The notebook accuracy proves generalization to new customers.",
    supportStatus: "SUPPORTED",
    evidence: [
      {
        cellIndex: 3,
        kind: "code",
        excerpt: "train_test_split(X, y, random_state=42)",
      },
    ],
  },
};

const sensitiveLivePreview = {
  ...livePreview,
  requiresSensitiveApproval: true,
  sanitizedContent: {
    ...livePreview.sanitizedContent,
    evidence: [
      {
        cellIndex: 3,
        kind: "code",
        excerpt: "token = '[REDACTED_SECRET]'",
      },
    ],
  },
};

const operationByRun = {
  random_row_split: "leakage.random_row_split",
  customer_group_split: "leakage.group_holdout",
  identity_ablation: "leakage.identity_ablation",
} as const;

const liveResult = {
  ...sampleResult,
  schemaVersion: "2" as const,
  planId: "plan_live_ui",
  sessionId: "session_ui",
  artifactManifestHash: uploadedArtifact.fileSha256,
  conceptPackVersion: "1.0.0",
  runs: sampleResult.runs.map((run) => ({
    ...run,
    operation:
      operationByRun[run.id as keyof typeof operationByRun] ??
      "leakage.random_row_split",
  })),
};

const committedPrediction = {
  schemaVersion: "1" as const,
  id: "prediction_ui",
  sessionId: "session_ui",
  beliefTestId: liveBeliefSpec.id,
  choice: "Accuracy falls materially",
  confidence: 88,
  committedAt: "2026-07-14T09:03:00.000Z",
  immutableHash: "f".repeat(64),
};

const liveRunnerJob = {
  schemaVersion: "1" as const,
  jobId: "runner_job_ui",
  kind: "LAB_COMPILE" as const,
  status: "STARTING" as const,
  sessionId: "session_ui",
  artifactId: uploadedArtifact.artifactId,
  artifactManifestHash: uploadedArtifact.fileSha256,
  conceptPack: { id: "entity_leakage" as const, version: "1.0.0" },
  inputHashes: ["b".repeat(64)],
  stateVersion: 5,
  jobVersion: 2,
  createdAt: "2026-07-14T09:02:00.000Z",
  updatedAt: "2026-07-14T09:02:01.000Z",
  startedAt: "2026-07-14T09:02:01.000Z",
  dispatchAcknowledgedAt: "2026-07-14T09:02:01.000Z",
  attempt: 1,
  maxAttempts: 3,
  runnerIdentity: "cloudflare-container-runner-v1",
  timeoutSeconds: 180,
  outputHashes: [],
  eventCursor: 0,
};

function session(
  state: string,
  version: number,
  extra: Record<string, unknown> = {},
) {
  return {
    sessionId: "session_ui",
    artifactId: artifact.artifactId,
    mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    state,
    version,
    createdAt: "2026-07-14T09:01:00.000Z",
    updatedAt: "2026-07-14T09:01:00.000Z",
    ...extra,
  };
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message, status } }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

function installApi(
  options: {
    liveGpt?: "configured" | "server-key-required";
    runner?: "configured" | "local-runner-required";
    rejectLiveBelief?: boolean;
    beliefTest?: typeof liveBeliefTest | typeof imbalanceBeliefTest;
    stallRunner?: boolean;
    failRunnerResume?: boolean;
    preview?: typeof livePreview | typeof sensitiveLivePreview;
    restoredSessionState?:
      | "INGESTED"
      | "BELIEF_TEST_PROPOSED"
      | "BELIEF_TEST_CONFIRMED"
      | "LAB_COMPILING"
      | "LAB_VERIFIED"
      | "EXPERIMENT_COMPLETED";
    restoredSessionExtra?: Record<string, unknown>;
    replay?: ReturnType<typeof replayFixture>;
  } = {},
) {
  let activeMode:
    | { kind: "sample_lesson"; sampleId: "leakage-01" }
    | { kind: "live_notebook" } = {
    kind: "sample_lesson",
    sampleId: "leakage-01",
  };
  let activeArtifactId = artifact.artifactId;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/health") {
        return response({
          platform: "cloudflare-workers",
          sample: "available",
          replay: "available",
          liveGpt: options.liveGpt ?? "server-key-required",
          liveCodex: options.runner ?? "local-runner-required",
          liveKernel: options.runner ?? "local-runner-required",
          sandbox: options.runner ?? "local-runner-required",
          requestId: "request_ui",
        });
      }
      if (path === "/api/artifacts") {
        return response(
          init?.body instanceof FormData ? uploadedArtifact : artifact,
          201,
        );
      }
      if (path === "/api/sample/sessions") {
        activeMode = { kind: "sample_lesson", sampleId: "leakage-01" };
        return response(session("INGESTED", 1, { mode: activeMode }), 201);
      }
      if (path === "/api/live/sessions") {
        activeMode = { kind: "live_notebook" };
        activeArtifactId = uploadedArtifact.artifactId;
        return response(
          session("INGESTED", 1, {
            artifactId: activeArtifactId,
            mode: activeMode,
          }),
          201,
        );
      }
      if (path === `/api/artifacts/${uploadedArtifact.artifactId}`) {
        return response(uploadedArtifact);
      }
      if (path === "/api/sessions/session_ui") {
        return response(
          session(options.restoredSessionState ?? "LAB_COMPILING", 5, {
            artifactId: uploadedArtifact.artifactId,
            mode: { kind: "live_notebook" },
            ...options.restoredSessionExtra,
          }),
        );
      }
      if (path.includes("/jobs/runner_job_ui/events?after=")) {
        if (options.failRunnerResume) {
          return response({
            events: [],
            nextCursor: 0,
            jobStatus: "FAILED",
            terminal: true,
            jobError: {
              code: "CODEX_TURN_FAILED",
              message: "The bounded compiler turn failed.",
              retryable: false,
            },
          });
        }
        return response({
          events: [],
          nextCursor: 0,
          jobStatus: "STARTING",
          terminal: false,
        });
      }
      if (path.endsWith("/jobs/runner_job_ui/cancel")) {
        return response({
          ...session("LAB_REJECTED", 6, {
            artifactId: uploadedArtifact.artifactId,
            mode: { kind: "live_notebook" },
          }),
          runnerJob: {
            ...liveRunnerJob,
            status: "CANCELLED",
            jobVersion: 3,
            completedAt: "2026-07-14T09:02:02.000Z",
            error: {
              code: "RUNNER_JOB_CANCELLED",
              message: "The learner cancelled this runner job.",
              retryable: true,
            },
          },
          reused: false,
          runnerAcknowledged: true,
        });
      }
      if (path.endsWith("/belief-test/preview")) {
        return response(options.preview ?? livePreview);
      }
      if (path.endsWith("/belief-test")) {
        if (activeMode.kind === "live_notebook" && options.rejectLiveBelief) {
          return errorResponse(
            "LIVE_UNAVAILABLE",
            "Responses endpoint authentication failed",
            503,
          );
        }
        return response(
          session("BELIEF_TEST_PROPOSED", 2, {
            artifactId: activeArtifactId,
            mode: activeMode,
            ...(activeMode.kind === "live_notebook"
              ? { beliefTest: options.beliefTest ?? liveBeliefTest }
              : {}),
          }),
        );
      }
      if (path.endsWith("/belief-test/confirm")) {
        return response(
          session("BELIEF_TEST_CONFIRMED", 3, {
            artifactId: activeArtifactId,
            mode: activeMode,
          }),
        );
      }
      if (path.endsWith("/prediction")) {
        return response(
          session("PREDICTION_COMMITTED", 4, {
            artifactId: activeArtifactId,
            mode: activeMode,
          }),
          201,
        );
      }
      if (path.endsWith("/lab/compile")) {
        if (options.stallRunner) {
          return response({
            ...session("LAB_COMPILING", 5, {
              artifactId: activeArtifactId,
              mode: activeMode,
            }),
            runnerJob: liveRunnerJob,
          });
        }
        return response(
          session("LAB_VERIFIED", 6, {
            artifactId: activeArtifactId,
            mode: activeMode,
          }),
        );
      }
      if (path.endsWith("/lab/run")) {
        return response(
          session("EXPERIMENT_COMPLETED", 7, {
            artifactId: activeArtifactId,
            mode: activeMode,
            verifiedResult:
              activeMode.kind === "live_notebook" ? liveResult : sampleResult,
          }),
        );
      }
      if (path.startsWith("/api/replays/")) {
        const replayId = decodeURIComponent(path.slice("/api/replays/".length));
        if (options.replay?.replayId === replayId) {
          return response(options.replay);
        }
        return response({
          schemaVersion: "1",
          replayId,
          replay: true,
          recordedAt: "2026-07-14T11:50:37.947Z",
          modelId: "gpt-5.6-sol",
          fixtureId: "customer-churn-public-v1",
          verifierVersion: "leakage-verifier-v1",
          templateCommit: "4f2f647228304d63ac8b9cba8cdca1dc7a07e192",
          compilerTrace: {
            schemaVersion: "1",
            replayId: "leakage-01",
            label: "Verified replay",
            trace: [{ stage: "external_verifier", status: "VERIFIED" }],
          },
          result: sampleResult,
          patch: { status: "VERIFIED" },
        });
      }
      throw new Error(
        `Unexpected UI test request: ${init?.method ?? "GET"} ${path}`,
      );
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const storageValues = new Map<string, string>();
const testStorage: Storage = {
  get length() {
    return storageValues.size;
  },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => {
    storageValues.delete(key);
  },
  setItem: (key, value) => {
    storageValues.set(key, value);
  },
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: testStorage,
  });
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
  installApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openLiveSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: /your question or claim/i }),
    "Does this result hold in deployment?",
  );
  await user.click(screen.getByRole("button", { name: /test this claim/i }));
}

async function openSampleModelDuel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: /try verified sample/i }),
  );
  await screen.findByRole("heading", {
    name: /what do you think the score means/i,
  });
  await user.type(
    screen.getByLabelText(/your claim/i),
    "The high score means the model will work for new customers.",
  );
  await user.click(
    screen.getByRole("button", { name: /compare two explanations/i }),
  );
}

describe("CounterLab judged flow", () => {
  it("keeps Judge Mode on its own refresh-safe route", async () => {
    window.localStorage.setItem("counterlab.mode", "live");
    window.localStorage.setItem("counterlab.sessionId", "stale_session");
    window.history.replaceState({}, "", "/judge");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /see a belief break in twenty seconds/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/judge");
    expect(
      screen.getByRole("link", { name: /watch verified replay/i }),
    ).toHaveAttribute("href", "/replay/leakage-01");
  });

  it("starts with a question and keeps every honest path available", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "What result are you trying to understand?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/attach notebook/i)).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /try verified sample/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /watch verified replay/i }),
    ).toBeEnabled();
    expect(screen.getByRole("link", { name: /judge mode/i })).toHaveAttribute(
      "href",
      "/judge",
    );
    expect(screen.getByText(/no account needed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/read for evidence and never run/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /test this claim/i }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", {
        name: /why did my model score highly but fail/i,
      }),
    );
    expect(
      screen.getByRole("button", { name: /test this claim/i }),
    ).toBeEnabled();
    expect(document.body).not.toHaveTextContent(/98\.5|59\.4/);
    expect(document.body).not.toHaveTextContent(
      /formalize|discriminating|canonical|mutation/i,
    );
    expect(document.body).not.toHaveTextContent(
      /teaches two machine-learning mistakes/i,
    );
  });

  it("does not end live notebook analysis at a local boundary when the hosted runner is configured", async () => {
    const user = userEvent.setup();
    installApi({ liveGpt: "configured", runner: "configured" });
    render(<App />);

    await openLiveSetup(user);

    expect(
      await screen.findByText(/hosted notebook runner is ready/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/local runner required/i);
  });

  it("accepts a notebook from the question-first landing without running it", async () => {
    const user = userEvent.setup();
    const fetcher = installApi();
    render(<App />);

    await user.upload(
      screen.getByLabelText(/attach notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path) === "/api/artifacts" && init?.method === "POST",
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([path]) => String(path).endsWith("/lab/run")),
    ).toBe(false);
  });

  it("tells the notebook evidence story with exact references", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /try verified sample/i }),
    );

    const story = within(
      await screen.findByRole("region", { name: /notebook evidence story/i }),
    );
    const exactReferences = within(
      story.getByRole("list", { name: /exact evidence references/i }),
    );
    expect(exactReferences.getByText("Cell 3 · output 0")).toBeInTheDocument();
    expect(exactReferences.getByText("Cell 3 · source")).toBeInTheDocument();
    expect(story.getByText(/score shown in the notebook/i)).toBeInTheDocument();
    await user.click(story.getByText(/full evidence and integrity/i));
    expect(story.getByText(/sha-256/i)).toBeInTheDocument();
  });

  it("shows an honest unavailable state when live reasoning is not configured", async () => {
    const user = userEvent.setup();
    installApi({ liveGpt: "server-key-required" });
    render(<App />);

    await openLiveSetup(user);

    expect(
      await screen.findByRole("heading", { name: "Test my notebook" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/live notebook lessons are not set up/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing was sent/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/OPENAI|GPT-|https?:\/\//i);
  });

  it("requires approval for a sensitive-looking sanitized preview", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      preview: sensitiveLivePreview,
    });
    render(<App />);

    await openLiveSetup(user);
    await user.click(
      await screen.findByRole("button", {
        name: /continue with my notebook/i,
      }),
    );
    await user.upload(
      screen.getByLabelText(/use a different notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );
    const liveClaim = screen.getByLabelText(/your claim/i);
    await user.clear(liveClaim);
    await user.type(
      liveClaim,
      "The notebook accuracy proves generalization to new customers.",
    );
    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );

    const sendButton = await screen.findByRole("button", {
      name: /send this evidence/i,
    });
    expect(sendButton).toBeDisabled();
    expect(
      screen.getByText(/redacted sensitive-looking excerpt/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: /reviewed the redacted sensitive-looking excerpt/i,
      }),
    );
    expect(sendButton).toBeEnabled();
  });

  it("starts a configured live notebook and completes the hosted artifact-specific lab", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({ liveGpt: "configured", runner: "configured" });
    render(<App />);

    await openLiveSetup(user);
    expect(
      await screen.findByText(/notebook lesson tools are ready to try/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/hosted notebook runner is ready/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /continue with my notebook/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText(/use a different notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );
    expect(
      (await screen.findAllByText(uploadedArtifact.fileName)).length,
    ).toBeGreaterThan(0);
    const liveClaim = screen.getByLabelText(/your claim/i);
    await user.clear(liveClaim);
    await user.type(
      liveClaim,
      "The notebook accuracy proves generalization to new customers.",
    );
    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /review the evidence sent for analysis/i,
      }),
    ).toBeInTheDocument();
    const packetSummary = screen.getByRole("complementary", {
      name: /privacy packet summary/i,
    });
    expect(within(packetSummary).getByText(/your claim/i)).toBeInTheDocument();
    expect(
      within(packetSummary).getByText(/short notebook excerpts/i),
    ).toBeInTheDocument();
    expect(
      within(packetSummary).getByText(/schema names/i),
    ).toBeInTheDocument();
    expect(within(packetSummary).getByText(/no raw rows/i)).toBeInTheDocument();
    expect(
      within(packetSummary).getByText(/no notebook file/i),
    ).toBeInTheDocument();
    expect(
      within(packetSummary).getByText(/no local paths/i),
    ).toBeInTheDocument();
    await user.click(within(packetSummary).getByText(/review exact packet/i));
    expect(screen.getByText(/train_test_split/)).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).endsWith("/belief-test"),
      ),
    ).toBe(false);
    await user.click(
      screen.getByRole("button", { name: /send this evidence/i }),
    );

    expect(
      await screen.findByRole("region", { name: /model duel/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/live competing hypothesis/i)).toBeInTheDocument();
    expect(
      screen.getByText(/the claim targets unseen customers/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/customer_id identifies the evaluation boundary/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /yes, this captures my view/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(
      screen.getByRole("button", { name: /seal my prediction/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /the result is ready/i }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/local runner required/i);
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).endsWith("/lab/compile"),
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([path]) => String(path).endsWith("/lab/run")),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path) === "/api/live/sessions" &&
          String(init?.body).includes(uploadedArtifact.artifactId),
      ),
    ).toBe(true);
  });

  it("requires verified Boundary authority before a live learner can revise", async () => {
    installApi({
      liveGpt: "configured",
      runner: "configured",
      restoredSessionState: "EXPERIMENT_COMPLETED",
      restoredSessionExtra: { verifiedResult: liveResult },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("button", { name: /map the boundary/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/your revised mental model/i),
    ).not.toBeInTheDocument();
  });

  it("reviews a completed stage and restores focus to canonical progress", async () => {
    const user = userEvent.setup();
    installApi({
      restoredSessionState: "EXPERIMENT_COMPLETED",
      restoredSessionExtra: { verifiedResult: liveResult },
    });
    window.history.replaceState({}, "", "/session/session_ui");
    render(<App />);

    const desktopProgress = within(
      await screen.findByTestId("learner-progress-desktop"),
    );
    await user.click(
      desktopProgress.getByRole("button", { name: /review prediction/i }),
    );
    const reviewTitle = await screen.findByRole("heading", {
      name: /review your prediction/i,
    });
    expect(reviewTitle).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: /return to current step/i }),
    );
    await vi.waitFor(() =>
      expect(document.getElementById("learner-progress")).toHaveFocus(),
    );
  });

  it("keeps the two models equal and lets the learner edit their meaning", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSampleModelDuel(user);

    const duel = await screen.findByRole("region", { name: /model duel/i });
    expect(
      within(duel).getByRole("article", {
        name: /your current explanation/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(duel).getByRole("article", {
        name: /alternative counterlab will test/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /does your current explanation capture what you mean/i,
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /edit my explanation/i }),
    );
    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/your claim/i)).toHaveValue(
      "The high score means the model will work for new customers.",
    );
  });

  it("records not-enough-evidence without sealing a prediction", async () => {
    const user = userEvent.setup();
    const fetcher = installApi();
    render(<App />);
    await openSampleModelDuel(user);

    await user.click(screen.getByText(/more ways to respond/i));
    await user.click(
      screen.getByRole("button", { name: /not enough evidence/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    const responseRequest = fetcher.mock.calls.find(
      ([path, init]) =>
        String(path).endsWith("/belief-test/confirm") &&
        String(init?.body).includes("insufficient_evidence"),
    );
    expect(responseRequest).toBeDefined();
    expect(
      fetcher.mock.calls.some(([path]) => String(path).endsWith("/prediction")),
    ).toBe(false);
  });

  it("keeps the first failed live request provider-neutral and on the claim screen", async () => {
    const user = userEvent.setup();
    installApi({ liveGpt: "configured", rejectLiveBelief: true });
    render(<App />);

    await openLiveSetup(user);
    await user.click(
      await screen.findByRole("button", { name: /continue with my notebook/i }),
    );
    await user.upload(
      screen.getByLabelText(/use a different notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );
    const rejectedClaim = await screen.findByLabelText(/your claim/i);
    await user.clear(rejectedClaim);
    await user.type(
      rejectedClaim,
      "The notebook accuracy proves generalization to new customers.",
    );
    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );
    await user.click(
      await screen.findByRole("button", { name: /send this evidence/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /live reasoning is unavailable/i,
    );
    expect(
      screen.getByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /Responses endpoint|OpenAI|GPT-/i,
    );
  });

  it("restores an active live compile and lets the learner cancel it safely", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJobId",
      liveRunnerJob.jobId,
    );
    window.localStorage.setItem(
      "counterlab.activeRunnerJobKind",
      liveRunnerJob.kind,
    );

    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: /cancel this test/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /runner stopped safely/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cancelled this test before it could release a result/i),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path).endsWith("/jobs/runner_job_ui/cancel") &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("reacquires an idempotent compile job when refresh lost the local job checkpoint", async () => {
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    const view = render(<App />);

    expect(
      await screen.findByRole("button", { name: /cancel this test/i }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path).endsWith("/sessions/session_ui/lab/compile") &&
          init?.method === "POST",
      ),
    ).toBe(true);
    expect(window.localStorage.getItem("counterlab.activeRunnerJobId")).toBe(
      liveRunnerJob.jobId,
    );

    view.unmount();
  });

  it("reacquires an unacknowledged fixed run after refresh", async () => {
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      restoredSessionState: "LAB_VERIFIED",
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: "runner_job_ui",
        kind: "LAB_RUN",
      }),
    );

    render(<App />);

    await vi.waitFor(
      () =>
        expect(
          fetcher.mock.calls.some(
            ([path, init]) =>
              String(path).endsWith("/sessions/session_ui/lab/run") &&
              init?.method === "POST",
          ),
        ).toBe(true),
      { timeout: 750 },
    );
    expect(
      await screen.findByRole("heading", { name: /the result is ready/i }),
    ).toBeInTheDocument();
  });

  it("opens a shareable session route without depending on local mode storage", async () => {
    installApi({ restoredSessionState: "INGESTED" });
    window.history.pushState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/live generation/i)).toBeInTheDocument();
  });

  it("keeps URL synchronization active when a restored runner resume fails", async () => {
    installApi({
      restoredSessionState: "LAB_COMPILING",
      stallRunner: true,
      failRunnerResume: true,
    });
    window.history.replaceState({}, "", "/proof/session_ui");

    render(<App />);

    expect(
      await screen.findByText(/the bounded compiler turn failed/i),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/session/session_ui");
  });

  it("renders the exact Belief Spec v2 after a live session refresh", async () => {
    installApi({
      restoredSessionState: "BELIEF_TEST_PROPOSED",
      restoredSessionExtra: { beliefSpec: liveBeliefSpec },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByText(liveBeliefSpec.hypotheses[0].statement),
    ).toBeInTheDocument();
    expect(
      screen.getByText(liveBeliefSpec.hypotheses[1].statement),
    ).toBeInTheDocument();
    expect(
      screen.getByText(liveBeliefSpec.evidenceRefs[0]!.relevance),
    ).toBeInTheDocument();
    expect(screen.getByText(liveBeliefSpec.claim)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /customer_id encoded|98\.5% accuracy/i,
    );
  });

  it("restores the immutable Prediction Seal after refresh", async () => {
    installApi({
      restoredSessionState: "LAB_VERIFIED",
      restoredSessionExtra: {
        beliefSpec: liveBeliefSpec,
        prediction: committedPrediction,
        verifiedResult: liveResult,
      },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    const seal = within(
      await screen.findByRole("region", { name: /sealed prediction/i }),
    );
    expect(seal.getByText(committedPrediction.choice)).toBeInTheDocument();
    expect(seal.getByText("88%")).toBeInTheDocument();
    expect(seal.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /the result is ready/i }),
    ).toBeInTheDocument();
  });

  it("commits class-imbalance prediction wording from Belief Spec v2", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      restoredSessionState: "BELIEF_TEST_CONFIRMED",
      restoredSessionExtra: { beliefSpec: liveImbalanceBeliefSpec },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    await user.click(
      await screen.findByRole("radio", {
        name: /expose a serious minority-class problem/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /seal my prediction/i }),
    );

    await vi.waitFor(() => {
      const predictionRequest = fetcher.mock.calls.find(([path]) =>
        String(path).endsWith("/prediction"),
      );
      expect(predictionRequest).toBeDefined();
      expect(String(predictionRequest?.[1]?.body)).toContain(
        "Minority metrics expose a serious evaluation problem",
      );
      expect(String(predictionRequest?.[1]?.body)).not.toContain(
        "Accuracy falls materially",
      );
    });
  });

  it("uses class-imbalance language when the analyst routes a rare-event notebook", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      beliefTest: imbalanceBeliefTest,
    });
    render(<App />);

    await openLiveSetup(user);
    await user.click(
      await screen.findByRole("button", { name: /continue with my notebook/i }),
    );
    await user.upload(
      screen.getByLabelText(/use a different notebook/i),
      new File(["{}"], "fraud_model.ipynb", {
        type: "application/json",
      }),
    );
    const imbalanceClaim = await screen.findByLabelText(/your claim/i);
    await user.clear(imbalanceClaim);
    await user.type(imbalanceClaim, imbalanceBeliefTest.learnerClaim);
    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );
    await user.click(
      await screen.findByRole("button", { name: /send this evidence/i }),
    );

    expect(
      (await screen.findAllByText(/rarity hides failure/i)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/majority baseline, confusion matrix/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /hold out entire customers|customer memory/i,
    );
  });

  it("keeps computed results hidden until an immutable prediction is committed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /try verified sample/i }),
    );
    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    const exactReferences = within(
      screen.getByRole("list", { name: /exact evidence references/i }),
    );
    expect(exactReferences.getByText(/cell 3 · output 0/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /here.s what changed/i }),
    ).not.toBeInTheDocument();

    const continueButton = screen.getByRole("button", {
      name: /compare two explanations/i,
    });
    expect(continueButton).toBeDisabled();
    await user.type(
      screen.getByLabelText(/your claim/i),
      "The 98.5% test accuracy proves the model generalizes to new customers.",
    );
    await user.click(continueButton);

    expect(
      await screen.findByRole("heading", {
        name: /does your current explanation capture what you mean/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/partly remembers customers/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /here.s what changed/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /yes, this captures my view/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(
      screen.getByRole("button", { name: /seal my prediction/i }),
    );

    expect(
      await screen.findByRole("region", { name: /sealed prediction/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /the fair test is ready/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run the fair test/i }),
    ).toBeEnabled();
    expect(screen.queryByText(/new customers 59\.4%/i)).not.toBeInTheDocument();
  });

  it("keeps the replay label persistent across the judged flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /watch verified replay/i }),
    );
    expect(
      (await screen.findAllByText(/verified replay/i)).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /continue replay/i }));
    expect(screen.getAllByText(/verified replay/i).length).toBeGreaterThan(0);
  });

  it("restores the exact replay URL instead of substituting the bundled replay", async () => {
    const replayId = "replay/dynamic one";
    window.localStorage.setItem("counterlab.mode", "replay");
    window.localStorage.setItem("counterlab.replayId", "stale-replay");
    window.history.replaceState(
      {},
      "",
      `/replay/${encodeURIComponent(replayId)}`,
    );
    const fetcher = installApi();

    render(<App />);

    expect((await screen.findAllByText(replayId, { exact: true })).length).toBe(
      2,
    );
    expect(window.location.pathname).toBe(
      `/replay/${encodeURIComponent(replayId)}`,
    );
    expect(
      fetcher.mock.calls.some(
        ([path]) =>
          String(path) === `/api/replays/${encodeURIComponent(replayId)}`,
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/replays/leakage-01",
      ),
    ).toBe(false);
  });

  it("lets an explicit session URL override stale replay storage", async () => {
    window.localStorage.setItem("counterlab.mode", "replay");
    window.localStorage.setItem("counterlab.replayId", "replay_retention_913");
    window.history.replaceState({}, "", "/session/session_ui");
    const fetcher = installApi({ restoredSessionState: "INGESTED" });

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/session/session_ui");
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/sessions/session_ui",
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).startsWith("/api/replays/"),
      ),
    ).toBe(false);
  });

  it("does not carry a claim from another session into an explicit session URL", async () => {
    window.localStorage.setItem("counterlab.sessionId", "session_old");
    window.localStorage.setItem(
      "counterlab.claim",
      "A claim from another notebook",
    );
    window.history.replaceState({}, "", "/session/session_ui");
    installApi({ restoredSessionState: "INGESTED" });

    render(<App />);

    expect(await screen.findByLabelText(/your claim/i)).toHaveValue("");
  });

  it("keeps the explicit landing URL instead of restoring stale replay state", () => {
    window.localStorage.setItem("counterlab.mode", "replay");
    window.localStorage.setItem("counterlab.replayId", "replay_retention_913");
    const fetcher = installApi();

    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).startsWith("/api/replays/"),
      ),
    ).toBe(false);
  });

  it("reconstructs the landing page when browser history emits popstate", async () => {
    window.history.replaceState({}, "", "/replay/leakage-01");
    installApi();
    render(<App />);

    expect(
      (await screen.findAllByText(/verified replay/i)).length,
    ).toBeGreaterThan(0);

    act(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    const landingTitle = await screen.findByRole("heading", {
      name: /what result are you trying to understand/i,
    });
    expect(landingTitle).toHaveFocus();
    expect(screen.queryByLabelText("Replay status")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Verified replay mode"),
    ).not.toBeInTheDocument();
  });

  it("renders a hosted Capsule replay as read-only artifact-specific evidence", async () => {
    const user = userEvent.setup();
    const replay = replayFixture("class_imbalance");
    window.history.replaceState(
      {},
      "",
      `/replay/${encodeURIComponent(replay.replayId)}`,
    );
    const fetcher = installApi({ replay });

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /live notebook claim, replayed from verified evidence/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(replay.artifactManifest.fileName),
    ).toBeInTheDocument();
    expect(screen.getByText(replay.beliefSpec.claim)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(sampleArtifact.fileName);
    expect(screen.queryByText(/run fair test/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lock my answer/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/verify notebook patch/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /download proof capsule/i }),
    ).toHaveAttribute(
      "href",
      `/api/replays/${encodeURIComponent(replay.replayId)}/proof-capsule`,
    );
    expect(
      fetcher.mock.calls.every(([, init]) =>
        [undefined, "GET"].includes(init?.method),
      ),
    ).toBe(true);

    await user.click(
      screen.getByRole("button", { name: /start new analysis/i }),
    );
    expect(window.location.pathname).toBe("/");
    expect(
      screen.getByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toHaveFocus();
  });

  it("does not label an unknown replay as verified", async () => {
    window.history.replaceState({}, "", "/replay/missing-replay");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        errorResponse("REPLAY_NOT_FOUND", "Replay was not found", 404),
      ),
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /replay was not found/i,
    );
    expect(screen.queryByLabelText(/replay status/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/verified replay/i);
  });
});
