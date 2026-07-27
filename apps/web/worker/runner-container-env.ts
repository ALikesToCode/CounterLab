import { deriveRunnerJobTokenPublicKey } from "@counterlab/session-core";

export type RunnerContainerSecretBindings = {
  CODEX_AUTH_JSON?: string;
  CODEX_MODEL?: string;
  COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY?: string;
  COUNTERLAB_RUNNER_SOURCE_COMMIT?: string;
  COUNTERLAB_RUNNER_IMAGE_DIGEST?: string;
  COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256?: string;
  COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256?: string;
};

export function createRunnerContainerEnvVars(
  bindings: RunnerContainerSecretBindings,
): Record<string, string> {
  const runnerVerifyingPublicKey =
    bindings.COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY === undefined
      ? ""
      : deriveRunnerJobTokenPublicKey(
          bindings.COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY,
        );
  return {
    CODEX_AUTH_JSON: bindings.CODEX_AUTH_JSON ?? "",
    CODEX_MODEL: bindings.CODEX_MODEL ?? "",
    COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY: runnerVerifyingPublicKey,
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
    COUNTERLAB_RUNNER_SOURCE_COMMIT:
      bindings.COUNTERLAB_RUNNER_SOURCE_COMMIT ?? "",
    COUNTERLAB_RUNNER_IMAGE_DIGEST:
      bindings.COUNTERLAB_RUNNER_IMAGE_DIGEST ?? "",
    COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256:
      bindings.COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256 ?? "",
    COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256:
      bindings.COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256 ?? "",
  };
}
