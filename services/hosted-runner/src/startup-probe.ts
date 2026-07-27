import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";

import { canonicalJson } from "@counterlab/session-core";

import { PrivsepCodexLaunchBoundary } from "./privsep-boundary.js";
import {
  PRIVSEP_GENERATOR_GID,
  PRIVSEP_GENERATOR_UID,
  PRIVSEP_MAX_GENERATION_LAUNCHES,
  PrivsepProbePayloadSchema,
  PRIVSEP_RUNNER_GID,
  PRIVSEP_RUNNER_UID,
} from "./privsep-protocol.js";
import { runHostedRunnerStartupStage } from "./startup-failure.js";

const STARTUP_CHECKS = [
  "entrypoint",
  "non-root-user",
  "immutable-paths",
  "python",
  "setpriv",
  "privsep-broker",
  "posix-dac-process-identity",
  "writable-roots",
] as const;

export const GENERATION_ISOLATION_PROBE_VERSION =
  "counterlab-generation-isolation-v3" as const;

export type GenerationIsolationProbePayload = {
  schemaVersion: "3";
  probeVersion: typeof GENERATION_ISOLATION_PROBE_VERSION;
  service: "counterlab-hosted-runner";
  probe: "non-root-startup";
  checks: typeof STARTUP_CHECKS;
  generationFilesystemReadIsolation: "OS_ENFORCED";
  mechanism: "posix-dac-process-identity";
  brokerIdentity: "0:0";
  runnerIdentity: `${typeof PRIVSEP_RUNNER_UID}:${typeof PRIVSEP_RUNNER_GID}`;
  generatorIdentity: `${typeof PRIVSEP_GENERATOR_UID}:${typeof PRIVSEP_GENERATOR_GID}`;
  policyVersion: "counterlab-posix-dac-process-policy-v1";
  processIdentity: ReturnType<typeof PrivsepProbePayloadSchema.parse>;
};

export function createGenerationIsolationProbePayload(
  processIdentityOutput: unknown,
): GenerationIsolationProbePayload {
  return {
    schemaVersion: "3",
    probeVersion: GENERATION_ISOLATION_PROBE_VERSION,
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: STARTUP_CHECKS,
    generationFilesystemReadIsolation: "OS_ENFORCED",
    mechanism: "posix-dac-process-identity",
    brokerIdentity: "0:0",
    runnerIdentity: `${PRIVSEP_RUNNER_UID}:${PRIVSEP_RUNNER_GID}`,
    generatorIdentity: `${PRIVSEP_GENERATOR_UID}:${PRIVSEP_GENERATOR_GID}`,
    policyVersion: "counterlab-posix-dac-process-policy-v1",
    processIdentity: PrivsepProbePayloadSchema.parse(processIdentityOutput),
  };
}

export function hashGenerationIsolationProbe(payload: unknown): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export type HostedRunnerStartupProbeOptions = {
  environment?: NodeJS.ProcessEnv;
  nodeExecutable?: string;
  bundlePath?: string;
  clientBundlePath?: string;
  appRoot?: string;
  access?: typeof access;
  mkdir?: typeof mkdir;
  stat?: typeof stat;
  getUid?: () => number | undefined;
  getGid?: () => number | undefined;
  isolationProbe?: () => Promise<unknown>;
};

export type HostedRunnerStartupProbeResult = {
  status: "ready";
  service: "counterlab-hosted-runner";
  probe: "non-root-startup";
  checks: typeof STARTUP_CHECKS;
  generationFilesystemReadIsolation: "OS_ENFORCED";
  generationIsolationProbe: GenerationIsolationProbePayload;
  generationIsolationProbeSha256: string;
};

export async function runHostedRunnerStartupProbe(
  options: HostedRunnerStartupProbeOptions = {},
): Promise<HostedRunnerStartupProbeResult> {
  const environment = options.environment ?? process.env;
  const accessFile = options.access ?? access;
  const makeDirectory = options.mkdir ?? mkdir;
  const readMetadata = options.stat ?? stat;
  const uid = (options.getUid ?? process.getuid)?.();
  const gid = (options.getGid ?? process.getgid)?.();
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const bundlePath = options.bundlePath ?? new URL(import.meta.url).pathname;
  const clientBundlePath =
    options.clientBundlePath ?? "/app/privsep-client.mjs";
  const appRoot = options.appRoot ?? "/app";
  const workspaceRoot = environment.COUNTERLAB_RUNNER_WORK_ROOT ?? "/work/jobs";
  const codexExecutable =
    environment.COUNTERLAB_CODEX_EXECUTABLE ?? "/opt/codex/bin/codex";
  const setprivExecutable =
    environment.COUNTERLAB_SETPRIV_EXECUTABLE ?? "/usr/bin/setpriv";
  const pythonExecutable =
    environment.COUNTERLAB_PYTHON_EXECUTABLE ??
    "/opt/counterlab-venv/bin/python";

  await runHostedRunnerStartupStage("PROCESS_IDENTITY_INVALID", async () => {
    if (uid !== PRIVSEP_RUNNER_UID || gid !== PRIVSEP_RUNNER_GID) {
      throw new Error(
        `Hosted runner startup probe requires uid/gid ${PRIVSEP_RUNNER_UID}:${PRIVSEP_RUNNER_GID}; observed ${String(uid)}:${String(gid)}`,
      );
    }
  });
  await runHostedRunnerStartupStage("IMMUTABLE_PATHS_INVALID", async () => {
    const [appMetadata, bundleMetadata] = await Promise.all([
      readMetadata(appRoot),
      readMetadata(bundlePath),
    ]);
    const protectedByRunnerGroup =
      appMetadata.uid === 0 &&
      appMetadata.gid === PRIVSEP_RUNNER_GID &&
      bundleMetadata.uid === 0 &&
      bundleMetadata.gid === PRIVSEP_RUNNER_GID;
    if (
      !appMetadata.isDirectory() ||
      (appMetadata.mode & 0o777) !== 0o550 ||
      !bundleMetadata.isFile() ||
      (bundleMetadata.mode & 0o777) !== 0o440 ||
      !protectedByRunnerGroup
    ) {
      throw new Error(
        [
          "Hosted runner immutable application paths do not match the root-owned runner-group policy",
          `app=${appMetadata.isDirectory() ? "directory" : "other"} ${appMetadata.uid}:${appMetadata.gid} ${(appMetadata.mode & 0o777).toString(8).padStart(3, "0")}`,
          `bundle=${bundleMetadata.isFile() ? "file" : "other"} ${bundleMetadata.uid}:${bundleMetadata.gid} ${(bundleMetadata.mode & 0o777).toString(8).padStart(3, "0")}`,
        ].join("; "),
      );
    }
  });

  await runHostedRunnerStartupStage("RUNTIME_PATHS_INVALID", async () => {
    await Promise.all([
      accessFile(nodeExecutable, constants.X_OK),
      accessFile(bundlePath, constants.R_OK),
      accessFile(clientBundlePath, constants.R_OK),
      accessFile(setprivExecutable, constants.X_OK),
      accessFile(pythonExecutable, constants.X_OK),
    ]);
  });
  await runHostedRunnerStartupStage("WRITABLE_ROOTS_INVALID", async () => {
    await Promise.all([
      makeDirectory(workspaceRoot, { recursive: true, mode: 0o710 }),
    ]);
  });
  const isolationProbe =
    options.isolationProbe ??
    (() =>
      new PrivsepCodexLaunchBoundary({
        workspaceRoot,
        codexExecutable,
        runnerNodeExecutable: nodeExecutable,
        clientBundle: clientBundlePath,
      }).probe());
  const processIdentityOutput = await runHostedRunnerStartupStage(
    "PRIVSEP_PROBE_FAILED",
    isolationProbe,
  );
  const generationIsolationProbe = await runHostedRunnerStartupStage(
    "PRIVSEP_PROBE_FAILED",
    async () => createGenerationIsolationProbePayload(processIdentityOutput),
  );

  return {
    status: "ready",
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: STARTUP_CHECKS,
    generationFilesystemReadIsolation: "OS_ENFORCED",
    generationIsolationProbe,
    generationIsolationProbeSha256: hashGenerationIsolationProbe(
      generationIsolationProbe,
    ),
  };
}
