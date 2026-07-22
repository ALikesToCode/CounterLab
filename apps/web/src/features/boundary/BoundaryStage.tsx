import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  type BoundaryMapAuthorityRefV1,
  type BoundaryResponse,
  type SessionView,
} from "../../api";
import { BoundaryMapBlock } from "../../components/generative-ui/BoundaryMapBlock";
import {
  clearActiveRunnerCheckpoint,
  readActiveRunnerCheckpoint,
  writeActiveRunnerCheckpoint,
} from "../../hooks/runnerCheckpoint";
import { useRunnerEvents } from "../../hooks/useRunnerEvents";
import { BoundaryHunt } from "./BoundaryHunt";
import { huntDataFor } from "./boundaryHuntData";
import { recordLearnerInteraction } from "../learner/interactionEvidence";
import styles from "./BoundaryStage.module.css";

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function publicEventLabel(kind: string): string {
  const labels: Record<string, string> = {
    "job.started": "Fixed sweep started",
    "plan.summary": "Registered Boundary plan resolved",
    "artifact.read": "Evidence authority checked",
    "command.completed": "Fixed kernel completed",
    "verifier.rejected": "Boundary verifier rejected the output",
    "verifier.verified": "Boundary verifier accepted every cell",
    "result.ready": "Verified Boundary Map ready",
    "job.failed": "Boundary job stopped safely",
  };
  return labels[kind] ?? kind.replaceAll(".", " ");
}

function huntStorageKey(resultHash: string): string {
  return `counterlab.boundary-hunt.${resultHash}`;
}

function huntWasRevealed(resultHash: string): boolean {
  try {
    return storage()?.getItem(huntStorageKey(resultHash)) === "revealed";
  } catch {
    return false;
  }
}

function rememberRevealedHunt(resultHash: string): void {
  try {
    storage()?.setItem(huntStorageKey(resultHash), "revealed");
  } catch {
    // Presentation persistence must never block the verified map.
  }
}

export function BoundaryStage({
  session,
  prediction,
  updateSession,
}: {
  session: SessionView;
  prediction?: string;
  updateSession: (session: SessionView) => void;
}) {
  const runner = useRunnerEvents();
  const [boundary, setBoundary] = useState<BoundaryResponse | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedBoundaryHash, setRevealedBoundaryHash] = useState<
    string | null
  >(null);
  const activeJobId = useRef<string | null>(null);
  const loadedReceiptHash = useRef<string | null>(null);
  const loadingReceiptHash = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const activeRunAuthority = useRef<{
    sessionId: string;
    receiptHash: string;
    resultHash: string;
  } | null>(null);
  const boundaryAuthority = session.boundaryMapAuthority;
  const matchesSessionAuthority =
    boundaryAuthority !== undefined &&
    boundary !== null &&
    boundary.receipt.receiptHash === boundaryAuthority.receipt.receiptHash &&
    boundary.result.resultHash === boundaryAuthority.resultHash;
  const matchesActiveRun =
    boundaryAuthority === undefined &&
    session.state === "EXPERIMENT_COMPLETED" &&
    boundary !== null &&
    activeRunAuthority.current?.sessionId === session.sessionId &&
    activeRunAuthority.current.receiptHash === boundary.receipt.receiptHash &&
    activeRunAuthority.current.resultHash === boundary.result.resultHash;
  const visibleBoundary =
    boundary !== null && (matchesSessionAuthority || matchesActiveRun)
      ? boundary
      : null;

  const loadBoundary = useCallback(
    async (
      expectedAuthority: BoundaryMapAuthorityRefV1,
      source: "persisted" | "active-run" = "persisted",
    ) => {
      const generation = loadGeneration.current + 1;
      loadGeneration.current = generation;
      loadingReceiptHash.current = expectedAuthority.receipt.receiptHash;
      try {
        const response = await counterLabApi.getBoundary(
          session.sessionId,
          expectedAuthority,
        );
        if (loadGeneration.current !== generation) return null;
        if (source === "active-run") {
          activeRunAuthority.current = {
            sessionId: session.sessionId,
            receiptHash: response.receipt.receiptHash,
            resultHash: response.result.resultHash,
          };
        }
        setError(null);
        setBoundary(response);
        const alreadyRevealed = huntWasRevealed(response.result.resultHash);
        setRevealedBoundaryHash(
          alreadyRevealed ? response.result.resultHash : null,
        );
        loadedReceiptHash.current = response.receipt.receiptHash;
        if (alreadyRevealed) {
          window.requestAnimationFrame(() => {
            document.getElementById("boundary-map-title")?.focus();
          });
        }
        return response;
      } catch (caught) {
        if (loadGeneration.current !== generation) return null;
        throw caught;
      } finally {
        if (loadGeneration.current === generation) {
          loadingReceiptHash.current = null;
        }
      }
    },
    [session.sessionId],
  );

  useEffect(
    () => () => {
      loadGeneration.current += 1;
    },
    [session.sessionId],
  );

  const finishJob = useCallback(
    async (jobId: string) => {
      activeJobId.current = jobId;
      setBusy(true);
      setError(null);
      try {
        const completed = await runner.waitForJob({
          sessionId: session.sessionId,
          jobId,
          jobKind: "LAB_RUN",
          terminalStates: ["BOUNDARY_VERIFIED", "LAB_REJECTED"],
          onSession: updateSession,
        });
        if (
          completed.state !== "BOUNDARY_VERIFIED" ||
          completed.boundaryMapAuthority === undefined
        ) {
          throw new ApiClientError({
            code: "BOUNDARY_REJECTED",
            message:
              "The independent verifier rejected this sweep. No Boundary values were released.",
            status: 409,
          });
        }
        updateSession(completed);
        await loadBoundary(completed.boundaryMapAuthority, "active-run");
        const localStorage = storage();
        if (localStorage !== undefined) {
          clearActiveRunnerCheckpoint(session.sessionId, jobId, localStorage);
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "CounterLab could not verify this Boundary Map.",
        );
      } finally {
        activeJobId.current = null;
        setBusy(false);
      }
    },
    [loadBoundary, runner, session.sessionId, updateSession],
  );

  const startBoundary = async () => {
    setBusy(true);
    setError(null);
    runner.clear();
    try {
      const started = await counterLabApi.runBoundary(session.sessionId);
      setJobId(started.runnerJob.jobId);
      activeJobId.current = started.runnerJob.jobId;
      const localStorage = storage();
      if (localStorage !== undefined) {
        writeActiveRunnerCheckpoint(
          {
            schemaVersion: "1",
            sessionId: session.sessionId,
            jobId: started.runnerJob.jobId,
            kind: started.runnerJob.kind,
          },
          localStorage,
        );
      }
      updateSession(started);
      await finishJob(started.runnerJob.jobId);
    } catch (caught) {
      activeJobId.current = null;
      setBusy(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "CounterLab could not start the fixed Boundary sweep.",
      );
    }
  };

  useEffect(() => {
    const receiptHash = boundaryAuthority?.receipt.receiptHash;
    if (boundaryAuthority === undefined) {
      loadGeneration.current += 1;
      loadingReceiptHash.current = null;
      loadedReceiptHash.current = null;
      setBoundary(null);
      setRevealedBoundaryHash(null);
    }
    if (
      boundaryAuthority !== undefined &&
      receiptHash !== undefined &&
      loadedReceiptHash.current !== receiptHash &&
      loadingReceiptHash.current !== receiptHash
    ) {
      setError(null);
      setBoundary(null);
      setRevealedBoundaryHash(null);
      void loadBoundary(boundaryAuthority).catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "The persisted Boundary authority could not be loaded.",
        );
      });
      return;
    }
    if (
      session.state !== "EXPERIMENT_COMPLETED" ||
      activeJobId.current !== null
    ) {
      return;
    }
    const localStorage = storage();
    const checkpoint =
      localStorage === undefined
        ? null
        : readActiveRunnerCheckpoint(session.sessionId, localStorage);
    if (checkpoint?.kind === "LAB_RUN") {
      setJobId(checkpoint.jobId);
      void finishJob(checkpoint.jobId);
    }
  }, [
    finishJob,
    loadBoundary,
    boundaryAuthority,
    session.sessionId,
    session.state,
  ]);

  if (visibleBoundary !== null) {
    if (
      visibleBoundary.report.status === "VERIFIED" &&
      revealedBoundaryHash !== visibleBoundary.result.resultHash
    ) {
      const revealMap = () => {
        rememberRevealedHunt(visibleBoundary.result.resultHash);
        setRevealedBoundaryHash(visibleBoundary.result.resultHash);
        window.requestAnimationFrame(() => {
          document.getElementById("boundary-map-title")?.focus();
        });
      };
      return (
        <BoundaryHunt
          boundary={huntDataFor(visibleBoundary)}
          onRevealMap={revealMap}
          onSkip={revealMap}
          onClassify={(classification) => {
            void recordLearnerInteraction(session.sessionId, {
              kind: "boundary_hunt.classified",
              stage: "boundary",
              classification,
            });
          }}
        />
      );
    }
    return (
      <BoundaryMapBlock
        boundary={visibleBoundary}
        {...(prediction === undefined ? {} : { prediction })}
      />
    );
  }

  if (busy) {
    return (
      <section className={styles.stage} role="status" aria-live="polite">
        <div className={styles.statusMark} aria-hidden="true" />
        <div>
          <span>Boundary · Computing with fixed code</span>
          <h2>Mapping where the evidence changes…</h2>
          <p>
            The runner is sweeping only registered conditions. No model call is
            made for individual cells, and no value appears before verification.
          </p>
          <ol className={styles.events}>
            {runner.events.length === 0 ? (
              <li>Runner accepted {jobId ?? "the bounded job"}.</li>
            ) : (
              runner.events.map((event) => (
                <li key={event.eventId}>{publicEventLabel(event.kind)}</li>
              ))
            )}
          </ol>
        </div>
      </section>
    );
  }

  if (boundaryAuthority !== undefined && error === null) {
    return (
      <section className={styles.stage} role="status" aria-live="polite">
        <div className={styles.statusMark} aria-hidden="true" />
        <div>
          <span>Boundary · Verifying stored authority</span>
          <h2>Loading the verified Boundary Map…</h2>
          <p>
            CounterLab is checking the stored receipt and result bindings before
            showing any Boundary values.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.stage} aria-labelledby="boundary-stage-title">
      <div className={styles.number} aria-hidden="true">
        04
      </div>
      <div>
        <span>Boundary · One question remains</span>
        <h2 id="boundary-stage-title">Where does this rule stop applying?</h2>
        <p>
          One result can separate the hypotheses. A Boundary Map goes further:
          fixed code changes two approved conditions and shows where the pattern
          becomes weak, strong, or inconclusive.
        </p>
        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            if (boundaryAuthority === undefined) {
              void startBoundary();
              return;
            }
            setError(null);
            void loadBoundary(boundaryAuthority).catch((caught: unknown) => {
              setError(
                caught instanceof Error
                  ? caught.message
                  : "The persisted Boundary authority could not be loaded.",
              );
            });
          }}
        >
          {boundaryAuthority === undefined
            ? error === null
              ? "Map the boundary"
              : "Retry Boundary verification"
            : "Retry loading verified Boundary"}
        </button>
      </div>
    </section>
  );
}
