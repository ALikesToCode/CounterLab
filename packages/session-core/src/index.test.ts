import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { migrateBeliefTestV1ToV2 } from "@counterlab/contracts";
import { verifyEvidenceChain } from "../../proof-bundle/src/index.js";

import {
  InvalidSessionTransitionError,
  normalizeSessionMode,
  PredictionAlreadyCommittedError,
  SessionService,
} from "./index.js";
import { SqliteSessionRepository } from "./sqlite-repository.js";

const HASH = "a".repeat(64);

const beliefTest = {
  schemaVersion: "1",
  id: "belief-1",
  concept: "entity_leakage",
  learnerClaim:
    "The 99% accuracy proves this model generalizes to new customers.",
  currentHypothesis: {
    statement: "Random row accuracy measures new-customer generalization.",
    predictedOutcome: "Group-split accuracy stays near random-split accuracy.",
  },
  competingHypothesis: {
    statement: "Customer identity leaks across the row split.",
    predictedOutcome: "Group-split accuracy falls and overlap becomes zero.",
  },
  evidenceRefs: [
    {
      cellIndex: 3,
      outputIndex: 0,
      kind: "metric",
      hash: HASH,
      excerpt: "accuracy=0.99",
      relevance: "The displayed result uses a row split.",
    },
  ],
  alternatives: [],
  decisiveIntervention: {
    id: "group-split",
    description: "Hold out complete customers.",
    controlledVariables: ["model", "seed"],
    changedVariables: ["split strategy"],
    discriminatesBecause:
      "Only the competing hypothesis predicts a material fall.",
  },
  uncertainty: {
    confidence: 0.9,
    limitations: [],
    insufficientEvidence: false,
  },
  requiresLearnerConfirmation: true,
} as const;

const prediction = {
  schemaVersion: "1",
  id: "prediction-1",
  sessionId: "session-1",
  beliefTestId: "belief-1",
  choice: "accuracy remains above 0.9",
  confidence: 80,
  committedAt: "2026-07-14T04:00:03.000Z",
  immutableHash: "b".repeat(64),
};

const resultSet = {
  schemaVersion: "1",
  concept: "entity_leakage",
  fixture: {
    customers: 300,
    rows: 1200,
    sha256: "c".repeat(64),
    targetRate: 0.45,
  },
  kernelVersion: "1.0.0",
  seed: 1729,
  runs: [
    {
      id: "group_split",
      splitStrategy: "group",
      groupBy: "customer_id",
      dropFeatures: ["customer_id"],
      model: "logistic_regression",
      seed: 1729,
      inputFingerprint: "d".repeat(64),
      featureSetFingerprint: "e".repeat(64),
      metrics: { accuracy: 0.68, rocAuc: 0.7 },
      sampleSizes: { train: 900, test: 300 },
      entityCounts: { train: 225, test: 75 },
      entityOverlap: { count: 0, rate: 0 },
    },
  ],
  chartData: [
    {
      runId: "group_split",
      splitStrategy: "group",
      accuracy: 0.68,
      rocAuc: 0.7,
      sampleSize: 300,
      seed: 1729,
    },
  ],
  resultHash: "c".repeat(64),
};

const hostedResultSet = {
  ...resultSet,
  schemaVersion: "2",
  planId: "plan-v5-1",
  sessionId: "session-1",
  artifactManifestHash: "1".repeat(64),
  conceptPackVersion: "2.0.0",
  runs: resultSet.runs.map((run) => ({
    ...run,
    operation: "leakage.group_holdout",
    pipelineFingerprint: "f".repeat(64),
  })),
  resultHash: "6".repeat(64),
} as const;

const supportsVerdict = {
  schemaVersion: "1",
  kind: "SUPPORTS",
  hypothesisId: "competing",
  scope: "unseen customers in the documented fixture",
  resultHash: hostedResultSet.resultHash,
  irHash: "7".repeat(64),
  technicalReportHash: "8".repeat(64),
  verifierVersion: "epistemic-verifier-v1",
} as const;

const inconclusiveVerdict = {
  schemaVersion: "1",
  kind: "INCONCLUSIVE",
  reasonCode: "GAP_WITHIN_TOLERANCE",
  scope: "unseen customers in the documented fixture",
  resultHash: hostedResultSet.resultHash,
  irHash: "7".repeat(64),
  technicalReportHash: "8".repeat(64),
  verifierVersion: "epistemic-verifier-v1",
} as const;

const rejectedVerdict = {
  schemaVersion: "1",
  kind: "REJECTED",
  findingIds: ["finding_001"],
  resultReleased: false,
  irHash: "7".repeat(64),
  technicalReportHash: "8".repeat(64),
  verifierVersion: "epistemic-verifier-v1",
} as const;

const EPISTEMIC_REPORT_HASH = "9".repeat(64);

const passingTransfer = {
  schemaVersion: "1",
  id: "transfer-1",
  sessionId: "session-1",
  taskId: "future-leakage-forecasting",
  outcome: "PASSED",
  selectedStrategy: "time_split",
  identifiedRisks: ["future_information"],
  evidenceChoices: ["timestamp ordering"],
  checks: [
    {
      invariant: "time_split_selected",
      passed: true,
      evidence: "Training rows precede evaluation rows.",
    },
  ],
  evaluatorVersion: "1.0.0",
  evaluatedAt: "2026-07-14T04:00:11.000Z",
  resultHash: "d".repeat(64),
};

const failingTransfer = {
  ...passingTransfer,
  outcome: "FAILED",
  selectedStrategy: "random_split",
  checks: [
    {
      invariant: "time_split_selected",
      passed: false,
      evidence: "Random rows mix future observations into training.",
    },
  ],
  resultHash: "e".repeat(64),
};

const artifactManifest = {
  artifactId: "artifact-1",
  fileName: "customer-churn.ipynb",
  fileSha256: "1".repeat(64),
  nbformat: 4,
  support: { status: "SUPPORTED", reasons: [] },
  cells: [],
  schemaSummary: {
    fields: [],
    rowCount: 1200,
    entityCandidates: ["customer_id"],
    targetCandidates: ["churned"],
  },
  packageHints: ["sklearn"],
  createdAt: "2026-07-14T04:00:00.000Z",
} as const;

const experimentPlan = {
  schemaVersion: "1",
  concept: "entity_leakage",
  datasetAdapter: "customer_churn_v1",
  competingHypotheses: ["Rows generalize", "Customer identity leaks"],
  expectedDiscrimination: [
    {
      runId: "group_split",
      expectedUnderCurrent: "Accuracy stays high",
      expectedUnderCompeting: "Accuracy falls materially",
    },
  ],
  runs: [
    {
      id: "group_split",
      split: "group",
      groupBy: "customer_id",
      dropFeatures: ["customer_id"],
      model: "logistic_regression",
      seed: 1729,
    },
  ],
  metrics: ["accuracy"],
  views: ["metric_comparison"],
  invariants: ["zero_group_overlap"],
  resourceLimits: {
    wallSeconds: 30,
    memoryMb: 512,
    maxProcesses: 4,
    maxFiles: 16,
    maxOutputBytes: 1048576,
  },
} as const;

class DeterministicIds {
  private next = 0;

  id = (prefix: string) => `${prefix}-${++this.next}`;
  now = () =>
    new Date(`2026-07-14T04:00:${String(this.next).padStart(2, "0")}.000Z`);
}

function memoryService() {
  const ids = new DeterministicIds();
  const repository = new SqliteSessionRepository(":memory:");
  return {
    repository,
    service: new SessionService(repository, { id: ids.id, now: ids.now }),
  };
}

async function throughExperiment(service: SessionService) {
  await service.createSession({
    id: "session-1",
    artifactId: "artifact-1",
    mode: { kind: "sample_lesson", sampleId: "leakage-01" },
  });
  await service.proposeBeliefTest("session-1", beliefTest);
  await service.confirmBeliefTest("session-1");
  await service.commitPrediction("session-1", prediction);
  await service.startLabCompilation("session-1");
  await service.verifyLab("session-1", { verifierRunId: "verify-1" });
  await service.recordExperimentResult("session-1", resultSet);
}

async function throughVerifiedLab(service: SessionService) {
  await service.createSession({
    id: "session-1",
    artifactId: "artifact-1",
    mode: { kind: "live_notebook" },
  });
  await service.proposeBeliefTest("session-1", beliefTest);
  await service.confirmBeliefTest("session-1");
  await service.commitPrediction("session-1", prediction);
  await service.startLabCompilation("session-1");
  await service.verifyLab("session-1", { verifierRunId: "verify-v5-1" });
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("SessionService state machine", () => {
  it("persists v2 as the single belief authority and records learner decisions", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    const beliefSpec = {
      ...migrateBeliefTestV1ToV2(beliefTest),
      alternatives: [
        {
          id: "distribution-shift",
          label: "Distribution shift",
          statement: "Deployment data differs from the notebook split.",
          rationale: "A shifted period could also change the score.",
          conditions: ["Training and deployment periods differ."],
          nonClaims: ["This alternative is not yet a verified explanation."],
          evidence: beliefTest.evidenceRefs,
          supportedCandidateExperimentIds: [],
        },
      ],
    } as const;

    await service.proposeBeliefSpecV2("session-1", beliefSpec);
    let current = await service.getSession("session-1");
    expect(current.beliefTest).toBeUndefined();
    expect(current.beliefSpec).toMatchObject({
      id: "belief-1",
      learnerDecision: "UNDECIDED",
    });

    await service.selectBeliefAlternative("session-1", "distribution-shift");
    current = await service.getSession("session-1");
    expect(current.beliefSpec).toMatchObject({
      learnerDecision: "ALTERNATIVE_SELECTED",
      selectedAlternativeId: "distribution-shift",
    });

    await service.confirmBeliefTest("session-1");
    current = await service.getSession("session-1");
    expect(current.state).toBe("BELIEF_TEST_CONFIRMED");
    expect(current.beliefSpec).toMatchObject({
      learnerDecision: "ALTERNATIVE_SELECTED",
      selectedAlternativeId: "distribution-shift",
    });

    await service.commitPrediction("session-1", prediction);
    expect((await service.getSession("session-1")).prediction).toEqual(
      prediction,
    );

    const events = await service.listEvents("session-1");
    expect(events.map(({ kind }) => kind)).toEqual([
      "session.created",
      "belief_spec.proposed",
      "belief_spec.alternative_selected",
      "belief_spec.confirmed",
      "prediction.committed",
    ]);
    expect(
      events.find(({ kind }) => kind === "belief_spec.confirmed")?.payload,
    ).toEqual({ beliefSpecId: beliefSpec.id });
    repository.close();
  });

  it("does not let a v2 edit change belief identity or concept", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    const beliefSpec = migrateBeliefTestV1ToV2(beliefTest);
    await service.proposeBeliefSpecV2("session-1", beliefSpec);

    await expect(
      service.editBeliefSpecV2("session-1", {
        ...beliefSpec,
        id: "replacement-id",
        claim: "Edited claim",
      }),
    ).rejects.toThrow(/id/i);
    await expect(
      service.editBeliefSpecV2("session-1", {
        ...beliefSpec,
        concept: "class_imbalance",
      }),
    ).rejects.toThrow(/concept/i);

    expect((await service.getSession("session-1")).beliefSpec).toEqual(
      beliefSpec,
    );
    await service.editBeliefSpecV2("session-1", {
      ...beliefSpec,
      claim: "Edited claim with the same scientific scope.",
    });
    expect((await service.getSession("session-1")).beliefSpec).toMatchObject({
      claim: "Edited claim with the same scientific scope.",
      learnerDecision: "EDITED",
    });
    await service.confirmBeliefTest("session-1");
    expect((await service.getSession("session-1")).beliefSpec).toMatchObject({
      learnerDecision: "CONFIRMED",
    });
    repository.close();
  });

  it("normalizes legacy persisted modes but rejects them for new sessions", async () => {
    expect(normalizeSessionMode("instant")).toEqual({
      kind: "sample_lesson",
      sampleId: "leakage-01",
    });
    expect(normalizeSessionMode("live")).toEqual({ kind: "live_notebook" });
    expect(normalizeSessionMode("replay")).toEqual({
      kind: "verified_replay",
      replayId: "leakage-01",
    });

    const { service, repository } = memoryService();
    await expect(
      service.createSession({
        id: "legacy-mode-session",
        artifactId: "artifact-1",
        mode: "instant" as never,
      }),
    ).rejects.toThrow();
    repository.close();
  });

  it("rejects illegal transitions and never publishes a result before prediction", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });

    await expect(
      service.startLabCompilation("session-1"),
    ).rejects.toBeInstanceOf(InvalidSessionTransitionError);
    await expect(
      service.recordExperimentResult("session-1", resultSet),
    ).rejects.toBeInstanceOf(InvalidSessionTransitionError);
    expect(
      (await service.getSession("session-1")).verifiedResult,
    ).toBeUndefined();
    repository.close();
  });

  it("atomically persists a supported epistemic result, verdict, and report authority", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);

    const completed = await service.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });

    expect(completed).toMatchObject({
      state: "EXPERIMENT_COMPLETED",
      verifiedResult: hostedResultSet,
      evidenceVerdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    const event = (await service.listEvents("session-1")).at(-1);
    expect(event).toMatchObject({
      actor: "verifier",
      kind: "experiment.evidence_verified",
      payload: {
        verdict: "SUPPORTS",
        resultHash: hostedResultSet.resultHash,
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
      },
    });
    expect(verifyEvidenceChain(await service.listEvents("session-1"))).toEqual(
      expect.objectContaining({ valid: true }),
    );
    repository.close();
  });

  it("persists an inconclusive result as educational evidence", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);

    const completed = await service.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: inconclusiveVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });

    expect(completed.state).toBe("EXPERIMENT_COMPLETED");
    expect(completed.evidenceVerdict).toEqual(inconclusiveVerdict);
    expect(completed.verifiedResult).toEqual(hostedResultSet);
    repository.close();
  });

  it("rejects mismatched epistemic release authority without changing state", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);

    await expect(
      service.recordEpistemicResult("session-1", {
        result: hostedResultSet,
        verdict: { ...supportsVerdict, resultHash: "0".repeat(64) },
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
      }),
    ).rejects.toThrow(/result hash/i);
    expect(await service.getSession("session-1")).toMatchObject({
      state: "LAB_VERIFIED",
    });
    expect(
      (await service.getSession("session-1")).verifiedResult,
    ).toBeUndefined();
    repository.close();
  });

  it("records epistemic rejection without releasing a result", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);

    const rejected = await service.recordEpistemicRejection("session-1", {
      verdict: rejectedVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });

    expect(rejected).toMatchObject({
      state: "LAB_VERIFIED",
      evidenceVerdict: rejectedVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    expect(rejected.verifiedResult).toBeUndefined();
    expect((await service.listEvents("session-1")).at(-1)).toMatchObject({
      actor: "verifier",
      kind: "experiment.evidence_rejected",
      payload: {
        verdict: "REJECTED",
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
      },
    });
    repository.close();
  });

  it("supports edit, confirm, reject, and insufficient-evidence belief responses", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);

    const edited = { ...beliefTest, learnerClaim: "Edited claim" };
    await service.editBeliefTest("session-1", edited);
    expect((await service.getSession("session-1")).state).toBe(
      "BELIEF_TEST_PROPOSED",
    );
    expect((await service.getSession("session-1")).beliefTest).toEqual(edited);
    await service.confirmBeliefTest("session-1");
    expect((await service.getSession("session-1")).state).toBe(
      "BELIEF_TEST_CONFIRMED",
    );

    await service.createSession({
      id: "session-2",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-2", {
      ...beliefTest,
      id: "belief-2",
    });
    await service.rejectBeliefTest(
      "session-2",
      "Evidence does not match my claim",
    );
    expect((await service.getSession("session-2")).state).toBe(
      "REJECTED_BY_LEARNER",
    );

    await service.createSession({
      id: "session-3",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-3", {
      ...beliefTest,
      id: "belief-3",
      uncertainty: { ...beliefTest.uncertainty, insufficientEvidence: true },
    });
    await service.markInsufficientEvidence(
      "session-3",
      "No split code is visible",
    );
    expect((await service.getSession("session-3")).state).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    repository.close();
  });

  it("does not treat an edit as an initial Belief Test proposal", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });

    await expect(
      service.editBeliefTest("session-1", beliefTest),
    ).rejects.toBeInstanceOf(InvalidSessionTransitionError);
    expect((await service.getSession("session-1")).state).toBe("INGESTED");
    repository.close();
  });

  it("rejects schema-invalid domain payloads without advancing state", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });

    await expect(
      service.proposeBeliefTest("session-1", {
        ...beliefTest,
        evidenceRefs: [],
      }),
    ).rejects.toThrow();
    expect((await service.getSession("session-1")).state).toBe("INGESTED");
    expect(await service.listEvents("session-1")).toHaveLength(1);
    repository.close();
  });

  it("rejects every second prediction write", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);
    await service.confirmBeliefTest("session-1");
    await service.commitPrediction("session-1", prediction);

    await expect(
      service.commitPrediction("session-1", prediction),
    ).rejects.toBeInstanceOf(PredictionAlreadyCommittedError);
    expect((await service.getSession("session-1")).prediction).toEqual(
      prediction,
    );
    repository.close();
  });

  it("links authoritative contract hashes from evidence-event outputs", async () => {
    const { service, repository } = memoryService();
    await throughExperiment(service);

    const events = await service.listEvents("session-1");
    expect(
      events.find((event) => event.kind === "prediction.committed")
        ?.outputHashes,
    ).toContain(prediction.immutableHash);
    expect(
      events.find((event) => event.kind === "experiment.completed")
        ?.outputHashes,
    ).toContain(resultSet.resultHash);
    repository.close();
  });

  it("links verified compiler evidence without trusting malformed hashes", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);
    await service.confirmBeliefTest("session-1");
    await service.commitPrediction("session-1", prediction);
    await service.startLabCompilation("session-1");

    const adapterHash = "a".repeat(64);
    const verifierHash = "b".repeat(64);
    await service.verifyLab("session-1", { status: "VERIFIED" }, [
      adapterHash,
      verifierHash,
      adapterHash,
    ]);
    expect(
      (await service.listEvents("session-1")).at(-1)?.outputHashes,
    ).toEqual(expect.arrayContaining([adapterHash, verifierHash]));

    const second = memoryService();
    await second.service.createSession({
      id: "session-2",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await second.service.proposeBeliefTest("session-2", {
      ...beliefTest,
      id: "belief-2",
    });
    await second.service.confirmBeliefTest("session-2");
    await second.service.commitPrediction("session-2", {
      ...prediction,
      id: "prediction-2",
      sessionId: "session-2",
      beliefTestId: "belief-2",
    });
    await second.service.startLabCompilation("session-2");
    await expect(
      second.service.verifyLab("session-2", { status: "VERIFIED" }, [
        "not-a-hash",
      ]),
    ).rejects.toThrow(/SHA-256/);
    repository.close();
    second.repository.close();
  });

  it("prevents a rejected lab from producing results until it is compiled and verified again", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);
    await service.confirmBeliefTest("session-1");
    await service.commitPrediction("session-1", prediction);
    await service.startLabCompilation("session-1");
    await service.rejectLab("session-1", {
      invariant: "zero_group_overlap",
      observed: 12,
    });

    await expect(
      service.recordExperimentResult("session-1", resultSet),
    ).rejects.toThrow(/LAB_REJECTED/);
    await service.startLabCompilation("session-1");
    await service.verifyLab("session-1", { verifierRunId: "verify-2" });
    await service.recordExperimentResult("session-1", resultSet);
    expect((await service.getSession("session-1")).state).toBe(
      "EXPERIMENT_COMPLETED",
    );
    repository.close();
  });

  it("requires revision and a passing transfer before patch compilation", async () => {
    const { service, repository } = memoryService();
    await throughExperiment(service);

    await expect(service.startTransfer("session-1")).rejects.toBeInstanceOf(
      InvalidSessionTransitionError,
    );
    await service.recordRevision(
      "session-1",
      "Evaluation must keep each entity entirely inside one split.",
    );
    await service.startTransfer("session-1");
    await service.recordTransferResult("session-1", failingTransfer);
    await expect(
      service.startPatchCompilation("session-1"),
    ).rejects.toBeInstanceOf(InvalidSessionTransitionError);

    await service.startTransfer("session-1");
    await service.recordTransferResult("session-1", passingTransfer);
    expect(
      (await service.listEvents("session-1")).find(
        (event) => event.kind === "transfer.passed",
      )?.outputHashes,
    ).toContain(passingTransfer.resultHash);
    await service.startPatchCompilation("session-1");
    expect((await service.getSession("session-1")).state).toBe(
      "PATCH_COMPILING",
    );
    repository.close();
  });

  it("supports patch rejection, retry, verification, and Reasoning Diff issuance", async () => {
    const { service, repository } = memoryService();
    await throughExperiment(service);
    await service.recordRevision(
      "session-1",
      "Evaluation must keep each entity entirely inside one split.",
    );
    await service.startTransfer("session-1");
    await service.recordTransferResult("session-1", passingTransfer);
    await service.startPatchCompilation("session-1");
    await service.rejectPatch("session-1", {
      invariant: "unrelated_cells_unchanged",
    });
    await service.startPatchCompilation("session-1");

    const patchResult = {
      schemaVersion: "1",
      id: "patch-1",
      sessionId: "session-1",
      status: "VERIFIED",
      sourceArtifactHash: "2".repeat(64),
      patchedArtifactHash: "3".repeat(64),
      patchHash: "f".repeat(64),
      modifiedCells: [3],
      diff: "- train_test_split\n+ GroupShuffleSplit",
      verification: {
        passed: true,
        invariants: ["zero_group_overlap", "unrelated_cells_unchanged"],
        unchangedCellHashes: ["4".repeat(64)],
      },
      generatedAt: "2026-07-14T04:00:14.000Z",
      resultHash: "5".repeat(64),
    };
    await service.verifyPatch("session-1", patchResult);
    const eventsBeforeDiff = await service.listEvents("session-1");
    expect(
      eventsBeforeDiff.find((event) => event.kind === "patch.verified")
        ?.outputHashes,
    ).toEqual(
      expect.arrayContaining([
        patchResult.resultHash,
        patchResult.patchHash,
        patchResult.patchedArtifactHash,
      ]),
    );
    const reasoningDiff = {
      schemaVersion: "1",
      id: "reasoning-1",
      sessionId: "session-1",
      dimensions: {
        belief: {
          before: "Rows prove generalization",
          after: "Entities must be held out",
        },
        prediction: { before: "Accuracy stays high", after: "Accuracy fell" },
        code: { before: "Random row split", after: "Customer group split" },
        transfer: {
          before: "Random forecast split",
          after: "Time-aware split",
        },
      },
      evidenceEventHashes: eventsBeforeDiff.map((event) => event.eventHash),
      issuedAt: "2026-07-14T04:00:15.000Z",
    };
    const proofBundle = {
      schemaVersion: "1",
      bundleId: "bundle-1",
      sessionId: "session-1",
      replayId: "leakage-01",
      createdAt: "2026-07-14T04:00:15.000Z",
      events: eventsBeforeDiff,
      artifactManifest,
      beliefTest,
      predictionContract: prediction,
      experimentPlan,
      generatedAdapter: {
        sha256: "6".repeat(64),
        commitHash: "7".repeat(64),
      },
      publicTests: {
        passed: 3,
        failed: 0,
        command: "pytest public_tests.py",
        reportHash: "8".repeat(64),
      },
      externalVerifier: {
        status: "VERIFIED",
        verifiedInvariants: ["zero_group_overlap"],
        mutations: ["stale_metric_literal"],
        reportHash: "9".repeat(64),
      },
      verifiedResultSet: resultSet,
      learnerRevision: {
        text: "Evaluation must keep each entity entirely inside one split.",
        recordedAt: "2026-07-14T04:00:09.000Z",
        eventHash:
          eventsBeforeDiff.find((event) => event.kind === "revision.recorded")
            ?.eventHash ?? HASH,
      },
      transferResult: passingTransfer,
      patchResult,
      reasoningDiff,
      versions: {
        environment: "test",
        dependencies: "locked",
        fixture: "1.0.0",
        kernel: "1.0.0",
        verifier: "1.0.0",
        prompt: "1.0.0",
        model: "replay",
        template: "1.0.0",
      },
      limitations: ["Supports the documented notebook subset only."],
      reproductionCommands: ["./scripts/reproduce-session.sh leakage-01"],
      integrity: {
        mode: "integrity-hashed",
        algorithm: "sha256",
        contentHash: "a".repeat(64),
        eventChainHead: eventsBeforeDiff.at(-1)?.eventHash ?? HASH,
      },
    };
    await service.issueReasoningDiff("session-1", reasoningDiff, proofBundle);

    const completed = await service.getSession("session-1");
    expect(completed.state).toBe("REASONING_DIFF_ISSUED");
    expect(completed.patchResult).toEqual(patchResult);
    expect(completed.reasoningDiff).toEqual(reasoningDiff);
    expect(completed.proofBundle).toEqual(proofBundle);
    repository.close();
  });
});

describe("SqliteSessionRepository", () => {
  it("persists the aggregate across repository restarts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "counterlab-session-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "counterlab.sqlite");
    const ids = new DeterministicIds();
    const firstRepository = new SqliteSessionRepository(databasePath);
    const firstService = new SessionService(firstRepository, {
      id: ids.id,
      now: ids.now,
    });
    await throughExperiment(firstService);
    firstRepository.close();

    const secondRepository = new SqliteSessionRepository(databasePath);
    const secondService = new SessionService(secondRepository, {
      id: ids.id,
      now: ids.now,
    });
    const restored = await secondService.getSession("session-1");

    expect(restored.state).toBe("EXPERIMENT_COMPLETED");
    expect(restored.prediction).toEqual(prediction);
    expect(restored.verifiedResult).toEqual(resultSet);
    secondRepository.close();
  });

  it("persists epistemic result authority across repository restarts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "counterlab-epistemic-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "counterlab.sqlite");
    const ids = new DeterministicIds();
    const firstRepository = new SqliteSessionRepository(databasePath);
    const firstService = new SessionService(firstRepository, {
      id: ids.id,
      now: ids.now,
    });
    await throughVerifiedLab(firstService);
    await firstService.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    firstRepository.close();

    const secondRepository = new SqliteSessionRepository(databasePath);
    const restored = await new SessionService(secondRepository, {
      id: ids.id,
      now: ids.now,
    }).getSession("session-1");

    expect(restored).toMatchObject({
      state: "EXPERIMENT_COMPLETED",
      verifiedResult: hostedResultSet,
      evidenceVerdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    secondRepository.close();
  });

  it("stores append-only, ordered, hash-chained evidence events", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);
    await service.editBeliefTest("session-1", {
      ...beliefTest,
      learnerClaim: "Edited claim",
    });
    await service.confirmBeliefTest("session-1");

    const events = await service.listEvents("session-1");
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(events.map((event) => event.kind)).toEqual([
      "session.created",
      "belief_test.proposed",
      "belief_test.edited",
      "belief_test.confirmed",
    ]);
    expect(events[0]?.previousEventHash).toBeUndefined();
    expect(events[1]?.previousEventHash).toBe(events[0]?.eventHash);
    expect(events[2]?.previousEventHash).toBe(events[1]?.eventHash);
    expect(events[3]?.previousEventHash).toBe(events[2]?.eventHash);
    expect(new Set(events.map((event) => event.eventHash)).size).toBe(4);
    expect(verifyEvidenceChain(events).headHash).toBe(events[3]?.eventHash);
    repository.close();
  });
});
