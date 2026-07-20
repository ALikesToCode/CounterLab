import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AppServerCodexCompiler } from "@counterlab/codex-client";
import { verifyRunnerJobToken } from "@counterlab/session-core";
import { z } from "zod";

import { HttpRunnerControlPlane } from "./control-plane-client.js";
import { HostedRunnerJobProcessor } from "./job-processor.js";
import { ContainerCodexLaunchBoundary } from "./launch-boundary.js";
import { PythonFixedKernelExecutor } from "./fixed-kernel.js";
import { PythonFixedPatchExecutor } from "./fixed-patch.js";
import { runHostedRunnerStartupProbe } from "./startup-probe.js";

const MAX_REQUEST_BYTES = 16_384;
export const CODEX_ATTEMPT_TIMEOUT_MS = 120_000;

const DispatchSchema = z
  .object({
    schemaVersion: z.literal("1"),
    jobId: z.string().regex(/^[A-Za-z0-9_-]+$/u),
    controlPlaneUrl: z.string().url().max(2_048),
  })
  .strict();

export type HostedRunnerServerOptions = {
  generationFilesystemReadIsolation: "OS_ENFORCED";
  releaseIdentity?: {
    runnerSourceCommit: string;
    runnerImageDigest: string;
  };
  authorizeToken(
    token: string,
    jobId: string,
    purpose: "RUN_JOB" | "CANCEL_JOB",
    controlPlaneOrigin?: string,
  ): Promise<boolean>;
  processJob(input: {
    jobId: string;
    token: string;
    controlPlaneUrl: string;
    signal: AbortSignal;
  }): Promise<void>;
  onJobSettled?(input: { jobId: string }): Promise<void> | void;
};

type ActiveJob = {
  controller: AbortController;
};

function respond(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new Error("REQUEST_TOO_LARGE");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function token(request: IncomingMessage): string | undefined {
  const authorization = request.headers.authorization;
  if (
    authorization === undefined ||
    !authorization.startsWith("Bearer ") ||
    authorization.length > 16_384
  ) {
    return undefined;
  }
  const value = authorization.slice("Bearer ".length);
  return value.length === 0 ? undefined : value;
}

export function createHostedRunnerServer(options: HostedRunnerServerOptions) {
  const activeJobs = new Map<string, ActiveJob>();
  const cancelledJobs = new Set<string>();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://runner.internal");
    if (request.method === "GET" && url.pathname === "/ready") {
      respond(response, 200, {
        status: "ready",
        service: "counterlab-hosted-runner",
        generationFilesystemReadIsolation:
          options.generationFilesystemReadIsolation,
        ...(options.releaseIdentity ?? {}),
      });
      return;
    }
    const cancellation = /^\/jobs\/([A-Za-z0-9_-]+)$/u.exec(url.pathname);
    if (request.method === "DELETE" && cancellation !== null) {
      const scopedToken = token(request);
      if (scopedToken === undefined) {
        respond(response, 401, { error: "RUNNER_AUTH_REQUIRED" });
        return;
      }
      const jobId = cancellation[1];
      if (jobId === undefined) {
        respond(response, 404, { error: "RUNNER_JOB_NOT_FOUND" });
        return;
      }
      if (!(await options.authorizeToken(scopedToken, jobId, "CANCEL_JOB"))) {
        respond(response, 403, { error: "RUNNER_AUTH_INVALID" });
        return;
      }
      if (cancelledJobs.has(jobId)) {
        respond(response, 200, { cancelled: true, reused: true, jobId });
        return;
      }
      const active = activeJobs.get(jobId);
      if (active === undefined) {
        respond(response, 404, { error: "RUNNER_JOB_NOT_FOUND" });
        return;
      }
      cancelledJobs.add(jobId);
      if (cancelledJobs.size > 1_000) {
        const oldest = cancelledJobs.values().next().value as
          string | undefined;
        if (oldest !== undefined) cancelledJobs.delete(oldest);
      }
      active.controller.abort();
      respond(response, 202, { cancelled: true, reused: false, jobId });
      return;
    }
    if (request.method !== "POST" || url.pathname !== "/jobs") {
      respond(response, 404, { error: "NOT_FOUND" });
      return;
    }
    const scopedToken = token(request);
    if (scopedToken === undefined) {
      respond(response, 401, { error: "RUNNER_AUTH_REQUIRED" });
      return;
    }
    try {
      const body = DispatchSchema.parse(JSON.parse(await readBody(request)));
      if (
        !(await options.authorizeToken(
          scopedToken,
          body.jobId,
          "RUN_JOB",
          new URL(body.controlPlaneUrl).origin,
        ))
      ) {
        respond(response, 403, { error: "RUNNER_AUTH_INVALID" });
        return;
      }
      if (activeJobs.has(body.jobId)) {
        respond(response, 202, {
          accepted: true,
          reused: true,
          jobId: body.jobId,
        });
        return;
      }
      const controller = new AbortController();
      activeJobs.set(body.jobId, { controller });
      void options
        .processJob({
          jobId: body.jobId,
          token: scopedToken,
          controlPlaneUrl: body.controlPlaneUrl,
          signal: controller.signal,
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          console.error("Hosted runner job failed", {
            jobId: body.jobId,
            name: error instanceof Error ? error.name : "UnknownError",
          });
        })
        .finally(async () => {
          activeJobs.delete(body.jobId);
          if (options.onJobSettled === undefined) return;
          try {
            await options.onJobSettled({ jobId: body.jobId });
          } catch (error) {
            console.error("Hosted runner lifecycle cleanup failed", {
              jobId: body.jobId,
              name: error instanceof Error ? error.name : "UnknownError",
            });
          }
        });
      respond(response, 202, { accepted: true, jobId: body.jobId });
    } catch (error) {
      if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
        respond(response, 413, { error: "REQUEST_TOO_LARGE" });
        return;
      }
      respond(response, 400, { error: "INVALID_RUNNER_REQUEST" });
    }
  });
  return server;
}

async function startProductionServer(): Promise<void> {
  if (process.env.COUNTERLAB_RUNNER_STARTUP_PROBE === "1") {
    delete process.env.COUNTERLAB_RUNNER_STARTUP_PROBE;
    console.log(JSON.stringify(await runHostedRunnerStartupProbe()));
    return;
  }
  const startupProbe = await runHostedRunnerStartupProbe();
  const authJson = process.env.CODEX_AUTH_JSON;
  const runnerVerifyingPublicKey =
    process.env.COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY;
  const runnerSourceCommit =
    process.env.COUNTERLAB_RUNNER_SOURCE_COMMIT?.trim() ?? "";
  const runnerImageDigest =
    process.env.COUNTERLAB_RUNNER_IMAGE_DIGEST?.trim() ?? "";
  delete process.env.CODEX_AUTH_JSON;
  delete process.env.COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY;
  if (authJson === undefined || authJson.trim().length === 0) {
    throw new Error("CODEX_AUTH_JSON is required by the hosted runner");
  }
  if (
    runnerVerifyingPublicKey === undefined ||
    runnerVerifyingPublicKey.length === 0
  ) {
    throw new Error(
      "COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY is required by the hosted runner",
    );
  }
  const releaseIdentityMissing =
    runnerSourceCommit.length === 0 && runnerImageDigest.length === 0;
  if (
    !releaseIdentityMissing &&
    (!/^[a-f0-9]{40}$/u.test(runnerSourceCommit) ||
      !/^sha256:[a-f0-9]{64}$/u.test(runnerImageDigest))
  ) {
    throw new Error(
      "Runner release identity must contain an exact source commit and image digest",
    );
  }
  const workspaceRoot = process.env.COUNTERLAB_RUNNER_WORK_ROOT ?? "/work/jobs";
  const codexHomeRoot =
    process.env.COUNTERLAB_CODEX_HOME_ROOT ?? "/run/counterlab-codex";
  const codexExecutable =
    process.env.COUNTERLAB_CODEX_EXECUTABLE ?? "/usr/local/bin/codex";
  const codexRoot = process.env.COUNTERLAB_CODEX_ROOT ?? "/opt/codex";
  const bwrapExecutable =
    process.env.COUNTERLAB_BWRAP_EXECUTABLE ?? "/usr/bin/bwrap";
  const setprivExecutable =
    process.env.COUNTERLAB_SETPRIV_EXECUTABLE ?? "/usr/bin/setpriv";
  const uid = Number(process.env.COUNTERLAB_CODEX_UID ?? "10001");
  const gid = Number(process.env.COUNTERLAB_CODEX_GID ?? "10001");
  await Promise.all([
    mkdir(workspaceRoot, { recursive: true, mode: 0o700 }),
    mkdir(codexHomeRoot, { recursive: true, mode: 0o700 }),
  ]);
  const boundary = new ContainerCodexLaunchBoundary({
    authJson,
    workspaceRoot: resolve(workspaceRoot),
    codexHomeRoot: resolve(codexHomeRoot),
    codexRoot: resolve(codexRoot),
    codexExecutable: resolve(codexExecutable),
    bwrapExecutable: resolve(bwrapExecutable),
    setprivExecutable: resolve(setprivExecutable),
    uid,
    gid,
  });
  const boundaryHealth = await boundary.health();
  if (!boundaryHealth.available) throw new Error(boundaryHealth.reason);

  const oneShot = process.env.COUNTERLAB_RUNNER_ONE_SHOT === "1";
  const serverRef: {
    current?: ReturnType<typeof createHostedRunnerServer>;
  } = {};
  const server = createHostedRunnerServer({
    generationFilesystemReadIsolation:
      startupProbe.generationFilesystemReadIsolation,
    ...(releaseIdentityMissing
      ? {}
      : { releaseIdentity: { runnerSourceCommit, runnerImageDigest } }),
    async authorizeToken(scopedToken, jobId, purpose, controlPlaneOrigin) {
      try {
        await verifyRunnerJobToken(scopedToken, runnerVerifyingPublicKey, {
          nowEpochSeconds: Math.floor(Date.now() / 1_000),
          jobId,
          purpose,
          ...(controlPlaneOrigin === undefined ? {} : { controlPlaneOrigin }),
        });
        return true;
      } catch {
        return false;
      }
    },
    async processJob({ jobId, token, controlPlaneUrl, signal }) {
      const controlPlane = new HttpRunnerControlPlane({
        controlPlaneUrl,
        jobId,
        token,
      });
      const compiler = new AppServerCodexCompiler({
        command: codexExecutable,
        commandArgs: ["app-server", "--stdio"],
        healthCommand: codexExecutable,
        healthArgs: ["--version"],
        model: process.env.CODEX_MODEL?.trim() || undefined,
        timeoutMs: CODEX_ATTEMPT_TIMEOUT_MS,
        environment: { PATH: process.env.PATH, LANG: "C.UTF-8" },
        launchBoundary: boundary,
      });
      const processor = new HostedRunnerJobProcessor({
        workspaceRoot,
        compiler,
        scientificCompiler: compiler,
        fixedKernel: new PythonFixedKernelExecutor({
          pythonExecutable:
            process.env.COUNTERLAB_PYTHON_EXECUTABLE ??
            "/opt/counterlab-venv/bin/python",
        }),
        fixedPatch: new PythonFixedPatchExecutor({
          pythonExecutable:
            process.env.COUNTERLAB_PYTHON_EXECUTABLE ??
            "/opt/counterlab-venv/bin/python",
          leakageFixturePath:
            process.env.COUNTERLAB_LEAKAGE_FIXTURE_PATH ??
            "/app/fixtures/public/customer_churn.csv",
          imbalanceFixturePath:
            process.env.COUNTERLAB_IMBALANCE_FIXTURE_PATH ??
            "/app/fixtures/public/fraud_rare_event.csv",
        }),
        controlPlane,
      });
      await processor.run(jobId, signal);
    },
    ...(oneShot
      ? {
          async onJobSettled({ jobId }: { jobId: string }) {
            const activeServer = serverRef.current;
            if (activeServer === undefined) {
              throw new Error(
                "Hosted runner server is unavailable for cleanup",
              );
            }
            console.info("CounterLab hosted runner job settled", { jobId });
            await new Promise<void>((resolveClose, rejectClose) => {
              activeServer.close((error) =>
                error === undefined ? resolveClose() : rejectClose(error),
              );
            });
            process.exit(0);
          },
        }
      : {}),
  });
  serverRef.current = server;
  const port = Number(process.env.PORT ?? "8080");
  server.listen(port, "0.0.0.0", () => {
    console.info("CounterLab hosted runner ready", { port });
  });
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void startProductionServer().catch((error: unknown) => {
    console.error("CounterLab hosted runner failed to start", {
      name: error instanceof Error ? error.name : "UnknownError",
      message:
        error instanceof Error ? error.message : "Unknown startup failure",
    });
    process.exitCode = 1;
  });
}
