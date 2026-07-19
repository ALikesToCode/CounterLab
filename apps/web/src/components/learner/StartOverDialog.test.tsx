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

    fireEvent.click(
      screen.getByRole("button", { name: /stop jobs and start over/i }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
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
  });
});
