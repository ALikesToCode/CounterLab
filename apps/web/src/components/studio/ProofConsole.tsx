import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type {
  EvidenceEvent,
  ProofBundle,
  PublicCompilerEvent,
} from "../../api";
import { CapabilityLinkDisclosure } from "../learner/CapabilityLinkDisclosure";
import { learnerSessionStatusLabel } from "../learner/learnerStages";
import { GeneratedProofView } from "./GeneratedProofView";
import { ProvenanceLedger } from "./ProvenanceLedger";
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

const studioModeLabels = {
  instant: "Verified sample",
  live: "Live notebook",
  replay: "Verified replay",
} as const;

const proofStatusLabels = {
  idle: "Stored chain not loaded",
  loading: "Loading stored chain",
  ready: "Stored chain loaded",
  failed: "Stored chain unavailable",
} as const;

function sessionStudioMode(
  kind: NonNullable<StudioContext["session"]>["mode"]["kind"],
): StudioContext["mode"] {
  if (kind === "sample_lesson") return "instant";
  if (kind === "verified_replay") return "replay";
  return "live";
}

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

function compilerEventsForTab(
  events: readonly PublicCompilerEvent[],
  tab: ProofTab,
) {
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

const evidenceKindsByTab = {
  Plan: new Set(["lab.compilation_started", "lab.rejected", "lab.verified"]),
  Diff: new Set([
    "patch.compilation_started",
    "patch.rejected",
    "patch.verified",
    "reasoning_diff.issued",
    "reasoning_diff_v2.issued",
  ]),
  Tests: new Set([
    "experiment.completed",
    "boundary_map.verified",
    "transfer.started",
    "transfer.passed",
    "transfer.failed",
  ]),
  Verifier: new Set([
    "lab.rejected",
    "lab.verified",
    "experiment.evidence_verified",
    "experiment.evidence_rejected",
    "boundary_map.verified",
    "patch.rejected",
    "patch.verified",
  ]),
} satisfies Partial<Record<ProofTab, ReadonlySet<string>>>;

function evidenceEventsForTab(
  events: readonly EvidenceEvent[],
  tab: ProofTab,
): readonly EvidenceEvent[] {
  if (tab === "Activity") return events;
  const kinds = evidenceKindsByTab[tab as keyof typeof evidenceKindsByTab];
  return kinds === undefined
    ? []
    : events.filter((event) => kinds.has(event.kind));
}

function EvidenceEventList({ events }: { events: readonly EvidenceEvent[] }) {
  return (
    <section aria-label="Session event chain">
      <h3>Session event chain</h3>
      <p>
        Ordered session lifecycle evidence returned by the session event store.
      </p>
      <ol className="console-events">
        {events.map((event) => (
          <li key={event.eventId}>
            <time dateTime={event.timestamp}>
              {new Date(event.timestamp).toLocaleTimeString()}
            </time>
            <span>{event.kind}</span>
            <p>
              Sequence {event.sequence} · {event.actor} · Event hash{" "}
              {event.eventHash.slice(0, 12)}…
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function proofBundleHasTab(
  proofBundle: ProofBundle | undefined,
  tab: ProofTab,
): boolean {
  if (proofBundle === undefined) return false;
  if (tab === "Plan" || tab === "Diff" || tab === "Verifier") return true;
  return tab === "Tests" && proofBundle.schemaVersion === "1";
}

function ProofBundleEvidence({
  proofBundle,
  tab,
}: {
  proofBundle: ProofBundle;
  tab: ProofTab;
}) {
  if (tab === "Plan") {
    const operationIds =
      proofBundle.schemaVersion === "1"
        ? proofBundle.experimentPlan.runs.map((run) => run.id)
        : [
            proofBundle.experimentPlan.baseline.runId,
            ...proofBundle.experimentPlan.interventions.map((run) => run.runId),
          ];
    return (
      <section
        className="proof-bundle-evidence"
        aria-label="Recorded experiment plan"
      >
        <h3>Recorded experiment plan</h3>
        <p>Registered run identifiers recorded in the session Proof Bundle.</p>
        <ul>
          {operationIds.map((operationId) => (
            <li key={operationId}>
              <code>{operationId}</code>
            </li>
          ))}
        </ul>
        {proofBundle.schemaVersion === "1" ? (
          <dl>
            <div>
              <dt>Generated adapter SHA-256</dt>
              <dd>
                <code>{proofBundle.generatedAdapter.sha256}</code>
              </dd>
            </div>
            <div>
              <dt>Recorded source commit</dt>
              <dd>
                <code>{proofBundle.generatedAdapter.commitHash}</code>
              </dd>
            </div>
          </dl>
        ) : (
          <p>
            Plan verifier: {proofBundle.planVerification.status} ·{" "}
            {proofBundle.planVerification.invariantCount} invariants
          </p>
        )}
      </section>
    );
  }

  if (tab === "Diff") {
    const patchStatus = proofBundle.patchResult.status;
    const patchVerified =
      patchStatus === "VERIFIED" && proofBundle.patchResult.verification.passed;
    const patchHeading = patchVerified
      ? "Verified patch"
      : patchStatus === "REJECTED"
        ? "Rejected patch record"
        : "Unverified patch record";
    return (
      <section className="proof-bundle-evidence" aria-label={patchHeading}>
        <h3>{patchHeading}</h3>
        <p>
          Changed notebook cells:{" "}
          {proofBundle.patchResult.modifiedCells.join(", ")}
        </p>
        <p>
          Patch verification: {proofBundle.patchResult.status} ·{" "}
          {proofBundle.patchResult.verification.invariants.length} named
          invariants
        </p>
        <pre tabIndex={0} aria-label="Recorded patch diff">
          <code>{proofBundle.patchResult.diff}</code>
        </pre>
      </section>
    );
  }

  if (tab === "Tests" && proofBundle.schemaVersion === "1") {
    return (
      <section className="proof-bundle-evidence" aria-label="Public tests">
        <h3>Public tests</h3>
        <p>
          {proofBundle.publicTests.passed} passed ·{" "}
          {proofBundle.publicTests.failed} failed
        </p>
        <dl>
          <div>
            <dt>Public test report SHA-256</dt>
            <dd>
              <code>{proofBundle.publicTests.reportHash}</code>
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  if (tab === "Verifier") {
    if (proofBundle.schemaVersion === "1") {
      const verifierStatus = proofBundle.externalVerifier.status;
      const invariantLabel =
        verifierStatus === "VERIFIED"
          ? "Accepted named invariants"
          : verifierStatus === "PARTIAL"
            ? "Named invariants recorded before partial verification"
            : verifierStatus === "REJECTED"
              ? "Named invariants recorded before rejection"
              : "Named invariants recorded without verification";
      return (
        <section
          className="proof-bundle-evidence"
          aria-label="External verifier"
        >
          <h3>External verifier · {proofBundle.externalVerifier.status}</h3>
          <p>{invariantLabel}</p>
          <ul>
            {proofBundle.externalVerifier.verifiedInvariants.map(
              (invariant) => (
                <li key={invariant}>
                  <code>{invariant}</code>
                </li>
              ),
            )}
          </ul>
          <p>
            Mutation probes recorded:{" "}
            {proofBundle.externalVerifier.mutations.length}
          </p>
          <dl>
            <div>
              <dt>External verifier report SHA-256</dt>
              <dd>
                <code>{proofBundle.externalVerifier.reportHash}</code>
              </dd>
            </div>
          </dl>
        </section>
      );
    }
    const reports = [
      ["Experiment plan", proofBundle.planVerification],
      ["Patch plan", proofBundle.patchPlanVerification],
    ] as const;
    return (
      <section className="proof-bundle-evidence" aria-label="Verifier reports">
        <h3>Verifier reports</h3>
        {reports.map(([label, report]) => (
          <section key={label}>
            <h4>
              {label} · {report.status}
            </h4>
            <ul>
              {report.invariants.map((invariant) => (
                <li key={invariant.name}>
                  <code>{invariant.name}</code> ·{" "}
                  {invariant.passed ? "passed" : "rejected"}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>
    );
  }

  return null;
}

function CompilerEventList({
  events,
  tab,
}: {
  events: readonly PublicCompilerEvent[];
  tab: ProofTab;
}) {
  return (
    <section aria-label="Runner activity">
      <h3>Runner activity</h3>
      <p>
        Browser-safe compiler events, ordered by their recorded job cursors.
      </p>
      {(tab === "Plan" || tab === "Verifier") && (
        <GeneratedProofView events={events} />
      )}
      <ol className="console-events">
        {events.map((event) => (
          <li key={event.eventId}>
            <time dateTime={event.at}>
              {new Date(event.at).toLocaleTimeString()}
            </time>
            <span>{event.kind}</span>
            <p>{eventSummary(event)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ProofConsole({
  context,
  open,
  activeTab,
  onToggle,
  onTab,
  onRevokeSessionAccess,
  revokeSessionAccessDisabled = false,
}: {
  context: StudioContext;
  open: boolean;
  activeTab: ProofTab;
  onToggle: () => void;
  onTab: (tab: ProofTab) => void;
  onRevokeSessionAccess?: () => void;
  revokeSessionAccessDisabled?: boolean;
}) {
  const evidenceEvents = context.evidenceEvents ?? [];
  const proofEventIssues = context.proofEventIssues ?? [];
  const proofEventStatus = context.proofEventStatus ?? "idle";
  const proofContextMismatch =
    context.session !== null &&
    sessionStudioMode(context.session.mode.kind) !== context.mode;
  const modeLabel =
    context.session === null
      ? studioModeLabels[context.mode]
      : studioModeLabels[sessionStudioMode(context.session.mode.kind)];
  const sessionLabel =
    context.session === null
      ? "No session bound"
      : learnerSessionStatusLabel(context.session.state);
  const proofBundle = context.session?.proofBundle;
  const filteredCompilerEvents = compilerEventsForTab(
    context.events,
    activeTab,
  );
  const filteredEvidenceEvents = evidenceEventsForTab(
    evidenceEvents,
    activeTab,
  );
  const hasTabEvents =
    filteredEvidenceEvents.length > 0 ||
    filteredCompilerEvents.length > 0 ||
    proofBundleHasTab(proofBundle, activeTab);
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
    <section
      className={`proof-console ${open ? "open" : ""}`}
      data-proof-context={proofContextMismatch ? "mismatch" : "aligned"}
    >
      <button
        className="proof-console-handle"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>
          <i /> Evidence &amp; proof
        </span>
        <span className="proof-console-context" aria-label="Proof state">
          <em>{proofContextMismatch ? "Mode mismatch" : modeLabel}</em>
          <em>{sessionLabel}</em>
          <em>{proofStatusLabels[proofEventStatus]}</em>
        </span>
        <strong>
          {proofContextMismatch ? (
            "Evidence withheld"
          ) : (
            <>
              {evidenceEvents.length} chain event
              {evidenceEvents.length === 1 ? "" : "s"} · {context.events.length}{" "}
              runner event{context.events.length === 1 ? "" : "s"}
            </>
          )}
        </strong>
        <kbd>{open ? "Close" : "Open"}</kbd>
      </button>
      {open &&
        (proofContextMismatch ? (
          <div className="proof-console-body proof-context-blocked">
            <div className="console-empty" role="alert">
              <strong>Proof context does not match this learner mode.</strong>
              <span>
                Evidence stays withheld until the route and stored session mode
                agree.
              </span>
            </div>
          </div>
        ) : (
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
              {proofEventStatus === "loading" ? (
                <div className="console-empty" role="status" aria-live="polite">
                  <strong>Loading the stored session event chain…</strong>
                  <span>Runner activity remains a separate event domain.</span>
                </div>
              ) : null}
              {proofEventStatus === "failed" ? (
                <div className="console-empty" role="alert">
                  <strong>Stored session event chain is unavailable.</strong>
                  <span>
                    No missing lifecycle evidence was inferred from runner
                    activity.
                  </span>
                </div>
              ) : null}
              {proofEventStatus === "idle" && evidenceEvents.length === 0 ? (
                <div className="console-empty">
                  <strong>Stored session event chain not loaded.</strong>
                  <span>
                    Any runner activity shown below remains a separate
                    browser-safe stream.
                  </span>
                </div>
              ) : null}
              {proofEventIssues.length > 0 ? (
                <div className="console-empty" role="alert">
                  <strong>Conflicting proof activity was excluded.</strong>
                  <span>
                    Validated records remain visible; the conflicting records do
                    not contribute to the counts above.
                  </span>
                  <ul>
                    {proofEventIssues.map((issue) => (
                      <li
                        key={`${issue.source}:${issue.index}:${issue.code}:${issue.cursor ?? issue.identity ?? "unknown"}`}
                      >
                        <code>{issue.code}</code> · {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {activeTab === "Provenance" ? (
                <>
                  <ProvenanceLedger context={context} />
                  {onRevokeSessionAccess === undefined ? null : (
                    <CapabilityLinkDisclosure
                      variant="private-session"
                      onRevoke={onRevokeSessionAccess}
                      revokeDisabled={revokeSessionAccessDisabled}
                    />
                  )}
                </>
              ) : !hasTabEvents &&
                proofEventStatus !== "loading" &&
                proofEventStatus !== "failed" ? (
                <div className="console-empty">
                  <strong>
                    No recorded {activeTab.toLowerCase()} evidence is available.
                  </strong>
                  <span>
                    Nothing was inferred or reconstructed for this surface.
                  </span>
                </div>
              ) : (
                <>
                  {proofBundle !== undefined &&
                  proofBundleHasTab(proofBundle, activeTab) ? (
                    <ProofBundleEvidence
                      proofBundle={proofBundle}
                      tab={activeTab}
                    />
                  ) : null}
                  {filteredEvidenceEvents.length > 0 ? (
                    <EvidenceEventList events={filteredEvidenceEvents} />
                  ) : null}
                  {filteredCompilerEvents.length > 0 ? (
                    <CompilerEventList
                      events={filteredCompilerEvents}
                      tab={activeTab}
                    />
                  ) : null}
                </>
              )}
            </div>
          </div>
        ))}
    </section>
  );
}
