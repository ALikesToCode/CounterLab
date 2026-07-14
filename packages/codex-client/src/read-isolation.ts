import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import { CompilerSetupError } from "./types.js";

const execFileAsync = promisify(execFile);
const DEFAULT_BWRAP = "/usr/bin/bwrap";
const PROBE_SCRIPT = String.raw`
set -euo pipefail
expected_entry="$1"
shift
test -f "/workspace/$expected_entry"
for hidden_path in "$@"; do
  if [[ -e "$hidden_path" || -L "$hidden_path" ]]; then
    exit 42
  fi
done
printf '{"hiddenPathsMissing":true,"workspaceEntryVisible":true}\n'
`;

export type BubblewrapReadIsolationProbeOptions = {
  workspace: string;
  hiddenPaths: string[];
  expectedWorkspaceEntry?: string;
  bwrapPath?: string;
};

export type BubblewrapProbeInvocation = {
  command: string;
  args: string[];
  mountedHostPaths: string[];
};

export type BubblewrapReadIsolationProbeResult = {
  hiddenPathsMissing: true;
  workspaceEntryVisible: true;
};

function requireAbsolute(label: string, value: string): void {
  if (!isAbsolute(value) || value.includes("\0")) {
    throw new CompilerSetupError(
      "CODEX_ISOLATION_UNAVAILABLE",
      `${label} must be an absolute path for the Bubblewrap isolation probe.`,
    );
  }
}

export function buildBubblewrapReadIsolationProbe(
  options: BubblewrapReadIsolationProbeOptions,
): BubblewrapProbeInvocation {
  const bwrapPath = options.bwrapPath ?? DEFAULT_BWRAP;
  const expectedWorkspaceEntry =
    options.expectedWorkspaceEntry ?? "approved.txt";
  requireAbsolute("Bubblewrap executable", bwrapPath);
  requireAbsolute("Generation workspace", options.workspace);
  if (
    !/^[A-Za-z0-9_.-]+$/.test(expectedWorkspaceEntry) ||
    expectedWorkspaceEntry === "." ||
    expectedWorkspaceEntry === ".."
  ) {
    throw new CompilerSetupError(
      "CODEX_ISOLATION_UNAVAILABLE",
      "The isolation probe workspace marker must be a single safe file name.",
    );
  }
  if (options.hiddenPaths.length === 0) {
    throw new CompilerSetupError(
      "CODEX_ISOLATION_UNAVAILABLE",
      "The isolation probe requires at least one hidden host path.",
    );
  }
  for (const hiddenPath of options.hiddenPaths) {
    requireAbsolute("Hidden host path", hiddenPath);
  }

  return {
    command: bwrapPath,
    mountedHostPaths: ["/usr", options.workspace],
    args: [
      "--die-with-parent",
      "--new-session",
      "--unshare-all",
      "--clearenv",
      "--ro-bind",
      "/usr",
      "/usr",
      "--symlink",
      "usr/bin",
      "/bin",
      "--symlink",
      "usr/lib",
      "/lib",
      "--symlink",
      "usr/lib",
      "/lib64",
      "--proc",
      "/proc",
      "--dev",
      "/dev",
      "--tmpfs",
      "/tmp",
      "--dir",
      "/workspace",
      "--bind",
      options.workspace,
      "/workspace",
      "--setenv",
      "HOME",
      "/nonexistent",
      "--setenv",
      "PATH",
      "/usr/bin",
      "--setenv",
      "TMPDIR",
      "/tmp",
      "--chdir",
      "/workspace",
      "/usr/bin/bash",
      "--noprofile",
      "--norc",
      "-c",
      PROBE_SCRIPT,
      "counterlab-isolation-probe",
      expectedWorkspaceEntry,
      ...options.hiddenPaths,
    ],
  };
}

export async function probeBubblewrapReadIsolation(
  options: BubblewrapReadIsolationProbeOptions,
): Promise<BubblewrapReadIsolationProbeResult> {
  const invocation = buildBubblewrapReadIsolationProbe(options);
  try {
    const { stdout } = await execFileAsync(
      invocation.command,
      invocation.args,
      {
        env: {},
        timeout: 5_000,
        maxBuffer: 4_096,
      },
    );
    const value = JSON.parse(stdout) as unknown;
    if (
      typeof value !== "object" ||
      value === null ||
      !("hiddenPathsMissing" in value) ||
      value.hiddenPathsMissing !== true ||
      !("workspaceEntryVisible" in value) ||
      value.workspaceEntryVisible !== true
    ) {
      throw new Error("Unexpected Bubblewrap isolation probe response.");
    }
    return {
      hiddenPathsMissing: true,
      workspaceEntryVisible: true,
    };
  } catch (error) {
    throw new CompilerSetupError(
      "CODEX_ISOLATION_UNAVAILABLE",
      "Bubblewrap could not prove that the generation workspace is isolated from hidden host paths.",
      { cause: error },
    );
  }
}
