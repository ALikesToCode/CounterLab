import type { PublicProofCapsuleRefV2 } from "../../api";
import styles from "./ReasoningDiffView.module.css";

export function ProofCapsuleView({
  capsule,
  downloadUrl,
}: {
  capsule: PublicProofCapsuleRefV2;
  downloadUrl: string;
}) {
  const integrityLabel =
    capsule.integrity.mode === "hmac-signed"
      ? "HMAC-signed"
      : "Integrity-hashed";
  return (
    <aside className={styles.capsule} aria-label="Proof Capsule">
      <div>
        <span>Machine-facing evidence</span>
        <h3>Proof Capsule v2</h3>
        <p>
          A portable, replayable record of the approved belief, locked
          prediction, fixed test, Boundary Map, transfer, and verified repair.
        </p>
      </div>
      <dl>
        <div>
          <dt>Integrity</dt>
          <dd>{integrityLabel}</dd>
        </div>
        <div>
          <dt>Root hash</dt>
          <dd>{capsule.rootHash.slice(0, 16)}…</dd>
        </div>
        <div>
          <dt>Exact bytes</dt>
          <dd>
            {capsule.byteLength.toLocaleString()} · {capsule.bytesHash.slice(0, 12)}…
          </dd>
        </div>
        {capsule.integrity.mode === "hmac-signed" ? (
          <div>
            <dt>Key ID</dt>
            <dd>{capsule.integrity.keyId}</dd>
          </div>
        ) : null}
      </dl>
      <a className={styles.capsuleAction} href={downloadUrl} download>
        Export Proof Capsule
      </a>
    </aside>
  );
}
