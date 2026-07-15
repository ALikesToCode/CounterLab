import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
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
          session("LAB_COMPILING", 5, {
            artifactId: uploadedArtifact.artifactId,
            mode: { kind: "live_notebook" },
          }),
        );
      }
      if (path.includes("/jobs/runner_job_ui/events?after=")) {
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
        return response(livePreview);
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
      if (path === "/api/replays/leakage-01") {
        return response({
          schemaVersion: "1",
          replayId: "leakage-01",
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

describe("CounterLab judged flow", () => {
  it("explains the product in plain language and offers three honest paths", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "CounterLab" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Your notebook made a claim. Will it survive a fair test?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /lock what you expect.*verified test.*apply the lesson once.*unlock a repair/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /analyze a notebook/i }),
    ).toBeEnabled();
    expect(
      screen
        .getAllByRole("button", { name: /try the 3-minute sample/i })
        .every((button) => !button.hasAttribute("disabled")),
    ).toBe(true);
    expect(
      screen.getByRole("button", { name: /watch a verified replay/i }),
    ).toBeEnabled();
    expect(screen.getByText("Question the claim")).toBeInTheDocument();
    expect(screen.getByText("Let reality answer")).toBeInTheDocument();
    expect(screen.getByText("Transfer, then repair")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /generate live/i }));

    expect(
      await screen.findByText(/hosted notebook runner is ready/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/local runner required/i);
  });

  it("shows an honest unavailable state when live reasoning is not configured", async () => {
    const user = userEvent.setup();
    installApi({ liveGpt: "server-key-required" });
    render(<App />);

    await user.click(screen.getByRole("button", { name: /generate live/i }));

    expect(
      await screen.findByRole("heading", { name: "Test my notebook" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/live notebook lessons are not set up/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing was sent/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/OPENAI|GPT-|https?:\/\//i);
  });

  it("starts a configured live notebook and completes the hosted artifact-specific lab", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({ liveGpt: "configured", runner: "configured" });
    render(<App />);

    await user.click(screen.getByRole("button", { name: /generate live/i }));
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
    await user.type(
      screen.getByLabelText(/your claim/i),
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
      await screen.findByText(/live competing hypothesis/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the claim targets unseen customers/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/customer_id identifies the evaluation boundary/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /these two ideas make sense/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(screen.getByRole("button", { name: /lock my answer/i }));

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

  it("keeps the first failed live request provider-neutral and on the claim screen", async () => {
    const user = userEvent.setup();
    installApi({ liveGpt: "configured", rejectLiveBelief: true });
    render(<App />);

    await user.click(screen.getByRole("button", { name: /generate live/i }));
    await user.click(
      await screen.findByRole("button", { name: /continue with my notebook/i }),
    );
    await user.upload(
      screen.getByLabelText(/use a different notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );
    await user.type(
      await screen.findByLabelText(/your claim/i),
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

  it("uses class-imbalance language when the analyst routes a rare-event notebook", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      beliefTest: imbalanceBeliefTest,
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: /generate live/i }));
    await user.click(
      await screen.findByRole("button", { name: /continue with my notebook/i }),
    );
    await user.upload(
      screen.getByLabelText(/use a different notebook/i),
      new File(["{}"], "fraud_model.ipynb", {
        type: "application/json",
      }),
    );
    await user.type(
      await screen.findByLabelText(/your claim/i),
      imbalanceBeliefTest.learnerClaim,
    );
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

    await user.click(screen.getByRole("button", { name: /try instantly/i }));
    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/cell 3 · output 0/i)).toBeInTheDocument();
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
      await screen.findByRole("heading", { name: "Which explanation fits?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/partly remembers customers/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /here.s what changed/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /these two ideas make sense/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(screen.getByRole("button", { name: /lock my answer/i }));

    expect(
      await screen.findByText(/your answer is locked/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /the result is ready/i }),
    ).toBeInTheDocument();
  });

  it("keeps the replay label persistent across the judged flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /replay verified session/i }),
    );
    expect(
      (await screen.findAllByText(/verified replay/i)).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /continue replay/i }));
    expect(screen.getAllByText(/verified replay/i).length).toBeGreaterThan(0);
  });
});
