import { describe, expect, it } from "vitest";

import { runProofCapsuleCli, type ProofCapsuleCliIO } from "./node-cli.js";

function cliHarness(bytes = new TextEncoder().encode("not a capsule")) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let reads = 0;
  const io: ProofCapsuleCliIO = {
    readBytes: () => {
      reads += 1;
      return Promise.resolve(bytes);
    },
    stdout: (value) => stdout.push(value),
    stderr: (value) => stderr.push(value),
    env: {},
  };
  return { io, stdout, stderr, reads: () => reads };
}

describe("Proof Capsule node CLI", () => {
  it("rejects incomplete and unknown commands without reading a file", async () => {
    for (const args of [
      [],
      ["validate"],
      ["unknown", "proof.counterlab"],
      ["validate", "--unknown", "proof.counterlab"],
      ["validate", "--require-signed", "--require-signed", "proof.counterlab"],
    ]) {
      const harness = cliHarness();
      await expect(runProofCapsuleCli(args, harness.io)).resolves.toBe(2);
      expect(harness.reads()).toBe(0);
      expect(harness.stdout).toEqual([]);
      expect(harness.stderr.join("")).toContain("Usage:");
    }
  });

  it("fails closed without echoing unreadable paths or stack traces", async () => {
    const stderr: string[] = [];
    const io: ProofCapsuleCliIO = {
      readBytes: () => Promise.reject(new Error("/private/secret/path")),
      stdout: () => undefined,
      stderr: (value) => stderr.push(value),
      env: {},
    };
    await expect(
      runProofCapsuleCli(["validate", "/private/secret/path"], io),
    ).resolves.toBe(1);
    expect(stderr.join("")).toBe("Unable to read the Proof Capsule file.\n");
  });

  it("does not mistake structurally invalid bytes for evidence", async () => {
    for (const command of ["validate", "inspect", "replay"] as const) {
      const harness = cliHarness();
      await expect(
        runProofCapsuleCli([command, "invalid.counterlab"], harness.io),
      ).resolves.toBe(1);
      expect(harness.stdout).toEqual([]);
      expect(harness.stderr.join("")).not.toContain('valid":true');
    }
  });
});
