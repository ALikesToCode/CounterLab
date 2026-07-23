import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { relative, resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

const root = process.cwd();
const cacheRoot = resolve(root, "node_modules/.cache/counterlab-v6.1");
const normalizeScript = resolve(root, "scripts/normalize-release-evidence.ts");
const prepareScript = resolve(root, "scripts/prepare-source-bound-vex.ts");
const bindScript = resolve(
  root,
  "scripts/bind-source-bound-scientific-evidence.ts",
);
const containmentScript = resolve(root, "scripts/assert-contained-path.mjs");
const refreshScript = resolve(
  root,
  "scripts/refresh-source-bound-scientific-evidence.sh",
);
const buildScript = resolve(root, "scripts/build-source-bound-runner.sh");
const trackedRawPath = resolve(root, "docs/sbom/grype-raw.json");
const trackedRunnerSbomPath = resolve(
  root,
  "docs/sbom/runner-container.cdx.json",
);
const rawFixture = JSON.parse(readFileSync(trackedRawPath, "utf8")) as {
  source: {
    target: {
      imageID: string;
      manifestDigest: string;
      labels: Record<string, string>;
    };
  };
};
const sourceCommit =
  rawFixture.source.target.labels["org.opencontainers.image.revision"];
const sourceTreeSha256 =
  rawFixture.source.target.labels["io.counterlab.source-tree-sha256"];
const generatedAt = "2026-07-19T12:00:00.000Z";
const runNonce = `${Date.now()}${process.pid}`;
let fixtureSequence = 0;

if (sourceCommit === undefined || sourceTreeSha256 === undefined) {
  throw new Error("Tracked scanner fixture lacks source binding labels");
}

const sourceLabels = {
  "io.counterlab.source-tree-sha256": sourceTreeSha256,
  "org.opencontainers.image.licenses": "MIT",
  "org.opencontainers.image.revision": sourceCommit,
  "org.opencontainers.image.source":
    "https://github.com/ALikesToCode/CounterLab",
};
const embeddedConfig = Buffer.from(
  JSON.stringify({
    architecture: "amd64",
    os: "linux",
    config: { Labels: sourceLabels },
  }),
);
const imageDigest = `sha256:${sha256(embeddedConfig)}`;
const embeddedManifest = Buffer.from(
  JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: imageDigest,
      size: embeddedConfig.byteLength,
    },
    layers: [],
  }),
);
const manifestDigest = `sha256:${sha256(embeddedManifest)}`;

function repositoryRelative(path: string): string {
  return relative(root, path);
}

function runTypeScript(script: string, args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
}

function createStage(commit = sourceCommit): string {
  fixtureSequence += 1;
  const stage = resolve(
    cacheRoot,
    `scientific-evidence-${commit}-20260719T120000Z-${runNonce}${fixtureSequence}`,
  );
  mkdirSync(stage, { mode: 0o700 });
  return stage;
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

type PrepareFixtureOptions = {
  dateReleased?: string;
  includeReviewedVulnerabilityInKev?: boolean;
};

function createPrepareFixture(options: PrepareFixtureOptions = {}) {
  const stage = createStage();
  const receipt = resolve(stage, "build-receipt.json");
  const containerSbom = resolve(stage, "runner-container.cdx.json");
  const raw = resolve(stage, "grype-raw.json");
  const kev = resolve(stage, "cisa-kev.json");
  const reviewOutput = resolve(stage, "reachability-review.json");
  const vexOutput = resolve(stage, "vex.json");
  const negativeVexOutput = resolve(stage, "negative-vex.json");
  const vulnerabilities = Array.from({ length: 1_000 }, (_, index) => ({
    cveID:
      index === 0 ? "CVE-2021-44228" : `CVE-2025-${String(10_000 + index)}`,
  }));
  if (options.includeReviewedVulnerabilityInKev === true) {
    vulnerabilities[1] = { cveID: "CVE-2026-15308" };
  }

  copyFileSync(trackedRunnerSbomPath, containerSbom);
  const ociArchive = resolve(stage, "runner.oci");
  const ociArchiveBytes = Buffer.from("counterlab-test-oci-archive\n", "utf8");
  writeFileSync(ociArchive, ociArchiveBytes, { mode: 0o600 });
  const sourceBoundRaw = structuredClone(rawFixture) as typeof rawFixture & {
    source: {
      type: "image";
      target: {
        userInput: string;
        imageID: string;
        manifestDigest: string;
        mediaType: string;
        tags: string[];
        repoDigests: string[];
        architecture: string;
        os: string;
        labels: Record<string, string>;
        manifest: string;
        config: string;
      };
    };
  };
  sourceBoundRaw.source.type = "image";
  sourceBoundRaw.source.target = {
    ...sourceBoundRaw.source.target,
    userInput: `<COUNTERLAB_REPO_ROOT>/${repositoryRelative(ociArchive)}`,
    imageID: imageDigest,
    manifestDigest,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    tags: [],
    repoDigests: [],
    architecture: "",
    os: "",
    labels: sourceLabels,
    manifest: embeddedManifest.toString("base64"),
    config: embeddedConfig.toString("base64"),
  };
  writeFileSync(raw, `${JSON.stringify(sourceBoundRaw, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  writeFileSync(
    receipt,
    `${JSON.stringify(
      {
        schemaVersion: "4",
        status: "BUILT",
        sourceCommit,
        sourceArchiveSha256: "1".repeat(64),
        sourceTreeSha256,
        dockerfileSha256: "2".repeat(64),
        localImageTag: `counterlab-runner:git-${sourceCommit}`,
        localImageDigest: imageDigest,
        localManifestDigest: manifestDigest,
        localOciArchive: repositoryRelative(ociArchive),
        localOciArchiveSha256: sha256(ociArchiveBytes),
        adapterDockerfileSha256: "3".repeat(64),
        adapterImageTag: `counterlab-adapter:git-${sourceCommit}`,
        adapterImageDigest: `sha256:${"4".repeat(64)}`,
        adapterManifestDigest: `sha256:${"5".repeat(64)}`,
        adapterOciArchive: repositoryRelative(ociArchive),
        adapterOciArchiveSha256: sha256(ociArchiveBytes),
        adapterOciRevision: sourceCommit,
        adapterOciSourceTreeSha256: sourceTreeSha256,
        runtimeToolchainSha256: "6".repeat(64),
        runtimePolicySha256: "7".repeat(64),
        proofDependencyManifestSha256: "8".repeat(64),
        toolchainLockSha256: "9".repeat(64),
        runtimeAdapterSha256: "a".repeat(64),
        buildctlSha256: "b".repeat(64),
        buildkitdSha256: "c".repeat(64),
        buildkitConfigSha256: "d".repeat(64),
        builtAt: generatedAt,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  writeFileSync(
    kev,
    `${JSON.stringify(
      {
        title: "CISA Catalog of Known Exploited Vulnerabilities",
        catalogVersion: "2026.07.19",
        dateReleased: options.dateReleased ?? "2026-07-19T00:00:00.000Z",
        count: vulnerabilities.length,
        vulnerabilities,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );

  const args = [
    "--build-receipt",
    repositoryRelative(receipt),
    "--container-sbom",
    repositoryRelative(containerSbom),
    "--raw",
    repositoryRelative(raw),
    "--kev",
    repositoryRelative(kev),
    "--generated-at",
    generatedAt,
    "--review-output",
    repositoryRelative(reviewOutput),
    "--vex-output",
    repositoryRelative(vexOutput),
    "--negative-vex-output",
    repositoryRelative(negativeVexOutput),
  ];

  return {
    args,
    containerSbom,
    kev,
    negativeVexOutput,
    ociArchive,
    raw,
    receipt,
    reviewOutput,
    stage,
    vexOutput,
  };
}

describe("source-bound release evidence helpers", () => {
  beforeAll(() => {
    mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
  });

  it("normalizes only exact regular staging files", () => {
    const stage = createStage();
    const evidence = resolve(stage, "grype-raw.json");
    writeFileSync(
      evidence,
      `${JSON.stringify({ root, nested: [`${root}/docs`, "unchanged"] })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    const result = runTypeScript(normalizeScript, [
      repositoryRelative(evidence),
    ]);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(evidence, "utf8"))).toEqual({
      root: "<COUNTERLAB_REPO_ROOT>",
      nested: ["<COUNTERLAB_REPO_ROOT>/docs", "unchanged"],
    });
  });

  it("rejects normalization traversal, arbitrary cache files, and symlinks", () => {
    const arbitraryDirectory = resolve(
      cacheRoot,
      `source-bound-normalize-${runNonce}`,
    );
    mkdirSync(arbitraryDirectory, { mode: 0o700 });
    const arbitrary = resolve(arbitraryDirectory, "arbitrary.json");
    writeFileSync(arbitrary, "{}\n", { encoding: "utf8", mode: 0o600 });

    const arbitraryResult = runTypeScript(normalizeScript, [
      repositoryRelative(arbitrary),
    ]);
    expect(arbitraryResult.status).not.toBe(0);
    expect(arbitraryResult.stderr).toMatch(
      /limited to exact evidence staging/u,
    );

    const traversalResult = runTypeScript(normalizeScript, ["../outside.json"]);
    expect(traversalResult.status).not.toBe(0);
    expect(traversalResult.stderr).toMatch(/escapes the repository/u);

    const stage = createStage();
    const target = resolve(stage, "payload.json");
    const symlink = resolve(stage, "grype-vex-applied.json");
    writeFileSync(target, "{}\n", { encoding: "utf8", mode: 0o600 });
    symlinkSync("payload.json", symlink);

    const symlinkResult = runTypeScript(normalizeScript, [
      repositoryRelative(symlink),
    ]);
    expect(symlinkResult.status).not.toBe(0);
    expect(symlinkResult.stderr).toMatch(/not a regular contained file/u);
    expect(readFileSync(target, "utf8")).toBe("{}\n");
  });

  it("rejects a contained Git config path beneath a symlink", () => {
    const stage = createStage();
    const target = resolve(stage, "git-config-target");
    const symlink = resolve(stage, "git-config-link");
    mkdirSync(target, { mode: 0o700 });
    symlinkSync("git-config-target", symlink, "dir");

    const result = spawnSync(
      process.execPath,
      [containmentScript, resolve(symlink, "gitconfig")],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/path contains a symlink/u);
  });

  it("prepares source-bound review and positive/negative VEX documents", () => {
    const fixture = createPrepareFixture();

    const result = runTypeScript(prepareScript, fixture.args);

    expect(result.status, result.stderr).toBe(0);
    const review = JSON.parse(
      readFileSync(fixture.reviewOutput, "utf8"),
    ) as Record<string, unknown>;
    const vex = JSON.parse(readFileSync(fixture.vexOutput, "utf8")) as {
      statements: Array<{
        products: Array<{
          "@id": string;
          subcomponents: Array<{ "@id": string }>;
        }>;
      }>;
    };
    const negative = JSON.parse(
      readFileSync(fixture.negativeVexOutput, "utf8"),
    ) as typeof vex;

    expect(review).toMatchObject({
      schemaVersion: "2",
      vulnerabilityId: "CVE-2026-15308",
      imageDigest,
      sourceCommit,
      reviewedAt: generatedAt,
      expiresAt: "2026-08-02T12:00:00.000Z",
      kevStatus: "NOT_LISTED",
      kevCatalogVersion: "2026.07.19",
      kevCatalogCount: 1_000,
      kevDateReleased: "2026-07-19T00:00:00.000Z",
      sbomSha256: sha256(readFileSync(fixture.containerSbom)),
      kevCatalogSha256: sha256(readFileSync(fixture.kev)),
    });
    expect(vex.statements[0]?.products[0]).toEqual({
      "@id": `counterlab-runner:git-${sourceCommit}`,
      subcomponents: [{ "@id": "pkg:generic/python@3.13.14" }],
    });
    expect(negative.statements[0]?.products[0]?.subcomponents).toEqual([
      { "@id": "pkg:generic/python-negative-control@3.13.14" },
    ]);
  });

  it("rejects source-bound OCI identity drift before creating outputs", () => {
    const assertRejected = (
      fixture: ReturnType<typeof createPrepareFixture>,
      message: RegExp,
    ) => {
      const result = runTypeScript(prepareScript, fixture.args);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(message);
      expect(existsSync(fixture.reviewOutput)).toBe(false);
      expect(existsSync(fixture.vexOutput)).toBe(false);
      expect(existsSync(fixture.negativeVexOutput)).toBe(false);
    };
    const readRaw = (fixture: ReturnType<typeof createPrepareFixture>) =>
      JSON.parse(readFileSync(fixture.raw, "utf8")) as {
        source: {
          target: {
            userInput: string;
            manifestDigest: string;
            tags: string[];
            labels: Record<string, string>;
          };
        };
      };
    const writeRaw = (
      fixture: ReturnType<typeof createPrepareFixture>,
      value: ReturnType<typeof readRaw>,
    ) =>
      writeFileSync(fixture.raw, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });

    const wrongInput = createPrepareFixture();
    const wrongInputRaw = readRaw(wrongInput);
    wrongInputRaw.source.target.userInput =
      "<COUNTERLAB_REPO_ROOT>/wrong/runner.oci";
    writeRaw(wrongInput, wrongInputRaw);
    assertRejected(wrongInput, /exact untagged source-bound OCI archive/u);

    const tagged = createPrepareFixture();
    const taggedRaw = readRaw(tagged);
    taggedRaw.source.target.tags = ["counterlab-runner:unexpected"];
    writeRaw(tagged, taggedRaw);
    assertRejected(tagged, /exact untagged source-bound OCI archive/u);

    const wrongManifest = createPrepareFixture();
    const wrongManifestRaw = readRaw(wrongManifest);
    wrongManifestRaw.source.target.manifestDigest = `sha256:${"9".repeat(64)}`;
    writeRaw(wrongManifest, wrongManifestRaw);
    assertRejected(wrongManifest, /manifestDigest does not bind/u);

    const wrongSource = createPrepareFixture();
    const wrongSourceRaw = readRaw(wrongSource);
    wrongSourceRaw.source.target.labels["org.opencontainers.image.source"] =
      "https://example.invalid/not-counterlab";
    writeRaw(wrongSource, wrongSourceRaw);
    assertRejected(wrongSource, /embedded manifest or config contradicts/u);

    const changedArchive = createPrepareFixture();
    writeFileSync(changedArchive.ociArchive, "changed archive bytes\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    assertRejected(changedArchive, /archive hash does not match/u);

    const unknownReceiptField = createPrepareFixture();
    const receiptWithUnknownField = JSON.parse(
      readFileSync(unknownReceiptField.receipt, "utf8"),
    ) as Record<string, unknown>;
    receiptWithUnknownField.unreviewedExtension = true;
    writeFileSync(
      unknownReceiptField.receipt,
      `${JSON.stringify(receiptWithUnknownField, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    assertRejected(unknownReceiptField, /Unrecognized key/u);

    const missingManifest = createPrepareFixture();
    const receipt = JSON.parse(
      readFileSync(missingManifest.receipt, "utf8"),
    ) as Record<string, unknown>;
    delete receipt.localManifestDigest;
    writeFileSync(
      missingManifest.receipt,
      `${JSON.stringify(receipt, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    assertRejected(missingManifest, /localManifestDigest/u);
  }, 30_000);

  it("rejects an invalid KEV timestamp and a newly listed vulnerability", () => {
    const malformed = createPrepareFixture({ dateReleased: "not-a-date" });
    const malformedResult = runTypeScript(prepareScript, malformed.args);
    expect(malformedResult.status).not.toBe(0);
    expect(malformedResult.stderr).toMatch(/release timestamp is invalid/u);
    expect(existsSync(malformed.reviewOutput)).toBe(false);
    expect(existsSync(malformed.vexOutput)).toBe(false);
    expect(existsSync(malformed.negativeVexOutput)).toBe(false);

    const newlyListed = createPrepareFixture({
      includeReviewedVulnerabilityInKev: true,
    });
    const listedResult = runTypeScript(prepareScript, newlyListed.args);
    expect(listedResult.status).not.toBe(0);
    expect(listedResult.stderr).toMatch(
      /listed in CISA KEV; VEX generation rejected/u,
    );
    expect(existsSync(newlyListed.reviewOutput)).toBe(false);
    expect(existsSync(newlyListed.vexOutput)).toBe(false);
    expect(existsSync(newlyListed.negativeVexOutput)).toBe(false);

    const stale = createPrepareFixture({
      dateReleased: "2026-07-01T00:00:00.000Z",
    });
    const staleResult = runTypeScript(prepareScript, stale.args);
    expect(staleResult.status).not.toBe(0);
    expect(staleResult.stderr).toMatch(/older than 14 days/u);
    expect(existsSync(stale.reviewOutput)).toBe(false);
    expect(existsSync(stale.vexOutput)).toBe(false);
    expect(existsSync(stale.negativeVexOutput)).toBe(false);
  });

  it("preflights every VEX output before creating any of them", () => {
    const fixture = createPrepareFixture();
    writeFileSync(fixture.negativeVexOutput, "pre-existing\n", {
      encoding: "utf8",
      mode: 0o600,
    });

    const result = runTypeScript(prepareScript, fixture.args);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Refusing to replace VEX staging output/u);
    expect(existsSync(fixture.reviewOutput)).toBe(false);
    expect(existsSync(fixture.vexOutput)).toBe(false);
    expect(readFileSync(fixture.negativeVexOutput, "utf8")).toBe(
      "pre-existing\n",
    );
  });

  it("rejects duplicate VEX outputs and a non-exact staging shape", () => {
    const duplicate = createPrepareFixture();
    const negativeOutputIndex = duplicate.args.indexOf("--negative-vex-output");
    duplicate.args[negativeOutputIndex + 1] = repositoryRelative(
      duplicate.vexOutput,
    );
    const duplicateResult = runTypeScript(prepareScript, duplicate.args);
    expect(duplicateResult.status).not.toBe(0);
    expect(duplicateResult.stderr).toMatch(/three distinct paths/u);

    const nonExact = createPrepareFixture();
    const reviewOutputIndex = nonExact.args.indexOf("--review-output");
    nonExact.args[reviewOutputIndex + 1] = repositoryRelative(
      resolve(nonExact.stage, "review.json"),
    );
    const nonExactResult = runTypeScript(prepareScript, nonExact.args);
    expect(nonExactResult.status).not.toBe(0);
    expect(nonExactResult.stderr).toMatch(/one exact staging directory/u);
  });

  it("rejects escaped binder inputs before reading or writing evidence", () => {
    const result = runTypeScript(bindScript, [
      "--build-receipt",
      "../outside.json",
      "--work",
      repositoryRelative(createStage()),
      "--generated-at",
      generatedAt,
      "--mode",
      "check",
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Path escaped/u);
  });

  it("keeps the refresh lock non-blocking and checks before writing", () => {
    const refresh = readFileSync(refreshScript, "utf8");
    const checkMode = refresh.indexOf("--mode check");
    const writeMode = refresh.indexOf("--mode write");

    expect(refresh).toContain('"${FLOCK_BIN}" -n 9 || {');
    expect(refresh).toContain(
      "Evidence refresh rejects non-evidence worktree changes",
    );
    expect(refresh).toContain('--config "${SYFT_CONFIG}"');
    expect(refresh).toContain(
      'load --platform linux/amd64 --input "${OCI_ARCHIVE}"',
    );
    expect(refresh).toContain('"${RUNTIME_COMMAND[@]}" counterlab-attest');
    expect(refresh).toContain(
      '"${RUNTIME_COMMAND[@]}" load --platform linux/amd64 --input "${OCI_ARCHIVE}"',
    );
    expect(refresh).toContain(
      '"${RUNTIME_COMMAND[@]}" image inspect "${IMAGE}"',
    );
    expect(refresh).toContain('"${RUNTIME_COMMAND[@]}" run \\');
    expect(refresh).not.toContain(
      '"${RUNTIME_ADAPTER}" --session-id "${RUNTIME_SESSION_ID}" -- counterlab-attest',
    );
    expect(refresh).not.toContain('"${RUNTIME_ADAPTER}" load');
    expect(refresh).not.toContain('"${RUNTIME_ADAPTER}" image inspect');
    expect(refresh).not.toContain('"${RUNTIME_ADAPTER}" run \\');
    expect(refresh).toContain(
      '--runtime-report "${WORK}/runtime-verification.json"',
    );
    expect(refresh).toContain('--expected-image-digest "${IMAGE_DIGEST}"');
    expect(refresh).toContain("--ulimit=as=8589934592:8589934592");
    expect(refresh).not.toContain("--ulimit=as=2147483648:2147483648");
    expect(refresh).not.toContain("--ulimit=as=1073741824:1073741824");
    expect(
      refresh.match(/--manifest-digest "\$\{MANIFEST_DIGEST\}"/gu),
    ).toHaveLength(2);
    expect(refresh).not.toContain("/dev/null");
    expect(checkMode).toBeGreaterThan(0);
    expect(writeMode).toBeGreaterThan(checkMode);
  });

  it("uses exact source-bound evidence paths across build and refresh gates", () => {
    const build = readFileSync(buildScript, "utf8");
    const refresh = readFileSync(refreshScript, "utf8");
    const required = [
      "scientific-engines/fixtures/validation/internal-mutations-integrity-v2.json",
      "scientific-engines/fixtures/validation/internal-oracle-integrity-v2.json",
      "scientific-engines/fixtures/validation/internal-renderer-integrity-v2.json",
      "scientific-engines/subject-pack-bindings.json",
    ];

    for (const path of required) {
      expect(build).toContain(path);
      expect(refresh).toContain(path);
    }
    expect(build).not.toContain("docs/sbom/*.json");
    expect(build).not.toContain("scientific-engines/fixtures/health/*.json");
    expect(build).not.toContain("scientific-engines/fixtures/integrity/*.json");
    expect(
      refresh.match(
        /scientific-engines\/fixtures\/validation\/signed-result-binding-v2\.json/gu,
      ),
    ).toHaveLength(2);
  });

  it("uses the exact OCI archive for baseline and the loaded tag for VEX application", () => {
    const refresh = readFileSync(refreshScript, "utf8");

    expect(refresh).toContain(
      '"${GRYPE}" --config "${GRYPE_CONFIG}" "oci-archive:${OCI_ARCHIVE}"',
    );
    expect(refresh).toContain('CONTAINERD_ADDRESS="${CONTAINERD_SOCKET}"');
    expect(refresh).toContain("CONTAINERD_NAMESPACE=counterlab-v6.1");
    expect(
      refresh.match(
        /"\$\{GRYPE\}" --config "\$\{GRYPE_CONFIG\}" "\$\{IMAGE\}"/gu,
      ),
    ).toHaveLength(2);
    expect(refresh).toContain('--loaded-image-tag "${IMAGE}"');
    expect(refresh).toContain('--source-commit "${SOURCE_COMMIT}"');
    expect(refresh).toContain('--source-tree-sha256 "${SOURCE_TREE_SHA256}"');
  });
});
