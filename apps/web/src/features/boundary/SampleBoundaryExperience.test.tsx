import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
  CANONICAL_JSON_PROFILE,
} from "@counterlab/contracts";

import type { BoundaryResponse } from "../../api";
import { SampleBoundaryExperience } from "./SampleBoundaryExperience";

const digest = (character: string) => character.repeat(64);

function boundaryFixture(): BoundaryResponse {
  const result = BoundaryMapResultV1Schema.parse({
    schemaVersion: "1",
    canonicalProfile: CANONICAL_JSON_PROFILE,
    boundaryMapId: "boundary_sample",
    sessionId: "sample_session_1",
    concept: "entity_leakage",
    conceptPackVersion: "2.0.0",
    artifactManifestHash: digest("0"),
    experimentIrHash: digest("1"),
    authoritativeResultHash: digest("2"),
    evidenceVerdictHash: digest("3"),
    sweepId: "leakage-recurrence-sweep",
    gridPresetId: "leakage-boundary-grid-sample",
    seed: 1_729,
    kernelVersion: "leakage-kernel-v2",
    axes: [
      {
        id: "test_fraction",
        label: "Test fraction",
        unit: "proportion",
        points: [
          { id: "test-20", value: 0.2, label: "20%" },
          { id: "test-40", value: 0.4, label: "40%" },
        ],
      },
      {
        id: "observations_per_entity",
        label: "Observations per customer",
        unit: "observations/customer",
        points: [
          { id: "rows-2", value: 2, label: "2 observations" },
          { id: "rows-4", value: 4, label: "4 observations" },
        ],
      },
    ],
    cells: [
      ["test-20", 0.2, "rows-2", 2, "little-gap", 0.08],
      ["test-20", 0.2, "rows-4", 4, "material-gap", 0.34],
      ["test-40", 0.4, "rows-2", 2, "little-gap", 0.1],
      ["test-40", 0.4, "rows-4", 4, "material-gap", 0.39],
    ].map(
      ([xId, xValue, yId, yValue, classificationId, optimismGap], index) => ({
        cellId: `cell-${index + 1}`,
        concept: "entity_leakage",
        coordinates: [
          { axisId: "test_fraction", pointId: xId, value: xValue },
          {
            axisId: "observations_per_entity",
            pointId: yId,
            value: yValue,
          },
        ],
        classificationId,
        randomAccuracy: 0.94,
        groupAccuracy: 0.94 - Number(optimismGap),
        optimismGap,
        randomEntityOverlap: { count: 14, rate: 0.5 },
        groupEntityOverlap: { count: 0, rate: 0 },
        sampleSizes: { randomTest: 80, groupTest: 80 },
        fixtureViewHash: digest("4"),
        randomPipelineFingerprint: digest("5"),
        groupPipelineFingerprint: digest("6"),
      }),
    ),
    classifications: [
      {
        id: "little-gap",
        label: "Little gap",
        description: "The evaluation boundary changes the score only slightly.",
      },
      {
        id: "material-gap",
        label: "Material gap",
        description: "Repeated identities materially inflate the row split.",
      },
    ],
    units: { optimism_gap: "accuracy proportion" },
    assumptions: ["Estimator, preprocessing, fixture, and seed remain fixed."],
    nonClaims: [
      "The map does not claim group splitting always improves accuracy.",
    ],
    resultHash: digest("7"),
  });
  const report = BoundaryMapVerificationReportV1Schema.parse({
    schemaVersion: "1",
    status: "VERIFIED",
    verifierVersion: "boundary-map-verifier-v1",
    resultHash: result.resultHash,
    invariantCount: 1,
    invariants: [
      {
        name: "axis-order-resolved",
        passed: true,
        observed: "resolved",
        expected: "resolved",
      },
    ],
    reportHash: digest("8"),
  });
  const receipt = BoundaryMapReceiptV1Schema.parse({
    schemaVersion: "1",
    canonicalProfile: CANONICAL_JSON_PROFILE,
    sessionId: result.sessionId,
    resultHash: result.resultHash,
    verificationReportHash: report.reportHash,
    experimentIrHash: result.experimentIrHash,
    authoritativeResultHash: result.authoritativeResultHash,
    evidenceVerdictHash: result.evidenceVerdictHash,
    issuedAt: "2026-07-16T12:00:00.000Z",
    integrity: {
      mode: "integrity-hashed",
      algorithm: "sha256",
      contentHash: digest("9"),
    },
    receiptHash: digest("b"),
  });
  const authority = BoundaryMapAuthorityRefV1Schema.parse({
    jobId: "job_boundary_sample_1",
    sweepId: result.sweepId,
    resultHash: result.resultHash,
    verificationReportHash: report.reportHash,
    receipt,
    cellCount: result.cells.length,
  });

  return { result, report, receipt, authority };
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  const fetchCallCount = fetchSpy.mock.calls.length;
  vi.unstubAllGlobals();
  expect(fetchCallCount).toBe(0);
});

describe("SampleBoundaryExperience", () => {
  it("keeps verified sample authority visible before and after a successful hunt", async () => {
    const user = userEvent.setup();
    const boundary = boundaryFixture();
    const originalCells = boundary.result.cells;
    const originalSnapshot = structuredClone(boundary);
    const onClassify = vi.fn();
    const onReveal = vi.fn();

    render(
      <SampleBoundaryExperience
        boundary={boundary}
        integrityVerified={true}
        prediction="The row split will stay stronger than whole-customer holdout."
        onClassify={onClassify}
        onReveal={onReveal}
      />,
    );

    const authority = screen.getByRole("complementary", {
      name: "Sample Boundary authority",
    });
    expect(authority).toHaveTextContent("Verified sample exploration");
    expect(authority).toHaveTextContent(
      "Stored verified cells · no model call or new calculation",
    );

    await user.click(
      screen.getByRole("radio", {
        name: /test fraction 20%.*observations per customer 4 observations/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );

    expect(
      await screen.findByRole("table", {
        name: "Verified Boundary Map values",
      }),
    ).toBeInTheDocument();
    expect(authority).toBeInTheDocument();
    expect(onClassify).toHaveBeenCalledOnce();
    expect(onClassify).toHaveBeenCalledWith("CONCLUSION_CHANGES");
    expect(onReveal).toHaveBeenCalledOnce();
    expect(boundary).toEqual(originalSnapshot);
    expect(boundary.result.cells).toBe(originalCells);
    expect(boundary.result.resultHash).toBe(originalSnapshot.result.resultHash);
    expect(
      screen.getByRole("region", {
        name: "Verified sample Boundary experience",
      }),
    ).toHaveAttribute(
      "data-boundary-result-hash",
      originalSnapshot.result.resultHash,
    );
  });

  it("reveals the exact existing map directly and restores focus to its heading", async () => {
    const user = userEvent.setup();
    const onClassify = vi.fn();
    render(
      <SampleBoundaryExperience
        boundary={boundaryFixture()}
        integrityVerified={true}
        prediction="The score stays high."
        onClassify={onClassify}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reveal the map" }));

    const table = await screen.findByRole("table", {
      name: "Verified Boundary Map values",
    });
    expect(
      within(table).getByRole("button", {
        name: /test fraction 20%.*2 observations.*little gap.*8\.0 percentage points/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("8.0 percentage points")).toHaveLength(2);
    expect(
      screen.getByRole("complementary", { name: "Locked prediction" }),
    ).toHaveTextContent("The score stays high.");
    expect(screen.getByText("Verified sample exploration")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Where does the result change?" }),
      ).toHaveFocus(),
    );
    await user.click(
      screen.getByRole("radio", {
        name: /test fraction 20%.*observations per customer 4 observations/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );
    expect(onClassify).toHaveBeenCalledWith("CONCLUSION_CHANGES");
  });

  it("reveals after two stable attempts and reports both classifications", async () => {
    const user = userEvent.setup();
    const onClassify = vi.fn();
    render(
      <SampleBoundaryExperience
        boundary={boundaryFixture()}
        integrityVerified={true}
        onClassify={onClassify}
      />,
    );

    await user.click(
      screen.getByRole("radio", {
        name: /test fraction 40%.*observations per customer 2 observations/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );
    expect(
      screen.queryByRole("table", { name: "Verified Boundary Map values" }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", {
        name: /test fraction 20%.*observations per customer 2 observations/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );

    expect(
      await screen.findByRole("table", {
        name: "Verified Boundary Map values",
      }),
    ).toBeInTheDocument();
    expect(onClassify).toHaveBeenNthCalledWith(1, "CONCLUSION_STABLE");
    expect(onClassify).toHaveBeenNthCalledWith(2, "CONCLUSION_STABLE");
  });

  it("reveals the stored map when the learner skips without classifying", async () => {
    const user = userEvent.setup();
    const onClassify = vi.fn();
    const onReveal = vi.fn();
    render(
      <SampleBoundaryExperience
        boundary={boundaryFixture()}
        integrityVerified={true}
        onClassify={onClassify}
        onReveal={onReveal}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Skip the hunt" }));

    expect(
      await screen.findByRole("table", {
        name: "Verified Boundary Map values",
      }),
    ).toBeInTheDocument();
    expect(onClassify).not.toHaveBeenCalled();
    expect(onReveal).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(
      /apply is available once the verified map is visible; this lesson does not grade your choice/i,
    );
    expect(
      screen.queryByRole("heading", {
        name: /can you find a condition where the conclusion changes/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("refuses to label or render an integrity-unverified sample", () => {
    render(
      <SampleBoundaryExperience
        boundary={boundaryFixture()}
        integrityVerified={false}
      />,
    );

    expect(
      screen.getByRole("alert", { name: "Sample Boundary unavailable" }),
    ).toHaveTextContent("Verified sample evidence is unavailable");
    expect(
      screen.queryByRole("complementary", {
        name: "Sample Boundary authority",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Verified Boundary Map values" }),
    ).not.toBeInTheDocument();
  });

  it("refuses a rejected report even after an integrity claim", () => {
    const boundary = boundaryFixture();
    boundary.report = { ...boundary.report, status: "REJECTED" };

    render(
      <SampleBoundaryExperience boundary={boundary} integrityVerified={true} />,
    );

    expect(
      screen.getByRole("alert", { name: "Sample Boundary unavailable" }),
    ).toHaveAttribute("data-sample-authority", "rejected");
    expect(
      screen.queryByText(
        "Stored verified cells · no model call or new calculation",
      ),
    ).not.toBeInTheDocument();
  });
});
