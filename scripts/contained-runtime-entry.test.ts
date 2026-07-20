import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const adapter = resolve(root, "scripts/contained-runtime-adapter.sh");
const client = resolve(root, "scripts/contained-runtime-client.mjs");
const timeoutDriver = resolve(
  root,
  "scripts/verify-contained-runtime-timeout.py",
);
const python = resolve(root, ".venv/bin/python");
const marker = resolve(root, "COUNTERLAB_REPO_ROOT");
const cleanPath = "/usr/bin:/bin";

function runAdapter(
  args: string[],
  extraEnvironment: Record<string, string> = {},
) {
  return spawnSync(adapter, args, {
    cwd: root,
    encoding: "utf8",
    env: { PATH: cleanPath, ...extraEnvironment },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
}

function runClient(
  args: string[],
  extraEnvironment: Record<string, string> = {},
) {
  return spawnSync(process.execPath, [client, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: cleanPath, ...extraEnvironment },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
}

describe("contained runtime entry isolation", () => {
  it("requires an explicit session identity and ignores the legacy environment identity", () => {
    const result = runAdapter(["--", "version"], {
      COUNTERLAB_RUNTIME_SESSION_ID: "rt-entry123",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      "Usage: contained-runtime-adapter --session-id ID",
    );
  });

  it("rejects an invalid identity before any runtime connection and ignores BASH_ENV", () => {
    const result = runAdapter(
      ["--session-id", "../../outside", "--", "version"],
      { BASH_ENV: marker },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("contained runtime session ID is invalid");
    expect(result.stderr).not.toContain(
      "CounterLab repository root safety marker",
    );
  });

  it("starts through an empty environment and supplies only fixed runtime values", () => {
    const source = readFileSync(adapter, "utf8");

    expect(
      source.startsWith(
        "#!/usr/bin/env -S -i PATH=/usr/bin:/bin /bin/bash -p\n",
      ),
    ).toBe(true);
    expect(source).toContain("/usr/bin/env -i");
    expect(source).not.toContain("COUNTERLAB_RUNTIME_SESSION_ID:-");
    expect(source).not.toContain("export HOME=");
  });

  it("makes the client consume session and receipt identities only from arguments", () => {
    const legacyOnly = runClient(
      ["--session-id", "rt-entry123", "--", "version"],
      {
        COUNTERLAB_RUNTIME_CONTROL_RECEIPT: "/outside/legacy.json",
      },
    );
    expect(legacyOnly.status).not.toBe(0);
    expect(legacyOnly.stderr).not.toContain(
      "contained runtime control receipt output is invalid",
    );

    const explicitInvalid = runClient([
      "--session-id",
      "rt-entry123",
      "--control-receipt",
      "/outside/explicit.json",
      "--",
      "run",
    ]);
    expect(explicitInvalid.status).not.toBe(0);
    expect(explicitInvalid.stderr).toContain(
      "contained runtime control receipt output is invalid",
    );
  });
});

describe("timeout proof Python bootstrap", () => {
  const requiredArguments = [
    timeoutDriver,
    "--root",
    root,
    "--session-id",
    "rt-entry123",
    "--build-receipt",
    marker,
    "--output",
    resolve(root, "node_modules/.cache/counterlab-v6.1/entry-test-output.json"),
  ];

  it.each(["PYTHONPATH", "PYTHONHOME"])(
    "rejects %s before importing repository modules",
    (name) => {
      const result = spawnSync(python, ["-I", ...requiredArguments], {
        cwd: root,
        encoding: "utf8",
        env: { PATH: cleanPath, [name]: resolve(root, "scripts") },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`${name} must be unset`);
      expect(result.stderr).not.toContain("counterlab_runner");
    },
  );

  it("requires isolated mode so user-site modules cannot shadow the proof", () => {
    const result = spawnSync(python, requiredArguments, {
      cwd: root,
      encoding: "utf8",
      env: { PATH: cleanPath },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Python isolated mode is required");
    expect(result.stderr).not.toContain("counterlab_runner");
  });
});
