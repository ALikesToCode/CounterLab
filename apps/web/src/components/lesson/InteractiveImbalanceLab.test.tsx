import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InteractiveImbalanceLab } from "./InteractiveImbalanceLab";

const api = vi.hoisted(() => ({
  runInteractiveImbalance: vi.fn(),
  getInteractiveResult: vi.fn(),
}));
const runner = vi.hoisted(() => ({
  events: [] as unknown[],
  clear: vi.fn(),
  waitForStandaloneJob: vi.fn(),
}));

vi.mock("../../api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  counterLabApi: api,
}));

vi.mock("../../hooks/useRunnerEvents", () => ({
  useRunnerEvents: () => runner,
}));

describe("InteractiveImbalanceLab", () => {
  it("runs bounded threshold and prevalence controls before revealing a verified metric", async () => {
    api.runInteractiveImbalance.mockResolvedValue({
      runnerJob: { jobId: "job_interactive_1", kind: "LAB_RUN" },
    });
    runner.waitForStandaloneJob.mockResolvedValue(3);
    api.getInteractiveResult.mockResolvedValue({
      selectedRunId: "interactive_abc",
      configurationHash: "a".repeat(64),
      verification: { status: "VERIFIED" },
      result: {
        concept: "class_imbalance",
        resultHash: "b".repeat(64),
        runs: [
          {
            id: "interactive_abc",
            threshold: 0.2,
            prevalenceScenario: "more_common",
            prevalence: 0.02,
            predictedPositiveRate: 0.04,
            sampleSizes: { test: 800 },
            confusionMatrix: { tn: 760, fp: 24, fn: 8, tp: 8 },
            metrics: {
              accuracy: 0.96,
              precision: 0.25,
              recall: 0.5,
              f1: 0.333333333333,
              prAuc: 0.29,
              rocAuc: 0.84,
            },
          },
        ],
      },
    });

    render(
      <InteractiveImbalanceLab
        isLive
        sessionId="session_1"
        authoritativeResultHash={"c".repeat(64)}
      />,
    );

    expect(screen.queryByText(/verified exploratory result/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/decision threshold/i), {
      target: { value: "0.2" },
    });
    fireEvent.change(screen.getByLabelText(/prevalence scenario/i), {
      target: { value: "more_common" },
    });
    fireEvent.change(screen.getByLabelText(/metric focus/i), {
      target: { value: "recall" },
    });
    fireEvent.click(screen.getByRole("button", { name: /run this scenario/i }));

    await waitFor(() =>
      expect(api.runInteractiveImbalance).toHaveBeenCalledWith("session_1", {
        schemaVersion: "1",
        concept: "class_imbalance",
        threshold: 0.2,
        prevalenceScenario: "more_common",
        metricFocus: "recall",
      }),
    );
    expect(runner.waitForStandaloneJob).toHaveBeenCalledWith({
      sessionId: "session_1",
      jobId: "job_interactive_1",
      jobKind: "LAB_RUN",
    });
    expect(
      await screen.findByText(/verified exploratory result/i),
    ).toBeVisible();
    expect(screen.getByText("50.0%")).toBeVisible();
    expect(screen.getByText(/result bbbbbbbbbb/i)).toBeVisible();
  });
});
