import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
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
  buildContainerBubblewrapLaunch,
  buildContainerBubblewrapProbe,
  ContainerCodexLaunchBoundary,
} from "./launch-boundary.js";

const roots: string[] = [];
const execFileAsync = promisify(execFile);

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
      bwrapExecutable: "/usr/bin/bwrap",
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

    expect(prepared.command).toBe("/usr/bin/bwrap");
    expect(prepared.args).toContain("--unshare-user");
    expect(prepared.args).toContain("--unshare-pid");
    expect(prepared.args).toContain("--unshare-ipc");
    expect(prepared.args).toContain("--unshare-uts");
    expect(prepared.args).toContain("--clearenv");
    expect(prepared.args).toContain("--cap-drop");
    expect(prepared.args).toContain("--no-new-privs");
    expect(prepared.args).toContain("/opt/codex/bin/codex");
    expect(prepared.environment).not.toHaveProperty("CODEX_AUTH_JSON");
    expect(prepared.environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(prepared.environment).not.toHaveProperty("CODEX_ACCESS_TOKEN");
    expect(prepared.environment.CODEX_HOME).toBe("/home/counterlab");
    expect(prepared.environment.TMPDIR).toBe("/tmp");
    const guestAuthIndex = prepared.args.indexOf("/home/counterlab/auth.json");
    const authPath = prepared.args[guestAuthIndex - 1] ?? "missing";
    expect(authPath).toMatch(/counterlab-codex-.*\.auth\.json$/u);
    expect(await readFile(authPath, "utf8")).toContain("access_token");
    const workspaceIndex = prepared.args.indexOf(workspace);
    expect(prepared.args.slice(workspaceIndex - 1, workspaceIndex + 2)).toEqual(
      ["--bind", workspace, "/workspace"],
    );
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
    expect(await readdir(codexHomeRoot)).toEqual([]);
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
      bwrapExecutable: "/usr/bin/bwrap",
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
      bwrapExecutable: "/usr/bin/bwrap",
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
      bwrapExecutable: "/usr/bin/bwrap",
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
      bwrapExecutable: "/usr/bin/bwrap",
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
    const plan = buildContainerBubblewrapLaunch({
      appServerArgs: ["app-server", "--stdio"],
      bwrapExecutable: "/usr/bin/bwrap",
      codexExecutable: "/opt/counterlab-codex/bin/codex",
      codexRoot: "/opt/counterlab-codex",
      setprivExecutable: "/usr/bin/setpriv",
      stagedAuthFile: "/run/counterlab-codex/job_1.auth.json",
      workspace: "/work/jobs/job_1",
    });

    expect(plan.mountedHostPaths).toEqual([
      "/usr",
      "/etc/ca-certificates",
      "/etc/hosts",
      "/etc/nsswitch.conf",
      "/etc/resolv.conf",
      "/etc/ssl",
      "/opt/counterlab-codex",
      "/run/counterlab-codex/job_1.auth.json",
      "/work/jobs/job_1",
    ]);
    expect(plan.mountedHostPaths).not.toContain("/app");
    expect(plan.mountedHostPaths).not.toContain("/repo");
    expect(plan.mountedHostPaths).not.toContain("/opt/counterlab-venv");
    expect(plan.environment).toEqual({
      CODEX_HOME: "/home/counterlab",
      HOME: "/home/counterlab",
      LANG: "C.UTF-8",
      PATH: "/usr/bin",
      TMPDIR: "/tmp",
    });
    expect(plan.environment).not.toHaveProperty("CODEX_AUTH_JSON");
    expect(plan.environment).not.toHaveProperty("CODEX_ACCESS_TOKEN");
    expect(plan.environment).not.toHaveProperty("OPENAI_API_KEY");
  });

  it.runIf(process.env.COUNTERLAB_REAL_BWRAP_PROBE === "1")(
    "proves the real Bubblewrap boundary hides host roots and permits bounded workspace writes",
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
      const plan = buildContainerBubblewrapProbe({
        bwrapExecutable: "/usr/bin/bwrap",
        codexRoot,
        workspace,
      });

      const { stdout } = await execFileAsync(plan.command, plan.args, {
        env: plan.environment,
        timeout: 30_000,
      });
      expect(JSON.parse(stdout)).toEqual({
        forbiddenHostPathsHidden: true,
        parentEnvironmentHidden: true,
        workspaceVisible: true,
        workspaceWritable: true,
      });
    },
  );

  it.runIf(process.env.COUNTERLAB_REAL_BWRAP_PROBE === "1")(
    "proves the real Bubblewrap launch invokes setpriv and the mounted Codex binary",
    async () => {
      const workspace = await root();
      const codexRoot = await root();
      const authRoot = await root();
      const stagedAuthFile = join(authRoot, "staged-auth.json");
      await mkdir(join(codexRoot, "bin"), { recursive: true });
      await writeFile(
        join(codexRoot, "bin", "codex"),
        "#!/bin/sh\nset -eu\ntest -s /home/counterlab/auth.json\nprintf 'generated\\n' > /workspace/generated.txt\nprintf '{\"authVisibleToAppServer\":true,\"workspaceWritable\":true}\\n'\n",
        { mode: 0o700 },
      );
      await writeFile(stagedAuthFile, '{"tokens":{"access_token":"test"}}', {
        mode: 0o600,
      });
      const plan = buildContainerBubblewrapLaunch({
        appServerArgs: ["app-server", "--stdio"],
        bwrapExecutable: "/usr/bin/bwrap",
        codexExecutable: join(codexRoot, "bin", "codex"),
        codexRoot,
        setprivExecutable: "/usr/bin/setpriv",
        stagedAuthFile,
        workspace,
      });

      const { stdout } = await execFileAsync(plan.command, plan.args, {
        env: plan.environment,
        timeout: 30_000,
      });
      expect(JSON.parse(stdout)).toEqual({
        authVisibleToAppServer: true,
        workspaceWritable: true,
      });
      expect(await readFile(join(workspace, "generated.txt"), "utf8")).toBe(
        "generated\n",
      );
    },
  );
});
