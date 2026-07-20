import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FrozenClientAssetCollectionSchema,
  FrozenWorkerReleaseManifestSchema,
  canonicalFrozenClientAssetCollection,
  frozenWorkerReleaseIdentity,
  frozenWorkerReleaseManifest,
  frozenWranglerDryRunProjection,
  observedPinnedBuildToolVersions,
  type FrozenWranglerDryRunEntry,
} from "./frozen-worker-release.js";

const hash = (value: Buffer | string): string =>
  createHash("sha256").update(value).digest("hex");

const observedVersions = {
  observedViteVersion: "vite/8.1.4 linux-x64 node-v26.4.0",
  observedWranglerVersion: "4.110.0",
} as const;

function releaseManifest() {
  return frozenWorkerReleaseManifest({
    sourceCommit: "a".repeat(40),
    workerBundleBytes: Buffer.from("worker"),
    clientAssets: [
      { path: "z.js", sha256: hash("z"), size: 1 },
      { path: "_headers", sha256: hash("headers"), size: 7 },
      { path: "a.css", sha256: hash("a"), size: 1 },
    ],
    ...observedVersions,
  });
}

describe("frozen Worker release manifest", () => {
  it("binds one Worker bundle plus canonical full and public client trees", () => {
    const manifest = releaseManifest();

    expect(manifest.clientAssets).toEqual([
      {
        path: "_headers",
        publicPath: null,
        sha256: hash("headers"),
        size: 7,
      },
      { path: "a.css", publicPath: "/a.css", sha256: hash("a"), size: 1 },
      { path: "z.js", publicPath: "/z.js", sha256: hash("z"), size: 1 },
    ]);
    const publicAssets = manifest.clientAssets.filter(
      (asset) => asset.publicPath !== null,
    );
    expect(manifest.workerBundleSha256).toBe(hash("worker"));
    expect(manifest.clientAssetCount).toBe(3);
    expect(manifest.clientPublicAssetCount).toBe(2);
    expect(manifest.clientAssetsSha256).toBe(
      hash(JSON.stringify(manifest.clientAssets)),
    );
    expect(manifest.clientPublicAssetsSha256).toBe(
      hash(JSON.stringify(publicAssets)),
    );
    expect(manifest).toEqual(
      expect.objectContaining({
        classification: "PROCESS_BOUND_PARTIAL",
        viteVersion: "8.1.4",
        wranglerVersion: "4.110.0",
      }),
    );
  });

  it("marks root deploy metadata as non-fetchable without omitting its bytes", () => {
    const collection = canonicalFrozenClientAssetCollection([
      { path: ".assetsignore", sha256: hash("ignore"), size: 6 },
      { path: "_redirects", sha256: hash("redirects"), size: 9 },
      { path: "index.html", sha256: hash("html"), size: 4 },
    ]);

    expect(collection.clientAssets).toEqual([
      expect.objectContaining({ path: ".assetsignore", publicPath: null }),
      expect.objectContaining({ path: "_redirects", publicPath: null }),
      expect.objectContaining({
        path: "index.html",
        publicPath: "/",
      }),
    ]);
    expect(collection.clientAssetCount).toBe(3);
    expect(collection.clientPublicAssetCount).toBe(1);
    expect(collection.clientAssetsSha256).not.toBe(
      collection.clientPublicAssetsSha256,
    );
  });

  it("rejects duplicate or unsafe paths and a metadata-only client tree", () => {
    const index = { path: "index.html", sha256: hash("html"), size: 4 };
    expect(() => canonicalFrozenClientAssetCollection([index, index])).toThrow(
      /unique sorted paths/u,
    );
    expect(() =>
      canonicalFrozenClientAssetCollection([
        { ...index, path: "../index.html" },
      ]),
    ).toThrow();
    expect(() =>
      canonicalFrozenClientAssetCollection([{ ...index, path: "_headers" }]),
    ).toThrow();
  });

  it("rejects full/public count drift, hash drift, path drift, and unknown fields", () => {
    const manifest = releaseManifest();
    const swapped = [
      manifest.clientAssets[1],
      manifest.clientAssets[0],
      manifest.clientAssets[2],
    ];
    const duplicates = [
      manifest.clientAssets[0],
      manifest.clientAssets[0],
      manifest.clientAssets[2],
    ];

    for (const invalid of [
      { ...manifest, clientAssetCount: 4 },
      { ...manifest, clientPublicAssetCount: 3 },
      { ...manifest, clientAssetsSha256: "0".repeat(64) },
      { ...manifest, clientPublicAssetsSha256: "0".repeat(64) },
      { ...manifest, unexpected: true },
      {
        ...manifest,
        clientAssets: manifest.clientAssets.map((asset, index) =>
          index === 0 ? { ...asset, publicPath: "/_headers" } : asset,
        ),
      },
      {
        ...manifest,
        clientAssets: swapped,
        clientAssetsSha256: hash(JSON.stringify(swapped)),
      },
      {
        ...manifest,
        clientAssets: duplicates,
        clientAssetsSha256: hash(JSON.stringify(duplicates)),
      },
    ]) {
      expect(() => FrozenWorkerReleaseManifestSchema.parse(invalid)).toThrow();
    }

    expect(() =>
      FrozenClientAssetCollectionSchema.parse({
        clientAssets: manifest.clientAssets,
        clientAssetsSha256: manifest.clientAssetsSha256,
        clientAssetCount: manifest.clientAssetCount,
        clientPublicAssetsSha256: manifest.clientPublicAssetsSha256,
        clientPublicAssetCount: manifest.clientPublicAssetCount,
        extra: true,
      }),
    ).toThrow();
  });

  it("normalizes observed CLI output but fails closed on toolchain drift", () => {
    expect(
      observedPinnedBuildToolVersions({
        vite: observedVersions.observedViteVersion,
        wrangler: observedVersions.observedWranglerVersion,
      }),
    ).toEqual({ vite: "8.1.4", wrangler: "4.110.0" });

    for (const drift of [
      { vite: "vite/8.1.5 linux-x64 node-v26.4.0", wrangler: "4.110.0" },
      { vite: "vite/8.1.4 linux-x64 node-v26.4.0", wrangler: "4.111.0" },
      { vite: "vite 8.1.4", wrangler: "4.110.0" },
      { vite: "8.1.4", wrangler: "wrangler 4.110.0" },
    ]) {
      expect(() => observedPinnedBuildToolVersions(drift)).toThrow();
    }
  });

  it("requires observed versions when creating a manifest", () => {
    const base = {
      sourceCommit: "a".repeat(40),
      workerBundleBytes: Buffer.from("worker"),
      clientAssets: [{ path: "index.html", sha256: hash("html"), size: 4 }],
    };
    expect(() =>
      frozenWorkerReleaseManifest({
        ...base,
        observedViteVersion: "8.1.5",
        observedWranglerVersion: "4.110.0",
      }),
    ).toThrow();
    expect(() =>
      frozenWorkerReleaseManifest({
        ...base,
        observedViteVersion: "8.1.4",
        observedWranglerVersion: "4.111.0",
      }),
    ).toThrow();
  });

  it("keeps the downstream identity bound to the exact full deploy tree", () => {
    const manifest = releaseManifest();
    const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);

    expect(frozenWorkerReleaseIdentity(manifest, bytes)).toEqual(
      expect.objectContaining({
        schemaVersion: "1",
        classification: "PROCESS_BOUND_PARTIAL",
        manifestSha256: hash(bytes),
        workerBundleSha256: hash("worker"),
        clientAssetsSha256: manifest.clientAssetsSha256,
        clientAssetCount: manifest.clientAssetCount,
        clientPublicAssetsSha256: manifest.clientPublicAssetsSha256,
        clientPublicAssetCount: manifest.clientPublicAssetCount,
        viteVersion: "8.1.4",
        wranglerVersion: "4.110.0",
      }),
    );
  });
});

describe("frozen Wrangler dry-run projection", () => {
  const workerBundleBytes = Buffer.from("exact frozen worker");
  const readme = (timestamp = "2026-07-20T09:15:00.123Z") =>
    Buffer.from(
      `This folder contains the built output assets for the worker "counterlab" generated at ${timestamp}.`,
    );
  const entries: FrozenWranglerDryRunEntry[] = [
    { name: "index.js", kind: "file" },
    { name: "README.md", kind: "file" },
  ];
  const validInput = () => ({
    entries,
    workerBundleBytes,
    indexBytes: Buffer.from(workerBundleBytes),
    readmeBytes: readme(),
  });

  it("accepts exactly README.md plus a byte-identical index.js", () => {
    expect(frozenWranglerDryRunProjection(validInput())).toEqual({
      schemaVersion: "1",
      status: "VERIFIED",
      sha256: hash(workerBundleBytes),
      size: workerBundleBytes.length,
      count: 1,
      readmeGeneratedAt: "2026-07-20T09:15:00.123Z",
    });
  });

  it("rejects every shape and byte negative control", () => {
    const invalidInputs = [
      {
        ...validInput(),
        entries: [...entries, { name: "extra.js", kind: "file" as const }],
      },
      { ...validInput(), entries: entries.slice(0, 1) },
      {
        ...validInput(),
        entries: entries.map((entry) =>
          entry.name === "index.js"
            ? { ...entry, kind: "symlink" as const }
            : entry,
        ),
      },
      { ...validInput(), indexBytes: Buffer.from("changed worker") },
      {
        ...validInput(),
        workerBundleBytes: Buffer.alloc(0),
        indexBytes: Buffer.alloc(0),
      },
      {
        ...validInput(),
        readmeBytes: Buffer.from(
          'This folder contains the built output assets for the worker "other" generated at 2026-07-20T09:15:00.123Z.',
        ),
      },
      {
        ...validInput(),
        readmeBytes: Buffer.concat([readme(), Buffer.from("\n")]),
      },
      { ...validInput(), readmeBytes: readme("2026-13-20T09:15:00.123Z") },
      { ...validInput(), readmeBytes: Buffer.from([0xff]) },
    ];

    for (const invalid of invalidInputs) {
      expect(() => frozenWranglerDryRunProjection(invalid)).toThrow();
    }
  });
});
