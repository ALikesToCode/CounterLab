import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImbalanceTransferLesson } from "./ImbalanceTransferLesson";

const api = vi.hoisted(() => ({
  recordRevision: vi.fn(),
  submitTransfer: vi.fn(),
}));

vi.mock("../../api", () => ({
  ApiClientError: class ApiClientError extends Error {},
  counterLabApi: api,
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
