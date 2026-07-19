import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette } from "./CommandPalette";
import type { StudioCommand } from "./types";

const commands: readonly StudioCommand[] = [
  {
    id: "analyze",
    label: "Analyze notebook",
    hint: "Start a live analysis",
    shortcut: "N",
    run: vi.fn(),
  },
  {
    id: "evidence",
    label: "Show evidence",
    hint: "Open Evidence & proof",
    shortcut: "E",
    run: vi.fn(),
  },
];

function PaletteHarness({
  availableCommands = commands,
}: {
  availableCommands?: readonly StudioCommand[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open commands
      </button>
      <CommandPalette
        open={open}
        commands={availableCommands}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  const invoker = screen.getByRole("button", { name: "Open commands" });
  await user.click(invoker);
  const search = screen.getByRole("textbox", { name: "Search commands" });
  await waitFor(() => expect(search).toHaveFocus());
  return { invoker, search };
}

describe("CommandPalette", () => {
  it("keeps command shortcuts visible and invokes the focused command from the keyboard", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette
        open
        commands={[
          {
            id: "analyze",
            label: "Analyze notebook",
            hint: "Start a live analysis",
            shortcut: "N",
            run,
          },
        ]}
        onClose={onClose}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Search commands" }),
      ).toHaveFocus(),
    );
    const command = screen.getByRole("button", { name: /analyze notebook/i });
    const shortcut = screen.getByText("N", { selector: "kbd" });

    expect(command).toContainElement(shortcut);
    command.focus();
    expect(command).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses concise command labels as accessible names and keeps shortcut glyphs out of the accessibility tree", async () => {
    render(<CommandPalette open commands={commands} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Search commands" }),
      ).toHaveFocus(),
    );

    const analyze = screen.getByRole("button", { name: "Analyze notebook" });
    const evidence = screen.getByRole("button", { name: "Show evidence" });
    expect(analyze).toHaveAccessibleName("Analyze notebook");
    expect(analyze).toHaveAccessibleDescription("Start a live analysis");
    expect(evidence).toHaveAccessibleName("Show evidence");
    expect(evidence).toHaveAccessibleDescription("Open Evidence & proof");

    for (const shortcut of ["N", "E", "Esc"]) {
      expect(screen.getByText(shortcut, { selector: "kbd" })).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
  });

  it("moves initial focus to the command search", async () => {
    const user = userEvent.setup();
    render(<PaletteHarness />);

    const { search } = await openPalette(user);

    expect(search).toHaveFocus();
  });

  it("wraps focus forward and backward within the open palette", async () => {
    const user = userEvent.setup();
    render(<PaletteHarness />);
    const { search } = await openPalette(user);
    const lastCommand = screen.getByRole("button", { name: /show evidence/i });

    lastCommand.focus();
    await user.tab();
    expect(search).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastCommand).toHaveFocus();
  });

  it("keeps focus contained when no command is enabled", async () => {
    const user = userEvent.setup();
    render(
      <PaletteHarness
        availableCommands={commands.map((command) => ({
          ...command,
          disabled: true,
        }))}
      />,
    );
    const { search } = await openPalette(user);

    await user.tab();
    expect(search).toHaveFocus();
    await user.tab({ shift: true });
    expect(search).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommandPalette open commands={commands} onClose={onClose} />);
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Search commands" }),
      ).toHaveFocus(),
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("restores focus to the invoker after the palette closes", async () => {
    const user = userEvent.setup();
    render(<PaletteHarness />);
    const { invoker } = await openPalette(user);

    await user.keyboard("{Escape}");

    await waitFor(() => expect(invoker).toHaveFocus());
    expect(
      screen.queryByRole("dialog", { name: "CounterLab commands" }),
    ).not.toBeInTheDocument();
  });

  it("restores focus to the invoker when the open palette unmounts", async () => {
    const user = userEvent.setup();
    const invoker = document.createElement("button");
    invoker.textContent = "Outside invoker";
    document.body.append(invoker);
    invoker.focus();
    const { unmount } = render(
      <CommandPalette open commands={commands} onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Search commands" }),
      ).toHaveFocus(),
    );

    unmount();

    expect(invoker).toHaveFocus();
    invoker.remove();
  });
});
