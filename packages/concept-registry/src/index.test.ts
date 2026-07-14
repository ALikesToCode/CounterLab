import { describe, expect, it } from "vitest";

import type { ArtifactManifest } from "@counterlab/contracts";

import {
  getConceptPack,
  releasedConceptPacks,
  routeArtifactConcept,
} from "./index.js";

function manifest(overrides: Partial<ArtifactManifest> = {}): ArtifactManifest {
  return {
    artifactId: "artifact_live_1",
    fileName: "uploaded.ipynb",
    fileSha256: "a".repeat(64),
    nbformat: 4,
    support: { status: "SUPPORTED", reasons: [] },
    cells: [
      {
        index: 2,
        type: "code",
        sourceSha256: "b".repeat(64),
        sourceExcerpt: "X_train, X_test = train_test_split(X, test_size=0.25)",
        executionCount: 2,
        outputHashes: [],
        symbols: ["train_test_split"],
        metricCandidates: [],
      },
      {
        index: 4,
        type: "code",
        sourceSha256: "c".repeat(64),
        sourceExcerpt: "print(f'Accuracy: {accuracy:.4f}')",
        executionCount: 4,
        outputHashes: ["d".repeat(64)],
        symbols: ["accuracy_score"],
        metricCandidates: [{ name: "accuracy", value: 0.985, outputIndex: 0 }],
      },
    ],
    schemaSummary: {
      fields: [
        {
          name: "account_key",
          inferredType: "categorical",
          privacyClass: "entity_identifier",
        },
        {
          name: "cancelled",
          inferredType: "binary",
          privacyClass: "target",
        },
      ],
      rowCount: 1800,
      entityCandidates: ["account_key"],
      targetCandidates: ["cancelled"],
    },
    packageHints: ["sklearn"],
    createdAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("concept-pack registry", () => {
  it("routes a supported leakage notebook using evidence rather than column names", () => {
    const decision = routeArtifactConcept(manifest());
    expect(decision).toMatchObject({
      kind: "selected",
      concept: "entity_leakage",
      confidence: expect.any(Number),
    });
    if (decision.kind !== "selected") throw new Error("expected selection");
    expect(decision.evidence.some((ref) => ref.cellIndex === 2)).toBe(true);
    expect(decision.evidence.some((ref) => ref.outputIndex === 0)).toBe(true);
  });

  it("distinguishes insufficient evidence from unsupported artifacts", () => {
    const insufficient = routeArtifactConcept(
      manifest({ cells: [], schemaSummary: manifest().schemaSummary }),
    );
    expect(insufficient).toMatchObject({ kind: "insufficient_evidence" });

    const unsupported = routeArtifactConcept(
      manifest({
        support: {
          status: "UNSUPPORTED",
          reasons: [{ code: "UNSUPPORTED_MAGIC", message: "Shell magic" }],
        },
      }),
    );
    expect(unsupported).toMatchObject({
      kind: "unsupported_artifact",
      reasons: [expect.objectContaining({ code: "UNSUPPORTED_MAGIC" })],
    });
  });

  it("advertises only packs that are release ready", () => {
    expect(releasedConceptPacks().map((pack) => pack.id)).toEqual([
      "entity_leakage",
    ]);
    expect(getConceptPack("entity_leakage").allowedOperations).toContain(
      "leakage.group_holdout",
    );
  });
});
