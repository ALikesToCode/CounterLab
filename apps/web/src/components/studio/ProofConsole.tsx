import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { PublicCompilerEvent } from "../../api";
import { GeneratedProofView } from "./GeneratedProofView";
import type { StudioContext } from "./types";

export type ProofTab =
  "Activity" | "Plan" | "Diff" | "Tests" | "Verifier" | "Provenance";

const tabs: readonly ProofTab[] = [
  "Activity",
  "Plan",
  "Diff",
  "Tests",
  "Verifier",
  "Provenance",
];

function eventSummary(event: PublicCompilerEvent): string {
  switch (event.kind) {
    case "job.started":
      return "Protected runner accepted the job";
    case "plan.summary":
      return `${event.title}: ${event.steps.join(" · ")}`;
    case "artifact.read":
      return `${event.evidenceRefs.length} evidence references resolved`;
    case "file.created":
      return `${event.path} · ${event.sha256.slice(0, 12)}…`;
    case "diff.updated":
      return `${event.path} updated after verifier feedback`;
    case "command.completed":
      return `${event.label} · exit ${event.exitCode} · ${event.durationMs} ms`;
    case "verifier.rejected":
      return `${event.invariant}: ${event.counterexample}`;
    case "repair.started":
      return `Repair attempt ${event.attempt} started`;
    case "verifier.verified":
      return `${event.invariantCount} invariants and ${event.mutationCount} mutations passed`;
    case "result.ready":
      return `Result ${event.resultHash.slice(0, 12)}… ready`;
    case "job.failed":
      return `${event.code}: ${event.message}`;
  }
}

function eventsForTab(events: readonly PublicCompilerEvent[], tab: ProofTab) {
  if (tab === "Activity") return events;
  if (tab === "Plan")
    return events.filter((event) =>
      ["plan.summary", "artifact.read", "file.created"].includes(event.kind),
    );
  if (tab === "Diff")
    return events.filter((event) => event.kind === "diff.updated");
  if (tab === "Tests")
    return events.filter((event) => event.kind === "command.completed");
  if (tab === "Verifier")
    return events.filter((event) =>
      [
        "verifier.rejected",
        "repair.started",
        "verifier.verified",
        "job.failed",
      ].includes(event.kind),
    );
  return [];
}

export function ProofConsole({
  context,
  open,
  activeTab,
  onToggle,
  onTab,
}: {
  context: StudioContext;
  open: boolean;
  activeTab: ProofTab;
  onToggle: () => void;
  onTab: (tab: ProofTab) => void;
}) {
  const filteredEvents = eventsForTab(context.events, activeTab);
  const moveTab = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) {
      return;
    }
    onTab(nextTab);
    document.getElementById(`proof-tab-${nextTab.toLowerCase()}`)?.focus();
  };
  return (
    <section className={`proof-console ${open ? "open" : ""}`}>
      <button
        className="proof-console-handle"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>
          <i /> Evidence &amp; proof
        </span>
        <strong>
          {context.events.length} event{context.events.length === 1 ? "" : "s"}
        </strong>
        <kbd>{open ? "Close" : "Open"}</kbd>
      </button>
      {open && (
        <div className="proof-console-body">
          <div className="proof-tabs" role="tablist" aria-label="Proof views">
            {tabs.map((tab, index) => (
              <button
                id={`proof-tab-${tab.toLowerCase()}`}
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls="proof-tabpanel"
                tabIndex={activeTab === tab ? 0 : -1}
                type="button"
                key={tab}
                onClick={() => onTab(tab)}
                onKeyDown={(event) => moveTab(event, index)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div
            id="proof-tabpanel"
            className="proof-console-content"
            role="tabpanel"
            aria-labelledby={`proof-tab-${activeTab.toLowerCase()}`}
            tabIndex={0}
          >
            {activeTab === "Provenance" ? (
              <dl className="console-provenance">
                <div>
                  <dt>Artifact</dt>
                  <dd>{context.artifact?.fileSha256 ?? "Not available yet"}</dd>
                </div>
                <div>
                  <dt>Session</dt>
                  <dd>{context.session?.sessionId ?? "Not created yet"}</dd>
                </div>
                <div>
                  <dt>Result</dt>
                  <dd>
                    {context.session?.verifiedResult?.resultHash ??
                      "Locked until verification"}
                  </dd>
                </div>
                <div>
                  <dt>Boundary</dt>
                  <dd>
                    {context.session?.boundaryMapAuthority?.resultHash ??
                      "Locked until verification"}
                  </dd>
                </div>
                <div>
                  <dt>Capsule</dt>
                  <dd>
                    {context.session?.proofCapsule?.rootHash ??
                      "Issued after verified repair"}
                  </dd>
                </div>
              </dl>
            ) : filteredEvents.length === 0 ? (
              <div className="console-empty">
                <strong>No {activeTab.toLowerCase()} evidence yet.</strong>
                <span>It will appear here when the session produces it.</span>
              </div>
            ) : (
              <>
                {(activeTab === "Plan" || activeTab === "Verifier") && (
                  <GeneratedProofView events={filteredEvents} />
                )}
                <ol className="console-events">
                  {filteredEvents.map((event) => (
                    <li key={event.eventId}>
                      <time>{new Date(event.at).toLocaleTimeString()}</time>
                      <span>{event.kind}</span>
                      <p>{eventSummary(event)}</p>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
