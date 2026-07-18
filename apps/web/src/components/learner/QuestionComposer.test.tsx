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
  busy = false,
}: {
  onAttachNotebook?: (file: File) => void;
  onSubmit?: () => void;
  onStartSample?: () => void;
  onOpenReplay?: () => void;
  busy?: boolean;
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
      busy={busy}
    />
  );
}

describe("QuestionComposer", () => {
  it("keeps the landing heading outside the composer and shows sparse prompt actions", async () => {
    const user = userEvent.setup();
    const startSample = vi.fn();
    render(<ControlledComposer onStartSample={startSample} />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    const input = screen.getByPlaceholderText(
      "State a claim you want to test…",
    );
    expect(input).toHaveAccessibleName("Your question or claim");

    await user.click(
      screen.getByRole("button", {
        name: "Why did my model score highly but fail on new customers?",
      }),
    );
    expect(input).toHaveValue(
      "Why did my model score highly but fail on new customers?",
    );
    expect(startSample).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Try verified sample" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Watch verified replay" }),
    ).not.toBeInTheDocument();
  });

  it("switches local intent by keyboard without invoking any parent action", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const attach = vi.fn();
    const submit = vi.fn();
    const sample = vi.fn();
    const replay = vi.fn();
    render(
      <QuestionComposer
        value=""
        onChange={change}
        onAttachNotebook={attach}
        onSubmit={submit}
        onStartSample={sample}
        onOpenReplay={replay}
      />,
    );

    const question = screen.getByRole("button", { name: "Question" });
    const notebook = screen.getByRole("button", { name: "Notebook" });
    expect(question).toHaveAttribute("aria-pressed", "true");
    expect(notebook).toHaveAttribute("aria-pressed", "false");

    notebook.focus();
    await user.keyboard("{Enter}");
    expect(notebook).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByPlaceholderText("What claim should this notebook help test?"),
    ).toBeInTheDocument();
    expect(screen.getByText(/attach a supported .ipynb/i)).toBeInTheDocument();
    expect(screen.getByText("+ Attach supported .ipynb")).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(sample).not.toHaveBeenCalled();
    expect(replay).not.toHaveBeenCalled();

    question.focus();
    await user.keyboard(" ");
    expect(question).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByPlaceholderText("State a claim you want to test…"),
    ).toBeInTheDocument();
  });

  it("passes an attached notebook to the parent without changing submit semantics", async () => {
    const user = userEvent.setup();
    const attach = vi.fn();
    render(<ControlledComposer onAttachNotebook={attach} />);
    const notebook = new File(["{}"], "lesson.ipynb", {
      type: "application/json",
    });

    const fileInput = screen.getByLabelText("Attach notebook");
    expect(fileInput).toHaveAttribute(
      "accept",
      ".ipynb,application/x-ipynb+json,application/json",
    );
    await user.upload(fileInput, notebook);
    expect(attach).toHaveBeenCalledWith(notebook);
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
      screen.getByPlaceholderText("State a claim you want to test…"),
      "Does this score hold for unseen customers?",
    );
    expect(submitButton).toBeEnabled();
    submitButton.focus();
    await user.keyboard("{Enter}");
    expect(submit).toHaveBeenCalledOnce();
  });

  it("disables every local action while a test is being prepared", () => {
    render(<ControlledComposer busy />);

    expect(screen.getByRole("button", { name: "Question" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Notebook" })).toBeDisabled();
    expect(screen.getByLabelText("Your question or claim")).toBeDisabled();
    const fileInput = screen.getByLabelText("Attach notebook");
    expect(fileInput).toBeDisabled();
    expect(fileInput.closest("label")).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Preparing test…" }),
    ).toBeDisabled();
    for (const starter of screen.getAllByRole("button", {
      name: /fail on new customers|rare cases are being caught/u,
    })) {
      expect(starter).toBeDisabled();
    }
  });
});
