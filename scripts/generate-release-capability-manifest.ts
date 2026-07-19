import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { releasedPackClaimManifest } from "../packages/concept-registry/src/index.js";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "docs/RELEASE_CAPABILITY_MANIFEST.json");
const manifest = releasedPackClaimManifest();

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
});
