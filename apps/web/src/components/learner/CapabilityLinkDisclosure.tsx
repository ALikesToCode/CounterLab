import { useId } from "react";

import styles from "./CapabilityLinkDisclosure.module.css";

export type CapabilityLinkDisclosureProps =
  | Readonly<{
      variant: "private-session";
      onRevoke?: () => void;
      revokeDisabled?: boolean;
    }>
  | Readonly<{
      variant: "publish-public-replay";
    }>;

const publishedReplayContents = [
  "Claim, hypotheses, prediction, and revision",
  "Scientific result",
  "Boundary, transfer, and patch summaries",
  "Integrity and provenance hashes",
  "Notebook format and evidence locations without source text",
  "Recorded replay time and ordered activity names",
] as const;

const excludedReplayContents = [
  "Raw rows",
  "Notebook bytes",
  "Local paths",
  "Notebook filenames, schema field lists, source excerpts, and patch diff",
  "Source-session identifiers, private Capsule, and owner key",
  "Private Reasoning Diff prose, code, and exact activity timestamps",
] as const;

export function CapabilityLinkDisclosure(props: CapabilityLinkDisclosureProps) {
  const instanceId = useId();
  const titleId = `${instanceId}-capability-link-title`;

  if (props.variant === "private-session") {
    const descriptionId = `${instanceId}-private-session-description`;

    return (
      <section
        className={`${styles.disclosure} ${styles.privateSession}`}
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          <span className={styles.privateStatus}>Private session</span>
          <h3 id={titleId}>This address does not carry your access key.</h3>
        </header>
        <p id={descriptionId} className={styles.lead}>
          The URL is only a locator. A separate owner key held by this browser
          controls access to the private session.
        </p>
        <p className={styles.supportingCopy}>
          The owner key is kept out of the address, public replays, and exported
          evidence.
        </p>
        <p className={styles.supportingCopy}>
          Private sessions and immutable audit records have no automatic expiry
          in this release. Revocation disables this owner key; it does not
          delete stored evidence.
        </p>
        {props.onRevoke !== undefined ? (
          <button
            className={styles.revokeAction}
            type="button"
            disabled={props.revokeDisabled}
            aria-describedby={descriptionId}
            onClick={props.onRevoke}
          >
            Revoke private session access
          </button>
        ) : null}
      </section>
    );
  }

  const includedTitleId = `${instanceId}-included-title`;
  const excludedTitleId = `${instanceId}-excluded-title`;

  return (
    <section
      className={`${styles.disclosure} ${styles.publicReplay}`}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <span className={styles.publicStatus}>Public replay</span>
        <h3 id={titleId}>Review what the public link will reveal.</h3>
      </header>
      <p className={styles.warning}>
        <strong>Anyone with the link can view the published replay.</strong> It
        is read-only, but the evidence listed below becomes public to every
        person who receives the address.
      </p>
      <p className={styles.supportingCopy}>
        The replay remains available for 30 days from publication or until you
        revoke it. Expiry or revocation disables public playback; neither
        deletes the private session or its immutable audit record. They cannot
        retract copies or screenshots someone already made.
      </p>
      <p className={styles.supportingCopy}>
        If the approved claim or hypotheses name a field, that exact statement
        becomes public and appears in the text preview before confirmation.
      </p>

      <div className={styles.contentsGrid}>
        <section
          className={styles.contentsSection}
          aria-labelledby={includedTitleId}
        >
          <h4 id={includedTitleId}>Included in the public replay</h4>
          <ul className={styles.contentsList}>
            {publishedReplayContents.map((item) => (
              <li key={item}>
                <span className={styles.includedMark} aria-hidden="true">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          className={styles.contentsSection}
          aria-labelledby={excludedTitleId}
        >
          <h4 id={excludedTitleId}>Excluded from the public replay</h4>
          <ul className={styles.contentsList}>
            {excludedReplayContents.map((item) => (
              <li key={item}>
                <span className={styles.excludedMark} aria-hidden="true">
                  —
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
