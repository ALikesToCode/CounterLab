import type { PublicProofCapsuleRefV2 } from "../../api";
import styles from "./ReasoningDiffView.module.css";

export function ProofCapsuleView({
  capsule,
  downloadUrl,
  onDownload,
}: {
  capsule: PublicProofCapsuleRefV2;
  downloadUrl: string;
  onDownload?: () => void;
}) {
  return (
    <aside className={styles.capsule} aria-label="Proof Capsule">
      <div>
        <span>
          {capsule.integrity.mode === "hmac-signed"
            ? "Signed machine-facing evidence"
            : "Integrity-hashed machine-facing evidence"}
        </span>
        <h3>Proof Capsule v2</h3>
        <p>
          A portable, replayable record of the approved belief, locked
          prediction, fixed test, Boundary Map, transfer, and verified repair.
        </p>
      </div>
      <a
        className={styles.capsuleAction}
        href={downloadUrl}
        download
        onClick={onDownload}
      >
        Export Proof Capsule
      </a>
    </aside>
  );
}
