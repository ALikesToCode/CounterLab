import { lstat, mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

function isContained(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" ||
    (fromRoot !== ".." &&
      !fromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(fromRoot))
  );
}

async function assertNoSymlinkComponents(
  root: string,
  candidate: string,
  label: string,
): Promise<void> {
  let current = root;
  for (const component of relative(root, candidate).split(sep)) {
    if (component.length === 0) continue;
    current = resolve(current, component);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new Error(`${label} contains a symlink`);
    }
  }
}

export function parseStrictNameValueArgs(
  argv: readonly string[],
  allowed: ReadonlySet<string>,
): Map<string, string> {
  if (argv.length % 2 !== 0) {
    throw new Error("Arguments must be name/value pairs");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Arguments must be name/value pairs");
    }
    if (!allowed.has(key)) throw new Error(`Unknown argument: ${key}`);
    if (values.has(key)) throw new Error(`Duplicate argument: ${key}`);
    values.set(key, value);
  }
  return values;
}

export async function containedInputFile(
  root: string,
  requested: string,
  label: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isContained(root, candidate) || candidate === root) {
    throw new Error(`${label} escapes the repository`);
  }
  await assertNoSymlinkComponents(root, candidate, label);
  const physical = await realpath(candidate);
  const metadata = await lstat(physical);
  if (!isContained(root, physical) || !metadata.isFile()) {
    throw new Error(`${label} is not a regular repository file`);
  }
  return physical;
}

export async function containedDirectory(
  root: string,
  requested: string,
  label: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isContained(root, candidate) || candidate === root) {
    throw new Error(`${label} escapes the repository`);
  }
  await assertNoSymlinkComponents(root, candidate, label);
  const physical = await realpath(candidate);
  const metadata = await lstat(physical);
  if (!isContained(root, physical) || !metadata.isDirectory()) {
    throw new Error(`${label} is not a repository directory`);
  }
  return physical;
}

export async function containedNewOutputFile(
  root: string,
  requested: string,
  label: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isContained(root, candidate) || candidate === root) {
    throw new Error(`${label} escapes the repository`);
  }
  const parent = resolve(candidate, "..");
  await assertNoSymlinkComponents(root, parent, `${label} parent`);
  const physicalParent = await realpath(parent);
  const parentMetadata = await lstat(physicalParent);
  if (!isContained(root, physicalParent) || !parentMetadata.isDirectory()) {
    throw new Error(`${label} parent is not a repository directory`);
  }
  try {
    await lstat(candidate);
    throw new Error(`${label} already exists; refusing to replace it`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return candidate;
}

export async function containedNewOutputDirectory(
  root: string,
  requested: string,
  label: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isContained(root, candidate) || candidate === root) {
    throw new Error(`${label} escapes the repository`);
  }
  const parent = resolve(candidate, "..");
  await assertNoSymlinkComponents(root, parent, `${label} parent`);
  const physicalParent = await realpath(parent);
  const parentMetadata = await lstat(physicalParent);
  if (!isContained(root, physicalParent) || !parentMetadata.isDirectory()) {
    throw new Error(`${label} parent is not a repository directory`);
  }
  try {
    await lstat(candidate);
    throw new Error(`${label} already exists; refusing to replace it`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await mkdir(candidate, { mode: 0o700 });
  await assertNoSymlinkComponents(root, candidate, label);
  const physical = await realpath(candidate);
  const metadata = await lstat(physical);
  if (!isContained(root, physical) || !metadata.isDirectory()) {
    throw new Error(`${label} is not a repository directory`);
  }
  return physical;
}
