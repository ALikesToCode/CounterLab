import { deriveRunnerJobTokenPublicKey } from "@counterlab/session-core";

export type RunnerContainerSecretBindings = {
  CODEX_AUTH_JSON?: string;
  CODEX_MODEL?: string;
  COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY?: string;
  COUNTERLAB_RUNNER_SOURCE_COMMIT?: string;
  COUNTERLAB_RUNNER_IMAGE_DIGEST?: string;
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
    COUNTERLAB_RUNNER_WORK_ROOT: "/tmp/counterlab-jobs",
    COUNTERLAB_CODEX_HOME_ROOT: "/tmp/counterlab-codex",
    COUNTERLAB_CODEX_ROOT: "/opt/codex",
    COUNTERLAB_CODEX_EXECUTABLE: "/usr/local/bin/codex",
    COUNTERLAB_BWRAP_EXECUTABLE: "/usr/bin/bwrap",
    COUNTERLAB_SETPRIV_EXECUTABLE: "/usr/bin/setpriv",
    COUNTERLAB_PYTHON_EXECUTABLE: "/opt/counterlab-venv/bin/python",
    COUNTERLAB_CODEX_UID: "10001",
    COUNTERLAB_CODEX_GID: "10001",
    COUNTERLAB_RUNNER_ONE_SHOT: "1",
    COUNTERLAB_RUNNER_SOURCE_COMMIT:
      bindings.COUNTERLAB_RUNNER_SOURCE_COMMIT ?? "",
    COUNTERLAB_RUNNER_IMAGE_DIGEST:
      bindings.COUNTERLAB_RUNNER_IMAGE_DIGEST ?? "",
  };
}
