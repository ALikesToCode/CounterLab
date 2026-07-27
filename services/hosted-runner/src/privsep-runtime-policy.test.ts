// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  enforcePrivsepScratchPolicy,
  enforcePrivsepStateRootPolicy,
  type PrivsepScratchPolicyOperations,
  type PrivsepStateRootPolicyOperations,
} from "./privsep-runtime-policy.js";

function metadata({
  directory = true,
  symlink = false,
  uid = 0,
  gid = 0,
  mode = 0o555,
}: {
  directory?: boolean;
  symlink?: boolean;
  uid?: number;
  gid?: number;
  mode?: number;
} = {}) {
  return {
    uid,
    gid,
    mode,
    isDirectory: () => directory,
    isSymbolicLink: () => symlink,
  };
}

function operations(
  observed: ReturnType<typeof metadata>[],
  calls: string[] = [],
) {
  const readMetadata = vi.fn(async () => {
    calls.push("read");
    const next = observed.shift();
    if (next === undefined) throw new Error("missing scratch metadata");
    return next;
  });
  const changeOwner = vi.fn(async () => {
    calls.push("owner");
  });
  const changeMode = vi.fn(async () => {
    calls.push("mode");
  });
  return {
    readMetadata,
    changeOwner,
    changeMode,
  } satisfies PrivsepScratchPolicyOperations;
}

function stateRootOperations(
  observed: ReturnType<typeof metadata>[],
  calls: string[] = [],
) {
  const base = operations(observed, calls);
  const createDirectory = vi.fn(async () => {
    calls.push("create");
  });
  return {
    ...base,
    createDirectory,
  } satisfies PrivsepStateRootPolicyOperations;
}

describe("privsep scratch policy", () => {
  it("repairs a writable runtime mount before the runner starts", async () => {
    const calls: string[] = [];
    const fs = operations(
      [metadata({ uid: 1000, gid: 1000, mode: 0o1777 }), metadata()],
      calls,
    );

    await expect(enforcePrivsepScratchPolicy(fs)).resolves.toBeUndefined();

    expect(calls).toEqual(["read", "owner", "mode", "read"]);
    expect(fs.changeOwner).toHaveBeenCalledExactlyOnceWith("/tmp", 0, 0);
    expect(fs.changeMode).toHaveBeenCalledExactlyOnceWith("/tmp", 0o555);
  });

  it("accepts an already hardened read-only runtime mount without mutation", async () => {
    const fs = operations([metadata()]);

    await expect(enforcePrivsepScratchPolicy(fs)).resolves.toBeUndefined();

    expect(fs.changeOwner).not.toHaveBeenCalled();
    expect(fs.changeMode).not.toHaveBeenCalled();
  });

  it("fails before changing a scratch root that is not a direct directory", async () => {
    const fs = operations([metadata({ symlink: true })]);

    await expect(enforcePrivsepScratchPolicy(fs)).rejects.toThrow(
      "scratch root must be a direct directory",
    );
    expect(fs.changeOwner).not.toHaveBeenCalled();
    expect(fs.changeMode).not.toHaveBeenCalled();
  });

  it("propagates a runtime refusal instead of starting with a weaker policy", async () => {
    const fs = operations([metadata({ mode: 0o1777 })]);
    fs.changeMode.mockRejectedValueOnce(new Error("operation not permitted"));

    await expect(enforcePrivsepScratchPolicy(fs)).rejects.toThrow(
      "operation not permitted",
    );
    expect(fs.readMetadata).toHaveBeenCalledOnce();
  });

  it("fails closed when the runtime does not preserve the enforced policy", async () => {
    const fs = operations([
      metadata({ uid: 1000, gid: 1000, mode: 0o1777 }),
      metadata({ uid: 0, gid: 0, mode: 0o1555 }),
    ]);

    await expect(enforcePrivsepScratchPolicy(fs)).rejects.toThrow(
      "scratch policy did not reach root:root 0555",
    );
  });
});

describe("privsep state-root policy", () => {
  it("repairs a fresh runtime mount before credential staging", async () => {
    const calls: string[] = [];
    const fs = stateRootOperations(
      [
        metadata({ uid: 0, gid: 0, mode: 0o710 }),
        metadata({ uid: 0, gid: 10_002, mode: 0o710 }),
      ],
      calls,
    );

    await expect(enforcePrivsepStateRootPolicy(fs)).resolves.toBeUndefined();

    expect(calls).toEqual(["create", "read", "owner", "mode", "read"]);
    expect(fs.createDirectory).toHaveBeenCalledExactlyOnceWith(
      "/run/counterlab-codex",
      0o710,
    );
    expect(fs.changeOwner).toHaveBeenCalledExactlyOnceWith(
      "/run/counterlab-codex",
      0,
      10_002,
    );
    expect(fs.changeMode).toHaveBeenCalledExactlyOnceWith(
      "/run/counterlab-codex",
      0o710,
    );
  });

  it("accepts an existing generator-traversable state root", async () => {
    const fs = stateRootOperations([
      metadata({ uid: 0, gid: 10_002, mode: 0o710 }),
    ]);

    await expect(enforcePrivsepStateRootPolicy(fs)).resolves.toBeUndefined();

    expect(fs.createDirectory).toHaveBeenCalledOnce();
    expect(fs.changeOwner).not.toHaveBeenCalled();
    expect(fs.changeMode).not.toHaveBeenCalled();
  });

  it("fails before changing a state root that is not a direct directory", async () => {
    const fs = stateRootOperations([metadata({ symlink: true })]);

    await expect(enforcePrivsepStateRootPolicy(fs)).rejects.toThrow(
      "state root must be a direct directory",
    );
    expect(fs.changeOwner).not.toHaveBeenCalled();
    expect(fs.changeMode).not.toHaveBeenCalled();
  });

  it("fails closed when the runtime does not preserve the state-root policy", async () => {
    const fs = stateRootOperations([
      metadata({ uid: 0, gid: 0, mode: 0o710 }),
      metadata({ uid: 0, gid: 0, mode: 0o710 }),
    ]);

    await expect(enforcePrivsepStateRootPolicy(fs)).rejects.toThrow(
      "state root policy did not reach root:counterlab-generator 0710",
    );
  });
});
