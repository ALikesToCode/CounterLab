import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BoundaryResponse, SessionView } from "../../api";
import { BoundaryStage } from "./BoundaryStage";

const api = vi.hoisted(() => ({
  getBoundary: vi.fn(),
  runBoundary: vi.fn(),
}));
const runner = vi.hoisted(() => ({
  clear: vi.fn(),
  events: [],
  waitForJob: vi.fn(),
}));
const recordLearnerInteraction = vi.hoisted(() => vi.fn());

vi.mock("../../api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api")>();
  return { ...original, counterLabApi: api };
});
vi.mock("../../hooks/useRunnerEvents", () => ({
  useRunnerEvents: () => runner,
}));
vi.mock("../learner/interactionEvidence", () => ({
  recordLearnerInteraction,
}));
vi.mock("../../components/generative-ui/BoundaryMapBlock", () => ({
  BoundaryMapBlock: ({ boundary }: { boundary: BoundaryResponse }) => (
    <div data-testid="boundary-map">{boundary.result.resultHash}</div>
  ),
}));

const digest = (character: string) => character.repeat(64);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

const authority = {
  jobId: "job_boundary_1",
  sweepId: "leakage-recurrence-sweep",
  resultHash: digest("1"),
  verificationReportHash: digest("2"),
  receipt: {
    schemaVersion: "1",
    canonicalProfile: "counterlab-canonical-json-v1",
    sessionId: "session_1",
    resultHash: digest("1"),
    verificationReportHash: digest("2"),
    experimentIrHash: digest("3"),
    authoritativeResultHash: digest("4"),
    evidenceVerdictHash: digest("5"),
    issuedAt: "2026-07-16T12:00:00.000Z",
    integrity: {
      mode: "integrity-hashed",
      algorithm: "sha256",
      contentHash: digest("6"),
    },
    receiptHash: digest("7"),
  },
  cellCount: 4,
} as const;

const experimentCompleted = {
  sessionId: "session_1",
  artifactId: "artifact_1",
  mode: { kind: "live_notebook" },
  state: "EXPERIMENT_COMPLETED",
  version: 10,
  createdAt: "2026-07-16T11:00:00.000Z",
  updatedAt: "2026-07-16T11:05:00.000Z",
} satisfies SessionView;

const boundaryResponse = {
  result: {
    resultHash: authority.resultHash,
    concept: "entity_leakage",
    axes: [
      {
        id: "test_fraction",
        label: "Test fraction",
        points: [
          { id: "test-20", label: "20%" },
          { id: "test-30", label: "30%" },
        ],
      },
      {
        id: "observations_per_entity",
        label: "Observations per customer",
        points: [
          { id: "observations-2", label: "2 observations" },
          { id: "observations-4", label: "4 observations" },
        ],
      },
    ],
    cells: [
      ["cell-reference", "test-20", "observations-2", "little"],
      ["cell-stable", "test-30", "observations-2", "little"],
      ["cell-change", "test-20", "observations-4", "material"],
      ["cell-change-2", "test-30", "observations-4", "material"],
    ].map(([cellId, firstPoint, secondPoint, classificationId]) => ({
      cellId,
      classificationId,
      coordinates: [
        { axisId: "test_fraction", pointId: firstPoint },
        { axisId: "observations_per_entity", pointId: secondPoint },
      ],
    })),
  },
  report: { status: "VERIFIED" },
  receipt: authority.receipt,
  authority,
} as unknown as BoundaryResponse;

describe("BoundaryStage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: memoryStorage(),
    });
    vi.clearAllMocks();
    api.getBoundary.mockResolvedValue(boundaryResponse);
  });

  it("keeps the pre-verification pending state static and accessible", async () => {
    const pendingJob = deferred<SessionView>();
    api.runBoundary.mockResolvedValue({
      ...experimentCompleted,
      runnerJob: {
        jobId: "job_boundary_1",
        kind: "LAB_RUN",
        status: "STARTING",
      },
    });
    runner.waitForJob.mockReturnValue(pendingJob.promise);

    render(
      <BoundaryStage session={experimentCompleted} updateSession={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /map the boundary/i }));

    const heading = await screen.findByRole("heading", {
      name: /mapping where the evidence changes/i,
    });
    const pendingRegion = heading.closest("section");
    expect(pendingRegion).toHaveAttribute("aria-live", "polite");
    const statusMark = pendingRegion?.querySelector<HTMLElement>(
      '[aria-hidden="true"]',
    );
    expect(statusMark).not.toBeNull();
    expect(statusMark?.className).not.toMatch(/spin|animat|motion/i);
    expect(statusMark).not.toHaveAttribute("data-animated");
    expect(statusMark).not.toHaveAttribute("data-motion");
    expect(window.getComputedStyle(statusMark!).animationName).toMatch(
      /^(|none)$/,
    );
    expect(screen.queryByTestId("boundary-map")).not.toBeInTheDocument();

    pendingJob.resolve({
      ...experimentCompleted,
      state: "BOUNDARY_VERIFIED",
      version: 11,
      boundaryMapAuthority: authority,
    });
    expect(
      await screen.findByRole("heading", {
        name: /can you find a condition where the conclusion changes/i,
      }),
    ).toBeInTheDocument();
  });

  it("runs the fixed sweep, waits for verification, then releases the map", async () => {
    const updateSession = vi.fn();
    api.runBoundary.mockResolvedValue({
      ...experimentCompleted,
      runnerJob: {
        jobId: "job_boundary_1",
        kind: "LAB_RUN",
        status: "STARTING",
      },
    });
    runner.waitForJob.mockResolvedValue({
      ...experimentCompleted,
      state: "BOUNDARY_VERIFIED",
      version: 11,
      boundaryMapAuthority: authority,
    });

    render(
      <BoundaryStage
        session={experimentCompleted}
        prediction="The score remains high."
        updateSession={updateSession}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /map the boundary/i }));

    await waitFor(() =>
      expect(runner.waitForJob).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session_1",
          jobId: "job_boundary_1",
          terminalStates: ["BOUNDARY_VERIFIED", "LAB_REJECTED"],
        }),
      ),
    );
    expect(
      await screen.findByRole("heading", {
        name: /can you find a condition where the conclusion changes/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("boundary-map")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("radio", {
        name: /test fraction 20%.*observations per customer 4 observations/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /check this condition/i }),
    );
    expect(await screen.findByTestId("boundary-map")).toHaveTextContent(
      authority.resultHash,
    );
    expect(api.getBoundary).toHaveBeenCalledWith("session_1");
    expect(updateSession).toHaveBeenCalledWith(
      expect.objectContaining({ state: "BOUNDARY_VERIFIED" }),
    );
    expect(recordLearnerInteraction).toHaveBeenCalledWith("session_1", {
      kind: "boundary_hunt.classified",
      stage: "boundary",
      classification: "CONCLUSION_CHANGES",
    });
    expect(JSON.stringify(recordLearnerInteraction.mock.calls)).not.toContain(
      "cell-change",
    );
  });

  it("restores a persisted verified boundary without starting a new job", async () => {
    render(
      <BoundaryStage
        session={{
          ...experimentCompleted,
          state: "REVISION_RECORDED",
          boundaryMapAuthority: authority,
        }}
        updateSession={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: /can you find a condition where the conclusion changes/i,
      }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /skip the hunt/i }));
    expect(await screen.findByTestId("boundary-map")).toBeInTheDocument();
    expect(api.runBoundary).not.toHaveBeenCalled();
  });

  it("keeps a revealed hunt complete when the learner reviews the stage", async () => {
    const verifiedSession = {
      ...experimentCompleted,
      state: "REVISION_RECORDED" as const,
      boundaryMapAuthority: authority,
    };
    const firstView = render(
      <BoundaryStage session={verifiedSession} updateSession={vi.fn()} />,
    );

    await screen.findByRole("heading", {
      name: /can you find a condition where the conclusion changes/i,
    });
    fireEvent.click(screen.getByRole("button", { name: /reveal the map/i }));
    expect(await screen.findByTestId("boundary-map")).toBeInTheDocument();

    firstView.unmount();
    render(<BoundaryStage session={verifiedSession} updateSession={vi.fn()} />);

    expect(await screen.findByTestId("boundary-map")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /can you find a condition where the conclusion changes/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("releases no map when the boundary job is rejected", async () => {
    api.runBoundary.mockResolvedValue({
      ...experimentCompleted,
      runnerJob: {
        jobId: "job_boundary_1",
        kind: "LAB_RUN",
        status: "STARTING",
      },
    });
    runner.waitForJob.mockResolvedValue({
      ...experimentCompleted,
      state: "LAB_REJECTED",
      version: 11,
    });

    render(
      <BoundaryStage session={experimentCompleted} updateSession={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /map the boundary/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no boundary values were released/i,
    );
    expect(screen.queryByTestId("boundary-map")).not.toBeInTheDocument();
    expect(api.getBoundary).not.toHaveBeenCalled();
  });
});
