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
      screen.getByLabelText(/lower threshold based on missed-defect cost/i),
    );
    fireEvent.click(
      screen.getByLabelText(/missing a defect is the costly error/i),
    );
    fireEvent.click(screen.getByLabelText(/confusion matrix shows misses/i));
    fireEvent.click(screen.getByLabelText(/prevalence changes precision/i));
    fireEvent.click(screen.getByRole("button", { name: /check transfer/i }));

    await waitFor(() =>
      expect(api.submitTransfer).toHaveBeenCalledWith("session_1", {
        strategyChoice: "cost_aware_threshold",
        riskChoice: "minority_false_negative_cost",
        evidenceChoices: [
          "confusion_matrix_exposes_misses",
          "prevalence_shift_changes_precision",
        ],
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

  it("accepts a completed clause combination without grading the learner's prose", () => {
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
    ).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
});
