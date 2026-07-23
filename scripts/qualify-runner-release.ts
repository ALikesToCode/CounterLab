import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { z } from "zod";

import {
  containedRuntimeAdapterArguments,
  requireContainedRuntimeSessionId,
} from "./contained-runtime-attestation.mjs";
import {
  ContainedRuntimeAttestationSchema,
  GenerationIsolationEvidenceSchema,
  assertCurrentGrypeReleaseEvidenceBinding,
} from "../packages/scientific-engine-registry/src/index.js";
import {
  collectRunnerReleaseEvidence,
  createQualifiedRunnerRelease,
} from "./prepare-qualified-deploy.js";
import { validateTimeoutCleanupProof } from "./timeout-cleanup-receipt.js";
import {
  hashGenerationIsolationEvidence,
  verifyGenerationIsolationEvidence,
} from "./generation-isolation-evidence.js";
import {
  SourceBoundBuildReceiptSchema,
  type SourceBoundBuildReceipt,
} from "./source-bound-build-receipt.js";

const BuildReceiptSchema = SourceBoundBuildReceiptSchema;

const RegistryCredentialsSchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(32),
  })
  .passthrough();

type Arguments = {
  buildReceipt: string;
  timeoutReceipt: string;
  registryImage: string;
  output: string;
};

function isRepositoryPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
  );
}

async function assertContainedWritePath(
  root: string,
  candidate: string,
): Promise<void> {
  if (!isRepositoryPath(root, candidate) || candidate === root) {
    throw new Error(
      `qualification write path escapes the repository: ${candidate}`,
    );
  }
  let current = root;
  for (const component of relative(root, candidate).split(sep)) {
    current = resolve(current, component);
    let metadata: Awaited<ReturnType<typeof lstat>>;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
    if (metadata.isSymbolicLink()) {
      throw new Error(
        `qualification write path contains a symlink: ${candidate}`,
      );
    }
    if (!isRepositoryPath(root, await realpath(current))) {
      throw new Error(
        `qualification write path resolves outside the repository: ${candidate}`,
      );
    }
  }
}

async function existingRepositoryFile(
  root: string,
  requested: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate)) {
    throw new Error(`qualification input escapes the repository: ${requested}`);
  }
  await assertContainedWritePath(root, candidate);
  const resolved = await realpath(candidate);
  if (!isRepositoryPath(root, resolved) || !(await stat(resolved)).isFile()) {
    throw new Error(
      `qualification input is not a repository file: ${requested}`,
    );
  }
  return resolved;
}

async function repositoryOutputPath(
  root: string,
  requested: string,
): Promise<string> {
  const output = resolve(root, requested);
  if (!isRepositoryPath(root, output)) {
    throw new Error(
      `qualification output escapes the repository: ${requested}`,
    );
  }
  await assertContainedWritePath(root, output);
  const parent = await realpath(dirname(output));
  if (!isRepositoryPath(root, parent)) {
    throw new Error(
      `qualification output parent escapes the repository: ${requested}`,
    );
  }
  try {
    await lstat(output);
    throw new Error(
      `qualification output already exists; refusing to replace it: ${requested}`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return output;
}

async function repositoryExecutable(
  root: string,
  requested: string | undefined,
): Promise<string> {
  if (requested === undefined || requested.trim().length === 0) {
    throw new Error(
      "COUNTERLAB_DOCKER_BIN must name the repository-contained runtime adapter",
    );
  }
  const executable = await existingRepositoryFile(root, requested);
  const metadata = await stat(executable);
  if ((metadata.mode & 0o111) === 0) {
    throw new Error("runtime adapter is not executable");
  }
  return executable;
}

function commandText(root: string, command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}

function sha256Command(root: string, command: string, args: string[]): string {
  return createHash("sha256")
    .update(
      execFileSync(command, args, {
        cwd: root,
        encoding: "buffer",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      }),
    )
    .digest("hex");
}

function runtimeAdapterArguments(args: string[]): string[] {
  return containedRuntimeAdapterArguments(
    requireContainedRuntimeSessionId(process.env.COUNTERLAB_RUNTIME_SESSION_ID),
    args,
  );
}

function observeLocalImageDigest(
  root: string,
  runtimeAdapter: string,
  image: string,
): string {
  const digest = commandText(
    root,
    runtimeAdapter,
    runtimeAdapterArguments(["image", "inspect", image, "--format", "{{.Id}}"]),
  );
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error("runtime adapter returned an invalid local image digest");
  }
  return digest;
}

function observeRuntimeAttestation(root: string, runtimeAdapter: string) {
  return ContainedRuntimeAttestationSchema.parse(
    JSON.parse(
      commandText(
        root,
        runtimeAdapter,
        runtimeAdapterArguments(["counterlab-attest"]),
      ),
    ) as unknown,
  );
}

function assertBuildRuntimeBinding(
  buildReceipt: SourceBoundBuildReceipt,
  runtime: z.infer<typeof ContainedRuntimeAttestationSchema>,
): void {
  const bindings = [
    [
      "runtime toolchain",
      buildReceipt.runtimeToolchainSha256,
      runtime.runtimeToolchainSha256,
    ],
    [
      "runtime policy",
      buildReceipt.runtimePolicySha256,
      runtime.runtimePolicySha256,
    ],
    [
      "runtime proof dependency manifest",
      buildReceipt.proofDependencyManifestSha256,
      runtime.proofDependencyManifestSha256,
    ],
    [
      "toolchain lock",
      buildReceipt.toolchainLockSha256,
      runtime.toolchainLockSha256,
    ],
    [
      "runtime adapter",
      buildReceipt.runtimeAdapterSha256,
      runtime.adapterSha256,
    ],
    ["buildctl", buildReceipt.buildctlSha256, runtime.componentSha256.buildctl],
    [
      "buildkitd",
      buildReceipt.buildkitdSha256,
      runtime.componentSha256.buildkitd,
    ],
    [
      "BuildKit config",
      buildReceipt.buildkitConfigSha256,
      runtime.fileSha256.buildkitConfig,
    ],
  ] as const;
  for (const [label, expected, observed] of bindings) {
    if (expected !== observed) {
      throw new Error(`${label} changed after the source-bound runner build`);
    }
  }
}

function assertCleanWorktree(root: string): void {
  const status = commandText(root, "git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (status.length > 0) {
    throw new Error(
      "runner qualification requires a completely clean worktree",
    );
  }
}

async function configureContainedEnvironment(root: string): Promise<void> {
  const cacheRoot = resolve(root, "node_modules/.cache/counterlab-v6.1");
  const environment = {
    HOME: resolve(cacheRoot, "home"),
    TMPDIR: resolve(cacheRoot, "tmp"),
    XDG_CACHE_HOME: resolve(cacheRoot, "xdg-cache"),
    XDG_CONFIG_HOME: resolve(cacheRoot, "xdg-config"),
    XDG_DATA_HOME: resolve(cacheRoot, "xdg-data"),
  } as const;
  const gitConfig = resolve(cacheRoot, "gitconfig");
  await Promise.all(
    [...Object.values(environment), gitConfig].map((path) =>
      assertContainedWritePath(root, path),
    ),
  );
  await Promise.all(
    Object.values(environment).map((path) => mkdir(path, { recursive: true })),
  );
  await Promise.all(
    Object.values(environment).map((path) =>
      assertContainedWritePath(root, path),
    ),
  );
  Object.assign(process.env, environment, {
    CI: "1",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: gitConfig,
  });
}

async function promoteImage(input: {
  root: string;
  runtimeAdapter: string;
  localImage: string;
  registryImage: string;
  expectedConfigDigest: string;
  expectedManifestDigest: string;
}): Promise<void> {
  const match = input.registryImage.match(
    /^registry\.cloudflare\.com\/([A-Za-z0-9_-]{3,64})\/counterlab-runner:git-[a-f0-9]{40}$/,
  );
  if (match === null) {
    throw new Error("registry image is not a source-bound Cloudflare image");
  }
  const localCommit = input.localImage.match(
    /^counterlab-runner:git-([a-f0-9]{40})$/,
  )?.[1];
  const registryCommit = input.registryImage.match(/:git-([a-f0-9]{40})$/)?.[1];
  if (localCommit === undefined || registryCommit !== localCommit) {
    throw new Error(
      "registry image tag must match the built runner source commit",
    );
  }
  if (
    commandText(
      input.root,
      input.runtimeAdapter,
      runtimeAdapterArguments([
        "image",
        "inspect",
        input.localImage,
        "--format",
        "{{.Id}}",
      ]),
    ) !== input.expectedConfigDigest
  ) {
    throw new Error(
      "qualified local image digest is unavailable for promotion",
    );
  }
  const wrangler = resolve(input.root, "node_modules/.bin/wrangler");
  const credentials = RegistryCredentialsSchema.parse(
    JSON.parse(
      commandText(input.root, wrangler, [
        "containers",
        "registries",
        "credentials",
        "registry.cloudflare.com",
        "--push",
        "--expiration-minutes",
        "5",
        "--json",
        "--config",
        "apps/web/wrangler.jsonc",
      ]),
    ) as unknown,
  );
  const authorization = `Basic ${Buffer.from(
    `${credentials.username}:${credentials.password}`,
  ).toString("base64")}`;
  const existing = await fetch(
    `https://registry.cloudflare.com/v2/${match[1]}/counterlab-runner/manifests/git-${registryCommit}`,
    {
      headers: {
        Accept:
          "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
        Authorization: authorization,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (existing.ok) {
    const bytes = Buffer.from(await existing.arrayBuffer());
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const manifest = JSON.parse(bytes.toString("utf8")) as {
      schemaVersion?: number;
      config?: { digest?: string };
    };
    if (
      digest !== input.expectedManifestDigest ||
      existing.headers.get("Docker-Content-Digest") !== digest ||
      manifest.schemaVersion !== 2 ||
      manifest.config?.digest !== input.expectedConfigDigest
    ) {
      throw new Error(
        "source-bound registry tag already exists with different bytes",
      );
    }
    return;
  }
  if (existing.status !== 404) {
    throw new Error(
      `source-bound registry tag preflight failed (${existing.status})`,
    );
  }
  execFileSync(
    input.runtimeAdapter,
    runtimeAdapterArguments([
      "login",
      "--username",
      credentials.username,
      "--password-stdin",
      "registry.cloudflare.com",
    ]),
    {
      cwd: input.root,
      input: credentials.password,
      stdio: ["pipe", "inherit", "inherit"],
      timeout: 30_000,
    },
  );
  execFileSync(
    input.runtimeAdapter,
    runtimeAdapterArguments([
      "tag",
      input.expectedConfigDigest,
      input.registryImage,
    ]),
    { cwd: input.root, stdio: "inherit", timeout: 30_000 },
  );
  execFileSync(
    input.runtimeAdapter,
    runtimeAdapterArguments(["push", input.registryImage]),
    {
      cwd: input.root,
      stdio: "inherit",
      timeout: 10 * 60_000,
    },
  );
}

function argumentsFrom(argv: string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      ![
        "--build-receipt",
        "--timeout-receipt",
        "--registry-image",
        "--output",
      ].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error(
        "Usage: qualify-runner-release --build-receipt FILE --timeout-receipt FILE --registry-image URI --output FILE",
      );
    }
    values.set(flag, value);
  }
  if (values.size !== 4) {
    throw new Error(
      "Usage: qualify-runner-release --build-receipt FILE --timeout-receipt FILE --registry-image URI --output FILE",
    );
  }
  return {
    buildReceipt: values.get("--build-receipt")!,
    timeoutReceipt: values.get("--timeout-receipt")!,
    registryImage: values.get("--registry-image")!,
    output: values.get("--output")!,
  };
}

async function main(): Promise<void> {
  const args = argumentsFrom(process.argv.slice(2));
  const root = await realpath(resolve(import.meta.dirname, ".."));
  await existingRepositoryFile(root, "COUNTERLAB_REPO_ROOT");
  await configureContainedEnvironment(root);
  if (commandText(root, "git", ["rev-parse", "--show-toplevel"]) !== root) {
    throw new Error("runner qualification requires the verified Git root");
  }
  const output = await repositoryOutputPath(root, args.output);
  const isolationOutput = await repositoryOutputPath(
    root,
    `${output}.generation-isolation-${Date.now()}-${process.pid}.json`,
  );
  const buildReceiptPath = await existingRepositoryFile(
    root,
    args.buildReceipt,
  );
  const timeoutReceiptPath = await existingRepositoryFile(
    root,
    args.timeoutReceipt,
  );
  const buildReceiptBytes = await readFile(buildReceiptPath);
  const buildReceipt = BuildReceiptSchema.parse(
    JSON.parse(buildReceiptBytes.toString("utf8")) as unknown,
  );
  if (
    buildReceipt.localImageTag !==
      `counterlab-runner:git-${buildReceipt.sourceCommit}` ||
    buildReceipt.adapterImageTag !==
      `counterlab-adapter:git-${buildReceipt.sourceCommit}` ||
    buildReceipt.adapterOciRevision !== buildReceipt.sourceCommit ||
    buildReceipt.adapterOciSourceTreeSha256 !== buildReceipt.sourceTreeSha256
  ) {
    throw new Error("build receipt image provenance is inconsistent");
  }
  const [vulnerabilityReportPath, vexApplicationReportPath] = await Promise.all(
    [
      existingRepositoryFile(root, "docs/sbom/vulnerability-report.json"),
      existingRepositoryFile(root, "docs/sbom/vex-application-report.json"),
    ],
  );
  const [vulnerabilityReport, vexApplicationReport] = (
    await Promise.all([
      readFile(vulnerabilityReportPath, "utf8"),
      readFile(vexApplicationReportPath, "utf8"),
    ])
  ).map((value) => JSON.parse(value) as unknown);
  assertCurrentGrypeReleaseEvidenceBinding(
    vulnerabilityReport,
    vexApplicationReport,
    {
      imageDigest: buildReceipt.localImageDigest,
      manifestDigest: buildReceipt.localManifestDigest,
    },
  );
  assertCleanWorktree(root);
  const runtimeAdapter = await repositoryExecutable(
    root,
    process.env.COUNTERLAB_DOCKER_BIN,
  );
  let runtimeAttestation = observeRuntimeAttestation(root, runtimeAdapter);
  assertBuildRuntimeBinding(buildReceipt, runtimeAttestation);
  const timeoutProof = await validateTimeoutCleanupProof({
    root,
    receiptPath: timeoutReceiptPath,
    expectedBuildReceiptPath: buildReceiptPath,
    expectedBuildReceiptBytes: buildReceiptBytes,
    expected: {
      sourceCommit: buildReceipt.sourceCommit,
      sourceTreeSha256: buildReceipt.sourceTreeSha256,
      adapterImageTag: buildReceipt.adapterImageTag,
      adapterImageDigest: buildReceipt.adapterImageDigest,
      adapterManifestDigest: buildReceipt.adapterManifestDigest,
      adapterOciArchiveSha256: buildReceipt.adapterOciArchiveSha256,
      runtimeToolchainSha256: buildReceipt.runtimeToolchainSha256,
      runtimePolicySha256: buildReceipt.runtimePolicySha256,
      proofDependencyManifestSha256: buildReceipt.proofDependencyManifestSha256,
    },
    runtimeAttestation,
  });
  if (
    Date.parse(timeoutProof.timeoutVerifiedAt) <
    Date.parse(buildReceipt.builtAt)
  ) {
    throw new Error("timeout cleanup proof predates the source-bound build");
  }
  const ociArchive = await existingRepositoryFile(
    root,
    buildReceipt.localOciArchive,
  );
  const archiveHash = createHash("sha256")
    .update(await readFile(ociArchive))
    .digest("hex");
  if (archiveHash !== buildReceipt.localOciArchiveSha256) {
    throw new Error("normalized OCI archive changed after the runner build");
  }
  const adapterOciArchive = await existingRepositoryFile(
    root,
    buildReceipt.adapterOciArchive,
  );
  const adapterArchiveHash = createHash("sha256")
    .update(await readFile(adapterOciArchive))
    .digest("hex");
  if (adapterArchiveHash !== buildReceipt.adapterOciArchiveSha256) {
    throw new Error("adapter OCI archive changed after the source-bound build");
  }

  execFileSync(
    runtimeAdapter,
    runtimeAdapterArguments([
      "load",
      "--platform",
      "linux/amd64",
      "--input",
      ociArchive,
    ]),
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  execFileSync(
    runtimeAdapter,
    runtimeAdapterArguments([
      "load",
      "--platform",
      "linux/amd64",
      "--input",
      adapterOciArchive,
    ]),
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  if (
    observeLocalImageDigest(
      root,
      runtimeAdapter,
      buildReceipt.localImageTag,
    ) !== buildReceipt.localImageDigest
  ) {
    throw new Error("imported runner image does not match its build receipt");
  }
  if (
    observeLocalImageDigest(
      root,
      runtimeAdapter,
      buildReceipt.adapterImageTag,
    ) !== buildReceipt.adapterImageDigest
  ) {
    throw new Error("imported adapter image does not match its build receipt");
  }
  if (
    commandText(
      root,
      runtimeAdapter,
      runtimeAdapterArguments([
        "image",
        "inspect",
        buildReceipt.adapterImageTag,
        "--format",
        "{{.Config.User}}",
      ]),
    ) !== "65532:65532" ||
    commandText(
      root,
      runtimeAdapter,
      runtimeAdapterArguments([
        "image",
        "inspect",
        buildReceipt.adapterImageTag,
        "--format",
        '{{index .Config.Labels "org.opencontainers.image.revision"}}',
      ]),
    ) !== buildReceipt.sourceCommit ||
    commandText(
      root,
      runtimeAdapter,
      runtimeAdapterArguments([
        "image",
        "inspect",
        buildReceipt.adapterImageTag,
        "--format",
        '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}',
      ]),
    ) !== buildReceipt.sourceTreeSha256
  ) {
    throw new Error("imported adapter image provenance is invalid");
  }

  execFileSync(
    "bash",
    [
      "scripts/verify-scientific-engines.sh",
      "--image",
      buildReceipt.localImageTag,
      "--expected-image-digest",
      buildReceipt.localImageDigest,
      "--generation-isolation-report",
      isolationOutput,
    ],
    {
      cwd: root,
      env: { ...process.env, COUNTERLAB_DOCKER_BIN: runtimeAdapter },
      stdio: "inherit",
    },
  );
  const readGenerationIsolation = async () => {
    const evidence = GenerationIsolationEvidenceSchema.parse(
      JSON.parse(await readFile(isolationOutput, "utf8")) as unknown,
    );
    return verifyGenerationIsolationEvidence({
      evidence,
      evidenceSha256: hashGenerationIsolationEvidence(evidence),
      expected: {
        sourceCommit: buildReceipt.sourceCommit,
        sourceTreeSha256: buildReceipt.sourceTreeSha256,
        localImageTag: buildReceipt.localImageTag,
        localImageDigest: buildReceipt.localImageDigest,
      },
    });
  };
  const initialGenerationIsolation = await readGenerationIsolation();
  assertCleanWorktree(root);

  runtimeAttestation = observeRuntimeAttestation(root, runtimeAdapter);
  assertBuildRuntimeBinding(buildReceipt, runtimeAttestation);

  if (
    observeLocalImageDigest(
      root,
      runtimeAdapter,
      buildReceipt.localImageTag,
    ) !== buildReceipt.localImageDigest
  ) {
    throw new Error("runner image changed during scientific verification");
  }
  if (
    observeLocalImageDigest(
      root,
      runtimeAdapter,
      buildReceipt.adapterImageTag,
    ) !== buildReceipt.adapterImageDigest
  ) {
    throw new Error("adapter image changed during scientific verification");
  }

  for (const [label, expected, observed] of [
    [
      "source archive",
      buildReceipt.sourceArchiveSha256,
      sha256Command(root, "git", [
        "archive",
        "--format=tar",
        buildReceipt.sourceCommit,
      ]),
    ],
    [
      "source tree",
      buildReceipt.sourceTreeSha256,
      sha256Command(root, "git", [
        "ls-tree",
        "-r",
        "--full-tree",
        buildReceipt.sourceCommit,
      ]),
    ],
    [
      "hosted runner Dockerfile",
      buildReceipt.dockerfileSha256,
      sha256Command(root, "git", [
        "show",
        `${buildReceipt.sourceCommit}:Dockerfile.runner`,
      ]),
    ],
    [
      "adapter Dockerfile",
      buildReceipt.adapterDockerfileSha256,
      sha256Command(root, "git", [
        "show",
        `${buildReceipt.sourceCommit}:services/runner/Dockerfile`,
      ]),
    ],
  ] as const) {
    if (expected !== observed) {
      throw new Error(`${label} changed before registry promotion`);
    }
  }

  await promoteImage({
    root,
    runtimeAdapter,
    localImage: buildReceipt.localImageTag,
    registryImage: args.registryImage,
    expectedConfigDigest: buildReceipt.localImageDigest,
    expectedManifestDigest: buildReceipt.localManifestDigest,
  });
  assertCleanWorktree(root);
  runtimeAttestation = observeRuntimeAttestation(root, runtimeAdapter);
  assertBuildRuntimeBinding(buildReceipt, runtimeAttestation);

  const releaseObservation = await collectRunnerReleaseEvidence({
    root,
    sourceCommit: buildReceipt.sourceCommit,
    localImageTag: buildReceipt.localImageTag,
    runtimeAdapter,
    expectedRegistryDigest: buildReceipt.localManifestDigest,
    registryImage: args.registryImage,
    adapterImageTag: buildReceipt.adapterImageTag,
    adapterManifestDigest: buildReceipt.adapterManifestDigest,
    adapterOciArchiveSha256: buildReceipt.adapterOciArchiveSha256,
  });
  const generationIsolation = await readGenerationIsolation();
  if (
    generationIsolation.evidenceSha256 !==
      initialGenerationIsolation.evidenceSha256 ||
    generationIsolation.probeSha256 !== initialGenerationIsolation.probeSha256
  ) {
    throw new Error(
      "generation-isolation evidence changed during qualification",
    );
  }
  const observation = {
    ...releaseObservation,
    ...timeoutProof,
    generationFilesystemReadIsolation: "OS_ENFORCED" as const,
    generationIsolationEvidence: generationIsolation.evidence,
    generationIsolationEvidenceSha256: generationIsolation.evidenceSha256,
    generationIsolationProbeSha256: generationIsolation.probeSha256,
    generationIsolationVerifiedAt: generationIsolation.evidence.verifiedAt,
  };
  for (const [label, built, observed] of [
    [
      "source archive",
      buildReceipt.sourceArchiveSha256,
      observation.sourceArchiveSha256,
    ],
    [
      "source tree",
      buildReceipt.sourceTreeSha256,
      observation.sourceTreeSha256,
    ],
    ["Dockerfile", buildReceipt.dockerfileSha256, observation.dockerfileSha256],
    [
      "local image",
      buildReceipt.localImageDigest,
      observation.localImageDigest,
    ],
    [
      "runtime toolchain",
      buildReceipt.runtimeToolchainSha256,
      observation.runtimeToolchainSha256,
    ],
    [
      "toolchain lock",
      buildReceipt.toolchainLockSha256,
      observation.toolchainLockSha256,
    ],
    [
      "runtime adapter",
      buildReceipt.runtimeAdapterSha256,
      observation.runtimeAdapterSha256,
    ],
    ["buildctl", buildReceipt.buildctlSha256, observation.buildctlSha256],
    ["buildkitd", buildReceipt.buildkitdSha256, observation.buildkitdSha256],
    [
      "BuildKit config",
      buildReceipt.buildkitConfigSha256,
      observation.buildkitConfigSha256,
    ],
    [
      "adapter Dockerfile",
      buildReceipt.adapterDockerfileSha256,
      observation.adapterDockerfileSha256,
    ],
    [
      "adapter image",
      buildReceipt.adapterImageDigest,
      observation.adapterImageDigest,
    ],
    [
      "adapter manifest",
      buildReceipt.adapterManifestDigest,
      observation.adapterManifestDigest,
    ],
    [
      "adapter OCI archive",
      buildReceipt.adapterOciArchiveSha256,
      observation.adapterOciArchiveSha256,
    ],
    [
      "adapter OCI revision",
      buildReceipt.adapterOciRevision,
      observation.adapterOciRevision,
    ],
    [
      "adapter source tree",
      buildReceipt.adapterOciSourceTreeSha256,
      observation.adapterOciSourceTreeSha256,
    ],
  ] as const) {
    if (built !== observed) {
      throw new Error(`${label} changed after the source-bound runner build`);
    }
  }

  assertCleanWorktree(root);
  if (
    commandText(root, "git", ["rev-parse", "HEAD"]) !==
    observation.currentCommit
  ) {
    throw new Error("qualification HEAD changed before receipt creation");
  }
  runtimeAttestation = observeRuntimeAttestation(root, runtimeAdapter);
  assertBuildRuntimeBinding(buildReceipt, runtimeAttestation);
  const finalTimeoutProof = await validateTimeoutCleanupProof({
    root,
    receiptPath: timeoutReceiptPath,
    expectedBuildReceiptPath: buildReceiptPath,
    expectedBuildReceiptBytes: buildReceiptBytes,
    expected: {
      sourceCommit: buildReceipt.sourceCommit,
      sourceTreeSha256: buildReceipt.sourceTreeSha256,
      adapterImageTag: buildReceipt.adapterImageTag,
      adapterImageDigest: buildReceipt.adapterImageDigest,
      adapterManifestDigest: buildReceipt.adapterManifestDigest,
      adapterOciArchiveSha256: buildReceipt.adapterOciArchiveSha256,
      runtimeToolchainSha256: buildReceipt.runtimeToolchainSha256,
      runtimePolicySha256: buildReceipt.runtimePolicySha256,
      proofDependencyManifestSha256: buildReceipt.proofDependencyManifestSha256,
    },
    runtimeAttestation,
  });
  if (JSON.stringify(finalTimeoutProof) !== JSON.stringify(timeoutProof)) {
    throw new Error("timeout cleanup proof changed during qualification");
  }
  if (
    observeLocalImageDigest(
      root,
      runtimeAdapter,
      buildReceipt.localImageTag,
    ) !== buildReceipt.localImageDigest ||
    observeLocalImageDigest(
      root,
      runtimeAdapter,
      buildReceipt.adapterImageTag,
    ) !== buildReceipt.adapterImageDigest
  ) {
    throw new Error("qualified image changed before receipt creation");
  }
  const receipt = createQualifiedRunnerRelease(observation);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log(`Qualified runner receipt: ${output}`);
}

await main();
