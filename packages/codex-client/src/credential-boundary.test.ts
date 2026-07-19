import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BubblewrapCodexLaunchBoundary,
  buildBubblewrapCodexLaunch,
  createDefaultBubblewrapCodexLaunchBoundary,
  loadSecureCodexAccessToken,
  probeBubblewrapCredentialIsolation,
  stageSecureCodexAuth,
} from "./index.js";
import { assertSecureCodexAuthMetadata } from "./credential-boundary.js";

function createAuthFixture(mode = 0o600): {
  root: string;
  authFile: string;
} {
  const root = mkdtempSync(join(tmpdir(), "counterlab-codex-auth-"));
  const authFile = join(root, "auth.json");
  writeFileSync(
    authFile,
    JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        access_token: "pat-counterlab-test-only",
        refresh_token: "refresh-must-never-cross-boundary",
      },
    }),
    { mode },
  );
  chmodSync(authFile, mode);
  return { root, authFile };
}

function writeNativeCodexFixture(codexPackageRoot: string): void {
  const target =
    process.arch === "arm64"
      ? join(
          codexPackageRoot,
          "node_modules/@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl/bin/codex",
        )
      : join(
          codexPackageRoot,
          "node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex",
        );
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, "#!/bin/sh\n", { mode: 0o700 });
}

describe("Codex credential boundary", () => {
  it("loads only the access token from a private regular auth file", async () => {
    const fixture = createAuthFixture();
    try {
      await expect(loadSecureCodexAccessToken(fixture.authFile)).resolves.toBe(
        "pat-counterlab-test-only",
      );
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects auth metadata readable by the group or other users", () => {
    expect(() =>
      assertSecureCodexAuthMetadata({
        isFile: () => true,
        mode: 0o100644,
        size: 128,
        uid: process.getuid?.() ?? 1000,
      }),
    ).toThrowError(
      expect.objectContaining({
        name: "CompilerSetupError",
        code: "CODEX_ISOLATION_UNAVAILABLE",
        message: expect.stringMatching(/permissions/i),
      }),
    );
  });

  it("rejects a symlinked auth file", async () => {
    const fixture = createAuthFixture();
    const link = join(fixture.root, "linked-auth.json");
    symlinkSync(fixture.authFile, link);
    try {
      await expect(loadSecureCodexAccessToken(link)).rejects.toMatchObject({
        name: "CompilerSetupError",
        code: "CODEX_ISOLATION_UNAVAILABLE",
        message: expect.stringMatching(/regular file/i),
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("stages managed auth privately and revokes it before model commands", async () => {
    const fixture = createAuthFixture();
    try {
      const staged = await stageSecureCodexAuth(fixture.authFile);
      expect(existsSync(staged.guestAuthSource)).toBe(true);
      expect(staged.guestAuthSource).not.toBe(fixture.authFile);
      writeFileSync(join(staged.directory, "state.sqlite"), "sensitive-state");
      mkdirSync(join(staged.directory, "log"));
      writeFileSync(
        join(staged.directory, "log", "session.log"),
        "sensitive-log",
      );
      await staged.revoke();
      expect(existsSync(staged.guestAuthSource)).toBe(false);
      expect(existsSync(staged.directory)).toBe(true);
      expect(statSync(staged.directory).mode & 0o077).toBe(0);
      try {
        expect(readdirSync(staged.directory)).toEqual([]);
      } catch (error) {
        expect(error).toMatchObject({ code: "EACCES" });
      }
      await staged.dispose();
      expect(existsSync(staged.directory)).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps the token out of argv and the command-visible filesystem", () => {
    const root = join(tmpdir(), "counterlab-boundary-plan");
    const workspace = join(root, "generated", "session_test");
    const stagedCodexHome = join(root, "broker-home");
    const plan = buildBubblewrapCodexLaunch({
      appServerArgs: ["app-server", "--stdio"],
      bwrapPath: "/usr/bin/bwrap",
      codexPackageRoot: "/opt/host/codex-package",
      stagedCodexHome,
      workspace,
    });

    expect(plan.command).toBe("/usr/bin/bwrap");
    expect(plan.args.join(" ")).not.toContain("pat-counterlab-test-only");
    expect(plan.environment.CODEX_ACCESS_TOKEN).toBeUndefined();
    expect(plan.args).toContain("--unshare-pid");
    expect(plan.args).toContain("--unshare-user");
    expect(plan.args).toContain("--cap-drop");
    const systemBindIndex = plan.args.indexOf("--ro-bind");
    expect(plan.args.slice(systemBindIndex, systemBindIndex + 3)).toEqual([
      "--ro-bind",
      "/usr",
      "/usr",
    ]);
    const procIndex = plan.args.indexOf("--proc");
    expect(plan.args.slice(procIndex, procIndex + 3)).toEqual([
      "--proc",
      "/proc",
      "--ro-bind",
    ]);
    expect(plan.args.slice(procIndex + 2, procIndex + 5)).toEqual([
      "--ro-bind",
      "/dev/null",
      "/proc/1/environ",
    ]);
    expect(plan.args).toContain("/workspace");
    expect(plan.args).toContain("/opt/codex");
    expect(plan.args.some((argument) => argument.endsWith("/bin/codex"))).toBe(
      true,
    );
    expect(plan.args).not.toContain("/opt/codex/bin/codex.js");
    expect(plan.args).toContain("shell_environment_policy.inherit=none");
    expect(plan.args).toContain(
      'shell_environment_policy.exclude=["CODEX_ACCESS_TOKEN","OPENAI_API_KEY"]',
    );
    expect(plan.mountedHostPaths).toEqual([
      "/usr",
      "/etc/ca-certificates",
      "/etc/hosts",
      "/etc/nsswitch.conf",
      "/etc/resolv.conf",
      "/etc/ssl",
      "/opt/host/codex-package",
      stagedCodexHome,
      workspace,
    ]);
    const stagedHomeIndex = plan.args.indexOf(stagedCodexHome);
    expect(plan.args.slice(stagedHomeIndex - 1, stagedHomeIndex + 2)).toEqual([
      "--bind",
      stagedCodexHome,
      "/tmp/codex-home",
    ]);
    for (const systemPath of [
      "/etc/ca-certificates",
      "/etc/hosts",
      "/etc/nsswitch.conf",
      "/etc/resolv.conf",
      "/etc/ssl",
    ]) {
      const bindIndex = plan.args.indexOf(systemPath);
      expect(bindIndex).toBeGreaterThan(0);
      expect(plan.args[bindIndex - 1]).toBe("--ro-bind");
      expect(plan.args[bindIndex + 1]).toBe(systemPath);
    }
    expect(plan.protocolCwd).toBe("/workspace");
    expect(plan.spawnCwd).toBeUndefined();
  });

  it("rejects relative workspaces before constructing a launch", () => {
    expect(() =>
      buildBubblewrapCodexLaunch({
        appServerArgs: ["app-server", "--stdio"],
        bwrapPath: "/usr/bin/bwrap",
        codexPackageRoot: "/opt/host/codex-package",
        stagedCodexHome: "/tmp/counterlab-codex-broker-test",
        workspace: "generated/session_test",
      }),
    ).toThrowError(/absolute/i);
  });

  it("prepares a launch only after secure host prerequisites pass", async () => {
    const fixture = createAuthFixture();
    const bwrapPath = join(fixture.root, "bwrap");
    const codexPackageRoot = join(fixture.root, "codex-package");
    const workspace = join(fixture.root, "workspace");
    const ptraceScopePath = join(fixture.root, "ptrace_scope");
    mkdirSync(join(codexPackageRoot, "bin"), { recursive: true });
    mkdirSync(workspace);
    writeFileSync(bwrapPath, "#!/bin/sh\n", { mode: 0o700 });
    writeFileSync(join(codexPackageRoot, "bin", "codex.js"), "// fixture\n", {
      mode: 0o700,
    });
    writeNativeCodexFixture(codexPackageRoot);
    writeFileSync(ptraceScopePath, "1\n");

    try {
      const boundary = new BubblewrapCodexLaunchBoundary({
        authFilePath: fixture.authFile,
        bwrapPath,
        codexPackageRoot,
        ptraceScopePath,
      });
      await expect(boundary.health()).resolves.toEqual({ available: true });

      const launch = await boundary.prepare({
        command: "codex",
        args: ["app-server", "--stdio"],
        environment: { PATH: "/usr/bin" },
        hostCwd: workspace,
      });
      try {
        expect(launch.command).toBe(bwrapPath);
        expect(launch.environment.CODEX_ACCESS_TOKEN).toBeUndefined();
        expect(launch.args.join(" ")).not.toContain(
          "refresh-must-never-cross-boundary",
        );
        await launch.revokeCredentials?.();
      } finally {
        await launch.dispose?.();
      }
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("reports unavailable when child-to-parent ptrace protection is disabled", async () => {
    const fixture = createAuthFixture();
    const bwrapPath = join(fixture.root, "bwrap");
    const codexPackageRoot = join(fixture.root, "codex-package");
    const ptraceScopePath = join(fixture.root, "ptrace_scope");
    mkdirSync(join(codexPackageRoot, "bin"), { recursive: true });
    writeFileSync(bwrapPath, "#!/bin/sh\n", { mode: 0o700 });
    writeFileSync(join(codexPackageRoot, "bin", "codex.js"), "// fixture\n");
    writeNativeCodexFixture(codexPackageRoot);
    writeFileSync(ptraceScopePath, "0\n");

    try {
      const boundary = new BubblewrapCodexLaunchBoundary({
        authFilePath: fixture.authFile,
        bwrapPath,
        codexPackageRoot,
        ptraceScopePath,
      });
      await expect(boundary.health()).resolves.toMatchObject({
        available: false,
        reason: expect.stringMatching(/ptrace/i),
      });
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it.runIf(existsSync("/usr/bin/bwrap"))(
    "proves a command cannot inherit the token or inspect the parent environment",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "counterlab-credential-probe-"));
      const workspace = join(root, "workspace");
      const hidden = join(root, "hidden-verifier");
      mkdirSync(workspace);
      mkdirSync(hidden);
      writeFileSync(join(workspace, "approved.txt"), "approved\n");
      writeFileSync(join(hidden, "secret.json"), "hidden\n");

      try {
        const result = await probeBubblewrapCredentialIsolation({
          accessToken: "pat-counterlab-test-only",
          bwrapPath: "/usr/bin/bwrap",
          hiddenPaths: [root, hidden, process.cwd()],
          workspace,
        });
        expect(result).toEqual({
          credentialEnvironmentHidden: true,
          hiddenPathsMissing: true,
          parentEnvironmentHidden: true,
          workspaceEntryVisible: true,
        });
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("discovers the installed package without mounting personal Codex state", async () => {
    const fixture = createAuthFixture();
    const binDirectory = join(fixture.root, "bin");
    const codexPackageRoot = join(fixture.root, "lib", "codex");
    const commandPath = join(binDirectory, "codex");
    const bwrapPath = join(binDirectory, "bwrap");
    const ptraceScopePath = join(fixture.root, "ptrace_scope");
    mkdirSync(binDirectory, { recursive: true });
    mkdirSync(join(codexPackageRoot, "bin"), { recursive: true });
    writeFileSync(join(codexPackageRoot, "bin", "codex.js"), "// fixture\n", {
      mode: 0o700,
    });
    writeNativeCodexFixture(codexPackageRoot);
    symlinkSync(join(codexPackageRoot, "bin", "codex.js"), commandPath);
    writeFileSync(bwrapPath, "#!/bin/sh\n", { mode: 0o700 });
    writeFileSync(ptraceScopePath, "1\n");

    try {
      const boundary = await createDefaultBubblewrapCodexLaunchBoundary({
        authFilePath: fixture.authFile,
        bwrapPath,
        command: "codex",
        environment: { PATH: binDirectory },
        ptraceScopePath,
      });
      await expect(boundary.health()).resolves.toEqual({ available: true });
      expect(boundary.hostMounts()).toEqual([
        "/usr",
        "/etc/ca-certificates",
        "/etc/hosts",
        "/etc/nsswitch.conf",
        "/etc/resolv.conf",
        "/etc/ssl",
        codexPackageRoot,
      ]);
      expect(boundary.hostMounts()).not.toContain(fixture.root);
      expect(boundary.hostMounts()).not.toContain(fixture.authFile);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
