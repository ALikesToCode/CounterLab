import type { PublicCompilerEvent } from "../../api";
import styles from "./FairTestBuilder.module.css";

export type FairTestRepairStory = Readonly<{
  firstPlanChanged: string;
  whyThatWasFlawed: string;
  repairedBy: string;
}>;

export type PublicTechnicalDetail = Readonly<{
  label: string;
  value: string;
}>;

export type FairTestVerificationState = "verifying" | "verified" | "stopped";

type LearnerEventCopy = Readonly<{
  label: string;
  detail: string;
  tone: "working" | "verified" | "rejected";
}>;

export function learnerCopyForPublicEvent(
  event: PublicCompilerEvent,
): LearnerEventCopy {
  switch (event.kind) {
    case "job.started":
      return {
        label: "Protected test started",
        detail: "A bounded runner accepted this one-session test.",
        tone: "working",
      };
    case "plan.summary":
      return {
        label: "The smallest fair test was planned",
        detail:
          "A bounded candidate is ready for fixed scoring and control checks.",
        tone: "working",
      };
    case "artifact.read":
      return {
        label: "Notebook evidence was linked",
        detail: `${event.evidenceRefs.length} approved reference${event.evidenceRefs.length === 1 ? "" : "s"} resolved to the supplied notebook.`,
        tone: "working",
      };
    case "file.created":
      return {
        label: "The bounded test plan was recorded",
        detail: "Only an allowlisted plan artifact was created.",
        tone: "working",
      };
    case "diff.updated":
      return {
        label: "The test plan was repaired",
        detail:
          "A verifier finding changed the bounded plan, not the evidence.",
        tone: "working",
      };
    case "command.completed":
      return event.exitCode === 0
        ? {
            label: "A fixed check completed",
            detail: "An allowlisted check finished within the bounded runner.",
            tone: "verified",
          }
        : {
            label: "A fixed check found a problem",
            detail: "The candidate stopped without releasing a result.",
            tone: "rejected",
          };
    case "verifier.rejected":
      return {
        label: "The verifier caught a flawed test",
        detail: "The rejected plan released no experimental result.",
        tone: "rejected",
      };
    case "repair.started":
      return {
        label: `Bounded repair ${event.attempt} started`,
        detail: "Only the public verifier finding was returned for repair.",
        tone: "working",
      };
    case "verifier.verified":
      return {
        label: "The independent verifier accepted the test",
        detail: `${event.invariantCount} checks and ${event.mutationCount} mutation probes passed.`,
        tone: "verified",
      };
    case "result.ready":
      return {
        label: "The verified result is authorized",
        detail:
          "Fixed computation produced the result now eligible for display.",
        tone: "verified",
      };
    case "job.failed":
      return {
        label: "The test stopped safely",
        detail: "No experimental result was released.",
        tone: "rejected",
      };
  }
}

function isPublicTechnicalDetail(detail: PublicTechnicalDetail): boolean {
  const privateReasoningMarker =
    /(?:private[-_ ]*reasoning|chain[-_ ]*of[-_ ]*thought|internal[-_ ]*(?:reasoning|thought))/iu;
  return !privateReasoningMarker.test(`${detail.label} ${detail.value}`);
}

export function FairTestBuilder({
  whyThisTest,
  deploymentMatch,
  changedVariable,
  heldFixed,
  events,
  repairStory,
  sanitizedTechnicalDetails,
  verificationState,
}: {
  whyThisTest: string;
  deploymentMatch: string;
  changedVariable: string;
  heldFixed: readonly string[];
  events: readonly PublicCompilerEvent[];
  repairStory?: FairTestRepairStory;
  sanitizedTechnicalDetails: readonly PublicTechnicalDetail[];
  verificationState?: FairTestVerificationState;
}) {
  const copies = events.map(learnerCopyForPublicEvent);
  const rejected = events.some((event) => event.kind === "verifier.rejected");
  const repairStarted = events.some((event) => event.kind === "repair.started");
  const testPlanVerified = events.some(
    (event) => event.kind === "verifier.verified",
  );
  const resultReady = events.some((event) => event.kind === "result.ready");
  const failed = events.some((event) => event.kind === "job.failed");
  const resolvedVerificationState =
    verificationState ??
    (testPlanVerified || resultReady
      ? "verified"
      : failed || (rejected && !repairStarted)
        ? "stopped"
        : "verifying");
  const status =
    resolvedVerificationState === "verified"
      ? resultReady
        ? "Verified result ready"
        : "Test plan verified"
      : resolvedVerificationState === "stopped"
        ? "Test stopped safely"
        : "Verification in progress";
  const emptyProgressClass =
    resolvedVerificationState === "verified"
      ? styles.verified
      : resolvedVerificationState === "stopped"
        ? styles.rejected
        : styles.working;
  const publicDetails = sanitizedTechnicalDetails.filter(
    isPublicTechnicalDetail,
  );

  return (
    <section className={styles.builder} aria-labelledby="fair-test-title">
      <header className={styles.header}>
        <div>
          <span>Test</span>
          <h2 id="fair-test-title">Building one fair test.</h2>
        </div>
        <strong className={styles.status} role="status" aria-live="polite">
          <i aria-hidden="true" /> {status}
        </strong>
      </header>

      <section className={styles.why} aria-labelledby="why-test-title">
        <div>
          <span>Why this test?</span>
          <h3 id="why-test-title">{whyThisTest}</h3>
        </div>
        <p>
          <strong>Matches deployment:</strong> {deploymentMatch}
        </p>
      </section>

      <div className={styles.controls}>
        <article>
          <span>Changed</span>
          <strong>{changedVariable}</strong>
        </article>
        <article>
          <span>Held fixed</span>
          <ul>
            {heldFixed.map((control) => (
              <li key={control}>{control}</li>
            ))}
          </ul>
        </article>
      </div>

      <section
        className={styles.progress}
        aria-labelledby="test-progress-title"
      >
        <h3 id="test-progress-title">Verification progress</h3>
        <ol aria-live="polite">
          {copies.length === 0 ? (
            <li className={emptyProgressClass}>
              <i aria-hidden="true" />
              {resolvedVerificationState === "verified" ? (
                <div>
                  <strong>Subject Pack test plan verified</strong>
                  <p>The fixed test plan passed its recorded verification.</p>
                </div>
              ) : resolvedVerificationState === "stopped" ? (
                <div>
                  <strong>The test stopped safely</strong>
                  <p>No experimental result was released.</p>
                </div>
              ) : (
                <div>
                  <strong>Waiting for the protected test to start</strong>
                  <p>No experimental result is available yet.</p>
                </div>
              )}
            </li>
          ) : (
            copies.map((copy, index) => (
              <li
                className={styles[copy.tone]}
                key={`${events[index]?.eventId ?? index}`}
              >
                <i aria-hidden="true" />
                <div>
                  <strong>{copy.label}</strong>
                  <p>{copy.detail}</p>
                </div>
              </li>
            ))
          )}
        </ol>
      </section>

      {rejected ? (
        <aside className={styles.repairStory} aria-label="Rejected test repair">
          <span>Rejected plan · no result released</span>
          <h3>CounterLab caught a flawed test.</h3>
          {repairStory === undefined ? (
            <p>The verifier withheld the plan while the test is repaired.</p>
          ) : (
            <div>
              <p>{repairStory.firstPlanChanged}</p>
              <p>{repairStory.whyThatWasFlawed}</p>
              {repairStarted ? <p>{repairStory.repairedBy}</p> : null}
            </div>
          )}
        </aside>
      ) : null}

      <details className={styles.technical}>
        <summary>Evidence &amp; proof</summary>
        {publicDetails.length === 0 ? (
          <p>No additional public technical detail is available.</p>
        ) : (
          <dl>
            {publicDetails.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </details>
    </section>
  );
}
