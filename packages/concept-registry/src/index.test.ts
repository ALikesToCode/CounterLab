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

function imbalanceManifest(
  overrides: Partial<ArtifactManifest> = {},
): ArtifactManifest {
  return manifest({
    cells: [
      {
        index: 2,
        type: "code",
        sourceSha256: "e".repeat(64),
        sourceExcerpt:
          "positive_rate = y.mean()\nX_train, X_test = train_test_split(X, y, stratify=y)",
        executionCount: 2,
        outputHashes: ["f".repeat(64)],
        symbols: ["train_test_split", "value_counts", "stratify"],
        metricCandidates: [
          { name: "positive_rate", value: 0.035, outputIndex: 0 },
        ],
      },
      {
        index: 4,
        type: "code",
        sourceSha256: "1".repeat(64),
        sourceExcerpt:
          "print(accuracy_score(y_test, predictions))\nprint(classification_report(y_test, predictions))",
        executionCount: 4,
        outputHashes: ["2".repeat(64)],
        symbols: ["accuracy_score", "classification_report"],
        metricCandidates: [{ name: "accuracy", value: 0.965, outputIndex: 0 }],
      },
    ],
    schemaSummary: {
      fields: [
        {
          name: "is_defective",
          inferredType: "binary",
          privacyClass: "target",
        },
      ],
      rowCount: 4_000,
      entityCandidates: [],
      targetCandidates: ["is_defective"],
    },
    ...overrides,
  });
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

  it("routes rare-event metric evidence to the class-imbalance pack", () => {
    const decision = routeArtifactConcept(imbalanceManifest());

    expect(decision).toMatchObject({
      kind: "selected",
      concept: "class_imbalance",
      conceptPackVersion: "1.0.0",
    });
    if (decision.kind !== "selected") throw new Error("expected selection");
    expect(decision.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cellIndex: 2, outputIndex: 0 }),
        expect.objectContaining({ cellIndex: 4, outputIndex: 0 }),
      ]),
    );
  });

  it("requires a learner choice when leakage and imbalance evidence both resolve", () => {
    const ambiguous = imbalanceManifest({
      schemaSummary: {
        ...imbalanceManifest().schemaSummary,
        entityCandidates: ["machine_id"],
      },
    });
    const decision = routeArtifactConcept(ambiguous);

    expect(decision).toMatchObject({ kind: "choice_required" });
    if (decision.kind !== "choice_required") throw new Error("expected choice");
    expect(decision.candidates.map((candidate) => candidate.concept)).toEqual([
      "entity_leakage",
      "class_imbalance",
    ]);
  });

  it("does not infer imbalance from accuracy without rare-event evidence", () => {
    const artifact = imbalanceManifest({
      cells: [
        {
          index: 2,
          type: "code",
          sourceSha256: "3".repeat(64),
          sourceExcerpt: "train_test_split(X, y)",
          executionCount: 2,
          outputHashes: ["4".repeat(64)],
          symbols: ["train_test_split", "accuracy_score"],
          metricCandidates: [{ name: "accuracy", value: 0.96, outputIndex: 0 }],
        },
      ],
    });

    expect(routeArtifactConcept(artifact)).toMatchObject({
      kind: "insufficient_evidence",
      candidates: ["class_imbalance"],
    });
  });

  it("does not treat class-specific reporting as proof that a class is rare", () => {
    const artifact = imbalanceManifest({
      cells: [
        {
          index: 2,
          type: "code",
          sourceSha256: "5".repeat(64),
          sourceExcerpt:
            "X_train, X_test = train_test_split(X, y, stratify=y)\nclassification_report(y_test, predictions)",
          executionCount: 2,
          outputHashes: ["6".repeat(64)],
          symbols: [
            "train_test_split",
            "accuracy_score",
            "classification_report",
          ],
          metricCandidates: [{ name: "accuracy", value: 0.81, outputIndex: 0 }],
        },
      ],
    });

    expect(routeArtifactConcept(artifact)).toMatchObject({
      kind: "insufficient_evidence",
      candidates: ["class_imbalance"],
    });
  });

  it("routes explicit rare-class context with displayed class-specific metrics", () => {
    const artifact = imbalanceManifest({
      cells: [
        {
          index: 0,
          type: "markdown",
          sourceSha256: "7".repeat(64),
          sourceExcerpt:
            "The positive class is uncommon, so accuracy can hide minority failures.",
          outputHashes: [],
          symbols: [],
          metricCandidates: [],
        },
        {
          index: 2,
          type: "code",
          sourceSha256: "8".repeat(64),
          sourceExcerpt:
            "train_test_split(X, y, stratify=y)\nclassification_report(y_test, predictions)",
          executionCount: 2,
          outputHashes: ["9".repeat(64)],
          symbols: ["train_test_split", "f1_score"],
          metricCandidates: [
            { name: "precision", value: 0.61, outputIndex: 0 },
            { name: "recall", value: 0.37, outputIndex: 0 },
            { name: "f1_score", value: 0.46, outputIndex: 0 },
          ],
        },
      ],
    });

    expect(routeArtifactConcept(artifact)).toMatchObject({
      kind: "selected",
      concept: "class_imbalance",
    });
  });

  it("advertises only packs that are release ready", () => {
    expect(releasedConceptPacks().map((pack) => pack.id)).toEqual([
      "entity_leakage",
      "class_imbalance",
    ]);
    expect(getConceptPack("entity_leakage").allowedOperations).toContain(
      "leakage.group_holdout",
    );
    expect(getConceptPack("class_imbalance").allowedOperations).toContain(
      "imbalance.prevalence_sweep",
    );
  });

  it("binds each transfer contract to its fixed evaluator task", () => {
    expect(getConceptPack("entity_leakage").transferTask).toEqual({
      id: "forecast-future-leakage-v1",
      evaluatorTaskId: "forecasting-future-leakage-01",
      title: "Choose an evaluation boundary that cannot see the future",
    });
    expect(getConceptPack("class_imbalance").transferTask).toEqual({
      id: "manufacturing-rare-defect-v1",
      evaluatorTaskId: "manufacturing-defect-transfer-01",
      title: "Choose evidence for a rare manufacturing defect alert",
    });
  });

  it("publishes fixed experiment-selection authority for every released pack", () => {
    const leakage = getConceptPack("entity_leakage").scientificMethod;
    expect(leakage.candidateExperimentIds).toEqual([
      "group-holdout",
      "group-holdout-plus-ablation",
    ]);
    expect(leakage.scoringPolicy).toMatchObject({
      concept: "entity_leakage",
      requiredOperationIds: [
        "leakage.random_row_split",
        "leakage.group_holdout",
        "leakage.identity_ablation",
      ],
      requiredObservableIds: ["accuracy", "entity_overlap_rate"],
    });

    const imbalance = getConceptPack("class_imbalance").scientificMethod;
    expect(imbalance.scoringPolicy).toMatchObject({
      concept: "class_imbalance",
      requiredOperationIds: [
        "imbalance.majority_baseline",
        "imbalance.stratified_holdout",
        "imbalance.threshold_sweep",
        "imbalance.prevalence_sweep",
      ],
      requiredObservableIds: ["recall", "confusion_matrix", "prevalence"],
    });
    for (const pack of releasedConceptPacks()) {
      expect(pack.scientificMethod.scoringPolicy.concept).toBe(pack.id);
      expect(
        pack.scientificMethod.scoringPolicy.allowedOperationIds.every(
          (operation) => pack.allowedOperations.includes(operation),
        ),
      ).toBe(true);
      expect(
        pack.scientificMethod.scoringPolicy.allowedObservableIds.every(
          (metric) => pack.allowedMetrics.includes(metric),
        ),
      ).toBe(true);
      expect(pack.scientificMethod.epistemic.policy).toMatchObject({
        schemaVersion: "1",
        concept: pack.id,
        verifierVersion: "epistemic-verifier-v1",
      });
      expect(pack.scientificMethod.epistemic.policy.approvedClaims).toEqual(
        pack.approvedClaims,
      );
      expect(pack.scientificMethod.epistemic.policy.forbiddenClaims).toEqual(
        pack.forbiddenClaims,
      );
      expect(pack.scientificMethod.defaultPresentation).toMatchObject({
        scope: pack.scientificMethod.epistemic.policy.allowedScopes[0],
        learnerFacingClaims: [
          pack.scientificMethod.epistemic.policy.approvedClaims[1],
        ],
      });
    }
  });

  it("registers the exact fixed fixture that supplies each pack's numeric inputs", () => {
    expect(getConceptPack("entity_leakage").fixedFixture).toEqual({
      id: "public-leakage-v1",
      version: "leakage-fixture-v1",
      contentSha256:
        "5c482f39e4e948a92dab61bf9c9f5c6577fbe9fc688fd597c9fefd785ee1be70",
    });
    expect(getConceptPack("class_imbalance").fixedFixture).toEqual({
      id: "public-imbalance-v1",
      version: "imbalance-fixture-v1",
      contentSha256:
        "7974fe5744c4f9f2e8a31817791dac09ba9efb17cc88a4aa3383ae333e92ad7f",
    });
    expect(getConceptPack("entity_leakage").fixedResultAuthority).toEqual({
      concept: "entity_leakage",
      kernelVersion: "0.1.0",
      fixture: {
        sha256:
          "5c482f39e4e948a92dab61bf9c9f5c6577fbe9fc688fd597c9fefd785ee1be70",
        rows: 2880,
        customers: 480,
        targetRate: 0.497569444444,
      },
    });
    expect(getConceptPack("class_imbalance").fixedResultAuthority).toEqual({
      concept: "class_imbalance",
      kernelVersion: "0.1.0",
      fixture: {
        sha256:
          "7974fe5744c4f9f2e8a31817791dac09ba9efb17cc88a4aa3383ae333e92ad7f",
        rows: 6000,
        positives: 65,
        prevalence: 0.010833333333,
      },
    });
    for (const pack of releasedConceptPacks()) {
      expect(pack.fixedFixture.id).toContain(
        pack.id === "entity_leakage" ? "leakage" : "imbalance",
      );
      expect(pack.fixedFixture.contentSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(Object.isFrozen(pack.fixedFixture)).toBe(true);
      expect(pack.fixedResultAuthority.concept).toBe(pack.id);
      expect(pack.fixedResultAuthority.fixture.sha256).toBe(
        pack.fixedFixture.contentSha256,
      );
      expect(Object.isFrozen(pack.fixedResultAuthority)).toBe(true);
      expect(Object.isFrozen(pack.fixedResultAuthority.fixture)).toBe(true);
    }
  });

  it("deep-freezes every released authority graph", () => {
    for (const pack of releasedConceptPacks()) {
      expect(Object.isFrozen(pack)).toBe(true);
      expect(Object.isFrozen(pack.scientificMethod)).toBe(true);
      expect(Object.isFrozen(pack.scientificMethod.scoringPolicy)).toBe(true);
      expect(Object.isFrozen(pack.scientificMethod.epistemic)).toBe(true);
      expect(Object.isFrozen(pack.scientificMethod.epistemic.policy)).toBe(
        true,
      );
      expect(
        Object.isFrozen(pack.scientificMethod.epistemic.policy.approvedClaims),
      ).toBe(true);
      expect(() => {
        (
          pack.scientificMethod.epistemic.policy.approvedClaims as string[]
        ).push("Untrusted widened claim");
      }).toThrow();
    }
  });
});
