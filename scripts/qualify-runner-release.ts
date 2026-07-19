import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { z } from "zod";

import {
  collectRunnerReleaseEvidence,
  createQualifiedRunnerRelease,
} from "./prepare-qualified-deploy.js";
import { ContainedRuntimeAttestationSchema } from "../packages/scientific-engine-registry/src/index.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const BuildReceiptSchema = z.strictObject({
  schemaVersion: z.literal("3"),
  status: z.literal("BUILT"),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  sourceArchiveSha256: Sha256Schema,
  sourceTreeSha256: Sha256Schema,
  dockerfileSha256: Sha256Schema,
  localImageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
  localImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  localManifestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  localOciArchive: z.string().min(1),
  localOciArchiveSha256: Sha256Schema,
  adapterDockerfileSha256: Sha256Schema,
  adapterImageTag: z.string().regex(/^counterlab-adapter:git-[a-f0-9]{40}$/),
  adapterImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  adapterManifestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  adapterOciArchive: z.string().min(1),
  adapterOciArchiveSha256: Sha256Schema,
  adapterOciRevision: z.string().regex(/^[a-f0-9]{40}$/),
  adapterOciSourceTreeSha256: Sha256Schema,
  runtimeToolchainSha256: Sha256Schema,
  toolchainLockSha256: Sha256Schema,
  runtimeAdapterSha256: Sha256Schema,
  buildctlSha256: Sha256Schema,
  buildkitdSha256: Sha256Schema,
  buildkitConfigSha256: Sha256Schema,
  builtAt: z.iso.datetime({ offset: true }),
});

const RegistryCredentialsSchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(32),
  })
  .passthrough();

type Arguments = {
  buildReceipt: string;
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

async function existingRepositoryFile(
  root: string,
  requested: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate)) {
    throw new Error(`qualification input escapes the repository: ${requested}`);
  }
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
  const parent = await realpath(dirname(output));
  if (!isRepositoryPath(root, parent)) {
    throw new Error(
      `qualification output parent escapes the repository: ${requested}`,
    );
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

function observeLocalImageDigest(
  root: string,
  runtimeAdapter: string,
  image: string,
): string {
  const digest = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    image,
    "--format",
    "{{.Id}}",
  ]);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error("runtime adapter returned an invalid local image digest");
  }
  return digest;
}

function observeRuntimeAttestation(root: string, runtimeAdapter: string) {
  return ContainedRuntimeAttestationSchema.parse(
    JSON.parse(
      commandText(root, runtimeAdapter, ["counterlab-attest"]),
    ) as unknown,
  );
}

function assertBuildRuntimeBinding(
  buildReceipt: z.infer<typeof BuildReceiptSchema>,
  runtime: z.infer<typeof ContainedRuntimeAttestationSchema>,
): void {
  const bindings = [
    [
      "runtime toolchain",
      buildReceipt.runtimeToolchainSha256,
      runtime.runtimeToolchainSha256,
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
  await Promise.all(
    Object.values(environment).map((path) => mkdir(path, { recursive: true })),
  );
  Object.assign(process.env, environment, { CI: "1" });
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
    [
      "login",
      "--username",
      credentials.username,
      "--password-stdin",
      "registry.cloudflare.com",
    ],
    {
      cwd: input.root,
      input: credentials.password,
      stdio: ["pipe", "inherit", "inherit"],
      timeout: 30_000,
    },
  );
  execFileSync(
    input.runtimeAdapter,
    ["tag", input.localImage, input.registryImage],
    { cwd: input.root, stdio: "inherit", timeout: 30_000 },
  );
  execFileSync(input.runtimeAdapter, ["push", input.registryImage], {
    cwd: input.root,
    stdio: "inherit",
    timeout: 10 * 60_000,
  });
}

function argumentsFrom(argv: string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !["--build-receipt", "--registry-image", "--output"].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error(
        "Usage: qualify-runner-release --build-receipt FILE --registry-image URI --output FILE",
      );
    }
    values.set(flag, value);
  }
  if (values.size !== 3) {
    throw new Error(
      "Usage: qualify-runner-release --build-receipt FILE --registry-image URI --output FILE",
    );
  }
  return {
    buildReceipt: values.get("--build-receipt")!,
    registryImage: values.get("--registry-image")!,
    output: values.get("--output")!,
  };
}

async function main(): Promise<void> {
  const args = argumentsFrom(process.argv.slice(2));
  const root = await realpath(resolve(import.meta.dirname, ".."));
  await configureContainedEnvironment(root);
  const buildReceiptPath = await existingRepositoryFile(
    root,
    args.buildReceipt,
  );
  const buildReceipt = BuildReceiptSchema.parse(
    JSON.parse(await readFile(buildReceiptPath, "utf8")) as unknown,
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
  assertCleanWorktree(root);
  const runtimeAdapter = await repositoryExecutable(
    root,
    process.env.COUNTERLAB_DOCKER_BIN,
  );
  let runtimeAttestation = observeRuntimeAttestation(root, runtimeAdapter);
  assertBuildRuntimeBinding(buildReceipt, runtimeAttestation);
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

  execFileSync(runtimeAdapter, ["load", "--input", ociArchive], {
    cwd: root,
    stdio: "inherit",
  });
  execFileSync(runtimeAdapter, ["load", "--input", adapterOciArchive], {
    cwd: root,
    stdio: "inherit",
  });
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
    commandText(root, runtimeAdapter, [
      "image",
      "inspect",
      buildReceipt.adapterImageTag,
      "--format",
      "{{.Config.User}}",
    ]) !== "65532:65532" ||
    commandText(root, runtimeAdapter, [
      "image",
      "inspect",
      buildReceipt.adapterImageTag,
      "--format",
      '{{index .Config.Labels "org.opencontainers.image.revision"}}',
    ]) !== buildReceipt.sourceCommit ||
    commandText(root, runtimeAdapter, [
      "image",
      "inspect",
      buildReceipt.adapterImageTag,
      "--format",
      '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}',
    ]) !== buildReceipt.sourceTreeSha256
  ) {
    throw new Error("imported adapter image provenance is invalid");
  }

  execFileSync(
    "bash",
    [
      "scripts/verify-scientific-engines.sh",
      "--image",
      buildReceipt.localImageTag,
    ],
    {
      cwd: root,
      env: { ...process.env, COUNTERLAB_DOCKER_BIN: runtimeAdapter },
      stdio: "inherit",
    },
  );
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

  const observation = await collectRunnerReleaseEvidence({
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
  const output = await repositoryOutputPath(root, args.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log(`Qualified runner receipt: ${output}`);
}

await main();
