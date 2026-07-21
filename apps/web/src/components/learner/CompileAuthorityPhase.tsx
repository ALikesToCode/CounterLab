import type { RunnerJob } from "../../api";
import styles from "./CompileAuthorityPhase.module.css";

type AuthorityPhaseId = "planning" | "testing" | "result";
type AuthorityPhaseState = "pending" | "active" | "complete" | "stopped";

const phases: readonly {
  id: AuthorityPhaseId;
  label: string;
  title: string;
  detail: string;
}[] = [
  {
    id: "planning",
    label: "Generated planning",
    title: "Runtime Codex proposes",
    detail: "A bounded plan uses registered operations only.",
  },
  {
    id: "testing",
    label: "Fixed testing",
    title: "Fixed kernel runs",
    detail: "The kernel owns every numerical value.",
  },
  {
    id: "result",
    label: "Verified result",
    title: "Frozen verifier releases",
    detail: "Only verified bindings can reach the result view.",
  },
] as const;

function activePhase(jobKind: RunnerJob["kind"] | undefined): AuthorityPhaseId {
  return jobKind === "LAB_RUN" ? "testing" : "planning";
}

function phaseState({
  id,
  jobKind,
  resultReady,
  failed,
}: {
  id: AuthorityPhaseId;
  jobKind: RunnerJob["kind"] | undefined;
  resultReady: boolean;
  failed: boolean;
}): AuthorityPhaseState {
  if (resultReady) return "complete";

  const current = activePhase(jobKind);
  if (id === current) return failed ? "stopped" : "active";
  if (current === "testing" && id === "planning") return "complete";
  return "pending";
}

const stateLabels: Record<AuthorityPhaseState, string> = {
  pending: "Waiting",
  active: "In progress",
  complete: "Complete",
  stopped: "Stopped safely",
};

export function CompileAuthorityPhase({
  jobKind,
  resultReady,
  failed,
}: {
  jobKind: RunnerJob["kind"] | undefined;
  resultReady: boolean;
  failed: boolean;
}) {
  return (
    <section className={styles.root} aria-labelledby="compile-authority-title">
      <div className={styles.intro}>
        <strong id="compile-authority-title">Who is allowed to do what</strong>
        <span>
          Runtime Codex proposes the experiment only. The fixed kernel owns the
          numbers, and the frozen verifier decides whether a result may appear.
        </span>
      </div>
      <ol className={styles.phases} aria-label="Test authority phases">
        {phases.map((phase) => {
          const state = phaseState({
            id: phase.id,
            jobKind,
            resultReady,
            failed,
          });
          return (
            <li
              className={styles.phase}
              data-state={state}
              key={phase.id}
              {...(state === "active" ? { "aria-current": "step" } : {})}
            >
              <span>
                {phase.label} · {stateLabels[state]}
              </span>
              <strong>{phase.title}</strong>
              <small>{phase.detail}</small>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
