import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  canonicalizeScientificEngineSnapshot,
  hashScientificEngineSnapshot,
  validateScientificEngineSnapshot,
} from "../packages/scientific-engine-registry/src/index.js";

const root = resolve(import.meta.dirname, "..");
const engines = resolve(root, "scientific-engines");

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(engines, path), "utf8")) as unknown;
}

const snapshot = {
  schemaVersion: "1",
  registry: await json("registry.json"),
  bindings: await json("subject-pack-bindings.json"),
  runtimeManifest: await json("runtime-manifest.json"),
  evidenceCatalog: await json("evidence-catalog.json"),
};

const parsed = await validateScientificEngineSnapshot(snapshot);
const canonical = `${canonicalizeScientificEngineSnapshot(parsed)}\n`;
const authorityHash = await hashScientificEngineSnapshot(parsed);
const fileSha256 = createHash("sha256").update(canonical).digest("hex");

await writeFile(resolve(engines, "snapshot.json"), canonical, "utf8");
await writeFile(
  resolve(engines, "snapshot-hash.json"),
  `${JSON.stringify(
    {
      schemaVersion: "1",
      environmentId: parsed.runtimeManifest.environmentId,
      environmentKind: parsed.runtimeManifest.environmentKind,
      generatedAt: parsed.runtimeManifest.generatedAt,
      authorityHash,
      snapshotFileSha256: fileSha256,
      registryHash: parsed.runtimeManifest.registryHash,
      bindingsHash: parsed.runtimeManifest.bindingsHash,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Scientific engine snapshot ${authorityHash}`);
