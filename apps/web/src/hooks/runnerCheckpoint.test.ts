import { describe, expect, it } from "vitest";

import {
  activeRunnerCheckpointKey,
  clearActiveRunnerCheckpoint,
  readActiveRunnerCheckpoint,
  writeActiveRunnerCheckpoint,
} from "./runnerCheckpoint";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("active runner checkpoint", () => {
  it("writes job identity as one schema-valid storage value", () => {
    const storage = memoryStorage();

    writeActiveRunnerCheckpoint(
      {
        schemaVersion: "1",
        sessionId: "session_1",
        jobId: "runner_job_1",
        kind: "LAB_COMPILE",
      },
      storage,
    );

    expect(readActiveRunnerCheckpoint("session_1", storage)).toEqual({
      schemaVersion: "1",
      sessionId: "session_1",
      jobId: "runner_job_1",
      kind: "LAB_COMPILE",
    });
    expect(storage.length).toBe(1);
  });

  it("fails closed on corrupt or cross-session identity", () => {
    const storage = memoryStorage();
    storage.setItem(
      activeRunnerCheckpointKey("session_1"),
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "another_session",
        jobId: "runner_job_1",
        kind: "LAB_RUN",
      }),
    );

    expect(readActiveRunnerCheckpoint("session_1", storage)).toBeNull();
    expect(storage.getItem(activeRunnerCheckpointKey("session_1"))).toBeNull();
  });

  it("clears only the expected active job", () => {
    const storage = memoryStorage();
    writeActiveRunnerCheckpoint(
      {
        schemaVersion: "1",
        sessionId: "session_1",
        jobId: "runner_job_1",
        kind: "LAB_RUN",
      },
      storage,
    );

    clearActiveRunnerCheckpoint("session_1", "another_job", storage);
    expect(readActiveRunnerCheckpoint("session_1", storage)?.jobId).toBe(
      "runner_job_1",
    );
    clearActiveRunnerCheckpoint("session_1", "runner_job_1", storage);
    expect(readActiveRunnerCheckpoint("session_1", storage)).toBeNull();
  });
});
