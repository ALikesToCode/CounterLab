import { readFileSync } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { qualifiedDeployConfig } from "../../../scripts/prepare-qualified-deploy";

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
    };

    expect(config.assets).toEqual(
      expect.objectContaining({
        directory: "./dist/client",
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*", "/ready"],
      }),
    );
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
    const buildIndex = script.indexOf("pnpm --filter @counterlab/web build");

    expect(verifyIndex).toBeGreaterThan(0);
    expect(buildIndex).toBeGreaterThan(verifyIndex);
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
    expect(script).not.toMatch(/docker build[\s\S]*"\$\{ROOT_DIR\}"/);
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

  it("generates a deploy config from a source-bound qualified image receipt", () => {
    const sourceCommit = "a".repeat(40);
    const evidenceCommit = "2".repeat(40);
    const image = `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`;
    const receipt = {
      schemaVersion: "2",
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
      evidenceCommit,
      registryImage: image,
      registryDigest: `sha256:${"3".repeat(64)}`,
      registryResolvedAt: "2026-07-16T16:20:00.000Z",
      qualifiedAt: "2026-07-16T16:30:00.000Z",
      verifierVersion: "counterlab-release-v2",
    };
    const generated = qualifiedDeployConfig({
      config: {
        account_id: "account-1",
        main: "index.js",
        assets: { directory: "../client" },
        containers: [
          {
            class_name: "CounterLabRunner",
            image: "/unqualified/Dockerfile.runner",
            image_vars: { COUNTERLAB_SOURCE_COMMIT: "0".repeat(40) },
            image_build_context: "/unqualified",
          },
        ],
      },
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
        registryImage: receipt.registryImage,
        registryDigest: receipt.registryDigest,
        registryResolvedAt: receipt.registryResolvedAt,
        currentCommit: evidenceCommit,
        sourceIsAncestor: true,
        changedPaths: ["scientific-engines/snapshot.json"],
        observedAt: "2026-07-16T16:30:00.000Z",
      },
    });

    expect(generated.containers).toEqual([
      expect.objectContaining({ class_name: "CounterLabRunner", image }),
    ]);
    expect(
      (generated.containers as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("image_vars");
    expect(
      (generated.containers as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("image_build_context");
  });

  it("rejects a qualified receipt that does not match recomputed release evidence", () => {
    const sourceCommit = "a".repeat(40);
    const image = `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`;
    const receipt = {
      schemaVersion: "2",
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
      evidenceCommit: "2".repeat(40),
      registryImage: image,
      registryDigest: `sha256:${"3".repeat(64)}`,
      registryResolvedAt: "2026-07-16T15:55:00.000Z",
      qualifiedAt: "2026-07-16T16:00:00.000Z",
      verifierVersion: "counterlab-release-v2",
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
    expect(
      contrast(variables.blue!, "#ffffff"),
      "blue button",
    ).toBeGreaterThanOrEqual(4.5);
  });
});
