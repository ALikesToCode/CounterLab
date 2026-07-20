import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ContainedRuntimeAttestationSchema } from "../packages/scientific-engine-registry/src/index";
import {
  RUNTIME_POLICY_PATH,
  containedRuntimeAdapterArguments,
  createPublicContainedRuntimeAttestation,
  createRuntimeProofDependencyManifest,
  requireContainedRuntimeSessionId,
} from "./contained-runtime-attestation.mjs";

const root = process.cwd();

function fixtureRoot(): string {
  const fixture = mkdtempSync(
    resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/tmp/runtime-attestation-test-",
    ),
  );
  mkdirSync(resolve(fixture, "services/runner/src/counterlab_runner"), {
    recursive: true,
  });
  mkdirSync(resolve(fixture, "scripts"), { recursive: true });
  writeFileSync(
    resolve(fixture, RUNTIME_POLICY_PATH),
    '{"candidateWallSeconds":5}\n',
  );
  writeFileSync(
    resolve(fixture, "services/runner/src/counterlab_runner/__init__.py"),
    "# bounded package\n",
  );
  writeFileSync(
    resolve(fixture, "services/runner/src/counterlab_runner/docker.py"),
    "LIMIT = 1\n",
  );
  writeFileSync(
    resolve(fixture, "scripts/verify-contained-runtime-timeout.py"),
    "raise SystemExit(0)\n",
  );
  return fixture;
}

describe("contained runtime proof dependency attestation", () => {
  it("projects internal supervisor readiness into the strict public v2 shape", () => {
    const sessionId = "rt-v61-test1";
    const hash = "a".repeat(64);
    const componentSha256 = Object.fromEntries(
      [
        "buildctl",
        "buildkitd",
        "containerd",
        "containerd-shim-runc-v2",
        "ctr",
        "nerdctl",
        "rootlesskit",
        "runc",
      ].map((name) => [name, hash]),
    );
    const projected = createPublicContainedRuntimeAttestation({
      attestation: {
        sessionId,
        namespace: "counterlab-v6.1",
        runtimeToolchainSha256: hash,
        toolchainLockSha256: hash,
        adapterSha256: hash,
        runtimePolicySha256: hash,
        proofDependencyManifestSha256: hash,
        fileSha256: {
          containerdConfig: hash,
          buildkitConfig: hash,
          supervisorReady: hash,
        },
        paths: {
          containerdRootlesskitApiSocket: `.rt/${sessionId}/run/containerd-rootless/api.sock`,
          containerdSocket: `.rt/${sessionId}/run/containerd.sock`,
          runtimeCommandSocket: `.rt/${sessionId}/run/runtime-command.sock`,
          buildkitSocket: `.rt/${sessionId}/run/buildkitd.sock`,
        },
      },
      componentSha256,
    });

    const parsed = ContainedRuntimeAttestationSchema.parse(projected);
    expect(parsed.fileSha256).toEqual({
      containerdConfig: hash,
      buildkitConfig: hash,
    });
    expect(parsed.fileSha256).not.toHaveProperty("supervisorReady");
  });

  it("makes the source-bound build consume only attestation v2 proof bindings", () => {
    const buildSource = readFileSync(
      resolve(root, "scripts/build-source-bound-runner.sh"),
      "utf8",
    );

    expect(buildSource).toContain('value.schemaVersion !== "2"');
    expect(buildSource).toContain('"runtimePolicySha256"');
    expect(buildSource).toContain('"proofDependencyManifestSha256"');
    expect(buildSource).not.toContain('value.schemaVersion !== "1"');
  });

  it("constructs the explicit adapter identity prefix", () => {
    expect(requireContainedRuntimeSessionId("rt-v61-test1")).toBe(
      "rt-v61-test1",
    );
    expect(
      containedRuntimeAdapterArguments("rt-v61-test1", ["counterlab-attest"]),
    ).toEqual(["--session-id", "rt-v61-test1", "--", "counterlab-attest"]);
    expect(() => requireContainedRuntimeSessionId("bad")).toThrow(/identity/u);
  });

  it("binds the complete Python source package, proof CLI, and runtime policy", () => {
    const result = createRuntimeProofDependencyManifest(root);
    const paths = result.manifest.files.map((entry) => entry.path);

    expect(paths).toContain(RUNTIME_POLICY_PATH);
    expect(paths).toContain("services/runner/src/counterlab_runner/docker.py");
    expect(paths).toContain(
      "services/runner/src/counterlab_runner/workspace.py",
    );
    expect(paths).toContain("scripts/verify-contained-runtime-timeout.py");
    expect(result.runtimePolicySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("changes the manifest when policy or imported proof code changes", () => {
    const fixture = fixtureRoot();
    const initial = createRuntimeProofDependencyManifest(fixture);
    writeFileSync(
      resolve(fixture, RUNTIME_POLICY_PATH),
      '{"candidateWallSeconds":6}\n',
    );
    const policyChanged = createRuntimeProofDependencyManifest(fixture);
    expect(policyChanged.runtimePolicySha256).not.toBe(
      initial.runtimePolicySha256,
    );
    expect(policyChanged.manifestSha256).not.toBe(initial.manifestSha256);

    writeFileSync(
      resolve(fixture, "services/runner/src/counterlab_runner/docker.py"),
      "LIMIT = 2\n",
    );
    const codeChanged = createRuntimeProofDependencyManifest(fixture);
    expect(codeChanged.manifestSha256).not.toBe(policyChanged.manifestSha256);
  });
});
