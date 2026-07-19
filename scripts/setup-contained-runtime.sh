#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "${ROOT_DIR}"

[[ -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "CounterLab repository marker is missing." >&2
  exit 2
}

VERSION="2.3.1"
ARCHIVE_NAME="nerdctl-full-${VERSION}-linux-amd64.tar.gz"
ARCHIVE_SHA256="7a0d8efcf55b10b57d831541266adb9c6ec3d55b44ec041c95f6eb994d1faab9"
CACHE_ROOT="${ROOT_DIR}/node_modules/.cache/counterlab-v6.1"
TOOLS_ROOT="${CACHE_ROOT}/rootless-tools"
DOWNLOAD_ROOT="${TOOLS_ROOT}/downloads"
ARCHIVE_PATH="${DOWNLOAD_ROOT}/${ARCHIVE_NAME}"
INSTALL_ROOT="${TOOLS_ROOT}/install-v${VERSION}"
ATTESTATION_PATH="${INSTALL_ROOT}/counterlab-install-attestation.json"
LOCK_PATH="${ROOT_DIR}/scripts/runtime-toolchain-lock.json"

export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${CACHE_ROOT}/gitconfig"

node scripts/assert-contained-path.mjs \
  "${CACHE_ROOT}" \
  "${HOME}" \
  "${TMPDIR}" \
  "${XDG_CACHE_HOME}" \
  "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" \
  "${GIT_CONFIG_GLOBAL}" \
  "${DOWNLOAD_ROOT}" \
  "${ARCHIVE_PATH}" \
  "${INSTALL_ROOT}" \
  "${ATTESTATION_PATH}"
[[ "$(git rev-parse --show-toplevel)" == "${ROOT_DIR}" ]] || {
  echo "Contained runtime setup must run from the CounterLab Git root." >&2
  exit 2
}

mkdir -p \
  "${HOME}" \
  "${TMPDIR}" \
  "${XDG_CACHE_HOME}" \
  "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" \
  "${DOWNLOAD_ROOT}"
node scripts/assert-contained-path.mjs \
  "${HOME}" \
  "${TMPDIR}" \
  "${XDG_CACHE_HOME}" \
  "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" \
  "${GIT_CONFIG_GLOBAL}" \
  "${DOWNLOAD_ROOT}"

if [[ ! -e "${ARCHIVE_PATH}" ]]; then
  curl --disable --location --fail --show-error \
    --proto '=https' \
    --proto-redir '=https' \
    --output "${ARCHIVE_PATH}" \
    "https://github.com/containerd/nerdctl/releases/download/v${VERSION}/${ARCHIVE_NAME}"
fi
[[ -f "${ARCHIVE_PATH}" && ! -L "${ARCHIVE_PATH}" ]] || {
  echo "Pinned nerdctl archive must be a regular repository-contained file." >&2
  exit 2
}
OBSERVED_ARCHIVE_SHA256="$(sha256sum "${ARCHIVE_PATH}" | cut -d ' ' -f 1)"
[[ "${OBSERVED_ARCHIVE_SHA256}" == "${ARCHIVE_SHA256}" ]] || {
  echo "Pinned nerdctl archive checksum mismatch." >&2
  exit 2
}

if [[ -e "${INSTALL_ROOT}" ]]; then
  [[ -d "${INSTALL_ROOT}" && ! -L "${INSTALL_ROOT}" && -f "${ATTESTATION_PATH}" && ! -L "${ATTESTATION_PATH}" ]] || {
    echo "Existing runtime installation is partial or unsafe; refusing to overwrite it." >&2
    exit 2
  }
else
  mkdir "${INSTALL_ROOT}"
  "${ROOT_DIR}/.venv/bin/python" - "${ARCHIVE_PATH}" "${INSTALL_ROOT}" <<'PY'
from pathlib import Path, PurePosixPath
import sys
import tarfile

archive = Path(sys.argv[1]).resolve(strict=True)
destination = Path(sys.argv[2]).resolve(strict=True)
allowed_roots = {"bin", "lib", "libexec", "share"}
required = {
    "bin/buildctl",
    "bin/buildkitd",
    "bin/containerd",
    "bin/containerd-shim-runc-v2",
    "bin/ctr",
    "bin/nerdctl",
    "bin/rootlesskit",
    "bin/runc",
}

with tarfile.open(archive, mode="r:gz") as source:
    members = source.getmembers()
    names: set[str] = set()
    for member in members:
        path = PurePosixPath(member.name)
        if (
            path.is_absolute()
            or not path.parts
            or path.parts[0] not in allowed_roots
            or ".." in path.parts
            or member.name in names
        ):
            raise SystemExit(f"unsafe or duplicate runtime archive member: {member.name}")
        names.add(member.name)
        if member.islnk():
            raise SystemExit(f"hard links are forbidden in the runtime archive: {member.name}")
        if member.issym():
            target = PurePosixPath(member.linkname)
            if target.is_absolute():
                raise SystemExit(f"absolute runtime archive link: {member.name}")
            resolved_parts: list[str] = []
            for part in path.parent.joinpath(target).parts:
                if part in ("", "."):
                    continue
                if part == "..":
                    if not resolved_parts:
                        raise SystemExit(f"escaping runtime archive link: {member.name}")
                    resolved_parts.pop()
                else:
                    resolved_parts.append(part)
            if not resolved_parts or resolved_parts[0] not in allowed_roots:
                raise SystemExit(f"escaping runtime archive link: {member.name}")
        elif not (member.isdir() or member.isfile()):
            raise SystemExit(f"unsupported runtime archive member type: {member.name}")
    if not required.issubset(names):
        missing = ", ".join(sorted(required - names))
        raise SystemExit(f"runtime archive is missing required executables: {missing}")
    source.extractall(destination, filter="data")
PY

  for executable in \
    buildctl \
    buildkitd \
    containerd \
    containerd-shim-runc-v2 \
    ctr \
    nerdctl \
    rootlesskit \
    runc; do
    [[ -x "${INSTALL_ROOT}/bin/${executable}" && ! -L "${INSTALL_ROOT}/bin/${executable}" ]] || {
      echo "Extracted runtime executable is missing or unsafe: ${executable}" >&2
      exit 2
    }
  done

  node - "${INSTALL_ROOT}" "${ATTESTATION_PATH}" "${VERSION}" "${ARCHIVE_SHA256}" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const [installRoot, output, version, archiveSha256] = process.argv.slice(2);
const executableNames = [
  "buildctl",
  "buildkitd",
  "containerd",
  "containerd-shim-runc-v2",
  "ctr",
  "nerdctl",
  "rootlesskit",
  "runc",
];
const executableSha256 = Object.fromEntries(
  executableNames.map((name) => [
    name,
    createHash("sha256").update(readFileSync(join(installRoot, "bin", name))).digest("hex"),
  ]),
);
writeFileSync(
  output,
  `${JSON.stringify(
    {
      schemaVersion: "1",
      distribution: "nerdctl-full",
      version,
      platform: "linux-amd64",
      archiveSha256,
      executableSha256,
    },
    null,
    2,
  )}\n`,
  { encoding: "utf8", flag: "wx", mode: 0o600 },
);
NODE
fi

node - "${INSTALL_ROOT}" "${ATTESTATION_PATH}" "${LOCK_PATH}" "${VERSION}" "${ARCHIVE_SHA256}" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const [installRoot, attestationPath, lockPath, expectedVersion, expectedArchiveSha256] = process.argv.slice(2);
const attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const exactKeys = (value, expected, label) => {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
  ) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
};
const componentVersions = {
  buildctl: "0.30.0",
  buildkitd: "0.30.0",
  containerd: "2.3.1",
  "containerd-shim-runc-v2": "2.3.1",
  ctr: "2.3.1",
  nerdctl: "2.3.1",
  rootlesskit: "3.0.0",
  runc: "1.4.2",
};
exactKeys(attestation, [
  "schemaVersion",
  "distribution",
  "version",
  "platform",
  "archiveSha256",
  "executableSha256",
], "runtime installation attestation");
const componentNames = Object.keys(componentVersions);
const legacyAttestedNames = componentNames.filter((name) => name !== "ctr");
const attestedNames = Object.keys(attestation.executableSha256).sort();
if (
  JSON.stringify(attestedNames) !== JSON.stringify(componentNames.sort()) &&
  JSON.stringify(attestedNames) !== JSON.stringify(legacyAttestedNames.sort())
) {
  throw new Error("attested runtime executables contain missing or unknown fields");
}
exactKeys(lock, [
  "schemaVersion",
  "distribution",
  "version",
  "platform",
  "archiveUrl",
  "checksumUrl",
  "archiveSha256",
  "licenses",
  "components",
], "runtime toolchain lock");
exactKeys(lock.components, componentNames, "runtime components");
if (
  attestation.schemaVersion !== "1" ||
  attestation.distribution !== "nerdctl-full" ||
  attestation.version !== expectedVersion ||
  attestation.platform !== "linux-amd64" ||
  attestation.archiveSha256 !== expectedArchiveSha256 ||
  typeof attestation.executableSha256 !== "object" ||
  attestation.executableSha256 === null
) {
  throw new Error("contained runtime installation attestation is invalid");
}
if (
  lock.schemaVersion !== "1" ||
  lock.distribution !== attestation.distribution ||
  lock.version !== attestation.version ||
  lock.platform !== attestation.platform ||
  lock.archiveSha256 !== attestation.archiveSha256 ||
  lock.archiveUrl !==
    "https://github.com/containerd/nerdctl/releases/download/v2.3.1/nerdctl-full-2.3.1-linux-amd64.tar.gz" ||
  lock.checksumUrl !==
    "https://github.com/containerd/nerdctl/releases/download/v2.3.1/SHA256SUMS" ||
  JSON.stringify(lock.licenses) !== JSON.stringify(["Apache-2.0"])
) {
  throw new Error("tracked runtime toolchain lock disagrees with the installation");
}
for (const [name, expectedVersion] of Object.entries(componentVersions)) {
  exactKeys(lock.components[name], ["version", "sha256"], `runtime component ${name}`);
  if (lock.components[name].version !== expectedVersion) {
    throw new Error(`tracked runtime version is invalid: ${name}`);
  }
  const observed = createHash("sha256")
    .update(readFileSync(join(installRoot, "bin", name)))
    .digest("hex");
  const attested = attestation.executableSha256[name];
  if (attested !== undefined && !/^[a-f0-9]{64}$/.test(attested)) {
    throw new Error(`invalid attested executable hash: ${name}`);
  }
  if (attested !== undefined && observed !== attested) {
    throw new Error(`contained runtime executable changed: ${name}`);
  }
  if (lock.components[name]?.sha256 !== observed) {
    throw new Error(`tracked runtime hash disagrees with the installation: ${name}`);
  }
}
NODE

echo "Contained runtime tools verified at ${INSTALL_ROOT}"
