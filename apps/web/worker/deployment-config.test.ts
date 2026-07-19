import { readFileSync } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { qualifiedDeployConfig } from "../../../scripts/prepare-qualified-deploy";

function productionDeployConfig() {
  return {
    name: "counterlab",
    account_id: "account-1",
    main: "index.js",
    compatibility_date: "2026-07-14",
    compatibility_flags: ["nodejs_compat"],
    assets: {
      directory: "../client",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*", "/ready"],
    },
    version_metadata: { binding: "CF_VERSION_METADATA" },
    vars: {
      OPENAI_MODEL: "gpt-5.6",
      OPENAI_REASONING_EFFORT: "medium",
      OPENAI_TIMEOUT_MS: "180000",
      COUNTERLAB_MAX_NOTEBOOK_BYTES: "10485760",
      COUNTERLAB_SIGNING_KEY_ID: "counterlab-boundary-v1",
      COUNTERLAB_MAINTENANCE_MODE: "false",
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: "counterlab",
        database_id: "64caa8fc-b9b6-4393-81fa-d856ff774a36",
        migrations_dir: "../../migrations",
      },
    ],
    r2_buckets: [{ binding: "ARTIFACTS", bucket_name: "counterlab-artifacts" }],
    durable_objects: {
      bindings: [
        { name: "RUNNER", class_name: "CounterLabRunner" },
        { name: "ADMISSION", class_name: "CounterLabAdmission" },
      ],
    },
    migrations: [
      { tag: "v1", new_sqlite_classes: ["CounterLabRunner"] },
      { tag: "v2", new_sqlite_classes: ["CounterLabAdmission"] },
    ],
    containers: [
      {
        class_name: "CounterLabRunner",
        image: "/unqualified/Dockerfile.runner",
        image_vars: { COUNTERLAB_SOURCE_COMMIT: "0".repeat(40) },
        image_build_context: "/unqualified",
        max_instances: 10,
        instance_type: "basic",
        name: "counterlab-counterlabrunner",
        wrangler_ssh: { enabled: false },
      },
    ],
    observability: { enabled: true },
  };
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Cloudflare static asset routing", () => {
  it("runs API and public readiness paths through the Worker before serving the SPA", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf-8"),
    ) as {
      assets?: {
        directory?: string;
        not_found_handling?: string;
        run_worker_first?: string[];
      };
      version_metadata?: { binding?: string };
    };

    expect(config.assets).toEqual(
      expect.objectContaining({
        directory: "./dist/client",
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*", "/ready"],
      }),
    );
    expect(config.version_metadata).toEqual({
      binding: "CF_VERSION_METADATA",
    });
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.deploy).toBe(
      "bash ../../scripts/deploy-qualified.sh",
    );
  });

  it("keeps the development Container honest instead of stamping it as qualified", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf-8"),
    ) as {
      containers?: Array<{
        image?: string;
        image_vars?: { COUNTERLAB_SOURCE_COMMIT?: string };
      }>;
    };

    expect(config.containers).toHaveLength(1);
    expect(config.containers?.[0]?.image).toBe("../../Dockerfile.runner");
    expect(config.containers?.[0]?.image_vars).toBeUndefined();
  });

  it("revalidates the exact scientific runner before building a release", () => {
    const script = readFileSync(
      resolve(process.cwd(), "../../scripts/deploy-qualified.sh"),
      "utf8",
    );
    const verifyIndex = script.indexOf("verify-scientific-engines.sh");
    const buildIndex = script.indexOf(
      '"${PNPM}" --filter @counterlab/web build',
    );

    expect(verifyIndex).toBeGreaterThan(0);
    expect(buildIndex).toBeGreaterThan(verifyIndex);
  });

  it("gates deployment on immutable authority, migrations, secrets, and 100 percent traffic", () => {
    const script = readFileSync(
      resolve(process.cwd(), "../../scripts/deploy-qualified.sh"),
      "utf8",
    );
    const receiptVerifier = readFileSync(
      resolve(process.cwd(), "../../scripts/create-deployment-receipt.ts"),
      "utf8",
    );

    expect(script).toContain("git status --porcelain=v1 --untracked-files=all");
    expect(script).toContain("COUNTERLAB_ADMISSION_KEY");
    expect(script).toContain("d1 migrations apply DB");
    expect(script).toContain("existing_replay_count");
    expect(script.match(/query_legacy_replay_count/gu)).toHaveLength(3);
    expect(script).toContain('rollback "${PREVIOUS_VERSION_ID}"');
    expect(script).toContain("recover_previous_worker");
    expect(script).toContain(
      "Automatic Worker rollback was intentionally skipped",
    );
    expect(script).toContain("Prior Container evidence");
    expect(script).toContain("--remote");
    expect(script).toContain("--containers-rollout immediate");
    expect(script).toContain("deployments status");
    expect(script).toContain("scripts/create-deployment-receipt.ts");
    expect(receiptVerifier).toContain("active.percentage !== 100");
    expect(script).toContain("deployment-receipt.json");
    expect(script).not.toContain("--containers-rollout gradual");

    const maintenanceDeploy = script.indexOf("MAINTENANCE_TAG=");
    const maintenanceObserved = script.lastIndexOf(
      "\nwait_for_maintenance_health\n",
    );
    const postFreezeReplay = script.indexOf("POST_FREEZE_REPLAY_PREFLIGHT=");
    const migrations = script.indexOf('"${WRANGLER}" d1 migrations apply DB');
    const containerRollout = script.indexOf("CONTAINER_ROLLOUT_STARTED=1");
    const finalDeploy = script.indexOf("WORKER_TAG=");
    const finalReadiness = script.lastIndexOf("\nwait_for_final_readiness\n");
    const receipt = script.indexOf(
      "node --import tsx scripts/create-deployment-receipt.ts",
    );
    expect(maintenanceObserved).toBeGreaterThan(maintenanceDeploy);
    expect(postFreezeReplay).toBeGreaterThan(maintenanceObserved);
    expect(migrations).toBeGreaterThan(postFreezeReplay);
    expect(containerRollout).toBeGreaterThan(migrations);
    expect(finalDeploy).toBeGreaterThan(containerRollout);
    expect(finalReadiness).toBeGreaterThan(finalDeploy);
    expect(receipt).toBeGreaterThan(finalReadiness);
    expect(script.slice(finalDeploy, finalReadiness)).toContain(
      "--containers-rollout none",
    );
  });

  it("builds a source-bound runner only from an exact Git archive", () => {
    const path = resolve(
      process.cwd(),
      "../../scripts/build-source-bound-runner.sh",
    );
    expect(existsSync(path)).toBe(true);
    const script = readFileSync(path, "utf8");

    expect(script).toContain("git archive --format=tar");
    expect(script).toContain("COUNTERLAB_SOURCE_COMMIT");
    expect(script).toContain("COUNTERLAB_SOURCE_TREE_SHA256");
    expect(script).toContain('"${ARCHIVE_ROOT}"');
    expect(script).toContain("COUNTERLAB_BUILDKIT_ADDR");
    expect(script).toContain("scripts/normalize_runner_oci.py");
    expect(script).toContain("localManifestDigest");
    expect(script).not.toContain("docker build");
    expect(script).toContain("node_modules/.cache/counterlab-v6.1");
    expect(script).not.toContain("mktemp");
    expect(script).not.toMatch(/\brm\s+-/);
  });

  it("preflights a new qualification receipt before registry promotion", () => {
    const script = readFileSync(
      resolve(process.cwd(), "../../scripts/qualify-runner-release.ts"),
      "utf8",
    );
    const outputPreflight = script.indexOf(
      "const output = await repositoryOutputPath(root, args.output);",
    );
    const registryPromotion = script.indexOf("await promoteImage({");

    expect(outputPreflight).toBeGreaterThan(-1);
    expect(registryPromotion).toBeGreaterThan(outputPreflight);
    expect(script).toContain(
      "qualification output already exists; refusing to replace it",
    );
    expect(script).toContain("assertCurrentGrypeReleaseEvidenceBinding");
    expect(script).toContain('flag: "wx"');
  });

  it("removes exact-image verification containers after bounded checks", () => {
    const script = readFileSync(
      resolve(process.cwd(), "../../scripts/verify-scientific-engines.sh"),
      "utf8",
    );

    expect(script).toContain(
      '"${DOCKER_BIN}" run --rm --name "${STARTUP_CONTAINER}"',
    );
    expect(script).toContain(
      '"${DOCKER_BIN}" run --rm --name "${RUNTIME_CONTAINER}"',
    );
    expect(script).toContain("Ephemeral verification containers removed:");
    expect(script).toContain(
      "Docker-compatible adapter must be contained inside the repository.",
    );
  });

  it("copies the complete hosted-runner workspace dependency closure", () => {
    const root = resolve(process.cwd(), "../..");
    const packageDirectories = readdirSync(resolve(root, "packages"), {
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory());
    const workspaces = new Map<
      string,
      { directory: string; dependencies: Record<string, string> }
    >();
    for (const entry of packageDirectories) {
      const directory = resolve(root, "packages", entry.name);
      if (!existsSync(resolve(directory, "package.json"))) continue;
      const manifest = JSON.parse(
        readFileSync(resolve(directory, "package.json"), "utf8"),
      ) as {
        name: string;
        dependencies?: Record<string, string>;
      };
      workspaces.set(manifest.name, {
        directory,
        dependencies: manifest.dependencies ?? {},
      });
    }
    const hostedRunner = JSON.parse(
      readFileSync(
        resolve(root, "services/hosted-runner/package.json"),
        "utf8",
      ),
    ) as { dependencies?: Record<string, string> };
    const queue = Object.entries(hostedRunner.dependencies ?? {})
      .filter(([, version]) => version.startsWith("workspace:"))
      .map(([name]) => name);
    const required = new Set<string>();
    while (queue.length > 0) {
      const name = queue.shift()!;
      if (required.has(name)) continue;
      required.add(name);
      const workspace = workspaces.get(name);
      expect(workspace, `workspace ${name}`).toBeDefined();
      for (const [dependency, version] of Object.entries(
        workspace?.dependencies ?? {},
      )) {
        if (version.startsWith("workspace:")) queue.push(dependency);
      }
    }

    const dockerfile = readFileSync(resolve(root, "Dockerfile.runner"), "utf8");
    for (const name of required) {
      const workspace = workspaces.get(name)!;
      const source = relative(root, workspace.directory);
      expect(
        dockerfile,
        `${name} must be present in the build context`,
      ).toMatch(
        new RegExp(
          `^COPY ${source.replaceAll("/", "\\/")} \\.\\/${source.replaceAll("/", "\\/")}$`,
          "m",
        ),
      );
    }
  });

  it("pins an absolute OCI entrypoint for Cloudflare Container startup", () => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), "../../Dockerfile.runner"),
      "utf8",
    );

    expect(dockerfile).toContain(
      'ENTRYPOINT ["/usr/local/bin/node", "/app/runner.mjs"]',
    );
    expect(dockerfile).not.toContain('CMD ["node", "/app/runner.mjs"]');
  });

  it("keeps immutable application files readable by the declared non-root user", () => {
    const dockerfile = readFileSync(
      resolve(process.cwd(), "../../Dockerfile.runner"),
      "utf8",
    );

    expect(dockerfile).toContain("chown -R root:root /app");
    expect(dockerfile).toContain("chmod -R a=rX /app");
    expect(dockerfile).toContain("chmod 555 /app/runner.mjs");
    expect(dockerfile).not.toContain(
      "chown -R counterlab-codex:counterlab-codex /app",
    );
    expect(dockerfile).toContain("USER 10001:10001");
  });

  it("executes the real image entrypoint as its declared user before qualification", () => {
    const verifier = readFileSync(
      resolve(process.cwd(), "../../scripts/verify-scientific-engines.sh"),
      "utf8",
    );
    const probeStart = verifier.indexOf(
      'STARTUP_PROBE_OUTPUT="$("${DOCKER_BIN}" run',
    );
    const probeEnd = verifier.indexOf("# The preceding probe", probeStart);
    const probe = verifier.slice(probeStart, probeEnd);

    expect(probeStart).toBeGreaterThan(-1);
    expect(probe).toContain("COUNTERLAB_RUNNER_STARTUP_PROBE=1");
    expect(probe).not.toContain("--user");
    expect(probe).not.toContain("--entrypoint");
    expect(probe).toContain('"${IMAGE}"');
  });

  it("generates a deploy config from a source-bound qualified image receipt", () => {
    const sourceCommit = "a".repeat(40);
    const evidenceCommit = "2".repeat(40);
    const image = `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`;
    const receipt = {
      schemaVersion: "3",
      status: "VERIFIED",
      sourceCommit,
      sourceArchiveSha256: "b".repeat(64),
      sourceTreeSha256: "c".repeat(64),
      dockerfileSha256: "d".repeat(64),
      localImageTag: `counterlab-runner:git-${sourceCommit}`,
      localImageDigest: `sha256:${"e".repeat(64)}`,
      ociRevision: sourceCommit,
      ociSourceTreeSha256: "c".repeat(64),
      engineAuthorityHash: "f".repeat(64),
      runtimeManifestHash: "1".repeat(64),
      runtimeToolchainSha256: "4".repeat(64),
      toolchainLockSha256: "5".repeat(64),
      runtimeAdapterSha256: "6".repeat(64),
      buildctlSha256: "7".repeat(64),
      buildkitdSha256: "8".repeat(64),
      buildkitConfigSha256: "9".repeat(64),
      adapterDockerfileSha256: "a".repeat(64),
      adapterImageTag: `counterlab-adapter:git-${sourceCommit}`,
      adapterImageDigest: `sha256:${"b".repeat(64)}`,
      adapterManifestDigest: `sha256:${"c".repeat(64)}`,
      adapterOciArchiveSha256: "d".repeat(64),
      adapterOciRevision: sourceCommit,
      adapterOciSourceTreeSha256: "c".repeat(64),
      evidenceCommit,
      registryImage: image,
      registryDigest: `sha256:${"3".repeat(64)}`,
      registryResolvedAt: "2026-07-16T16:20:00.000Z",
      qualifiedAt: "2026-07-16T16:30:00.000Z",
      verifierVersion: "counterlab-release-v3",
    };
    const observation = {
      sourceCommit,
      sourceArchiveSha256: receipt.sourceArchiveSha256,
      sourceTreeSha256: receipt.sourceTreeSha256,
      dockerfileSha256: receipt.dockerfileSha256,
      localImageTag: receipt.localImageTag,
      localImageDigest: receipt.localImageDigest,
      ociRevision: receipt.ociRevision,
      ociSourceTreeSha256: receipt.ociSourceTreeSha256,
      engineAuthorityHash: receipt.engineAuthorityHash,
      runtimeManifestHash: receipt.runtimeManifestHash,
      runtimeToolchainSha256: receipt.runtimeToolchainSha256,
      toolchainLockSha256: receipt.toolchainLockSha256,
      runtimeAdapterSha256: receipt.runtimeAdapterSha256,
      buildctlSha256: receipt.buildctlSha256,
      buildkitdSha256: receipt.buildkitdSha256,
      buildkitConfigSha256: receipt.buildkitConfigSha256,
      adapterDockerfileSha256: receipt.adapterDockerfileSha256,
      adapterImageTag: receipt.adapterImageTag,
      adapterImageDigest: receipt.adapterImageDigest,
      adapterManifestDigest: receipt.adapterManifestDigest,
      adapterOciArchiveSha256: receipt.adapterOciArchiveSha256,
      adapterOciRevision: receipt.adapterOciRevision,
      adapterOciSourceTreeSha256: receipt.adapterOciSourceTreeSha256,
      registryImage: receipt.registryImage,
      registryDigest: receipt.registryDigest,
      registryResolvedAt: receipt.registryResolvedAt,
      currentCommit: evidenceCommit,
      sourceIsAncestor: true,
      changedPaths: ["scientific-engines/snapshot.json"],
      observedAt: "2026-07-16T16:30:00.000Z",
    };
    const generated = qualifiedDeployConfig({
      config: productionDeployConfig(),
      receipt,
      image,
      observation,
    });

    expect(generated.containers).toEqual([
      expect.objectContaining({
        class_name: "CounterLabRunner",
        image: `registry.cloudflare.com/account-1/counterlab-runner@${receipt.registryDigest}`,
      }),
    ]);
    expect(
      (generated.containers as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("image_vars");
    expect(
      (generated.containers as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("image_build_context");
    expect(() =>
      qualifiedDeployConfig({
        config: productionDeployConfig(),
        receipt: { ...receipt, runtimeToolchainSha256: "0".repeat(64) },
        image,
        observation,
      }),
    ).toThrow(/runtime toolchain/u);
    expect(() =>
      qualifiedDeployConfig({
        config: productionDeployConfig(),
        receipt: {
          ...receipt,
          adapterImageDigest: `sha256:${"0".repeat(64)}`,
        },
        image,
        observation,
      }),
    ).toThrow(/adapter image digest/u);
  });

  it("rejects a deploy config without admission authority", () => {
    const sourceCommit = "a".repeat(40);
    const evidenceCommit = "2".repeat(40);
    const image = `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`;
    const receipt = {
      schemaVersion: "3",
      status: "VERIFIED",
      sourceCommit,
      sourceArchiveSha256: "b".repeat(64),
      sourceTreeSha256: "c".repeat(64),
      dockerfileSha256: "d".repeat(64),
      localImageTag: `counterlab-runner:git-${sourceCommit}`,
      localImageDigest: `sha256:${"e".repeat(64)}`,
      ociRevision: sourceCommit,
      ociSourceTreeSha256: "c".repeat(64),
      engineAuthorityHash: "f".repeat(64),
      runtimeManifestHash: "1".repeat(64),
      runtimeToolchainSha256: "4".repeat(64),
      toolchainLockSha256: "5".repeat(64),
      runtimeAdapterSha256: "6".repeat(64),
      buildctlSha256: "7".repeat(64),
      buildkitdSha256: "8".repeat(64),
      buildkitConfigSha256: "9".repeat(64),
      adapterDockerfileSha256: "a".repeat(64),
      adapterImageTag: `counterlab-adapter:git-${sourceCommit}`,
      adapterImageDigest: `sha256:${"b".repeat(64)}`,
      adapterManifestDigest: `sha256:${"c".repeat(64)}`,
      adapterOciArchiveSha256: "d".repeat(64),
      adapterOciRevision: sourceCommit,
      adapterOciSourceTreeSha256: "c".repeat(64),
      evidenceCommit,
      registryImage: image,
      registryDigest: `sha256:${"3".repeat(64)}`,
      registryResolvedAt: "2026-07-16T16:20:00.000Z",
      qualifiedAt: "2026-07-16T16:30:00.000Z",
      verifierVersion: "counterlab-release-v3",
    };
    const config = productionDeployConfig();
    config.durable_objects.bindings = [
      { name: "RUNNER", class_name: "CounterLabRunner" },
    ];

    expect(() =>
      qualifiedDeployConfig({
        config,
        receipt,
        image,
        observation: {
          sourceCommit,
          sourceArchiveSha256: receipt.sourceArchiveSha256,
          sourceTreeSha256: receipt.sourceTreeSha256,
          dockerfileSha256: receipt.dockerfileSha256,
          localImageTag: receipt.localImageTag,
          localImageDigest: receipt.localImageDigest,
          ociRevision: receipt.ociRevision,
          ociSourceTreeSha256: receipt.ociSourceTreeSha256,
          engineAuthorityHash: receipt.engineAuthorityHash,
          runtimeManifestHash: receipt.runtimeManifestHash,
          runtimeToolchainSha256: receipt.runtimeToolchainSha256,
          toolchainLockSha256: receipt.toolchainLockSha256,
          runtimeAdapterSha256: receipt.runtimeAdapterSha256,
          buildctlSha256: receipt.buildctlSha256,
          buildkitdSha256: receipt.buildkitdSha256,
          buildkitConfigSha256: receipt.buildkitConfigSha256,
          adapterDockerfileSha256: receipt.adapterDockerfileSha256,
          adapterImageTag: receipt.adapterImageTag,
          adapterImageDigest: receipt.adapterImageDigest,
          adapterManifestDigest: receipt.adapterManifestDigest,
          adapterOciArchiveSha256: receipt.adapterOciArchiveSha256,
          adapterOciRevision: receipt.adapterOciRevision,
          adapterOciSourceTreeSha256: receipt.adapterOciSourceTreeSha256,
          registryImage: receipt.registryImage,
          registryDigest: receipt.registryDigest,
          registryResolvedAt: receipt.registryResolvedAt,
          currentCommit: evidenceCommit,
          sourceIsAncestor: true,
          changedPaths: [],
          observedAt: receipt.qualifiedAt,
        },
      }),
    ).toThrow(/authority bindings/i);
  });

  it("rejects a qualified receipt that does not match recomputed release evidence", () => {
    const sourceCommit = "a".repeat(40);
    const image = `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`;
    const receipt = {
      schemaVersion: "3",
      status: "VERIFIED",
      sourceCommit,
      sourceArchiveSha256: "b".repeat(64),
      sourceTreeSha256: "c".repeat(64),
      dockerfileSha256: "d".repeat(64),
      localImageTag: `counterlab-runner:git-${sourceCommit}`,
      localImageDigest: `sha256:${"e".repeat(64)}`,
      ociRevision: sourceCommit,
      ociSourceTreeSha256: "c".repeat(64),
      engineAuthorityHash: "f".repeat(64),
      runtimeManifestHash: "1".repeat(64),
      runtimeToolchainSha256: "4".repeat(64),
      toolchainLockSha256: "5".repeat(64),
      runtimeAdapterSha256: "6".repeat(64),
      buildctlSha256: "7".repeat(64),
      buildkitdSha256: "8".repeat(64),
      buildkitConfigSha256: "9".repeat(64),
      adapterDockerfileSha256: "a".repeat(64),
      adapterImageTag: `counterlab-adapter:git-${sourceCommit}`,
      adapterImageDigest: `sha256:${"b".repeat(64)}`,
      adapterManifestDigest: `sha256:${"c".repeat(64)}`,
      adapterOciArchiveSha256: "d".repeat(64),
      adapterOciRevision: sourceCommit,
      adapterOciSourceTreeSha256: "c".repeat(64),
      evidenceCommit: "2".repeat(40),
      registryImage: image,
      registryDigest: `sha256:${"3".repeat(64)}`,
      registryResolvedAt: "2026-07-16T15:55:00.000Z",
      qualifiedAt: "2026-07-16T16:00:00.000Z",
      verifierVersion: "counterlab-release-v3",
    };

    expect(() =>
      qualifiedDeployConfig({
        config: {
          account_id: "account-1",
          containers: [{ class_name: "CounterLabRunner" }],
        },
        receipt,
        image,
        observation: {
          sourceCommit,
          sourceArchiveSha256: "9".repeat(64),
          sourceTreeSha256: receipt.sourceTreeSha256,
          dockerfileSha256: receipt.dockerfileSha256,
          localImageTag: receipt.localImageTag,
          localImageDigest: receipt.localImageDigest,
          ociRevision: receipt.ociRevision,
          ociSourceTreeSha256: receipt.ociSourceTreeSha256,
          engineAuthorityHash: receipt.engineAuthorityHash,
          runtimeManifestHash: receipt.runtimeManifestHash,
          runtimeToolchainSha256: receipt.runtimeToolchainSha256,
          toolchainLockSha256: receipt.toolchainLockSha256,
          runtimeAdapterSha256: receipt.runtimeAdapterSha256,
          buildctlSha256: receipt.buildctlSha256,
          buildkitdSha256: receipt.buildkitdSha256,
          buildkitConfigSha256: receipt.buildkitConfigSha256,
          adapterDockerfileSha256: receipt.adapterDockerfileSha256,
          adapterImageTag: receipt.adapterImageTag,
          adapterImageDigest: receipt.adapterImageDigest,
          adapterManifestDigest: receipt.adapterManifestDigest,
          adapterOciArchiveSha256: receipt.adapterOciArchiveSha256,
          adapterOciRevision: receipt.adapterOciRevision,
          adapterOciSourceTreeSha256: receipt.adapterOciSourceTreeSha256,
          registryImage: receipt.registryImage,
          registryDigest: receipt.registryDigest,
          registryResolvedAt: receipt.registryResolvedAt,
          currentCommit: receipt.evidenceCommit,
          sourceIsAncestor: true,
          changedPaths: [],
          observedAt: receipt.qualifiedAt,
        },
      }),
    ).toThrow(/source archive/i);
  });

  it("keeps primary semantic text colors above normal-text contrast", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf-8");
    const variables = Object.fromEntries(
      [...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((match) => [
        match[1]!,
        match[2]!,
      ]),
    );
    const paper = variables.paper!;

    for (const name of [
      "ink",
      "ink-soft",
      "blue-deep",
      "purple",
      "aqua",
      "gold",
      "red",
    ]) {
      expect(contrast(variables[name]!, paper), name).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    for (const [foreground, background] of [
      ["accent-ink", "accent"],
      ["blue-ink", "blue"],
      ["purple-ink", "purple"],
      ["aqua-ink", "aqua-bright"],
      ["gold-ink", "gold-bright"],
    ] as const) {
      expect(
        contrast(variables[foreground]!, variables[background]!),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(css).toMatch(
      /\.api-progress\s*\{\s*color:\s*var\(--ink-soft\);\s*\}/,
    );
  });

  it("keeps dark-theme fonts resolvable and focus indicators visible", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf-8");
    const variables = Object.fromEntries(
      [...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((match) => [
        match[1]!,
        match[2]!,
      ]),
    );

    expect([...css.matchAll(/--([a-z-]+):\s*var\(--\1\)/g)]).toHaveLength(0);
    expect(
      contrast(variables["focus-ring"]!, variables.night!),
      "focus ring",
    ).toBeGreaterThanOrEqual(3);
    expect(css).not.toContain("outline: 3px solid var(--line);");
    expect(css).not.toContain("outline: 3px solid var(--line-strong);");
  });
});
