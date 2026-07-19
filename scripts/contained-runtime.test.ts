import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const reviewRoot = resolve(
  root,
  `node_modules/.cache/counterlab-v6.1/scientific-evidence-${sourceCommit}-20260719T000000Z-1`,
);
const reviewFile = resolve(reviewRoot, "reachability-review.json");

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
    "--rm",
    "--name",
    "counterlab-startup-validator",
    "--pull=never",
    "--network",
    "none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--ipc=none",
    "--pids-limit=32",
    "--memory=1024m",
    "--memory-swap=1024m",
    "--cpus=2.0",
    "--ulimit=fsize=1048576:1048576",
    "--ulimit=nofile=64:64",
    "--tmpfs",
    "/counterlab-runtime:rw,noexec,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=0700",
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
    "--rm",
    "--name",
    "counterlab-runtime-validator",
    "--user",
    "1000:1000",
    "--pull=never",
    "--network",
    "none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--ipc=none",
    "--pids-limit=32",
    "--memory=1024m",
    "--memory-swap=1024m",
    "--cpus=2.0",
    "--ulimit=fsize=1048576:1048576",
    "--ulimit=nofile=64:64",
    "--tmpfs",
    "/counterlab-runtime:rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=0700",
    "-e",
    "TMPDIR=/counterlab-runtime",
    "-v",
    `${root}:/repo:ro`,
    "--workdir=/repo",
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

function reachabilityCommand(): string[] {
  return [
    "run",
    "--rm",
    "--name",
    "counterlab-reachability-validator",
    "--pull=never",
    "--network=none",
    "--read-only",
    "--user=1000:1000",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--ipc=none",
    "--pids-limit=32",
    "--memory=1024m",
    "--memory-swap=1024m",
    "--cpus=2.0",
    "--ulimit=fsize=1048576:1048576",
    "--ulimit=nofile=64:64",
    "--tmpfs=/counterlab-runtime:rw,noexec,nosuid,nodev,size=256m,uid=1000,gid=1000,mode=0700",
    "--env=TMPDIR=/counterlab-runtime",
    "--volume",
    `${root}:/repo:ro`,
    "--workdir=/repo",
    "--entrypoint=python",
    image,
    "/repo/scripts/probe_cpython_htmlparser_reachability.py",
    "--root",
    "/repo",
    "--image-digest",
    `sha256:${"b".repeat(64)}`,
    "--source-commit",
    sourceCommit,
    "--sbom-sha256",
    "c".repeat(64),
    "--review-file",
    `/repo/${reviewFile.slice(root.length + 1)}`,
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
    mkdirSync(reviewRoot, { recursive: true, mode: 0o700 });
    writeFileSync(reviewFile, "{}\n", { mode: 0o600 });
  });

  it("allows only the exact release verification profiles", () => {
    expect(validate(...startupCommand()).status).toBe(0);
    expect(validate(...scientificRuntimeCommand()).status).toBe(0);
    expect(validate(...reachabilityCommand()).status).toBe(0);
    expect(validate(...boundedAdapterCommand()).status).toBe(0);
  });

  it("rejects root identities for scientific evidence containers", () => {
    const runtime = scientificRuntimeCommand();
    runtime[runtime.indexOf("1000:1000")] = "0:0";
    expect(validate(...runtime).status).not.toBe(0);

    const reachability = reachabilityCommand();
    reachability[reachability.indexOf("--user=1000:1000")] = "--user=0:0";
    expect(validate(...reachability).status).not.toBe(0);
  });

  it("rejects reachability command or review-path expansion", () => {
    const command = reachabilityCommand();
    command[
      command.indexOf("/repo/scripts/probe_cpython_htmlparser_reachability.py")
    ] = "/repo/scripts/verify_scientific_runtime.py";
    expect(validate(...command).status).not.toBe(0);

    const escaped = reachabilityCommand();
    escaped[escaped.length - 1] = "/repo/scientific-engines/registry.json";
    expect(validate(...escaped).status).not.toBe(0);

    const traversed = reachabilityCommand();
    traversed[traversed.length - 1] =
      `/repo/node_modules/.cache/counterlab-v6.1/scientific-evidence-${sourceCommit}-20260719T000000Z-1/../../../../scientific-engines/registry.json`;
    expect(validate(...traversed).status).not.toBe(0);
  });

  it("keeps the bounded adapter inputs in the source-bound build context", () => {
    const dockerIgnore = readFileSync(resolve(root, ".dockerignore"), "utf8");

    expect(dockerIgnore).toContain("!services/runner/Dockerfile");
    expect(dockerIgnore).toContain("!services/runner/image");
    expect(dockerIgnore).toContain("!services/runner/image/harness.py");
  });

  it("keeps release diagnostics inside repository-owned files", () => {
    for (const file of [
      "start-contained-runtime.sh",
      "setup-contained-runtime.sh",
      "run-contained-pnpm.sh",
      "test-all.sh",
      "test-e2e.sh",
      "run-mutations.sh",
      "sandbox-smoke.sh",
      "verify-scientific-engines.sh",
      "deploy-qualified.sh",
      "production-smoke.sh",
      "refresh-source-bound-scientific-evidence.sh",
      "release-check.sh",
      "build-source-bound-runner.sh",
      "reproduce-session.sh",
      "replay-patch.sh",
    ]) {
      const script = readFileSync(resolve(root, "scripts", file), "utf8");
      expect(script, file).not.toContain("/dev/null");
      expect(script, file).toContain("pwd -P");
      expect(script, file).not.toMatch(/&& pwd\)"/u);
      if (script.includes("GIT_CONFIG_GLOBAL=")) {
        expect(script, file).toContain('"${GIT_CONFIG_GLOBAL}"');
      }
    }

    const environmentHelper = readFileSync(
      resolve(root, "scripts/prepare-contained-shell-environment.sh"),
      "utf8",
    );
    expect(environmentHelper).not.toContain("/dev/null");
    expect(environmentHelper).toContain("assert-contained-path.mjs");
    expect(environmentHelper).toContain("GIT_CONFIG_NOSYSTEM");

    const runtimeSetup = readFileSync(
      resolve(root, "scripts/setup-contained-runtime.sh"),
      "utf8",
    );
    for (const containedPath of [
      '"${HOME}"',
      '"${TMPDIR}"',
      '"${XDG_CACHE_HOME}"',
      '"${XDG_CONFIG_HOME}"',
      '"${XDG_DATA_HOME}"',
    ]) {
      expect(runtimeSetup.split(containedPath).length - 1).toBe(3);
    }
    expect(runtimeSetup.split('"${GIT_CONFIG_GLOBAL}"').length - 1).toBe(2);
    const runtimeSetupMkdirStart = runtimeSetup.indexOf("mkdir -p");
    const runtimeSetupMkdir = runtimeSetup.slice(
      runtimeSetupMkdirStart,
      runtimeSetup.indexOf(
        "node scripts/assert-contained-path.mjs",
        runtimeSetupMkdirStart,
      ),
    );
    expect(runtimeSetupMkdir).not.toContain('"${GIT_CONFIG_GLOBAL}"');

    const secretScan = readFileSync(
      resolve(root, "scripts/secret-scan.py"),
      "utf8",
    );
    expect(secretScan).toContain("assert_repository_path");
    expect(secretScan).toContain("path traverses a repository symlink");
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
