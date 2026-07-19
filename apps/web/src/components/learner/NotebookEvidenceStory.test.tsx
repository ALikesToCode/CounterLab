import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { NotebookEvidenceStory } from "./NotebookEvidenceStory";

describe("NotebookEvidenceStory", () => {
  it("renders supplied metric and exact references without deriving evidence", async () => {
    const user = userEvent.setup();
    render(
      <NotebookEvidenceStory
        title="Customer churn evaluation"
        headlineMetric={{
          label: "Accuracy displayed by the notebook",
          value: "98.5%",
        }}
        references={[
          {
            id: "metric-output",
            reference: "Cell 3 · output 0",
            relevance: "This is the score behind the learner's claim.",
            excerpt: "accuracy: 0.985",
          },
          {
            id: "split-source",
            reference: "Cell 3 · source",
            relevance: "The split determines who appears on each side.",
            excerpt: "train_test_split(X, y, random_state=42)",
          },
        ]}
        integrity={[
          { label: "Notebook SHA-256", value: "a".repeat(64) },
          { label: "Cell source SHA-256", value: "b".repeat(64) },
        ]}
      />,
    );

    expect(
      screen.getByLabelText("Accuracy displayed by the notebook"),
    ).toHaveTextContent("98.5%");
    expect(
      screen.getByRole("region", { name: "Customer churn evaluation" }),
    ).toBeInTheDocument();
    const references = within(
      screen.getByRole("list", { name: "Exact evidence references" }),
    );
    expect(references.getByText("Cell 3 · output 0")).toBeInTheDocument();
    expect(references.getByText("Cell 3 · source")).toBeInTheDocument();
    expect(
      screen.getByText("This is the score behind the learner's claim."),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Full evidence and integrity"));
    expect(screen.getByText("accuracy: 0.985")).toBeInTheDocument();
    expect(
      screen.getByText("train_test_split(X, y, random_state=42)"),
    ).toBeInTheDocument();
    expect(screen.getByText("a".repeat(64))).toBeInTheDocument();
    expect(screen.getByText("b".repeat(64))).toBeInTheDocument();
  });
});
