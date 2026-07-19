import { useEffect, useRef, useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  type PatchResult,
  type ProofBundle,
  type RunnerJob,
  type SessionView,
} from "../../api";
import { useRunnerEvents } from "../../hooks/useRunnerEvents";
import { recordLearnerInteraction } from "../../features/learner/interactionEvidence";
import { LearnerCompletion } from "../learner/LearnerCompletion";
import { RepairPreview } from "../learner/RepairPreview";
import { DeferredReasoningDiffView } from "../proof/DeferredReasoningDiffView";

const activeJobIdKey = "counterlab.activeRunnerJobId";
const activeJobKindKey = "counterlab.activeRunnerJobKind";

const imbalanceRepairChanges = [
  "class-preserving holdout",
  "majority baseline beside the model",
  "confusion counts and rare-class metrics",
] as const;

const imbalanceRepairPreserves = [
  "target",
  "model family",
  "unrelated cells",
  "original notebook",
] as const;

function eventTitle(kind: string): string {
  const titles: Record<string, string> = {
    "job.started": "Patch job started",
    "plan.summary": "Codex proposed a bounded repair plan",
    "artifact.read": "Evidence references resolved",
    "file.created": "Patch Plan created",
    "diff.updated": "Notebook-cell diff prepared",
    "command.completed": "Fixed patch operation completed",
    "verifier.rejected": "Verifier rejected the plan",
    "repair.started": "Codex repair started",
    "verifier.verified": "External verifier accepted the repair",
    "result.ready": "Patched copy is ready",
    "job.failed": "Patch job stopped",
  };
  return titles[kind] ?? kind.replaceAll(".", " ");
}

export function ImbalancePatchReview({
  session,
  updateSession,
}: {
  session: SessionView;
  updateSession: (session: SessionView) => void;
}) {
  const runner = useRunnerEvents();
  const [patch, setPatch] = useState<PatchResult | null>(
    session.patchResult ?? null,
  );
  const [proof, setProof] = useState<ProofBundle | null>(
    session.proofBundle ?? null,
  );
  const [job, setJob] = useState<RunnerJob | null>(null);
  const [busy, setBusy] = useState(session.state === "PATCH_COMPILING");
  const [error, setError] = useState<string | null>(null);
  const completionFocused = useRef(false);

  useEffect(() => {
    if (patch === null) {
      completionFocused.current = false;
      return;
    }
    if (completionFocused.current) return;
    completionFocused.current = true;
    document.getElementById("imbalance-completion-title")?.focus();
  }, [patch]);

  const finishJob = async (jobId: string) => {
    const completed = await runner.waitForJob({
      sessionId: session.sessionId,
      jobId,
      jobKind: "PATCH_COMPILE",
      terminalStates: ["PROOF_CAPSULE_ISSUED", "PATCH_REJECTED"],
      onSession: updateSession,
    });
    if (
      completed.state !== "PROOF_CAPSULE_ISSUED" ||
      completed.patchResult === undefined
    ) {
      throw new ApiClientError({
        code: "PATCH_REJECTED",
        message:
          "The verifier rejected this repair. No patched notebook was released.",
        status: 409,
      });
    }
    setPatch(completed.patchResult);
    updateSession(completed);
    window.localStorage?.removeItem(activeJobIdKey);
    window.localStorage?.removeItem(activeJobKindKey);
    try {
      setProof(await counterLabApi.getProofBundle(session.sessionId));
    } catch (caught) {
      if (!(caught instanceof ApiClientError && caught.status === 409)) {
        throw caught;
      }
    }
  };

  const compile = async () => {
    setBusy(true);
    setError(null);
    runner.clear();
    try {
      const started = await counterLabApi.compilePatch(session.sessionId);
      updateSession(started);
      if (started.patch !== undefined) {
        setPatch(started.patch);
        setProof(await counterLabApi.getProofBundle(session.sessionId));
        return;
      }
      if (started.runnerJob === undefined) {
        throw new Error("The runner did not return a patch job.");
      }
      setJob(started.runnerJob);
      window.localStorage?.setItem(activeJobIdKey, started.runnerJob.jobId);
      window.localStorage?.setItem(activeJobKindKey, started.runnerJob.kind);
      await finishJob(started.runnerJob.jobId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "CounterLab could not verify this repair.",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (session.state !== "PATCH_COMPILING") return;
    const jobId = window.localStorage?.getItem(activeJobIdKey) ?? null;
    if (
      jobId === null ||
      window.localStorage?.getItem(activeJobKindKey) !== "PATCH_COMPILE"
    ) {
      setBusy(false);
      setError(
        "This patch job cannot be resumed from this browser. Refresh the session, then retry.",
      );
      return;
    }
    setBusy(true);
    void finishJob(jobId)
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "CounterLab could not resume this patch job.",
        );
      })
      .finally(() => setBusy(false));
    // Resume only when this persisted session is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionId]);

  const exportProof = () => {
    if (proof === null) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `counterlab-${session.sessionId}-proof-bundle.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadPatch = () => {
    if (patch === null) return;
    const anchor = document.createElement("a");
    anchor.href = counterLabApi.patchDownloadUrl(session.sessionId);
    anchor.download = "";
    anchor.click();
    void recordLearnerInteraction(session.sessionId, {
      kind: "patch.downloaded",
      stage: "repair",
    });
  };

  const exportCompletionProof = () => {
    if (session.proofCapsule !== undefined) {
      const anchor = document.createElement("a");
      anchor.href = counterLabApi.proofCapsuleDownloadUrl(session.sessionId);
      anchor.download = "";
      anchor.click();
      void recordLearnerInteraction(session.sessionId, {
        kind: "proof_capsule.downloaded",
        stage: "repair",
      });
      return;
    }
    exportProof();
  };

  if (patch !== null) {
    const liveCompletionProof =
      session.mode.kind === "live_notebook" &&
      session.state === "PROOF_CAPSULE_ISSUED" &&
      session.reasoningDiffV2 !== undefined &&
      session.proofCapsule !== undefined &&
      session.beliefSpec !== undefined &&
      session.prediction !== undefined &&
      session.revision !== undefined
        ? {
            diff: session.reasoningDiffV2,
            capsule: session.proofCapsule,
            publicTextPreview: {
              claim: session.beliefSpec.claim,
              hypotheses: [
                session.beliefSpec.hypotheses[0].statement,
                session.beliefSpec.hypotheses[1].statement,
              ] as const,
              prediction: session.prediction.choice,
              revision: session.revision,
            },
          }
        : null;
    const completion = (
      <LearnerCompletion
        titleId="imbalance-completion-title"
        capability={{
          intro: "You completed one verified rare-event loop.",
          first: "high overall accuracy",
          connector: "was compared with",
          second: "rare-event performance in this fixed task",
        }}
        beforeReasoning={
          session.beliefSpec?.claim ??
          session.beliefTest?.learnerClaim ??
          "A high overall score proves the model catches rare events."
        }
        afterReasoning={
          session.revision ??
          "Inspect class-specific errors, deployment prevalence, and asymmetric costs."
        }
        transferStatus={{
          label: "Fixed transfer task passed",
          detail:
            "Your submitted choices matched the fixed manufacturing-defect evaluator. This records one task outcome; it does not establish mastery.",
        }}
        repairedNotebookAction={{
          label: "Download repaired notebook",
          onActivate: downloadPatch,
        }}
        proofCapsuleAction={{
          label:
            session.proofCapsule === undefined
              ? "Download proof record"
              : "Export Proof Capsule",
          onActivate: exportCompletionProof,
          disabled: session.proofCapsule === undefined && proof === null,
        }}
        evidenceAndProof={
          liveCompletionProof === null ? (
            <>
              <p>Patched artifact {patch.patchedArtifactHash}</p>
              <p>
                The verified conclusion is bounded to the supported notebook,
                fixed rare-event fixture, registered metrics, and transfer
                scenario. It does not establish global model quality.
              </p>
            </>
          ) : (
            <DeferredReasoningDiffView
              presentation="completion-evidence"
              diff={liveCompletionProof.diff}
              capsule={liveCompletionProof.capsule}
              patch={patch}
              patchDownloadUrl={counterLabApi.patchDownloadUrl(
                session.sessionId,
              )}
              proofCapsuleDownloadUrl={counterLabApi.proofCapsuleDownloadUrl(
                session.sessionId,
              )}
              publishReplay={() =>
                counterLabApi.publishReplay(session.sessionId)
              }
              revokeReplay={() => counterLabApi.revokeReplay(session.sessionId)}
              loadReplayStatus={() =>
                counterLabApi.getReplayPublicationStatus(session.sessionId)
              }
              publicTextPreview={liveCompletionProof.publicTextPreview}
            />
          )
        }
      />
    );
    if (liveCompletionProof !== null) {
      return (
        <>
          {completion}
          <RepairPreview
            changed={imbalanceRepairChanges}
            preserved={imbalanceRepairPreserves}
          />
        </>
      );
    }
    return (
      <>
        {completion}
        <section className="panel imbalance-patch-review" aria-live="polite">
          <div className="panel-title">
            <div>
              <p className="eyebrow aqua">
                Verified repair · original untouched
              </p>
              <h2>Your notebook copy passed the repair checks.</h2>
              <p>
                The evaluation now compares a computed majority baseline and
                reports class-specific errors at an explicit threshold.
              </p>
            </div>
            <span className="verified-chip">Verified</span>
          </div>
          <div className="patch-integrity-grid">
            <div>
              <span>Changed cells</span>
              <strong>{patch.modifiedCells.join(", ")}</strong>
            </div>
            <div>
              <span>Unchanged cells proven</span>
              <strong>{patch.verification.unchangedCellHashes.length}</strong>
            </div>
            <div>
              <span>Patched hash</span>
              <strong>{patch.patchedArtifactHash.slice(0, 12)}…</strong>
            </div>
          </div>
          <RepairPreview
            changed={imbalanceRepairChanges}
            preserved={imbalanceRepairPreserves}
          />
          <pre className="diff" aria-label="Verified imbalance notebook diff">
            <code>{patch.diff}</code>
          </pre>
          <ul className="patch-invariants" aria-label="Patch verifier checks">
            {patch.verification.invariants.map((invariant) => (
              <li key={invariant}>{invariant.replaceAll("_", " ")}</li>
            ))}
          </ul>
        </section>
      </>
    );
  }

  return (
    <section className="panel imbalance-patch-gate" aria-live="polite">
      <div>
        <p className="eyebrow gold">Transfer passed · Repair unlocked</p>
        <h2>Now repair the evidence, not just the headline.</h2>
        <p>
          Codex may propose only a typed Patch Plan. Fixed code applies the
          registered changes to a copy, then the external verifier checks the
          cell scope, metrics, threshold, and deterministic hashes.
        </p>
      </div>
      <ol className="patch-scope-list">
        <li>Preserve class prevalence with a stratified holdout</li>
        <li>Compute the majority-class baseline</li>
        <li>Add confusion counts, precision, recall, F1, and PR-AUC</li>
      </ol>
      <RepairPreview
        changed={imbalanceRepairChanges}
        preserved={imbalanceRepairPreserves}
      />
      {busy && (
        <div className="patch-live-trace" role="status">
          <strong>
            {job === null ? "Starting verified repair…" : "Repair in progress"}
          </strong>
          {runner.events.length === 0 ? (
            <p>The source remains sealed until the Patch Plan passes.</p>
          ) : (
            <ol>
              {runner.events.map((event) => (
                <li key={event.eventId}>{eventTitle(event.kind)}</li>
              ))}
            </ol>
          )}
        </div>
      )}
      {error !== null && (
        <p className="transfer-feedback fail" role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-gold"
        type="button"
        disabled={busy || session.transferResult?.outcome !== "PASSED"}
        onClick={() => void compile()}
      >
        {busy ? "Verifying repair…" : "Verify notebook repair"}
      </button>
    </section>
  );
}
