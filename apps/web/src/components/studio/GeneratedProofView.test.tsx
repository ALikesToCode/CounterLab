import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PublicCompilerEvent } from "../../api";
import { GeneratedProofView } from "./GeneratedProofView";

const events: PublicCompilerEvent[] = [
  {
    schemaVersion: "1",
    eventId: "event_plan",
    jobId: "job_live",
    cursor: 1,
    at: "2026-07-15T10:00:00.000Z",
    kind: "plan.summary",
    title: "Test the deployment boundary",
    steps: ["Keep the model fixed", "Hold out complete entities"],
  },
  {
    schemaVersion: "1",
    eventId: "event_rejected",
    jobId: "job_live",
    cursor: 2,
    at: "2026-07-15T10:00:01.000Z",
    kind: "verifier.rejected",
    invariant: "zero_group_overlap",
    observed: { overlap: 12 },
    expected: { overlap: 0 },
    counterexample: "Twelve entity IDs appear in both train and test.",
  },
];

describe("GeneratedProofView", () => {
  it("renders sanitized events through a trusted, action-free component registry", () => {
    const { container } = render(<GeneratedProofView events={events} />);

    expect(
      screen.getByRole("region", { name: /generated compiler proof view/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Test the deployment boundary"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Twelve entity IDs/i)).toBeInTheDocument();
    expect(screen.getByText(/no executable UI/i)).toBeInTheDocument();
    expect(container.querySelector("button, a, script, iframe")).toBeNull();
  });
});
