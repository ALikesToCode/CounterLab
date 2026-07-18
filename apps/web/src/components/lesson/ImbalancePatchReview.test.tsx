import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionView } from "../../api";
import { replayFixture } from "../replay/ProofCapsuleReplayView.fixture";
import { ImbalancePatchReview } from "./ImbalancePatchReview";

const api = vi.hoisted(() => ({
  compilePatch: vi.fn(),
  getProofBundle: vi.fn(),
  patchDownloadUrl: vi.fn(() => "/api/sessions/session_1/patch/download"),
  proofCapsuleDownloadUrl: vi.fn(() => "/api/sessions/session_1/proof-capsule"),
  publishReplay: vi.fn(),
}));
const runner = vi.hoisted(() => ({
  clear: vi.fn(),
  events: [],
  waitForJob: vi.fn(),
}));
const recordLearnerInteraction = vi.hoisted(() => vi.fn());

vi.mock("../../api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  counterLabApi: api,
}));
vi.mock("../../hooks/useRunnerEvents", () => ({
  useRunnerEvents: () => runner,
}));
vi.mock("../../features/learner/interactionEvidence", () => ({
  recordLearnerInteraction,
}));

describe("ImbalancePatchReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /you can now distinguish/i }),
      ).toHaveFocus(),
    );
    expect(
      screen.getByText(/confusion matrix and PR-AUC/i),
    ).toBeInTheDocument();
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    fireEvent.click(
      screen.getByRole("button", { name: /download repaired notebook/i }),
    );
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(
      (anchorClick.mock.contexts[0] as HTMLAnchorElement | undefined)?.href,
    ).toContain("/api/sessions/session_1/patch/download");
    expect(recordLearnerInteraction).toHaveBeenCalledWith("session_1", {
      kind: "patch.downloaded",
      stage: "repair",
    });
    anchorClick.mockRestore();
  });

  it("offers explicit replay publication for a completed live Proof Capsule", async () => {
    const user = userEvent.setup();
    const replay = replayFixture("class_imbalance");
    api.publishReplay.mockResolvedValue({
      reused: false,
      replay: {
        ...replay,
        proofCapsule: replay.proofCapsule,
      },
    });
    const completedSession = {
      sessionId: replay.sourceSessionId,
      state: "PROOF_CAPSULE_ISSUED",
      mode: { kind: "live_notebook" },
      transferResult: replay.transferResult,
      patchResult: replay.patchResult,
      reasoningDiffV2: replay.reasoningDiff,
      proofCapsule: replay.proofCapsule,
    } as SessionView;

    render(
      <ImbalancePatchReview
        session={completedSession}
        updateSession={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: /download repaired notebook/i }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("link", { name: /download repaired notebook/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Evidence & proof")).toHaveLength(1);

    const capsuleAnchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    await user.click(
      screen.getByRole("button", { name: /export proof capsule/i }),
    );
    expect(capsuleAnchorClick).toHaveBeenCalledOnce();
    expect(recordLearnerInteraction).toHaveBeenCalledWith(
      replay.sourceSessionId,
      {
        kind: "proof_capsule.downloaded",
        stage: "repair",
      },
    );
    capsuleAnchorClick.mockRestore();

    expect(api.publishReplay).not.toHaveBeenCalled();
    await user.click(screen.getByText("Evidence & proof"));
    await user.click(
      screen.getByRole("button", { name: /publish read-only replay/i }),
    );
    expect(api.publishReplay).toHaveBeenCalledTimes(1);
    expect(api.publishReplay).toHaveBeenCalledWith(replay.sourceSessionId);
    expect(
      await screen.findByRole("link", { name: /open verified replay/i }),
    ).toHaveAttribute("href", `/replay/${replay.replayId}`);
  });

  it("does not offer replay publication before the live Capsule is issued", () => {
    const replay = replayFixture("class_imbalance");
    const incompleteSession = {
      sessionId: replay.sourceSessionId,
      state: "TRANSFER_PASSED",
      mode: { kind: "live_notebook" },
      transferResult: replay.transferResult,
      patchResult: replay.patchResult,
      reasoningDiffV2: replay.reasoningDiff,
      proofCapsule: replay.proofCapsule,
    } as SessionView;

    render(
      <ImbalancePatchReview
        session={incompleteSession}
        updateSession={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /publish read-only replay/i }),
    ).not.toBeInTheDocument();
    expect(api.publishReplay).not.toHaveBeenCalled();
  });
});
