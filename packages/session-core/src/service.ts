import {
  BeliefSpecV2Schema,
  BeliefTestSchema,
  EvidenceVerdictSchema,
  HostedVerifiedResultSetV2Schema,
  PatchResultSchema,
  PredictionContractSchema,
  ProofBundleSchema,
  ReasoningDiffSchema,
  TransferResultSchema,
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
    const session = createSessionAggregate({
      id: input.id ?? this.runtime.id("session"),
      artifactId: requiredString(input.artifactId, "artifactId"),
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
        },
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
    const parsed = BeliefTestSchema.parse(beliefTest);
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
    const parsed = BeliefSpecV2Schema.parse(beliefSpec);
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
    const parsed = BeliefTestSchema.parse(beliefTest);
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
        payload: { reason: requiredString(reason, "reason") },
      },
    );
  }

  async markInsufficientEvidence(
    sessionId: string,
    reason: string,
  ): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
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
        payload: { reason: requiredString(reason, "reason") },
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

  async startLabCompilation(sessionId: string): Promise<CounterLabSession> {
    return this.transition(
      sessionId,
      "LAB_COMPILING",
      {},
      {
        actor: "codex",
        kind: "lab.compilation_started",
        payload: {},
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
  ): Promise<CounterLabSession> {
    const validatedEvidenceHashes = evidenceHashes.map((hash, index) => {
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        throw new SessionInputError(
          `evidenceHashes[${index}] must be a lowercase SHA-256 digest`,
        );
      }
      return hash;
    });
    return this.transition(
      sessionId,
      "LAB_VERIFIED",
      { labVerification: verification },
      {
        actor: "verifier",
        kind: "lab.verified",
        payload: asJsonRecord(verification, "verification"),
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
    const parsed = VerifiedResultSetSchema.parse(result);
    return this.transition(
      sessionId,
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
    },
  ): Promise<CounterLabSession> {
    const result = HostedVerifiedResultSetV2Schema.parse(input.result);
    const verdict = EvidenceVerdictSchema.parse(input.verdict);
    const epistemicReportHash = sha256Digest(
      input.epistemicReportHash,
      "epistemicReportHash",
    );
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
    return this.transition(
      sessionId,
      "EXPERIMENT_COMPLETED",
      {
        verifiedResult: result,
        evidenceVerdict: verdict,
        epistemicReportHash,
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

  async recordRevision(
    sessionId: string,
    revision: string,
  ): Promise<CounterLabSession> {
    const cleanRevision = requiredString(revision, "revision");
    return this.transition(
      sessionId,
      "REVISION_RECORDED",
      { revision: cleanRevision },
      {
        actor: "learner",
        kind: "revision.recorded",
        payload: { revision: cleanRevision },
        outputHashes: [await hashCanonical(cleanRevision)],
      },
    );
  }

  async startTransfer(sessionId: string): Promise<CounterLabSession> {
    return this.transition(
      sessionId,
      "TRANSFER_IN_PROGRESS",
      {},
      {
        actor: "learner",
        kind: "transfer.started",
        payload: {},
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

  async startPatchCompilation(sessionId: string): Promise<CounterLabSession> {
    return this.transition(
      sessionId,
      "PATCH_COMPILING",
      {},
      {
        actor: "codex",
        kind: "patch.compilation_started",
        payload: {},
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
  ): Promise<CounterLabSession> {
    const parsed = PatchResultSchema.parse(result);
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
    return this.transition(
      sessionId,
      "PATCH_VERIFIED",
      { patchResult: parsed },
      {
        actor: "verifier",
        kind: "patch.verified",
        payload: { status: parsed.status, resultHash: parsed.resultHash },
        outputHashes: [
          parsed.resultHash,
          parsed.patchHash,
          parsed.patchedArtifactHash,
          await hashCanonical(parsed),
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
