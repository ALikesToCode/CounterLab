import styles from "./PrivacyPacketSummary.module.css";

export type SanitizedPrivacyPacket = Readonly<{
  exactPacket: Readonly<Record<string, unknown>>;
}>;

export function PrivacyPacketSummary({
  packet,
}: {
  packet: SanitizedPrivacyPacket;
}) {
  return (
    <aside className={styles.summary} aria-label="Privacy packet summary">
      <h2>CounterLab will send:</h2>
      <div className={styles.columns}>
        <ul className={styles.included} aria-label="Included information">
          <li>✓ your claim</li>
          <li>✓ short notebook excerpts</li>
          <li>✓ non-sensitive schema names and roles</li>
        </ul>
        <ul className={styles.excluded} aria-label="Excluded information">
          <li>✕ no raw rows</li>
          <li>✕ no notebook file</li>
          <li>✕ no local paths</li>
          <li>✕ no declared identifier names</li>
        </ul>
      </div>
      <p className={styles.limitation}>
        CounterLab removes declared identifiers and common sensitive patterns.
        Automated redaction cannot guarantee complete de-identification, so
        review the exact packet before sending it.
      </p>
      <details className={styles.packet}>
        <summary>Review exact packet</summary>
        <pre aria-label="Exact sanitized packet">
          <code>{JSON.stringify(packet.exactPacket, null, 2)}</code>
        </pre>
      </details>
    </aside>
  );
}
