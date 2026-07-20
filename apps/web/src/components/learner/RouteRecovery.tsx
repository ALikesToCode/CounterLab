import { forwardRef, useId } from "react";

import { learnerSessionStatusLabel } from "./learnerStages";
import styles from "./RouteRecovery.module.css";

export type RouteRecoveryReason =
  | "unknown-route"
  | "missing-session"
  | "missing-proof"
  | "proof-not-ready"
  | "missing-replay"
  | "unverified-replay"
  | "missing-artifact";

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
    eyebrow: "Session unavailable",
    title: "This session could not be restored.",
    body: "The link may be old or incomplete. CounterLab did not open another session or substitute sample evidence.",
    retryLabel: "Retry session",
  },
  "missing-proof": {
    eyebrow: "Proof unavailable",
    title: "This proof could not be found.",
    body: "No Proof Capsule was found for this address. CounterLab did not substitute proof from a sample, replay, or different session.",
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
    eyebrow: "Evidence unavailable",
    title: "This session's notebook evidence could not be restored.",
    body: "The session exists, but its sanitized artifact record is unavailable. No result or proof was displayed without that evidence.",
    retryLabel: "Retry evidence",
  },
};

const modeLabels: Readonly<Record<RouteRecoveryRecentSession["mode"], string>> =
  {
    instant: "Verified sample",
    live: "Live notebook",
    replay: "Verified replay",
  };

export const RouteRecovery = forwardRef<HTMLHeadingElement, RouteRecoveryProps>(
  function RouteRecovery(
    { reason, attemptedPath, onRetry, onHome, recentSessions = [] },
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
          <button className={styles.homeAction} type="button" onClick={onHome}>
            Go to CounterLab home
          </button>
        </div>

        {visibleRecentSessions.length > 0 ? (
          <section className={styles.recent} aria-labelledby={recentTitleId}>
            <div className={styles.recentHeading}>
              <h2 id={recentTitleId}>Recent work from this browser</h2>
              <p>
                Open a different saved session without changing this address.
              </p>
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
