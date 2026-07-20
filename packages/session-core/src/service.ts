import {
  BeliefSpecV2Schema,
  BoundaryMapAuthorityRefV1Schema,
  EvidenceVerdictSchema,
  HostedVerifiedResultSetV2Schema,
  HostedPatchAuthorityRefV5Schema,
  HostedResultAuthorityRefV5Schema,
  PatchResultSchema,
  PredictionContractSchema,
  PrePredictionBeliefSpecV2Schema,
  PrePredictionBeliefTestV1Schema,
  ProofBundleSchema,
  ProofCapsuleRefV2Schema,
  ReasoningDiffSchema,
  ReasoningDiffV2Schema,
  TransferResultSchema,
  VerifiedOperationSummaryV1Schema,
  VerifiedResultSetSchema,
  type BeliefSpecV2,
} from "@counterlab/contracts";

import {
  asJsonRecord,
  createEvidenceEvent,
  createSessionAggregate,
  evolveSession,
  getSessionBeliefAuthority,
  hashCanonical,
  resolveSessionEvidenceAuthority,
  sessionEvidenceInputHashes,
  type CounterLabSession,
  type EventDraft,
  type EvidenceEvent,
  type IdAndClock,
  type JsonRecord,
  type SessionMode,
  InvalidSessionTransitionError,
  PredictionAlreadyCommittedError,
  requiredString,
  reviseSession,
  SessionInputError,
  SessionNotFoundError,
} from "./domain.js";
import type { SessionRepository } from "./repository.js";

const DEFAULT_RUNTIME: IdAndClock = {
  id: (prefix) => `${prefix}_${crypto.randomUUID()}`,
  now: () => new Date(),
};

export interface CreateSessionInput {
  id?: string;
  artifactId: string;
  mode: SessionMode;
  sourceSessionId?: string;
}

export class SessionService {
  private readonly runtime: IdAndClock;

  constructor(
    private readonly repository: SessionRepository,
    runtime: Partial<IdAndClock> = {},
  ) {
    this.runtime = { ...DEFAULT_RUNTIME, ...runtime };
  }

  async createSession(input: CreateSessionInput): Promise<CounterLabSession> {
    const timestamp = this.runtime.now().toISOString();
    const artifactId = requiredString(input.artifactId, "artifactId");
    let restartLineage:
      | {
          sourceSessionId: string;
          sourceState: "INSUFFICIENT_EVIDENCE" | "REJECTED_BY_LEARNER";
          sourceEventHash: string;
          inputHashes: string[];
        }
      | undefined;
    if (input.sourceSessionId !== undefined) {
      const sourceSessionId = requiredString(
        input.sourceSessionId,
        "sourceSessionId",
      );
      const source = await this.requireSession(sourceSessionId);
      if (
        source.state !== "INSUFFICIENT_EVIDENCE" &&
        source.state !== "REJECTED_BY_LEARNER"
      ) {
        throw new SessionInputError(
          "sourceSessionId must reference a closed learner response",
        );
      }
      if (
        source.artifactId !== artifactId ||
        (await hashCanonical(source.mode)) !== (await hashCanonical(input.mode))
      ) {
        throw new SessionInputError(
          "restart session must preserve source artifact and mode",
        );
      }
      const sourceEvent = await this.repository.lastEvent(sourceSessionId);
      if (sourceEvent === undefined) {
        throw new SessionInputError(
          "restart source event chain is unavailable",
        );
      }
      restartLineage = {
        sourceSessionId,
        sourceState: source.state,
        sourceEventHash: sourceEvent.eventHash,
        inputHashes: [await hashCanonical(source), sourceEvent.eventHash],
      };
    }
    const session = createSessionAggregate({
      id: input.id ?? this.runtime.id("session"),
      artifactId,
      mode: input.mode,
      timestamp,
    });
    const event = await createEvidenceEvent({
      sessionId: session.id,
      sequence: 1,
      timestamp,
      eventId: this.runtime.id("event"),
      draft: {
        actor: "system",
        kind: "session.created",
        payload: {
          artifactId: session.artifactId,
          mode: session.mode,
          state: session.state,
          ...(restartLineage === undefined
            ? {}
            : {
                sourceSessionId: restartLineage.sourceSessionId,
                sourceState: restartLineage.sourceState,
                sourceEventHash: restartLineage.sourceEventHash,
              }),
        },
        ...(restartLineage === undefined
          ? {}
          : { inputHashes: restartLineage.inputHashes }),
        outputHashes: [await hashCanonical(session)],
      },
    });
    await this.repository.create(session, event);
    return structuredClone(session);
  }

  async getSession(sessionId: string): Promise<CounterLabSession> {
    const session = await this.repository.find(sessionId);
    if (session === undefined) throw new SessionNotFoundError(sessionId);
    return structuredClone(session);
  }

  async listEvents(sessionId: string): Promise<EvidenceEvent[]> {
    await this.requireSession(sessionId);
    return structuredClone(await this.repository.listEvents(sessionId));
  }

  async proposeBeliefTest(
    sessionId: string,
    beliefTest: unknown,
    provenance: {
      actor?: "gpt-5.6" | "system";
      modelId?: string;
      promptHash?: string;
    } = {},
  ): Promise<CounterLabSession> {
    const parsed = PrePredictionBeliefTestV1Schema.parse(beliefTest);
    return this.transition(
      sessionId,
      "BELIEF_TEST_PROPOSED",
      { beliefTest: parsed },
      {
        actor: provenance.actor ?? "gpt-5.6",
        kind: "belief_test.proposed",
        payload: { beliefTestId: parsed.id },
        ...(provenance.modelId === undefined
          ? {}
          : { modelId: provenance.modelId }),
        ...(provenance.promptHash === undefined
          ? {}
          : { promptHash: provenance.promptHash }),
        outputHashes: [await hashCanonical(parsed)],
      },
    );
  }

  async proposeBeliefSpecV2(
    sessionId: string,
    beliefSpec: unknown,
    provenance: {
      actor?: "gpt-5.6" | "system";
      modelId?: string;
      promptHash?: string;
    } = {},
  ): Promise<CounterLabSession> {
    const parsed = PrePredictionBeliefSpecV2Schema.parse(beliefSpec);
    return this.transition(
      sessionId,
      "BELIEF_TEST_PROPOSED",
      { beliefSpec: parsed },
      {
        actor: provenance.actor ?? "gpt-5.6",
        kind: "belief_spec.proposed",
        payload: {
          beliefSpecId: parsed.id,
          schemaVersion: parsed.schemaVersion,
        },
        ...(provenance.modelId === undefined
          ? {}
          : { modelId: provenance.modelId }),
        ...(provenance.promptHash === undefined
          ? {}
          : { promptHash: provenance.promptHash }),
        outputHashes: [await hashCanonical(parsed)],
      },
    );
  }

  async editBeliefTest(
    sessionId: string,
    beliefTest: unknown,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    if (current.state !== "BELIEF_TEST_PROPOSED") {
      throw new InvalidSessionTransitionError(
        current.state,
        "BELIEF_TEST_PROPOSED",
      );
    }
    if (current.beliefTest === undefined || current.beliefSpec !== undefined) {
      throw new SessionInputError(
        "A v1 Belief Test edit cannot replace a v2 Belief Spec",
      );
    }
    const parsed = PrePredictionBeliefTestV1Schema.parse(beliefTest);
    return this.revise(
      current,
      { beliefTest: parsed },
      {
        actor: "learner",
        kind: "belief_test.edited",
        payload: { beliefTestId: parsed.id },
        inputHashes:
          current.beliefTest === undefined
            ? []
            : [await hashCanonical(current.beliefTest)],
        outputHashes: [await hashCanonical(parsed)],
      },
    );
  }

  async editBeliefSpecV2(
    sessionId: string,
    beliefSpec: unknown,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    if (current.state !== "BELIEF_TEST_PROPOSED") {
      throw new InvalidSessionTransitionError(
        current.state,
        "BELIEF_TEST_PROPOSED",
      );
    }
    if (current.beliefSpec === undefined || current.beliefTest !== undefined) {
      throw new SessionInputError(
        "A v2 Belief Spec is required before a v2 edit",
      );
    }
    const candidate = BeliefSpecV2Schema.parse(beliefSpec);
    if (candidate.id !== current.beliefSpec.id) {
      throw new SessionInputError("A Belief Spec edit cannot change its id");
    }
    if (candidate.concept !== current.beliefSpec.concept) {
      throw new SessionInputError(
        "A Belief Spec edit cannot change its concept",
      );
    }
    const parsed = BeliefSpecV2Schema.parse({
      ...withoutSelectedAlternative(candidate),
      learnerDecision: "EDITED",
    });
    return this.revise(
      current,
      { beliefSpec: parsed },
      {
        actor: "learner",
        kind: "belief_spec.edited",
        payload: { beliefSpecId: parsed.id },
        inputHashes: [await hashCanonical(current.beliefSpec)],
        outputHashes: [await hashCanonical(parsed)],
      },
    );
  }

  async selectBeliefAlternative(
    sessionId: string,
    alternativeId: string,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    if (current.state !== "BELIEF_TEST_PROPOSED") {
      throw new InvalidSessionTransitionError(
        current.state,
        "BELIEF_TEST_PROPOSED",
      );
    }
    if (current.beliefSpec === undefined || current.beliefTest !== undefined) {
      throw new SessionInputError(
        "Alternative selection requires a v2 Belief Spec",
      );
    }
    const selectedAlternativeId = requiredString(
      alternativeId,
      "alternativeId",
    );
    if (
      !current.beliefSpec.alternatives.some(
        (alternative) => alternative.id === selectedAlternativeId,
      )
    ) {
      throw new SessionInputError(
        `Unknown Belief Spec alternative: ${selectedAlternativeId}`,
      );
    }
    const selected = BeliefSpecV2Schema.parse({
      ...current.beliefSpec,
      learnerDecision: "ALTERNATIVE_SELECTED",
      selectedAlternativeId,
    });
    return this.revise(
      current,
      { beliefSpec: selected },
      {
        actor: "learner",
        kind: "belief_spec.alternative_selected",
        payload: { beliefSpecId: selected.id, selectedAlternativeId },
        inputHashes: [await hashCanonical(current.beliefSpec)],
        outputHashes: [await hashCanonical(selected)],
      },
    );
  }

  async confirmBeliefTest(sessionId: string): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    const beliefAuthority = getSessionBeliefAuthority(current);
    if (beliefAuthority === undefined) {
      throw new SessionInputError(
        "A proposed Belief Test or Belief Spec is required before confirmation",
      );
    }
    const confirmedBeliefSpec =
      current.beliefSpec === undefined
        ? undefined
        : current.beliefSpec.learnerDecision === "ALTERNATIVE_SELECTED"
          ? current.beliefSpec
          : BeliefSpecV2Schema.parse({
              ...withoutSelectedAlternative(current.beliefSpec),
              learnerDecision: "CONFIRMED",
            });
    return this.transitionFrom(
      current,
      "BELIEF_TEST_CONFIRMED",
      confirmedBeliefSpec === undefined
        ? {}
        : { beliefSpec: confirmedBeliefSpec },
      {
        actor: "learner",
        kind:
          confirmedBeliefSpec === undefined
            ? "belief_test.confirmed"
            : "belief_spec.confirmed",
        payload:
          confirmedBeliefSpec === undefined
            ? { beliefTestId: getObjectString(beliefAuthority, "id") }
            : { beliefSpecId: getObjectString(beliefAuthority, "id") },
        inputHashes: [await hashCanonical(beliefAuthority)],
        ...(confirmedBeliefSpec === undefined
          ? {}
          : { outputHashes: [await hashCanonical(confirmedBeliefSpec)] }),
      },
    );
  }

  async rejectBeliefTest(
    sessionId: string,
    reason: string,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    const beliefAuthority = getSessionBeliefAuthority(current);
    const cleanReason = requiredString(reason, "reason");
    const rejectedBeliefSpec =
      current.beliefSpec === undefined
        ? undefined
        : BeliefSpecV2Schema.parse({
            ...withoutSelectedAlternative(current.beliefSpec),
            learnerDecision: "REJECTED",
          });
    return this.transitionFrom(
      current,
      "REJECTED_BY_LEARNER",
      rejectedBeliefSpec === undefined
        ? {}
        : { beliefSpec: rejectedBeliefSpec },
      {
        actor: "learner",
        kind:
          rejectedBeliefSpec === undefined
            ? "belief_test.rejected"
            : "belief_spec.rejected",
        payload: { reason: cleanReason },
        inputHashes: [await hashCanonical(beliefAuthority)],
        outputHashes: [
          await hashCanonical(
            rejectedBeliefSpec ?? {
              beliefTestId: getObjectString(beliefAuthority, "id"),
              learnerDecision: "REJECTED",
              reason: cleanReason,
            },
          ),
        ],
      },
    );
  }

  async markInsufficientEvidence(
    sessionId: string,
    reason: string,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    const beliefAuthority = getSessionBeliefAuthority(current);
    const cleanReason = requiredString(reason, "reason");
    const insufficientBeliefSpec =
      current.beliefSpec === undefined
        ? undefined
        : BeliefSpecV2Schema.parse({
            ...current.beliefSpec,
            supportState: "INSUFFICIENT_EVIDENCE",
          });
    return this.transitionFrom(
      current,
      "INSUFFICIENT_EVIDENCE",
      insufficientBeliefSpec === undefined
        ? {}
        : { beliefSpec: insufficientBeliefSpec },
      {
        actor: "learner",
        kind:
          insufficientBeliefSpec === undefined
            ? "belief_test.insufficient_evidence"
            : "belief_spec.insufficient_evidence",
        payload: { reason: cleanReason },
        inputHashes: [await hashCanonical(beliefAuthority)],
        outputHashes: [
          await hashCanonical(
            insufficientBeliefSpec ?? {
              beliefTestId: getObjectString(beliefAuthority, "id"),
              learnerDecision: "INSUFFICIENT_EVIDENCE",
              reason: cleanReason,
            },
          ),
        ],
      },
    );
  }

  /** Prediction Contracts are write-once. Every second write is rejected, including retries. */
  async commitPrediction(
    sessionId: string,
    prediction: unknown,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    if (current.prediction !== undefined) {
      throw new PredictionAlreadyCommittedError(sessionId);
    }
    const parsed = PredictionContractSchema.parse(prediction);
    if (parsed.sessionId !== sessionId) {
      throw new SessionInputError(
        "prediction.sessionId must match the session",
      );
    }
    const beliefAuthority = getSessionBeliefAuthority(current);
    const beliefTestId = getObjectString(beliefAuthority, "id");
    if (parsed.beliefTestId !== beliefTestId) {
      throw new SessionInputError(
        "prediction.beliefTestId must match the confirmed Belief Test",
      );
    }
    return this.transitionFrom(
      current,
      "PREDICTION_COMMITTED",
      { prediction: parsed },
      {
        actor: "learner",
        kind: "prediction.committed",
        payload: {
          predictionId: parsed.id,
          immutableHash: parsed.immutableHash,
        },
        outputHashes: [parsed.immutableHash, await hashCanonical(parsed)],
      },
    );
  }

  async startLabCompilation(
    sessionId: string,
    provenance: {
      actor?: "system";
      authority?: "fixed-approved-sample" | "runtime-codex-requested";
    } = {},
  ): Promise<CounterLabSession> {
    return this.transition(
      sessionId,
      "LAB_COMPILING",
      {},
      {
        actor: provenance.actor ?? "system",
        kind: "lab.compilation_started",
        payload:
          provenance.authority === undefined
            ? {}
            : { authority: provenance.authority },
      },
    );
  }

  async rejectLab(
    sessionId: string,
    counterexample: unknown,
  ): Promise<CounterLabSession> {
    return this.transition(
      sessionId,
      "LAB_REJECTED",
      {},
      {
        actor: "verifier",
        kind: "lab.rejected",
        payload: asJsonRecord(counterexample, "counterexample"),
      },
    );
  }

  async verifyLab(
    sessionId: string,
    verification: unknown,
    evidenceHashes: string[] = [],
    verifiedOperationSummary?: unknown,
  ): Promise<CounterLabSession> {
    const validatedEvidenceHashes = evidenceHashes.map((hash, index) => {
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        throw new SessionInputError(
          `evidenceHashes[${index}] must be a lowercase SHA-256 digest`,
        );
      }
      return hash;
    });
    const verificationPayload = asJsonRecord(verification, "verification");
    if ("verifiedOperationSummary" in verificationPayload) {
      throw new SessionInputError(
        "verification cannot define the reserved verifiedOperationSummary field",
      );
    }
    const eventPayload =
      verifiedOperationSummary === undefined
        ? verificationPayload
        : {
            ...verificationPayload,
            verifiedOperationSummary: VerifiedOperationSummaryV1Schema.parse(
              verifiedOperationSummary,
            ),
          };
    return this.transition(
      sessionId,
      "LAB_VERIFIED",
      { labVerification: verification },
      {
        actor: "verifier",
        kind: "lab.verified",
        payload: eventPayload,
        outputHashes: [
          ...new Set(validatedEvidenceHashes),
          await hashCanonical(verification),
        ],
      },
    );
  }

  async recordExperimentResult(
    sessionId: string,
    result: unknown,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    if (current.beliefSpec !== undefined) {
      throw new SessionInputError(
        "Belief Spec v2 sessions require epistemic verification before a result can be released",
      );
    }
    const parsed = VerifiedResultSetSchema.parse(result);
    return this.transitionFrom(
      current,
      "EXPERIMENT_COMPLETED",
      { verifiedResult: parsed },
      {
        actor: "kernel",
        kind: "experiment.completed",
        payload: { resultHash: parsed.resultHash },
        outputHashes: [parsed.resultHash, await hashCanonical(parsed)],
      },
    );
  }

  async recordEpistemicResult(
    sessionId: string,
    input: {
      result: unknown;
      verdict: unknown;
      epistemicReportHash: string;
      resultAuthority?: unknown;
    },
  ): Promise<CounterLabSession> {
    const result = HostedVerifiedResultSetV2Schema.parse(input.result);
    const verdict = EvidenceVerdictSchema.parse(input.verdict);
    const epistemicReportHash = sha256Digest(
      input.epistemicReportHash,
      "epistemicReportHash",
    );
    const resultAuthority =
      input.resultAuthority === undefined
        ? undefined
        : HostedResultAuthorityRefV5Schema.parse(input.resultAuthority);
    if (verdict.kind === "REJECTED") {
      throw new SessionInputError(
        "recordEpistemicResult requires a releasable Evidence Verdict",
      );
    }
    if (result.sessionId !== sessionId) {
      throw new SessionInputError(
        "verifiedResult.sessionId must match the session",
      );
    }
    if (verdict.resultHash !== result.resultHash) {
      throw new SessionInputError(
        "Evidence Verdict result hash must match the verified result",
      );
    }
    const evidenceVerdictHash = await hashCanonical(verdict);
    if (
      resultAuthority !== undefined &&
      (resultAuthority.resultHash !== result.resultHash ||
        resultAuthority.technicalReportHash !== verdict.technicalReportHash ||
        resultAuthority.epistemicReportHash !== epistemicReportHash ||
        resultAuthority.evidenceVerdictHash !== evidenceVerdictHash)
    ) {
      throw new SessionInputError(
        "Hosted result authority does not match the released result, reports, or Evidence Verdict",
      );
    }
    const current = await this.requireSession(sessionId);
    const authority = await resolveSessionEvidenceAuthority({
      ...current,
      verifiedResult: result,
      evidenceVerdict: verdict,
      epistemicReportHash,
    });
    if (authority.protocol !== "v5" || authority.verdict === "REJECTED") {
      throw new SessionInputError(
        "recordEpistemicResult requires Belief Spec v2 scientific authority",
      );
    }
    return this.transitionFrom(
      current,
      "EXPERIMENT_COMPLETED",
      {
        verifiedResult: result,
        evidenceVerdict: verdict,
        epistemicReportHash,
        ...(resultAuthority === undefined ? {} : { resultAuthority }),
      },
      {
        actor: "verifier",
        kind: "experiment.evidence_verified",
        payload: {
          verdict: verdict.kind,
          resultHash: result.resultHash,
          epistemicReportHash,
        },
        outputHashes: [
          ...new Set([
            result.resultHash,
            verdict.irHash,
            verdict.technicalReportHash,
            epistemicReportHash,
            await hashCanonical(result),
            await hashCanonical(verdict),
            ...(resultAuthority === undefined
              ? []
              : [await hashCanonical(resultAuthority)]),
          ]),
        ],
      },
    );
  }

  async recordEpistemicRejection(
    sessionId: string,
    input: { verdict: unknown; epistemicReportHash: string },
  ): Promise<CounterLabSession> {
    const verdict = EvidenceVerdictSchema.parse(input.verdict);
    const epistemicReportHash = sha256Digest(
      input.epistemicReportHash,
      "epistemicReportHash",
    );
    if (verdict.kind !== "REJECTED" || verdict.resultReleased !== false) {
      throw new SessionInputError(
        "recordEpistemicRejection requires a no-release Evidence Verdict",
      );
    }
    const current = await this.requireSession(sessionId);
    if (current.state !== "LAB_VERIFIED") {
      throw new SessionInputError(
        "epistemic rejection requires a verified lab awaiting result authority",
      );
    }
    if (current.verifiedResult !== undefined) {
      throw new SessionInputError(
        "epistemic rejection cannot replace an already released result",
      );
    }
    const authority = await resolveSessionEvidenceAuthority({
      ...current,
      evidenceVerdict: verdict,
      epistemicReportHash,
    });
    if (authority.protocol !== "v5" || authority.verdict !== "REJECTED") {
      throw new SessionInputError(
        "recordEpistemicRejection requires rejected Belief Spec v2 authority",
      );
    }
    return this.revise(
      current,
      { evidenceVerdict: verdict, epistemicReportHash },
      {
        actor: "verifier",
        kind: "experiment.evidence_rejected",
        payload: { verdict: verdict.kind, epistemicReportHash },
        outputHashes: [
          ...new Set([
            verdict.irHash,
            verdict.technicalReportHash,
            epistemicReportHash,
            await hashCanonical(verdict),
          ]),
        ],
      },
    );
  }

  async recordBoundaryMapAuthority(
    sessionId: string,
    input: unknown,
  ): Promise<CounterLabSession> {
    const boundaryMapAuthority = BoundaryMapAuthorityRefV1Schema.parse(input);
    const current = await this.requireSession(sessionId);
    const authority = await resolveSessionEvidenceAuthority(current);
    if (authority.protocol !== "v5" || authority.verdict === "REJECTED") {
      throw new SessionInputError(
        "Boundary Map authority requires releasable Belief Spec v2 evidence",
      );
    }

    const receipt = boundaryMapAuthority.receipt;
    const evidenceVerdictHash = await hashCanonical(authority.evidenceVerdict);
    if (receipt.sessionId !== current.id) {
      throw new SessionInputError(
        "Boundary Map receipt session does not match the session",
      );
    }
    if (
      receipt.experimentIrHash !== authority.lineage.selectedExperimentIrHash
    ) {
      throw new SessionInputError(
        "Boundary Map receipt Experiment IR hash does not match the selected experiment",
      );
    }
    if (receipt.authoritativeResultHash !== authority.result.resultHash) {
      throw new SessionInputError(
        "Boundary Map receipt result hash does not match the authoritative result",
      );
    }
    if (receipt.evidenceVerdictHash !== evidenceVerdictHash) {
      throw new SessionInputError(
        "Boundary Map receipt verdict hash does not match the Evidence Verdict",
      );
    }

    const { integrity, receiptHash, ...receiptContent } = receipt;
    if (integrity.contentHash !== (await hashCanonical(receiptContent))) {
      throw new SessionInputError(
        "Boundary Map receipt content hash is invalid",
      );
    }
    if (
      receiptHash !== (await hashCanonical({ ...receiptContent, integrity }))
    ) {
      throw new SessionInputError("Boundary Map receipt hash is invalid");
    }

    return this.transitionFrom(
      current,
      "BOUNDARY_VERIFIED",
      { boundaryMapAuthority },
      {
        actor: "verifier",
        kind: "boundary_map.verified",
        payload: {
          jobId: boundaryMapAuthority.jobId,
          sweepId: boundaryMapAuthority.sweepId,
          resultHash: boundaryMapAuthority.resultHash,
          cellCount: boundaryMapAuthority.cellCount,
        },
        inputHashes: await sessionEvidenceInputHashes(authority),
        outputHashes: [
          ...new Set([
            boundaryMapAuthority.resultHash,
            boundaryMapAuthority.verificationReportHash,
            integrity.contentHash,
            receiptHash,
          ]),
        ],
      },
    );
  }

  async recordRevision(
    sessionId: string,
    revision: string,
  ): Promise<CounterLabSession> {
    const cleanRevision = requiredString(revision, "revision");
    const current = await this.requireSession(sessionId);
    const authority = await resolveSessionEvidenceAuthority(current);
    if (authority.verdict === "REJECTED") {
      throw new SessionInputError(
        "Rejected evidence cannot advance to learner revision",
      );
    }
    if (authority.protocol === "v5") {
      const boundaryMapAuthority = current.boundaryMapAuthority;
      if (
        current.state !== "BOUNDARY_VERIFIED" ||
        boundaryMapAuthority === undefined
      ) {
        throw new SessionInputError(
          "Belief Spec v2 evidence requires a verified Boundary Map before learner revision",
        );
      }
      const evidenceVerdictHash = await hashCanonical(
        authority.evidenceVerdict,
      );
      if (
        boundaryMapAuthority.receipt.sessionId !== current.id ||
        boundaryMapAuthority.receipt.experimentIrHash !==
          authority.lineage.selectedExperimentIrHash ||
        boundaryMapAuthority.receipt.authoritativeResultHash !==
          authority.result.resultHash ||
        boundaryMapAuthority.receipt.evidenceVerdictHash !== evidenceVerdictHash
      ) {
        throw new SessionInputError(
          "Boundary Map authority no longer matches the released experiment evidence",
        );
      }
    }
    return this.transitionFrom(
      current,
      "REVISION_RECORDED",
      { revision: cleanRevision },
      {
        actor: "learner",
        kind: "revision.recorded",
        payload: { revision: cleanRevision },
        inputHashes: await sessionEvidenceInputHashes(authority),
        outputHashes: [await hashCanonical(cleanRevision)],
      },
    );
  }

  async startTransfer(sessionId: string): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    const authority = await resolveSessionEvidenceAuthority(current);
    if (authority.verdict === "REJECTED") {
      throw new SessionInputError(
        "Rejected evidence cannot advance to transfer",
      );
    }
    if (current.state === "TRANSFER_IN_PROGRESS") {
      return structuredClone(current);
    }
    return this.transitionFrom(
      current,
      "TRANSFER_IN_PROGRESS",
      {},
      {
        actor: "learner",
        kind: "transfer.started",
        payload: {},
        inputHashes: await sessionEvidenceInputHashes(authority),
      },
    );
  }

  async recordTransferResult(
    sessionId: string,
    result: unknown,
  ): Promise<CounterLabSession> {
    const parsed = TransferResultSchema.parse(result);
    if (parsed.sessionId !== sessionId) {
      throw new SessionInputError(
        "transferResult.sessionId must match the session",
      );
    }
    const passed = parsed.outcome === "PASSED";
    return this.transition(
      sessionId,
      passed ? "TRANSFER_PASSED" : "TRANSFER_FAILED",
      { transferResult: parsed },
      {
        actor: "verifier",
        kind: passed ? "transfer.passed" : "transfer.failed",
        payload: { outcome: parsed.outcome, resultHash: parsed.resultHash },
        outputHashes: [parsed.resultHash, await hashCanonical(parsed)],
      },
    );
  }

  async startPatchCompilation(
    sessionId: string,
    provenance: {
      actor?: "system";
      authority?: "fixed-approved-sample" | "runtime-codex-requested";
    } = {},
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    const authority = await resolveSessionEvidenceAuthority(current);
    if (authority.verdict === "REJECTED") {
      throw new SessionInputError("Rejected evidence cannot unlock repair");
    }
    if (authority.protocol === "v5" && authority.verdict === "INCONCLUSIVE") {
      throw new SessionInputError(
        "PATCH_LOCKED_INCONCLUSIVE: INCONCLUSIVE evidence cannot unlock repair",
      );
    }
    return this.transitionFrom(
      current,
      "PATCH_COMPILING",
      {},
      {
        actor: provenance.actor ?? "system",
        kind: "patch.compilation_started",
        payload:
          provenance.authority === undefined
            ? {}
            : { authority: provenance.authority },
        inputHashes: await sessionEvidenceInputHashes(authority),
      },
    );
  }

  async rejectPatch(
    sessionId: string,
    counterexample: unknown,
  ): Promise<CounterLabSession> {
    return this.transition(
      sessionId,
      "PATCH_REJECTED",
      {},
      {
        actor: "verifier",
        kind: "patch.rejected",
        payload: asJsonRecord(counterexample, "counterexample"),
      },
    );
  }

  async verifyPatch(
    sessionId: string,
    result: unknown,
    authorityRef?: unknown,
  ): Promise<CounterLabSession> {
    const parsed = PatchResultSchema.parse(result);
    const patchAuthority =
      authorityRef === undefined
        ? undefined
        : HostedPatchAuthorityRefV5Schema.parse(authorityRef);
    if (parsed.sessionId !== sessionId) {
      throw new SessionInputError(
        "patchResult.sessionId must match the session",
      );
    }
    if (parsed.status !== "VERIFIED") {
      throw new SessionInputError(
        "A verified patch result is required to pass the patch gate",
      );
    }
    if (
      patchAuthority !== undefined &&
      (patchAuthority.patchResultHash !== parsed.resultHash ||
        patchAuthority.patchedArtifactHash !== parsed.patchedArtifactHash)
    ) {
      throw new SessionInputError(
        "Hosted patch authority does not match the verified patch result",
      );
    }
    return this.transition(
      sessionId,
      "PATCH_VERIFIED",
      {
        patchResult: parsed,
        ...(patchAuthority === undefined ? {} : { patchAuthority }),
      },
      {
        actor: "verifier",
        kind: "patch.verified",
        payload: {
          status: parsed.status,
          resultHash: parsed.resultHash,
          ...(patchAuthority === undefined ? {} : { patchAuthority }),
        },
        outputHashes: [
          parsed.resultHash,
          parsed.patchHash,
          parsed.patchedArtifactHash,
          await hashCanonical(parsed),
          ...(patchAuthority === undefined
            ? []
            : [await hashCanonical(patchAuthority)]),
        ],
      },
    );
  }

  async issueReasoningDiff(
    sessionId: string,
    reasoningDiff: unknown,
    proofBundle: unknown,
  ): Promise<CounterLabSession> {
    const parsedDiff = ReasoningDiffSchema.parse(reasoningDiff);
    const parsedBundle = ProofBundleSchema.parse(proofBundle);
    if (
      parsedDiff.sessionId !== sessionId ||
      parsedBundle.sessionId !== sessionId
    ) {
      throw new SessionInputError(
        "Reasoning Diff and Proof Bundle must match the session",
      );
    }
    const [reasoningDiffHash, proofBundleHash] = await Promise.all([
      hashCanonical(parsedDiff),
      hashCanonical(parsedBundle),
    ]);
    return this.transition(
      sessionId,
      "REASONING_DIFF_ISSUED",
      { reasoningDiff: parsedDiff, proofBundle: parsedBundle },
      {
        actor: "system",
        kind: "reasoning_diff.issued",
        payload: {},
        outputHashes: [reasoningDiffHash, proofBundleHash],
      },
    );
  }

  async issueReasoningDiffV2(
    sessionId: string,
    reasoningDiff: unknown,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    const parsed = ReasoningDiffV2Schema.parse(reasoningDiff);
    const authority = await resolveSessionEvidenceAuthority(current);
    const boundary = current.boundaryMapAuthority;
    const transfer = current.transferResult;
    const patch = current.patchResult;
    const patchAuthority = HostedPatchAuthorityRefV5Schema.safeParse(
      current.patchAuthority,
    );
    if (
      current.mode.kind !== "live_notebook" ||
      authority.protocol !== "v5" ||
      authority.verdict !== "SUPPORTS"
    ) {
      throw new SessionInputError(
        "Native Reasoning Diff requires supporting v5 evidence authority",
      );
    }
    if (
      boundary === undefined ||
      transfer?.outcome !== "PASSED" ||
      patch?.status !== "VERIFIED" ||
      authority.resultAuthority === undefined ||
      !patchAuthority.success ||
      parsed.sessionId !== sessionId ||
      parsed.concept !== authority.concept
    ) {
      throw new SessionInputError(
        "Native Reasoning Diff requires supporting v5 evidence, verified Boundary, passed transfer, and verified patch authority",
      );
    }
    const [beliefSpecHash, evidenceVerdictHash] = await Promise.all([
      hashCanonical(authority.beliefSpec),
      hashCanonical(authority.evidenceVerdict),
    ]);
    const expectedAuthority = {
      artifactManifestHash: authority.lineage.artifactManifestHash,
      beliefSpecHash,
      predictionHash: authority.prediction.immutableHash,
      experimentIrHash: authority.lineage.selectedExperimentIrHash,
      selectionHash: authority.lineage.selectionHash,
      authoritativeResultHash: authority.result.resultHash,
      evidenceVerdictHash,
      epistemicReportHash: authority.epistemicReportHash,
      boundaryMapHash: boundary.resultHash,
      boundaryReceiptHash: boundary.receipt.receiptHash,
      transferResultHash: transfer.resultHash,
      patchResultHash: patch.resultHash,
      patchedArtifactHash: patch.patchedArtifactHash,
      patchPlanHash: patchAuthority.data.patchPlanHash,
    };
    for (const [field, expected] of Object.entries(expectedAuthority)) {
      if (
        parsed.authority[field as keyof typeof parsed.authority] !== expected
      ) {
        throw new SessionInputError(
          `Native Reasoning Diff ${field} does not match frozen session authority`,
        );
      }
    }
    const events = await this.repository.listEvents(sessionId);
    const eventHashes = new Set(events.map((event) => event.eventHash));
    if (
      eventHashes.size !== events.length ||
      new Set(parsed.evidenceEventHashes).size !==
        parsed.evidenceEventHashes.length ||
      parsed.evidenceEventHashes.some(
        (eventHash) => !eventHashes.has(eventHash),
      )
    ) {
      throw new SessionInputError(
        "Native Reasoning Diff contains an unresolved evidence event hash",
      );
    }
    const requiredKinds = [
      "belief_spec.confirmed",
      "prediction.committed",
      "lab.verified",
      "experiment.evidence_verified",
      "boundary_map.verified",
      "revision.recorded",
      "transfer.passed",
      "patch.verified",
    ];
    for (const kind of requiredKinds) {
      const event = events.find((candidate) => candidate.kind === kind);
      if (
        event === undefined ||
        !parsed.evidenceEventHashes.includes(event.eventHash)
      ) {
        throw new SessionInputError(
          `Native Reasoning Diff must resolve the ${kind} evidence event`,
        );
      }
    }
    const eventPositions = parsed.evidenceEventHashes.map((eventHash) =>
      events.findIndex((event) => event.eventHash === eventHash),
    );
    if (
      eventPositions.some(
        (position, index) =>
          index > 0 && position <= eventPositions[index - 1]!,
      )
    ) {
      throw new SessionInputError(
        "Native Reasoning Diff evidence event hashes must preserve chain order",
      );
    }
    const reasoningDiffHash = await hashCanonical(parsed);
    return this.transitionFrom(
      current,
      "REASONING_DIFF_ISSUED",
      { reasoningDiffV2: parsed },
      {
        actor: "system",
        kind: "reasoning_diff_v2.issued",
        payload: { reasoningDiffId: parsed.id, schemaVersion: "2" },
        inputHashes: parsed.evidenceEventHashes,
        outputHashes: [reasoningDiffHash],
      },
    );
  }

  async issueProofCapsuleV2(
    sessionId: string,
    proofCapsule: unknown,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    const parsed = ProofCapsuleRefV2Schema.parse(proofCapsule);
    const reasoningDiff = ReasoningDiffV2Schema.safeParse(
      current.reasoningDiffV2,
    );
    if (
      current.mode.kind !== "live_notebook" ||
      !reasoningDiff.success ||
      parsed.sessionId !== sessionId ||
      parsed.objectKey !==
        `proof-capsules/${sessionId}/${parsed.bytesHash}.counterlab` ||
      parsed.reasoningDiffHash !== (await hashCanonical(reasoningDiff.data))
    ) {
      throw new SessionInputError(
        "Proof Capsule reference does not match the native Reasoning Diff session authority",
      );
    }
    const events = await this.repository.listEvents(sessionId);
    const eventChainHead = events.at(-1)?.eventHash;
    if (
      eventChainHead === undefined ||
      parsed.eventChainHead !== eventChainHead
    ) {
      throw new SessionInputError(
        "Proof Capsule event-chain head does not match persisted evidence",
      );
    }
    const referenceHash = await hashCanonical(parsed);
    return this.transitionFrom(
      current,
      "PROOF_CAPSULE_ISSUED",
      { proofCapsule: parsed },
      {
        actor: "system",
        kind: "proof_capsule.issued",
        payload: {
          capsuleId: parsed.capsuleId,
          rootHash: parsed.rootHash,
          byteLength: parsed.byteLength,
        },
        inputHashes: [parsed.reasoningDiffHash, parsed.eventChainHead],
        outputHashes: [parsed.rootHash, parsed.bytesHash, referenceHash],
      },
    );
  }

  private async transition(
    sessionId: string,
    to: CounterLabSession["state"],
    patch: Partial<CounterLabSession>,
    draft: EventDraft,
  ): Promise<CounterLabSession> {
    return this.transitionFrom(
      await this.requireSession(sessionId),
      to,
      patch,
      draft,
    );
  }

  private async transitionFrom(
    current: CounterLabSession,
    to: CounterLabSession["state"],
    patch: Partial<CounterLabSession>,
    draft: EventDraft,
  ): Promise<CounterLabSession> {
    const timestamp = this.runtime.now().toISOString();
    const next = evolveSession(current, to, timestamp, patch);
    await this.persist(current, next, timestamp, draft);
    return structuredClone(next);
  }

  private async revise(
    current: CounterLabSession,
    patch: Partial<CounterLabSession>,
    draft: EventDraft,
  ): Promise<CounterLabSession> {
    const timestamp = this.runtime.now().toISOString();
    const next = reviseSession(current, timestamp, patch);
    await this.persist(current, next, timestamp, draft);
    return structuredClone(next);
  }

  private async persist(
    current: CounterLabSession,
    next: CounterLabSession,
    timestamp: string,
    draft: EventDraft,
  ): Promise<void> {
    const previous = await this.repository.lastEvent(current.id);
    const event = await createEvidenceEvent({
      sessionId: current.id,
      sequence: (previous?.sequence ?? 0) + 1,
      timestamp,
      eventId: this.runtime.id("event"),
      ...(previous === undefined
        ? {}
        : { previousEventHash: previous.eventHash }),
      draft,
    });
    await this.repository.save(next, current.version, event);
  }

  private async requireSession(sessionId: string): Promise<CounterLabSession> {
    return this.getSession(requiredString(sessionId, "sessionId"));
  }
}

function getObjectString(value: unknown, field: string): string {
  const record = asJsonRecord(value, "value");
  return requiredString(record[field], field);
}

function sha256Digest(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new SessionInputError(`${field} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function withoutSelectedAlternative(
  beliefSpec: BeliefSpecV2,
): Omit<BeliefSpecV2, "selectedAlternativeId"> {
  const { selectedAlternativeId, ...unselected } = beliefSpec;
  void selectedAlternativeId;
  return unselected;
}
