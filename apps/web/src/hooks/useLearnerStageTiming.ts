import { useEffect, useRef } from "react";

import type { LearnerStageId } from "../components/learner/learnerStages";
import { recordLearnerInteraction } from "../features/learner/interactionEvidence";

type ActiveStage = {
  sessionId: string;
  stage: LearnerStageId;
  enteredAtEpochMs: number;
};

function clockNow(): number {
  return Date.now();
}

function elapsedMilliseconds(active: ActiveStage): number {
  return Math.min(
    604_800_000,
    Math.max(0, Math.round(clockNow() - active.enteredAtEpochMs)),
  );
}

type PersistedStageTiming = Readonly<{
  schemaVersion: "1";
  enteredAtEpochMs: number;
  completedElapsedMs?: number;
}>;

function timingStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function timingKey(sessionId: string, stage: LearnerStageId): string {
  return `counterlab.stageTiming.v1.${encodeURIComponent(sessionId)}.${stage}`;
}

function readTiming(
  sessionId: string,
  stage: LearnerStageId,
): PersistedStageTiming | null {
  try {
    const stored = timingStorage()?.getItem(timingKey(sessionId, stage));
    if (stored === null || stored === undefined) return null;
    const value = JSON.parse(stored) as Partial<PersistedStageTiming>;
    if (
      value.schemaVersion !== "1" ||
      !Number.isSafeInteger(value.enteredAtEpochMs) ||
      (value.enteredAtEpochMs ?? -1) < 0 ||
      (value.completedElapsedMs !== undefined &&
        (!Number.isInteger(value.completedElapsedMs) ||
          value.completedElapsedMs < 0 ||
          value.completedElapsedMs > 604_800_000))
    ) {
      return null;
    }
    return value as PersistedStageTiming;
  } catch {
    return null;
  }
}

function writeTiming(
  sessionId: string,
  stage: LearnerStageId,
  timing: PersistedStageTiming,
): void {
  try {
    timingStorage()?.setItem(
      timingKey(sessionId, stage),
      JSON.stringify(timing),
    );
  } catch {
    // Timing evidence remains best-effort when browser storage is unavailable.
  }
}

function enterStage(sessionId: string, stage: LearnerStageId): ActiveStage {
  const persisted = readTiming(sessionId, stage);
  const enteredAtEpochMs = persisted?.enteredAtEpochMs ?? clockNow();
  if (persisted === null) {
    writeTiming(sessionId, stage, {
      schemaVersion: "1",
      enteredAtEpochMs,
    });
  }
  return { sessionId, stage, enteredAtEpochMs };
}

function completeStage(active: ActiveStage): number {
  const persisted = readTiming(active.sessionId, active.stage);
  if (persisted?.completedElapsedMs !== undefined) {
    return persisted.completedElapsedMs;
  }
  const elapsedMs = elapsedMilliseconds(active);
  writeTiming(active.sessionId, active.stage, {
    schemaVersion: "1",
    enteredAtEpochMs: persisted?.enteredAtEpochMs ?? active.enteredAtEpochMs,
    completedElapsedMs: elapsedMs,
  });
  return elapsedMs;
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
      void recordLearnerInteraction(
        sessionId,
        {
          kind: "stage.completed",
          stage: previous.stage,
          elapsedMs: completeStage(previous),
        },
        { deduplicate: "session-stage" },
      );
    }
    active.current = enterStage(sessionId, stage);
    completedJourney.current = null;
    void recordLearnerInteraction(
      sessionId,
      {
        kind: "stage.entered",
        stage,
      },
      { deduplicate: "session-stage" },
    );
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
    void recordLearnerInteraction(
      sessionId,
      {
        kind: "stage.completed",
        stage: "repair",
        elapsedMs: completeStage(current),
      },
      { deduplicate: "session-stage" },
    );
  }, [journeyComplete, sessionId]);
}
