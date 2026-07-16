import { useId, useState } from "react";

import type { PublishReplayResponse } from "../../api";
import styles from "./ReplayPublicationPanel.module.css";

export function ReplayPublicationPanel({
  publishReplay,
}: {
  publishReplay: () => Promise<PublishReplayResponse>;
}) {
  const titleId = useId();
  const [publication, setPublication] =
    useState<PublishReplayResponse | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const publish = async () => {
    if (publishing || publication !== null) return;
    setPublishing(true);
    setError(null);
    try {
      setPublication(await publishReplay());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "CounterLab could not publish this replay.",
      );
    } finally {
      setPublishing(false);
    }
  };

  const replayPath =
    publication === null
      ? null
      : `/replay/${encodeURIComponent(publication.replay.replayId)}`;

  const copyReplayLink = async () => {
    if (replayPath === null) return;
    try {
      if (navigator.clipboard?.writeText === undefined) {
        throw new Error("Clipboard access is unavailable.");
      }
      await navigator.clipboard.writeText(
        new URL(replayPath, window.location.origin).toString(),
      );
      setCopyStatus("Replay link copied.");
    } catch {
      setCopyStatus("Copy unavailable. Open the replay and copy its address.");
    }
  };

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.copy}>
        <span>Share the evidence · Optional</span>
        <h3 id={titleId}>
          {publication === null
            ? "Publish a read-only verified replay"
            : "Your verified replay is ready"}
        </h3>
        {publication === null ? (
          <p>
            The raw notebook stays private. CounterLab publishes only the
            sanitized Proof Capsule view, with its original hashes and no new
            model call.
          </p>
        ) : (
          <p aria-live="polite">
            {publication.reused
              ? "Your existing verified replay was returned; no duplicate was created."
              : "Published from this Proof Capsule. Anyone with the link can inspect the read-only evidence."}
          </p>
        )}
        {error !== null && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>

      {replayPath === null ? (
        <button
          className={styles.publishAction}
          type="button"
          disabled={publishing}
          onClick={() => void publish()}
        >
          {publishing
            ? "Publishing replay…"
            : error === null
              ? "Publish read-only replay"
              : "Retry replay publication"}
        </button>
      ) : (
        <div className={styles.actions}>
          <a className={styles.replayAction} href={replayPath}>
            Open verified replay
          </a>
          <button
            className={styles.copyAction}
            type="button"
            onClick={() => void copyReplayLink()}
          >
            Copy replay link
          </button>
          {copyStatus !== null && (
            <span className={styles.copyStatus} aria-live="polite">
              {copyStatus}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
