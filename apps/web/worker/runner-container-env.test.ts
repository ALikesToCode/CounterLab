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
    });

    expect(environment).toEqual({
      CODEX_AUTH_JSON: '{"auth_mode":"chatgpt"}',
      CODEX_MODEL: "gpt-5.6-codex",
      COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY: signingKeys.publicKey,
      NODE_ENV: "production",
      PORT: "8080",
      COUNTERLAB_RUNNER_WORK_ROOT: "/work/jobs",
      COUNTERLAB_CODEX_HOME_ROOT: "/tmp/counterlab-codex",
      COUNTERLAB_CODEX_EXECUTABLE: "/usr/local/bin/codex",
      COUNTERLAB_SETPRIV_EXECUTABLE: "/usr/bin/setpriv",
      COUNTERLAB_PYTHON_EXECUTABLE: "/opt/counterlab-venv/bin/python",
      COUNTERLAB_CODEX_UID: "10001",
      COUNTERLAB_CODEX_GID: "10001",
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
    expect(source).not.toContain("constructor(ctx:");
  });
});
