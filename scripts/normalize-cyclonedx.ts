import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type CycloneDx = {
  serialNumber?: unknown;
  metadata?: { timestamp?: unknown; [key: string]: unknown };
  components?: Array<{ "bom-ref"?: string; purl?: string; name?: string }>;
  dependencies?: Array<{ ref?: string; dependsOn?: string[] }>;
  [key: string]: unknown;
};

const paths = process.argv.slice(2);
if (paths.length === 0) {
  throw new Error("Provide at least one CycloneDX JSON path to normalize.");
}

const identity = (value: {
  "bom-ref"?: string;
  purl?: string;
  name?: string;
}): string => value["bom-ref"] ?? value.purl ?? value.name ?? "";

for (const input of paths) {
  const path = resolve(input);
  const bom = JSON.parse(await readFile(path, "utf8")) as CycloneDx;
  delete bom.serialNumber;
  if (bom.metadata) delete bom.metadata.timestamp;
  bom.components?.sort((left, right) =>
    identity(left).localeCompare(identity(right)),
  );
  for (const dependency of bom.dependencies ?? []) {
    dependency.dependsOn?.sort((left, right) => left.localeCompare(right));
  }
  bom.dependencies?.sort((left, right) =>
    (left.ref ?? "").localeCompare(right.ref ?? ""),
  );
  await writeFile(path, `${JSON.stringify(bom, null, 2)}\n`, "utf8");
}
