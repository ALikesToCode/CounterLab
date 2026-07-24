import { readFileSync } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { RELEASE_CHECK_IDS } from "../../../packages/scientific-engine-registry/src/index";

import {
  bindFrozenWorkerRelease,
  qualifiedDeployConfig as generateQualifiedDeployConfig,
} from "../../../scripts/prepare-qualified-deploy";
import { createGenerationIsolationEvidence } from "../../../scripts/generation-isolation-evidence";
import { hashGenerationIsolationProbe } from "../../../services/hosted-runner/src/startup-probe";

function productionDeployConfig() {
  return {
    name: "counterlab",
    account_id: "account-1",
    main: "index.js",
    no_bundle: true,
    compatibility_date: "2026-07-14",
    compatibility_flags: ["nodejs_compat"],
    assets: {
      directory: "../client",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*", "/ready"],
    },
    version_metadata: { binding: "CF_VERSION_METADATA" },
    vars: {
      OPENAI_MODEL: "gpt-5.6-sol",
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
        image_build_context: "/unqualified",
        max_instances: 10,
        instance_type: "standard-1",
        name: "counterlab-counterlabrunner",
        wrangler_ssh: { enabled: false },
      },
    ],
    observability: { enabled: true },
  };
}

function viteGeneratedDeployConfig() {
  const repositoryRoot = "/home/counterlab/repository";
  return {
    configPath: `${repositoryRoot}/apps/web/wrangler.jsonc`,
    userConfigPath: `${repositoryRoot}/apps/web/wrangler.jsonc`,
    topLevelName: "counterlab",
    definedEnvironments: [],
    legacy_env: true,
    jsx_factory: "React.createElement",
    jsx_fragment: "React.Fragment",
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    triggers: {},
    workflows: [],
    exports: {},
    kv_namespaces: [],
    cloudchamber: {},
    send_email: [],
    queues: { producers: [], consumers: [] },
    vectorize: [],
    ai_search_namespaces: [],
    ai_search: [],
    agent_memory: [],
    hyperdrive: [],
    services: [],
    analytics_engine_datasets: [],
    dispatch_namespaces: [],
    mtls_certificates: [],
    pipelines: [],
    secrets_store_secrets: [],
    artifacts: [],
    unsafe_hello_world: [],
    flagship: [],
    worker_loaders: [],
    ratelimits: [],
    vpc_services: [],
    vpc_networks: [],
    logfwdr: { bindings: [] },
    python_modules: { exclude: ["**/*.pyc"] },
    dev: {
      ip: "localhost",
      local_protocol: "http",
      upstream_protocol: "http",
      enable_containers: true,
      generate_types: false,
    },
    ...productionDeployConfig(),
    containers: [
      {
        class_name: "CounterLabRunner",
        image: `${repositoryRoot}/Dockerfile.runner`,
        image_build_context: repositoryRoot,
        max_instances: 10,
        instance_type: "standard-1",
        name: "counterlab-counterlabrunner",
        wrangler_ssh: { enabled: false },
      },
    ],
    no_bundle: true,
  };
}

function timeoutQualification(sourceCommit: string) {
  return {
    limitMode: "container-cgroup-and-process-rlimit",
    aggregateLimitIntentEnforced: true,
    aggregateLimitEvidenceSha256: "d".repeat(64),
    timeoutCleanupReceipt: `node_modules/.cache/counterlab-v6.1/releases/timeout-cleanup-${sourceCommit}.json`,
    timeoutCleanupReceiptSha256: "e".repeat(64),
    timeoutCleanupPayloadSha256: "f".repeat(64),
    timeoutRunControlReceiptSha256: "0".repeat(64),
    timeoutRootlessReceiptSha256: "1".repeat(64),
    timeoutRuntimeSessionId: "rt-v61-test1",
    timeoutVerifiedAt: "2026-07-16T16:19:00.000Z",
  } as const;
}

function generationIsolationQualification(input: {
  sourceCommit: string;
  sourceTreeSha256: string;
  localImageTag: string;
  localImageDigest: string;
  verifiedAt?: string;
}) {
  const probePayload = {
    schemaVersion: "2",
    probeVersion: "counterlab-generation-isolation-v2",
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: [
      "entrypoint",
      "non-root-user",
      "immutable-paths",
      "codex",
      "python",
      "landlock",
      "landlock-read-isolation",
      "setpriv",
      "writable-roots",
    ],
    generationFilesystemReadIsolation: "OS_ENFORCED",
    mechanism: "landlock",
    landlockAbi: 9,
    landlock: {
      forbiddenHostPathsUnreadable: true,
      forbiddenHostWritesDenied: true,
      crossTreeReferDenied: true,
      execInheritanceEnforced: true,
      parentEnvironmentUnreadable: true,
      workspaceVisible: true,
      workspaceWritable: true,
    },
  } as const;
  const probeSha256 = hashGenerationIsolationProbe(probePayload);
  const result = createGenerationIsolationEvidence({
    ...input,
    imageUser: "10001:10001",
    verifiedAt: input.verifiedAt ?? "2026-07-16T16:18:00.000Z",
    startupProbe: {
      status: "ready",
      service: "counterlab-hosted-runner",
      probe: "non-root-startup",
      checks: probePayload.checks,
      generationFilesystemReadIsolation: "OS_ENFORCED",
      generationIsolationProbe: probePayload,
      generationIsolationProbeSha256: probeSha256,
    },
  });
  return {
    generationIsolationEvidence: result.evidence,
    generationIsolationEvidenceSha256: result.evidenceSha256,
    generationIsolationProbeSha256: result.probeSha256,
    generationIsolationVerifiedAt: result.evidence.verifiedAt,
  } as const;
}

function releaseCheckReceiptFor(qualified: {
  evidenceCommit: string;
  sourceCommit: string;
  sourceTreeSha256: string;
  qualifiedAt: string;
  localImageTag: string;
  localImageDigest: string;
  adapterImageTag: string;
  adapterImageDigest: string;
  registryDigest: string;
  runtimeToolchainSha256: string;
  runtimePolicySha256: string;
  proofDependencyManifestSha256: string;
  aggregateLimitEvidenceSha256: string;
  runtimeAdapterSha256: string;
  generationIsolationEvidenceSha256: string;
  generationIsolationProbeSha256: string;
  generationIsolationVerifiedAt: string;
}) {
  const fresh = generationIsolationQualification({
    sourceCommit: qualified.sourceCommit,
    sourceTreeSha256: qualified.sourceTreeSha256,
    localImageTag: qualified.localImageTag,
    localImageDigest: qualified.localImageDigest,
    verifiedAt: "2026-07-16T16:30:30.000Z",
  });
  return {
    schemaVersion: "5",
    status: "PASSED",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    generationIsolationEvidenceSha256:
      qualified.generationIsolationEvidenceSha256,
    generationIsolationProbeSha256: qualified.generationIsolationProbeSha256,
    generationIsolationVerifiedAt: qualified.generationIsolationVerifiedAt,
    releaseCheckGenerationIsolationEvidence: fresh.generationIsolationEvidence,
    releaseCheckGenerationIsolationEvidenceSha256:
      fresh.generationIsolationEvidenceSha256,
    releaseCheckGenerationIsolationProbeSha256:
      fresh.generationIsolationProbeSha256,
    releaseCheckGenerationIsolationVerifiedAt:
      fresh.generationIsolationVerifiedAt,
    evidenceCommit: qualified.evidenceCommit,
    sourceCommit: qualified.sourceCommit,
    qualifiedRunnerReceiptSha256: "2".repeat(64),
    qualifiedAt: qualified.qualifiedAt,
    runnerImageTag: qualified.localImageTag,
    runnerImageDigest: qualified.localImageDigest,
    adapterImageTag: qualified.adapterImageTag,
    adapterImageDigest: qualified.adapterImageDigest,
    registryDigest: qualified.registryDigest,
    runtimeToolchainSha256: qualified.runtimeToolchainSha256,
    runtimePolicySha256: qualified.runtimePolicySha256,
    proofDependencyManifestSha256: qualified.proofDependencyManifestSha256,
    aggregateLimitEvidenceSha256: qualified.aggregateLimitEvidenceSha256,
    runtimeAdapterSha256: qualified.runtimeAdapterSha256,
    checks: RELEASE_CHECK_IDS.map((id) => ({ id, status: "PASSED" as const })),
    checkedAt: "2026-07-16T16:31:00.000Z",
    verifierVersion: "counterlab-release-check-v5",
  } as const;
}

function qualifiedDeployConfig(
  input: Omit<
    Parameters<typeof generateQualifiedDeployConfig>[0],
    "releaseCheckReceipt"
  > & {
    releaseCheckReceipt?: unknown;
  },
) {
  return generateQualifiedDeployConfig({
    ...input,
    releaseCheckReceipt:
      input.releaseCheckReceipt ??
      releaseCheckReceiptFor(
        input.receipt as Parameters<typeof releaseCheckReceiptFor>[0],
      ),
  });
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
    expect(script).toContain('--expected-image-digest "${LOCAL_IMAGE_DIGEST}"');
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
    expect(script).toContain('rollback "${recovery_version}"');
    expect(script).toContain("recover_previous_worker");
    expect(script).toContain("scripts/deployment-recovery-target.ts");
    expect(script).toContain('--migrations-started "${MIGRATIONS_STARTED}"');
    expect(script).toContain(
      '--container-rollout-started "${CONTAINER_ROLLOUT_STARTED}"',
    );
    expect(script).toContain('MAINTENANCE_TAG="${WORKER_TAG}"');
    expect(script).not.toContain(
      "Automatic Worker rollback was intentionally skipped",
    );
    expect(script).toContain("Prior Container evidence");
    expect(script).toContain("--remote");
    expect(script).toContain("--containers-rollout immediate");
    expect(script).toContain("deployments status");
    expect(script).toContain("scripts/create-deployment-receipt.ts");
    expect(script).toContain("release-check-identity");
    expect(script).toContain(
      "Release-check receipt bytes changed after identity validation.",
    );
    expect(script).toContain(
      "RELEASE_CHECK_GENERATION_ISOLATION_EVIDENCE_SHA256",
    );
    expect(script).toContain("RELEASE_CHECK_GENERATION_ISOLATION_VERIFIED_AT");
    expect(script).toContain(
      'exactKeys(payload, ["status", "service", "checks", "maintenance", "release"])',
    );
    expect(script).toContain('exactKeys(payload, ["ok", "data"])');
    expect(receiptVerifier).toContain("active.percentage !== 100");
    expect(script).toContain("deployment-receipt.json");
    expect(script).not.toContain("--containers-rollout gradual");

    const maintenanceDeploy = script.indexOf("MAINTENANCE_TAG=");
    const maintenanceObserved = script.indexOf(
      "\nwait_for_maintenance_health\n",
      maintenanceDeploy,
    );
    const postFreezeReplay = script.indexOf("POST_FREEZE_REPLAY_PREFLIGHT=");
    const migrations = script.indexOf('"${WRANGLER}" d1 migrations apply DB');
    const containerRollout = script.indexOf("CONTAINER_ROLLOUT_STARTED=1");
    const finalDeploy = script.indexOf("WORKER_MESSAGE=");
    const firstFinalReadiness = script.indexOf(
      "\nwait_for_final_readiness\n",
      finalDeploy,
    );
    const finalStatus = script.lastIndexOf(
      'capture_active_worker \\\n  "${DEPLOYED_VERSION_ID}"',
    );
    const finalContainerStatus = script.indexOf(
      'candidate="${RELEASE_DIR}/final-containers-${attempt}.json"',
    );
    const finalReadiness = script.lastIndexOf("\nwait_for_final_readiness\n");
    const receipt = script.indexOf(
      "node --import tsx scripts/create-deployment-receipt.ts",
    );
    const productionSmoke = script.indexOf(
      'COUNTERLAB_DEPLOYMENT_RECEIPT="${DEPLOYMENT_RECEIPT}"',
    );
    const recoveryDisarmed = script.lastIndexOf("\nRECOVERY_ARMED=0\n");
    expect(maintenanceObserved).toBeGreaterThan(maintenanceDeploy);
    expect(postFreezeReplay).toBeGreaterThan(maintenanceObserved);
    expect(migrations).toBeGreaterThan(postFreezeReplay);
    expect(containerRollout).toBeGreaterThan(migrations);
    expect(finalDeploy).toBeGreaterThan(containerRollout);
    expect(firstFinalReadiness).toBeGreaterThan(finalDeploy);
    expect(finalStatus).toBeGreaterThan(firstFinalReadiness);
    expect(finalContainerStatus).toBeGreaterThan(finalStatus);
    expect(finalReadiness).toBeGreaterThan(finalContainerStatus);
    expect(receipt).toBeGreaterThan(finalContainerStatus);
    expect(receipt).toBeGreaterThan(finalReadiness);
    expect(productionSmoke).toBeGreaterThan(receipt);
    expect(recoveryDisarmed).toBeGreaterThan(productionSmoke);
    expect(script.slice(finalDeploy, finalReadiness)).toContain(
      "--containers-rollout none",
    );
    expect(script.match(/workerVersionId: expectedVersion/gu)).toHaveLength(2);
    expect(
      script.match(/releaseCheckGenerationIsolationEvidenceSha256:/gu),
    ).toHaveLength(2);
    expect(script).toContain(
      'rollback "${recovery_version}" \\\n      --config "${RECOVERY_CONFIG}"',
    );
    const recoveryFunction = script.slice(
      script.indexOf("recover_previous_worker()"),
      script.indexOf("trap recover_previous_worker EXIT"),
    );
    expect(recoveryFunction).not.toContain("assert_release_authority");
  });

  it("uses one frozen no-bundle Worker for dry-run and every state-changing deploy", () => {
    const script = readFileSync(
      resolve(process.cwd(), "../../scripts/deploy-qualified.sh"),
      "utf8",
    );

    expect(
      script.match(/"\$\{WRANGLER\}" deploy \\\n  "\$\{WORKER_BUNDLE\}"/gu),
    ).toHaveLength(4);
    expect(script.match(/  --no-bundle \\/gu)).toHaveLength(4);
    expect(
      script.match(/assert_frozen_worker_release/gu)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(script.match(/assert_release_authority/gu)).toHaveLength(6);
    expect(script).toContain("scripts/frozen-worker-release.ts");

    const build = script.indexOf('"${PNPM}" --filter @counterlab/web build');
    const finalSecretScan = script.indexOf("scripts/secret-scan.py");
    const manifest = script.indexOf("scripts/frozen-worker-release.ts create");
    const dryRun = script.indexOf("  --dry-run \\\n");
    const strictDryRun = script.indexOf(
      "scripts/frozen-worker-release.ts verify-dry-run",
      dryRun,
    );
    const account = script.indexOf('"${WRANGLER}" whoami --json');
    const secretList = script.indexOf('"${WRANGLER}" secret list');
    const secretValidation = script.indexOf(
      'node - "${RELEASE_DIR}/secret-names.json"',
      secretList,
    );
    expect(finalSecretScan).toBeGreaterThan(build);
    expect(manifest).toBeGreaterThan(finalSecretScan);
    expect(script.slice(manifest, dryRun)).toContain(
      '--vite-version "${OBSERVED_VITE_VERSION}"',
    );
    expect(script.slice(manifest, dryRun)).toContain(
      '--wrangler-version "${OBSERVED_WRANGLER_VERSION}"',
    );
    expect(strictDryRun).toBeGreaterThan(dryRun);
    expect(account).toBeGreaterThan(strictDryRun);
    expect(secretList).toBeGreaterThan(account);
    expect(script.slice(secretList, secretValidation)).toContain(
      "--name counterlab",
    );

    const maintenance = script.indexOf("MAINTENANCE_TAG=");
    const migration = script.indexOf('"${WRANGLER}" d1 migrations apply DB');
    const container = script.indexOf("CONTAINER_ROLLOUT_STARTED=1");
    const final = script.indexOf("WORKER_MESSAGE=");
    for (const mutation of [maintenance, migration, container, final]) {
      expect(
        script.lastIndexOf("assert_release_authority", mutation),
      ).toBeGreaterThan(strictDryRun);
    }
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
    expect(script).toContain("input.expectedConfigDigest");
    expect(script).toContain('"--expected-image-digest"');
    expect(script).toContain("buildReceipt.localImageDigest");
    expect(script).toContain(
      '"qualified local image digest is unavailable for promotion"',
    );
    expect(script).toContain('flag: "wx"');
    expect(
      script.match(
        /\[\s*"load",\s*"--platform",\s*"linux\/amd64",\s*"--input",\s*[^\]]+\]/gu,
      ),
    ).toHaveLength(2);
  });

  it("removes exact-image verification containers after bounded checks", () => {
    const script = readFileSync(
      resolve(process.cwd(), "../../scripts/verify-scientific-engines.sh"),
      "utf8",
    );

    expect(script).toContain(
      '"${DOCKER_COMMAND[@]}" run --rm --name "${STARTUP_CONTAINER}"',
    );
    expect(script).toContain(
      '"${DOCKER_COMMAND[@]}" run --rm --name "${RUNTIME_CONTAINER}"',
    );
    expect(script).toContain('--session-id "${RUNTIME_SESSION_ID}"');
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
    expect(dockerfile).toContain("/repo/fixtures/notebooks");
    expect(dockerfile).toContain("/repo/requirements.runner.lock.txt");
    expect(dockerfile).toContain("chmod -R a=rX /repo");
    expect(dockerfile).toContain("chmod 0555 /usr/local/bin/node");
    expect(dockerfile).toContain(
      "/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
    );
    expect(dockerfile).toContain("/out/runtime-rootfs/dev/pts");
    expect(dockerfile).toContain("/out/runtime-rootfs/sys/fs/cgroup");
    expect(dockerfile).toContain("/out/runtime-rootfs/counterlab-runtime");
    expect(dockerfile).toContain("/out/runtime-rootfs/etc/hosts");
    // BuildKit bind-mounts /etc/hosts read-only during RUN instructions. The
    // copied placeholder is normalized to root:root 0644 in the final OCI
    // archive, so the Dockerfile must not attempt to mutate the mounted path.
    expect(dockerfile).not.toContain("chmod 0644 /etc/hosts");
    expect(dockerfile).not.toMatch(/chown root:root[\s\S]*?\/etc\/hosts/);
    // Docker and BuildKit mount the cgroup hierarchy read-only while image
    // layers are assembled. Its placeholder is already root-owned and 0755.
    expect(dockerfile).not.toMatch(/chown root:root[\s\S]*?\/sys\/fs\/cgroup/);
    expect(dockerfile).not.toMatch(/chmod 0755[\s\S]*?\/sys\/fs\/cgroup/);
    expect(dockerfile).toContain(
      "services/hosted-runner/runtime/landlock_launcher.py /opt/counterlab/landlock_launcher.py",
    );
    expect(dockerfile).toContain(
      "chmod 0555 /usr/local/bin/node /opt/counterlab/landlock_launcher.py",
    );
    expect(
      dockerfile.indexOf("/opt/counterlab/landlock_launcher.py"),
    ).toBeLessThan(dockerfile.indexOf("USER 10001:10001"));
    expect(dockerfile.indexOf("chmod 0555 /usr/local/bin/node")).toBeLessThan(
      dockerfile.indexOf("USER 10001:10001"),
    );
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
      'STARTUP_PROBE_OUTPUT="$("${DOCKER_COMMAND[@]}" run',
    );
    const probeEnd = verifier.indexOf("# The preceding probe", probeStart);
    const probe = verifier.slice(probeStart, probeEnd);

    expect(probeStart).toBeGreaterThan(-1);
    expect(probe).toContain("COUNTERLAB_RUNNER_STARTUP_PROBE=1");
    expect(probe).not.toContain("--user");
    expect(probe).not.toContain("--entrypoint");
    expect(probe).toContain("--memory=4096m");
    expect(probe).toContain("--memory-swap=4096m");
    expect(probe).toContain("--ulimit=as=17179869184:17179869184");
    expect(probe).toContain('"${IMAGE}"');
    expect(verifier.match(/"\$\{IMAGE\}"/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(verifier).toContain("--generation-isolation-report");
    expect(verifier).toContain("--expected-image-digest");
    expect(verifier).toContain(
      '"${IMAGE_DIGEST}" != "${EXPECTED_IMAGE_DIGEST}"',
    );
    expect(verifier).toContain(
      '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}',
    );
    expect(verifier).toContain(
      "node --import tsx scripts/generation-isolation-evidence.ts",
    );
  });

  it("generates a deploy config from a source-bound qualified image receipt", () => {
    const sourceCommit = "a".repeat(40);
    const evidenceCommit = "2".repeat(40);
    const image = `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`;
    const receipt = {
      schemaVersion: "6",
      status: "VERIFIED",
      generationFilesystemReadIsolation: "OS_ENFORCED",
      sourceCommit,
      sourceArchiveSha256: "b".repeat(64),
      sourceTreeSha256: "c".repeat(64),
      dockerfileSha256: "d".repeat(64),
      localImageTag: `counterlab-runner:git-${sourceCommit}`,
      localImageDigest: `sha256:${"e".repeat(64)}`,
      ...generationIsolationQualification({
        sourceCommit,
        sourceTreeSha256: "c".repeat(64),
        localImageTag: `counterlab-runner:git-${sourceCommit}`,
        localImageDigest: `sha256:${"e".repeat(64)}`,
      }),
      ociRevision: sourceCommit,
      ociSourceTreeSha256: "c".repeat(64),
      engineAuthorityHash: "f".repeat(64),
      runtimeManifestHash: "1".repeat(64),
      runtimeToolchainSha256: "4".repeat(64),
      runtimePolicySha256: "0".repeat(64),
      proofDependencyManifestSha256: "1".repeat(64),
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
      ...timeoutQualification(sourceCommit),
      evidenceCommit,
      registryImage: image,
      registryDigest: `sha256:${"3".repeat(64)}`,
      registryResolvedAt: "2026-07-16T16:20:00.000Z",
      qualifiedAt: "2026-07-16T16:30:00.000Z",
      verifierVersion: "counterlab-release-v6",
    };
    const releaseCheckReceipt = releaseCheckReceiptFor(receipt);
    const observation = {
      generationFilesystemReadIsolation: "OS_ENFORCED" as const,
      ...generationIsolationQualification({
        sourceCommit,
        sourceTreeSha256: receipt.sourceTreeSha256,
        localImageTag: receipt.localImageTag,
        localImageDigest: receipt.localImageDigest,
      }),
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
      runtimePolicySha256: receipt.runtimePolicySha256,
      proofDependencyManifestSha256: receipt.proofDependencyManifestSha256,
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
      ...timeoutQualification(sourceCommit),
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
      releaseCheckReceipt,
      image,
      observation,
    });

    expect(generated.containers).toEqual([
      expect.objectContaining({
        class_name: "CounterLabRunner",
        image: `registry.cloudflare.com/account-1/counterlab-runner@${receipt.registryDigest}`,
        instance_type: "standard-1",
        ssh: { enabled: false },
      }),
    ]);
    expect(
      (generated.containers as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("image_vars");
    expect(
      (generated.containers as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("image_build_context");
    expect(
      (generated.containers as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("wrangler_ssh");
    expect(generated.vars).toEqual(
      expect.objectContaining({
        COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256:
          receipt.aggregateLimitEvidenceSha256,
        COUNTERLAB_RUNTIME_POLICY_SHA256: receipt.runtimePolicySha256,
        COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256:
          receipt.proofDependencyManifestSha256,
        COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256:
          receipt.generationIsolationEvidenceSha256,
        COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256:
          receipt.generationIsolationProbeSha256,
        COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_EVIDENCE_SHA256:
          releaseCheckReceipt.releaseCheckGenerationIsolationEvidenceSha256,
        COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_PROBE_SHA256:
          releaseCheckReceipt.releaseCheckGenerationIsolationProbeSha256,
        COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_VERIFIED_AT:
          releaseCheckReceipt.releaseCheckGenerationIsolationVerifiedAt,
      }),
    );
    expect(() =>
      qualifiedDeployConfig({
        config: productionDeployConfig(),
        receipt,
        releaseCheckReceipt: {
          ...releaseCheckReceipt,
          releaseCheckGenerationIsolationEvidence: {
            ...releaseCheckReceipt.releaseCheckGenerationIsolationEvidence,
            sourceTreeSha256: "0".repeat(64),
          },
        },
        image,
        observation,
      }),
    ).toThrow(/evidence hash mismatch/u);
    const generatedFromVite = qualifiedDeployConfig({
      config: viteGeneratedDeployConfig(),
      receipt,
      image,
      observation,
    });
    expect(generatedFromVite).toEqual(
      expect.objectContaining({
        main: "index.js",
        no_bundle: true,
        assets: expect.objectContaining({ directory: "../client" }),
      }),
    );
    expect(Object.keys(generatedFromVite).sort()).toEqual(
      [
        "account_id",
        "assets",
        "compatibility_date",
        "compatibility_flags",
        "containers",
        "d1_databases",
        "durable_objects",
        "main",
        "migrations",
        "name",
        "no_bundle",
        "observability",
        "r2_buckets",
        "vars",
        "version_metadata",
      ].sort(),
    );
    expect(
      bindFrozenWorkerRelease(generatedFromVite, {
        schemaVersion: "1",
        classification: "PROCESS_BOUND_PARTIAL",
        sourceCommit: evidenceCommit,
        manifestSha256: "4".repeat(64),
        workerBundleSha256: "5".repeat(64),
        clientAssetsSha256: "6".repeat(64),
        clientAssetCount: 27,
        clientPublicAssetsSha256: "7".repeat(64),
        clientPublicAssetCount: 25,
        viteVersion: "8.1.4",
        wranglerVersion: "4.110.0",
      }).vars,
    ).toEqual(
      expect.objectContaining({
        COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION: "PROCESS_BOUND_PARTIAL",
        COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256: "4".repeat(64),
        COUNTERLAB_WORKER_BUNDLE_SHA256: "5".repeat(64),
        COUNTERLAB_CLIENT_ASSETS_SHA256: "6".repeat(64),
        COUNTERLAB_CLIENT_ASSET_COUNT: "27",
        COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256: "7".repeat(64),
        COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT: "25",
        COUNTERLAB_VITE_VERSION: "8.1.4",
        COUNTERLAB_WRANGLER_VERSION: "4.110.0",
      }),
    );
    const withUnexpectedContainerAuthority = productionDeployConfig();
    Object.assign(withUnexpectedContainerAuthority.containers[0]!, {
      command: ["/bin/sh"],
    });
    expect(() =>
      qualifiedDeployConfig({
        config: withUnexpectedContainerAuthority,
        receipt,
        image,
        observation,
      }),
    ).toThrow(/Container config contains missing or unknown fields/u);
    const withUnexpectedTopLevelAuthority = productionDeployConfig();
    Object.assign(withUnexpectedTopLevelAuthority, {
      routes: [{ pattern: "example.com/*" }],
    });
    expect(() =>
      qualifiedDeployConfig({
        config: withUnexpectedTopLevelAuthority,
        receipt,
        image,
        observation,
      }),
    ).toThrow(/Wrangler config contains missing or unknown fields/u);
    const withUnexpectedBindingAuthority = productionDeployConfig();
    Object.assign(withUnexpectedBindingAuthority.d1_databases[0]!, {
      preview_database_id: "different-database",
    });
    expect(() =>
      qualifiedDeployConfig({
        config: withUnexpectedBindingAuthority,
        receipt,
        image,
        observation,
      }),
    ).toThrow(/D1 database config contains missing or unknown fields/u);
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
        receipt: { ...receipt, runtimePolicySha256: "f".repeat(64) },
        image,
        observation,
      }),
    ).toThrow(/runtime policy/u);
    for (const [field, label] of [
      ["generationIsolationEvidenceSha256", /generation isolation evidence/u],
      ["generationIsolationProbeSha256", /generation isolation probe/u],
    ] as const) {
      expect(() =>
        qualifiedDeployConfig({
          config: productionDeployConfig(),
          receipt,
          image,
          observation: { ...observation, [field]: "0".repeat(64) },
        }),
      ).toThrow(label);
    }
    expect(() =>
      qualifiedDeployConfig({
        config: productionDeployConfig(),
        receipt: {
          ...receipt,
          proofDependencyManifestSha256: "f".repeat(64),
        },
        image,
        observation,
      }),
    ).toThrow(/proof dependency manifest/u);
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
      schemaVersion: "6",
      status: "VERIFIED",
      generationFilesystemReadIsolation: "OS_ENFORCED",
      sourceCommit,
      sourceArchiveSha256: "b".repeat(64),
      sourceTreeSha256: "c".repeat(64),
      dockerfileSha256: "d".repeat(64),
      localImageTag: `counterlab-runner:git-${sourceCommit}`,
      localImageDigest: `sha256:${"e".repeat(64)}`,
      ...generationIsolationQualification({
        sourceCommit,
        sourceTreeSha256: "c".repeat(64),
        localImageTag: `counterlab-runner:git-${sourceCommit}`,
        localImageDigest: `sha256:${"e".repeat(64)}`,
      }),
      ociRevision: sourceCommit,
      ociSourceTreeSha256: "c".repeat(64),
      engineAuthorityHash: "f".repeat(64),
      runtimeManifestHash: "1".repeat(64),
      runtimeToolchainSha256: "4".repeat(64),
      runtimePolicySha256: "0".repeat(64),
      proofDependencyManifestSha256: "1".repeat(64),
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
      ...timeoutQualification(sourceCommit),
      evidenceCommit,
      registryImage: image,
      registryDigest: `sha256:${"3".repeat(64)}`,
      registryResolvedAt: "2026-07-16T16:20:00.000Z",
      qualifiedAt: "2026-07-16T16:30:00.000Z",
      verifierVersion: "counterlab-release-v6",
    };
    const releaseCheckReceipt = releaseCheckReceiptFor(receipt);
    const config = productionDeployConfig();
    config.durable_objects.bindings = [
      { name: "RUNNER", class_name: "CounterLabRunner" },
    ];

    expect(() =>
      qualifiedDeployConfig({
        config,
        receipt,
        releaseCheckReceipt,
        image,
        observation: {
          generationFilesystemReadIsolation: "OS_ENFORCED",
          ...generationIsolationQualification({
            sourceCommit,
            sourceTreeSha256: receipt.sourceTreeSha256,
            localImageTag: receipt.localImageTag,
            localImageDigest: receipt.localImageDigest,
          }),
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
          runtimePolicySha256: receipt.runtimePolicySha256,
          proofDependencyManifestSha256: receipt.proofDependencyManifestSha256,
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
          ...timeoutQualification(sourceCommit),
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
      schemaVersion: "6",
      status: "VERIFIED",
      generationFilesystemReadIsolation: "OS_ENFORCED",
      sourceCommit,
      sourceArchiveSha256: "b".repeat(64),
      sourceTreeSha256: "c".repeat(64),
      dockerfileSha256: "d".repeat(64),
      localImageTag: `counterlab-runner:git-${sourceCommit}`,
      localImageDigest: `sha256:${"e".repeat(64)}`,
      ...generationIsolationQualification({
        sourceCommit,
        sourceTreeSha256: "c".repeat(64),
        localImageTag: `counterlab-runner:git-${sourceCommit}`,
        localImageDigest: `sha256:${"e".repeat(64)}`,
      }),
      ociRevision: sourceCommit,
      ociSourceTreeSha256: "c".repeat(64),
      engineAuthorityHash: "f".repeat(64),
      runtimeManifestHash: "1".repeat(64),
      runtimeToolchainSha256: "4".repeat(64),
      runtimePolicySha256: "0".repeat(64),
      proofDependencyManifestSha256: "1".repeat(64),
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
      ...timeoutQualification(sourceCommit),
      evidenceCommit: "2".repeat(40),
      registryImage: image,
      registryDigest: `sha256:${"3".repeat(64)}`,
      registryResolvedAt: "2026-07-16T15:55:00.000Z",
      qualifiedAt: "2026-07-16T16:30:00.000Z",
      verifierVersion: "counterlab-release-v6",
    };
    const releaseCheckReceipt = releaseCheckReceiptFor(receipt);

    expect(() =>
      qualifiedDeployConfig({
        config: {
          account_id: "account-1",
          containers: [{ class_name: "CounterLabRunner" }],
        },
        receipt,
        releaseCheckReceipt,
        image,
        observation: {
          generationFilesystemReadIsolation: "OS_ENFORCED",
          ...generationIsolationQualification({
            sourceCommit,
            sourceTreeSha256: receipt.sourceTreeSha256,
            localImageTag: receipt.localImageTag,
            localImageDigest: receipt.localImageDigest,
          }),
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
          runtimePolicySha256: receipt.runtimePolicySha256,
          proofDependencyManifestSha256: receipt.proofDependencyManifestSha256,
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
          ...timeoutQualification(sourceCommit),
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
