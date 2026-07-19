import { useEffect, useRef } from "react";

import type { ActiveRunnerRecord } from "../../features/learner/activeRunnerRegistry";

import styles from "./StartOverDialog.module.css";

function jobLabel(job: ActiveRunnerRecord): string {
  if (job.kind === "LAB_COMPILE") return "Fair-test compilation";
  if (job.kind === "PATCH_COMPILE") return "Repair compilation";
  if (job.kind === "LAB_RUN") return "Verified experiment run";
  if (job.kind === "BELIEF_ANALYSIS") return "Belief analysis";
  if (job.kind === "LAB_VERIFY") return "Test verification";
  return "Repair verification";
}

export function StartOverDialog({
  jobs,
  busy,
  onKeepWorking,
  onConfirm,
}: {
  jobs: readonly ActiveRunnerRecord[];
  busy: boolean;
  onKeepWorking: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepWorkingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    keepWorkingRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onKeepWorking();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [busy, onKeepWorking]);

  return (
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-over-title"
        aria-describedby="start-over-description"
      >
        <p className={styles.eyebrow}>Live work is still running</p>
        <h2 id="start-over-title">Stop live work and start over?</h2>
        <p id="start-over-description">
          CounterLab will ask the server to cancel {jobs.length} active{" "}
          {jobs.length === 1 ? "job" : "jobs"} before returning home. A job the
          browser cannot reach stays registered for recovery; leaving this
          screen never authorizes a result.
        </p>
        <ul className={styles.jobs} aria-label="Active live jobs">
          {jobs.map((job) => (
            <li key={job.jobId}>
              <strong>{jobLabel(job)}</strong>
              <span>{job.jobId}</span>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button
            ref={keepWorkingRef}
            className="button button-quiet"
            type="button"
            disabled={busy}
            onClick={onKeepWorking}
          >
            Keep working
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Stopping live work…" : "Stop jobs and start over"}
          </button>
        </div>
      </div>
    </div>
  );
}
