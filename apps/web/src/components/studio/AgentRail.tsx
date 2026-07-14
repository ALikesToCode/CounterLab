import type { StudioContext } from "./types";

const phaseStates = {
  Analyze: [
    "BELIEF_TEST_PROPOSED",
    "BELIEF_TEST_CONFIRMED",
    "PREDICTION_COMMITTED",
    "LAB_COMPILING",
    "LAB_VERIFIED",
    "EXPERIMENT_COMPLETED",
    "REVISION_RECORDED",
    "TRANSFER_IN_PROGRESS",
    "TRANSFER_FAILED",
    "TRANSFER_PASSED",
    "PATCH_COMPILING",
    "PATCH_VERIFIED",
    "REASONING_DIFF_ISSUED",
  ],
  Plan: [
    "LAB_COMPILING",
    "LAB_VERIFIED",
    "EXPERIMENT_COMPLETED",
    "REVISION_RECORDED",
    "TRANSFER_IN_PROGRESS",
    "TRANSFER_FAILED",
    "TRANSFER_PASSED",
    "PATCH_COMPILING",
    "PATCH_VERIFIED",
    "REASONING_DIFF_ISSUED",
  ],
  Verify: [
    "LAB_VERIFIED",
    "EXPERIMENT_COMPLETED",
    "REVISION_RECORDED",
    "TRANSFER_IN_PROGRESS",
    "TRANSFER_FAILED",
    "TRANSFER_PASSED",
    "PATCH_COMPILING",
    "PATCH_VERIFIED",
    "REASONING_DIFF_ISSUED",
  ],
  Teach: [
    "REVISION_RECORDED",
    "TRANSFER_IN_PROGRESS",
    "TRANSFER_FAILED",
    "TRANSFER_PASSED",
    "PATCH_COMPILING",
    "PATCH_VERIFIED",
    "REASONING_DIFF_ISSUED",
  ],
  Patch: ["PATCH_COMPILING", "PATCH_VERIFIED", "REASONING_DIFF_ISSUED"],
} as const;

const phaseCopy = {
  Analyze: "Links the claim to exact notebook evidence.",
  Plan: "Proposes one discriminating fixed experiment.",
  Verify: "Checks the plan before any result is released.",
  Teach: "Tests whether the rule transfers to a new case.",
  Patch: "Repairs a copy only after transfer passes.",
} as const;

export function AgentRail({ context }: { context: StudioContext }) {
  const state = context.session?.state;
  const latestEvent = context.events.at(-1);

  return (
    <aside className="studio-agent-rail" aria-label="CounterLab agents">
      <div className="agent-rail-title">
        <div>
          <span className="agent-pulse" />
          <strong>CounterLab agents</strong>
        </div>
        <small>Public actions only</small>
      </div>
      <ol>
        {Object.entries(phaseCopy).map(([phase, copy]) => {
          const complete =
            state !== undefined &&
            (
              phaseStates[
                phase as keyof typeof phaseStates
              ] as readonly string[]
            ).includes(state);
          const active =
            (phase === "Analyze" && context.stage === "belief") ||
            (phase === "Plan" && context.stage === "live-compile") ||
            (phase === "Verify" && context.stage === "build") ||
            (phase === "Teach" && context.stage === "reality" && !complete) ||
            (phase === "Patch" && state === "PATCH_COMPILING");
          return (
            <li
              className={`${complete ? "complete" : ""} ${active ? "active" : ""}`}
              key={phase}
            >
              <span>{complete ? "✓" : ""}</span>
              <div>
                <strong>{phase}</strong>
                <p>{copy}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="agent-now" aria-live="polite">
        <span>Now</span>
        <strong>
          {latestEvent?.kind.replaceAll(".", " ") ??
            (context.stage === "claim"
              ? "Waiting for your claim"
              : "Waiting for your next action")}
        </strong>
        <small>
          {context.mode === "replay"
            ? "Verified replay · no new model calls"
            : context.mode === "live"
              ? "Live notebook session"
              : "Sample lesson"}
        </small>
      </div>
    </aside>
  );
}
