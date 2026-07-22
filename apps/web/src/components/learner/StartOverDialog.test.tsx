import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StartOverDialog } from "./StartOverDialog";

const jobs = [
  {
    sessionId: "session_1",
    jobId: "runner_job_1",
    kind: "LAB_RUN" as const,
    registeredAt: "2026-07-19T10:00:00.000Z",
  },
];

describe("StartOverDialog", () => {
  it("explains cancellation, traps focus, and confirms explicitly", () => {
    const onConfirm = vi.fn();
    render(
      <StartOverDialog
        jobs={jobs}
        busy={false}
        onKeepWorking={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /stop live work and start over/i }),
    ).toBeVisible();
    expect(screen.getByText(/never authorizes a result/i)).toBeVisible();
    expect(screen.getByText("runner_job_1")).toBeVisible();
    expect(screen.getByRole("button", { name: /keep working/i })).toHaveFocus();

    const keepWorking = screen.getByRole("button", { name: /keep working/i });
    const confirm = screen.getByRole("button", {
      name: /stop jobs and start over/i,
    });
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(keepWorking).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();

    const outside = document.createElement("button");
    const outsideAction = vi.fn();
    outside.addEventListener("click", outsideAction);
    document.body.append(outside);
    outside.focus();
    fireEvent.keyDown(outside, { key: "Tab" });
    expect(keepWorking).toHaveFocus();
    fireEvent.click(outside);
    expect(outsideAction).not.toHaveBeenCalled();
    outside.remove();

    fireEvent.click(
      screen.getByRole("button", { name: /stop jobs and start over/i }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("keeps global command shortcuts behind the modal", () => {
    const commandShortcut = vi.fn();
    window.addEventListener("keydown", commandShortcut);
    render(
      <StartOverDialog
        jobs={jobs}
        busy={false}
        onKeepWorking={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: /keep working/i }), {
      key: "k",
      ctrlKey: true,
    });

    expect(commandShortcut).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: /stop live work and start over/i }),
    ).toBeInTheDocument();
    window.removeEventListener("keydown", commandShortcut);
  });

  it("closes with Escape and disables both actions while stopping", () => {
    const onKeepWorking = vi.fn();
    const { rerender } = render(
      <StartOverDialog
        jobs={jobs}
        busy={false}
        onKeepWorking={onKeepWorking}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onKeepWorking).toHaveBeenCalledOnce();

    rerender(
      <StartOverDialog
        jobs={jobs}
        busy
        onKeepWorking={onKeepWorking}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /keep working/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /stopping live work/i }),
    ).toBeDisabled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onKeepWorking).toHaveBeenCalledOnce();
  });

  it("restores focus to the opener only when the dialog unmounts", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const view = render(
      <StartOverDialog
        jobs={jobs}
        busy={false}
        onKeepWorking={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    view.rerender(
      <StartOverDialog
        jobs={jobs}
        busy
        onKeepWorking={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(opener).not.toHaveFocus();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
