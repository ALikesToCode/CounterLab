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
