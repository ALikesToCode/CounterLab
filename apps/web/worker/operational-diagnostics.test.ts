// @vitest-environment node

import { describe, expect, it } from "vitest";

import { RunnerCallbackSchema, RunnerJobSchema } from "@counterlab/contracts";

import { sampleManifest } from "./sample-evidence";
import {
  summarizeOperationalRows,
  type OperationalDiagnosticRow,
} from "./operational-diagnostics";

function row(): OperationalDiagnosticRow {
  const job = RunnerJobSchema.parse({
    schemaVersion: "1",
    jobId: "job_diagnostics_1",
    kind: "LAB_COMPILE",
    status: "VERIFIED",
    sessionId: "session_private_1",
    artifactId: sampleManifest.artifactId,
    artifactManifestHash: "a".repeat(64),
    conceptPack: { id: "entity_leakage", version: "1.0.0" },
    inputHashes: ["b".repeat(64)],
    stateVersion: 4,
    jobVersion: 4,
    createdAt: "2026-07-15T09:59:58.000Z",
    updatedAt: "2026-07-15T10:00:05.000Z",
    startedAt: "2026-07-15T10:00:00.000Z",
    completedAt: "2026-07-15T10:00:05.000Z",
    attempt: 2,
    maxAttempts: 3,
    runnerIdentity: "cloudflare-container-runner-v1",
    timeoutSeconds: 180,
    outputHashes: ["c".repeat(64)],
    eventCursor: 6,
  });
  const callback = RunnerCallbackSchema.parse({
    schemaVersion: "1",
    callbackId: "callback_diagnostics_1",
    idempotencyKey: "diagnostics-1",
    jobId: job.jobId,
    stateVersion: job.stateVersion,
    status: "VERIFIED",
    outputHashes: job.outputHashes,
    finalEventCursor: job.eventCursor,
    operationalMetrics: {
      compilerDurationMs: 3_200,
      verifierDurationMs: 45,
      kernelDurationMs: 0,
      patchDurationMs: 0,
      repairAttempts: 1,
      planTokenUsage: {
        inputTokens: 900,
        cachedInputTokens: 600,
        outputTokens: 180,
        reasoningOutputTokens: 75,
        totalTokens: 1_080,
      },
    },
    occurredAt: job.completedAt,
  });
  return {
    kind: job.kind,
    status: job.status,
    concept_pack_id: job.conceptPack.id,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    job_json: JSON.stringify(job),
    manifest_json: JSON.stringify(sampleManifest),
    callback_json: JSON.stringify(callback),
  };
}

describe("operational diagnostics", () => {
  it("aggregates private job timings and token usage without identifiers", () => {
    const diagnostics = summarizeOperationalRows(
      [row()],
      "2026-07-15T10:01:00.000Z",
    );

    expect(diagnostics).toMatchObject({
      sampledJobs: 1,
      statuses: { VERIFIED: 1, FAILED: 0 },
      concepts: { entity_leakage: 1 },
      supportStatuses: { SUPPORTED: 1 },
      repairAttempts: 1,
      timings: {
        averagesMs: {
          queue: 2_000,
          total: 7_000,
          compiler: 3_200,
          verifier: 45,
        },
        samples: {
          queue: 1,
          total: 1,
          compiler: 1,
          verifier: 1,
          kernel: 0,
          patch: 0,
        },
      },
      planTokenUsage: {
        inputTokens: 900,
        cachedInputTokens: 600,
        outputTokens: 180,
        reasoningOutputTokens: 75,
        totalTokens: 1_080,
      },
      privacy: {
        includesNotebookContent: false,
        includesArtifactIdentifiers: false,
        includesSessionIdentifiers: false,
      },
    });
    expect(JSON.stringify(diagnostics)).not.toContain("session_private_1");
    expect(JSON.stringify(diagnostics)).not.toContain(
      sampleManifest.artifactId,
    );
  });

  it("does not dilute phase averages with jobs that did not run that phase", () => {
    const kernelOnly = row();
    const kernelJob = RunnerJobSchema.parse({
      ...JSON.parse(kernelOnly.job_json),
      jobId: "job_diagnostics_2",
      kind: "LAB_RUN",
    });
    const kernelCallback = RunnerCallbackSchema.parse({
      ...JSON.parse(kernelOnly.callback_json ?? "{}"),
      callbackId: "callback_diagnostics_2",
      idempotencyKey: "diagnostics-2",
      jobId: kernelJob.jobId,
      operationalMetrics: {
        compilerDurationMs: 0,
        verifierDurationMs: 0,
        kernelDurationMs: 800,
        patchDurationMs: 0,
        repairAttempts: 0,
        planTokenUsage: {
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: 0,
        },
      },
    });
    const diagnostics = summarizeOperationalRows(
      [
        row(),
        {
          ...kernelOnly,
          kind: kernelJob.kind,
          job_json: JSON.stringify(kernelJob),
          callback_json: JSON.stringify(kernelCallback),
        },
      ],
      "2026-07-15T10:01:00.000Z",
    );

    expect(diagnostics.timings.averagesMs.compiler).toBe(3_200);
    expect(diagnostics.timings.averagesMs.kernel).toBe(800);
    expect(diagnostics.timings.samples).toMatchObject({
      compiler: 1,
      kernel: 1,
    });
  });

  it("skips corrupt repository rows instead of leaking their contents", () => {
    const corrupt = { ...row(), job_json: "not-json" };
    const diagnostics = summarizeOperationalRows(
      [corrupt],
      "2026-07-15T10:01:00.000Z",
    );
    expect(diagnostics.sampledJobs).toBe(0);
    expect(diagnostics.planTokenUsage.totalTokens).toBe(0);
  });
});
