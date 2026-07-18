import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuestionComposer } from "./QuestionComposer";

function ControlledComposer({
  onAttachNotebook = vi.fn(),
  onSubmit = vi.fn(),
  onStartSample = vi.fn(),
  onOpenReplay = vi.fn(),
}: {
  onAttachNotebook?: (file: File) => void;
  onSubmit?: () => void;
  onStartSample?: () => void;
  onOpenReplay?: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <QuestionComposer
      value={value}
      onChange={setValue}
      onAttachNotebook={onAttachNotebook}
      onSubmit={onSubmit}
      onStartSample={onStartSample}
      onOpenReplay={onOpenReplay}
    />
  );
}

describe("QuestionComposer", () => {
  it("starts with the Question and lets prompt chips populate text only", async () => {
    const user = userEvent.setup();
    const startSample = vi.fn();
    render(<ControlledComposer onStartSample={startSample} />);

    expect(
      screen.getByRole("heading", {
        name: "What result are you trying to understand?",
      }),
    ).toBeInTheDocument();
    const input = screen.getByPlaceholderText(
      "State a claim or attach a notebook…",
    );
    expect(input).toHaveValue("");

    await user.click(
      screen.getByRole("button", {
        name: "Why did my model score highly but fail on new customers?",
      }),
    );
    expect(input).toHaveValue(
      "Why did my model score highly but fail on new customers?",
    );
    expect(startSample).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(/98\.5|59\.4/);
  });

  it("passes an attached notebook to the parent without running it", async () => {
    const user = userEvent.setup();
    const attach = vi.fn();
    render(<ControlledComposer onAttachNotebook={attach} />);
    const notebook = new File(["{}"], "lesson.ipynb", {
      type: "application/json",
    });

    await user.upload(screen.getByLabelText("Attach notebook"), notebook);
    expect(attach).toHaveBeenCalledWith(notebook);
    expect(
      screen.getByText(/notebook cells are read for evidence and never run/i),
    ).toBeInTheDocument();
  });

  it("submits a typed claim from the dominant action by keyboard", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<ControlledComposer onSubmit={submit} />);

    const submitButton = screen.getByRole("button", {
      name: "Test this claim →",
    });
    expect(submitButton).toBeDisabled();
    await user.type(
      screen.getByPlaceholderText("State a claim or attach a notebook…"),
      "Does this score hold for unseen customers?",
    );
    expect(submitButton).toBeEnabled();
    submitButton.focus();
    await user.keyboard("{Enter}");
    expect(submit).toHaveBeenCalledOnce();
  });

  it("keeps verified sample and replay as explicit secondary callbacks", async () => {
    const user = userEvent.setup();
    const sample = vi.fn();
    const replay = vi.fn();
    render(<ControlledComposer onStartSample={sample} onOpenReplay={replay} />);

    await user.click(
      screen.getByRole("button", { name: "Try verified sample" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Watch verified replay" }),
    );
    expect(sample).toHaveBeenCalledOnce();
    expect(replay).toHaveBeenCalledOnce();
  });
});
