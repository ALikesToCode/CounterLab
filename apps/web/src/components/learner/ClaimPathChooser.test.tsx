import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClaimPathChooser } from "./ClaimPathChooser";

describe("ClaimPathChooser", () => {
  it("preserves the question and offers one dominant sample path plus notebook upload", async () => {
    const user = userEvent.setup();
    const startSample = vi.fn();
    const attachNotebook = vi.fn();
    const checkTools = vi.fn();
    render(
      <ClaimPathChooser
        claim="Will this score hold for new customers?"
        busy={false}
        onStartSample={startSample}
        onAttachNotebook={attachNotebook}
        onCheckLiveTools={checkTools}
        onBack={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Will this score hold for new customers?"),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /continue with verified sample/i }),
    );
    expect(startSample).toHaveBeenCalledOnce();

    const notebookOption = screen.getByRole("complementary", {
      name: "Live notebook option",
    });
    expect(
      within(notebookOption).getByRole("heading", {
        name: /use artifact-specific evidence instead/i,
      }),
    ).toBeInTheDocument();

    const notebook = new File(["{}"], "lesson.ipynb", {
      type: "application/json",
    });
    await user.upload(
      screen.getByLabelText("Attach a supported notebook"),
      notebook,
    );
    expect(attachNotebook).toHaveBeenCalledWith(notebook);
    expect(
      screen.getByText(/never executed during intake/i),
    ).toBeInTheDocument();

    await user.click(
      within(notebookOption).getByRole("button", {
        name: /check live notebook tools/i,
      }),
    );
    expect(checkTools).toHaveBeenCalledOnce();
  });
});
