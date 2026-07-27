import {
  createServer,
  type IncomingMessage,
  type RequestListener,
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
import { PrivsepCodexLaunchBoundary } from "./privsep-boundary.js";
import { PythonFixedKernelExecutor } from "./fixed-kernel.js";
import { PythonFixedPatchExecutor } from "./fixed-patch.js";
import {
  createHostedRunnerBootstrapServer,
  hostedRunnerStartupFailureDiagnostic,
  hostedRunnerStartupFailureReason,
  hostedRunnerStartupProbeFailure,
  HostedRunnerStartupError,
  runHostedRunnerStartupStage,
} from "./startup-failure.js";
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

export type HostedRunnerReleaseIdentity = {
  runnerSourceCommit: string;
  runnerImageDigest: string;
  generationIsolationEvidenceSha256: string;
  generationIsolationProbeSha256: string;
};

export type HostedRunnerServerOptions = {
  generationFilesystemReadIsolation: "OS_ENFORCED";
  releaseIdentity?: HostedRunnerReleaseIdentity;
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

export function verifiedHostedRunnerReleaseIdentity(
  candidate: HostedRunnerReleaseIdentity,
  observedProbeSha256: string,
): HostedRunnerReleaseIdentity | undefined {
  const values = Object.values(candidate);
  if (values.every((value) => value.length === 0)) return undefined;
  if (
    !/^[a-f0-9]{40}$/u.test(candidate.runnerSourceCommit) ||
    !/^sha256:[a-f0-9]{64}$/u.test(candidate.runnerImageDigest) ||
    !/^[a-f0-9]{64}$/u.test(candidate.generationIsolationEvidenceSha256) ||
    !/^[a-f0-9]{64}$/u.test(candidate.generationIsolationProbeSha256)
  ) {
    throw new Error(
      "Runner release identity must contain an exact source commit, image digest, generation-isolation evidence hash, and probe hash",
    );
  }
  if (candidate.generationIsolationProbeSha256 !== observedProbeSha256) {
    throw new Error(
      "Runner startup probe does not match the qualified generation-isolation evidence",
    );
  }
  return candidate;
}

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

function createHostedRunnerRequestListener(
  options: HostedRunnerServerOptions,
): RequestListener {
  const activeJobs = new Map<string, ActiveJob>();
  const cancelledJobs = new Set<string>();
  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://runner.internal");
    if (request.method === "GET" && url.pathname === "/live") {
      respond(response, 200, {
        status: "live",
        service: "counterlab-hosted-runner",
      });
      return;
    }
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
  };
}

export function createHostedRunnerServer(options: HostedRunnerServerOptions) {
  return createServer(createHostedRunnerRequestListener(options));
}

async function startProductionServer(): Promise<void> {
  if (process.env.COUNTERLAB_RUNNER_STARTUP_PROBE === "1") {
    delete process.env.COUNTERLAB_RUNNER_STARTUP_PROBE;
    console.log(JSON.stringify(await runHostedRunnerStartupProbe()));
    return;
  }
  const runnerVerifyingPublicKey =
    process.env.COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY;
  const runnerSourceCommit =
    process.env.COUNTERLAB_RUNNER_SOURCE_COMMIT?.trim() ?? "";
  const runnerImageDigest =
    process.env.COUNTERLAB_RUNNER_IMAGE_DIGEST?.trim() ?? "";
  const generationIsolationEvidenceSha256 =
    process.env.COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256?.trim() ?? "";
  const generationIsolationProbeSha256 =
    process.env.COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256?.trim() ?? "";
  delete process.env.COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY;
  const configuredPort = Number(process.env.PORT ?? "8080");
  const port =
    Number.isInteger(configuredPort) &&
    configuredPort > 0 &&
    configuredPort <= 65_535
      ? configuredPort
      : 8080;
  const bootstrap = createHostedRunnerBootstrapServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    bootstrap.server.once("error", rejectListen);
    bootstrap.server.listen(port, "0.0.0.0", () => {
      bootstrap.server.off("error", rejectListen);
      resolveListen();
    });
  });
  console.info("CounterLab hosted runner liveness available", { port });

  try {
    const startupProbe = await runHostedRunnerStartupStage(
      "STARTUP_PROBE_FAILED",
      () => runHostedRunnerStartupProbe(),
    );
    if (
      runnerVerifyingPublicKey === undefined ||
      runnerVerifyingPublicKey.length === 0
    ) {
      throw new HostedRunnerStartupError("VERIFYING_KEY_MISSING");
    }
    const releaseIdentity = await runHostedRunnerStartupStage(
      "RELEASE_IDENTITY_INVALID",
      async () =>
        verifiedHostedRunnerReleaseIdentity(
          {
            runnerSourceCommit,
            runnerImageDigest,
            generationIsolationEvidenceSha256,
            generationIsolationProbeSha256,
          },
          startupProbe.generationIsolationProbeSha256,
        ),
    );
    const workspaceRoot =
      process.env.COUNTERLAB_RUNNER_WORK_ROOT ?? "/work/jobs";
    const codexExecutable =
      process.env.COUNTERLAB_CODEX_EXECUTABLE ?? "/opt/codex/bin/codex";
    const runnerNodeExecutable =
      process.env.COUNTERLAB_RUNNER_NODE_EXECUTABLE ?? "/usr/local/bin/node";
    const privsepClientBundle =
      process.env.COUNTERLAB_PRIVSEP_CLIENT_BUNDLE ?? "/app/privsep-client.mjs";
    const boundary = await runHostedRunnerStartupStage(
      "ISOLATION_BOUNDARY_FAILED",
      async () => {
        await mkdir(workspaceRoot, { recursive: true, mode: 0o710 });
        const candidate = new PrivsepCodexLaunchBoundary({
          workspaceRoot: resolve(workspaceRoot),
          codexExecutable: resolve(codexExecutable),
          runnerNodeExecutable: resolve(runnerNodeExecutable),
          clientBundle: resolve(privsepClientBundle),
        });
        const boundaryHealth = await candidate.health();
        if (!boundaryHealth.available) throw new Error(boundaryHealth.reason);
        return candidate;
      },
    );

    const oneShot = process.env.COUNTERLAB_RUNNER_ONE_SHOT === "1";
    const serverRef: {
      current?: ReturnType<typeof createHostedRunnerServer>;
    } = {};
    const serverOptions: HostedRunnerServerOptions = {
      generationFilesystemReadIsolation:
        startupProbe.generationFilesystemReadIsolation,
      ...(releaseIdentity === undefined ? {} : { releaseIdentity }),
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
    };
    serverRef.current = bootstrap.server;
    bootstrap.activate(createHostedRunnerRequestListener(serverOptions));
    console.info("CounterLab hosted runner ready", { port });
  } catch (error) {
    const reason = hostedRunnerStartupFailureReason(error);
    const probeFailure = hostedRunnerStartupProbeFailure(error);
    bootstrap.fail(reason, probeFailure);
    console.error("CounterLab hosted runner failed to start", {
      name: error instanceof Error ? error.name : "UnknownError",
      reason,
      ...(probeFailure === undefined ? {} : { probeFailure }),
      ...hostedRunnerStartupFailureDiagnostic(error),
    });
    console.error("CounterLab hosted runner remains fail-closed", {
      port,
      reason,
    });
  }
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void startProductionServer().catch((error: unknown) => {
    console.error("CounterLab hosted runner failed to start", {
      name: error instanceof Error ? error.name : "UnknownError",
      reason: hostedRunnerStartupFailureReason(error),
      ...hostedRunnerStartupFailureDiagnostic(error),
    });
    process.exitCode = 1;
  });
}
