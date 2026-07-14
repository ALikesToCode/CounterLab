import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildBubblewrapReadIsolationProbe,
  probeBubblewrapReadIsolation,
} from "./read-isolation.js";

describe("Bubblewrap generation read-isolation probe", () => {
  it("constructs a new root without binding the repository or hidden evidence", () => {
    const invocation = buildBubblewrapReadIsolationProbe({
      workspace: "/tmp/counterlab/generated/session_test",
      hiddenPaths: [
        "/srv/counterlab/repository",
        "/srv/counterlab/held-out",
        "/srv/counterlab/verifier",
      ],
    });

    expect(invocation.command).toBe("/usr/bin/bwrap");
    expect(invocation.args).toContain("--unshare-all");
    expect(invocation.args).toContain("--clearenv");
    expect(invocation.args).toContain("/workspace");
    expect(invocation.args).not.toContain("/");
    expect(invocation.mountedHostPaths).toEqual([
      "/usr",
      "/tmp/counterlab/generated/session_test",
    ]);
    expect(invocation.mountedHostPaths).not.toContain(
      "/srv/counterlab/repository",
    );
    expect(invocation.mountedHostPaths).not.toContain(
      "/srv/counterlab/held-out",
    );
    expect(invocation.mountedHostPaths).not.toContain(
      "/srv/counterlab/verifier",
    );
  });

  it.runIf(existsSync("/usr/bin/bwrap"))(
    "makes host repository and held-out paths resolve as ENOENT",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "counterlab-bwrap-probe-"));
      const workspace = join(root, "generation");
      const hidden = join(root, "hidden-verifier");
      mkdirSync(workspace);
      mkdirSync(hidden);
      writeFileSync(join(workspace, "approved.txt"), "approved\n");
      writeFileSync(join(hidden, "counterexample.json"), "secret\n");

      try {
        const result = await probeBubblewrapReadIsolation({
          workspace,
          hiddenPaths: [root, hidden, process.cwd()],
          expectedWorkspaceEntry: "approved.txt",
        });
        expect(result.hiddenPathsMissing).toBe(true);
        expect(result.workspaceEntryVisible).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
