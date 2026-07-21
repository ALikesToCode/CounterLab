import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalRuntimeJson,
  createPublicContainedRuntimeAttestation,
  createRuntimeToolchainFingerprint,
  sha256RuntimeBytes,
} from "./contained-runtime-attestation.mjs";
import { resolveContainedCgroupObserverBindings } from "./contained-cgroup-observer-bindings.mjs";

const root = process.cwd();

function fixture() {
  const runtimeSessionId = `rt-bind-${randomBytes(4).toString("hex")}`;
  const sessionRoot = resolve(root, ".rt", runtimeSessionId);
  mkdirSync(resolve(sessionRoot, "config"), {
    recursive: true,
    mode: 0o700,
  });
  writeFileSync(resolve(sessionRoot, "config/containerd.toml"), "version=3\n", {
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(
    resolve(sessionRoot, "config/buildkitd.toml"),
    "debug=false\n",
    {
      flag: "wx",
      mode: 0o600,
    },
  );
  const material = createRuntimeToolchainFingerprint({
    root,
    adapterPath: resolve(root, "scripts/contained-runtime-adapter.sh"),
    containerdConfigPath: resolve(sessionRoot, "config/containerd.toml"),
    buildkitConfigPath: resolve(sessionRoot, "config/buildkitd.toml"),
  });
  const sessionPrefix = `.rt/${runtimeSessionId}`;
  const attestation = {
    schemaVersion: "3",
    status: "READY",
    sessionId: runtimeSessionId,
    namespace: "counterlab-v6.1",
    runtimeToolchainSha256: material.runtimeToolchainSha256,
    toolchainLockSha256: material.toolchainLockSha256,
    adapterSha256: material.adapterSha256,
    helperSha256: material.helperSha256,
    runtimePolicySha256: material.runtimePolicySha256,
    proofDependencyManifest: material.proofDependencyManifest,
    proofDependencyManifestSha256: material.proofDependencyManifestSha256,
    createdAt: new Date().toISOString(),
    paths: {
      sessionRoot: sessionPrefix,
      containerdRootlesskitApiSocket: `${sessionPrefix}/run/containerd-rootless/api.sock`,
      containerdSocket: `${sessionPrefix}/run/containerd.sock`,
      runtimeCommandSocket: `${sessionPrefix}/run/runtime-command.sock`,
      buildkitSocket: `${sessionPrefix}/run/buildkitd.sock`,
    },
    pids: {},
    fileSha256: {
      ...material.fileSha256,
      supervisorReady: "f".repeat(64),
    },
  };
  writeFileSync(
    resolve(sessionRoot, "attestation.json"),
    `${JSON.stringify(attestation)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  return { attestation, material, runtimeSessionId, sessionRoot };
}

describe("contained cgroup observer bindings", () => {
  it("derives proof-driver and public-attestation hashes from exact live bytes", () => {
    const input = fixture();
    const componentSha256 = Object.fromEntries(
      Object.entries(input.material.lock.components).map(
        ([name, component]) => [name, component.sha256],
      ),
    );
    const publicAttestation = createPublicContainedRuntimeAttestation({
      attestation: input.attestation,
      componentSha256,
    });

    expect(
      resolveContainedCgroupObserverBindings({
        sessionRoot: input.sessionRoot,
      }),
    ).toEqual({
      driverCliSha256: sha256RuntimeBytes(
        readFileSync(
          resolve(root, "scripts/verify-contained-runtime-timeout.py"),
        ),
      ),
      driverModuleSha256: sha256RuntimeBytes(
        readFileSync(
          resolve(
            root,
            "services/runner/src/counterlab_runner/timeout_proof.py",
          ),
        ),
      ),
      runtimeAttestationSha256: sha256RuntimeBytes(
        canonicalRuntimeJson(publicAttestation),
      ),
      runtimeSessionId: input.runtimeSessionId,
    });
  });

  it("rejects a noncanonical session root and stale helper attestation", () => {
    const wrongRoot = fixture();
    expect(() =>
      resolveContainedCgroupObserverBindings({
        sessionRoot: resolve(wrongRoot.sessionRoot, "config"),
      }),
    ).toThrow(/session/u);

    const stale = fixture();
    stale.attestation.helperSha256 = {
      ...stale.attestation.helperSha256,
      runtimeRun: "0".repeat(64),
    };
    writeFileSync(
      resolve(stale.sessionRoot, "attestation.json"),
      `${JSON.stringify(stale.attestation)}\n`,
      { mode: 0o600 },
    );
    expect(() =>
      resolveContainedCgroupObserverBindings({
        sessionRoot: stale.sessionRoot,
      }),
    ).toThrow(/attestation binding/u);
  });
});
