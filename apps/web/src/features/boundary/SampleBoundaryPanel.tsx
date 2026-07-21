import { useEffect, useState } from "react";

import type { BoundaryResponse } from "../../api";
import { recordLearnerInteraction } from "../learner/interactionEvidence";
import { SampleBoundaryExperience } from "./SampleBoundaryExperience";
import {
  sampleBoundaryFixture,
  verifySampleBoundaryFixtureIntegrity,
} from "./sampleBoundaryFixture";

export function SampleBoundaryPanel({
  sessionId,
  prediction,
  onComplete,
}: {
  sessionId: string;
  prediction?: string;
  onComplete: () => void;
}) {
  const [boundary, setBoundary] = useState<BoundaryResponse | null>(null);
  const [integrityRejected, setIntegrityRejected] = useState(false);

  useEffect(() => {
    let active = true;
    void verifySampleBoundaryFixtureIntegrity(sampleBoundaryFixture)
      .then((verified) => {
        if (active) setBoundary(verified.boundary);
      })
      .catch(() => {
        if (active) setIntegrityRejected(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (integrityRejected) {
    return (
      <section role="alert" aria-label="Sample Boundary unavailable">
        <strong>Verified sample evidence is unavailable.</strong>
        <p>
          CounterLab refused to present this Boundary because its checked-in
          integrity binding did not resolve.
        </p>
      </section>
    );
  }
  if (boundary === null) {
    return (
      <section
        role="status"
        aria-label="Checking verified sample evidence"
        aria-live="polite"
      >
        <strong>Checking verified sample evidence…</strong>
      </section>
    );
  }

  return (
    <SampleBoundaryExperience
      boundary={boundary}
      integrityVerified={true}
      {...(prediction === undefined ? {} : { prediction })}
      onClassify={(classification) => {
        void recordLearnerInteraction(sessionId, {
          kind: "boundary_hunt.classified",
          stage: "boundary",
          classification,
        });
        if (classification === "CONCLUSION_CHANGES") onComplete();
      }}
    />
  );
}
