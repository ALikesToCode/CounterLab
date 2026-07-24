import { useCallback, useEffect, useRef, useState } from "react";

import type { BoundaryResponse } from "../../api";
import { BoundaryMapBlock } from "../../components/generative-ui/BoundaryMapBlock";
import { BoundaryHunt, type BoundaryHuntProps } from "./BoundaryHunt";
import { huntDataFor } from "./boundaryHuntData";
import styles from "./SampleBoundaryExperience.module.css";

export interface SampleBoundaryExperienceProps {
  readonly boundary: BoundaryResponse;
  readonly integrityVerified: boolean;
  readonly prediction?: string;
  readonly onClassify?: NonNullable<BoundaryHuntProps["onClassify"]>;
  readonly onReveal?: () => void;
}

export function SampleBoundaryExperience({
  boundary,
  integrityVerified,
  prediction,
  onClassify,
  onReveal,
}: SampleBoundaryExperienceProps) {
  const experienceRef = useRef<HTMLElement>(null);
  const resultHash = boundary.result.resultHash;
  const [revealedBoundaryHash, setRevealedBoundaryHash] = useState<
    string | null
  >(null);
  const [huntSkipped, setHuntSkipped] = useState(false);
  const mapRevealed = revealedBoundaryHash === resultHash;

  const revealMap = useCallback(() => {
    if (revealedBoundaryHash === resultHash) return;
    setRevealedBoundaryHash(resultHash);
    onReveal?.();
  }, [onReveal, resultHash, revealedBoundaryHash]);

  const skipHunt = useCallback(() => {
    setHuntSkipped(true);
    revealMap();
  }, [revealMap]);

  useEffect(() => {
    if (revealedBoundaryHash !== resultHash) return;
    experienceRef.current
      ?.querySelector<HTMLElement>("#boundary-map-title")
      ?.focus();
  }, [resultHash, revealedBoundaryHash]);

  if (!integrityVerified || boundary.report.status !== "VERIFIED") {
    return (
      <section
        className={styles.experience}
        role="alert"
        aria-label="Sample Boundary unavailable"
        data-sample-authority="rejected"
      >
        <div className={styles.presentation}>
          <strong>Verified sample evidence is unavailable.</strong>
          <p>
            CounterLab refused to present this Boundary because its stored
            authority did not pass the local integrity check.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={experienceRef}
      className={styles.experience}
      aria-label="Verified sample Boundary experience"
      data-boundary-result-hash={resultHash}
      data-sample-authority="verified"
    >
      <aside
        className={styles.authority}
        aria-label="Sample Boundary authority"
      >
        <span className={styles.authorityMark} aria-hidden="true" />
        <div>
          <strong>Verified sample exploration</strong>
          <span>Stored verified cells · no model call or new calculation</span>
        </div>
      </aside>

      <div className={styles.presentation}>
        {huntSkipped ? (
          <section className="revision panel" role="status">
            <strong>Map revealed without a Boundary classification.</strong>
            <p>
              Apply is available once the verified map is visible; this lesson
              does not grade your choice.
            </p>
            <button
              className="button button-quiet"
              type="button"
              onClick={() => setHuntSkipped(false)}
            >
              Return to the Boundary hunt
            </button>
          </section>
        ) : (
          <BoundaryHunt
            boundary={huntDataFor(boundary)}
            onRevealMap={revealMap}
            onSkip={skipHunt}
            {...(onClassify === undefined ? {} : { onClassify })}
          />
        )}
        {mapRevealed ? (
          <BoundaryMapBlock
            boundary={boundary}
            {...(prediction === undefined ? {} : { prediction })}
          />
        ) : null}
      </div>
    </section>
  );
}
