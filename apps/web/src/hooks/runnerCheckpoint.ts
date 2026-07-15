import { RunnerJobKindSchema, type RunnerJobKind } from "@counterlab/contracts";
import { z } from "zod";

const ActiveRunnerCheckpointSchema = z
  .object({
    schemaVersion: z.literal("1"),
    sessionId: z.string().trim().min(1),
    jobId: z.string().trim().min(1),
    kind: RunnerJobKindSchema,
  })
  .strict();

export type ActiveRunnerCheckpoint = {
  schemaVersion: "1";
  sessionId: string;
  jobId: string;
  kind: RunnerJobKind;
};

const activeRunnerCheckpointPrefix = "counterlab.activeRunnerJob.";

export function activeRunnerCheckpointKey(sessionId: string): string {
  return `${activeRunnerCheckpointPrefix}${encodeURIComponent(sessionId)}`;
}

export function readActiveRunnerCheckpoint(
  sessionId: string,
  storage: Storage,
): ActiveRunnerCheckpoint | null {
  const key = activeRunnerCheckpointKey(sessionId);
  try {
    const serialized = storage.getItem(key);
    if (serialized === null) return null;
    const parsed = ActiveRunnerCheckpointSchema.safeParse(
      JSON.parse(serialized),
    );
    if (!parsed.success || parsed.data.sessionId !== sessionId) {
      storage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage is an optimization; D1 remains authoritative.
    }
    return null;
  }
}

export function writeActiveRunnerCheckpoint(
  checkpoint: ActiveRunnerCheckpoint,
  storage: Storage,
): boolean {
  const parsed = ActiveRunnerCheckpointSchema.safeParse(checkpoint);
  if (!parsed.success) return false;
  try {
    storage.setItem(
      activeRunnerCheckpointKey(parsed.data.sessionId),
      JSON.stringify(parsed.data),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearActiveRunnerCheckpoint(
  sessionId: string,
  jobId: string | undefined,
  storage: Storage,
): void {
  const active = readActiveRunnerCheckpoint(sessionId, storage);
  if (active === null || (jobId !== undefined && active.jobId !== jobId))
    return;
  try {
    storage.removeItem(activeRunnerCheckpointKey(sessionId));
  } catch {
    // The checkpoint is only a reconnect aid and cannot grant authority.
  }
}

export function clearAllActiveRunnerCheckpoints(storage: Storage): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter(
      (key): key is string =>
        key !== null && key.startsWith(activeRunnerCheckpointPrefix),
    );
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage cleanup must not block starting over.
  }
}
