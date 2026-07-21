import { forwardRef, useId } from "react";

import { learnerSessionStatusLabel } from "./learnerStages";
import styles from "./RouteRecovery.module.css";

export type RouteRecoveryReason =
  | "unknown-route"
  | "missing-session"
  | "session-unavailable"
  | "missing-proof"
  | "proof-unavailable"
  | "proof-not-ready"
  | "missing-replay"
  | "unverified-replay"
  | "missing-artifact"
  | "artifact-unavailable";

export type RouteRecoveryRecentSession = Readonly<{
  id: string;
  title: string;
  mode: "instant" | "live" | "replay";
  status: string;
  onOpen: () => void;
  disabled?: boolean;
}>;

export type RouteRecoveryProps = Readonly<{
  reason: RouteRecoveryReason;
  attemptedPath: string;
  onRetry: () => void;
  onBack: () => void;
  onHome: () => void;
  recentSessions?: readonly RouteRecoveryRecentSession[];
}>;

const recoveryCopy: Readonly<
  Record<
    RouteRecoveryReason,
    Readonly<{
      eyebrow: string;
      title: string;
      body: string;
      retryLabel: string;
    }>
  >
> = {
  "unknown-route": {
    eyebrow: "Address not recognized",
    title: "We couldn't find that CounterLab page.",
    body: "This address does not match a supported CounterLab route. No session, replay, result, or proof was opened in its place.",
    retryLabel: "Retry this address",
  },
  "missing-session": {
    eyebrow: "Private session not available",
    title: "This private session could not be opened.",
    body: "Private work requires the browser capability that created it. CounterLab intentionally does not reveal whether an inaccessible address exists, and it never substitutes sample evidence. Publish a verified replay when you need a shareable link.",
    retryLabel: "Retry session",
  },
  "session-unavailable": {
    eyebrow: "Session unavailable",
    title: "This session could not be loaded.",
    body: "CounterLab could not confirm the session right now. It did not call the session missing or substitute other evidence.",
    retryLabel: "Retry session",
  },
  "missing-proof": {
    eyebrow: "Private proof not available",
    title: "This private proof could not be opened.",
    body: "Private proof requires the browser capability that created its session. CounterLab intentionally does not reveal whether an inaccessible address exists and never substitutes proof from another mode. Publish a verified replay when you need a shareable link.",
    retryLabel: "Retry proof",
  },
  "proof-unavailable": {
    eyebrow: "Proof unavailable",
    title: "This proof could not be loaded.",
    body: "CounterLab could not confirm this proof right now. It did not call the proof missing or substitute another proof.",
    retryLabel: "Retry proof",
  },
  "proof-not-ready": {
    eyebrow: "Proof pending",
    title: "This proof is not ready yet.",
    body: "The session exists, but its Proof Capsule has not been issued. CounterLab will not run or resume a test from this screen.",
    retryLabel: "Check again",
  },
  "missing-replay": {
    eyebrow: "Replay unavailable",
    title: "This replay was not found.",
    body: "No replay evidence was found for this address. CounterLab did not label or substitute a different replay.",
    retryLabel: "Retry replay",
  },
  "unverified-replay": {
    eyebrow: "Replay verification failed",
    title: "This replay could not be verified.",
    body: "CounterLab could not confirm the stored replay evidence. It did not label or substitute another replay.",
    retryLabel: "Retry verification",
  },
  "missing-artifact": {
    eyebrow: "Evidence not found",
    title: "This session's notebook evidence was not found.",
    body: "The session exists, but no sanitized artifact record exists at this address. No result or proof was displayed without that evidence.",
    retryLabel: "Retry evidence",
  },
  "artifact-unavailable": {
    eyebrow: "Evidence unavailable",
    title: "This session's notebook evidence could not be loaded.",
    body: "CounterLab could not confirm the sanitized artifact record right now. It did not call the evidence missing or display a result without it.",
    retryLabel: "Retry evidence",
  },
};

const modeLabels: Readonly<Record<RouteRecoveryRecentSession["mode"], string>> =
  {
    instant: "Verified sample",
    live: "Live notebook",
    replay: "Stored replay",
  };

export const RouteRecovery = forwardRef<HTMLHeadingElement, RouteRecoveryProps>(
  function RouteRecovery(
    { reason, attemptedPath, onRetry, onBack, onHome, recentSessions = [] },
    headingRef,
  ) {
    const instanceId = useId();
    const titleId = `${instanceId}-route-recovery-title`;
    const bodyId = `${instanceId}-route-recovery-body`;
    const pathId = `${instanceId}-route-recovery-path`;
    const recentTitleId = `${instanceId}-recent-title`;
    const copy = recoveryCopy[reason];
    const pending = reason === "proof-not-ready";
    const visibleRecentSessions = recentSessions.slice(0, 3);

    return (
      <main
        className={`${styles.recovery} ${pending ? styles.pending : styles.unavailable}`}
        id="main-content"
        tabIndex={-1}
        aria-labelledby={titleId}
      >
        <div
          className={styles.notice}
          role={pending ? "status" : "alert"}
          aria-labelledby={titleId}
          aria-describedby={`${bodyId} ${pathId}`}
        >
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id={titleId} ref={headingRef} tabIndex={-1}>
            {copy.title}
          </h1>
          <p id={bodyId} className={styles.body}>
            {copy.body}
          </p>
          <p id={pathId} className={styles.path}>
            <span>Requested address</span>
            <code>{attemptedPath}</code>
          </p>
        </div>

        <div className={styles.actions} aria-label="Recovery actions">
          <button
            className={styles.retryAction}
            type="button"
            onClick={onRetry}
          >
            {copy.retryLabel}
          </button>
          <button className={styles.homeAction} type="button" onClick={onBack}>
            Back
          </button>
          <button className={styles.homeAction} type="button" onClick={onHome}>
            Go to CounterLab home
          </button>
        </div>

        {visibleRecentSessions.length > 0 ? (
          <section className={styles.recent} aria-labelledby={recentTitleId}>
            <div className={styles.recentHeading}>
              <h2 id={recentTitleId}>Recent work from this browser</h2>
              <p>Open a different saved session at its recorded address.</p>
            </div>
            <ul>
              {visibleRecentSessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    disabled={session.disabled}
                    onClick={session.onOpen}
                  >
                    <strong>{session.title}</strong>
                    <span>
                      {modeLabels[session.mode]} ·{" "}
                      {learnerSessionStatusLabel(session.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    );
  },
);
