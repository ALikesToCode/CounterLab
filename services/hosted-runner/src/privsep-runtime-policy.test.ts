// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  enforcePrivsepScratchPolicy,
  type PrivsepScratchPolicyOperations,
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

  it("reasserts the policy when the runtime mount is already hardened", async () => {
    const fs = operations([metadata(), metadata()]);

    await expect(enforcePrivsepScratchPolicy(fs)).resolves.toBeUndefined();

    expect(fs.changeOwner).toHaveBeenCalledExactlyOnceWith("/tmp", 0, 0);
    expect(fs.changeMode).toHaveBeenCalledExactlyOnceWith("/tmp", 0o555);
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
      metadata({ uid: 0, gid: 0, mode: 0o755 }),
    ]);

    await expect(enforcePrivsepScratchPolicy(fs)).rejects.toThrow(
      "scratch policy did not reach root:root 0555",
    );
  });
});
