import { useEffect, useState } from "react";

import {
  type ValidatedSampleProofCapsuleV1,
  validateSampleProofCapsuleV1,
} from "@counterlab/proof-capsule/sample";

import capsuleReference from "../../../../../fixtures/public/leakage_sample_proof_capsule_v1.ref.json";
import capsuleAssetUrl from "../../../../../fixtures/public/leakage_sample_proof_capsule_v1.counterlab?url";
import styles from "./SampleEvidencePack.module.css";

const fileName = "leakage_sample_proof_capsule_v1.counterlab";

type CapsuleLoad = Readonly<{
  bytes: Uint8Array;
  reference: unknown;
}>;

type CapsuleState =
  | Readonly<{ status: "checking" }>
  | Readonly<{
      status: "ready";
      capsule: ValidatedSampleProofCapsuleV1;
      downloadHref: string;
    }>
  | Readonly<{ status: "unavailable" }>;

async function loadCheckedInCapsule(): Promise<CapsuleLoad> {
  const response = await fetch(capsuleAssetUrl, {
    cache: "force-cache",
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`Sample Proof Capsule request failed (${response.status})`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    reference: capsuleReference,
  };
}

type VerifiedDownload = Readonly<{
  href: string;
  revoke: () => void;
}>;

function createVerifiedDownload(bytes: Uint8Array): VerifiedDownload {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const href = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.counterlab.sample-capsule+json",
    }),
  );
  return { href, revoke: () => URL.revokeObjectURL(href) };
}

export async function verifyCheckedInSampleProofCapsule(
  loadCapsule: () => Promise<CapsuleLoad> = loadCheckedInCapsule,
): Promise<ValidatedSampleProofCapsuleV1> {
  const loaded = await loadCapsule();
  return validateSampleProofCapsuleV1(loaded.bytes, loaded.reference);
}

function HashValue({ value }: { value: string }) {
  return <code title={value}>{value}</code>;
}

export function SampleEvidencePack({
  verifyCapsule = verifyCheckedInSampleProofCapsule,
  createDownload = createVerifiedDownload,
}: {
  verifyCapsule?: () => Promise<ValidatedSampleProofCapsuleV1>;
  createDownload?: (bytes: Uint8Array) => VerifiedDownload;
}) {
  const [state, setState] = useState<CapsuleState>({ status: "checking" });

  useEffect(() => {
    let active = true;
    let revokeDownload: (() => void) | null = null;
    void verifyCapsule()
      .then((capsule) => {
        if (!active) return;
        const download = createDownload(capsule.bytes);
        if (!active) {
          download.revoke();
          return;
        }
        revokeDownload = download.revoke;
        setState({
          status: "ready",
          capsule,
          downloadHref: download.href,
        });
      })
      .catch(() => {
        if (active) setState({ status: "unavailable" });
      });
    return () => {
      active = false;
      revokeDownload?.();
    };
  }, [createDownload, verifyCapsule]);

  return (
    <section
      className={styles.pack}
      id="sample-evidence"
      aria-labelledby="sample-evidence-title"
    >
      <div className={styles.intro}>
        <p>Fixed sample proof</p>
        <h2 id="sample-evidence-title">Sample Proof Capsule v1</h2>
        <p>
          A checked-in, integrity-verified archive of this fixed sample. It is
          not a live Proof Capsule v2 and does not imply a model, Codex, runner,
          or learner event occurred.
        </p>
      </div>

      {state.status === "checking" ? (
        <p className={styles.status} role="status" aria-live="polite">
          Checking the archive, exact file hash, and evidence bindings…
        </p>
      ) : state.status === "unavailable" ? (
        <p className={styles.error} role="alert">
          Sample Proof Capsule unavailable: its bytes or authority bindings did
          not verify. Inspection and download are withheld.
        </p>
      ) : (
        <div className={styles.ready}>
          <p className={styles.status} role="status">
            <span aria-hidden="true">✓</span> Capsule bytes match the checked-in
            reference; fixed sample authority bindings resolve
          </p>
          <details>
            <summary>Inspect Sample Proof Capsule</summary>
            <h3>Authority</h3>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>Fixed sample lesson · leakage-01</dd>
              </div>
              <div>
                <dt>Integrity</dt>
                <dd>SHA-256 integrity-hashed · not signed</dd>
              </div>
              <div>
                <dt>GPT-5.6 / Runtime Codex / runner</dt>
                <dd>Not called</dd>
              </div>
              <div>
                <dt>Learner Prediction / revision / event chain</dt>
                <dd>Not represented</dd>
              </div>
              <div>
                <dt>Live Proof Capsule v2</dt>
                <dd>No · separate live-session authority format</dd>
              </div>
            </dl>
            <h3>Exact hash domains</h3>
            <dl>
              <div>
                <dt>Capsule file SHA-256</dt>
                <dd>
                  <HashValue value={state.capsule.reference.bytesSha256} />
                </dd>
              </div>
              <div>
                <dt>Capsule root SHA-256</dt>
                <dd>
                  <HashValue value={state.capsule.reference.rootHash} />
                </dd>
              </div>
              <div>
                <dt>Source artifact file SHA-256</dt>
                <dd>
                  <HashValue
                    value={state.capsule.reference.sourceArtifactFileSha256}
                  />
                </dd>
              </div>
              <div>
                <dt>Artifact manifest entry SHA-256</dt>
                <dd>
                  <HashValue
                    value={state.capsule.reference.artifactManifestFileSha256}
                  />
                </dd>
              </div>
              <div>
                <dt>Fixed-kernel result SHA-256</dt>
                <dd>
                  <HashValue
                    value={state.capsule.reference.primaryResultCanonicalHash}
                  />
                </dd>
              </div>
              <div>
                <dt>Boundary result SHA-256</dt>
                <dd>
                  <HashValue
                    value={state.capsule.reference.boundaryResultHash}
                  />
                </dd>
              </div>
              <div>
                <dt>Scientific-engine snapshot SHA-256</dt>
                <dd>
                  <HashValue
                    value={
                      state.capsule.reference
                        .scientificEngineSnapshotAuthorityHash
                    }
                  />
                </dd>
              </div>
            </dl>
            <h3>Bound reproduction candidate</h3>
            <dl>
              <div>
                <dt>Source commit</dt>
                <dd>
                  <HashValue
                    value={
                      state.capsule.manifest.authority.reproductionCandidate
                        .sourceCommit
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>Container image digest</dt>
                <dd>
                  <HashValue
                    value={
                      state.capsule.manifest.authority.reproductionCandidate
                        .imageDigest
                    }
                  />
                </dd>
              </div>
            </dl>
            <p className={styles.scopeNote}>
              This snapshot records a local candidate runtime. It does not claim
              that the candidate generated this fixture or is the currently
              deployed Worker release; no execution receipt is included.
            </p>
            <h3>Limitations</h3>
            <ul>
              {state.capsule.manifest.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
            <h3>Non-claims</h3>
            <ul>
              {state.capsule.manifest.nonClaims.map((nonClaim) => (
                <li key={nonClaim}>{nonClaim}</li>
              ))}
            </ul>
          </details>
          <a href={state.downloadHref} download={fileName}>
            Download Sample Proof Capsule
          </a>
        </div>
      )}
    </section>
  );
}
