import { Container } from "@cloudflare/containers";

type RunnerContainerEnv = Env & {
  CODEX_AUTH_JSON?: string;
  CODEX_MODEL?: string;
};

export class CounterLabRunner extends Container<RunnerContainerEnv> {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "5m";
  enableInternet = true;
  pingEndpoint = "ready";

  constructor(ctx: DurableObjectState<{}>, env: RunnerContainerEnv) {
    super(ctx, env);
    this.envVars = {
      CODEX_AUTH_JSON: env.CODEX_AUTH_JSON ?? "",
      CODEX_MODEL: env.CODEX_MODEL ?? "",
      NODE_ENV: "production",
      PORT: "8080",
      COUNTERLAB_RUNNER_WORK_ROOT: "/work/jobs",
      COUNTERLAB_CODEX_HOME_ROOT: "/run/counterlab-codex",
      COUNTERLAB_CODEX_EXECUTABLE: "/usr/local/bin/codex",
      COUNTERLAB_SETPRIV_EXECUTABLE: "/usr/bin/setpriv",
      COUNTERLAB_CODEX_UID: "10001",
      COUNTERLAB_CODEX_GID: "10001",
    };
  }
}
