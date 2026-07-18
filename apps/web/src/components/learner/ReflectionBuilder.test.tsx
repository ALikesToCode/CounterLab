import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  ReflectionBuilder,
  type EvidenceLinkedClauseOption,
} from "./ReflectionBuilder";

const whenOptions = [
  {
    id: "rows-independent",
    text: "rows are independent",
    evidenceHref: "#row-assumption",
    evidenceLabel: "Notebook split assumption",
  },
  {
    id: "rows-repeat-entity",
    text: "rows repeat the same entity",
    evidenceHref: "#entity-overlap",
    evidenceLabel: "Verified overlap cells",
  },
] as const satisfies readonly EvidenceLinkedClauseOption[];

const actionOptions = [
  {
    id: "random-rows",
    text: "hold out random rows",
    evidenceHref: "#random-run",
    evidenceLabel: "Random-row run",
  },
  {
    id: "whole-entities",
    text: "hold out whole entities",
    evidenceHref: "#group-run",
    evidenceLabel: "Whole-entity run",
  },
] as const satisfies readonly EvidenceLinkedClauseOption[];

const becauseOptions = [
  {
    id: "more-data",
    text: "more rows always make evaluation safer",
    evidenceHref: "#row-count",
    evidenceLabel: "Row-count evidence",
  },
  {
    id: "identity-overlap",
    text: "random rows can share identity across train and test",
    evidenceHref: "#overlap-result",
    evidenceLabel: "Verified identity-overlap result",
  },
] as const satisfies readonly EvidenceLinkedClauseOption[];

function ControlledReflection({
  initialValue = "",
  onRevision = vi.fn(),
  onAuthoringModeChange,
}: {
  initialValue?: string;
  onRevision?: (revision: string) => void;
  onAuthoringModeChange?: (mode: "clauses" | "free_text") => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <ReflectionBuilder
      value={value}
      whenOptions={whenOptions}
      actionOptions={actionOptions}
      becauseOptions={becauseOptions}
      onRevisionChange={(revision) => {
        onRevision(revision);
        setValue(revision);
      }}
      {...(onAuthoringModeChange === undefined
        ? {}
        : { onAuthoringModeChange })}
    />
  );
}

describe("ReflectionBuilder", () => {
  it("builds one editable revision string from evidence-linked clauses", async () => {
    const user = userEvent.setup();
    const onRevision = vi.fn();
    render(<ControlledReflection onRevision={onRevision} />);

    await user.selectOptions(
      screen.getByLabelText(/choose the condition/i),
      "rows-repeat-entity",
    );
    await user.selectOptions(
      screen.getByLabelText(/choose the action/i),
      "whole-entities",
    );
    await user.selectOptions(
      screen.getByLabelText(/choose the evidence-based reason/i),
      "identity-overlap",
    );

    const expected =
      "When rows repeat the same entity,\nI should hold out whole entities,\nbecause random rows can share identity across train and test.";
    expect(screen.getByLabelText("Editable final sentence")).toHaveValue(
      expected,
    );
    expect(onRevision).toHaveBeenLastCalledWith(expected);
    expect(
      onRevision.mock.calls.every(([value]) => typeof value === "string"),
    ).toBe(true);
    expect(
      screen.getByRole("link", { name: /verified overlap cells/i }),
    ).toHaveAttribute("href", "#entity-overlap");
    expect(
      screen.getByRole("link", {
        name: /verified identity-overlap result/i,
      }),
    ).toHaveAttribute("href", "#overlap-result");
  });

  it("preserves edits while switching between clause and full free-text modes", async () => {
    const user = userEvent.setup();
    const onRevision = vi.fn();
    const onAuthoringModeChange = vi.fn();
    const initial =
      "When entities repeat, I will test on new entities before trusting the score.";
    render(
      <ControlledReflection
        initialValue={initial}
        onRevision={onRevision}
        onAuthoringModeChange={onAuthoringModeChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Write freely" }));
    expect(
      screen.queryByLabelText(/choose the condition/i),
    ).not.toBeInTheDocument();
    const freeEditor = screen.getByLabelText("Your rule");
    expect(freeEditor).toHaveValue(initial);
    await user.clear(freeEditor);
    await user.type(
      freeEditor,
      "I will keep deployment groups separate and explain why.",
    );

    await user.click(
      screen.getByRole("radio", {
        name: "Build with evidence-linked clauses",
      }),
    );
    expect(screen.getByLabelText("Editable final sentence")).toHaveValue(
      "I will keep deployment groups separate and explain why.",
    );
    expect(onRevision).toHaveBeenLastCalledWith(
      "I will keep deployment groups separate and explain why.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", {
          name: "Build the rule you will carry forward.",
        })
        .closest("section"),
    ).toHaveAttribute("data-motion", "reduced-safe");
    expect(onAuthoringModeChange.mock.calls).toEqual([
      ["free_text"],
      ["clauses"],
    ]);
  });
});
