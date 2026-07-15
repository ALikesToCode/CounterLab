import {
  ArtifactManifestSchema,
  RunnerCallbackSchema,
  RunnerJobSchema,
  type RunnerJobStatus,
} from "@counterlab/contracts";

export type OperationalDiagnosticRow = {
  kind: string;
  status: string;
  concept_pack_id: string;
  created_at: string;
  updated_at: string;
  job_json: string;
  manifest_json: string;
  callback_json: string | null;
};

const JOB_STATUSES = [
  "QUEUED",
  "STARTING",
  "RUNNING",
  "AWAITING_APPROVAL",
  "REPAIRING",
  "VERIFIED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
] as const satisfies readonly RunnerJobStatus[];

function emptyCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function elapsed(start: string, end: string | undefined): number {
  if (end === undefined) return 0;
  return Math.max(0, Date.parse(end) - Date.parse(start));
}

function average(total: number, count: number): number {
  return count === 0 ? 0 : Math.round(total / count);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function summarizeOperationalRows(
  rows: readonly OperationalDiagnosticRow[],
  generatedAt: string,
  windowHours = 168,
) {
  const statusCounts = emptyCounts(JOB_STATUSES);
  const byConcept = new Map<string, number>();
  const byKind = new Map<string, number>();
  const supportStatuses = new Map<string, number>();
  const failures = new Map<string, number>();
  const timingTotals = {
    queueMs: 0,
    totalMs: 0,
    compilerMs: 0,
    verifierMs: 0,
    kernelMs: 0,
    patchMs: 0,
  };
  const timingSamples = {
    queue: 0,
    total: 0,
    compiler: 0,
    verifier: 0,
    kernel: 0,
    patch: 0,
  };
  const tokenUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  };
  let validJobs = 0;
  let repairAttempts = 0;

  for (const row of rows) {
    const job = RunnerJobSchema.safeParse(parseJson(row.job_json));
    const manifest = ArtifactManifestSchema.safeParse(
      parseJson(row.manifest_json),
    );
    const callback =
      row.callback_json === null
        ? null
        : RunnerCallbackSchema.safeParse(parseJson(row.callback_json));
    if (!job.success || !manifest.success) continue;
    validJobs += 1;
    statusCounts[job.data.status] += 1;
    byConcept.set(
      job.data.conceptPack.id,
      (byConcept.get(job.data.conceptPack.id) ?? 0) + 1,
    );
    byKind.set(job.data.kind, (byKind.get(job.data.kind) ?? 0) + 1);
    supportStatuses.set(
      manifest.data.support.status,
      (supportStatuses.get(manifest.data.support.status) ?? 0) + 1,
    );
    if (job.data.error !== undefined) {
      failures.set(
        job.data.error.code,
        (failures.get(job.data.error.code) ?? 0) + 1,
      );
    }
    if (job.data.startedAt !== undefined) {
      timingTotals.queueMs += elapsed(job.data.createdAt, job.data.startedAt);
      timingSamples.queue += 1;
    }
    if (job.data.completedAt !== undefined) {
      timingTotals.totalMs += elapsed(job.data.createdAt, job.data.completedAt);
      timingSamples.total += 1;
    }

    if (callback?.success && callback.data.operationalMetrics !== undefined) {
      const metrics = callback.data.operationalMetrics;
      timingTotals.compilerMs += metrics.compilerDurationMs;
      timingTotals.verifierMs += metrics.verifierDurationMs;
      timingTotals.kernelMs += metrics.kernelDurationMs;
      timingTotals.patchMs += metrics.patchDurationMs;
      if (metrics.compilerDurationMs > 0) timingSamples.compiler += 1;
      if (metrics.verifierDurationMs > 0) timingSamples.verifier += 1;
      if (metrics.kernelDurationMs > 0) timingSamples.kernel += 1;
      if (metrics.patchDurationMs > 0) timingSamples.patch += 1;
      repairAttempts += metrics.repairAttempts;
      tokenUsage.inputTokens += metrics.planTokenUsage.inputTokens;
      tokenUsage.cachedInputTokens += metrics.planTokenUsage.cachedInputTokens;
      tokenUsage.outputTokens += metrics.planTokenUsage.outputTokens;
      tokenUsage.reasoningOutputTokens +=
        metrics.planTokenUsage.reasoningOutputTokens;
      tokenUsage.totalTokens += metrics.planTokenUsage.totalTokens;
    }
  }

  return {
    schemaVersion: "1" as const,
    generatedAt,
    windowHours,
    sampledJobs: validJobs,
    statuses: statusCounts,
    concepts: Object.fromEntries([...byConcept].sort()),
    jobKinds: Object.fromEntries([...byKind].sort()),
    supportStatuses: Object.fromEntries([...supportStatuses].sort()),
    failures: [...failures]
      .map(([code, count]) => ({ code, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.code.localeCompare(right.code),
      ),
    repairAttempts,
    timings: {
      averagesMs: {
        queue: average(timingTotals.queueMs, timingSamples.queue),
        total: average(timingTotals.totalMs, timingSamples.total),
        compiler: average(timingTotals.compilerMs, timingSamples.compiler),
        verifier: average(timingTotals.verifierMs, timingSamples.verifier),
        kernel: average(timingTotals.kernelMs, timingSamples.kernel),
        patch: average(timingTotals.patchMs, timingSamples.patch),
      },
      totalsMs: timingTotals,
      samples: timingSamples,
    },
    planTokenUsage: tokenUsage,
    privacy: {
      includesNotebookContent: false as const,
      includesArtifactIdentifiers: false as const,
      includesSessionIdentifiers: false as const,
    },
  };
}

export type OperationalDiagnostics = ReturnType<
  typeof summarizeOperationalRows
>;

export async function loadOperationalDiagnostics(
  database: D1Database,
  generatedAt: string,
  windowHours = 168,
) {
  const since = new Date(
    Date.parse(generatedAt) - windowHours * 60 * 60 * 1_000,
  ).toISOString();
  const query = await database
    .prepare(
      `SELECT j.kind, j.status, j.concept_pack_id, j.created_at, j.updated_at,
              j.job_json, a.manifest_json, c.callback_json
       FROM runner_jobs AS j
       INNER JOIN artifacts AS a ON a.id = j.artifact_id
       LEFT JOIN runner_callback_receipts AS c ON c.job_id = j.id
       WHERE j.created_at >= ?
       ORDER BY j.created_at DESC
       LIMIT 1000`,
    )
    .bind(since)
    .all<OperationalDiagnosticRow>();
  return summarizeOperationalRows(query.results, generatedAt, windowHours);
}
