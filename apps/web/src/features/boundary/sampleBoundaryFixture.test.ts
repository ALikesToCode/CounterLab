import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { BoundaryMapResultV1 } from "@counterlab/contracts";
import {
  hashBoundaryMapValue,
  validateBoundaryMapAuthority,
  verifyBoundaryMap,
  type BoundaryMapExpectationV1,
} from "@counterlab/boundary-map";
import { hashExperimentIR } from "@counterlab/experiment-ir";
import { describe, expect, it } from "vitest";

import {
  SampleBoundaryFixtureSchema,
  sampleBoundaryFixture,
  verifySampleBoundaryFixtureIntegrity,
} from "./sampleBoundaryFixture";

function expectationFor(result: BoundaryMapResultV1): BoundaryMapExpectationV1 {
  return {
    boundaryMapId: result.boundaryMapId,
    sessionId: result.sessionId,
    concept: result.concept,
    conceptPackVersion: result.conceptPackVersion,
    artifactManifestHash: result.artifactManifestHash,
    experimentIrHash: result.experimentIrHash,
    authoritativeResultHash: result.authoritativeResultHash,
    evidenceVerdictHash: result.evidenceVerdictHash,
    sweepId: result.sweepId,
    gridPresetId: result.gridPresetId,
    seed: result.seed,
    kernelVersion: result.kernelVersion,
    axes: result.axes,
    classifications: result.classifications,
    units: result.units,
    assumptions: result.assumptions,
    nonClaims: result.nonClaims,
    cellCount: result.cells.length,
  };
}

describe("verified sample Boundary fixture", () => {
  it("binds the sample result, Experiment IR, verdict, and all 25 fixed cells", async () => {
    const fixture = SampleBoundaryFixtureSchema.parse(sampleBoundaryFixture);
    const { result, report, authority } = fixture.boundary;
    const expected = expectationFor(result);

    expect(result.cells).toHaveLength(25);
    expect(result.authoritativeResultHash).toBe(
      fixture.source.primaryResultHash,
    );
    expect(await hashExperimentIR(fixture.experimentIr)).toBe(
      result.experimentIrHash,
    );
    expect(hashBoundaryMapValue(fixture.technicalReport)).toBe(
      fixture.evidenceVerdict.technicalReportHash,
    );
    expect(hashBoundaryMapValue(fixture.evidenceVerdict)).toBe(
      result.evidenceVerdictHash,
    );
    expect(verifyBoundaryMap(result, expected)).toEqual(report);
    expect(
      validateBoundaryMapAuthority(authority, {
        result,
        report,
        expected,
      }),
    ).toEqual(authority);
  });

  it("matches its full fixture hash and checked-in primary result bytes", async () => {
    const fixture = SampleBoundaryFixtureSchema.parse(sampleBoundaryFixture);
    const { fixtureIntegrityHash, ...unsignedFixture } = fixture;
    const primaryResultBytes = await readFile(
      resolve(
        process.cwd(),
        "../../fixtures/public/leakage_verified_result.json",
      ),
    );

    expect(hashBoundaryMapValue(unsignedFixture)).toBe(fixtureIntegrityHash);
    expect(createHash("sha256").update(primaryResultBytes).digest("hex")).toBe(
      fixture.source.primaryResultFileHash,
    );
    const primaryResult = JSON.parse(primaryResultBytes.toString("utf8")) as {
      resultHash: string;
    };
    expect(primaryResult.resultHash).toBe(fixture.source.primaryResultHash);
    await expect(
      verifySampleBoundaryFixtureIntegrity(sampleBoundaryFixture),
    ).resolves.toEqual(sampleBoundaryFixture);
  });

  it("detects wrong hashes and cross-lineage mutations", () => {
    const fixture = SampleBoundaryFixtureSchema.parse(sampleBoundaryFixture);
    const changed = structuredClone(fixture);
    changed.source.primaryResultHash = "0".repeat(64);

    expect(() => SampleBoundaryFixtureSchema.parse(changed)).toThrow(
      /lineage/u,
    );
    const { fixtureIntegrityHash, ...unsignedFixture } = changed;
    expect(hashBoundaryMapValue(unsignedFixture)).not.toBe(
      fixtureIntegrityHash,
    );

    const changedBoundary = structuredClone(fixture.boundary);
    const firstCell = changedBoundary.result.cells[0];
    if (firstCell?.concept !== "entity_leakage") {
      throw new Error("Expected the leakage sample Boundary fixture");
    }
    firstCell.optimismGap += 0.1;
    const rejected = verifyBoundaryMap(
      changedBoundary.result,
      expectationFor(fixture.boundary.result),
    );
    expect(rejected.status).toBe("REJECTED");
    expect(
      rejected.invariants.some(
        (invariant) =>
          invariant.name === "canonical_result_hash" && !invariant.passed,
      ),
    ).toBe(true);
  });

  it("rejects a structurally valid fixture whose canonical content changed", async () => {
    const fixture = SampleBoundaryFixtureSchema.parse(sampleBoundaryFixture);
    const changed = structuredClone(fixture);
    const firstCell = changed.boundary.result.cells[0];
    if (firstCell?.concept !== "entity_leakage") {
      throw new Error("Expected the leakage sample Boundary fixture");
    }
    firstCell.optimismGap += 0.001;

    await expect(verifySampleBoundaryFixtureIntegrity(changed)).rejects.toThrow(
      /integrity/u,
    );
  });

  it("rejects rehashed nested authority that disagrees with the verified result", async () => {
    const fixture = SampleBoundaryFixtureSchema.parse(sampleBoundaryFixture);
    const changedSweep = structuredClone(fixture);
    changedSweep.boundary.authority.sweepId = "unrelated-sweep";
    const { fixtureIntegrityHash: _sweepHash, ...sweepContent } = changedSweep;
    changedSweep.fixtureIntegrityHash = hashBoundaryMapValue(sweepContent);

    await expect(
      verifySampleBoundaryFixtureIntegrity(changedSweep),
    ).rejects.toThrow(/authority/u);

    const changedReceipt = structuredClone(fixture);
    changedReceipt.boundary.authority.receipt.sessionId = "other-session";
    const { fixtureIntegrityHash: _receiptHash, ...receiptContent } =
      changedReceipt;
    changedReceipt.fixtureIntegrityHash = hashBoundaryMapValue(receiptContent);

    await expect(
      verifySampleBoundaryFixtureIntegrity(changedReceipt),
    ).rejects.toThrow(/authority/u);
  });

  it("rejects structurally malformed fixture input inside the caught verifier", async () => {
    await expect(
      verifySampleBoundaryFixtureIntegrity({ schemaVersion: "1" }),
    ).rejects.toThrow();
  });
});
