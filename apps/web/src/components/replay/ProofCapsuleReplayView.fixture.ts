import {
  ProofCapsuleReplayV2Schema,
  type ProofCapsuleReplayV2,
} from "@counterlab/contracts";

const digest = (character: string) => character.repeat(64);
const recordedAt = "2026-07-16T13:00:00.000Z";

export function replayFixture(
  concept: "entity_leakage" | "class_imbalance",
): ProofCapsuleReplayV2 {
  const imbalance = concept === "class_imbalance";
  const evidence = {
    kind: "metric",
    hash: digest("1"),
    cellIndex: imbalance ? 11 : 7,
    outputIndex: 0,
    excerpt: imbalance
      ? "merchant holdout accuracy: 0.987"
      : "account retention accuracy: 0.960",
    relevance: imbalance
      ? "The headline omits minority-class recall."
      : "The headline comes from a random row split.",
  } as const;
  const sourceSessionId = imbalance
    ? "session_live_merchant_402"
    : "session_live_retention_913";
  const artifactManifestHash = digest("2");
  const resultHash = digest("3");
  const conceptName = imbalance ? "class_imbalance" : "entity_leakage";
  const boundaryCells = imbalance
    ? [
        [
          "threshold-low",
          0.25,
          "prevalence-observed",
          0.013,
          "recall-first",
          0.74,
        ],
        [
          "threshold-high",
          0.7,
          "prevalence-observed",
          0.013,
          "precision-first",
          0.17,
        ],
        ["threshold-low", 0.25, "prevalence-rare", 0.005, "recall-first", 0.71],
        [
          "threshold-high",
          0.7,
          "prevalence-rare",
          0.005,
          "precision-first",
          0.14,
        ],
      ].map(([xId, x, yId, y, classificationId, recall], index) => ({
        cellId: `imbalance-cell-${index}`,
        concept: "class_imbalance" as const,
        coordinates: [
          { axisId: "threshold", pointId: xId, value: x },
          { axisId: "prevalence", pointId: yId, value: y },
        ],
        classificationId,
        prevalenceScenario: y === 0.005 ? "rarer" : "observed",
        prevalence: y,
        threshold: x,
        metrics: {
          accuracy: 0.97,
          precision: 0.42,
          recall,
          f1: 0.54,
          prAuc: 0.412,
          rocAuc: 0.84,
        },
        confusion: {
          trueNegative: 970,
          falsePositive: 12,
          falseNegative: 5,
          truePositive: 13,
        },
        predictedPositiveRate: 0.025,
        sampleSize: 1_000,
        scoreFingerprint: digest("4"),
        pipelineFingerprint: digest("5"),
      }))
    : [
        ["test-20", 0.2, "repeat-2", 2, "little-gap", 0.12],
        ["test-40", 0.4, "repeat-2", 2, "little-gap", 0.16],
        ["test-20", 0.2, "repeat-8", 8, "material-gap", 0.38],
        ["test-40", 0.4, "repeat-8", 8, "material-gap", 0.41],
      ].map(([xId, x, yId, y, classificationId, gap], index) => ({
        cellId: `leakage-cell-${index}`,
        concept: "entity_leakage" as const,
        coordinates: [
          { axisId: "test_fraction", pointId: xId, value: x },
          { axisId: "entity_recurrence", pointId: yId, value: y },
        ],
        classificationId,
        randomAccuracy: 0.96,
        groupAccuracy: 0.96 - Number(gap),
        optimismGap: gap,
        randomEntityOverlap: { count: 64, rate: 0.8 },
        groupEntityOverlap: { count: 0, rate: 0 },
        sampleSizes: { randomTest: 320, groupTest: 320 },
        fixtureViewHash: digest("4"),
        randomPipelineFingerprint: digest("5"),
        groupPipelineFingerprint: digest("6"),
      }));

  const verifiedResult = imbalance
    ? {
        schemaVersion: "2",
        concept: "class_imbalance",
        planId: "plan_merchant_live",
        sessionId: sourceSessionId,
        artifactManifestHash,
        conceptPackVersion: "imbalance-v2.1.0",
        fixture: {
          sha256: digest("4"),
          rows: 8_120,
          positives: 106,
          prevalence: 0.013,
        },
        kernelVersion: "imbalance-kernel-v2",
        seed: 991,
        runs: [
          {
            id: "merchant_majority",
            operation: "imbalance.majority_baseline",
            model: "majority_baseline",
            seed: 991,
            threshold: 0.5,
            prevalenceScenario: "observed",
            metrics: {
              accuracy: 0.987,
              precision: 0,
              recall: 0,
              f1: 0,
              prAuc: 0.013,
              rocAuc: 0.5,
            },
            confusionMatrix: { tn: 987, fp: 0, fn: 13, tp: 0 },
            sampleSizes: { train: 7_120, test: 1_000 },
            classCounts: {
              train: { negative: 7_027, positive: 93 },
              test: { negative: 987, positive: 13 },
            },
            prevalence: 0.013,
            predictedPositiveRate: 0,
            featureSetFingerprint: digest("5"),
            pipelineFingerprint: digest("6"),
            evaluationSetFingerprint: digest("7"),
            scoreFingerprint: digest("8"),
            inputFingerprint: digest("9"),
          },
          {
            id: "merchant_stratified",
            operation: "imbalance.stratified_holdout",
            model: "logistic_regression",
            seed: 991,
            threshold: 0.5,
            prevalenceScenario: "observed",
            metrics: {
              accuracy: 0.972,
              precision: 0.31,
              recall: 0.17,
              f1: 0.22,
              prAuc: 0.412,
              rocAuc: 0.84,
            },
            confusionMatrix: { tn: 982, fp: 5, fn: 11, tp: 2 },
            sampleSizes: { train: 7_120, test: 1_000 },
            classCounts: {
              train: { negative: 7_027, positive: 93 },
              test: { negative: 987, positive: 13 },
            },
            prevalence: 0.013,
            predictedPositiveRate: 0.007,
            featureSetFingerprint: digest("5"),
            pipelineFingerprint: digest("6"),
            evaluationSetFingerprint: digest("7"),
            scoreFingerprint: digest("8"),
            inputFingerprint: digest("9"),
          },
        ],
        chartData: [
          {
            runId: "merchant_majority",
            operation: "imbalance.majority_baseline",
            accuracy: 0.987,
            precision: 0,
            recall: 0,
            f1: 0,
            prAuc: 0.013,
            rocAuc: 0.5,
            prevalence: 0.013,
            predictedPositiveRate: 0,
            sampleSize: 1_000,
            threshold: 0.5,
            prevalenceScenario: "observed",
            seed: 991,
          },
          {
            runId: "merchant_stratified",
            operation: "imbalance.stratified_holdout",
            accuracy: 0.972,
            precision: 0.31,
            recall: 0.17,
            f1: 0.22,
            prAuc: 0.412,
            rocAuc: 0.84,
            prevalence: 0.013,
            predictedPositiveRate: 0.007,
            sampleSize: 1_000,
            threshold: 0.5,
            prevalenceScenario: "observed",
            seed: 991,
          },
        ],
        resultHash,
      }
    : {
        schemaVersion: "2",
        concept: "entity_leakage",
        planId: "plan_retention_live",
        sessionId: sourceSessionId,
        artifactManifestHash,
        conceptPackVersion: "leakage-v2.1.0",
        fixture: {
          customers: 410,
          rows: 2_460,
          sha256: digest("4"),
          targetRate: 0.36,
        },
        kernelVersion: "leakage-kernel-v2",
        seed: 771,
        runs: [
          {
            id: "account_random",
            operation: "leakage.random_row_split",
            splitStrategy: "random",
            groupBy: "account_key",
            dropFeatures: [],
            model: "logistic_regression",
            seed: 771,
            inputFingerprint: digest("5"),
            featureSetFingerprint: digest("6"),
            pipelineFingerprint: digest("7"),
            metrics: { accuracy: 0.96, rocAuc: 0.982 },
            sampleSizes: { train: 1_968, test: 492 },
            entityCounts: { train: 408, test: 289 },
            entityOverlap: { count: 287, rate: 0.993 },
          },
          {
            id: "account_group",
            operation: "leakage.group_holdout",
            splitStrategy: "group",
            groupBy: "account_key",
            dropFeatures: [],
            model: "logistic_regression",
            seed: 771,
            inputFingerprint: digest("5"),
            featureSetFingerprint: digest("6"),
            pipelineFingerprint: digest("7"),
            metrics: { accuracy: 0.58, rocAuc: 0.61 },
            sampleSizes: { train: 1_966, test: 494 },
            entityCounts: { train: 328, test: 82 },
            entityOverlap: { count: 0, rate: 0 },
          },
        ],
        chartData: [
          {
            runId: "account_random",
            splitStrategy: "random",
            accuracy: 0.96,
            rocAuc: 0.982,
            sampleSize: 492,
            seed: 771,
          },
          {
            runId: "account_group",
            splitStrategy: "group",
            accuracy: 0.58,
            rocAuc: 0.61,
            sampleSize: 494,
            seed: 771,
          },
        ],
        resultHash,
      };

  return ProofCapsuleReplayV2Schema.parse({
    schemaVersion: "2",
    replayId: imbalance ? "replay_merchant_402" : "replay_retention_913",
    replay: true,
    label: "Verified replay",
    playbackMode: "verified_capsule_replay",
    sourceMode: "live_notebook",
    sourceSessionId,
    capsuleId: imbalance ? "capsule_merchant_402" : "capsule_retention_913",
    concept: conceptName,
    recordedAt,
    rootHash: digest("a"),
    bytesHash: digest("b"),
    eventChainHead: digest("c"),
    proofCapsule: {
      schemaVersion: "2",
      capsuleId: imbalance ? "capsule_merchant_402" : "capsule_retention_913",
      sessionId: sourceSessionId,
      mode: "live_notebook",
      replayId: null,
      mediaType: "application/vnd.counterlab.capsule+json",
      canonicalProfile: "counterlab-canonical-json-v1",
      rootHash: digest("a"),
      bytesHash: digest("b"),
      byteLength: 42_612,
      reasoningDiffHash: digest("d"),
      eventChainHead: digest("c"),
      createdAt: recordedAt,
      integrity: { mode: "integrity-hashed", algorithm: "sha256" },
    },
    artifactManifest: {
      artifactId: imbalance
        ? "artifact_merchant_402"
        : "artifact_retention_913",
      fileName: imbalance
        ? "merchant_risk_audit_live.ipynb"
        : "account_retention_live.ipynb",
      fileSha256: digest("e"),
      nbformat: 4,
      support: { status: "SUPPORTED", reasons: [] },
      cells: [],
      schemaSummary: {
        fields: [],
        rowCount: imbalance ? 8_120 : 2_460,
        entityCandidates: imbalance ? [] : ["account_key"],
        targetCandidates: [imbalance ? "is_fraud" : "retained"],
      },
      packageHints: ["scikit-learn"],
      createdAt: recordedAt,
    },
    beliefSpec: {
      schemaVersion: "2",
      id: imbalance ? "belief_merchant_402" : "belief_retention_913",
      concept: conceptName,
      claim: imbalance
        ? "Our merchant detector is production-ready because its untouched notebook reports 98.7% accuracy."
        : "This account-retention model will generalize because the untouched notebook reports 96.0% accuracy.",
      evidenceRefs: [evidence],
      hypotheses: [
        {
          id: "current",
          statement: imbalance
            ? "Headline accuracy reflects useful fraud detection."
            : "The behavior signal generalizes to unseen accounts.",
          conditions: [
            "The deployment population matches the notebook evaluation.",
          ],
          nonClaims: ["This does not establish every deployment condition."],
          evidence: [evidence],
          supportedCandidateExperimentIds: ["candidate_current"],
        },
        {
          id: "competing",
          statement: imbalance
            ? "Class rarity hides missed fraud cases."
            : "Repeated account identity inflates the random-row score.",
          conditions: ["The fixed test isolates the deployment-relevant unit."],
          nonClaims: ["This does not prove the model has no useful signal."],
          evidence: [evidence],
          supportedCandidateExperimentIds: ["candidate_competing"],
        },
      ],
      alternatives: [],
      uncertainty: 0.22,
      supportState: "SUPPORTED",
      learnerDecision: "CONFIRMED",
    },
    prediction: {
      schemaVersion: "1",
      id: "prediction_live_1",
      sessionId: sourceSessionId,
      beliefTestId: imbalance ? "belief_merchant_402" : "belief_retention_913",
      choice: imbalance
        ? "The detector will catch at least half of the fraud cases."
        : "Accuracy will remain above 90% for entirely new accounts.",
      confidence: 82,
      committedAt: "2026-07-16T12:41:00.000Z",
      immutableHash: digest("f"),
    },
    verifiedResult,
    evidenceVerdict: {
      schemaVersion: "1",
      kind: "SUPPORTS",
      hypothesisId: "competing",
      scope: imbalance
        ? "For this artifact and fixed holdout, headline accuracy overstates minority detection."
        : "For this artifact and fixed seed, row-wise evaluation overstates unseen-account performance.",
      irHash: digest("1"),
      technicalReportHash: digest("2"),
      verifierVersion: "epistemic-verifier-v1",
      resultHash,
    },
    boundary: {
      result: {
        schemaVersion: "1",
        canonicalProfile: "counterlab-canonical-json-v1",
        boundaryMapId: `boundary_${concept}`,
        sessionId: sourceSessionId,
        concept: conceptName,
        conceptPackVersion: imbalance ? "imbalance-v2.1.0" : "leakage-v2.1.0",
        artifactManifestHash,
        experimentIrHash: digest("1"),
        authoritativeResultHash: resultHash,
        evidenceVerdictHash: digest("2"),
        sweepId: imbalance ? "threshold-prevalence" : "split-recurrence",
        gridPresetId: "replay-grid",
        seed: imbalance ? 991 : 771,
        kernelVersion: imbalance ? "imbalance-kernel-v2" : "leakage-kernel-v2",
        axes: imbalance
          ? [
              {
                id: "threshold",
                label: "Decision threshold",
                unit: "probability",
                points: [
                  { id: "threshold-low", value: 0.25, label: "0.25" },
                  { id: "threshold-high", value: 0.7, label: "0.70" },
                ],
              },
              {
                id: "prevalence",
                label: "Fraud prevalence",
                unit: "proportion",
                points: [
                  { id: "prevalence-observed", value: 0.013, label: "1.3%" },
                  { id: "prevalence-rare", value: 0.005, label: "0.5%" },
                ],
              },
            ]
          : [
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
                id: "entity_recurrence",
                label: "Rows per account",
                unit: "rows/account",
                points: [
                  { id: "repeat-2", value: 2, label: "2 rows" },
                  { id: "repeat-8", value: 8, label: "8 rows" },
                ],
              },
            ],
        cells: boundaryCells,
        classifications: [
          {
            id: imbalance ? "recall-first" : "little-gap",
            label: imbalance ? "Recall-sensitive" : "Little gap",
            description: "The verified pattern stays within this region.",
          },
          {
            id: imbalance ? "precision-first" : "material-gap",
            label: imbalance ? "Precision-sensitive" : "Material gap",
            description: "The verified pattern changes in this region.",
          },
        ],
        units: imbalance
          ? { recall: "proportion", pr_auc: "area" }
          : { optimism_gap: "accuracy proportion" },
        assumptions: [
          "Model, preprocessing, artifact, and seed remained fixed.",
        ],
        nonClaims: [
          "This Boundary Map does not establish global model quality.",
        ],
        resultHash: digest("6"),
      },
      report: {
        schemaVersion: "1",
        status: "VERIFIED",
        verifierVersion: "boundary-map-verifier-v1",
        resultHash: digest("6"),
        invariantCount: 1,
        invariants: [
          {
            name: "result-bindings-resolve",
            passed: true,
            observed: "resolved",
            expected: "resolved",
          },
        ],
        reportHash: digest("7"),
      },
      receipt: {
        schemaVersion: "1",
        canonicalProfile: "counterlab-canonical-json-v1",
        sessionId: sourceSessionId,
        resultHash: digest("6"),
        verificationReportHash: digest("7"),
        experimentIrHash: digest("1"),
        authoritativeResultHash: resultHash,
        evidenceVerdictHash: digest("2"),
        receiptHash: digest("8"),
        issuedAt: "2026-07-16T12:51:00.000Z",
        integrity: {
          mode: "integrity-hashed",
          algorithm: "sha256",
          contentHash: digest("9"),
        },
      },
    },
    revision: {
      statement: imbalance
        ? "For rare events, I will compare minority recall and PR-AUC with a majority baseline."
        : "I will align evaluation groups with the entities the model must generalize to.",
      recordedAt: "2026-07-16T12:54:00.000Z",
    },
    transferResult: {
      schemaVersion: "1",
      id: "transfer_live_1",
      sessionId: sourceSessionId,
      taskId: imbalance ? "defect-transfer" : "forecast-transfer",
      outcome: "PASSED",
      selectedStrategy: imbalance
        ? "Prioritize minority recall under asymmetric false-negative cost."
        : "Use a time-ordered holdout and remove future-looking fields.",
      identifiedRisks: [
        imbalance
          ? "Missed defects are costly."
          : "Future observations leak into training.",
      ],
      evidenceChoices: ["fixed-transfer-evidence"],
      checks: [
        {
          invariant: "deployment_boundary_selected",
          passed: true,
          evidence:
            "The chosen evaluation matches the changed deployment surface.",
        },
      ],
      evaluatorVersion: "transfer-evaluator-v2",
      evaluatedAt: "2026-07-16T12:55:00.000Z",
      resultHash: digest("9"),
    },
    patchResult: {
      schemaVersion: "1",
      id: "patch_live_1",
      sessionId: sourceSessionId,
      status: "VERIFIED",
      sourceArtifactHash: digest("e"),
      patchedArtifactHash: digest("a"),
      patchHash: digest("b"),
      modifiedCells: imbalance ? [11] : [7, 9],
      diff: imbalance
        ? "@@ cell 11 @@\n- accuracy_score(y_test, pred)\n+ classification_report(y_test, pred)"
        : "@@ cell 7 @@\n- train_test_split(rows)\n+ group_holdout(account_key)",
      verification: {
        passed: true,
        invariants: ["UNRELATED_CELLS_UNCHANGED", "RESULT_RECOMPUTED"],
        unchangedCellHashes: [digest("1"), digest("2"), digest("3")],
      },
      generatedAt: "2026-07-16T12:58:00.000Z",
      resultHash: digest("4"),
    },
    reasoningDiff: {
      schemaVersion: "2",
      id: "reasoning_live_1",
      sessionId: sourceSessionId,
      concept: conceptName,
      dimensions: {
        belief: {
          before: "Headline score is enough.",
          after: "Deployment evidence sets the rule.",
        },
        prediction: {
          before: "The score will hold.",
          after: "The locked expectation did not hold.",
        },
        evidence: {
          before: "One aggregate metric.",
          after: "A verified discriminating comparison.",
        },
        boundary: {
          before: "No conditions named.",
          after: "The stored Boundary Map names the conditions.",
        },
        behavior: {
          before: "Reuse the original evaluation.",
          after: "Choose the deployment-matched evaluation.",
        },
        code: {
          before: "Original evaluation block.",
          after: "Minimal verified evaluation repair.",
        },
      },
      authority: {
        artifactManifestHash,
        beliefSpecHash: digest("1"),
        predictionHash: digest("2"),
        experimentIrHash: digest("3"),
        selectionHash: digest("4"),
        authoritativeResultHash: resultHash,
        evidenceVerdictHash: digest("5"),
        epistemicReportHash: digest("6"),
        boundaryMapHash: digest("7"),
        boundaryReceiptHash: digest("8"),
        transferResultHash: digest("9"),
        patchPlanHash: digest("a"),
        patchResultHash: digest("b"),
        patchedArtifactHash: digest("a"),
      },
      evidenceEventHashes: [
        digest("1"),
        digest("2"),
        digest("3"),
        digest("4"),
        digest("5"),
        digest("6"),
        digest("7"),
        digest("8"),
      ],
      limitations: ["This session does not certify global mastery."],
      issuedAt: recordedAt,
    },
    compilerEvents: [
      {
        schemaVersion: "1",
        eventId: "compiler_event_1",
        kind: "job.started",
        jobId: "job_live_1",
        cursor: 1,
        at: "2026-07-16T12:45:00.000Z",
      },
      {
        schemaVersion: "1",
        eventId: "compiler_event_2",
        kind: "verifier.verified",
        jobId: "job_live_1",
        cursor: 2,
        invariantCount: 12,
        mutationCount: 10,
        at: "2026-07-16T12:48:00.000Z",
      },
      {
        schemaVersion: "1",
        eventId: "compiler_event_3",
        kind: "result.ready",
        jobId: "job_live_1",
        cursor: 3,
        resultHash,
        at: "2026-07-16T12:49:00.000Z",
      },
    ],
    timeline: [
      {
        sequence: 1,
        timestamp: "2026-07-16T12:40:00.000Z",
        actor: "learner",
        kind: "QUESTION_FRAMED",
        eventHash: digest("1"),
      },
      {
        sequence: 2,
        timestamp: "2026-07-16T12:49:00.000Z",
        actor: "verifier",
        kind: "SUPPORTS",
        eventHash: digest("2"),
      },
    ],
    provenance: {
      conceptPackVersion: imbalance ? "imbalance-v2.1.0" : "leakage-v2.1.0",
      kernelVersion: imbalance ? "imbalance-kernel-v2" : "leakage-kernel-v2",
      verifierVersion: "external-verifier-v3",
      boundaryVerifierVersion: "boundary-map-verifier-v1",
      scientificVerifierVersion: "scientific-candidate-verifier-v1",
      scorerVersion: "experiment-scorer-v1",
      modelIds: ["gpt-5.6-sol", "codex-compatible-default"],
      promptHashes: [digest("c")],
      commitHashes: ["abcdef0123456789abcdef0123456789abcdef01"],
    },
    limitations: [
      "This replay proves the recorded artifact-specific workflow, not model quality outside its documented scope.",
    ],
  });
}
