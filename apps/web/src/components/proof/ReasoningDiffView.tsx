import type {
  PatchResult,
  PublishReplayResponse,
  PublicProofCapsuleRefV2,
  ReasoningDiffV2,
} from "../../api";
import { ProofCapsuleView } from "./ProofCapsuleView";
import { ReplayPublicationPanel } from "./ReplayPublicationPanel";
import styles from "./ReasoningDiffView.module.css";

const dimensionOrder = [
  ["belief", "Belief"],
  ["prediction", "Prediction"],
  ["evidence", "Evidence"],
  ["boundary", "Boundary"],
  ["behavior", "Apply"],
  ["code", "Repair"],
] as const;

const authorityLabels: Record<
  keyof ReasoningDiffV2["authority"],
  string
> = {
  artifactManifestHash: "Artifact",
  beliefSpecHash: "Belief Spec",
  predictionHash: "Prediction",
  experimentIrHash: "Experiment IR",
  selectionHash: "Selection",
  authoritativeResultHash: "Result",
  evidenceVerdictHash: "Verdict",
  epistemicReportHash: "Epistemic report",
  boundaryMapHash: "Boundary Map",
  boundaryReceiptHash: "Boundary receipt",
  transferResultHash: "Transfer",
  patchPlanHash: "Patch Plan",
  patchResultHash: "Patch result",
  patchedArtifactHash: "Patched artifact",
};

export function ReasoningDiffView({
  diff,
  capsule,
  patch,
  patchDownloadUrl,
  proofCapsuleDownloadUrl,
  publishReplay,
}: {
  diff: ReasoningDiffV2;
  capsule: PublicProofCapsuleRefV2;
  patch: PatchResult;
  patchDownloadUrl: string;
  proofCapsuleDownloadUrl: string;
  publishReplay?: () => Promise<PublishReplayResponse>;
}) {
  return (
    <section className={styles.reasoningDiff} aria-labelledby="reasoning-diff-v2-title">
      <header className={styles.header}>
        <div>
          <span>Reasoning Diff · Verified</span>
          <h2 id="reasoning-diff-v2-title">
            What changed wasn’t just the score. It was the rule.
          </h2>
          <p>
            This ledger binds your original Question to the evidence, Boundary,
            transfer action, and minimal verified repair from this session.
          </p>
        </div>
        <strong>6 evidence-linked changes</strong>
      </header>

      <ol className={styles.ledger} aria-label="Reasoning Diff dimensions">
        {dimensionOrder.map(([key, label], index) => {
          const dimension = diff.dimensions[key];
          return (
            <li
              className={key === "code" ? styles.codeRow : undefined}
              key={key}
            >
              <div className={styles.dimension}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{label}</h3>
              </div>
              <dl>
                <div className={styles.before}>
                  <dt>Before</dt>
                  <dd>{dimension.before}</dd>
                </div>
                <div className={styles.after}>
                  <dt>After</dt>
                  <dd>{dimension.after}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>

      <section className={styles.repair} aria-label="Verified notebook repair">
        <div>
          <span>Repair · Original untouched</span>
          <h3>Your corrected notebook copy passed the patch verifier.</h3>
          <p>
            Cells {patch.modifiedCells.join(", ")} changed · {" "}
            {patch.verification.unchangedCellHashes.length} unrelated cells
            proven unchanged.
          </p>
        </div>
        <a className={styles.primaryAction} href={patchDownloadUrl} download>
          Download repaired notebook
        </a>
      </section>

      <details className={styles.patchDetails}>
        <summary>Review the verified notebook-cell diff</summary>
        <pre aria-label="Verified notebook cell diff">
          <code>{patch.diff}</code>
        </pre>
        <ul aria-label="Patch verifier properties">
          {patch.verification.invariants.map((invariant) => (
            <li key={invariant}>{invariant.replaceAll("_", " ")}</li>
          ))}
        </ul>
      </details>

      <ProofCapsuleView
        capsule={capsule}
        downloadUrl={proofCapsuleDownloadUrl}
      />

      {publishReplay !== undefined && (
        <ReplayPublicationPanel publishReplay={publishReplay} />
      )}

      <details className={styles.proof}>
        <summary>Evidence &amp; proof</summary>
        <div className={styles.proofBody}>
          <section>
            <h3>Authority hashes</h3>
            <dl>
              {Object.entries(diff.authority).map(([key, value]) => (
                <div key={key}>
                  <dt>{authorityLabels[key as keyof typeof authorityLabels]}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h3>Limitations</h3>
            <ul>
              {diff.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
            <p>
              {diff.evidenceEventHashes.length} append-only evidence events ·
              issued {new Date(diff.issuedAt).toLocaleString()}
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}
