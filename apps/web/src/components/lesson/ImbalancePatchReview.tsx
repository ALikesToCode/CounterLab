import { useEffect, useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  type PatchResult,
  type ProofBundle,
  type RunnerJob,
  type SessionView,
} from "../../api";
import { useRunnerEvents } from "../../hooks/useRunnerEvents";
import { RepairPreview } from "../learner/RepairPreview";
import { ReasoningDiffView } from "../proof/ReasoningDiffView";

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

  const finishJob = async (jobId: string) => {
    const completed = await runner.waitForJob({
      sessionId: session.sessionId,
      jobId,
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

  if (patch !== null) {
    if (
      session.mode.kind === "live_notebook" &&
      session.state === "PROOF_CAPSULE_ISSUED" &&
      session.reasoningDiffV2 !== undefined &&
      session.proofCapsule !== undefined
    ) {
      return (
        <>
          <RepairPreview
            changed={imbalanceRepairChanges}
            preserved={imbalanceRepairPreserves}
          />
          <ReasoningDiffView
            diff={session.reasoningDiffV2}
            capsule={session.proofCapsule}
            patch={patch}
            patchDownloadUrl={counterLabApi.patchDownloadUrl(session.sessionId)}
            proofCapsuleDownloadUrl={counterLabApi.proofCapsuleDownloadUrl(
              session.sessionId,
            )}
            publishReplay={() => counterLabApi.publishReplay(session.sessionId)}
          />
        </>
      );
    }
    return (
      <section className="panel imbalance-patch-review" aria-live="polite">
        <div className="panel-title">
          <div>
            <p className="eyebrow aqua">Verified repair · original untouched</p>
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
        <div className="patch-actions">
          <a
            className="button button-gold"
            href={counterLabApi.patchDownloadUrl(session.sessionId)}
            download
          >
            Download patched copy
          </a>
          <button
            className="button button-quiet"
            type="button"
            disabled={proof === null}
            onClick={exportProof}
          >
            {proof === null ? "Preparing proof…" : "Export Proof Bundle"}
          </button>
        </div>
      </section>
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
