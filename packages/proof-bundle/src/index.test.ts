import { describe, expect, it } from "vitest";

import type { ProofBundleDraft } from "./index.js";
import {
  canonicalJson,
  createEvidenceEvent,
  createProofBundle,
  exportProofBundle,
  hashCanonicalJson,
  reconstructReplay,
  validateProofBundle,
  verifyEvidenceChain,
} from "./index.js";

const digest = (character: string) => character.repeat(64);

function eventInput(sequence: number, previousEventHash?: string) {
  return {
    eventId: `event_${sequence}`,
    sessionId: "session_1",
    sequence,
    timestamp: `2026-07-14T10:0${sequence}:00.000Z`,
    actor: "system" as const,
    kind: sequence === 1 ? "session.created" : "prediction.committed",
    inputHashes: sequence === 1 ? [] : [digest("a")],
    outputHashes: [digest(sequence === 1 ? "a" : "b")],
    payload:
      sequence === 1
        ? { state: "INGESTED", nested: { z: 2, a: 1 } }
        : { state: "PREDICTION_COMMITTED", choice: "accuracy remains high" },
    ...(previousEventHash === undefined ? {} : { previousEventHash }),
  };
}

function chain() {
  const first = createEvidenceEvent(eventInput(1));
  const second = createEvidenceEvent({
    ...eventInput(2, first.eventHash),
    outputHashes: [
      digest("b"),
      digest("f"),
      digest("3"),
      digest("4"),
      digest("6"),
      digest("7"),
    ],
  });
  return [first, second];
}

function draft(events = chain()): ProofBundleDraft {
  return {
    schemaVersion: "1",
    bundleId: "bundle_1",
    sessionId: "session_1",
    replayId: "leakage-01",
    createdAt: "2026-07-14T10:10:00.000Z",
    events,
    artifactManifest: {
      artifactId: "artifact_1",
      fileName: "customer_churn_leakage.ipynb",
      fileSha256: digest("1"),
      nbformat: 4,
      support: { status: "SUPPORTED", reasons: [] },
      cells: [],
      schemaSummary: {
        fields: [],
        entityCandidates: ["customer_id"],
        targetCandidates: ["churned"],
      },
      packageHints: ["sklearn"],
      createdAt: "2026-07-14T09:00:00.000Z",
    },
    beliefTest: {
      schemaVersion: "1",
      id: "belief_1",
      concept: "entity_leakage",
      learnerClaim: "The result proves new-customer generalization.",
      currentHypothesis: {
        statement: "Rows generalize",
        predictedOutcome: "Accuracy stays high",
      },
      competingHypothesis: {
        statement: "Identity leaks",
        predictedOutcome: "Accuracy drops",
      },
      evidenceRefs: [
        {
          kind: "learner_claim",
          hash: hashCanonicalJson(
            "The result proves new-customer generalization.",
          ),
          excerpt: "proves new-customer generalization",
          relevance: "Claim under test",
        },
      ],
      alternatives: [],
      decisiveIntervention: {
        id: "group-split",
        description: "Hold customers out",
        controlledVariables: ["model"],
        changedVariables: ["split"],
        discriminatesBecause: "Only leakage predicts the drop",
      },
      uncertainty: {
        confidence: 0.9,
        limitations: [],
        insufficientEvidence: false,
      },
      requiresLearnerConfirmation: true,
    },
    predictionContract: {
      schemaVersion: "1",
      id: "prediction_1",
      sessionId: "session_1",
      beliefTestId: "belief_1",
      choice: "Accuracy stays high",
      confidence: 80,
      committedAt: "2026-07-14T10:02:00.000Z",
      immutableHash: digest("3"),
    },
    experimentPlan: {
      schemaVersion: "1",
      concept: "entity_leakage",
      datasetAdapter: "customer_churn_v1",
      competingHypotheses: ["Rows generalize", "Identity leaks"],
      expectedDiscrimination: [
        {
          runId: "group_split",
          expectedUnderCurrent: "Accuracy remains high",
          expectedUnderCompeting: "Accuracy falls",
        },
      ],
      runs: [
        {
          id: "group_split",
          split: "group",
          groupBy: "customer_id",
          model: "logistic_regression",
          seed: 1729,
        },
      ],
      metrics: ["accuracy"],
      views: ["comparison"],
      invariants: ["zero_group_overlap"],
      resourceLimits: {
        wallSeconds: 30,
        memoryMb: 512,
        maxProcesses: 4,
        maxFiles: 16,
        maxOutputBytes: 1048576,
      },
    },
    generatedAdapter: { sha256: digest("4"), commitHash: digest("5") },
    publicTests: {
      passed: 3,
      failed: 0,
      command: "pytest public_tests.py",
      reportHash: digest("6"),
    },
    externalVerifier: {
      status: "VERIFIED",
      verifiedInvariants: ["zero_group_overlap"],
      mutations: ["group-overlap-leak"],
      reportHash: digest("7"),
    },
    verifiedResultSet: {
      schemaVersion: "1",
      concept: "entity_leakage",
      fixture: {
        customers: 480,
        rows: 2880,
        sha256: digest("8"),
        targetRate: 0.49,
      },
      kernelVersion: "0.1.0",
      seed: 1729,
      runs: [
        {
          id: "group_split",
          splitStrategy: "group",
          groupBy: "customer_id",
          dropFeatures: [],
          model: "logistic_regression",
          seed: 1729,
          inputFingerprint: digest("8"),
          featureSetFingerprint: digest("9"),
          metrics: { accuracy: 0.59, rocAuc: 0.64 },
          sampleSizes: { train: 2160, test: 720 },
          entityCounts: { train: 360, test: 120 },
          entityOverlap: { count: 0, rate: 0 },
        },
      ],
      chartData: [
        {
          runId: "group_split",
          splitStrategy: "group",
          accuracy: 0.59,
          rocAuc: 0.64,
          sampleSize: 720,
          seed: 1729,
        },
      ],
      resultHash: digest("a"),
    },
    learnerRevision: {
      text: "Evaluation must hold out the entity that will be new at deployment.",
      recordedAt: "2026-07-14T10:06:00.000Z",
      eventHash: events[events.length - 1]!.eventHash,
    },
    transferResult: {
      schemaVersion: "1",
      id: "transfer_1",
      sessionId: "session_1",
      taskId: "forecast-future-leakage-v1",
      outcome: "PASSED",
      selectedStrategy: "time_ordered_holdout",
      identifiedRisks: ["future_feature"],
      evidenceChoices: ["feature created after prediction time"],
      checks: [
        {
          invariant: "time_ordered_split",
          passed: true,
          evidence: "train < test",
        },
      ],
      evaluatorVersion: "1.0.0",
      evaluatedAt: "2026-07-14T10:07:00.000Z",
      resultHash: digest("b"),
    },
    patchResult: {
      schemaVersion: "1",
      id: "patch_1",
      sessionId: "session_1",
      status: "VERIFIED",
      sourceArtifactHash: digest("1"),
      patchedArtifactHash: digest("c"),
      patchHash: digest("d"),
      modifiedCells: [3],
      diff: "@@ cell 3 @@",
      verification: {
        passed: true,
        invariants: ["zero_group_overlap", "unrelated_cells_unchanged"],
        unchangedCellHashes: [digest("e")],
      },
      generatedAt: "2026-07-14T10:08:00.000Z",
      resultHash: digest("f"),
    },
    reasoningDiff: {
      schemaVersion: "1",
      id: "diff_1",
      sessionId: "session_1",
      dimensions: {
        belief: {
          before: "Rows generalize",
          after: "Entities must be held out",
        },
        prediction: { before: "Accuracy remains high", after: "Accuracy fell" },
        code: { before: "Random split", after: "Group split" },
        transfer: { before: "Random forecasting split", after: "Time holdout" },
      },
      evidenceEventHashes: events.map((event) => event.eventHash),
      issuedAt: "2026-07-14T10:09:00.000Z",
    },
    versions: {
      environment: "node-22/python-3.14",
      dependencies: "lockfile-sha256:abc",
      fixture: "leakage-v1",
      kernel: "0.1.0",
      verifier: "0.1.0",
      prompt: "belief-v1",
      model: "stored-replay",
      template: "leakage-template-v1",
    },
    limitations: ["Synthetic fixture; no global mastery claim."],
    reproductionCommands: ["./scripts/reproduce-session.sh leakage-01"],
  };
}

describe("canonical evidence hashing", () => {
  it("produces stable JSON and event hashes regardless of object key insertion order", () => {
    expect(canonicalJson({ z: -0, a: { y: 2, x: 1 } })).toBe(
      '{"a":{"x":1,"y":2},"z":0}',
    );

    const first = createEvidenceEvent(eventInput(1));
    const reordered = createEvidenceEvent({
      payload: { nested: { a: 1, z: 2 }, state: "INGESTED" },
      outputHashes: [digest("a")],
      inputHashes: [],
      kind: "session.created",
      actor: "system",
      timestamp: "2026-07-14T10:01:00.000Z",
      sequence: 1,
      sessionId: "session_1",
      eventId: "event_1",
    });

    expect(reordered.eventHash).toBe(first.eventHash);
  });

  it("detects payload tampering", () => {
    const events = chain();
    const tampered = structuredClone(events);
    tampered[0]!.payload = { state: "LAB_VERIFIED" };

    expect(() => verifyEvidenceChain(tampered)).toThrow(/hash/i);
  });

  it("enforces sequence and previous-hash links", () => {
    const events = chain();
    expect(verifyEvidenceChain(events).headHash).toBe(events[1]!.eventHash);

    const missingLink = createEvidenceEvent(eventInput(2));
    expect(() => verifyEvidenceChain([events[0]!, missingLink])).toThrow(
      /previous/i,
    );

    const skipped = createEvidenceEvent({
      ...eventInput(3, events[0]!.eventHash),
      sequence: 3,
    });
    expect(() => verifyEvidenceChain([events[0]!, skipped])).toThrow(
      /sequence/i,
    );
  });
});

describe("replay reconstruction", () => {
  it("reconstructs an equivalent deterministic timeline from persisted events", () => {
    const events = chain();
    const original = reconstructReplay(events);
    const persisted = JSON.parse(canonicalJson(events)) as typeof events;
    const restored = reconstructReplay(persisted);

    expect(restored).toEqual(original);
    expect(restored.latestPayloadByKind["prediction.committed"]).toEqual(
      events[1]!.payload,
    );
    expect(restored.timeline.map((event) => event.kind)).toEqual([
      "session.created",
      "prediction.committed",
    ]);
  });

  it("stores event kinds without allowing prototype-key collisions", () => {
    const event = createEvidenceEvent({
      ...eventInput(1),
      kind: "__proto__",
    });

    const replay = reconstructReplay([event]);
    expect(Object.getPrototypeOf(replay.latestPayloadByKind)).toBeNull();
    expect(replay.latestPayloadByKind["__proto__"]).toEqual(event.payload);
  });
});

describe("Proof Bundle integrity", () => {
  it("labels unsigned output integrity-hashed and detects content tampering", () => {
    const bundle = createProofBundle(draft());

    expect(bundle.integrity.mode).toBe("integrity-hashed");
    expect(bundle.integrity.algorithm).toBe("sha256");
    expect(validateProofBundle(bundle)).toEqual(bundle);
    expect(exportProofBundle(bundle).endsWith("\n")).toBe(true);

    const tampered = structuredClone(bundle);
    tampered.limitations = ["Tampered limitation"];
    expect(() => validateProofBundle(tampered)).toThrow(/content hash/i);
  });

  it("distinguishes an HMAC-signed bundle and requires the matching key", () => {
    const bundle = createProofBundle(draft(), { signingKey: "local-test-key" });

    expect(bundle.integrity.mode).toBe("hmac-signed");
    expect(bundle.integrity.algorithm).toBe("hmac-sha256");
    expect(bundle.integrity.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(
      validateProofBundle(bundle, { signingKey: "local-test-key" }),
    ).toEqual(bundle);
    expect(() => validateProofBundle(bundle)).toThrow(/signing key/i);
    expect(() =>
      validateProofBundle(bundle, { signingKey: "wrong-key" }),
    ).toThrow(/signature/i);
  });

  it("treats signing keys as exact secret bytes", () => {
    const bundle = createProofBundle(draft(), {
      signingKey: " local-test-key ",
    });

    expect(
      validateProofBundle(bundle, { signingKey: " local-test-key " }),
    ).toEqual(bundle);
    expect(() =>
      validateProofBundle(bundle, { signingKey: "local-test-key" }),
    ).toThrow(/signature/i);
  });

  it("rejects a signed bundle that was downgraded to an unsigned integrity label", () => {
    const signed = createProofBundle(draft(), { signingKey: "local-test-key" });
    const downgraded = {
      ...signed,
      integrity: {
        mode: "integrity-hashed" as const,
        algorithm: "sha256" as const,
        contentHash: signed.integrity.contentHash,
        eventChainHead: signed.integrity.eventChainHead,
      },
    };

    expect(() =>
      validateProofBundle(downgraded, { signingKey: "local-test-key" }),
    ).toThrow(/signed|signature/i);
  });

  it("rejects mixed artifact or concept lineage", () => {
    const wrongArtifact = draft();
    wrongArtifact.patchResult.sourceArtifactHash = digest("0");
    expect(() => createProofBundle(wrongArtifact)).toThrow(/source artifact/i);

    const wrongConcept = draft();
    wrongConcept.experimentPlan.concept = "class_imbalance";
    expect(() => createProofBundle(wrongConcept)).toThrow(/concept/i);
  });

  it("rejects unresolved Belief Test evidence and unchained result hashes", () => {
    const unresolvedEvidence = draft();
    unresolvedEvidence.beliefTest.evidenceRefs[0]!.hash = digest("0");
    expect(() => createProofBundle(unresolvedEvidence)).toThrow(/evidence/i);

    const unchainedResult = draft();
    unchainedResult.verifiedResultSet.resultHash = digest("0");
    expect(() => createProofBundle(unchainedResult)).toThrow(/event chain/i);
  });
});
