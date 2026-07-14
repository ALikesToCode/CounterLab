import {
  ExperimentPlanSchema,
  type ArtifactManifest,
  type EvidenceEvent,
  type ProofBundle,
  type ReasoningDiff,
} from "@counterlab/contracts";
import { createProofBundle } from "@counterlab/proof-bundle";
import type { CounterLabSession } from "@counterlab/session-core";

import experimentPlanValue from "../../../replays/leakage-01/experiment-plan.json";
import externalVerifierValue from "../../../replays/leakage-01/external-verifier-report.json";
import labVerificationValue from "../../../replays/leakage-01/lab-verification.json";
import publicTestsValue from "../../../replays/leakage-01/public-tests-report.json";

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_OBJECT = /^[a-f0-9]{40,64}$/;

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Stored replay evidence is missing ${field}`);
  }
  return value;
}

function requiredHash(value: unknown, field: string): string {
  const hash = requiredString(value, field);
  if (!SHA256.test(hash)) throw new Error(`${field} is not a SHA-256 digest`);
  return hash;
}

function requiredGitObject(value: unknown): string {
  const object = requiredString(value, "commitHash");
  if (!GIT_OBJECT.test(object)) throw new Error("commitHash is invalid");
  return object;
}

function requiredSessionEvidence(session: CounterLabSession) {
  if (
    session.beliefTest === undefined ||
    session.prediction === undefined ||
    session.verifiedResult === undefined ||
    session.revision === undefined ||
    session.transferResult === undefined ||
    session.patchResult === undefined
  ) {
    throw new Error("Verified session evidence is incomplete");
  }
  return {
    beliefTest: session.beliefTest,
    prediction: session.prediction,
    result: session.verifiedResult,
    revision: session.revision,
    transfer: session.transferResult,
    patch: session.patchResult,
  };
}

export function createSampleReasoningProof(input: {
  session: CounterLabSession;
  manifest: ArtifactManifest;
  events: EvidenceEvent[];
  issuedAt: string;
  signingKey?: string;
}): { reasoningDiff: ReasoningDiff; proofBundle: ProofBundle } {
  const evidence = requiredSessionEvidence(input.session);
  const event = (kind: string) => {
    const found = input.events.find((candidate) => candidate.kind === kind);
    if (found === undefined) throw new Error(`Evidence event ${kind} is missing`);
    return found;
  };
  const groupRun = evidence.result.runs.find(
    (candidate) => candidate.id === "customer_group_split",
  );
  if (groupRun === undefined) throw new Error("Group result is missing");

  const reasoningDiff: ReasoningDiff = {
    schemaVersion: "1",
    id: `reasoning_${crypto.randomUUID()}`,
    sessionId: input.session.id,
    dimensions: {
      belief: {
        before: evidence.beliefTest.learnerClaim,
        after: evidence.revision,
      },
      prediction: {
        before: `${evidence.prediction.choice} at ${evidence.prediction.confidence}% confidence`,
        after: `Customer-group accuracy ${groupRun.metrics.accuracy.toFixed(3)} with zero customer overlap`,
      },
      code: {
        before: "Random row split with customer identity in model features",
        after:
          "Cell 3 uses customer-group evaluation and removes customer identity; unrelated cells retain their source hashes",
      },
      transfer: {
        before: "The entity-boundary rule had not been tested on a new surface",
        after:
          "The fixed forecasting evaluator passed the time-aware split and future-information checks",
      },
    },
    evidenceEventHashes: [
      event("prediction.committed").eventHash,
      event("experiment.completed").eventHash,
      event("transfer.passed").eventHash,
      event("patch.verified").eventHash,
    ],
    issuedAt: input.issuedAt,
  };

  const publicTestsReportHash = requiredHash(
    publicTestsValue.reportHash,
    "publicTests.reportHash",
  );
  const verifierReportHash = requiredHash(
    externalVerifierValue.reportHash,
    "externalVerifier.reportHash",
  );
  const modelEvent = event("belief_test.proposed");
  const experimentPlan = ExperimentPlanSchema.parse(experimentPlanValue);
  const proofBundle = createProofBundle(
    {
      schemaVersion: "1",
      bundleId: `proof_${crypto.randomUUID()}`,
      sessionId: input.session.id,
      replayId: "leakage-01",
      createdAt: input.issuedAt,
      events: input.events,
      artifactManifest: input.manifest,
      beliefTest: evidence.beliefTest,
      predictionContract: evidence.prediction,
      experimentPlan,
      generatedAdapter: {
        sha256: requiredHash(labVerificationValue.adapterHash, "adapterHash"),
        commitHash: requiredGitObject(labVerificationValue.commitHash),
      },
      publicTests: {
        passed: publicTestsValue.passed,
        failed: publicTestsValue.failed,
        command: requiredString(publicTestsValue.command, "public test command"),
        reportHash: publicTestsReportHash,
      },
      externalVerifier: {
        status: "VERIFIED",
        verifiedInvariants: externalVerifierValue.verifiedInvariants,
        mutations: externalVerifierValue.mutations,
        reportHash: verifierReportHash,
      },
      verifiedResultSet: evidence.result,
      learnerRevision: {
        text: evidence.revision,
        recordedAt: event("revision.recorded").timestamp,
        eventHash: event("revision.recorded").eventHash,
      },
      transferResult: evidence.transfer,
      patchResult: evidence.patch,
      reasoningDiff,
      versions: {
        environment: "Cloudflare Worker with recorded local Docker runner evidence",
        dependencies: "pnpm-lock.yaml and requirements.lock.txt",
        fixture: evidence.result.fixture.sha256,
        kernel: evidence.result.kernelVersion,
        verifier: "leakage-verifier-v1",
        prompt: modelEvent.promptHash ?? modelEvent.modelId ?? "approved-sample-v1",
        model: modelEvent.modelId ?? "approved-sample-v1",
        template: requiredGitObject(labVerificationValue.commitHash),
      },
      limitations: [
        "Verification covers the documented public entity-leakage experiment and supported notebook path.",
        "Docker enforcement is evidence for this local run, not a formal sandbox proof.",
        "Passing transfer verifies fixed choices for this task; it does not prove global learner mastery.",
      ],
      reproductionCommands: [
        "./scripts/reproduce-session.sh leakage-01",
        "./scripts/replay-patch.sh leakage-01",
        "./scripts/run-mutations.sh leakage",
      ],
    },
    input.signingKey === undefined ? {} : { signingKey: input.signingKey },
  );
  return { reasoningDiff, proofBundle };
}

export const sampleLabEvidenceHashes = {
  adapter: requiredHash(labVerificationValue.adapterHash, "adapterHash"),
  publicTests: requiredHash(
    publicTestsValue.reportHash,
    "publicTests.reportHash",
  ),
  externalVerifier: requiredHash(
    externalVerifierValue.reportHash,
    "externalVerifier.reportHash",
  ),
} as const;

export const sampleLabVerification = labVerificationValue;
