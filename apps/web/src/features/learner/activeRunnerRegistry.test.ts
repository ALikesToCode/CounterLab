import { describe, expect, it } from "vitest";

import {
  ACTIVE_RUNNER_REGISTRY_SCHEMA_VERSION,
  activeRunnerRegistryKey,
  clearActiveRunnerSession,
  listActiveRunnerJobs,
  markActiveRunnerJobTerminal,
  registerActiveRunnerJob,
  type ActiveRunnerRecord,
} from "./activeRunnerRegistry";

function memoryStorage(values = new Map<string, string>()): Storage {
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

function unavailableStorage(): Storage {
  const unavailable = (): never => {
    throw new DOMException("Storage is unavailable", "SecurityError");
  };
  return {
    get length() {
      return unavailable();
    },
    clear: unavailable,
    getItem: unavailable,
    key: unavailable,
    removeItem: unavailable,
    setItem: unavailable,
  };
}

function record(
  overrides: Partial<ActiveRunnerRecord> = {},
): ActiveRunnerRecord {
  return {
    sessionId: "session_1",
    jobId: "runner_job_1",
    kind: "LAB_COMPILE",
    registeredAt: "2026-07-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("active runner registry", () => {
  it("uses a versioned per-session key and payload", () => {
    const storage = memoryStorage();

    expect(ACTIVE_RUNNER_REGISTRY_SCHEMA_VERSION).toBe("1");
    expect(activeRunnerRegistryKey("session/one")).toBe(
      "counterlab.activeRunnerRegistry.v1.session%2Fone",
    );
    expect(registerActiveRunnerJob(record(), storage)).toBe(true);
    expect(
      JSON.parse(String(storage.getItem(activeRunnerRegistryKey("session_1")))),
    ).toMatchObject({
      schemaVersion: "1",
      sessionId: "session_1",
      jobs: [record()],
    });
  });

  it("deduplicates retries and survives a reload without changing registration time", () => {
    const values = new Map<string, string>();
    const firstPage = memoryStorage(values);

    expect(registerActiveRunnerJob(record(), firstPage)).toBe(true);
    expect(
      registerActiveRunnerJob(
        record({ registeredAt: "2026-07-19T10:05:00.000Z" }),
        firstPage,
      ),
    ).toBe(true);

    const reloadedPage = memoryStorage(values);
    expect(listActiveRunnerJobs("session_1", reloadedPage)).toEqual([record()]);
  });

  it("removes only the named terminal job and preserves other sessions", () => {
    const storage = memoryStorage();
    registerActiveRunnerJob(record(), storage);
    registerActiveRunnerJob(
      record({
        jobId: "runner_job_2",
        kind: "LAB_RUN",
        registeredAt: "2026-07-19T10:01:00.000Z",
      }),
      storage,
    );
    registerActiveRunnerJob(
      record({
        sessionId: "session_2",
        jobId: "runner_job_other_session",
      }),
      storage,
    );

    expect(
      markActiveRunnerJobTerminal("session_1", "runner_job_1", storage),
    ).toBe(true);
    expect(listActiveRunnerJobs("session_1", storage)).toEqual([
      record({
        jobId: "runner_job_2",
        kind: "LAB_RUN",
        registeredAt: "2026-07-19T10:01:00.000Z",
      }),
    ]);
    expect(listActiveRunnerJobs("session_2", storage)).toEqual([
      record({
        sessionId: "session_2",
        jobId: "runner_job_other_session",
      }),
    ]);

    expect(
      markActiveRunnerJobTerminal("session_1", "runner_job_2", storage),
    ).toBe(true);
    expect(storage.getItem(activeRunnerRegistryKey("session_1"))).toBeNull();
    expect(listActiveRunnerJobs("session_2", storage)).toHaveLength(1);
  });

  it("clears only an explicitly named session", () => {
    const storage = memoryStorage();
    registerActiveRunnerJob(record(), storage);
    registerActiveRunnerJob(
      record({ sessionId: "session_2", jobId: "runner_job_2" }),
      storage,
    );

    expect(clearActiveRunnerSession("session_1", storage)).toBe(true);
    expect(listActiveRunnerJobs("session_1", storage)).toEqual([]);
    expect(listActiveRunnerJobs("session_2", storage)).toHaveLength(1);
  });

  it("fails closed and removes corrupt or cross-session values", () => {
    const storage = memoryStorage();
    storage.setItem(activeRunnerRegistryKey("session_1"), "{not-json");

    expect(listActiveRunnerJobs("session_1", storage)).toEqual([]);
    expect(storage.getItem(activeRunnerRegistryKey("session_1"))).toBeNull();

    storage.setItem(
      activeRunnerRegistryKey("session_1"),
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_2",
        jobs: [record({ sessionId: "session_2" })],
      }),
    );
    registerActiveRunnerJob(
      record({ sessionId: "session_2", jobId: "runner_job_2" }),
      storage,
    );

    expect(listActiveRunnerJobs("session_1", storage)).toEqual([]);
    expect(storage.getItem(activeRunnerRegistryKey("session_1"))).toBeNull();
    expect(listActiveRunnerJobs("session_2", storage)).toHaveLength(1);
  });

  it("never throws when storage is unavailable", () => {
    const storage = unavailableStorage();

    expect(registerActiveRunnerJob(record(), storage)).toBe(false);
    expect(listActiveRunnerJobs("session_1", storage)).toEqual([]);
    expect(
      markActiveRunnerJobTerminal("session_1", "runner_job_1", storage),
    ).toBe(false);
    expect(clearActiveRunnerSession("session_1", storage)).toBe(false);
  });

  it("persists only the privacy-safe allowlisted record fields", () => {
    const storage = memoryStorage();
    const unsafe = {
      ...record(),
      ownerCapability: "owner-secret-token",
      payload: { notebook: "raw notebook contents" },
    };

    expect(
      registerActiveRunnerJob(unsafe as unknown as ActiveRunnerRecord, storage),
    ).toBe(false);
    expect(registerActiveRunnerJob(record(), storage)).toBe(true);

    const serialized = String(
      storage.getItem(activeRunnerRegistryKey("session_1")),
    );
    const persisted = JSON.parse(serialized) as {
      jobs: Array<Record<string, unknown>>;
    };
    expect(Object.keys(persisted.jobs[0] ?? {}).sort()).toEqual(
      ["jobId", "kind", "registeredAt", "sessionId"].sort(),
    );
    expect(serialized).not.toMatch(
      /capability|token|secret|payload|claim|notebook|raw.?rows|local.?path/iu,
    );
  });

  it("rejects an identity-changing duplicate without overwriting it", () => {
    const storage = memoryStorage();
    expect(registerActiveRunnerJob(record(), storage)).toBe(true);
    expect(
      registerActiveRunnerJob(record({ kind: "PATCH_COMPILE" }), storage),
    ).toBe(false);
    expect(listActiveRunnerJobs("session_1", storage)).toEqual([record()]);
  });
});
