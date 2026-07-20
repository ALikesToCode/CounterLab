import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerVersionPattern = /^[a-f0-9-]{36}$/;

export type DeploymentRecoveryTarget = {
  mode: "maintenance" | "previous";
  versionId: string;
};

function started(value: string, label: string): boolean {
  if (value !== "0" && value !== "1") {
    throw new Error(`${label} must be 0 or 1`);
  }
  return value === "1";
}

export function selectDeploymentRecoveryTarget(input: {
  migrationsStarted: string;
  containerRolloutStarted: string;
  previousVersionId: string;
  maintenanceVersionId: string;
}): DeploymentRecoveryTarget {
  const mutationStarted =
    started(input.migrationsStarted, "migrationsStarted") ||
    started(input.containerRolloutStarted, "containerRolloutStarted");
  const mode = mutationStarted ? "maintenance" : "previous";
  const versionId = mutationStarted
    ? input.maintenanceVersionId
    : input.previousVersionId;
  if (!workerVersionPattern.test(versionId)) {
    throw new Error(`exact ${mode} Worker version is unavailable`);
  }
  return { mode, versionId };
}

function argument(argv: string[], name: string): string {
  const index = argv.indexOf(name);
  if (
    index < 0 ||
    index + 1 >= argv.length ||
    argv.indexOf(name, index + 1) >= 0
  ) {
    throw new Error("deployment recovery arguments are invalid");
  }
  return argv[index + 1]!;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length !== 8) {
    throw new Error("deployment recovery arguments are incomplete");
  }
  const target = selectDeploymentRecoveryTarget({
    migrationsStarted: argument(argv, "--migrations-started"),
    containerRolloutStarted: argument(argv, "--container-rollout-started"),
    previousVersionId: argument(argv, "--previous-version-id"),
    maintenanceVersionId: argument(argv, "--maintenance-version-id"),
  });
  process.stdout.write(`${target.mode}\t${target.versionId}\n`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
