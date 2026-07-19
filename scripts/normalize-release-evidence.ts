import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const root = await realpath(resolve(import.meta.dirname, ".."));
const STAGING_FILE =
  /^node_modules\/\.cache\/counterlab-v6\.1\/scientific-evidence-[a-f0-9]{40}-\d{8}T\d{6}Z-\d+\/grype-(?:raw|vex-applied|vex-negative-control)\.json$/;

function contained(path: string): boolean {
  const fromRoot = relative(root, path);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

function normalize(value: unknown): unknown {
  if (typeof value === "string") {
    return value.split(root).join("<COUNTERLAB_REPO_ROOT>");
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

if (process.argv.length < 3) {
  throw new Error(
    "Usage: normalize-release-evidence.ts <repository-json> [repository-json...]",
  );
}

for (const requested of process.argv.slice(2)) {
  const candidate = resolve(root, requested);
  if (!contained(candidate)) {
    throw new Error(
      `Release evidence path escapes the repository: ${requested}`,
    );
  }
  const repositoryRelative = relative(root, candidate);
  if (!STAGING_FILE.test(repositoryRelative)) {
    throw new Error(
      `Release normalization is limited to exact evidence staging files: ${requested}`,
    );
  }
  const requestedMetadata = await lstat(candidate);
  const physical = await realpath(candidate);
  const physicalMetadata = await lstat(physical);
  if (
    requestedMetadata.isSymbolicLink() ||
    !physicalMetadata.isFile() ||
    !contained(physical)
  ) {
    throw new Error(
      `Release evidence path is not a regular contained file: ${requested}`,
    );
  }
  const parsed = JSON.parse(await readFile(physical, "utf8")) as unknown;
  await writeFile(physical, `${JSON.stringify(normalize(parsed), null, 2)}\n`, {
    encoding: "utf8",
  });
}

process.stdout.write(
  `RELEASE_EVIDENCE_NORMALIZED files=${process.argv.length - 2}\n`,
);
