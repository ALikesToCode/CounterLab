import { Container } from "@cloudflare/containers";
import { deriveRunnerJobTokenPublicKey } from "@counterlab/session-core";

type RunnerContainerEnv = Env & {
  CODEX_AUTH_JSON?: string;
  CODEX_MODEL?: string;
  COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY?: string;
};

export class CounterLabRunner extends Container<RunnerContainerEnv> {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "5m";
  enableInternet = true;
  pingEndpoint = "ready";

  constructor(ctx: DurableObjectState<{}>, env: RunnerContainerEnv) {
    super(ctx, env);
    const runnerVerifyingPublicKey =
      env.COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY === undefined
        ? ""
        : deriveRunnerJobTokenPublicKey(
            env.COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY,
          );
    this.envVars = {
      CODEX_AUTH_JSON: env.CODEX_AUTH_JSON ?? "",
      CODEX_MODEL: env.CODEX_MODEL ?? "",
      COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY: runnerVerifyingPublicKey,
      NODE_ENV: "production",
      PORT: "8080",
      COUNTERLAB_RUNNER_WORK_ROOT: "/work/jobs",
      COUNTERLAB_CODEX_HOME_ROOT: "/run/counterlab-codex",
      COUNTERLAB_CODEX_EXECUTABLE: "/usr/local/bin/codex",
      COUNTERLAB_SETPRIV_EXECUTABLE: "/usr/bin/setpriv",
      COUNTERLAB_PYTHON_EXECUTABLE: "/opt/counterlab-venv/bin/python",
      COUNTERLAB_CODEX_UID: "10001",
      COUNTERLAB_CODEX_GID: "10001",
    };
  }
}
