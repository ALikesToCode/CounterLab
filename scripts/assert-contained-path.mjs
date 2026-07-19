#!/usr/bin/env node

import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), ".."),
);

function contained(candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

if (process.argv.length < 3) {
  throw new Error("Usage: assert-contained-path PATH [PATH ...]");
}

for (const requested of process.argv.slice(2)) {
  if (requested.length === 0 || requested.includes("\0")) {
    throw new Error("contained path is empty or invalid");
  }
  const candidate = resolve(root, requested);
  if (!contained(candidate)) {
    throw new Error(`path escaped the repository: ${requested}`);
  }
  const fromRoot = relative(root, candidate);
  let current = root;
  for (const part of fromRoot.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (!existsSync(current)) break;
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`path contains a symlink: ${requested}`);
    }
    const physical = realpathSync(current);
    if (!contained(physical)) {
      throw new Error(`path resolved outside the repository: ${requested}`);
    }
  }
}
