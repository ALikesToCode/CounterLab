import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuestionComposer } from "./QuestionComposer";

function ControlledComposer({
  onAttachNotebook = vi.fn(),
  onSubmit = vi.fn(),
  busy = false,
}: {
  onAttachNotebook?: (file: File) => void;
  onSubmit?: () => void;
  busy?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <QuestionComposer
      value={value}
      onChange={setValue}
      onAttachNotebook={onAttachNotebook}
      onSubmit={onSubmit}
      busy={busy}
    />
  );
}

describe("QuestionComposer", () => {
  it("keeps the landing heading outside the composer and shows sparse prompt actions", async () => {
    const user = userEvent.setup();
    render(<ControlledComposer />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    const input = screen.getByPlaceholderText(
      "State a claim or attach a notebook…",
    );
    expect(input).toHaveAccessibleName("Your question or claim");
    expect(
      screen.getByRole("group", { name: "Prompt starters" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Does this evaluation match how the model will be used?",
      }),
    );
    expect(input).toHaveValue(
      "Does this evaluation match how the model will be used?",
    );
    expect(input).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Try verified sample" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Watch verified replay" }),
    ).not.toBeInTheDocument();
  });

  it("offers one question action with notebook attachment available in place", () => {
    const change = vi.fn();
    const attach = vi.fn();
    const submit = vi.fn();
    render(
      <QuestionComposer
        value=""
        onChange={change}
        onAttachNotebook={attach}
        onSubmit={submit}
      />,
    );

    expect(
      screen.getByPlaceholderText("State a claim or attach a notebook…"),
    ).toBeInTheDocument();
    expect(screen.getByText("Attach notebook")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Question" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Notebook" }),
    ).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
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

  it("allows the same notebook to be selected again after an attachment attempt", async () => {
    const user = userEvent.setup();
    const attach = vi.fn();
    render(<ControlledComposer onAttachNotebook={attach} />);
    const notebook = new File(["{}"], "lesson.ipynb", {
      type: "application/json",
    });
    const fileInput = screen.getByLabelText("Attach notebook");

    await user.upload(fileInput, notebook);
    await user.upload(fileInput, notebook);

    expect(attach).toHaveBeenNthCalledWith(1, notebook);
    expect(attach).toHaveBeenNthCalledWith(2, notebook);
    expect(attach).toHaveBeenCalledTimes(2);
  });

  it("submits a typed claim from the dominant action by keyboard", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<ControlledComposer onSubmit={submit} />);

    const submitButton = screen.getByRole("button", {
      name: "Test this claim",
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

  it("submits with Enter, preserves Shift+Enter, and ignores composing Enter", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    render(<ControlledComposer onSubmit={submit} />);
    const input = screen.getByRole("textbox", {
      name: /your question or claim/i,
    });

    await user.type(input, "Does this result generalize?");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(submit).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(submit).toHaveBeenCalledOnce();
  });

  it("grows the compact composer with its content up to the bounded height", async () => {
    const user = userEvent.setup();
    render(<ControlledComposer />);
    const input = screen.getByRole("textbox", {
      name: /your question or claim/i,
    });
    Object.defineProperty(input, "scrollHeight", {
      configurable: true,
      value: 128,
    });

    await user.type(input, "A longer question");

    expect(input).toHaveStyle({ height: "128px", overflowY: "hidden" });
  });

  it("disables every local action while a test is being prepared", () => {
    render(<ControlledComposer busy />);

    expect(screen.getByLabelText("Your question or claim")).toBeDisabled();
    const fileInput = screen.getByLabelText("Attach notebook");
    expect(fileInput).toBeDisabled();
    expect(fileInput.closest("label")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
    for (const starter of screen.getAllByRole("button", {
      name: /evaluation match how the model will be used|headline score hide an important failure case/u,
    })) {
      expect(starter).toBeDisabled();
    }
  });
});
