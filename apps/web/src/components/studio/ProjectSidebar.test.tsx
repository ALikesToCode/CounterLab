import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectSidebar } from "./ProjectSidebar";
import type { StudioContext } from "./types";

const context: StudioContext = {
  mode: "instant",
  stage: "question-path",
  artifact: null,
  session: null,
  events: [],
};

describe("ProjectSidebar", () => {
  it.each([
    ["instant", "Bundled sample artifact", "No fixed sample loaded"],
    ["live", "Uploaded notebook", "No notebook uploaded"],
    ["replay", "Replay artifact", "Replay artifact unavailable"],
  ] as const)(
    "labels the %s artifact origin without implying an upload",
    (mode, heading, empty) => {
      render(
        <ProjectSidebar
          context={{ ...context, mode }}
          recentProjects={[]}
          onNewAnalysis={vi.fn()}
          onShowEvidence={vi.fn()}
          onOpenRecent={vi.fn()}
          onOpenCommands={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText(heading)).toBeInTheDocument();
      expect(screen.getByText(empty)).toBeInTheDocument();
    },
  );

  it("fails closed when the route mode and stored session mode disagree", () => {
    render(
      <ProjectSidebar
        context={{
          ...context,
          mode: "live",
          artifact: {
            fileName: "private-sample.ipynb",
            support: { status: "SUPPORTED" },
            cells: [
              {
                index: 7,
                sourceExcerpt: "private customer_id evidence",
                metricCandidates: ["accuracy"],
                outputHashes: [],
                symbols: ["customer_id"],
              },
            ],
          } as unknown as NonNullable<StudioContext["artifact"]>,
          session: {
            sessionId: "session_sample_1",
            artifactId: "artifact_sample_1",
            mode: { kind: "sample_lesson", sampleId: "leakage-01" },
            state: "INGESTED",
            version: 1,
            createdAt: "2026-07-21T10:00:00.000Z",
            updatedAt: "2026-07-21T10:00:00.000Z",
          },
        }}
        recentProjects={[]}
        onNewAnalysis={vi.fn()}
        onShowEvidence={vi.fn()}
        onOpenRecent={vi.fn()}
        onOpenCommands={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Mode mismatch")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mode mismatch/i }),
    ).toBeDisabled();
    expect(screen.queryByText("private-sample.ipynb")).toBeNull();
    expect(screen.queryByText(/private customer_id evidence/i)).toBeNull();
  });

  it("fails closed when a same-mode artifact belongs to another session", () => {
    render(
      <ProjectSidebar
        context={{
          ...context,
          mode: "live",
          artifact: {
            artifactId: "artifact_stale",
            fileName: "stale-private-notebook.ipynb",
            support: { status: "SUPPORTED" },
            cells: [
              {
                index: 4,
                sourceExcerpt: "stale private metric evidence",
                metricCandidates: ["accuracy"],
                outputHashes: [],
                symbols: [],
              },
            ],
          } as unknown as NonNullable<StudioContext["artifact"]>,
          session: {
            sessionId: "session_live_2",
            artifactId: "artifact_current",
            mode: { kind: "live_notebook" },
            state: "INGESTED",
            version: 1,
            createdAt: "2026-07-21T10:00:00.000Z",
            updatedAt: "2026-07-21T10:00:00.000Z",
          },
        }}
        recentProjects={[]}
        onNewAnalysis={vi.fn()}
        onShowEvidence={vi.fn()}
        onOpenRecent={vi.fn()}
        onOpenCommands={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Artifact mismatch")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /artifact mismatch/i }),
    ).toBeDisabled();
    expect(screen.queryByText("stale-private-notebook.ipynb")).toBeNull();
    expect(screen.queryByText(/stale private metric evidence/i)).toBeNull();
  });

  it("keeps the keyboard shortcut visible without adding it to the command name", async () => {
    const user = userEvent.setup();
    const onOpenCommands = vi.fn();

    render(
      <ProjectSidebar
        context={context}
        recentProjects={[]}
        onNewAnalysis={vi.fn()}
        onShowEvidence={vi.fn()}
        onOpenRecent={vi.fn()}
        onOpenCommands={onOpenCommands}
        onClose={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Open commands" });
    expect(trigger).toHaveTextContent("Ctrl K");
    expect(trigger).not.toHaveAccessibleName(/ctrl k/i);

    await user.click(trigger);
    expect(onOpenCommands).toHaveBeenCalledOnce();
  });
});
