import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AppServerCodexCompiler } from "@counterlab/codex-client";
import { z } from "zod";

import { HttpRunnerControlPlane } from "./control-plane-client.js";
import { HostedRunnerJobProcessor } from "./job-processor.js";
import { ContainerCodexLaunchBoundary } from "./launch-boundary.js";
import { PythonFixedKernelExecutor } from "./fixed-kernel.js";
import { PythonFixedPatchExecutor } from "./fixed-patch.js";

const MAX_REQUEST_BYTES = 16_384;

const DispatchSchema = z
  .object({
    schemaVersion: z.literal("1"),
    jobId: z.string().regex(/^[A-Za-z0-9_-]+$/u),
    controlPlaneUrl: z.string().url().max(2_048),
  })
  .strict();

export type HostedRunnerServerOptions = {
  processJob(input: {
    jobId: string;
    token: string;
    controlPlaneUrl: string;
  }): Promise<void>;
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
  const activeJobs = new Set<string>();
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://runner.internal");
    if (request.method === "GET" && url.pathname === "/ready") {
      respond(response, 200, {
        status: "ready",
        service: "counterlab-hosted-runner",
      });
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
      if (activeJobs.has(body.jobId)) {
        respond(response, 409, { error: "RUNNER_JOB_ACTIVE" });
        return;
      }
      activeJobs.add(body.jobId);
      void options
        .processJob({
          jobId: body.jobId,
          token: scopedToken,
          controlPlaneUrl: body.controlPlaneUrl,
        })
        .catch((error: unknown) => {
          console.error("Hosted runner job failed", {
            jobId: body.jobId,
            name: error instanceof Error ? error.name : "UnknownError",
          });
        })
        .finally(() => activeJobs.delete(body.jobId));
      respond(response, 202, { accepted: true, jobId: body.jobId });
    } catch (error) {
      if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
        respond(response, 413, { error: "REQUEST_TOO_LARGE" });
        return;
      }
      respond(response, 400, { error: "INVALID_RUNNER_REQUEST" });
    }
  });
}

async function startProductionServer(): Promise<void> {
  const authJson = process.env.CODEX_AUTH_JSON;
  delete process.env.CODEX_AUTH_JSON;
  if (authJson === undefined || authJson.trim().length === 0) {
    throw new Error("CODEX_AUTH_JSON is required by the hosted runner");
  }
  const workspaceRoot = process.env.COUNTERLAB_RUNNER_WORK_ROOT ?? "/work/jobs";
  const codexHomeRoot =
    process.env.COUNTERLAB_CODEX_HOME_ROOT ?? "/run/counterlab-codex";
  const codexExecutable =
    process.env.COUNTERLAB_CODEX_EXECUTABLE ?? "/usr/local/bin/codex";
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
    codexExecutable: resolve(codexExecutable),
    setprivExecutable: resolve(setprivExecutable),
    uid,
    gid,
  });
  const boundaryHealth = await boundary.health();
  if (!boundaryHealth.available) throw new Error(boundaryHealth.reason);

  const server = createHostedRunnerServer({
    async processJob({ jobId, token, controlPlaneUrl }) {
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
        timeoutMs: 150_000,
        environment: { PATH: process.env.PATH, LANG: "C.UTF-8" },
        launchBoundary: boundary,
      });
      const processor = new HostedRunnerJobProcessor({
        workspaceRoot,
        compiler,
        fixedKernel: new PythonFixedKernelExecutor({
          pythonExecutable:
            process.env.COUNTERLAB_PYTHON_EXECUTABLE ??
            "/opt/counterlab-venv/bin/python",
        }),
        fixedPatch: new PythonFixedPatchExecutor({
          pythonExecutable:
            process.env.COUNTERLAB_PYTHON_EXECUTABLE ??
            "/opt/counterlab-venv/bin/python",
          fixturePath:
            process.env.COUNTERLAB_LEAKAGE_FIXTURE_PATH ??
            "/app/fixtures/public/customer_churn.csv",
        }),
        controlPlane,
      });
      await processor.run(jobId);
    },
  });
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
