import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SessionView } from "../../api";
import { ImbalancePatchReview } from "./ImbalancePatchReview";

const api = vi.hoisted(() => ({
  compilePatch: vi.fn(),
  getProofBundle: vi.fn(),
  patchDownloadUrl: vi.fn(() => "/api/sessions/session_1/patch/download"),
}));
const runner = vi.hoisted(() => ({
  clear: vi.fn(),
  events: [],
  waitForJob: vi.fn(),
}));

vi.mock("../../api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  counterLabApi: api,
}));
vi.mock("../../hooks/useRunnerEvents", () => ({
  useRunnerEvents: () => runner,
}));

describe("ImbalancePatchReview", () => {
  it("compiles after transfer and presents the verified artifact-specific diff", async () => {
    const updateSession = vi.fn();
    const transferSession = {
      sessionId: "session_1",
      state: "TRANSFER_PASSED",
      mode: { kind: "live_notebook" },
      transferResult: { outcome: "PASSED" },
    } as SessionView;
    const compiling = {
      ...transferSession,
      state: "PATCH_COMPILING",
      runnerJob: {
        jobId: "job_patch_1",
        kind: "PATCH_COMPILE",
        status: "STARTING",
      },
    } as SessionView & {
      runnerJob: { jobId: string; kind: "PATCH_COMPILE"; status: string };
    };
    const completed = {
      ...transferSession,
      state: "PROOF_CAPSULE_ISSUED",
      patchResult: {
        status: "VERIFIED",
        modifiedCells: [3],
        sourceArtifactHash: "a".repeat(64),
        patchedArtifactHash: "b".repeat(64),
        diff: "- accuracy only\n+ confusion matrix and PR-AUC",
        verification: {
          passed: true,
          invariants: [
            "STRATIFIED_HOLDOUT",
            "MAJORITY_BASELINE_COMPUTED",
            "MINORITY_METRICS_RECOMPUTED",
          ],
          unchangedCellHashes: ["c".repeat(64)],
        },
      },
      reasoningDiff: {
        dimensions: {
          code: {
            before: "Accuracy-only evaluation",
            after: "Stratified holdout and minority metrics",
          },
        },
      },
    } as SessionView;
    api.compilePatch.mockResolvedValue(compiling);
    runner.waitForJob.mockResolvedValue(completed);
    api.getProofBundle.mockResolvedValue({
      sessionId: "session_1",
      replayId: null,
    });

    render(
      <ImbalancePatchReview
        session={transferSession}
        updateSession={updateSession}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /verify notebook repair/i }),
    );

    await waitFor(() =>
      expect(runner.waitForJob).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "session_1",
          jobId: "job_patch_1",
          terminalStates: ["PROOF_CAPSULE_ISSUED", "PATCH_REJECTED"],
        }),
      ),
    );
    expect(
      await screen.findByRole("heading", {
        name: /your notebook copy passed the repair checks/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/confusion matrix and PR-AUC/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /download patched copy/i }),
    ).toHaveAttribute("href", "/api/sessions/session_1/patch/download");
  });
});
