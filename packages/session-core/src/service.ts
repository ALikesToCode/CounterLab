import {
  BeliefTestSchema,
  PatchResultSchema,
  PredictionContractSchema,
  ProofBundleSchema,
  ReasoningDiffSchema,
  TransferResultSchema,
  VerifiedResultSetSchema,
} from "@counterlab/contracts";

import {
  asJsonRecord,
  createEvidenceEvent,
  createSessionAggregate,
  evolveSession,
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

  async confirmBeliefTest(sessionId: string): Promise<CounterLabSession> {
    const current = await this.requireSession(sessionId);
    if (current.beliefTest === undefined) {
      throw new SessionInputError(
        "A proposed Belief Test is required before confirmation",
      );
    }
    return this.transitionFrom(
      current,
      "BELIEF_TEST_CONFIRMED",
      {},
      {
        actor: "learner",
        kind: "belief_test.confirmed",
        payload: { beliefTestId: getObjectString(current.beliefTest, "id") },
        inputHashes: [await hashCanonical(current.beliefTest)],
      },
    );
  }

  async rejectBeliefTest(
    sessionId: string,
    reason: string,
  ): Promise<CounterLabSession> {
    return this.transition(
      sessionId,
      "REJECTED_BY_LEARNER",
      {},
      {
        actor: "learner",
        kind: "belief_test.rejected",
        payload: { reason: requiredString(reason, "reason") },
      },
    );
  }

  async markInsufficientEvidence(
    sessionId: string,
    reason: string,
  ): Promise<CounterLabSession> {
    return this.transition(
      sessionId,
      "INSUFFICIENT_EVIDENCE",
      {},
      {
        actor: "learner",
        kind: "belief_test.insufficient_evidence",
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
    const beliefTestId = getObjectString(current.beliefTest, "id");
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
  ): Promise<CounterLabSession> {
    return this.transition(
      sessionId,
      "LAB_VERIFIED",
      { labVerification: verification },
      {
        actor: "verifier",
        kind: "lab.verified",
        payload: asJsonRecord(verification, "verification"),
        outputHashes: [await hashCanonical(verification)],
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
