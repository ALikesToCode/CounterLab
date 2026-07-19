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
const refreshScript = resolve(
  root,
  "scripts/refresh-source-bound-scientific-evidence.sh",
);
const trackedRawPath = resolve(root, "docs/sbom/grype-raw.json");
const trackedRunnerSbomPath = resolve(
  root,
  "docs/sbom/runner-container.cdx.json",
);
const rawFixture = JSON.parse(readFileSync(trackedRawPath, "utf8")) as {
  source: {
    target: {
      imageID: string;
      labels: Record<string, string>;
    };
  };
};
const sourceCommit =
  rawFixture.source.target.labels["org.opencontainers.image.revision"];
const imageDigest = rawFixture.source.target.imageID;
const generatedAt = "2026-07-19T12:00:00.000Z";
const runNonce = `${Date.now()}${process.pid}`;
let fixtureSequence = 0;

if (sourceCommit === undefined) {
  throw new Error("Tracked scanner fixture lacks a source revision label");
}

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
  copyFileSync(trackedRawPath, raw);
  writeFileSync(
    receipt,
    `${JSON.stringify(
      {
        schemaVersion: "3",
        status: "BUILT",
        sourceCommit,
        localImageTag: `counterlab-runner:git-${sourceCommit}`,
        localImageDigest: imageDigest,
        localOciArchive: repositoryRelative(resolve(stage, "runner.oci")),
        localOciArchiveSha256: "a".repeat(64),
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
        title: "CISA Known Exploited Vulnerabilities Catalog",
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
      "@id": `pkg:oci/counterlab-runner@${imageDigest}`,
      subcomponents: [{ "@id": "pkg:generic/python@3.13.14" }],
    });
    expect(negative.statements[0]?.products[0]?.subcomponents).toEqual([
      { "@id": "pkg:generic/python-negative-control@3.13.14" },
    ]);
  });

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
      '--runtime-report "${WORK}/runtime-verification.json"',
    );
    expect(refresh).not.toContain("/dev/null");
    expect(checkMode).toBeGreaterThan(0);
    expect(writeMode).toBeGreaterThan(checkMode);
  });
});
