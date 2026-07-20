import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImbalanceTransferLesson } from "./ImbalanceTransferLesson";

const api = vi.hoisted(() => ({
  recordRevision: vi.fn(),
  submitTransfer: vi.fn(),
}));
const recordLearnerInteraction = vi.hoisted(() => vi.fn());

vi.mock("../../api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  counterLabApi: api,
}));
vi.mock("../../features/learner/interactionEvidence", () => ({
  recordLearnerInteraction,
}));

describe("ImbalanceTransferLesson", () => {
  it("records a reusable rule and submits the fixed manufacturing transfer", async () => {
    const updateSession = vi.fn();
    api.recordRevision.mockResolvedValue({ state: "REVISION_RECORDED" });
    api.submitTransfer.mockResolvedValue({
      state: "TRANSFER_PASSED",
      transferResult: { outcome: "PASSED" },
    });
    const { rerender } = render(
      <ImbalanceTransferLesson
        sessionId="session_1"
        state="EXPERIMENT_COMPLETED"
        updateSession={updateSession}
      />,
    );

    expect(screen.getByLabelText(/revised mental model/i)).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /try it on defects/i }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/revised mental model/i), {
      target: { value: "Too short" },
    });
    expect(
      screen.getByRole("button", { name: /try it on defects/i }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/revised mental model/i), {
      target: {
        value:
          "For rare events, compare a majority baseline and class-specific errors before trusting accuracy.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /try it on defects/i }));
    await waitFor(() => expect(api.recordRevision).toHaveBeenCalledTimes(1));

    rerender(
      <ImbalanceTransferLesson
        sessionId="session_1"
        state="REVISION_RECORDED"
        revision="For rare events, compare a majority baseline and class-specific errors before trusting accuracy."
        updateSession={updateSession}
      />,
    );
    fireEvent.click(
      screen.getByLabelText(/reject the accuracy-only conclusion/i),
    );
    fireEvent.click(screen.getByLabelText(/defect recall and pr-auc/i));
    fireEvent.click(
      screen.getByLabelText(/confusion matrix has zero true positives/i),
    );
    fireEvent.click(screen.getByLabelText(/defects are only 1%/i));
    fireEvent.click(screen.getByRole("button", { name: /check transfer/i }));

    await waitFor(() =>
      expect(api.submitTransfer).toHaveBeenCalledWith("session_1", {
        decisionChoice: "reject_accuracy_only",
        metricChoice: "recall_and_pr_auc",
        evidenceChoices: ["zero_true_positives", "rare_base_rate"],
      }),
    );
    expect(updateSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: "TRANSFER_PASSED" }),
    );
    expect(recordLearnerInteraction).toHaveBeenCalledWith("session_1", {
      kind: "revision.recorded",
      stage: "apply",
      authoringMode: "clauses",
    });
    expect(recordLearnerInteraction).toHaveBeenCalledWith("session_1", {
      kind: "transfer.evaluated",
      stage: "apply",
      outcome: "PASSED",
    });
    expect(JSON.stringify(recordLearnerInteraction.mock.calls)).not.toContain(
      "For rare events",
    );
  });

  it("requires a direct learner edit after clause drafting without grading prose", () => {
    render(
      <ImbalanceTransferLesson
        sessionId="session_1"
        state="EXPERIMENT_COMPLETED"
        updateSession={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/choose the condition/i), {
      target: { value: "prevalence-shifts" },
    });
    fireEvent.change(screen.getByLabelText(/choose the action/i), {
      target: { value: "baseline" },
    });
    fireEvent.change(
      screen.getByLabelText(/choose the evidence-based reason/i),
      { target: { value: "accuracy-hides" } },
    );

    expect(screen.getByLabelText(/revised mental model/i)).toHaveValue(
      "When deployment prevalence changes,\nI should compare against the majority baseline,\nbecause high overall accuracy can hide missed rare events.",
    );
    expect(
      screen.getByRole("button", { name: /try it on defects/i }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/revised mental model/i), {
      target: {
        value:
          "When deployment prevalence changes, I should compare against the majority baseline because accuracy can hide missed rare events. I will check the confusion counts.",
      },
    });

    expect(
      screen.getByRole("button", { name: /try it on defects/i }),
    ).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/choose the action/i), {
      target: { value: "class-errors" },
    });
    expect(
      screen.getByRole("button", { name: /try it on defects/i }),
    ).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("carries a learner-authored result interpretation into the revision step", () => {
    render(
      <ImbalanceTransferLesson
        sessionId="session_1"
        state="EXPERIMENT_COMPLETED"
        initialInterpretation="I notice that overall accuracy and rare-event recall tell different stories."
        updateSession={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/revised mental model/i)).toHaveValue(
      "I notice that overall accuracy and rare-event recall tell different stories.",
    );
    expect(
      screen.getByRole("button", { name: /try it on defects/i }),
    ).toBeEnabled();
  });

  it("keeps repair locked after the fixed evaluator rejects the transfer", () => {
    render(
      <ImbalanceTransferLesson
        sessionId="session_1"
        state="TRANSFER_FAILED"
        revision="For rare events, inspect class-specific errors before trusting accuracy."
        transferOutcome="FAILED"
        updateSession={vi.fn()}
      />,
    );

    expect(screen.getByText(/patch locked until this passes/i)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      /no patch was generated/i,
    );
    expect(
      screen.queryByRole("button", { name: /verify notebook repair/i }),
    ).not.toBeInTheDocument();
  });

  it("restores a failed canonical answer and can resubmit it unchanged", async () => {
    api.submitTransfer.mockResolvedValue({
      state: "TRANSFER_FAILED",
      transferResult: { outcome: "FAILED" },
    });

    render(
      <ImbalanceTransferLesson
        sessionId="session_failed"
        state="TRANSFER_FAILED"
        revision="For rare events, inspect class-specific errors before trusting accuracy."
        initialDecisionChoice="approve_high_accuracy"
        initialMetricChoice="accuracy"
        initialEvidenceChoices={["many_true_negatives"]}
        transferOutcome="FAILED"
        updateSession={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText(/approve because accuracy is 99%/i),
    ).toBeChecked();
    expect(screen.getByLabelText(/accuracy only/i)).toBeChecked();
    expect(
      screen.getByLabelText(
        /19,800 acceptable parts were classified correctly/i,
      ),
    ).toBeChecked();
    expect(
      screen.getByLabelText(/confusion matrix has zero true positives/i),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: /check transfer/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("group", {
        name: /which deployment conclusion does this evidence support/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", {
        name: /which minority-sensitive metric should guide the evaluation/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", {
        name: /which evidence supports the deployment conclusion/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /check transfer/i }));

    await waitFor(() =>
      expect(api.submitTransfer).toHaveBeenLastCalledWith("session_failed", {
        decisionChoice: "approve_high_accuracy",
        metricChoice: "accuracy",
        evidenceChoices: ["many_true_negatives"],
      }),
    );
  });
});
