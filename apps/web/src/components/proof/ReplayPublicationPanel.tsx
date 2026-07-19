import { useCallback, useEffect, useId, useState } from "react";

import type {
  PublishReplayResponse,
  ReplayPublicationStatus,
  RevokeReplayResponse,
} from "../../api";
import { CapabilityLinkDisclosure } from "../learner/CapabilityLinkDisclosure";
import styles from "./ReplayPublicationPanel.module.css";

export type PublicReplayTextPreview = Readonly<{
  claim: string;
  hypotheses: readonly [string, string];
  prediction: string;
  revision: string;
}>;

export function ReplayPublicationPanel({
  publishReplay,
  revokeReplay,
  loadReplayStatus,
  publicTextPreview,
}: {
  publishReplay: () => Promise<PublishReplayResponse>;
  revokeReplay?: () => Promise<RevokeReplayResponse>;
  loadReplayStatus?: () => Promise<ReplayPublicationStatus>;
  publicTextPreview: PublicReplayTextPreview;
}) {
  const titleId = useId();
  const consentId = useId();
  const [publication, setPublication] = useState<PublishReplayResponse | null>(
    null,
  );
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [statusLoading, setStatusLoading] = useState(
    loadReplayStatus !== undefined,
  );
  const [statusChecked, setStatusChecked] = useState(
    loadReplayStatus === undefined,
  );

  const refreshReplayStatus = useCallback(async () => {
    if (loadReplayStatus === undefined) return;
    setStatusLoading(true);
    setError(null);
    try {
      const status = await loadReplayStatus();
      if (status.status === "never_published") {
        setPublication(null);
        setRevoked(false);
      } else {
        setPublication({ reused: true, replay: status.replay });
        setRevoked(status.status === "revoked");
      }
      setStatusChecked(true);
    } catch (caught) {
      setStatusChecked(false);
      setError(
        caught instanceof Error
          ? caught.message
          : "CounterLab could not check replay publication status.",
      );
    } finally {
      setStatusLoading(false);
    }
  }, [loadReplayStatus]);

  useEffect(() => {
    void refreshReplayStatus();
  }, [refreshReplayStatus]);

  const publish = async () => {
    if (publishing || publication !== null || !statusChecked) return;
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
    publication === null || revoked
      ? null
      : `/replay/${encodeURIComponent(publication.replay.replayId)}`;

  const revoke = async () => {
    if (publication === null || revokeReplay === undefined || revoking) return;
    setRevoking(true);
    setError(null);
    try {
      await revokeReplay();
      setRevoked(true);
      setCopyStatus(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "CounterLab could not revoke this replay.",
      );
    } finally {
      setRevoking(false);
    }
  };

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
            : revoked
              ? "This public replay is revoked"
              : "Your verified replay is ready"}
        </h3>
        {publication === null ? (
          <p>
            CounterLab publishes a separate share-safe projection bound to the
            private Proof Capsule. Notebook bytes, source excerpts, patch diff,
            and private identifiers stay out of the public response.
          </p>
        ) : revoked ? (
          <p role="status">
            Public playback is disabled. Your private session and immutable
            evidence remain unchanged.
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

      {publication === null ? (
        <div>
          <CapabilityLinkDisclosure variant="publish-public-replay" />
          <details>
            <summary>Preview learner-authored text that becomes public</summary>
            <dl>
              <div>
                <dt>Claim</dt>
                <dd>{publicTextPreview.claim}</dd>
              </div>
              <div>
                <dt>Current hypothesis</dt>
                <dd>{publicTextPreview.hypotheses[0]}</dd>
              </div>
              <div>
                <dt>Competing hypothesis</dt>
                <dd>{publicTextPreview.hypotheses[1]}</dd>
              </div>
              <div>
                <dt>Prediction</dt>
                <dd>{publicTextPreview.prediction}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{publicTextPreview.revision}</dd>
              </div>
            </dl>
          </details>
          <label htmlFor={consentId}>
            <input
              id={consentId}
              type="checkbox"
              checked={publicationConfirmed}
              onChange={(event) =>
                setPublicationConfirmed(event.currentTarget.checked)
              }
            />
            I understand that the listed evidence and learner-authored text
            become public to anyone with the replay link.
          </label>
        </div>
      ) : null}

      {publication === null ? (
        <button
          className={styles.publishAction}
          type="button"
          disabled={
            statusLoading ||
            (statusChecked && (publishing || !publicationConfirmed))
          }
          onClick={() =>
            void (statusChecked ? publish() : refreshReplayStatus())
          }
        >
          {statusLoading
            ? "Checking replay status…"
            : !statusChecked
              ? "Retry replay status check"
              : publishing
                ? "Publishing replay…"
                : error === null
                  ? "Confirm and publish read-only replay"
                  : "Retry replay publication"}
        </button>
      ) : revoked ? null : (
        <div className={styles.actions}>
          {replayPath === null ? null : (
            <a className={styles.replayAction} href={replayPath}>
              Open verified replay
            </a>
          )}
          <button
            className={styles.copyAction}
            type="button"
            onClick={() => void copyReplayLink()}
          >
            Copy replay link
          </button>
          {revokeReplay === undefined ? null : (
            <button
              className={styles.copyAction}
              type="button"
              disabled={revoking}
              onClick={() => void revoke()}
            >
              {revoking ? "Revoking replay…" : "Revoke public replay"}
            </button>
          )}
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
