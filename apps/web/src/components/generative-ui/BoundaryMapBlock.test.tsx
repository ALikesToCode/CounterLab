import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
  CANONICAL_JSON_PROFILE,
} from "@counterlab/contracts";

import type { BoundaryResponse } from "../../api";
import { BoundaryMapBlock } from "./BoundaryMapBlock";

const digest = (character: string) => character.repeat(64);

function boundaryFixture(
  integrity: "integrity-hashed" | "hmac-signed" = "integrity-hashed",
  status: "VERIFIED" | "REJECTED" = "VERIFIED",
): BoundaryResponse {
  const result = BoundaryMapResultV1Schema.parse({
    schemaVersion: "1",
    canonicalProfile: CANONICAL_JSON_PROFILE,
    boundaryMapId: "boundary_test",
    sessionId: "session_1",
    concept: "entity_leakage",
    conceptPackVersion: "2.0.0",
    artifactManifestHash: digest("0"),
    experimentIrHash: digest("1"),
    authoritativeResultHash: digest("2"),
    evidenceVerdictHash: digest("3"),
    sweepId: "leakage-recurrence-sweep",
    gridPresetId: "leakage-boundary-grid-test",
    seed: 1729,
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
    nonClaims: ["The map does not claim group splitting always improves accuracy."],
    resultHash: digest("7"),
  });
  const report = BoundaryMapVerificationReportV1Schema.parse({
    schemaVersion: "1",
    status,
    verifierVersion: "boundary-map-verifier-v1",
    resultHash: result.resultHash,
    invariantCount: 1,
    invariants: [
      {
        name: "axis-order-resolved",
        passed: status === "VERIFIED",
        observed: status === "VERIFIED" ? "resolved" : "swapped",
        expected: "resolved",
        ...(status === "REJECTED"
          ? { counterexample: "Axis order does not match the registered sweep." }
          : {}),
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
    integrity:
      integrity === "hmac-signed"
        ? {
            mode: "hmac-signed",
            algorithm: "hmac-sha256",
            contentHash: digest("9"),
            signature: digest("a"),
            keyId: "counterlab-boundary-v1",
          }
        : {
            mode: "integrity-hashed",
            algorithm: "sha256",
            contentHash: digest("9"),
          },
    receiptHash: digest("b"),
  });
  const authority = BoundaryMapAuthorityRefV1Schema.parse({
    jobId: "job_boundary_1",
    sweepId: result.sweepId,
    resultHash: result.resultHash,
    verificationReportHash: report.reportHash,
    receipt,
    cellCount: result.cells.length,
  });
  return { result, report, receipt, authority };
}

describe("BoundaryMapBlock", () => {
  it("renders verified cells in registered axis order with a table alternative", () => {
    render(
      <BoundaryMapBlock
        boundary={boundaryFixture()}
        prediction="The accuracy will remain high for unseen customers."
      />,
    );

    expect(
      screen.getByRole("table", { name: /verified boundary map values/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /test fraction 20%.*2 observations.*little gap.*8\.0 percentage points/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Integrity-hashed")).toBeInTheDocument();
    expect(screen.queryByText("HMAC-signed")).not.toBeInTheDocument();
    expect(screen.getByText(/estimator, preprocessing/i)).toBeInTheDocument();
  });

  it("lets a keyboard user inspect adjacent cells without relying on color", async () => {
    const user = userEvent.setup();
    render(<BoundaryMapBlock boundary={boundaryFixture()} />);
    const first = screen.getByRole("button", {
      name: /test fraction 20%.*2 observations/i,
    });
    first.focus();

    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("button", {
        name: /test fraction 40%.*2 observations/i,
      }),
    ).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(
      screen.getByRole("button", {
        name: /test fraction 40%.*4 observations.*material gap/i,
      }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByText("39.0 percentage points")).toHaveLength(2);
  });

  it("uses signed wording only when the receipt is HMAC-signed", () => {
    render(<BoundaryMapBlock boundary={boundaryFixture("hmac-signed")} />);
    expect(screen.getByText("HMAC-signed")).toBeInTheDocument();
    expect(screen.getByText(/counterlab-boundary-v1/i)).toBeInTheDocument();
  });

  it("withholds all computed cells when verification was rejected", () => {
    render(<BoundaryMapBlock boundary={boundaryFixture("integrity-hashed", "REJECTED")} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/evidence withheld/i);
    expect(
      screen.queryByRole("table", { name: /verified boundary map values/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("8.0 percentage points")).not.toBeInTheDocument();
  });
});
