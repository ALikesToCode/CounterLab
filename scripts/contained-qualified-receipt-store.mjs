import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sha256CgroupBytes } from "./contained-cgroup-evidence.mjs";
import { createQualifiedContainedRootlessReceipt } from "./contained-qualified-rootless-receipt.mjs";

const repositoryRoot = realpathSync(
  resolve(fileURLToPath(import.meta.url), "../.."),
);
const containerIdPattern = /^[a-f0-9]{64}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const maximumReceiptBytes = 1_048_576;

function contained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

function privateDirectory(path, label) {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new Error(`qualified rootless receipt ${label} is invalid`);
  }
}

function privateFile(path, label) {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o600) !== 0o600 ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size < 1 ||
    metadata.size > maximumReceiptBytes
  ) {
    throw new Error(`qualified rootless receipt ${label} is invalid`);
  }
}

function receiptPaths({ sessionRoot, finalContainerId }) {
  if (
    !isAbsolute(sessionRoot) ||
    !contained(repositoryRoot, sessionRoot) ||
    !containerIdPattern.test(finalContainerId ?? "")
  ) {
    throw new Error("qualified rootless receipt path input is invalid");
  }
  privateDirectory(sessionRoot, "session root");
  const runRoot = resolve(sessionRoot, "run");
  const specRoot = resolve(runRoot, "rootless-specs");
  if (
    !contained(sessionRoot, runRoot) ||
    !contained(runRoot, specRoot) ||
    !contained(repositoryRoot, specRoot)
  ) {
    throw new Error("qualified rootless receipt path escaped the repository");
  }
  privateDirectory(runRoot, "run root");
  privateDirectory(specRoot, "spec root");
  return {
    baseReceiptPath: resolve(specRoot, `${finalContainerId}.receipt.json`),
    qualifiedReceiptPath: resolve(
      specRoot,
      `${finalContainerId}.qualified-receipt.json`,
    ),
  };
}

function readBaseReceipt({
  baseReceiptFileSha256,
  baseReceiptPath,
  finalContainerId,
  sessionRoot,
}) {
  if (!sha256Pattern.test(baseReceiptFileSha256 ?? "")) {
    throw new Error("qualified rootless base receipt hash is invalid");
  }
  const expected = receiptPaths({ sessionRoot, finalContainerId });
  if (baseReceiptPath !== expected.baseReceiptPath) {
    throw new Error("qualified rootless receipt base path changed");
  }
  privateFile(baseReceiptPath, "base receipt");
  const source = readFileSync(baseReceiptPath);
  if (sha256CgroupBytes(source) !== baseReceiptFileSha256) {
    throw new Error("qualified rootless base receipt changed");
  }
  let receipt;
  try {
    receipt = JSON.parse(source.toString("utf8"));
  } catch (error) {
    throw new Error("qualified rootless base receipt JSON is invalid", {
      cause: error,
    });
  }
  if (receipt?.finalContainerId !== finalContainerId) {
    throw new Error("qualified rootless base receipt identity changed");
  }
  return { expected, receipt };
}

export function persistQualifiedContainedRootlessReceipt(input) {
  const { expected, receipt: baseReceipt } = readBaseReceipt(input);
  const qualifiedReceipt = createQualifiedContainedRootlessReceipt({
    aggregateLimitEvidence: input.aggregateLimitEvidence,
    baseReceipt,
    observerBindings: input.observerBindings,
  });
  const source = `${JSON.stringify(qualifiedReceipt, null, 2)}\n`;
  try {
    writeFileSync(expected.qualifiedReceiptPath, source, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("qualified rootless receipt already exists", {
        cause: error,
      });
    }
    throw error;
  }
  privateFile(expected.qualifiedReceiptPath, "qualified receipt");
  return {
    qualifiedReceipt,
    qualifiedReceiptFileSha256: sha256CgroupBytes(source),
    qualifiedReceiptPath: expected.qualifiedReceiptPath,
    qualifiedReceiptPayloadSha256: qualifiedReceipt.receiptPayloadSha256,
  };
}

export function verifyQualifiedContainedRootlessReceipt(input) {
  const { expected, receipt: baseReceipt } = readBaseReceipt(input);
  if (
    input.qualifiedReceiptPath !== expected.qualifiedReceiptPath ||
    !sha256Pattern.test(input.qualifiedReceiptFileSha256 ?? "")
  ) {
    throw new Error("qualified rootless receipt path or hash changed");
  }
  privateFile(input.qualifiedReceiptPath, "qualified receipt");
  const source = readFileSync(input.qualifiedReceiptPath);
  if (sha256CgroupBytes(source) !== input.qualifiedReceiptFileSha256) {
    throw new Error("qualified rootless receipt file changed");
  }
  let qualifiedReceipt;
  try {
    qualifiedReceipt = JSON.parse(source.toString("utf8"));
  } catch (error) {
    throw new Error("qualified rootless receipt JSON is invalid", {
      cause: error,
    });
  }
  const expectedReceipt = createQualifiedContainedRootlessReceipt({
    aggregateLimitEvidence: qualifiedReceipt.aggregateLimitEvidence,
    baseReceipt,
    observerBindings: input.observerBindings,
  });
  const expectedSource = `${JSON.stringify(expectedReceipt, null, 2)}\n`;
  if (!source.equals(Buffer.from(expectedSource))) {
    throw new Error("qualified rootless receipt binding changed");
  }
  return qualifiedReceipt;
}
