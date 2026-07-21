import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionView } from "../../api";
import { replayFixture } from "../replay/ProofCapsuleReplayView.fixture";
import { createDefaultProofBoundSessionFixture } from "../../test-fixtures/proofBundle";
import { ImbalancePatchReview } from "./ImbalancePatchReview";

const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  compilePatch: vi.fn(),
  getProofBundle: vi.fn(),
  downloadPatch: vi.fn(),
  downloadProofCapsule: vi.fn(),
  patchDownloadUrl: vi.fn(() => "/api/sessions/session_1/patch/download"),
  proofCapsuleDownloadUrl: vi.fn(() => "/api/sessions/session_1/proof-capsule"),
  publishReplay: vi.fn(),
  revokeReplay: vi.fn(),
  getReplayPublicationStatus: vi.fn(),
}));
const runner = vi.hoisted(() => ({
  clear: vi.fn(),
  events: [],
  waitForJob: vi.fn(),
}));
const recordLearnerInteraction = vi.hoisted(() => vi.fn());
const saveAuthenticatedDownload = vi.hoisted(() => vi.fn());

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
vi.mock("../../features/learner/saveDownload", () => ({
  saveAuthenticatedDownload,
}));

describe("ImbalancePatchReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.downloadPatch.mockResolvedValue({
      blob: new Blob(["patched notebook"], {
        type: "application/x-ipynb+json",
      }),
      fileName: "customer-model.counterlab-patched.ipynb",
    });
    api.downloadProofCapsule.mockResolvedValue({
      blob: new Blob(["proof capsule"], {
        type: "application/vnd.counterlab.capsule+json",
      }),
      fileName: "counterlab-session_1.counterlab",
    });
    recordLearnerInteraction.mockResolvedValue(true);
    api.getReplayPublicationStatus.mockResolvedValue({
      status: "never_published",
    });
  });

  it("compiles after transfer and presents the verified artifact-specific diff", async () => {
    const replay = replayFixture("class_imbalance");
    const updateSession = vi.fn();
    const transferSession = {
      sessionId: replay.sourceSessionId,
      state: "TRANSFER_PASSED",
      mode: { kind: "live_notebook" },
      transferResult: { outcome: "PASSED" },
      evidenceVerdict: replay.evidenceVerdict,
      beliefSpec: replay.beliefSpec,
      prediction: replay.prediction,
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
      reasoningDiffV2: replay.reasoningDiff,
      proofCapsule: replay.proofCapsule,
      beliefSpec: replay.beliefSpec,
      prediction: replay.prediction,
      revision: replay.revision.statement,
    } as SessionView;
    api.compilePatch.mockResolvedValue(compiling);
    runner.waitForJob.mockResolvedValue(completed);
    api.getProofBundle.mockResolvedValue({
      sessionId: replay.sourceSessionId,
      replayId: null,
    });

    const view = render(
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
          sessionId: replay.sourceSessionId,
          jobId: "job_patch_1",
          terminalStates: ["PROOF_CAPSULE_ISSUED", "PATCH_REJECTED"],
        }),
      ),
    );
    view.rerender(
      <ImbalancePatchReview
        session={completed}
        updateSession={updateSession}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: /completed one verified rare-event loop/i,
        }),
      ).toHaveFocus(),
    );
    expect(
      screen.queryByText(/finalizing the authoritative evidence record/i),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Evidence & proof"));
    expect(
      await screen.findByRole("heading", { name: /detailed reasoning diff/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/confusion matrix and PR-AUC/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /download repaired notebook/i }),
    );
    await waitFor(() =>
      expect(api.downloadPatch).toHaveBeenCalledWith(replay.sourceSessionId),
    );
    expect(saveAuthenticatedDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "customer-model.counterlab-patched.ipynb",
      }),
    );
    await waitFor(() =>
      expect(recordLearnerInteraction).toHaveBeenCalledWith(
        replay.sourceSessionId,
        {
          kind: "patch.downloaded",
          stage: "repair",
        },
      ),
    );
  });

  it("preserves a completed legacy live Proof Bundle without a v5 verdict", () => {
    const legacySession = {
      ...createDefaultProofBoundSessionFixture(),
      mode: { kind: "live_notebook" },
    } as SessionView;

    render(
      <ImbalancePatchReview session={legacySession} updateSession={vi.fn()} />,
    );

    expect(
      screen.getByRole("heading", {
        name: /completed one verified rare-event loop/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /download repaired notebook/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /download proof record/i }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: /repair remains locked/i }),
    ).not.toBeInTheDocument();
  });

  it("offers explicit replay publication for a completed live Proof Capsule", async () => {
    const user = userEvent.setup();
    const replay = replayFixture("class_imbalance");
    api.publishReplay.mockResolvedValue({
      reused: false,
      replay: {
        schemaVersion: "2",
        replayId: replay.replayId,
        replay: true,
        label: "Verified replay",
        concept: replay.concept,
        recordedAt: replay.recordedAt,
        retention: {
          policy: "expires_or_revoked",
          revocable: true,
          publishedAt: "2026-07-19T10:00:00.000Z",
          expiresAt: "2026-08-18T10:00:00.000Z",
        },
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
      beliefSpec: replay.beliefSpec,
      prediction: replay.prediction,
      revision: replay.revision.statement,
      evidenceVerdict: replay.evidenceVerdict,
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

    await user.click(
      screen.getByRole("button", { name: /export proof capsule/i }),
    );
    await waitFor(() =>
      expect(api.downloadProofCapsule).toHaveBeenCalledWith(
        replay.sourceSessionId,
      ),
    );
    expect(saveAuthenticatedDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "counterlab-session_1.counterlab",
      }),
    );
    await waitFor(() =>
      expect(recordLearnerInteraction).toHaveBeenCalledWith(
        replay.sourceSessionId,
        {
          kind: "proof_capsule.downloaded",
          stage: "repair",
        },
      ),
    );

    expect(api.publishReplay).not.toHaveBeenCalled();
    await user.click(screen.getByText("Evidence & proof"));
    const publicationConsent = await screen.findByRole("checkbox", {
      name: /I understand that the listed evidence and learner-authored text become public/i,
    });
    const publishButton = await screen.findByRole("button", {
      name: /Confirm and publish read-only replay/i,
    });
    expect(publicationConsent).not.toBeChecked();
    expect(publishButton).toBeDisabled();
    await user.click(publicationConsent);
    expect(publishButton).toBeEnabled();
    await user.click(publishButton);
    expect(api.publishReplay).toHaveBeenCalledTimes(1);
    expect(api.publishReplay).toHaveBeenCalledWith(replay.sourceSessionId);
    expect(
      await screen.findByRole("link", { name: /open verified replay/i }),
    ).toHaveAttribute("href", `/replay/${replay.replayId}`);
  });

  it("records no download interaction when authenticated bytes cannot be retrieved", async () => {
    const replay = replayFixture("class_imbalance");
    api.downloadPatch.mockRejectedValue(
      new Error("The private notebook download is unavailable."),
    );
    const completedSession = {
      sessionId: replay.sourceSessionId,
      state: "PROOF_CAPSULE_ISSUED",
      mode: { kind: "live_notebook" },
      transferResult: replay.transferResult,
      patchResult: replay.patchResult,
      reasoningDiffV2: replay.reasoningDiff,
      proofCapsule: replay.proofCapsule,
      beliefSpec: replay.beliefSpec,
      prediction: replay.prediction,
      revision: replay.revision.statement,
      evidenceVerdict: replay.evidenceVerdict,
    } as SessionView;

    render(
      <ImbalancePatchReview
        session={completedSession}
        updateSession={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /download repaired notebook/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The private notebook download is unavailable.",
    );
    expect(saveAuthenticatedDownload).not.toHaveBeenCalled();
    expect(recordLearnerInteraction).not.toHaveBeenCalledWith(
      replay.sourceSessionId,
      expect.objectContaining({ kind: "patch.downloaded" }),
    );
  });

  it("records no Capsule interaction when authenticated proof bytes cannot be retrieved", async () => {
    const replay = replayFixture("class_imbalance");
    api.downloadProofCapsule.mockRejectedValue(
      new Error("The private Proof Capsule is unavailable."),
    );
    const completedSession = {
      sessionId: replay.sourceSessionId,
      state: "PROOF_CAPSULE_ISSUED",
      mode: { kind: "live_notebook" },
      transferResult: replay.transferResult,
      patchResult: replay.patchResult,
      reasoningDiffV2: replay.reasoningDiff,
      proofCapsule: replay.proofCapsule,
      beliefSpec: replay.beliefSpec,
      prediction: replay.prediction,
      revision: replay.revision.statement,
      evidenceVerdict: replay.evidenceVerdict,
    } as SessionView;

    render(
      <ImbalancePatchReview
        session={completedSession}
        updateSession={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /export proof capsule/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The private Proof Capsule is unavailable.",
    );
    expect(saveAuthenticatedDownload).not.toHaveBeenCalled();
    expect(recordLearnerInteraction).not.toHaveBeenCalledWith(
      replay.sourceSessionId,
      expect.objectContaining({ kind: "proof_capsule.downloaded" }),
    );
  });

  it("does not keep download controls busy while best-effort telemetry is pending", async () => {
    const replay = replayFixture("class_imbalance");
    recordLearnerInteraction.mockReturnValue(new Promise(() => undefined));
    const completedSession = {
      sessionId: replay.sourceSessionId,
      state: "PROOF_CAPSULE_ISSUED",
      mode: { kind: "live_notebook" },
      transferResult: replay.transferResult,
      patchResult: replay.patchResult,
      reasoningDiffV2: replay.reasoningDiff,
      proofCapsule: replay.proofCapsule,
      beliefSpec: replay.beliefSpec,
      prediction: replay.prediction,
      revision: replay.revision.statement,
      evidenceVerdict: replay.evidenceVerdict,
    } as SessionView;

    render(
      <ImbalancePatchReview
        session={completedSession}
        updateSession={vi.fn()}
      />,
    );
    const downloadButton = screen.getByRole("button", {
      name: /download repaired notebook/i,
    });
    fireEvent.click(downloadButton);

    await waitFor(() => expect(saveAuthenticatedDownload).toHaveBeenCalled());
    await waitFor(() => expect(downloadButton).toBeEnabled());
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

  it("withholds a persisted live patch when the Evidence Verdict is inconclusive", () => {
    const replay = replayFixture("class_imbalance");
    const inconclusiveSession = {
      sessionId: replay.sourceSessionId,
      state: "PROOF_CAPSULE_ISSUED",
      mode: { kind: "live_notebook" },
      transferResult: replay.transferResult,
      patchResult: replay.patchResult,
      beliefSpec: replay.beliefSpec,
      prediction: replay.prediction,
      evidenceVerdict: {
        schemaVersion: "1",
        kind: "INCONCLUSIVE",
        reasonCode: "SUPPORTED_PATTERNS_OVERLAP",
        scope: "The fixed result does not separate the hypotheses.",
        resultHash: replay.verifiedResult.resultHash,
        irHash: replay.evidenceVerdict.irHash,
        technicalReportHash: replay.evidenceVerdict.technicalReportHash,
        verifierVersion: replay.evidenceVerdict.verifierVersion,
      },
    } as SessionView;

    render(
      <ImbalancePatchReview
        session={inconclusiveSession}
        updateSession={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /repair remains locked/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /download repaired notebook/i }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(replay.patchResult.diff);
  });

  it("withholds a persisted patch that did not pass verification", () => {
    const replay = replayFixture("class_imbalance");
    const rejectedPatch = {
      ...replay.patchResult,
      status: "REJECTED" as const,
      verification: { ...replay.patchResult.verification, passed: false },
    };
    const rejectedSession = {
      sessionId: replay.sourceSessionId,
      state: "PATCH_REJECTED",
      mode: { kind: "live_notebook" },
      transferResult: replay.transferResult,
      patchResult: rejectedPatch,
      beliefSpec: replay.beliefSpec,
      prediction: replay.prediction,
      evidenceVerdict: replay.evidenceVerdict,
    } as SessionView;

    render(
      <ImbalancePatchReview
        session={rejectedSession}
        updateSession={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /download repaired notebook/i }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(rejectedPatch.diff);
  });

  it("offers an authenticated retry when native proof finalization is incomplete", async () => {
    const user = userEvent.setup();
    const replay = replayFixture("class_imbalance");
    const updateSession = vi.fn();
    const partialSession = {
      sessionId: replay.sourceSessionId,
      state: "REASONING_DIFF_ISSUED",
      mode: { kind: "live_notebook" },
      transferResult: replay.transferResult,
      patchResult: replay.patchResult,
      evidenceVerdict: replay.evidenceVerdict,
      beliefSpec: replay.beliefSpec,
      prediction: replay.prediction,
      reasoningDiffV2: replay.reasoningDiff,
    } as SessionView;
    const completedSession = {
      ...partialSession,
      state: "PROOF_CAPSULE_ISSUED",
      proofCapsule: replay.proofCapsule,
    } as SessionView;
    api.getSession.mockResolvedValue(completedSession);

    render(
      <ImbalancePatchReview
        session={partialSession}
        updateSession={updateSession}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /finalizing the authoritative evidence record/i,
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /check proof finalization/i }),
    );
    expect(api.getSession).toHaveBeenCalledWith(replay.sourceSessionId);
    expect(updateSession).toHaveBeenCalledWith(completedSession);
  });
});
