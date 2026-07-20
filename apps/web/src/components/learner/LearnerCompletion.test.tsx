import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LearnerCompletion } from "./LearnerCompletion";

const capability = Object.freeze({
  intro: "You completed one verified comparison.",
  first: "good on familiar rows",
  connector: "was compared with",
  second: "performance on new entities in this fixed task",
});

describe("LearnerCompletion", () => {
  it("renders supplied evidence and invokes only the selected actions", async () => {
    const user = userEvent.setup();
    const downloadNotebook = vi.fn();
    const downloadProof = vi.fn();
    const openNextCase = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <LearnerCompletion
        capability={capability}
        beforeReasoning="Random rows show whether the score is stable."
        afterReasoning="Whole-entity holdout tests whether the model transfers."
        transferStatus={{
          label: "Transfer passed",
          detail: "The time-ordered case preserved the same reasoning rule.",
        }}
        repairedNotebookAction={{
          label: "Download repaired notebook",
          onActivate: downloadNotebook,
        }}
        proofCapsuleAction={{
          label: "Download Proof Capsule",
          onActivate: downloadProof,
        }}
        nextCaseAction={{
          label: "Try the supported imbalance case",
          onActivate: openNextCase,
        }}
        evidenceAndProof={<p>Integrity-hashed proof capsule abc123.</p>}
      />,
    );

    expect(
      screen.getByRole("heading", { name: capability.intro }),
    ).toBeInTheDocument();
    expect(screen.getByText(capability.first)).toBeInTheDocument();
    expect(screen.getByText(capability.connector)).toBeInTheDocument();
    expect(screen.getByText(capability.second)).toBeInTheDocument();

    const reasoning = screen
      .getByRole("heading", { name: "Before and after reasoning" })
      .closest("section");
    expect(reasoning).not.toBeNull();
    expect(
      within(reasoning!).getByText(
        "Random rows show whether the score is stable.",
      ),
    ).toBeInTheDocument();
    expect(
      within(reasoning!).getByText(
        "Whole-entity holdout tests whether the model transfers.",
      ),
    ).toBeInTheDocument();

    const transfer = screen.getByRole("status", { name: "Transfer status" });
    expect(transfer).toHaveTextContent(
      "Transfer passedThe time-ordered case preserved the same reasoning rule.",
    );

    await user.click(
      screen.getByRole("button", { name: "Download repaired notebook" }),
    );
    expect(downloadNotebook).toHaveBeenCalledTimes(1);
    expect(downloadProof).not.toHaveBeenCalled();
    expect(openNextCase).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Download Proof Capsule" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Try the supported imbalance case",
      }),
    );
    expect(downloadProof).toHaveBeenCalledTimes(1);
    expect(openNextCase).toHaveBeenCalledTimes(1);

    const proofSummary = screen.getByText("Evidence & proof");
    const proofDetails = proofSummary.closest("details");
    expect(proofDetails).not.toHaveAttribute("open");
    expect(
      screen.queryByText("Integrity-hashed proof capsule abc123."),
    ).not.toBeInTheDocument();
    await user.click(proofSummary);
    expect(proofDetails).toHaveAttribute("open");
    expect(
      screen.getByText("Integrity-hashed proof capsule abc123."),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("heading", { name: capability.intro })
        .closest("section"),
    ).toHaveAttribute("data-motion", "reduced-safe");
    expect(
      screen
        .getByRole("heading", { name: capability.intro })
        .closest("section"),
    ).not.toHaveTextContent(
      /you can now distinguish|mastered|mastery achieved/i,
    );

    fetchSpy.mockRestore();
  });

  it("omits the optional next case and preserves disabled action state", () => {
    render(
      <LearnerCompletion
        capability={capability}
        beforeReasoning="Before text"
        afterReasoning="After text"
        transferStatus={{ label: "Transfer passed" }}
        repairedNotebookAction={{
          label: "Download repaired notebook",
          onActivate: vi.fn(),
          disabled: true,
        }}
        proofCapsuleAction={{
          label: "Download Proof Capsule",
          onActivate: vi.fn(),
        }}
        evidenceAndProof={<p>Exact proof content</p>}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Download repaired notebook" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /supported .* case/i }),
    ).not.toBeInTheDocument();
  });
});
