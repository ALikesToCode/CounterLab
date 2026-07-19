import { RunnerJobKindSchema, type RunnerJobKind } from "@counterlab/contracts";
import { z } from "zod";

export const ACTIVE_RUNNER_REGISTRY_SCHEMA_VERSION = "1" as const;

const REGISTRY_KEY_PREFIX = "counterlab.activeRunnerRegistry.v1.";
const MAX_ACTIVE_JOBS_PER_SESSION = 32;

const RegistryIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);

const ActiveRunnerRecordSchema = z
  .object({
    jobId: RegistryIdentifierSchema,
    sessionId: RegistryIdentifierSchema,
    kind: RunnerJobKindSchema,
    registeredAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const ActiveRunnerRegistrySchema = z
  .object({
    schemaVersion: z.literal(ACTIVE_RUNNER_REGISTRY_SCHEMA_VERSION),
    sessionId: RegistryIdentifierSchema,
    jobs: z.array(ActiveRunnerRecordSchema).max(MAX_ACTIVE_JOBS_PER_SESSION),
  })
  .strict()
  .superRefine((registry, context) => {
    const jobIds = new Set<string>();
    for (const [index, job] of registry.jobs.entries()) {
      if (job.sessionId !== registry.sessionId) {
        context.addIssue({
          code: "custom",
          path: ["jobs", index, "sessionId"],
          message: "active runner record belongs to another session",
        });
      }
      if (jobIds.has(job.jobId)) {
        context.addIssue({
          code: "custom",
          path: ["jobs", index, "jobId"],
          message: "active runner job IDs must be unique per session",
        });
      }
      jobIds.add(job.jobId);
    }
  });

export type ActiveRunnerRecord = {
  jobId: string;
  sessionId: string;
  kind: RunnerJobKind;
  registeredAt: string;
};

type ActiveRunnerRegistry = z.infer<typeof ActiveRunnerRegistrySchema>;

export function activeRunnerRegistryKey(sessionId: string): string {
  return `${REGISTRY_KEY_PREFIX}${encodeURIComponent(sessionId)}`;
}

function emptyRegistry(sessionId: string): ActiveRunnerRegistry {
  return {
    schemaVersion: ACTIVE_RUNNER_REGISTRY_SCHEMA_VERSION,
    sessionId,
    jobs: [],
  };
}

function removeNamedSession(sessionId: string, storage: Storage): boolean {
  try {
    storage.removeItem(activeRunnerRegistryKey(sessionId));
    return true;
  } catch {
    return false;
  }
}

function loadRegistry(
  sessionId: string,
  storage: Storage,
): ActiveRunnerRegistry | null {
  let serialized: string | null;
  try {
    serialized = storage.getItem(activeRunnerRegistryKey(sessionId));
  } catch {
    return null;
  }
  if (serialized === null) return emptyRegistry(sessionId);

  try {
    const parsed = ActiveRunnerRegistrySchema.safeParse(JSON.parse(serialized));
    if (!parsed.success || parsed.data.sessionId !== sessionId) {
      removeNamedSession(sessionId, storage);
      return emptyRegistry(sessionId);
    }
    return parsed.data;
  } catch {
    removeNamedSession(sessionId, storage);
    return emptyRegistry(sessionId);
  }
}

function compareRecords(
  left: ActiveRunnerRecord,
  right: ActiveRunnerRecord,
): number {
  return (
    left.registeredAt.localeCompare(right.registeredAt) ||
    left.jobId.localeCompare(right.jobId)
  );
}

function persistRegistry(
  registry: ActiveRunnerRegistry,
  storage: Storage,
): boolean {
  const parsed = ActiveRunnerRegistrySchema.safeParse(registry);
  if (!parsed.success) return false;
  if (parsed.data.jobs.length === 0) {
    return removeNamedSession(parsed.data.sessionId, storage);
  }
  try {
    storage.setItem(
      activeRunnerRegistryKey(parsed.data.sessionId),
      JSON.stringify(parsed.data),
    );
    return true;
  } catch {
    return false;
  }
}

export function registerActiveRunnerJob(
  record: ActiveRunnerRecord,
  storage: Storage,
): boolean {
  const parsed = ActiveRunnerRecordSchema.safeParse(record);
  if (!parsed.success) return false;
  const registry = loadRegistry(parsed.data.sessionId, storage);
  if (registry === null) return false;

  const existing = registry.jobs.find(
    (candidate) => candidate.jobId === parsed.data.jobId,
  );
  if (existing !== undefined) {
    return existing.kind === parsed.data.kind;
  }

  return persistRegistry(
    {
      ...registry,
      jobs: [...registry.jobs, parsed.data].sort(compareRecords),
    },
    storage,
  );
}

export function listActiveRunnerJobs(
  sessionId: string,
  storage: Storage,
): ActiveRunnerRecord[] {
  const parsedSessionId = RegistryIdentifierSchema.safeParse(sessionId);
  if (!parsedSessionId.success) return [];
  const registry = loadRegistry(parsedSessionId.data, storage);
  if (registry === null) return [];
  return registry.jobs.map((record) => ({ ...record }));
}

export function markActiveRunnerJobTerminal(
  sessionId: string,
  jobId: string,
  storage: Storage,
): boolean {
  const parsedSessionId = RegistryIdentifierSchema.safeParse(sessionId);
  const parsedJobId = RegistryIdentifierSchema.safeParse(jobId);
  if (!parsedSessionId.success || !parsedJobId.success) return false;
  const registry = loadRegistry(parsedSessionId.data, storage);
  if (registry === null) return false;
  if (
    !registry.jobs.some((candidate) => candidate.jobId === parsedJobId.data)
  ) {
    return true;
  }
  return persistRegistry(
    {
      ...registry,
      jobs: registry.jobs.filter(
        (candidate) => candidate.jobId !== parsedJobId.data,
      ),
    },
    storage,
  );
}

export function clearActiveRunnerSession(
  sessionId: string,
  storage: Storage,
): boolean {
  const parsedSessionId = RegistryIdentifierSchema.safeParse(sessionId);
  if (!parsedSessionId.success) return false;
  return removeNamedSession(parsedSessionId.data, storage);
}
