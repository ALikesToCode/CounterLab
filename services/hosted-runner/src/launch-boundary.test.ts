import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  link,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildContainerLandlockLaunch,
  buildContainerLandlockProbe,
  ContainerCodexLaunchBoundary,
} from "./launch-boundary.js";

const roots: string[] = [];
const execFileAsync = promisify(execFile);
const LANDLOCK_LAUNCHER = new URL(
  "../runtime/landlock_launcher.py",
  import.meta.url,
).pathname;
const PYTHON_EXECUTABLE = "/usr/bin/python3";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function root(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "counterlab-codex-boundary-"));
  roots.push(path);
  return path;
}

describe("ContainerCodexLaunchBoundary", () => {
  it("stages credentials for initialization and revokes them before generated commands", async () => {
    const workspaceRoot = await root();
    const workspace = join(workspaceRoot, "job_1");
    const codexHomeRoot = await root();
    const codexRoot = await root();
    const codexExecutable = join(codexRoot, "bin", "codex");
    await mkdir(join(codexRoot, "bin"), { recursive: true });
    await writeFile(codexExecutable, "#!/bin/sh\n", { mode: 0o700 });
    const boundary = new ContainerCodexLaunchBoundary({
      authJson: JSON.stringify({
        tokens: { access_token: "access-token-long-enough-for-test" },
      }),
      workspaceRoot,
      codexHomeRoot,
      codexRoot,
      codexExecutable,
      landlockLauncher: LANDLOCK_LAUNCHER,
      pythonExecutable: PYTHON_EXECUTABLE,
      setprivExecutable: "/usr/bin/setpriv",
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
    });
    await mkdir(workspace, { mode: 0o700 });

    await expect(boundary.health()).resolves.toEqual({ available: true });
    const prepared = await boundary.prepare({
      command: codexExecutable,
      args: ["app-server", "--stdio"],
      environment: {
        PATH: process.env.PATH,
        CODEX_AUTH_JSON: "must-not-propagate",
      },
      hostCwd: workspace,
    });

    for (const rootMode of [
      (await stat(workspaceRoot)).mode & 0o777,
      (await stat(codexHomeRoot)).mode & 0o777,
    ]) {
      expect(rootMode & 0o700).toBe(0o700);
      expect(rootMode & 0o066).toBe(0);
    }
    expect((await stat(workspace)).mode & 0o777).toBe(0o700);

    expect(prepared.command).toBe(PYTHON_EXECUTABLE);
    expect(prepared.args).toContain(LANDLOCK_LAUNCHER);
    expect(prepared.args).toContain("--ro");
    expect(prepared.args).toContain("--ro-exec");
    expect(prepared.args).toContain("--rw");
    expect(prepared.args).toContain("--no-new-privs");
    expect(prepared.args).toContain(codexExecutable);
    expect(prepared.environment).not.toHaveProperty("CODEX_AUTH_JSON");
    expect(prepared.environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(prepared.environment).not.toHaveProperty("CODEX_ACCESS_TOKEN");
    expect(prepared.environment.CODEX_HOME).toMatch(
      /counterlab-codex-.*\/state$/u,
    );
    expect(prepared.environment.TMPDIR).toBe(prepared.environment.CODEX_HOME);
    const authPath =
      prepared.args.find((argument) =>
        /counterlab-codex-.*\/auth\.json$/u.test(argument),
      ) ?? "missing";
    expect(await readFile(authPath, "utf8")).toContain("access_token");
    const workspaceIndex = prepared.args.lastIndexOf(workspace);
    expect(prepared.args.slice(workspaceIndex - 1, workspaceIndex + 1)).toEqual(
      ["--rw", workspace],
    );
    expect(prepared.protocolCwd).toBe(workspace);
    expect(prepared.spawnCwd).toBe(workspace);
    expect(prepared.args).toContain("--strict-config");
    expect(prepared.args).toContain("shell_environment_policy.inherit=none");
    expect(prepared.args).toContain(
      'shell_environment_policy.exclude=["CODEX_ACCESS_TOKEN","OPENAI_API_KEY"]',
    );
    await prepared.revokeCredentials?.();
    await expect(readFile(authPath, "utf8")).resolves.toBe("");
    await prepared.revokeCredentials?.();
    await prepared.dispose?.();
    await expect(readFile(authPath, "utf8")).rejects.toThrow();
    expect(await readdir(codexHomeRoot)).toHaveLength(1);
    await prepared.dispose?.();
  });

  it("rejects a requested executable that differs from the configured Codex binary", async () => {
    const workspaceRoot = await root();
    const workspace = join(workspaceRoot, "job_1");
    const codexRoot = await root();
    const codexExecutable = join(codexRoot, "codex");
    await mkdir(workspace);
    await writeFile(codexExecutable, "#!/bin/sh\n", { mode: 0o700 });
    const boundary = new ContainerCodexLaunchBoundary({
      authJson: JSON.stringify({
        tokens: { access_token: "access-token-long-enough-for-test" },
      }),
      workspaceRoot,
      codexHomeRoot: await root(),
      codexRoot,
      codexExecutable,
      landlockLauncher: LANDLOCK_LAUNCHER,
      pythonExecutable: PYTHON_EXECUTABLE,
      setprivExecutable: "/usr/bin/setpriv",
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
    });

    await expect(
      boundary.prepare({
        command: process.execPath,
        args: ["app-server", "--stdio"],
        environment: { PATH: process.env.PATH },
        hostCwd: workspace,
      }),
    ).rejects.toMatchObject({ code: "CODEX_ISOLATION_UNAVAILABLE" });
  });

  it("rejects a generation directory outside the configured workspace root", async () => {
    const codexRoot = await root();
    const codexExecutable = join(codexRoot, "codex");
    await writeFile(codexExecutable, "#!/bin/sh\n", { mode: 0o700 });
    const boundary = new ContainerCodexLaunchBoundary({
      authJson: JSON.stringify({
        tokens: { access_token: "access-token-long-enough-for-test" },
      }),
      workspaceRoot: await root(),
      codexHomeRoot: await root(),
      codexRoot,
      codexExecutable,
      landlockLauncher: LANDLOCK_LAUNCHER,
      pythonExecutable: PYTHON_EXECUTABLE,
      setprivExecutable: "/usr/bin/setpriv",
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
    });

    await expect(
      boundary.prepare({
        command: process.execPath,
        args: ["app-server", "--stdio"],
        environment: { PATH: process.env.PATH },
        hostCwd: tmpdir(),
      }),
    ).rejects.toMatchObject({ code: "CODEX_ISOLATION_UNAVAILABLE" });
  });

  it("rejects a symlinked generation directory", async () => {
    const workspaceRoot = await root();
    const workspace = join(workspaceRoot, "job_real");
    const linkedWorkspace = join(workspaceRoot, "job_link");
    const codexRoot = await root();
    const codexExecutable = join(codexRoot, "codex");
    await mkdir(workspace);
    await symlink(workspace, linkedWorkspace);
    await writeFile(codexExecutable, "#!/bin/sh\n", { mode: 0o700 });
    const boundary = new ContainerCodexLaunchBoundary({
      authJson: JSON.stringify({
        tokens: { access_token: "access-token-long-enough-for-test" },
      }),
      workspaceRoot,
      codexHomeRoot: await root(),
      codexRoot,
      codexExecutable,
      landlockLauncher: LANDLOCK_LAUNCHER,
      pythonExecutable: PYTHON_EXECUTABLE,
      setprivExecutable: "/usr/bin/setpriv",
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
    });

    await expect(
      boundary.prepare({
        command: codexExecutable,
        args: ["app-server", "--stdio"],
        environment: { PATH: process.env.PATH },
        hostCwd: linkedWorkspace,
      }),
    ).rejects.toMatchObject({ code: "CODEX_ISOLATION_UNAVAILABLE" });
  });

  it("rejects a pre-existing hard link inside the generation workspace", async () => {
    const workspaceRoot = await root();
    const workspace = join(workspaceRoot, "job_1");
    const outside = join(workspaceRoot, "outside.txt");
    const codexRoot = await root();
    const codexExecutable = join(codexRoot, "codex");
    await mkdir(workspace);
    await writeFile(outside, "outside\n");
    await link(outside, join(workspace, "linked.txt"));
    await writeFile(codexExecutable, "#!/bin/sh\n", { mode: 0o700 });
    const boundary = new ContainerCodexLaunchBoundary({
      authJson: JSON.stringify({
        tokens: { access_token: "access-token-long-enough-for-test" },
      }),
      workspaceRoot,
      codexHomeRoot: await root(),
      codexRoot,
      codexExecutable,
      landlockLauncher: LANDLOCK_LAUNCHER,
      pythonExecutable: PYTHON_EXECUTABLE,
      setprivExecutable: "/usr/bin/setpriv",
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
    });

    await expect(
      boundary.prepare({
        command: codexExecutable,
        args: ["app-server", "--stdio"],
        environment: { PATH: process.env.PATH },
        hostCwd: workspace,
      }),
    ).rejects.toMatchObject({ code: "CODEX_ISOLATION_UNAVAILABLE" });
  });

  it("rejects overlapping writable roots and executables outside the mounted system root", async () => {
    const workspaceRoot = await root();
    const codexHomeRoot = join(workspaceRoot, "codex-home");
    const codexRoot = await root();
    const codexExecutable = join(codexRoot, "codex");
    await mkdir(codexHomeRoot);
    await writeFile(codexExecutable, "#!/bin/sh\n", { mode: 0o700 });
    const common = {
      authJson: JSON.stringify({
        tokens: { access_token: "access-token-long-enough-for-test" },
      }),
      workspaceRoot,
      codexHomeRoot,
      codexRoot,
      codexExecutable,
      landlockLauncher: LANDLOCK_LAUNCHER,
      pythonExecutable: PYTHON_EXECUTABLE,
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
    };

    await expect(
      new ContainerCodexLaunchBoundary({
        ...common,
        setprivExecutable: "/usr/bin/setpriv",
      }).health(),
    ).resolves.toMatchObject({ available: false });
    await expect(
      new ContainerCodexLaunchBoundary({
        ...common,
        codexHomeRoot: await root(),
        setprivExecutable: codexExecutable,
      }).health(),
    ).resolves.toMatchObject({ available: false });
  });

  it("builds a fixed mount allowlist with no inherited secret environment", () => {
    const plan = buildContainerLandlockLaunch({
      appServerArgs: ["app-server", "--stdio"],
      codexExecutable: "/opt/counterlab-codex/bin/codex",
      codexHome: "/run/counterlab-codex/job_1/state",
      codexRoot: "/opt/counterlab-codex",
      landlockLauncher: "/opt/counterlab/landlock_launcher.py",
      pythonExecutable: "/opt/counterlab-venv/bin/python",
      setprivExecutable: "/usr/bin/setpriv",
      stagedAuthFile: "/run/counterlab-codex/job_1.auth.json",
      workspace: "/work/jobs/job_1",
    });

    expect(plan.allowedHostPaths).toEqual([
      "/etc/ca-certificates",
      "/etc/hosts",
      "/etc/ld.so.cache",
      "/etc/nsswitch.conf",
      "/etc/passwd",
      "/etc/group",
      "/etc/resolv.conf",
      "/etc/ssl",
      "/dev/random",
      "/dev/urandom",
      "/run/counterlab-codex/job_1.auth.json",
      "/usr",
      "/opt/counterlab-codex",
      "/dev/null",
      "/run/counterlab-codex/job_1/state",
      "/work/jobs/job_1",
    ]);
    expect(plan.allowedHostPaths).not.toContain("/app");
    expect(plan.allowedHostPaths).not.toContain("/repo");
    expect(plan.allowedHostPaths).not.toContain("/opt/counterlab-venv");
    expect(plan.environment).toEqual({
      CODEX_HOME: "/run/counterlab-codex/job_1/state",
      HOME: "/run/counterlab-codex/job_1/state",
      LANG: "C.UTF-8",
      PATH: "/usr/local/bin:/usr/bin",
      TMPDIR: "/run/counterlab-codex/job_1/state",
    });
    expect(plan.environment).not.toHaveProperty("CODEX_AUTH_JSON");
    expect(plan.environment).not.toHaveProperty("CODEX_ACCESS_TOKEN");
    expect(plan.environment).not.toHaveProperty("OPENAI_API_KEY");
  });

  it.runIf(process.env.COUNTERLAB_REAL_LANDLOCK_PROBE === "1")(
    "proves the real Landlock boundary denies host roots and permits bounded workspace writes",
    async () => {
      const workspace = await root();
      const codexRoot = await root();
      await mkdir(join(codexRoot, "bin"), { recursive: true });
      await writeFile(join(codexRoot, "bin", "codex"), "#!/bin/sh\n", {
        mode: 0o700,
      });
      await writeFile(join(workspace, "approved.txt"), "approved\n", {
        mode: 0o600,
      });
      const codexHome = join(workspace, "codex-home");
      await mkdir(codexHome, { mode: 0o700 });
      const plan = buildContainerLandlockProbe({
        codexHome,
        codexRoot,
        landlockLauncher: LANDLOCK_LAUNCHER,
        pythonExecutable: PYTHON_EXECUTABLE,
        setprivExecutable: "/usr/bin/setpriv",
        workspace,
      });

      const { stdout } = await execFileAsync(plan.command, plan.args, {
        env: plan.environment,
        timeout: 30_000,
      });
      expect(JSON.parse(stdout)).toEqual({
        forbiddenHostPathsUnreadable: true,
        forbiddenHostWritesDenied: true,
        crossTreeReferDenied: true,
        execInheritanceEnforced: true,
        parentEnvironmentUnreadable: true,
        workspaceVisible: true,
        workspaceWritable: true,
      });
    },
  );

  it.runIf(process.env.COUNTERLAB_REAL_LANDLOCK_PROBE === "1")(
    "proves the real Landlock launch invokes setpriv and the allowed Codex binary",
    async () => {
      const workspace = await root();
      const codexRoot = await root();
      const authRoot = await root();
      const stagedAuthFile = join(authRoot, "staged-auth.json");
      await mkdir(join(codexRoot, "bin"), { recursive: true });
      await writeFile(
        join(codexRoot, "bin", "codex"),
        `#!/bin/sh\nset -eu\ntest "$(pwd)" = "${workspace}"\ntest -s "${join(authRoot, "staged-auth.json")}"\n! sh -c 'printf denied > "${join(authRoot, "staged-auth.json")}"' 2>/dev/null\n! truncate -s 0 "${join(authRoot, "staged-auth.json")}" 2>/dev/null\nprintf 'generated\\n' > "${join(workspace, "generated.txt")}"\nprintf '{"authReadOnly":true,"authVisibleToAppServer":true,"workspaceWritable":true}\\n'\n`,
        { mode: 0o700 },
      );
      await writeFile(stagedAuthFile, '{"tokens":{"access_token":"test"}}', {
        mode: 0o600,
      });
      const codexHome = join(authRoot, "state");
      await mkdir(codexHome, { mode: 0o700 });
      const plan = buildContainerLandlockLaunch({
        appServerArgs: ["app-server", "--stdio"],
        codexExecutable: join(codexRoot, "bin", "codex"),
        codexHome,
        codexRoot,
        landlockLauncher: LANDLOCK_LAUNCHER,
        pythonExecutable: PYTHON_EXECUTABLE,
        setprivExecutable: "/usr/bin/setpriv",
        stagedAuthFile,
        workspace,
      });

      const { stdout } = await execFileAsync(plan.command, plan.args, {
        cwd: plan.spawnCwd,
        env: plan.environment,
        timeout: 30_000,
      });
      expect(JSON.parse(stdout)).toEqual({
        authReadOnly: true,
        authVisibleToAppServer: true,
        workspaceWritable: true,
      });
      expect(await readFile(join(workspace, "generated.txt"), "utf8")).toBe(
        "generated\n",
      );
    },
  );
});
