import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ContainerCodexLaunchBoundary } from "./launch-boundary.js";

const roots: string[] = [];

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
    const boundary = new ContainerCodexLaunchBoundary({
      authJson: JSON.stringify({
        tokens: { access_token: "access-token-long-enough-for-test" },
      }),
      workspaceRoot,
      codexHomeRoot,
      codexExecutable: process.execPath,
      setprivExecutable: "/usr/bin/setpriv",
      uid: process.getuid?.() ?? 1000,
      gid: process.getgid?.() ?? 1000,
    });
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(workspace, { mode: 0o700 }),
    );

    await expect(boundary.health()).resolves.toEqual({ available: true });
    const prepared = await boundary.prepare({
      command: process.execPath,
      args: ["app-server", "--stdio"],
      environment: {
        PATH: process.env.PATH,
        CODEX_AUTH_JSON: "must-not-propagate",
      },
      hostCwd: workspace,
    });

    expect((await stat(workspaceRoot)).mode & 0o777).toBe(0o711);
    expect((await stat(codexHomeRoot)).mode & 0o777).toBe(0o711);
    expect((await stat(workspace)).mode & 0o777).toBe(0o700);

    expect(prepared.command).toBe("/usr/bin/setpriv");
    expect(prepared.args).toContain(`--reuid=${process.getuid?.() ?? 1000}`);
    expect(prepared.args).toContain(process.execPath);
    expect(prepared.environment).not.toHaveProperty("CODEX_AUTH_JSON");
    expect(prepared.environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(prepared.environment).not.toHaveProperty("CODEX_ACCESS_TOKEN");
    expect(prepared.environment.CODEX_HOME).toMatch(/counterlab-codex-/u);
    expect(prepared.environment.TMPDIR).toMatch(/counterlab-codex-.*\/tmp$/u);
    expect(prepared.environment.TMPDIR).not.toBe(workspace);
    expect(
      (await stat(prepared.environment.TMPDIR ?? "missing")).mode & 0o777,
    ).toBe(0o700);
    const authPath = join(prepared.environment.CODEX_HOME ?? "", "auth.json");
    expect(await readFile(authPath, "utf8")).toContain("access_token");
    expect(prepared.args).toContain("--strict-config");
    expect(prepared.args).toContain("shell_environment_policy.inherit=none");
    expect(prepared.args).toContain(
      'shell_environment_policy.exclude=["CODEX_ACCESS_TOKEN","OPENAI_API_KEY"]',
    );
    await prepared.revokeCredentials?.();
    await expect(readFile(authPath, "utf8")).rejects.toThrow();
    await prepared.dispose?.();
  });

  it("rejects a generation directory outside the configured workspace root", async () => {
    const boundary = new ContainerCodexLaunchBoundary({
      authJson: JSON.stringify({
        tokens: { access_token: "access-token-long-enough-for-test" },
      }),
      workspaceRoot: await root(),
      codexHomeRoot: await root(),
      codexExecutable: process.execPath,
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
});
