import { useEffect, useRef } from "react";

import type { LearnerStageId } from "../components/learner/learnerStages";
import { recordLearnerInteraction } from "../features/learner/interactionEvidence";

type ActiveStage = {
  sessionId: string;
  stage: LearnerStageId;
  enteredAt: number;
};

function clockNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function elapsedMilliseconds(active: ActiveStage): number {
  return Math.min(
    604_800_000,
    Math.max(0, Math.round(clockNow() - active.enteredAt)),
  );
}

export function useLearnerStageTiming({
  sessionId,
  stage,
  journeyComplete,
}: {
  sessionId: string | null;
  stage: LearnerStageId;
  journeyComplete: boolean;
}): void {
  const active = useRef<ActiveStage | null>(null);
  const completedJourney = useRef<string | null>(null);

  useEffect(() => {
    if (sessionId === null) {
      active.current = null;
      completedJourney.current = null;
      return;
    }
    const previous = active.current;
    if (previous?.sessionId === sessionId && previous.stage === stage) return;
    if (previous?.sessionId === sessionId) {
      void recordLearnerInteraction(sessionId, {
        kind: "stage.completed",
        stage: previous.stage,
        elapsedMs: elapsedMilliseconds(previous),
      });
    }
    active.current = { sessionId, stage, enteredAt: clockNow() };
    completedJourney.current = null;
    void recordLearnerInteraction(sessionId, {
      kind: "stage.entered",
      stage,
    });
  }, [sessionId, stage]);

  useEffect(() => {
    const current = active.current;
    if (
      !journeyComplete ||
      sessionId === null ||
      current?.sessionId !== sessionId ||
      current.stage !== "repair" ||
      completedJourney.current === sessionId
    ) {
      return;
    }
    completedJourney.current = sessionId;
    void recordLearnerInteraction(sessionId, {
      kind: "stage.completed",
      stage: "repair",
      elapsedMs: elapsedMilliseconds(current),
    });
  }, [journeyComplete, sessionId]);
}
