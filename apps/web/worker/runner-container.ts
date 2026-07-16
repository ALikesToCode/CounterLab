import { Container } from "@cloudflare/containers";
import { env as workerEnv } from "cloudflare:workers";

import {
  createRunnerContainerEnvVars,
  type RunnerContainerSecretBindings,
} from "./runner-container-env";

type RunnerContainerEnv = Env & RunnerContainerSecretBindings;

export class CounterLabRunner extends Container<RunnerContainerEnv> {
  defaultPort = 8080;
  requiredPorts = [8080];
  sleepAfter = "5m";
  enableInternet = true;
  pingEndpoint = "ready";
  envVars = createRunnerContainerEnvVars(workerEnv as RunnerContainerEnv);
}
