import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { generateRunnerJobTokenKeyPair } from "@counterlab/session-core";

import { createRunnerContainerEnvVars } from "./runner-container-env";

describe("runner Container environment", () => {
  it("forwards only the bounded runtime configuration and derives the verifier key", async () => {
    const signingKeys = await generateRunnerJobTokenKeyPair();

    const environment = createRunnerContainerEnvVars({
      CODEX_AUTH_JSON: '{"auth_mode":"chatgpt"}',
      CODEX_MODEL: "gpt-5.6-codex",
      COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY: signingKeys.privateKey,
      COUNTERLAB_RUNNER_SOURCE_COMMIT: "b".repeat(40),
      COUNTERLAB_RUNNER_IMAGE_DIGEST: `sha256:${"c".repeat(64)}`,
      COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256: "d".repeat(64),
      COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256: "e".repeat(64),
    });

    expect(environment).toEqual({
      CODEX_AUTH_JSON: '{"auth_mode":"chatgpt"}',
      CODEX_MODEL: "gpt-5.6-codex",
      COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY: signingKeys.publicKey,
      NODE_ENV: "production",
      PORT: "8080",
      COUNTERLAB_RUNNER_WORK_ROOT: "/work/jobs",
      COUNTERLAB_CODEX_HOME_ROOT: "/run/counterlab-codex",
      COUNTERLAB_CODEX_EXECUTABLE: "/opt/codex/bin/codex",
      COUNTERLAB_RUNNER_NODE_EXECUTABLE: "/usr/local/bin/node",
      COUNTERLAB_PRIVSEP_CLIENT_BUNDLE: "/app/privsep-client.mjs",
      COUNTERLAB_PRIVSEP_SOCKET: "/run/counterlab-privsep/broker.sock",
      COUNTERLAB_SETPRIV_EXECUTABLE: "/usr/bin/setpriv",
      COUNTERLAB_PYTHON_EXECUTABLE: "/opt/counterlab-venv/bin/python",
      COUNTERLAB_RUNNER_UID: "10001",
      COUNTERLAB_RUNNER_GID: "10001",
      COUNTERLAB_GENERATOR_UID: "10002",
      COUNTERLAB_GENERATOR_GID: "10002",
      COUNTERLAB_RUNNER_ONE_SHOT: "1",
      COUNTERLAB_RUNNER_SOURCE_COMMIT: "b".repeat(40),
      COUNTERLAB_RUNNER_IMAGE_DIGEST: `sha256:${"c".repeat(64)}`,
      COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256: "d".repeat(64),
      COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256: "e".repeat(64),
    });
  });

  it("binds Container defaults from the Worker runtime environment", () => {
    const source = readFileSync(
      resolve(process.cwd(), "worker/runner-container.ts"),
      "utf8",
    );

    expect(source).toContain(
      'import { env as workerEnv } from "cloudflare:workers";',
    );
    expect(source).toContain(
      "envVars = createRunnerContainerEnvVars(workerEnv as RunnerContainerEnv);",
    );
    expect(source).toContain('pingEndpoint = "live";');
    expect(source).not.toContain("constructor(ctx:");
  });
});
