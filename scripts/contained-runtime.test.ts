import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

const root = process.cwd();
const validator = resolve(
  root,
  "scripts/validate-contained-runtime-command.mjs",
);
const sourceCommit = "a".repeat(40);
const image = `counterlab-runner:git-${sourceCommit}`;
const adapterImage = `counterlab-adapter:git-${sourceCommit}`;
const sandboxRoot = resolve(
  root,
  "node_modules/.cache/counterlab-v6.1/tmp/counterlab-sandbox-validator-fixture",
);
const workspace = resolve(sandboxRoot, "runs/workspace-fixture");
const output = resolve(sandboxRoot, "runs/adapter-fixture");

function validate(...args: string[]) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
}

function startupCommand(): string[] {
  return [
    "run",
    "--name",
    "counterlab-startup-validator",
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/counterlab-runtime:rw,noexec,nosuid,size=64m",
    "-e",
    "TMPDIR=/counterlab-runtime",
    "-e",
    "COUNTERLAB_RUNNER_STARTUP_PROBE=1",
    "-e",
    "COUNTERLAB_RUNNER_WORK_ROOT=/counterlab-runtime/jobs",
    "-e",
    "COUNTERLAB_CODEX_HOME_ROOT=/counterlab-runtime/codex",
    image,
  ];
}

function scientificRuntimeCommand(): string[] {
  return [
    "run",
    "--name",
    "counterlab-runtime-validator",
    "--user",
    "1000:1000",
    "--network",
    "none",
    "--read-only",
    "--tmpfs",
    "/counterlab-runtime:rw,noexec,nosuid,size=64m",
    "-e",
    "TMPDIR=/counterlab-runtime",
    "-v",
    `${root}:/repo:ro`,
    "--entrypoint",
    "python",
    image,
    "/repo/scripts/verify_scientific_runtime.py",
    "--root",
    "/repo",
    "--image-digest",
    `sha256:${"b".repeat(64)}`,
    "--source-commit",
    sourceCommit,
  ];
}

function boundedAdapterCommand(): string[] {
  return [
    "run",
    "--rm",
    `--name=counterlab-${"c".repeat(20)}`,
    "--pull=never",
    "--network=none",
    "--read-only",
    "--user=65532:65532",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--ipc=none",
    "--pids-limit=16",
    "--memory=512m",
    "--memory-swap=512m",
    "--cpus=1.0",
    "--ulimit=fsize=262144:262144",
    "--ulimit=nofile=64:64",
    "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532,mode=0700",
    "--mount",
    `type=bind,src=${workspace},dst=/workspace,readonly`,
    "--mount",
    `type=bind,src=${resolve(root, "fixtures/public/customer_churn.csv")},dst=/fixtures/customer_churn.csv,readonly`,
    "--mount",
    `type=bind,src=${output},dst=/output`,
    "--env=PYTHONHASHSEED=0",
    "--workdir=/workspace",
    adapterImage,
  ];
}

describe("contained runtime command policy", () => {
  beforeAll(() => {
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    mkdirSync(output, { recursive: true, mode: 0o700 });
  });

  it("allows only the exact release verification profiles", () => {
    expect(validate(...startupCommand()).status).toBe(0);
    expect(validate(...scientificRuntimeCommand()).status).toBe(0);
    expect(validate(...boundedAdapterCommand()).status).toBe(0);
  });

  it("allows bounded image inspection and repository OCI input", () => {
    expect(
      validate("image", "inspect", image, "--format", "{{.Config.User}}")
        .status,
    ).toBe(0);
    expect(validate("load", "--input", "package.json").status).toBe(0);
  });

  it("rejects a shell command appended to the bounded adapter profile", () => {
    const result = validate(...boundedAdapterCommand(), "sh", "-c", "id");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/profile is incomplete/u);
  });

  it("rejects extra environment in the startup profile", () => {
    const command = startupCommand();
    command.splice(command.length - 1, 0, "-e", "OPENAI_API_KEY=$FORBIDDEN");
    const result = validate(...command);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/option shape is not approved/u);
  });

  it("rejects writable source and fixture mounts", () => {
    const command = boundedAdapterCommand();
    const fixtureIndex = command.findIndex((value) =>
      value.includes("dst=/fixtures/customer_churn.csv"),
    );
    command[fixtureIndex] = command[fixtureIndex]!.replace(",readonly", "");
    const result = validate(...command);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/mounts are invalid/u);
  });

  it("rejects a writable alias of the read-only workspace", () => {
    const command = boundedAdapterCommand();
    const outputIndex = command.findIndex((value) =>
      value.includes("dst=/output"),
    );
    command[outputIndex] = `type=bind,src=${workspace},dst=/output`;

    const result = validate(...command);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/mounts are invalid/u);
  });

  it("rejects nested writable and read-only mount sources", () => {
    const command = boundedAdapterCommand();
    const outputIndex = command.findIndex((value) =>
      value.includes("dst=/output"),
    );
    command[outputIndex] =
      `type=bind,src=${resolve(workspace, "nested")},dst=/output`;
    mkdirSync(resolve(workspace, "nested"), {
      recursive: true,
      mode: 0o700,
    });

    const result = validate(...command);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/mounts are invalid/u);
  });

  it("rejects non-source-bound images and paths outside the repository", () => {
    expect(
      validate("image", "inspect", "counterlab-runner:latest").status,
    ).not.toBe(0);
    const escaped = validate("load", "--input", "../outside.oci");
    expect(escaped.status).not.toBe(0);
    expect(escaped.stderr).toMatch(/escaped the repository/u);
  });

  it("rejects registry mutation commands with incoherent source tags", () => {
    const coherentRegistry =
      "registry.cloudflare.com/account-1/counterlab-runner:git-" + sourceCommit;
    const incoherentRegistry =
      "registry.cloudflare.com/account-1/counterlab-runner:git-" +
      "d".repeat(40);
    expect(validate("tag", image, coherentRegistry).status).toBe(0);
    expect(validate("tag", image, incoherentRegistry).status).not.toBe(0);
    expect(
      validate(
        "tag",
        image,
        "registry.cloudflare.com/account-1/counterlab-runner:latest",
      ).status,
    ).not.toBe(0);
  });
});
