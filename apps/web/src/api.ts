import {
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  BeliefTestSchema,
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
  EvidenceVerdictSchema,
  EvidenceEventSchema,
  InteractiveImbalanceRunRequestSchema,
  InteractiveLeakageRunRequestSchema,
  LearnerInteractionInputSchema,
  LearnerInteractionReceiptSchema,
  LearningDirectorClarificationChoiceIdSchema,
  LearningDirectorSessionStateSchema,
  PatchResultSchema,
  PredictionContractSchema,
  ProofBundleSchema,
  PublicReplayProjectionV1Schema,
  PublicReplayPublicationReceiptSchema,
  PublicProofCapsuleRefV2Schema,
  PublicCompilerEventSchema,
  ReasoningDiffSchema,
  ReasoningDiffV2Schema,
  RunnerJobErrorSchema,
  RunnerJobSchema,
  RunnerJobStatusSchema,
  SessionModeSchema,
  SessionStateSchema,
  TransferSubmissionSchema,
  TransferResultSchema,
  HostedVerifiedResultSetV2Schema,
  VerifiedResultSetSchema,
  apiSuccessSchema,
  canonicalJsonV1,
  type ArtifactManifest,
  type BeliefSpecV2,
  type BeliefTest,
  type BoundaryMapAuthorityRefV1,
  type BoundaryMapReceiptV1,
  type BoundaryMapResultV1,
  type BoundaryMapVerificationReportV1,
  type EvidenceEvent,
  type InteractiveImbalanceRunRequest,
  type InteractiveLeakageRunRequest,
  type LearnerHintId,
  type LearnerInteractionInput,
  type LearnerInteractionReceipt,
  type LeakageVerifiedResultSet,
  type ImbalanceVerifiedResultSet,
  type PatchResult,
  type PredictionContract,
  type ProofBundle,
  type PublicReplayProjectionV1,
  type PublicReplayPublicationReceipt,
  type PublicProofCapsuleRefV2,
  type ReasoningDiff,
  type ReasoningDiffV2,
  type RunnerJob,
  type RunnerRequestPurpose,
  type PublicCompilerEvent,
  type SessionState,
  type TransferResult,
  type VerifiedResultSet,
} from "@counterlab/contracts";
import {
  VerifiedLabSceneViewV1Schema,
  type VerifiedLabSceneViewV1,
} from "@counterlab/generative-ui-contracts";
import { z } from "zod";

import { canonicalUploadRequestBinding } from "../shared/upload-operation";

const NonEmptyString = z.string().trim().min(1);
const Sha256Digest = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "expected a lowercase SHA-256 digest");
const DEFAULT_REQUEST_TIMEOUT_MS = 210_000;
const HEALTH_REQUEST_TIMEOUT_MS = 10_000;
const UPLOAD_REQUEST_TIMEOUT_MS = 60_000;
const DOWNLOAD_REQUEST_TIMEOUT_MS = 60_000;
const RESTART_IDEMPOTENCY_KEY = "counterlab.restart.v1";

const ReleaseIdentitySchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("unbound") }).strict(),
    z
      .object({
        status: z.literal("bound"),
        workerVersionId: z
          .string()
          .regex(
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
          ),
        workerVersionTag: z.string().regex(/^git-[a-f0-9]{40}$/),
        workerEvidenceCommit: z.string().regex(/^[a-f0-9]{40}$/),
        runnerSourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
        runnerImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        generationIsolationEvidenceSha256: Sha256Digest,
        generationIsolationProbeSha256: Sha256Digest,
        releaseCheckGenerationIsolationEvidenceSha256: Sha256Digest,
        releaseCheckGenerationIsolationProbeSha256: Sha256Digest,
        releaseCheckGenerationIsolationVerifiedAt: z.iso.datetime({
          offset: true,
        }),
        timeoutCleanupReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
        aggregateLimitEvidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
        runtimePolicySha256: z.string().regex(/^[a-f0-9]{64}$/),
        proofDependencyManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
        workerArtifactClassification: z.literal("PROCESS_BOUND_PARTIAL"),
        workerArtifactManifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
        workerBundleSha256: z.string().regex(/^[a-f0-9]{64}$/),
        clientAssetsSha256: z.string().regex(/^[a-f0-9]{64}$/),
        clientAssetCount: z.number().int().positive(),
        clientPublicAssetsSha256: z.string().regex(/^[a-f0-9]{64}$/),
        clientPublicAssetCount: z.number().int().positive(),
        viteVersion: z.literal("8.1.4"),
        wranglerVersion: z.literal("4.110.0"),
      })
      .strict(),
  ])
  .superRefine((release, context) => {
    if (
      release.status === "bound" &&
      release.clientPublicAssetCount > release.clientAssetCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["clientPublicAssetCount"],
        message: "public client asset count exceeds the full deploy tree",
      });
    }
    if (
      release.status === "bound" &&
      release.releaseCheckGenerationIsolationProbeSha256 !==
        release.generationIsolationProbeSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["releaseCheckGenerationIsolationProbeSha256"],
        message: "release-check isolation probe does not match the deployment",
      });
    }
  });

export const CapabilityHealthSchema = z
  .object({
    platform: z.literal("cloudflare-workers"),
    sample: z.literal("available"),
    replay: z.literal("available"),
    liveGpt: z.enum(["configured", "server-key-required"]),
    liveCodex: z.enum(["configured", "local-runner-required"]),
    liveKernel: z.enum(["configured", "local-runner-required"]),
    maintenance: z.boolean().optional(),
    readiness: z.enum(["not-checked", "ready", "not-ready"]).optional(),
    release: ReleaseIdentitySchema.optional(),
    sandbox: z.enum([
      "credential-and-privilege-boundary",
      "local-runner-required",
    ]),
    generationFilesystemReadIsolation: z.enum(["PARTIAL", "OS_ENFORCED"]),
    requestId: NonEmptyString,
  })
  .strict();

export type CapabilityHealth = z.infer<typeof CapabilityHealthSchema>;

export function isExactLiveAuthorityReady(
  health: CapabilityHealth | null,
): boolean {
  return (
    health?.readiness === "ready" &&
    health.liveGpt === "configured" &&
    health.liveCodex === "configured" &&
    health.liveKernel === "configured" &&
    health.sandbox === "credential-and-privilege-boundary" &&
    health.generationFilesystemReadIsolation === "OS_ENFORCED" &&
    health.release?.status === "bound"
  );
}

const ApiErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: NonEmptyString,
        message: NonEmptyString,
        status: z.number().int().min(100).max(599).optional(),
        details: z.record(z.string(), z.unknown()).optional(),
        retryable: z.boolean().optional(),
      })
      .strict(),
    requestId: NonEmptyString.optional(),
  })
  .strict();

function envelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.union([apiSuccessSchema(dataSchema), ApiErrorEnvelopeSchema]);
}

const sessionViewShape = {
  sessionId: NonEmptyString,
  artifactId: NonEmptyString,
  mode: SessionModeSchema,
  state: SessionStateSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  beliefTest: BeliefTestSchema.optional(),
  beliefSpec: BeliefSpecV2Schema.optional(),
  learningDirector: LearningDirectorSessionStateSchema.optional(),
  prediction: PredictionContractSchema.optional(),
  verifiedResult: VerifiedResultSetSchema.optional(),
  evidenceVerdict: EvidenceVerdictSchema.optional(),
  epistemicReportHash: Sha256Digest.optional(),
  boundaryMapAuthority: BoundaryMapAuthorityRefV1Schema.optional(),
  transferResult: TransferResultSchema.optional(),
  patchResult: PatchResultSchema.optional(),
  revision: z.string().trim().min(1).optional(),
  reasoningDiff: ReasoningDiffSchema.optional(),
  proofBundle: ProofBundleSchema.optional(),
  reasoningDiffV2: ReasoningDiffV2Schema.optional(),
  proofCapsule: PublicProofCapsuleRefV2Schema.optional(),
};

function requireExclusiveBeliefAuthority(
  value: {
    sessionId: string;
    artifactId: string;
    mode: z.infer<typeof SessionModeSchema>;
    state: SessionState;
    beliefTest?: BeliefTest | undefined;
    beliefSpec?: BeliefSpecV2 | undefined;
    prediction?: PredictionContract | undefined;
    verifiedResult?: VerifiedResultSet | undefined;
    evidenceVerdict?: z.infer<typeof EvidenceVerdictSchema> | undefined;
    epistemicReportHash?: string | undefined;
    boundaryMapAuthority?: BoundaryMapAuthorityRefV1 | undefined;
    transferResult?: TransferResult | undefined;
    patchResult?: PatchResult | undefined;
    revision?: string | undefined;
    reasoningDiff?: ReasoningDiff | undefined;
    proofBundle?: ProofBundle | undefined;
    reasoningDiffV2?: ReasoningDiffV2 | undefined;
    proofCapsule?: PublicProofCapsuleRefV2 | undefined;
  },
  context: z.RefinementCtx,
): void {
  if (value.beliefTest !== undefined && value.beliefSpec !== undefined) {
    context.addIssue({
      code: "custom",
      message: "a session view cannot contain more than one belief authority",
      path: ["beliefSpec"],
    });
  }
  if (
    value.verifiedResult !== undefined &&
    value.beliefTest === undefined &&
    value.beliefSpec === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "a verified result requires belief authority",
      path: ["verifiedResult"],
    });
  }
  if (value.prediction !== undefined) {
    if (value.beliefTest === undefined && value.beliefSpec === undefined) {
      context.addIssue({
        code: "custom",
        message: "the Prediction requires belief authority",
        path: ["prediction"],
      });
    }
    if (value.prediction.sessionId !== value.sessionId) {
      context.addIssue({
        code: "custom",
        message: "the Prediction belongs to a different session",
        path: ["prediction", "sessionId"],
      });
    }
    const beliefId = value.beliefSpec?.id ?? value.beliefTest?.id;
    if (beliefId !== undefined && value.prediction.beliefTestId !== beliefId) {
      context.addIssue({
        code: "custom",
        message:
          value.beliefSpec === undefined
            ? "the Prediction does not resolve to this Belief Test"
            : "the Prediction does not resolve to this Belief Spec",
        path: ["prediction", "beliefTestId"],
      });
    }
  }
  if (value.beliefSpec !== undefined) {
    const hasDownstreamAuthority =
      value.prediction !== undefined ||
      value.verifiedResult !== undefined ||
      value.evidenceVerdict !== undefined ||
      value.boundaryMapAuthority !== undefined ||
      value.transferResult !== undefined ||
      value.patchResult !== undefined ||
      value.reasoningDiffV2 !== undefined ||
      value.proofCapsule !== undefined;
    const permitsUnconfirmedBelief =
      !hasDownstreamAuthority &&
      (value.state === "INGESTED" ||
        value.state === "BELIEF_TEST_PROPOSED" ||
        value.state === "INSUFFICIENT_EVIDENCE" ||
        value.state === "REJECTED_BY_LEARNER");
    if (
      !permitsUnconfirmedBelief &&
      value.beliefSpec.learnerDecision !== "CONFIRMED" &&
      value.beliefSpec.learnerDecision !== "ALTERNATIVE_SELECTED"
    ) {
      context.addIssue({
        code: "custom",
        message: "native v5 evidence requires a learner-confirmed Belief Spec",
        path: ["beliefSpec", "learnerDecision"],
      });
    }
    if (
      !permitsUnconfirmedBelief &&
      value.beliefSpec.supportState !== "SUPPORTED"
    ) {
      context.addIssue({
        code: "custom",
        message: "native v5 evidence requires a supported Belief Spec",
        path: ["beliefSpec", "supportState"],
      });
    }
  }
  if (value.verifiedResult !== undefined && value.beliefTest !== undefined) {
    if (value.verifiedResult.concept !== value.beliefTest.concept) {
      context.addIssue({
        code: "custom",
        message: "the legacy result concept does not match the Belief Test",
        path: ["verifiedResult", "concept"],
      });
    }
  }
  if (
    value.verifiedResult?.schemaVersion === "2" &&
    value.verifiedResult.sessionId !== value.sessionId
  ) {
    context.addIssue({
      code: "custom",
      message: "the hosted result session does not match the session view",
      path: ["verifiedResult", "sessionId"],
    });
  }
  if (value.verifiedResult !== undefined && value.beliefSpec !== undefined) {
    const hostedResult = HostedVerifiedResultSetV2Schema.safeParse(
      value.verifiedResult,
    );
    if (!hostedResult.success) {
      context.addIssue({
        code: "custom",
        message: "a Belief Spec v2 result requires a hosted v2 result",
        path: ["verifiedResult"],
      });
    } else {
      if (hostedResult.data.concept !== value.beliefSpec.concept) {
        context.addIssue({
          code: "custom",
          message: "the v5 result concept does not match the Belief Spec",
          path: ["verifiedResult", "concept"],
        });
      }
    }
  }
  const hasVerdict = value.evidenceVerdict !== undefined;
  const hasReport = value.epistemicReportHash !== undefined;
  if (hasVerdict !== hasReport) {
    context.addIssue({
      code: "custom",
      message:
        "an evidence verdict and epistemic report hash must be returned together",
      path: [hasVerdict ? "epistemicReportHash" : "evidenceVerdict"],
    });
  }
  if (hasVerdict && value.beliefSpec === undefined) {
    context.addIssue({
      code: "custom",
      message: "epistemic evidence requires Belief Spec v2 authority",
      path: ["evidenceVerdict"],
    });
  }
  if (
    value.beliefSpec !== undefined &&
    value.verifiedResult !== undefined &&
    value.evidenceVerdict === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "a Belief Spec v2 result requires an evidence verdict",
      path: ["evidenceVerdict"],
    });
  }
  if (
    value.evidenceVerdict?.kind !== undefined &&
    value.evidenceVerdict.kind !== "REJECTED"
  ) {
    if (value.verifiedResult === undefined) {
      context.addIssue({
        code: "custom",
        message:
          "a supporting or inconclusive verdict requires a verified result",
        path: ["verifiedResult"],
      });
    } else if (
      value.evidenceVerdict.resultHash !== value.verifiedResult.resultHash
    ) {
      context.addIssue({
        code: "custom",
        message: "the verdict result does not match the verified result",
        path: ["evidenceVerdict", "resultHash"],
      });
    }
  }
  if (
    value.evidenceVerdict?.kind === "REJECTED" &&
    value.verifiedResult !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "a rejected verdict cannot release a verified result",
      path: ["verifiedResult"],
    });
  }
  if (value.verifiedResult !== undefined && value.prediction === undefined) {
    context.addIssue({
      code: "custom",
      message: "a verified result requires an immutable Prediction",
      path: ["prediction"],
    });
  }
  if (
    value.patchResult !== undefined &&
    value.beliefSpec !== undefined &&
    value.evidenceVerdict?.kind !== "SUPPORTS"
  ) {
    context.addIssue({
      code: "custom",
      message: "a Belief Spec v2 repair requires a supporting evidence verdict",
      path: ["patchResult"],
    });
  }
  if (
    value.reasoningDiffV2 !== undefined &&
    value.reasoningDiffV2.sessionId !== value.sessionId
  ) {
    context.addIssue({
      code: "custom",
      message: "the Reasoning Diff belongs to a different session",
      path: ["reasoningDiffV2", "sessionId"],
    });
  }
  if (
    value.reasoningDiff !== undefined &&
    value.reasoningDiff.sessionId !== value.sessionId
  ) {
    context.addIssue({
      code: "custom",
      message: "the legacy Reasoning Diff belongs to a different session",
      path: ["reasoningDiff", "sessionId"],
    });
  }
  if (
    value.boundaryMapAuthority !== undefined &&
    value.boundaryMapAuthority.receipt.sessionId !== value.sessionId
  ) {
    context.addIssue({
      code: "custom",
      message: "the Boundary receipt belongs to a different session",
      path: ["boundaryMapAuthority", "receipt", "sessionId"],
    });
  }
  if (value.boundaryMapAuthority !== undefined) {
    if (value.verifiedResult === undefined) {
      context.addIssue({
        code: "custom",
        message: "Boundary authority requires a verified result",
        path: ["verifiedResult"],
      });
    } else if (
      value.boundaryMapAuthority.receipt.authoritativeResultHash !==
      value.verifiedResult.resultHash
    ) {
      context.addIssue({
        code: "custom",
        message: "the Boundary receipt does not match the verified result",
        path: ["boundaryMapAuthority", "receipt", "authoritativeResultHash"],
      });
    }
    if (
      value.beliefSpec !== undefined &&
      value.evidenceVerdict !== undefined &&
      value.boundaryMapAuthority.receipt.experimentIrHash !==
        value.evidenceVerdict.irHash
    ) {
      context.addIssue({
        code: "custom",
        message: "the Boundary receipt does not match the Evidence Verdict",
        path: ["boundaryMapAuthority", "receipt", "experimentIrHash"],
      });
    }
  }
  if (
    value.transferResult !== undefined &&
    value.transferResult.sessionId !== value.sessionId
  ) {
    context.addIssue({
      code: "custom",
      message: "the transfer result belongs to a different session",
      path: ["transferResult", "sessionId"],
    });
  }
  if (
    value.patchResult !== undefined &&
    value.patchResult.sessionId !== value.sessionId
  ) {
    context.addIssue({
      code: "custom",
      message: "the patch result belongs to a different session",
      path: ["patchResult", "sessionId"],
    });
  }
  if (
    value.patchResult?.status === "VERIFIED" &&
    value.transferResult?.outcome !== "PASSED"
  ) {
    context.addIssue({
      code: "custom",
      message: "a verified patch requires passed transfer authority",
      path: ["transferResult"],
    });
  }
  if (value.reasoningDiffV2 !== undefined) {
    if (value.proofCapsule === undefined) {
      context.addIssue({
        code: "custom",
        message:
          "native Reasoning Diff is released only with Proof Capsule authority",
        path: ["reasoningDiffV2"],
      });
    }
    const hostedResult = HostedVerifiedResultSetV2Schema.safeParse(
      value.verifiedResult,
    );
    const completeAuthority =
      value.beliefSpec !== undefined &&
      value.prediction !== undefined &&
      hostedResult.success &&
      value.evidenceVerdict?.kind === "SUPPORTS" &&
      value.epistemicReportHash !== undefined &&
      value.boundaryMapAuthority !== undefined &&
      value.transferResult?.outcome === "PASSED" &&
      value.patchResult?.status === "VERIFIED";
    if (!completeAuthority) {
      context.addIssue({
        code: "custom",
        message: "Reasoning Diff v2 requires complete native session authority",
        path: ["reasoningDiffV2"],
      });
    } else if (
      hostedResult.success &&
      value.beliefSpec !== undefined &&
      value.prediction !== undefined &&
      value.evidenceVerdict !== undefined &&
      value.epistemicReportHash !== undefined &&
      value.boundaryMapAuthority !== undefined &&
      value.transferResult !== undefined &&
      value.patchResult !== undefined &&
      (value.reasoningDiffV2.concept !== value.beliefSpec.concept ||
        value.reasoningDiffV2.authority.artifactManifestHash !==
          hostedResult.data.artifactManifestHash ||
        value.reasoningDiffV2.authority.predictionHash !==
          value.prediction.immutableHash ||
        value.reasoningDiffV2.authority.experimentIrHash !==
          value.evidenceVerdict.irHash ||
        value.reasoningDiffV2.authority.authoritativeResultHash !==
          hostedResult.data.resultHash ||
        value.reasoningDiffV2.authority.epistemicReportHash !==
          value.epistemicReportHash ||
        value.reasoningDiffV2.authority.boundaryMapHash !==
          value.boundaryMapAuthority.resultHash ||
        value.reasoningDiffV2.authority.boundaryReceiptHash !==
          value.boundaryMapAuthority.receipt.receiptHash ||
        value.reasoningDiffV2.authority.transferResultHash !==
          value.transferResult.resultHash ||
        value.reasoningDiffV2.authority.patchResultHash !==
          value.patchResult.resultHash ||
        value.reasoningDiffV2.authority.patchedArtifactHash !==
          value.patchResult.patchedArtifactHash)
    ) {
      context.addIssue({
        code: "custom",
        message: "the Reasoning Diff authority does not match the session",
        path: ["reasoningDiffV2", "authority"],
      });
    }
  }
  if (value.proofCapsule !== undefined) {
    const hostedResult = HostedVerifiedResultSetV2Schema.safeParse(
      value.verifiedResult,
    );
    if (value.proofCapsule.sessionId !== value.sessionId) {
      context.addIssue({
        code: "custom",
        message: "the Proof Capsule belongs to a different session",
        path: ["proofCapsule", "sessionId"],
      });
    }
    if (!hostedResult.success) {
      context.addIssue({
        code: "custom",
        message: "a native Proof Capsule requires a hosted v2 result",
        path: ["verifiedResult"],
      });
    }
    const nativeProofReady =
      value.mode.kind === "live_notebook" &&
      value.state === "PROOF_CAPSULE_ISSUED" &&
      value.beliefSpec !== undefined &&
      value.prediction !== undefined &&
      hostedResult.success &&
      value.evidenceVerdict?.kind === "SUPPORTS" &&
      value.epistemicReportHash !== undefined &&
      value.boundaryMapAuthority !== undefined &&
      value.revision !== undefined &&
      value.transferResult?.outcome === "PASSED" &&
      value.patchResult?.status === "VERIFIED" &&
      value.reasoningDiffV2 !== undefined;
    if (!nativeProofReady) {
      context.addIssue({
        code: "custom",
        message:
          "a native Proof Capsule requires complete supporting session authority",
        path: ["proofCapsule"],
      });
    } else if (
      hostedResult.success &&
      value.beliefSpec !== undefined &&
      value.evidenceVerdict?.kind === "SUPPORTS" &&
      value.epistemicReportHash !== undefined &&
      value.boundaryMapAuthority !== undefined &&
      value.transferResult?.outcome === "PASSED" &&
      value.patchResult?.status === "VERIFIED" &&
      value.reasoningDiffV2 !== undefined &&
      hostedResult.data.sessionId !== value.sessionId
    ) {
      context.addIssue({
        code: "custom",
        message: "the native proof authority does not match the session",
        path: ["verifiedResult", "sessionId"],
      });
    } else if (
      hostedResult.success &&
      value.beliefSpec !== undefined &&
      value.evidenceVerdict?.kind === "SUPPORTS" &&
      value.epistemicReportHash !== undefined &&
      value.boundaryMapAuthority !== undefined &&
      value.transferResult?.outcome === "PASSED" &&
      value.patchResult?.status === "VERIFIED" &&
      value.reasoningDiffV2 !== undefined &&
      (hostedResult.data.concept !== value.beliefSpec.concept ||
        value.reasoningDiffV2.concept !== hostedResult.data.concept ||
        value.boundaryMapAuthority.receipt.sessionId !== value.sessionId ||
        value.transferResult.sessionId !== value.sessionId ||
        value.patchResult.sessionId !== value.sessionId ||
        value.proofCapsule.createdAt !== value.reasoningDiffV2.issuedAt ||
        value.reasoningDiffV2.authority.authoritativeResultHash !==
          hostedResult.data.resultHash ||
        value.reasoningDiffV2.authority.experimentIrHash !==
          value.evidenceVerdict.irHash ||
        value.reasoningDiffV2.authority.epistemicReportHash !==
          value.epistemicReportHash ||
        value.reasoningDiffV2.authority.boundaryMapHash !==
          value.boundaryMapAuthority.resultHash ||
        value.reasoningDiffV2.authority.boundaryReceiptHash !==
          value.boundaryMapAuthority.receipt.receiptHash ||
        value.reasoningDiffV2.authority.transferResultHash !==
          value.transferResult.resultHash ||
        value.reasoningDiffV2.authority.patchResultHash !==
          value.patchResult.resultHash ||
        value.reasoningDiffV2.authority.patchedArtifactHash !==
          value.patchResult.patchedArtifactHash ||
        value.reasoningDiffV2.authority.evidenceVerdictHash !==
          value.boundaryMapAuthority.receipt.evidenceVerdictHash ||
        value.boundaryMapAuthority.receipt.authoritativeResultHash !==
          hostedResult.data.resultHash ||
        value.boundaryMapAuthority.receipt.experimentIrHash !==
          value.evidenceVerdict.irHash)
    ) {
      context.addIssue({
        code: "custom",
        message: "the native proof authority does not match the session",
        path: ["proofCapsule"],
      });
    }
  }
  if (value.proofBundle !== undefined) {
    const proofBundle = value.proofBundle;
    if (value.proofBundle.sessionId !== value.sessionId) {
      context.addIssue({
        code: "custom",
        message: "the Proof Bundle belongs to a different session",
        path: ["proofBundle", "sessionId"],
      });
    }
    if (proofBundle.artifactManifest.artifactId !== value.artifactId) {
      context.addIssue({
        code: "custom",
        message: "the Proof Bundle belongs to a different artifact",
        path: ["proofBundle", "artifactManifest", "artifactId"],
      });
    }
    if (
      value.proofBundle.schemaVersion === "2" &&
      value.mode.kind !== "live_notebook"
    ) {
      context.addIssue({
        code: "custom",
        message: "a live Proof Bundle requires live notebook mode",
        path: ["proofBundle", "sessionMode"],
      });
    }
    if (
      value.proofBundle.schemaVersion === "1" &&
      value.mode.kind === "sample_lesson" &&
      value.proofBundle.replayId !== value.mode.sampleId
    ) {
      context.addIssue({
        code: "custom",
        message: "the sample Proof Bundle does not match the selected lesson",
        path: ["proofBundle", "replayId"],
      });
    }
    if (
      value.state !== "REASONING_DIFF_ISSUED" &&
      value.state !== "PROOF_CAPSULE_ISSUED"
    ) {
      context.addIssue({
        code: "custom",
        message: "a Proof Bundle cannot be exposed before Reasoning Diff",
        path: ["proofBundle"],
      });
    }
    const authorityBindings = [
      [
        "prediction",
        value.prediction?.immutableHash,
        proofBundle.predictionContract.immutableHash,
      ],
      [
        "verifiedResult",
        value.verifiedResult?.resultHash,
        proofBundle.verifiedResultSet.resultHash,
      ],
      [
        "transferResult",
        value.transferResult?.resultHash,
        proofBundle.transferResult.resultHash,
      ],
      [
        "patchResult",
        value.patchResult?.resultHash,
        proofBundle.patchResult.resultHash,
      ],
      ["reasoningDiff", value.reasoningDiff?.id, proofBundle.reasoningDiff.id],
    ] as const;
    for (const [
      field,
      sessionAuthority,
      bundleAuthority,
    ] of authorityBindings) {
      if (
        sessionAuthority === undefined ||
        sessionAuthority !== bundleAuthority
      ) {
        context.addIssue({
          code: "custom",
          message: `the Proof Bundle ${field} authority does not match the session`,
          path: ["proofBundle", field],
        });
      }
    }
  }
}

export const SessionViewSchema = z
  .object(sessionViewShape)
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type SessionView = z.infer<typeof SessionViewSchema>;
const OwnerCapabilitySchema = z.string().regex(/^cl_owner_[A-Za-z0-9_-]{43}$/u);
const SessionCreationViewSchema = z
  .object({
    ...sessionViewShape,
    ownerCapability: OwnerCapabilitySchema.optional(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
const ArtifactUploadViewSchema = ArtifactManifestSchema.extend({
  ownerCapability: OwnerCapabilitySchema.optional(),
}).strict();
export type ArtifactView = ArtifactManifest;

export type SessionBeliefAuthority =
  | { schemaVersion: "1"; beliefTest: BeliefTest }
  | { schemaVersion: "2"; beliefSpec: BeliefSpecV2 };

export function getSessionBeliefAuthority(
  session: Pick<SessionView, "beliefTest" | "beliefSpec">,
): SessionBeliefAuthority | undefined {
  if (session.beliefTest !== undefined) {
    return { schemaVersion: "1", beliefTest: session.beliefTest };
  }
  if (session.beliefSpec !== undefined) {
    return { schemaVersion: "2", beliefSpec: session.beliefSpec };
  }
  return undefined;
}

const LabCompileResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema.optional(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type LabCompileResponse = z.infer<typeof LabCompileResponseSchema>;

const RunnerActionResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema.optional(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type RunnerActionResponse = z.infer<typeof RunnerActionResponseSchema>;

const RunnerCancelResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema,
    reused: z.boolean(),
    runnerAcknowledged: z.boolean(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type RunnerCancelResponse = z.infer<typeof RunnerCancelResponseSchema>;

const InteractiveRunResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema,
    selectedRunId: NonEmptyString,
    configurationHash: Sha256Digest,
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type InteractiveRunResponse = z.infer<
  typeof InteractiveRunResponseSchema
>;

const InteractiveResultVerificationSchema = z
  .object({
    schemaVersion: z.literal("1"),
    status: z.literal("VERIFIED"),
    verifierVersion: z.literal("hosted-result-verifier-v1"),
    resultHash: Sha256Digest,
    invariantCount: z.number().int().positive(),
    invariants: z
      .array(
        z
          .object({
            name: NonEmptyString,
            passed: z.literal(true),
            observed: z.unknown(),
            expected: z.unknown(),
            counterexample: NonEmptyString.optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.invariantCount !== report.invariants.length) {
      context.addIssue({
        code: "custom",
        message: "interactive verifier invariant count must resolve",
        path: ["invariantCount"],
      });
    }
  });

const InteractiveResultResponseSchema = z
  .object({
    result: HostedVerifiedResultSetV2Schema,
    selectedRunId: NonEmptyString,
    configurationHash: Sha256Digest,
    verification: InteractiveResultVerificationSchema,
  })
  .strict()
  .superRefine((response, context) => {
    if (response.verification.resultHash !== response.result.resultHash) {
      context.addIssue({
        code: "custom",
        message: "interactive verification does not match the result",
        path: ["verification", "resultHash"],
      });
    }
    if (
      !response.result.runs.some((run) => run.id === response.selectedRunId)
    ) {
      context.addIssue({
        code: "custom",
        message: "the selected interactive run is absent from the result",
        path: ["selectedRunId"],
      });
    }
  });
export type InteractiveResultResponse = z.infer<
  typeof InteractiveResultResponseSchema
>;

const BoundaryRunResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema,
    reused: z.literal(true).optional(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type BoundaryRunResponse = z.infer<typeof BoundaryRunResponseSchema>;

const BoundaryResponseSchema = z
  .object({
    result: BoundaryMapResultV1Schema,
    report: BoundaryMapVerificationReportV1Schema,
    receipt: BoundaryMapReceiptV1Schema,
    authority: BoundaryMapAuthorityRefV1Schema,
  })
  .strict()
  .superRefine((response, context) => {
    if (response.report.status !== "VERIFIED") {
      context.addIssue({
        code: "custom",
        message: "a rejected Boundary report cannot release result values",
        path: ["report", "status"],
      });
    }
    if (
      response.result.resultHash !== response.receipt.resultHash ||
      response.report.resultHash !== response.result.resultHash ||
      response.report.reportHash !== response.receipt.verificationReportHash ||
      response.receipt.sessionId !== response.result.sessionId ||
      response.receipt.experimentIrHash !== response.result.experimentIrHash ||
      response.receipt.authoritativeResultHash !==
        response.result.authoritativeResultHash ||
      response.receipt.evidenceVerdictHash !==
        response.result.evidenceVerdictHash ||
      response.authority.resultHash !== response.result.resultHash ||
      response.authority.verificationReportHash !==
        response.report.reportHash ||
      response.authority.sweepId !== response.result.sweepId ||
      response.authority.cellCount !== response.result.cells.length ||
      canonicalJsonV1(response.authority.receipt) !==
        canonicalJsonV1(response.receipt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Boundary response authority hashes must resolve",
        path: ["authority"],
      });
    }
  });
export type BoundaryResponse = z.infer<typeof BoundaryResponseSchema>;
export type VerifiedLabSceneView = VerifiedLabSceneViewV1;

const ReasoningDiffResponseSchema = z.union([
  ReasoningDiffV2Schema,
  ReasoningDiffSchema,
]);
export type ReasoningDiffResponse = z.infer<typeof ReasoningDiffResponseSchema>;

const RunnerEventsResponseSchema = z
  .object({
    jobId: NonEmptyString,
    events: z.array(PublicCompilerEventSchema),
    nextCursor: z.number().int().nonnegative(),
    terminal: z.boolean(),
    jobStatus: RunnerJobStatusSchema.optional(),
    jobError: RunnerJobErrorSchema.optional(),
  })
  .strict();
export type RunnerEventsResponse = z.infer<typeof RunnerEventsResponseSchema>;

const EventsResponseSchema = z
  .object({
    events: z.array(EvidenceEventSchema),
    compilerEvents: z.array(PublicCompilerEventSchema).max(512).optional(),
    compilerActivity: z
      .object({
        schemaVersion: z.literal("1"),
        status: z.literal("RECORDED"),
        ordering: z.literal("job-created-at-job-id-then-cursor"),
        jobCount: z.number().int().nonnegative().max(32),
        eventCount: z.number().int().nonnegative().max(512),
      })
      .strict()
      .optional(),
    integrity: z
      .object({
        schemaVersion: z.literal("1"),
        status: z.literal("VERIFIED"),
        eventChainHead: Sha256Digest,
        eventCount: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((response, context) => {
    if (
      (response.compilerEvents === undefined) !==
      (response.compilerActivity === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["compilerActivity"],
        message:
          "compiler events and their recorded-stream receipt must appear together",
      });
    }
    if (
      response.compilerEvents !== undefined &&
      response.compilerActivity !== undefined
    ) {
      if (
        response.compilerActivity.eventCount !== response.compilerEvents.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["compilerActivity", "eventCount"],
          message:
            "compiler activity receipt count does not match returned events",
        });
      }
      const eventIds = new Set<string>();
      const seenJobs = new Set<string>();
      const lastCursorByJob = new Map<string, number>();
      let activeJobId: string | undefined;
      for (const [index, event] of response.compilerEvents.entries()) {
        if (
          eventIds.has(event.eventId) ||
          (activeJobId !== undefined &&
            event.jobId !== activeJobId &&
            seenJobs.has(event.jobId)) ||
          event.cursor !== (lastCursorByJob.get(event.jobId) ?? 0) + 1
        ) {
          context.addIssue({
            code: "custom",
            path: ["compilerEvents", index],
            message:
              "compiler activity is not unique and contiguous in recorded order",
          });
          break;
        }
        eventIds.add(event.eventId);
        seenJobs.add(event.jobId);
        activeJobId = event.jobId;
        lastCursorByJob.set(event.jobId, event.cursor);
      }
      if (seenJobs.size > response.compilerActivity.jobCount) {
        context.addIssue({
          code: "custom",
          path: ["compilerActivity", "jobCount"],
          message: "compiler activity receipt omits a returned job stream",
        });
      }
    }
    if (response.integrity === undefined) return;
    if (response.integrity.eventCount !== response.events.length) {
      context.addIssue({
        code: "custom",
        path: ["integrity", "eventCount"],
        message: "evidence receipt count does not match returned events",
      });
    }
    if (
      response.events.at(-1)?.eventHash !== response.integrity.eventChainHead
    ) {
      context.addIssue({
        code: "custom",
        path: ["integrity", "eventChainHead"],
        message: "evidence receipt head does not match returned events",
      });
    }
  });

export type SessionEventsSnapshot = z.infer<typeof EventsResponseSchema>;

const PatchCompileResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema.optional(),
    patch: PatchResultSchema.optional(),
    kernelVerification: z.unknown().optional(),
  })
  .strict()
  .superRefine((response, context) => {
    requireExclusiveBeliefAuthority(response, context);
    if (response.runnerJob === undefined && response.patch === undefined) {
      context.addIssue({
        code: "custom",
        message: "patch compilation must queue a runner job or return a patch",
      });
    }
    if (
      response.patch !== undefined &&
      (response.patch.status !== "VERIFIED" ||
        response.patch.sessionId !== response.sessionId ||
        response.transferResult?.outcome !== "PASSED" ||
        response.patchResult?.status !== "VERIFIED" ||
        canonicalJsonV1(response.patch) !==
          canonicalJsonV1(response.patchResult))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "a returned patch must be verified and match the passed-transfer session authority",
        path: ["patch"],
      });
    }
  });

const LegacyReplayTraceEntrySchema = z.union([
  z
    .object({
      stage: z.literal("generate"),
      status: z.literal("COMPLETED"),
      run: NonEmptyString,
      durationMs: z.number().int().nonnegative(),
      files: z
        .array(
          z.enum([
            "experiment-plan.json",
            "artifact-adapter.py",
            "public_tests.py",
          ]),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      stage: z.literal("external_verifier"),
      status: z.literal("REJECTED"),
      run: NonEmptyString,
      invariant: NonEmptyString,
      counterexample: NonEmptyString.max(500),
    })
    .strict(),
  z
    .object({
      stage: z.enum(["repair_1", "repair_2"]),
      status: z.literal("REJECTED"),
      run: NonEmptyString,
      durationMs: z.number().int().nonnegative(),
      invariant: NonEmptyString,
      counterexample: NonEmptyString.max(500),
    })
    .strict(),
  z
    .object({
      stage: z.literal("later_generate"),
      status: z.literal("COMPLETED"),
      run: NonEmptyString,
      durationMs: z.number().int().nonnegative(),
      note: NonEmptyString.max(500),
    })
    .strict(),
  z
    .object({
      stage: z.literal("external_verifier"),
      status: z.literal("VERIFIED"),
      run: NonEmptyString,
      invariants: z.number().int().positive(),
      mutationsDetected: z.number().int().nonnegative(),
      mutationsTotal: z.number().int().positive(),
      resultHash: Sha256Digest,
    })
    .strict()
    .refine((entry) => entry.mutationsDetected <= entry.mutationsTotal, {
      message: "detected mutations cannot exceed the total",
      path: ["mutationsDetected"],
    }),
]);

const LegacyReplayCompilerTraceSchema = z
  .object({
    schemaVersion: z.literal("1"),
    replayId: NonEmptyString,
    label: z.literal("Verified replay"),
    modelId: NonEmptyString,
    codexVersion: NonEmptyString,
    repositoryCommitAtRun: NonEmptyString,
    publicSdkDocumentationHash: Sha256Digest,
    recordedAt: z.iso.datetime({ offset: true }),
    generationIsolation: z
      .object({
        status: z.literal("PARTIAL"),
        limitation: NonEmptyString.max(500),
      })
      .strict(),
    candidateExecutionIsolation: z
      .object({
        status: z.literal("VERIFIED"),
        properties: z.array(NonEmptyString.max(120)).min(1).max(12),
      })
      .strict(),
    trace: z.array(LegacyReplayTraceEntrySchema).min(1).max(20),
  })
  .strict();

const LegacyReplaySchema = z
  .object({
    schemaVersion: z.literal("1"),
    replayId: NonEmptyString,
    replay: z.literal(true),
    recordedAt: z.iso.datetime({ offset: true }),
    modelId: NonEmptyString,
    fixtureId: NonEmptyString,
    verifierVersion: NonEmptyString,
    templateCommit: NonEmptyString,
    compilerTrace: LegacyReplayCompilerTraceSchema,
    result: VerifiedResultSetSchema,
    patch: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((replay, context) => {
    const trace = replay.compilerTrace;
    if (
      trace.replayId !== replay.replayId ||
      trace.modelId !== replay.modelId ||
      trace.recordedAt !== replay.recordedAt ||
      trace.repositoryCommitAtRun !== replay.templateCommit
    ) {
      context.addIssue({
        code: "custom",
        path: ["compilerTrace"],
        message: "legacy compiler trace provenance does not match the replay",
      });
    }
    const verified = trace.trace.find(
      (entry) =>
        entry.stage === "external_verifier" && entry.status === "VERIFIED",
    );
    if (verified?.resultHash !== replay.result.resultHash) {
      context.addIssue({
        code: "custom",
        path: ["compilerTrace", "trace"],
        message: "legacy compiler trace result does not match the replay",
      });
    }
  });

const ReplaySchema = z.union([
  LegacyReplaySchema,
  PublicReplayProjectionV1Schema,
]);

export type VerifiedReplay =
  z.infer<typeof LegacyReplaySchema> | PublicReplayProjectionV1;

const PublishReplayResponseSchema = z
  .object({
    reused: z.boolean(),
    replay: PublicReplayPublicationReceiptSchema,
  })
  .strict();

export type PublishReplayResponse = {
  reused: boolean;
  replay: PublicReplayPublicationReceipt;
};

const RevokeReplayResponseSchema = z
  .object({
    replayId: NonEmptyString,
    revoked: z.literal(true),
    alreadyRevoked: z.boolean(),
  })
  .strict();

export type RevokeReplayResponse = z.infer<typeof RevokeReplayResponseSchema>;

const ReplayPublicationStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("never_published") }).strict(),
  z
    .object({
      status: z.enum(["active", "revoked", "expired"]),
      replay: PublicReplayPublicationReceiptSchema,
    })
    .strict(),
]);

export type ReplayPublicationStatus = z.infer<
  typeof ReplayPublicationStatusSchema
>;

const CreateSampleSessionInputSchema = z
  .object({ sampleId: z.literal("leakage-01") })
  .strict();
const CreateLiveSessionInputSchema = z
  .object({ artifactId: NonEmptyString })
  .strict();
const CreateReplaySessionInputSchema = z
  .object({ replayId: z.literal("leakage-01") })
  .strict();
const RestartSessionSourceSchema = z
  .object({
    sessionId: NonEmptyString,
    artifactId: NonEmptyString,
    mode: SessionModeSchema,
  })
  .strict();

const BeliefProposalInputSchema = z
  .object({
    learnerClaim: z.string().trim().min(12).max(2_000),
    previewHash: Sha256Digest.optional(),
    sensitiveContentApproved: z.boolean().optional(),
  })
  .strict();

const BeliefAnalysisPreviewSchema = z
  .object({
    schemaVersion: z.literal("1"),
    concept: z.enum(["entity_leakage", "class_imbalance"]),
    conceptTitle: NonEmptyString,
    previewHash: Sha256Digest,
    requiresSensitiveApproval: z.boolean(),
    sanitizedContent: z.record(z.string(), z.unknown()),
    learningDirectorPacket: z.record(z.string(), z.unknown()),
  })
  .strict();

const BeliefResponseInputSchema = z.union([
  z.object({ action: z.literal("confirm") }).strict(),
  z
    .object({ action: z.literal("edit"), beliefTest: BeliefTestSchema })
    .strict(),
  z
    .object({ action: z.literal("edit"), beliefSpec: BeliefSpecV2Schema })
    .strict(),
  z.object({ action: z.literal("reject"), reason: NonEmptyString }).strict(),
  z
    .object({
      action: z.literal("insufficient_evidence"),
      reason: NonEmptyString,
    })
    .strict(),
]);
const LearningDirectorAnswerInputSchema = z
  .object({ answer: LearningDirectorClarificationChoiceIdSchema })
  .strict();

const PredictionInputSchema = z
  .object({
    choice: z.string().trim().min(1).max(300),
    numericRange: z
      .object({ min: z.number().finite(), max: z.number().finite() })
      .strict()
      .optional(),
    confidence: z.number().finite().min(0).max(100),
  })
  .strict()
  .superRefine((prediction, context) => {
    if (
      prediction.numericRange !== undefined &&
      prediction.numericRange.min > prediction.numericRange.max
    ) {
      context.addIssue({
        code: "custom",
        message: "numeric range minimum cannot exceed maximum",
        path: ["numericRange"],
      });
    }
  });

const RevisionInputSchema = z
  .object({ revision: z.string().trim().min(20).max(4_000) })
  .strict();

const TransferInputSchema = TransferSubmissionSchema;

export type CreateSampleSessionInput = z.input<
  typeof CreateSampleSessionInputSchema
>;
export type CreateLiveSessionInput = z.input<
  typeof CreateLiveSessionInputSchema
>;
export type CreateReplaySessionInput = z.input<
  typeof CreateReplaySessionInputSchema
>;
export type BeliefProposalInput = z.input<typeof BeliefProposalInputSchema>;
export type BeliefAnalysisPreview = z.infer<typeof BeliefAnalysisPreviewSchema>;
export type BeliefResponseInput = z.input<typeof BeliefResponseInputSchema>;
export type PredictionInput = z.input<typeof PredictionInputSchema>;
export type RevisionInput = z.input<typeof RevisionInputSchema>;
export type TransferInput = z.input<typeof TransferInputSchema>;

export type PatchCompileResponse = z.infer<typeof PatchCompileResponseSchema>;
export type AuthenticatedDownload = Readonly<{
  blob: Blob;
  fileName: string;
}>;

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    details?: Readonly<Record<string, unknown>>;
    retryable?: boolean;
    requestId?: string;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "ApiClientError";
    this.code = input.code;
    this.status = input.status;
    this.details = input.details ?? {};
    this.retryable = input.retryable ?? false;
    if (input.requestId !== undefined) {
      this.requestId = input.requestId;
    }
  }
}

export type CounterLabApiClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  capabilityStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  requestTimeoutMs?: number;
};

function encodedId(value: string): string {
  if (value.trim().length === 0) {
    throw new ApiClientError({
      code: "INVALID_REQUEST",
      message: "route identifier cannot be empty",
      status: 0,
    });
  }
  return encodeURIComponent(value);
}

function validatedInput<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiClientError({
      code: "INVALID_REQUEST",
      message: "request data failed client validation",
      status: 0,
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

function runnerStateVersionMatches(
  responseVersion: number,
  runnerJob: RunnerJob,
): boolean {
  return (
    runnerJob.stateVersion === responseVersion ||
    (runnerJob.status === "VERIFIED" &&
      runnerJob.stateVersion < responseVersion)
  );
}

function runnerlessLiveActionIsReconciled(
  response: Pick<
    SessionView,
    "state" | "verifiedResult" | "boundaryMapAuthority"
  >,
  purpose: RunnerRequestPurpose | undefined,
): boolean {
  if (purpose === "LAB_COMPILE") {
    return response.state === "LAB_VERIFIED";
  }
  if (purpose === "LAB_RUN_AUTHORITATIVE") {
    return (
      response.state === "EXPERIMENT_COMPLETED" &&
      response.verifiedResult !== undefined
    );
  }
  if (purpose === "LAB_RUN_BOUNDARY") {
    return (
      response.state === "EXPERIMENT_COMPLETED" &&
      response.boundaryMapAuthority !== undefined
    );
  }
  return false;
}

async function canonicalSha256(value: unknown): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new ApiClientError({
      code: "AUTHORITY_INTEGRITY_UNAVAILABLE",
      message: "This browser cannot verify scientific authority hashes",
      status: 0,
    });
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJsonV1(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function authorityHashError(
  code:
    | "SESSION_AUTHORITY_HASH_INVALID"
    | "BOUNDARY_AUTHORITY_HASH_INVALID"
    | "INTERACTIVE_RESULT_AUTHORITY_INVALID",
  message: string,
  status: number,
): never {
  throw new ApiClientError({ code, message, status });
}

async function validateBoundaryReceiptHashes(
  receipt: BoundaryMapReceiptV1,
  status: number,
  code: "SESSION_AUTHORITY_HASH_INVALID" | "BOUNDARY_AUTHORITY_HASH_INVALID",
): Promise<void> {
  const { integrity, receiptHash: _receiptHash, ...receiptContent } = receipt;
  const contentHash = await canonicalSha256(receiptContent);
  const receiptHash = await canonicalSha256({ ...receiptContent, integrity });
  if (
    integrity.contentHash !== contentHash ||
    receipt.receiptHash !== receiptHash
  ) {
    authorityHashError(
      code,
      "The Boundary receipt content does not match its authority hashes",
      status,
    );
  }
}

async function validateSessionAuthorityHashes(
  value: unknown,
  status: number,
): Promise<void> {
  if (
    value === null ||
    typeof value !== "object" ||
    !("sessionId" in value) ||
    !("state" in value) ||
    !("version" in value)
  ) {
    return;
  }
  const session = value as Partial<SessionView>;
  if (session.prediction !== undefined) {
    const { immutableHash, ...predictionContent } = session.prediction;
    if ((await canonicalSha256(predictionContent)) !== immutableHash) {
      authorityHashError(
        "SESSION_AUTHORITY_HASH_INVALID",
        "The Prediction content does not match its immutable hash",
        status,
      );
    }
  }
  if (session.verifiedResult?.schemaVersion === "2") {
    const { resultHash, ...resultContent } = session.verifiedResult;
    if ((await canonicalSha256(resultContent)) !== resultHash) {
      authorityHashError(
        "SESSION_AUTHORITY_HASH_INVALID",
        "The verified result content does not match its result hash",
        status,
      );
    }
  }
  if (session.transferResult !== undefined) {
    const { resultHash, ...transferContent } = session.transferResult;
    if ((await canonicalSha256(transferContent)) !== resultHash) {
      authorityHashError(
        "SESSION_AUTHORITY_HASH_INVALID",
        "The transfer result content does not match its result hash",
        status,
      );
    }
  }
  if (session.patchResult !== undefined) {
    const { resultHash, ...patchContent } = session.patchResult;
    const [patchHash, diffHash] = await Promise.all([
      canonicalSha256(patchContent),
      canonicalSha256(session.patchResult.diff),
    ]);
    if (
      patchHash !== resultHash ||
      diffHash !== session.patchResult.patchHash
    ) {
      authorityHashError(
        "SESSION_AUTHORITY_HASH_INVALID",
        "The patch result content does not match its authority hashes",
        status,
      );
    }
  }
  if (session.boundaryMapAuthority !== undefined) {
    await validateBoundaryReceiptHashes(
      session.boundaryMapAuthority.receipt,
      status,
      "SESSION_AUTHORITY_HASH_INVALID",
    );
  }
}

async function validateBoundaryResponseHashes(
  value: unknown,
  status: number,
): Promise<void> {
  if (
    value === null ||
    typeof value !== "object" ||
    !("result" in value) ||
    !("report" in value) ||
    !("receipt" in value) ||
    !("authority" in value)
  ) {
    return;
  }
  const boundary = value as BoundaryResponse;
  const { resultHash, ...resultContent } = boundary.result;
  const { reportHash, ...reportContent } = boundary.report;
  const [computedResultHash, computedReportHash] = await Promise.all([
    canonicalSha256(resultContent),
    canonicalSha256(reportContent),
  ]);
  if (computedResultHash !== resultHash || computedReportHash !== reportHash) {
    authorityHashError(
      "BOUNDARY_AUTHORITY_HASH_INVALID",
      "The Boundary result or report does not match its authority hash",
      status,
    );
  }
  await validateBoundaryReceiptHashes(
    boundary.receipt,
    status,
    "BOUNDARY_AUTHORITY_HASH_INVALID",
  );
}

async function validateInteractiveResultHashes(
  value: unknown,
  status: number,
): Promise<void> {
  if (
    value === null ||
    typeof value !== "object" ||
    !("result" in value) ||
    !("selectedRunId" in value) ||
    !("configurationHash" in value) ||
    !("verification" in value)
  ) {
    return;
  }
  const response = value as InteractiveResultResponse;
  if (response.result.schemaVersion !== "2") return;
  const { resultHash, ...resultContent } = response.result;
  if ((await canonicalSha256(resultContent)) !== resultHash) {
    authorityHashError(
      "INTERACTIVE_RESULT_AUTHORITY_INVALID",
      "The interactive result content does not match its result hash",
      status,
    );
  }
}

async function validateNativeProofLineage(
  value: unknown,
  status: number,
): Promise<void> {
  if (value === null || typeof value !== "object") return;
  const session = value as Partial<SessionView>;
  if (
    session.boundaryMapAuthority !== undefined &&
    session.evidenceVerdict !== undefined
  ) {
    const evidenceVerdictHash = await canonicalSha256(session.evidenceVerdict);
    if (
      session.boundaryMapAuthority.receipt.evidenceVerdictHash !==
      evidenceVerdictHash
    ) {
      throw new ApiClientError({
        code: "NATIVE_PROOF_LINEAGE_INVALID",
        message: "The native Boundary authority does not match the verdict",
        status,
      });
    }
  }
  if (session.reasoningDiffV2 === undefined) return;
  if (
    session.beliefSpec === undefined ||
    session.prediction === undefined ||
    session.evidenceVerdict === undefined
  ) {
    return;
  }
  const [beliefSpecHash, evidenceVerdictHash, reasoningDiffHash] =
    await Promise.all([
      canonicalSha256(session.beliefSpec),
      canonicalSha256(session.evidenceVerdict),
      canonicalSha256(session.reasoningDiffV2),
    ]);
  if (
    session.reasoningDiffV2.authority.beliefSpecHash !== beliefSpecHash ||
    session.reasoningDiffV2.authority.predictionHash !==
      session.prediction.immutableHash ||
    session.reasoningDiffV2.authority.evidenceVerdictHash !==
      evidenceVerdictHash ||
    (session.proofCapsule !== undefined &&
      session.proofCapsule.reasoningDiffHash !== reasoningDiffHash)
  ) {
    throw new ApiClientError({
      code: "NATIVE_PROOF_LINEAGE_INVALID",
      message: "The native authority hashes do not match the session",
      status,
    });
  }
}

async function validatePublicReplayContent(
  replay: PublicReplayProjectionV1,
): Promise<void> {
  const {
    projectionHash: _projectionHash,
    projectionIntegrity: _projectionIntegrity,
    ...sourceAuthority
  } = replay.authority;
  const canonical = canonicalJsonV1({
    ...replay,
    authority: sourceAuthority,
  });
  if (globalThis.crypto?.subtle === undefined) {
    throw new ApiClientError({
      code: "REPLAY_INTEGRITY_UNAVAILABLE",
      message: "This browser cannot verify the public replay hash",
      status: 0,
    });
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (
    replay.authority.projectionHash !== expected ||
    replay.authority.projectionIntegrity.contentHash !== expected
  ) {
    throw new ApiClientError({
      code: "REPLAY_INTEGRITY_INVALID",
      message: "The public replay content does not match its authority hash",
      status: 0,
    });
  }
}

async function createUploadIdempotencyKey(file: File): Promise<string> {
  if (
    globalThis.crypto?.subtle === undefined ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new ApiClientError({
      code: "UPLOAD_INTEGRITY_UNAVAILABLE",
      message: "This browser cannot create a hash-bound upload operation",
      status: 0,
    });
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const fileSha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const operationId = globalThis.crypto.randomUUID();
  const requestBinding = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      canonicalJsonV1(
        canonicalUploadRequestBinding({
          operationId,
          fileSha256,
          fileName: file.name,
          mediaType: file.type,
        }),
      ),
    ),
  );
  const bindingHash = [...new Uint8Array(requestBinding)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `upload_${operationId}_${bindingHash}`;
}

export class CounterLabApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch | undefined;
  private readonly capabilityStorage:
    Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  private readonly requestTimeoutMs: number;
  private readonly ownerCapabilities = new Map<string, string>();
  private readonly artifactCapabilities = new Map<string, string>();
  private readonly uploadIdempotencyKeys = new WeakMap<File, Promise<string>>();
  private readonly activeUploads = new WeakMap<
    File,
    Promise<ArtifactManifest>
  >();

  constructor(options: CounterLabApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
    this.fetcher = options.fetch;
    this.capabilityStorage = options.capabilityStorage;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (
      !Number.isInteger(this.requestTimeoutMs) ||
      this.requestTimeoutMs < 1 ||
      this.requestTimeoutMs > DEFAULT_REQUEST_TIMEOUT_MS
    ) {
      throw new ApiClientError({
        code: "INVALID_CONFIGURATION",
        message: "API request timeout is outside the supported range",
        status: 0,
      });
    }
  }

  hasSessionAccess(sessionId: string): boolean {
    return this.sessionOwnerCapability(sessionId) !== undefined;
  }

  getHealth(
    options: { probeReadiness?: boolean } = {},
  ): Promise<CapabilityHealth> {
    return this.request(
      options.probeReadiness ? "/api/health?readiness=probe" : "/api/health",
      CapabilityHealthSchema,
      { method: "GET" },
      Math.min(this.requestTimeoutMs, HEALTH_REQUEST_TIMEOUT_MS),
    );
  }

  createSampleArtifact(): Promise<ArtifactManifest> {
    return this.request("/api/artifacts", ArtifactManifestSchema, {
      method: "POST",
      body: JSON.stringify({ sample: true }),
    });
  }

  uploadArtifact(file: File): Promise<ArtifactManifest> {
    const active = this.activeUploads.get(file);
    if (active !== undefined) return active;
    const upload = this.performArtifactUpload(file).finally(() => {
      if (this.activeUploads.get(file) === upload) {
        this.activeUploads.delete(file);
      }
    });
    this.activeUploads.set(file, upload);
    return upload;
  }

  private async performArtifactUpload(file: File): Promise<ArtifactManifest> {
    const existingKey = this.uploadIdempotencyKeys.get(file);
    const keyPromise = existingKey ?? createUploadIdempotencyKey(file);
    if (existingKey === undefined) {
      this.uploadIdempotencyKeys.set(file, keyPromise);
    }
    let idempotencyKey: string;
    try {
      idempotencyKey = await keyPromise;
    } catch (error) {
      if (this.uploadIdempotencyKeys.get(file) === keyPromise) {
        this.uploadIdempotencyKeys.delete(file);
      }
      throw error;
    }
    const form = new FormData();
    form.set("file", file, file.name);
    const uploaded = await this.request(
      "/api/artifacts",
      ArtifactUploadViewSchema,
      {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: form,
      },
      Math.min(this.requestTimeoutMs, UPLOAD_REQUEST_TIMEOUT_MS),
    );
    if (this.uploadIdempotencyKeys.get(file) === keyPromise) {
      this.uploadIdempotencyKeys.delete(file);
    }
    const { ownerCapability, ...artifact } = uploaded;
    if (ownerCapability !== undefined) {
      this.artifactCapabilities.set(artifact.artifactId, ownerCapability);
    }
    return artifact;
  }

  async getArtifact(artifactId: string): Promise<ArtifactManifest> {
    const artifact = await this.request(
      `/api/artifacts/${encodedId(artifactId)}`,
      ArtifactManifestSchema,
    );
    return this.requireArtifactResponseLineage(artifactId, artifact);
  }

  async getSessionArtifact(
    sessionId: string,
    artifactId: string,
  ): Promise<ArtifactManifest> {
    const artifact = await this.request(
      `/api/sessions/${encodedId(sessionId)}/artifact`,
      ArtifactManifestSchema,
    );
    return this.requireArtifactResponseLineage(artifactId, artifact);
  }

  createSampleSession(input: CreateSampleSessionInput): Promise<SessionView> {
    const request = validatedInput(CreateSampleSessionInputSchema, input);
    return this.request("/api/sample/sessions", SessionCreationViewSchema, {
      method: "POST",
      body: JSON.stringify(request),
    }).then((created) => {
      if (
        created.mode.kind !== "sample_lesson" ||
        created.mode.sampleId !== request.sampleId
      ) {
        throw this.sessionResponseLineageError(
          "The created session does not match the requested sample",
        );
      }
      return this.rememberCreatedSession(created);
    });
  }

  createLiveSession(input: CreateLiveSessionInput): Promise<SessionView> {
    const request = validatedInput(CreateLiveSessionInputSchema, input);
    const artifactCapability = this.artifactCapabilities.get(
      request.artifactId,
    );
    return this.request("/api/live/sessions", SessionCreationViewSchema, {
      method: "POST",
      body: JSON.stringify({
        ...request,
        ...(artifactCapability === undefined ? {} : { artifactCapability }),
      }),
    }).then((created) => {
      if (
        created.mode.kind !== "live_notebook" ||
        created.artifactId !== request.artifactId
      ) {
        throw this.sessionResponseLineageError(
          "The created session does not match the requested artifact",
        );
      }
      this.artifactCapabilities.delete(request.artifactId);
      return this.rememberCreatedSession(created);
    });
  }

  async restartSession(
    source: Pick<SessionView, "sessionId" | "artifactId" | "mode">,
  ): Promise<SessionView> {
    const requestSource = validatedInput(RestartSessionSourceSchema, {
      sessionId: source.sessionId,
      artifactId: source.artifactId,
      mode: source.mode,
    });
    const expectedSessionId = `session_restart_${await canonicalSha256({
      schemaVersion: "1",
      operation: "restart-closed-belief-response",
      sourceSessionId: requestSource.sessionId,
      idempotencyKey: RESTART_IDEMPOTENCY_KEY,
    })}`;
    const created = await this.request(
      `/api/sessions/${encodedId(requestSource.sessionId)}/restart`,
      SessionCreationViewSchema,
      {
        method: "POST",
        headers: { "idempotency-key": RESTART_IDEMPOTENCY_KEY },
        body: JSON.stringify({}),
      },
    );
    if (
      created.sessionId !== expectedSessionId ||
      created.artifactId !== requestSource.artifactId ||
      canonicalJsonV1(created.mode) !== canonicalJsonV1(requestSource.mode)
    ) {
      throw this.sessionResponseLineageError(
        "The restarted session does not match its source investigation",
      );
    }
    return this.rememberCreatedSession(created);
  }

  createReplaySession(input: CreateReplaySessionInput): Promise<SessionView> {
    const request = validatedInput(CreateReplaySessionInputSchema, input);
    return this.request("/api/replay/sessions", SessionCreationViewSchema, {
      method: "POST",
      body: JSON.stringify(request),
    }).then((created) => {
      if (
        created.mode.kind !== "verified_replay" ||
        created.mode.replayId !== request.replayId
      ) {
        throw this.sessionResponseLineageError(
          "The created session does not match the requested replay",
        );
      }
      return this.rememberCreatedSession(created);
    });
  }

  async getSession(sessionId: string): Promise<SessionView> {
    const session = await this.request(
      `/api/sessions/${encodedId(sessionId)}`,
      SessionViewSchema,
    );
    return this.requireSessionResponseLineage(sessionId, session);
  }

  proposeBeliefTest(
    sessionId: string,
    input: BeliefProposalInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/belief-test`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(BeliefProposalInputSchema, input)),
      },
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response),
    );
  }

  previewBeliefAnalysis(
    sessionId: string,
    learnerClaim: string,
  ): Promise<BeliefAnalysisPreview> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/belief-test/preview`,
      BeliefAnalysisPreviewSchema,
      {
        method: "POST",
        body: JSON.stringify(
          validatedInput(
            BeliefProposalInputSchema.pick({ learnerClaim: true }),
            {
              learnerClaim,
            },
          ),
        ),
      },
    );
  }

  respondToBeliefTest(
    sessionId: string,
    input: BeliefResponseInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/belief-test/confirm`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(BeliefResponseInputSchema, input)),
      },
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response),
    );
  }

  respondToLearningDirector(
    sessionId: string,
    answer: string,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/learning-director`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(
          validatedInput(LearningDirectorAnswerInputSchema, { answer }),
        ),
      },
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response),
    );
  }

  confirmBeliefTest(sessionId: string): Promise<SessionView> {
    return this.respondToBeliefTest(sessionId, { action: "confirm" });
  }

  commitPrediction(
    sessionId: string,
    input: PredictionInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/prediction`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(PredictionInputSchema, input)),
      },
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response),
    );
  }

  compileLab(sessionId: string): Promise<LabCompileResponse> {
    return this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/lab/compile`,
      LabCompileResponseSchema,
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response, {
        kind: "LAB_COMPILE",
        purpose: "LAB_COMPILE",
        requireForLive: true,
        bindStateVersion: true,
      }),
    );
  }

  listRunnerEvents(
    sessionId: string,
    jobId: string,
    after = 0,
  ): Promise<RunnerEventsResponse> {
    if (!Number.isInteger(after) || after < 0) {
      return Promise.reject(
        new ApiClientError({
          code: "INVALID_EVENT_CURSOR",
          message: "Event cursor must be a non-negative integer",
          status: 400,
        }),
      );
    }
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/jobs/${encodedId(jobId)}/events?after=${after}`,
      RunnerEventsResponseSchema,
    ).then((response) => {
      if (
        response.jobId !== jobId ||
        response.events.some((event) => event.jobId !== jobId)
      ) {
        throw this.sessionResponseLineageError(
          "The runner event stream does not match the requested job",
        );
      }
      return response;
    });
  }

  cancelRunnerJob(
    sessionId: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<RunnerCancelResponse> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/jobs/${encodedId(jobId)}/cancel`,
      RunnerCancelResponseSchema,
      {
        method: "POST",
        body: JSON.stringify({}),
        ...(signal === undefined ? {} : { signal }),
      },
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response, { jobId }),
    );
  }

  runLab(sessionId: string): Promise<RunnerActionResponse> {
    return this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/lab/run`,
      RunnerActionResponseSchema,
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response, {
        kind: "LAB_RUN",
        purpose: "LAB_RUN_AUTHORITATIVE",
        requireForLive: true,
        bindStateVersion: true,
      }),
    );
  }

  runBoundary(sessionId: string): Promise<BoundaryRunResponse> {
    return this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/boundary/run`,
      BoundaryRunResponseSchema,
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response, {
        kind: "LAB_RUN",
        purpose: "LAB_RUN_BOUNDARY",
        requireForLive: true,
        bindStateVersion: true,
      }),
    );
  }

  async getBoundary(
    sessionId: string,
    expectedAuthority: BoundaryMapAuthorityRefV1,
  ): Promise<BoundaryResponse> {
    const boundary = await this.request(
      `/api/sessions/${encodedId(sessionId)}/boundary`,
      BoundaryResponseSchema,
    );
    if (
      boundary.result.sessionId !== sessionId ||
      boundary.receipt.sessionId !== sessionId ||
      canonicalJsonV1(boundary.authority) !== canonicalJsonV1(expectedAuthority)
    ) {
      throw new ApiClientError({
        code: "BOUNDARY_AUTHORITY_LINEAGE_INVALID",
        message: "The Boundary authority belongs to a different session",
        status: 0,
      });
    }
    return boundary;
  }

  getLabScene(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<VerifiedLabSceneView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/lab-scene`,
      VerifiedLabSceneViewV1Schema,
      signal === undefined ? {} : { signal },
    );
  }

  runInteractiveLeakage(
    sessionId: string,
    input: InteractiveLeakageRunRequest,
  ): Promise<InteractiveRunResponse> {
    const request = validatedInput(InteractiveLeakageRunRequestSchema, input);
    return this.requestRunnerAction(
      `/api/sessions/${encodedId(sessionId)}/lab/interactive`,
      InteractiveRunResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response, {
        kind: "LAB_RUN",
        purpose: "LAB_RUN_INTERACTIVE",
        requireForLive: true,
        configurationHash: response.configurationHash,
        bindStateVersion: true,
      }),
    );
  }

  runInteractiveImbalance(
    sessionId: string,
    input: InteractiveImbalanceRunRequest,
  ): Promise<InteractiveRunResponse> {
    const request = validatedInput(InteractiveImbalanceRunRequestSchema, input);
    return this.requestRunnerAction(
      `/api/sessions/${encodedId(sessionId)}/lab/interactive`,
      InteractiveRunResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response, {
        kind: "LAB_RUN",
        purpose: "LAB_RUN_INTERACTIVE",
        requireForLive: true,
        configurationHash: response.configurationHash,
        bindStateVersion: true,
      }),
    );
  }

  async getInteractiveResult(
    sessionId: string,
    jobId: string,
    expected: Pick<
      InteractiveRunResponse,
      "selectedRunId" | "configurationHash"
    >,
  ): Promise<InteractiveResultResponse> {
    const response = await this.request(
      `/api/sessions/${encodedId(sessionId)}/jobs/${encodedId(jobId)}/result`,
      InteractiveResultResponseSchema,
    );
    if (
      response.result.sessionId !== sessionId ||
      response.selectedRunId !== expected.selectedRunId ||
      response.configurationHash !== expected.configurationHash
    ) {
      throw new ApiClientError({
        code: "INTERACTIVE_RESULT_AUTHORITY_INVALID",
        message:
          "The interactive result does not match its queued session and configuration",
        status: 0,
      });
    }
    return response;
  }

  recordRevision(
    sessionId: string,
    input: RevisionInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/revision`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(RevisionInputSchema, input)),
      },
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response),
    );
  }

  submitTransfer(
    sessionId: string,
    input: TransferInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/transfer`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(TransferInputSchema, input)),
      },
    ).then((response) =>
      this.requireSessionResponseLineage(sessionId, response),
    );
  }

  recordLearnerInteraction(
    sessionId: string,
    input: LearnerInteractionInput,
  ): Promise<LearnerInteractionReceipt> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/interactions`,
      LearnerInteractionReceiptSchema,
      {
        method: "POST",
        body: JSON.stringify(
          validatedInput(LearnerInteractionInputSchema, input),
        ),
      },
    );
  }

  async compilePatch(sessionId: string): Promise<PatchCompileResponse> {
    const response = await this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/patch/compile`,
      PatchCompileResponseSchema,
    );
    if (
      response.sessionId !== sessionId ||
      (response.runnerJob !== undefined &&
        (response.runnerJob.sessionId !== sessionId ||
          response.runnerJob.artifactId !== response.artifactId ||
          response.runnerJob.kind !== "PATCH_COMPILE" ||
          response.runnerJob.requestIdentity?.purpose !== "PATCH_COMPILE" ||
          !runnerStateVersionMatches(response.version, response.runnerJob)))
    ) {
      throw new ApiClientError({
        code: "PATCH_AUTHORITY_LINEAGE_INVALID",
        message: "The patch response belongs to a different session",
        status: 0,
      });
    }
    return response;
  }

  patchDownloadUrl(sessionId: string): string {
    return `${this.baseUrl}/api/sessions/${encodedId(sessionId)}/patch/download`;
  }

  downloadPatch(sessionId: string): Promise<AuthenticatedDownload> {
    return this.downloadSessionArtifact(
      sessionId,
      `/api/sessions/${encodedId(sessionId)}/patch/download`,
      "application/x-ipynb+json",
      `counterlab-${sessionId}.patched.ipynb`,
      ".ipynb",
    );
  }

  proofCapsuleDownloadUrl(sessionId: string): string {
    return `${this.baseUrl}/api/sessions/${encodedId(sessionId)}/proof-capsule`;
  }

  downloadProofCapsule(sessionId: string): Promise<AuthenticatedDownload> {
    return this.downloadSessionArtifact(
      sessionId,
      `/api/sessions/${encodedId(sessionId)}/proof-capsule`,
      "application/vnd.counterlab.capsule+json",
      `counterlab-${sessionId}.counterlab`,
      ".counterlab",
    );
  }

  getEvents(sessionId: string): Promise<SessionEventsSnapshot> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/events`,
      EventsResponseSchema,
    );
  }

  async getReasoningDiff(
    sessionId: string,
    expected: ReasoningDiffResponse,
  ): Promise<ReasoningDiffResponse> {
    const reasoningDiff = await this.request(
      `/api/sessions/${encodedId(sessionId)}/reasoning-diff`,
      ReasoningDiffResponseSchema,
    );
    if (
      reasoningDiff.sessionId !== sessionId ||
      canonicalJsonV1(reasoningDiff) !== canonicalJsonV1(expected)
    ) {
      throw new ApiClientError({
        code: "REASONING_DIFF_LINEAGE_INVALID",
        message: "The Reasoning Diff does not match stored session authority",
        status: 0,
      });
    }
    return reasoningDiff;
  }

  getProofBundle(sessionId: string): Promise<ProofBundle> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/proof-bundle`,
      ProofBundleSchema,
    ).then((proofBundle) => {
      if (proofBundle.sessionId !== sessionId) {
        throw new ApiClientError({
          code: "PROOF_BUNDLE_LINEAGE_INVALID",
          message: "The Proof Bundle belongs to a different session",
          status: 0,
        });
      }
      return proofBundle;
    });
  }

  async getReplay(replayId: string): Promise<VerifiedReplay> {
    const replay = await this.request(
      `/api/replays/${encodedId(replayId)}`,
      ReplaySchema,
    );
    if (replay.replayId !== replayId) {
      throw new ApiClientError({
        code: "REPLAY_LINEAGE_INVALID",
        message: "The replay response does not match the requested replay",
        status: 0,
      });
    }
    if ("projectionKind" in replay) await validatePublicReplayContent(replay);
    return replay;
  }

  publishReplay(sessionId: string): Promise<PublishReplayResponse> {
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/replays`,
      PublishReplayResponseSchema,
    );
  }

  revokeReplay(sessionId: string): Promise<RevokeReplayResponse> {
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/replays/revoke`,
      RevokeReplayResponseSchema,
    );
  }

  getReplayPublicationStatus(
    sessionId: string,
  ): Promise<ReplayPublicationStatus> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/replays/status`,
      ReplayPublicationStatusSchema,
    );
  }

  revokeSessionAccess(sessionId: string): Promise<{ revoked: boolean }> {
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/access/revoke`,
      z.object({ revoked: z.boolean() }).strict(),
    ).then((result) => {
      this.ownerCapabilities.delete(sessionId);
      try {
        this.browserStorage()?.removeItem(this.ownerCapabilityKey(sessionId));
      } catch {
        // Access can remain memory-only when storage is unavailable.
      }
      return result;
    });
  }

  private sessionResponseLineageError(message: string): ApiClientError {
    return new ApiClientError({
      code: "SESSION_RESPONSE_LINEAGE_INVALID",
      message,
      status: 0,
    });
  }

  private requireSessionResponseLineage<
    T extends {
      sessionId: string;
      artifactId: string;
      mode: SessionView["mode"];
      state: SessionState;
      version: number;
      verifiedResult?: VerifiedResultSet | undefined;
      boundaryMapAuthority?: BoundaryMapAuthorityRefV1 | undefined;
      runnerJob?: RunnerJob | undefined;
    },
  >(
    sessionId: string,
    response: T,
    expectedRunner: {
      jobId?: string;
      kind?: RunnerJob["kind"];
      purpose?: RunnerRequestPurpose;
      requireForLive?: boolean;
      configurationHash?: string;
      bindStateVersion?: boolean;
    } = {},
  ): T {
    const runnerJob = response.runnerJob;
    if (
      response.sessionId !== sessionId ||
      (response.mode.kind === "live_notebook" &&
        expectedRunner.requireForLive === true &&
        runnerJob === undefined &&
        !runnerlessLiveActionIsReconciled(response, expectedRunner.purpose)) ||
      (runnerJob !== undefined &&
        (runnerJob.sessionId !== sessionId ||
          runnerJob.artifactId !== response.artifactId ||
          (expectedRunner.jobId !== undefined &&
            runnerJob.jobId !== expectedRunner.jobId) ||
          (expectedRunner.kind !== undefined &&
            runnerJob.kind !== expectedRunner.kind) ||
          (expectedRunner.purpose !== undefined &&
            runnerJob.requestIdentity?.purpose !== expectedRunner.purpose) ||
          (expectedRunner.configurationHash !== undefined &&
            runnerJob.requestIdentity?.configurationHash !==
              expectedRunner.configurationHash) ||
          (expectedRunner.bindStateVersion === true &&
            !runnerStateVersionMatches(response.version, runnerJob))))
    ) {
      throw this.sessionResponseLineageError(
        "The API response belongs to a different session",
      );
    }
    return response;
  }

  private requireArtifactResponseLineage(
    artifactId: string,
    artifact: ArtifactManifest,
  ): ArtifactManifest {
    if (artifact.artifactId !== artifactId) {
      throw new ApiClientError({
        code: "ARTIFACT_RESPONSE_LINEAGE_INVALID",
        message: "The artifact response does not match the requested artifact",
        status: 0,
      });
    }
    return artifact;
  }

  private rememberCreatedSession(
    created: z.infer<typeof SessionCreationViewSchema>,
  ): SessionView {
    const { ownerCapability, ...session } = created;
    if (ownerCapability !== undefined) {
      this.ownerCapabilities.set(session.sessionId, ownerCapability);
      try {
        this.browserStorage()?.setItem(
          this.ownerCapabilityKey(session.sessionId),
          ownerCapability,
        );
      } catch {
        // The in-memory capability still protects this browser tab.
      }
    }
    return session;
  }

  private ownerCapabilityKey(sessionId: string): string {
    return `counterlab.ownerCapability.${encodeURIComponent(sessionId)}`;
  }

  private browserStorage():
    Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined {
    if (this.capabilityStorage !== undefined) return this.capabilityStorage;
    if (typeof window !== "undefined" && window.localStorage !== undefined) {
      return window.localStorage;
    }
    return undefined;
  }

  private sessionOwnerCapability(sessionId: string): string | undefined {
    const current = this.ownerCapabilities.get(sessionId);
    if (current !== undefined) return current;
    try {
      const stored = this.browserStorage()?.getItem(
        this.ownerCapabilityKey(sessionId),
      );
      const parsed = OwnerCapabilitySchema.safeParse(stored);
      if (parsed.success) {
        this.ownerCapabilities.set(sessionId, parsed.data);
        return parsed.data;
      }
    } catch {
      // A missing or blocked storage surface is equivalent to no capability.
    }
    return undefined;
  }

  private postWithoutInput<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return this.request(path, schema, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  private async downloadSessionArtifact(
    sessionId: string,
    path: string,
    expectedMediaType: string,
    fallbackFileName: string,
    expectedFileSuffix: string,
  ): Promise<AuthenticatedDownload> {
    const headers: Record<string, string> = { accept: expectedMediaType };
    const capability = this.sessionOwnerCapability(sessionId);
    if (capability !== undefined) {
      headers.authorization = `Bearer ${capability}`;
    }
    const controller = new AbortController();
    let timedOut = false;
    const timeout = globalThis.setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      Math.min(this.requestTimeoutMs, DOWNLOAD_REQUEST_TIMEOUT_MS),
    );
    let response: Response;
    try {
      const fetcher = this.fetcher ?? globalThis.fetch.bind(globalThis);
      response = await fetcher(`${this.baseUrl}${path}`, {
        method: "GET",
        headers,
        credentials: "same-origin",
        signal: controller.signal,
      });
    } catch (cause) {
      throw new ApiClientError({
        code: timedOut ? "REQUEST_TIMEOUT" : "NETWORK_ERROR",
        message: timedOut
          ? "CounterLab stopped waiting for the download"
          : "CounterLab could not retrieve the download",
        status: 0,
        retryable: true,
        cause,
      });
    } finally {
      globalThis.clearTimeout(timeout);
    }
    if (!response.ok) {
      let parsedError: z.infer<typeof ApiErrorEnvelopeSchema> | undefined;
      try {
        const parsed = ApiErrorEnvelopeSchema.safeParse(await response.json());
        if (parsed.success) parsedError = parsed.data;
      } catch {
        // A malformed failure body is reported as a generic download failure.
      }
      throw new ApiClientError({
        code: parsedError?.error.code ?? "DOWNLOAD_FAILED",
        message:
          parsedError?.error.message ??
          "CounterLab could not retrieve the download",
        status: parsedError?.error.status ?? response.status,
        retryable: parsedError?.error.retryable ?? false,
      });
    }
    const contentType = response.headers.get("content-type") ?? "";
    const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== expectedMediaType.toLowerCase()) {
      throw new ApiClientError({
        code: "INVALID_API_RESPONSE",
        message: "CounterLab received an unexpected download media type",
        status: response.status,
      });
    }
    let blob: Blob;
    try {
      blob = await response.blob();
    } catch (cause) {
      throw new ApiClientError({
        code: "INVALID_API_RESPONSE",
        message: "CounterLab could not read the complete download",
        status: response.status,
        retryable: true,
        cause,
      });
    }
    if (blob.size === 0) {
      throw new ApiClientError({
        code: "INVALID_API_RESPONSE",
        message: "CounterLab received an empty download",
        status: response.status,
      });
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const proposedFileName =
      /(?:^|;)\s*filename="([A-Za-z0-9._-]{1,180})"(?:;|$)/iu.exec(
        disposition,
      )?.[1];
    const safeFallback = fallbackFileName.replace(/[^A-Za-z0-9._-]+/gu, "-");
    const fileName =
      proposedFileName !== undefined &&
      proposedFileName !== "." &&
      proposedFileName !== ".." &&
      proposedFileName.toLowerCase().endsWith(expectedFileSuffix)
        ? proposedFileName
        : safeFallback;
    return { blob, fileName };
  }

  private postRunnerActionWithoutInput<T>(
    path: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    return this.requestRunnerAction(path, schema, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  private async requestRunnerAction<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit,
  ): Promise<T> {
    try {
      return await this.request(path, schema, init);
    } catch (error) {
      if (
        !(error instanceof ApiClientError) ||
        error.code !== "RUNNER_DISPATCH_FAILED" ||
        !error.retryable
      ) {
        throw error;
      }
      return this.request(path, schema, init);
    }
  }

  private async request<T>(
    path: string,
    dataSchema: z.ZodType<T>,
    init: RequestInit = { method: "GET" },
    timeoutMs = this.requestTimeoutMs,
  ): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (
      init.body !== undefined &&
      !(typeof FormData !== "undefined" && init.body instanceof FormData)
    ) {
      headers["content-type"] = "application/json";
    }
    for (const [name, value] of new Headers(init.headers).entries()) {
      headers[name] = value;
    }
    const sessionRoute = /^\/api\/sessions\/([^/?]+)/u.exec(path);
    if (
      sessionRoute?.[1] !== undefined &&
      headers.authorization === undefined
    ) {
      let sessionId: string;
      try {
        sessionId = decodeURIComponent(sessionRoute[1]);
      } catch {
        throw new ApiClientError({
          code: "INVALID_REQUEST",
          message: "session route identifier is malformed",
          status: 0,
        });
      }
      const capability = this.sessionOwnerCapability(sessionId);
      if (capability !== undefined) {
        headers.authorization = `Bearer ${capability}`;
      }
    }

    const controller = new AbortController();
    const callerSignal = init.signal;
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) {
      abortFromCaller();
    } else {
      callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    }

    let response: Response | undefined;
    let responseText: string;
    try {
      const fetcher = this.fetcher ?? globalThis.fetch.bind(globalThis);
      response = await fetcher(`${this.baseUrl}${path}`, {
        ...init,
        method: init.method ?? "GET",
        headers,
        credentials: init.credentials ?? "same-origin",
        signal: controller.signal,
      });
      responseText = await response.text();
    } catch (cause) {
      if (cause instanceof ApiClientError) throw cause;
      if (timedOut) {
        throw new ApiClientError({
          code: "REQUEST_TIMEOUT",
          message: "CounterLab stopped waiting for the API response",
          status: 0,
          retryable: true,
          cause,
        });
      }
      throw new ApiClientError({
        code: response === undefined ? "NETWORK_ERROR" : "INVALID_API_RESPONSE",
        message:
          response === undefined
            ? "CounterLab could not reach the API"
            : "CounterLab could not read the API response",
        status: response?.status ?? 0,
        retryable: response === undefined,
        cause,
      });
    } finally {
      globalThis.clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch (cause) {
      throw new ApiClientError({
        code: "INVALID_API_RESPONSE",
        message: "CounterLab received a non-JSON API response",
        status: response.status,
        cause,
      });
    }

    const parsed = envelopeSchema(dataSchema).safeParse(payload);
    if (!parsed.success) {
      throw new ApiClientError({
        code: "INVALID_API_RESPONSE",
        message: "CounterLab received an invalid API response",
        status: response.status,
        details: { issues: parsed.error.issues },
      });
    }

    if (!parsed.data.ok) {
      throw new ApiClientError({
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        status: parsed.data.error.status ?? response.status,
        ...(parsed.data.error.details === undefined
          ? {}
          : { details: parsed.data.error.details }),
        retryable: parsed.data.error.retryable ?? false,
        ...(parsed.data.requestId === undefined
          ? {}
          : { requestId: parsed.data.requestId }),
      });
    }

    if (!response.ok) {
      throw new ApiClientError({
        code: "INVALID_API_RESPONSE",
        message: "A failed HTTP response contained a success envelope",
        status: response.status,
      });
    }
    await validateSessionAuthorityHashes(parsed.data.data, response.status);
    await validateBoundaryResponseHashes(parsed.data.data, response.status);
    await validateInteractiveResultHashes(parsed.data.data, response.status);
    await validateNativeProofLineage(parsed.data.data, response.status);
    return parsed.data.data;
  }
}

export const counterLabApi = new CounterLabApiClient();

export type {
  ArtifactManifest,
  BeliefTest,
  BoundaryMapAuthorityRefV1,
  BoundaryMapReceiptV1,
  BoundaryMapResultV1,
  BoundaryMapVerificationReportV1,
  EvidenceEvent,
  PatchResult,
  PredictionContract,
  ProofBundle,
  PublicProofCapsuleRefV2,
  PublicCompilerEvent,
  ReasoningDiff,
  ReasoningDiffV2,
  RunnerJob,
  SessionState,
  TransferResult,
  VerifiedResultSet,
  LeakageVerifiedResultSet,
  ImbalanceVerifiedResultSet,
  LearnerHintId,
  LearnerInteractionInput,
  LearnerInteractionReceipt,
};
