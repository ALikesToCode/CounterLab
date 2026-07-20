import {
  HostedExperimentLineageV5Schema,
  HostedPatchAuthorityRefV5Schema,
  HostedPlanLineageV2Schema,
  VerifiedOperationSummaryV1Schema,
} from "@counterlab/contracts";

import type { EvidenceEvent, PublicCompilerEvent } from "../../api";
import type { StudioContext } from "./types";

const SHA256 = /^[a-f0-9]{64}$/u;

function unique(values: readonly (string | undefined)[]): string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== undefined)),
  ];
}

function joinedOrUnavailable(values: readonly string[], unavailable: string) {
  return values.length === 0 ? unavailable : values.join(" · ");
}

function payloadHash(
  events: readonly EvidenceEvent[],
  kind: string,
  key: string,
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind !== kind) continue;
    const value = event.payload[key];
    if (typeof value === "string" && SHA256.test(value)) return value;
  }
  return undefined;
}

function modelProvenance(
  mode: StudioContext["mode"],
  events: readonly EvidenceEvent[],
): string {
  if (mode === "instant") {
    return "Fixed approved sample framing · no GPT-5.6 call recorded";
  }
  const recorded = events.filter((event) => event.actor === "gpt-5.6");
  if (recorded.length > 0) {
    const models = unique(recorded.map((event) => event.modelId));
    const prompts = unique(recorded.map((event) => event.promptHash));
    const prefix =
      mode === "replay" ? "Recorded original call" : "Recorded call";
    return `${prefix} · model ${joinedOrUnavailable(models, "ID unavailable")} · prompt SHA-256 ${joinedOrUnavailable(prompts, "unavailable")}`;
  }
  if (mode === "replay") {
    return "Replay makes no new GPT-5.6 call · original call metadata unavailable in this event chain";
  }
  return "Unavailable · no GPT-5.6 call event recorded";
}

function codexInvocationProvenance(
  mode: StudioContext["mode"],
  events: readonly EvidenceEvent[],
): string {
  if (mode === "instant") {
    return "Fixed approved sample plans · no Runtime Codex call recorded";
  }
  const requested = events.some(
    (event) =>
      event.actor === "system" &&
      (event.kind === "lab.compilation_started" ||
        event.kind === "patch.compilation_started") &&
      event.payload.authority === "runtime-codex-requested",
  );
  if (mode === "replay") {
    return "Replay makes no new Runtime Codex call · authenticated original invocation receipt unavailable";
  }
  if (requested) {
    return "Requested · no authenticated Runtime Codex invocation receipt recorded";
  }
  return "Unavailable · no authenticated Runtime Codex invocation receipt recorded";
}

function compilerArtifactProvenance(
  mode: StudioContext["mode"],
  events: readonly EvidenceEvent[],
): string {
  if (mode === "instant") {
    return "Fixed approved sample plan · no hosted compiler artifact claim";
  }
  const verifiedCompile = events
    .filter(
      (event) => event.actor === "verifier" && event.kind === "lab.verified",
    )
    .map((event) => {
      const scientific =
        HostedExperimentLineageV5Schema.passthrough().safeParse(event.payload);
      if (scientific.success) {
        return {
          jobId: scientific.data.jobId,
          files: Object.keys(scientific.data.compilerOutputFileHashes),
        };
      }
      const legacy = HostedPlanLineageV2Schema.safeParse(event.payload);
      return legacy.success
        ? { jobId: legacy.data.jobId, files: ["verified plan"] }
        : undefined;
    })
    .find(
      (candidate): candidate is { jobId: string; files: string[] } =>
        candidate !== undefined,
    );
  const verifiedPatch = events
    .filter(
      (event) => event.actor === "verifier" && event.kind === "patch.verified",
    )
    .map((event) =>
      HostedPatchAuthorityRefV5Schema.safeParse(event.payload.patchAuthority),
    )
    .find((candidate) => candidate.success);
  if (verifiedCompile !== undefined) {
    const replayPrefix =
      mode === "replay" ? "Recorded original" : "Verifier-bound";
    const patch =
      verifiedPatch === undefined
        ? ""
        : ` · verified patch job ${verifiedPatch.data.jobId}`;
    return `${replayPrefix} hosted compiler artifacts · job ${verifiedCompile.jobId} · ${verifiedCompile.files.join(" · ")}${patch}`;
  }
  if (mode === "replay") {
    return "Unavailable · no original hosted compiler artifact lineage recorded";
  }
  return "Unavailable · no verifier-bound hosted compiler artifact lineage recorded";
}

function planSummary(events: readonly PublicCompilerEvent[]): string {
  const plan = [...events]
    .reverse()
    .find((event) => event.kind === "plan.summary");
  return plan === undefined
    ? "Unavailable · no public plan summary recorded"
    : `${plan.title} · ${plan.steps.join(" · ")}`;
}

function repairFeedback(events: readonly PublicCompilerEvent[]): string {
  const feedback = [...events]
    .reverse()
    .find((event) => event.kind === "verifier.rejected");
  return feedback === undefined
    ? "Unavailable · no verifier repair feedback recorded"
    : `${feedback.invariant} · ${feedback.counterexample}`;
}

function verifiedOperationSummary(events: readonly EvidenceEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind !== "lab.verified" || event.actor !== "verifier") continue;
    const parsed = VerifiedOperationSummaryV1Schema.safeParse(
      event.payload.verifiedOperationSummary,
    );
    if (!parsed.success) continue;
    const authorityHash =
      parsed.data.authority === "verified-selected-experiment-ir"
        ? event.payload.selectedExperimentIrHash
        : event.payload.planHash;
    if (authorityHash === parsed.data.authorityHash) return parsed.data;
  }
  return undefined;
}

function HashValue({
  value,
  fallback,
}: {
  value: string | undefined;
  fallback: string;
}) {
  return value === undefined ? (
    <>{fallback}</>
  ) : (
    <code title={value}>{value}</code>
  );
}

export function ProvenanceLedger({ context }: { context: StudioContext }) {
  const evidenceEvents = context.evidenceEvents ?? [];
  const lastEvent = evidenceEvents.at(-1);
  const releaseCommits = unique(
    evidenceEvents.map((event) => event.commitHash),
  );
  const candidateVerifierHash = payloadHash(
    evidenceEvents,
    "lab.verified",
    "candidateVerificationReportHash",
  );
  const selectedExperimentIrHash = payloadHash(
    evidenceEvents,
    "lab.verified",
    "selectedExperimentIrHash",
  );
  const operationSummary = verifiedOperationSummary(evidenceEvents);

  return (
    <section aria-label="Recorded provenance and hash domains">
      <h3>Recorded roles</h3>
      <dl className="console-provenance">
        <div>
          <dt>GPT-5.6 analysis</dt>
          <dd>{modelProvenance(context.mode, evidenceEvents)}</dd>
        </div>
        <div>
          <dt>Runtime Codex invocation</dt>
          <dd>{codexInvocationProvenance(context.mode, evidenceEvents)}</dd>
        </div>
        <div>
          <dt>Hosted compiler artifacts</dt>
          <dd>{compilerArtifactProvenance(context.mode, evidenceEvents)}</dd>
        </div>
        <div>
          <dt>Operation IDs</dt>
          <dd>
            {operationSummary === undefined
              ? "Unavailable in the verified public event chain"
              : operationSummary.operationIds.join(" · ")}
          </dd>
        </div>
        <div>
          <dt>Selection reference</dt>
          <dd>
            {operationSummary === undefined
              ? "Unavailable"
              : `${operationSummary.selectionRef} · ${operationSummary.authority}`}
          </dd>
        </div>
        <div>
          <dt>Plan summary</dt>
          <dd>{planSummary(context.events)}</dd>
        </div>
        <div>
          <dt>Repair feedback</dt>
          <dd>{repairFeedback(context.events)}</dd>
        </div>
      </dl>

      <h3>Hash domains</h3>
      <dl className="console-provenance">
        <div>
          <dt>Artifact file SHA-256</dt>
          <dd>
            <HashValue
              value={context.artifact?.fileSha256}
              fallback="Not available"
            />
          </dd>
        </div>
        <div>
          <dt>Session ID</dt>
          <dd>{context.session?.sessionId ?? "Not created"}</dd>
        </div>
        <div>
          <dt>Operation authority SHA-256</dt>
          <dd>
            <HashValue
              value={operationSummary?.authorityHash}
              fallback="No verified operation summary"
            />
          </dd>
        </div>
        <div>
          <dt>Selected Experiment IR SHA-256</dt>
          <dd>
            <HashValue
              value={selectedExperimentIrHash}
              fallback="Not recorded in this event chain"
            />
          </dd>
        </div>
        <div>
          <dt>Candidate verifier report SHA-256</dt>
          <dd>
            <HashValue
              value={candidateVerifierHash}
              fallback="Not recorded in this event chain"
            />
          </dd>
        </div>
        <div>
          <dt>Epistemic verifier report SHA-256</dt>
          <dd>
            <HashValue
              value={context.session?.epistemicReportHash}
              fallback="Locked or unavailable"
            />
          </dd>
        </div>
        <div>
          <dt>Fixed-kernel result SHA-256</dt>
          <dd>
            <HashValue
              value={context.session?.verifiedResult?.resultHash}
              fallback="Locked until verification"
            />
          </dd>
        </div>
        <div>
          <dt>Boundary result SHA-256</dt>
          <dd>
            <HashValue
              value={context.session?.boundaryMapAuthority?.resultHash}
              fallback="Locked until Boundary verification"
            />
          </dd>
        </div>
        <div>
          <dt>Recorded event-chain head SHA-256</dt>
          <dd>
            <HashValue
              value={lastEvent?.eventHash}
              fallback="Stored event chain unavailable"
            />
          </dd>
        </div>
        <div>
          <dt>Proof Capsule root SHA-256</dt>
          <dd>
            <HashValue
              value={context.session?.proofCapsule?.rootHash}
              fallback="Issued after verified repair"
            />
          </dd>
        </div>
        <div>
          <dt>Recorded generator/template commit</dt>
          <dd>
            {joinedOrUnavailable(
              releaseCommits,
              "Unavailable · no generator/template commit recorded",
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
