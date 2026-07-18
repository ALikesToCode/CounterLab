import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PublicCompilerEvent } from "../../api";
import { FairTestBuilder } from "./FairTestBuilder";

function eventBase(cursor: number) {
  return {
    schemaVersion: "1" as const,
    eventId: `event_${cursor}`,
    jobId: "job_learner_test",
    cursor,
    at: "2026-07-18T09:00:00.000Z",
  };
}

const defaultProps = {
  whyThisTest:
    "It changes the evaluation unit while keeping the model comparison fair.",
  deploymentMatch:
    "Deployment predicts for customers the model has not seen before.",
  changedVariable: "Random rows → whole-customer holdout",
  heldFixed: ["Model family", "Target", "Preprocessing"],
  sanitizedTechnicalDetails: [
    { label: "Experiment IR", value: "ir_sha256_approved" },
  ],
} as const;

describe("FairTestBuilder", () => {
  it("translates public events into learner language and explains a fair test", () => {
    const events = [
      { ...eventBase(1), kind: "job.started" },
      {
        ...eventBase(2),
        kind: "plan.summary",
        title: "Compare two evaluation units",
        steps: ["Keep the model fixed", "Measure unseen-customer accuracy"],
      },
      {
        ...eventBase(3),
        kind: "command.completed",
        label: "Evaluation-unit check",
        exitCode: 0,
        durationMs: 24,
        excerpt: "public bounded output",
      },
      {
        ...eventBase(4),
        kind: "verifier.verified",
        invariantCount: 7,
        mutationCount: 3,
      },
    ] satisfies PublicCompilerEvent[];

    render(<FairTestBuilder {...defaultProps} events={events} />);

    expect(
      screen.getByRole("heading", { name: defaultProps.whyThisTest }),
    ).toBeInTheDocument();
    expect(screen.getByText(defaultProps.deploymentMatch)).toBeInTheDocument();
    expect(screen.getByText(defaultProps.changedVariable)).toBeInTheDocument();
    const fixedCard = screen.getByText("Held fixed").closest("article");
    expect(fixedCard).not.toBeNull();
    for (const control of defaultProps.heldFixed) {
      expect(within(fixedCard!).getByText(control)).toBeInTheDocument();
    }

    expect(screen.getByText("Protected test started")).toBeInTheDocument();
    expect(
      screen.getByText("The smallest fair test was planned"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A bounded candidate is ready for fixed scoring and control checks.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Compare two evaluation units"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Keep the model fixed")).not.toBeInTheDocument();
    expect(screen.getByText("A fixed check completed")).toBeInTheDocument();
    expect(screen.queryByText("Evaluation-unit check")).not.toBeInTheDocument();
    expect(screen.queryByText("public bounded output")).not.toBeInTheDocument();
    expect(
      screen.getByText("The independent verifier accepted the test"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Test plan verified");
    expect(screen.getByText("ir_sha256_approved")).toBeInTheDocument();
  });

  it("shows the rejected-plan repair story only after repair starts", () => {
    const rejected = {
      ...eventBase(1),
      kind: "verifier.rejected",
      invariant: "one-variable-change",
      observed: { changed: ["evaluation-unit", "model"] },
      expected: { changed: ["evaluation-unit"] },
      counterexample: "Changing two variables cannot isolate the cause.",
    } satisfies PublicCompilerEvent;
    const repairStory = {
      firstPlanChanged:
        "The first plan changed both the evaluation unit and the model.",
      whyThatWasFlawed: "That would not tell us which change mattered.",
      repairedBy: "Codex repaired it by changing only the evaluation unit.",
    } as const;

    const { rerender } = render(
      <FairTestBuilder
        {...defaultProps}
        events={[rejected]}
        repairStory={repairStory}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "CounterLab caught a flawed test.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(repairStory.firstPlanChanged)).toBeInTheDocument();
    expect(screen.getByText(repairStory.whyThatWasFlawed)).toBeInTheDocument();
    expect(screen.queryByText(repairStory.repairedBy)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Test stopped safely");

    rerender(
      <FairTestBuilder
        {...defaultProps}
        events={[
          rejected,
          { ...eventBase(2), kind: "repair.started", attempt: 1 },
        ]}
        repairStory={repairStory}
      />,
    );

    expect(screen.getByText(repairStory.repairedBy)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Verification in progress",
    );
  });

  it("uses explicit parent verification authority when no live events exist", () => {
    render(
      <FairTestBuilder
        {...defaultProps}
        events={[]}
        verificationState="verified"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Test plan verified");
    expect(
      screen.getByText("Subject Pack test plan verified"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Waiting for the protected test to start"),
    ).not.toBeInTheDocument();
  });

  it("distinguishes verified planning from an authorized result", () => {
    const verifiedPlan = {
      ...eventBase(1),
      kind: "verifier.verified",
      invariantCount: 7,
      mutationCount: 3,
    } satisfies PublicCompilerEvent;
    const { rerender } = render(
      <FairTestBuilder {...defaultProps} events={[verifiedPlan]} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Test plan verified");
    expect(
      screen.queryByText("The verified result is authorized"),
    ).not.toBeInTheDocument();

    rerender(
      <FairTestBuilder
        {...defaultProps}
        events={[
          verifiedPlan,
          {
            ...eventBase(2),
            kind: "result.ready",
            resultHash: "0".repeat(64),
          },
        ]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Verified result ready",
    );
    expect(
      screen.getByText("The verified result is authorized"),
    ).toBeInTheDocument();
  });

  it("never renders private reasoning from event extras or technical detail fields", () => {
    const maliciousEvent = {
      ...eventBase(1),
      kind: "job.started",
      privateReasoning: "SECRET EVENT REASONING",
    } as unknown as PublicCompilerEvent;

    render(
      <FairTestBuilder
        {...defaultProps}
        events={[maliciousEvent]}
        sanitizedTechnicalDetails={[
          { label: "Result hash", value: "safe-result-hash" },
          { label: "Private reasoning", value: "SECRET LABEL VALUE" },
          {
            label: "Compiler note",
            value: "contains chain-of-thought marker SECRET VALUE",
          },
        ]}
      />,
    );

    expect(screen.getByText("safe-result-hash")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("SECRET EVENT REASONING");
    expect(document.body).not.toHaveTextContent("SECRET LABEL VALUE");
    expect(document.body).not.toHaveTextContent("SECRET VALUE");
    expect(document.body).not.toHaveTextContent("chain-of-thought");
  });
});
