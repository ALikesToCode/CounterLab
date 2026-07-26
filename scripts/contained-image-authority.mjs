import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = realpathSync(
  resolve(fileURLToPath(import.meta.url), "../.."),
);
const imagePattern = /^counterlab-(?:adapter|runner):git-([a-f0-9]{40})$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const externalRepositoryPattern =
  /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)+$/;
const manifestMediaTypes = new Set([
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
]);
const indexMediaTypes = new Set([
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.index.v1+json",
]);
const layerMediaTypes = new Set([
  "application/vnd.docker.image.rootfs.diff.tar.gzip",
  "application/vnd.oci.image.layer.v1.tar",
  "application/vnd.oci.image.layer.v1.tar+gzip",
  "application/vnd.oci.image.layer.v1.tar+zstd",
]);
const maximumReadOnlyMountBytes = 32 * 1024 * 1024;
const maximumReadOnlyMountFiles = 2_048;
const maximumReadOnlyMountDepth = 32;
const maximumReadOnlyMountPathBytes = 4_096;
const maximumReadOnlyMountManifestBytes = 4 * 1024 * 1024;
const maximumImageLayerBytes = 4 * 1024 * 1024 * 1024;

function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`contained image authority has invalid ${label}`);
  }
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function imageRootfsAuthority(value) {
  const rootfs = object(value, "image rootfs");
  if (
    JSON.stringify(Object.keys(rootfs).sort()) !==
      JSON.stringify(["diff_ids", "type"]) ||
    rootfs.type !== "layers" ||
    !Array.isArray(rootfs.diff_ids) ||
    rootfs.diff_ids.length < 1 ||
    rootfs.diff_ids.length > 128 ||
    rootfs.diff_ids.some((entry) => !digestPattern.test(entry ?? ""))
  ) {
    throw new Error("contained image authority rootfs changed");
  }
  const rootfsChainId = rootfs.diff_ids
    .slice(1)
    .reduce(
      (chainId, diffId) => `sha256:${sha256(`${chainId} ${diffId}`)}`,
      rootfs.diff_ids[0],
    );
  return { diffIds: [...rootfs.diff_ids], rootfsChainId };
}

function parseJson(source, label) {
  if (
    typeof source !== "string" ||
    source.length === 0 ||
    source.length > 2 * 1024 * 1024
  ) {
    throw new Error(`contained image authority ${label} source is invalid`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`contained image authority ${label} JSON is invalid`, {
      cause: error,
    });
  }
}

function contained(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return (
    fromParent === "" ||
    (!fromParent.startsWith("..") && !isAbsolute(fromParent))
  );
}

function physicalRepositoryFile(path, label) {
  if (!isAbsolute(path) || !contained(repositoryRoot, path)) {
    throw new Error(
      `contained image authority ${label} escaped the repository`,
    );
  }
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink()) {
    throw new Error(`contained image authority ${label} is a symlink`);
  }
  const physical = realpathSync(path);
  if (physical !== path || !contained(repositoryRoot, physical)) {
    throw new Error(
      `contained image authority ${label} is not a physical repository path`,
    );
  }
  return physical;
}

function normalizedImage(image) {
  if (!imagePattern.test(image)) {
    throw new Error("contained image authority image is invalid");
  }
  return `docker.io/library/${image}`;
}

function normalizedInspectedImage(image) {
  if (imagePattern.test(image)) return normalizedImage(image);
  if (
    image.startsWith("docker.io/library/") &&
    imagePattern.test(image.slice("docker.io/library/".length))
  ) {
    return image;
  }
  const canonicalImage = image.startsWith("docker.io/library/")
    ? image
    : `docker.io/library/${image}`;
  if (
    !/^docker\.io\/library\/counterlab-runtime-invocation:[a-f0-9]{64}$/.test(
      canonicalImage,
    )
  ) {
    throw new Error("contained image authority inspected image is invalid");
  }
  return canonicalImage;
}

function descriptor(value, label) {
  const parsed = object(value, label);
  const digest = parsed.digest ?? parsed.Digest;
  const mediaType = parsed.mediaType ?? parsed.MediaType;
  if (
    !digestPattern.test(digest ?? "") ||
    typeof mediaType !== "string" ||
    mediaType.length === 0
  ) {
    throw new Error(`contained image authority ${label} is invalid`);
  }
  return { digest, mediaType, value: parsed };
}

function inspectedImageRecord(source, label) {
  const parsed = parseJson(source, label);
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new Error(`contained image authority ${label} is invalid`);
  }
  return object(parsed[0], `${label} record`);
}

function inspectedImageIdentity({
  expectedImage,
  record,
  label,
  allowedDigestImages = [],
  allowExternalRepositoryDigests = false,
}) {
  const canonicalImage = normalizedInspectedImage(expectedImage);
  const shortImage = canonicalImage.slice("docker.io/library/".length);
  const tags = stringArray(record.RepoTags, `${label} repository tags`, false);
  if (
    new Set(tags).size !== tags.length ||
    !tags.some((tag) => tag === shortImage || tag === canonicalImage)
  ) {
    throw new Error(`contained image authority ${label} name changed`);
  }
  const repositoryDigests = stringArray(
    record.RepoDigests,
    `${label} repository digests`,
    false,
  );
  const allowedRepositories = new Set(
    [canonicalImage, ...allowedDigestImages].flatMap((image) => {
      const canonical = normalizedInspectedImage(image);
      const repository = canonical.slice(0, canonical.lastIndexOf(":"));
      return [repository, repository.slice("docker.io/library/".length)];
    }),
  );
  const targetDigests = new Set(
    repositoryDigests.map((entry) => {
      const separator = entry.lastIndexOf("@");
      const repository = separator > 0 ? entry.slice(0, separator) : "";
      const digest = separator > 0 ? entry.slice(separator + 1) : "";
      if (
        !allowedRepositories.has(repository) &&
        !(
          allowExternalRepositoryDigests &&
          externalRepositoryPattern.test(repository)
        )
      ) {
        throw new Error(
          `contained image authority ${label} repository path changed`,
        );
      }
      if (!digestPattern.test(digest)) {
        throw new Error(
          `contained image authority ${label} repository digest is invalid`,
        );
      }
      return digest;
    }),
  );
  if (targetDigests.size !== 1) {
    throw new Error(
      `contained image authority ${label} target digest is ambiguous`,
    );
  }
  if (
    record.Architecture !== "amd64" ||
    record.Os !== "linux" ||
    !digestPattern.test(record.Id ?? "")
  ) {
    throw new Error(`contained image authority ${label} platform changed`);
  }
  return {
    canonicalImage,
    reportedConfigDigest: record.Id,
    targetDigest: [...targetDigests][0],
  };
}

export function parseContainedImageManifest({ manifestDigest, source }) {
  if (
    !digestPattern.test(manifestDigest ?? "") ||
    sha256(source) !== manifestDigest.slice("sha256:".length)
  ) {
    throw new Error("contained image authority manifest input is invalid");
  }
  const manifest = object(parseJson(source, "manifest"), "manifest");
  if (
    JSON.stringify(Object.keys(manifest).sort()) !==
      JSON.stringify(["config", "layers", "mediaType", "schemaVersion"]) ||
    manifest.schemaVersion !== 2 ||
    !manifestMediaTypes.has(manifest.mediaType) ||
    !Array.isArray(manifest.layers) ||
    manifest.layers.length < 1 ||
    manifest.layers.length > 128
  ) {
    throw new Error(
      "contained image authority manifest schema or layers are unsupported",
    );
  }
  const config = descriptor(manifest.config, "config descriptor");
  if (
    JSON.stringify(Object.keys(config.value).sort()) !==
      JSON.stringify(["digest", "mediaType", "size"]) ||
    (config.mediaType !== "application/vnd.oci.image.config.v1+json" &&
      config.mediaType !== "application/vnd.docker.container.image.v1+json")
  ) {
    throw new Error(
      "contained image authority config media type is unsupported",
    );
  }
  if (
    !Number.isSafeInteger(config.value.size) ||
    config.value.size < 1 ||
    config.value.size > 2 * 1024 * 1024
  ) {
    throw new Error(
      "contained image authority config descriptor size is unsupported",
    );
  }
  const layerDigests = manifest.layers.map((entry, index) => {
    const layer = descriptor(entry, `layer ${index} descriptor`);
    if (
      JSON.stringify(Object.keys(layer.value).sort()) !==
        JSON.stringify(["digest", "mediaType", "size"]) ||
      !layerMediaTypes.has(layer.mediaType) ||
      !Number.isSafeInteger(layer.value.size) ||
      layer.value.size < 1 ||
      layer.value.size > maximumImageLayerBytes
    ) {
      throw new Error(
        "contained image authority manifest layer is unsupported",
      );
    }
    return layer.digest;
  });
  return {
    configDigest: config.digest,
    configSize: config.value.size,
    layerDigests,
  };
}

export function parseContainedImageTarget({ image, source }) {
  const parsed = parseJson(source, "target metadata");
  if (Array.isArray(parsed)) {
    return inspectedImageIdentity({
      expectedImage: image,
      label: "target metadata",
      record: inspectedImageRecord(source, "target metadata"),
      allowExternalRepositoryDigests: true,
    });
  }
  const metadata = object(parsed, "target metadata");
  const canonicalImage = normalizedImage(image);
  if (metadata.Name !== canonicalImage) {
    throw new Error("contained image authority target name changed");
  }
  const target = descriptor(metadata.Target, "target descriptor");
  if (
    !manifestMediaTypes.has(target.mediaType) &&
    !indexMediaTypes.has(target.mediaType)
  ) {
    throw new Error(
      "contained image authority target media type is unsupported",
    );
  }
  return {
    canonicalImage,
    targetDigest: target.digest,
    targetMediaType: target.mediaType,
  };
}

export function validateContainedImageAliasTarget({
  alias,
  expectedTarget,
  source,
}) {
  if (
    typeof alias !== "string" ||
    !/^docker\.io\/library\/counterlab-runtime-invocation:[a-f0-9]{64}$/.test(
      alias,
    )
  ) {
    throw new Error("contained image authority alias is invalid");
  }
  const parsed = parseJson(source, "alias metadata");
  if (Array.isArray(parsed)) {
    const inspected = inspectedImageIdentity({
      allowedDigestImages: [expectedTarget.canonicalImage],
      expectedImage: alias.slice("docker.io/library/".length),
      label: "alias metadata",
      record: inspectedImageRecord(source, "alias metadata"),
    });
    if (
      inspected.targetDigest !== expectedTarget.targetDigest ||
      (expectedTarget.reportedConfigDigest !== undefined &&
        inspected.reportedConfigDigest !== expectedTarget.reportedConfigDigest)
    ) {
      throw new Error("contained image authority alias target changed");
    }
    return;
  }
  const metadata = object(parsed, "alias metadata");
  const target = descriptor(metadata.Target, "alias target descriptor");
  if (
    metadata.Name !== alias ||
    target.digest !== expectedTarget.targetDigest ||
    (expectedTarget.targetMediaType !== undefined &&
      target.mediaType !== expectedTarget.targetMediaType)
  ) {
    throw new Error("contained image authority alias target changed");
  }
}

export function selectContainedImageManifest({ source, target }) {
  if (sha256(source) !== target.targetDigest.slice("sha256:".length)) {
    throw new Error("contained image authority target content digest changed");
  }
  const content = object(parseJson(source, "target content"), "target content");
  const observedMediaType = content.mediaType;
  if (
    typeof observedMediaType !== "string" ||
    (target.targetMediaType !== undefined &&
      target.targetMediaType !== observedMediaType)
  ) {
    throw new Error("contained image authority target media type changed");
  }
  if (manifestMediaTypes.has(observedMediaType)) {
    return {
      manifestDigest: target.targetDigest,
      manifestSource: source,
    };
  }
  if (!indexMediaTypes.has(observedMediaType)) {
    throw new Error(
      "contained image authority target media type is unsupported",
    );
  }
  const index = content;
  if (!Array.isArray(index.manifests)) {
    throw new Error("contained image authority index has no manifests");
  }
  const candidates = index.manifests.filter((entry) => {
    const value = object(entry, "index descriptor");
    const platform = object(value.platform, "index platform");
    return platform.os === "linux" && platform.architecture === "amd64";
  });
  if (candidates.length !== 1) {
    throw new Error(
      "contained image authority index must have one linux/amd64 manifest",
    );
  }
  const selected = descriptor(candidates[0], "linux/amd64 descriptor");
  if (!manifestMediaTypes.has(selected.mediaType)) {
    throw new Error(
      "contained image authority selected manifest is unsupported",
    );
  }
  return { manifestDigest: selected.digest };
}

function stringArray(value, label, allowEmpty = true) {
  if (
    value === undefined ||
    value === null ||
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some(
      (entry) =>
        typeof entry !== "string" || entry.length === 0 || entry.includes("\0"),
    )
  ) {
    throw new Error(`contained image authority ${label} is invalid`);
  }
  return [...value];
}

function optionValues(args, names, end) {
  const values = [];
  for (let index = 1; index < end; index += 1) {
    const argument = args[index];
    const name = names.find(
      (candidate) =>
        argument === candidate || argument.startsWith(`${candidate}=`),
    );
    if (name === undefined) continue;
    if (argument === name) {
      if (typeof args[index + 1] !== "string") {
        throw new Error(`contained image authority ${name} is incomplete`);
      }
      values.push(args[index + 1]);
      index += 1;
    } else {
      values.push(argument.slice(name.length + 1));
    }
  }
  return values;
}

function oneOptionalOption(args, names, end) {
  const values = optionValues(args, names, end);
  if (values.length > 1) {
    throw new Error(`contained image authority ${names[0]} is duplicated`);
  }
  return values[0];
}

function envName(value) {
  const separator = value.indexOf("=");
  if (separator <= 0) {
    throw new Error("contained image authority environment entry is invalid");
  }
  return value.slice(0, separator);
}

function mergeEnvironment(imageEnvironment, requestedEnvironment) {
  const replacements = new Map();
  for (const entry of requestedEnvironment) {
    const name = envName(entry);
    if (replacements.has(name)) {
      throw new Error("contained image authority environment is duplicated");
    }
    replacements.set(name, entry);
  }
  const observedImageNames = new Set();
  const merged = imageEnvironment.map((entry) => {
    const name = envName(entry);
    if (observedImageNames.has(name)) {
      throw new Error(
        "contained image authority image environment is duplicated",
      );
    }
    observedImageNames.add(name);
    return replacements.get(name) ?? entry;
  });
  for (const [name, entry] of replacements) {
    if (!observedImageNames.has(name)) merged.push(entry);
  }
  return merged;
}

function mountFields(value) {
  const entries = value.split(",").map((entry) => {
    const separator = entry.indexOf("=");
    return separator === -1
      ? [entry, undefined]
      : [entry.slice(0, separator), entry.slice(separator + 1)];
  });
  if (
    entries.some(
      ([key]) =>
        !["type", "src", "source", "dst", "destination", "readonly"].includes(
          key,
        ),
    ) ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  ) {
    throw new Error("contained image authority mount fields are invalid");
  }
  return new Map(entries);
}

function sameFilesystemIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function readOnlyMountFile(path, relativePath, state, before) {
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1n ||
    before.size < 0n ||
    before.size > BigInt(maximumReadOnlyMountBytes) ||
    typeof constants.O_NOFOLLOW !== "number"
  ) {
    throw new Error(
      "contained image authority read-only mount file is invalid",
    );
  }
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let contents;
  try {
    const openedBefore = fstatSync(descriptor, { bigint: true });
    if (!sameFilesystemIdentity(before, openedBefore)) {
      throw new Error(
        "contained image authority read-only mount changed before capture",
      );
    }
    contents = readFileSync(descriptor);
    const openedAfter = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(path, { bigint: true });
    if (
      !sameFilesystemIdentity(openedBefore, openedAfter) ||
      !sameFilesystemIdentity(openedAfter, pathAfter) ||
      BigInt(contents.byteLength) !== openedBefore.size
    ) {
      throw new Error(
        "contained image authority read-only mount changed during capture",
      );
    }
  } finally {
    closeSync(descriptor);
  }
  state.files += 1;
  state.bytes += contents.byteLength;
  if (
    state.files > maximumReadOnlyMountFiles ||
    state.bytes > maximumReadOnlyMountBytes
  ) {
    throw new Error("contained image authority read-only mount is too large");
  }
  state.entries.push({
    byteLength: contents.byteLength,
    contentSha256: sha256(contents),
    mode: Number(before.mode & 0o777n),
    path: relativePath,
    type: "file",
  });
}

function walkReadOnlyMount(path, relativePath, state, depth = 0) {
  if (
    depth > maximumReadOnlyMountDepth ||
    Buffer.byteLength(relativePath) > maximumReadOnlyMountPathBytes ||
    !contained(repositoryRoot, path)
  ) {
    throw new Error(
      "contained image authority read-only mount path is invalid",
    );
  }
  const before = lstatSync(path, { bigint: true });
  if (before.isSymbolicLink()) {
    throw new Error("contained image authority read-only mount is a symlink");
  }
  if (before.isFile()) {
    readOnlyMountFile(path, relativePath, state, before);
    return;
  }
  if (!before.isDirectory()) {
    throw new Error(
      "contained image authority read-only mount type is invalid",
    );
  }
  if (realpathSync(path) !== path) {
    throw new Error(
      "contained image authority read-only mount resolved unexpectedly",
    );
  }
  state.files += 1;
  if (state.files > maximumReadOnlyMountFiles) {
    throw new Error("contained image authority read-only mount is too large");
  }
  state.entries.push({
    mode: Number(before.mode & 0o777n),
    path: relativePath,
    type: "directory",
  });
  const names = readdirSync(path).sort();
  for (const name of names) {
    walkReadOnlyMount(
      resolve(path, name),
      relativePath === "." ? name : `${relativePath}/${name}`,
      state,
      depth + 1,
    );
  }
  const after = lstatSync(path, { bigint: true });
  if (
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    !sameFilesystemIdentity(before, after)
  ) {
    throw new Error(
      "contained image authority read-only mount changed during capture",
    );
  }
}

function readOnlyMountContentAuthority(source) {
  const state = { bytes: 0, entries: [], files: 0 };
  walkReadOnlyMount(source, ".", state);
  const contentManifest = state.entries;
  const canonicalManifest = canonicalJson(contentManifest);
  if (
    Buffer.byteLength(canonicalManifest) > maximumReadOnlyMountManifestBytes
  ) {
    throw new Error(
      "contained image authority read-only mount manifest is too large",
    );
  }
  return {
    contentManifest,
    contentManifestSha256: sha256(canonicalManifest),
  };
}

export function verifyContainedReadOnlyMounts(requested) {
  if (!Array.isArray(requested)) {
    throw new Error("contained image authority mount set is invalid");
  }
  return requested
    .filter((entry) => entry.readonly)
    .map((entry) => {
      const current = readOnlyMountContentAuthority(entry.source);
      if (
        !Array.isArray(entry.contentManifest) ||
        sha256(canonicalJson(entry.contentManifest)) !==
          entry.contentManifestSha256 ||
        current.contentManifestSha256 !== entry.contentManifestSha256
      ) {
        throw new Error(
          `contained image authority read-only mount ${entry.destination} changed`,
        );
      }
      return {
        contentManifestSha256: entry.contentManifestSha256,
        destination: entry.destination,
        repositoryRelativeSource: relative(repositoryRoot, entry.source),
      };
    })
    .sort((left, right) => left.destination.localeCompare(right.destination));
}

function requestedMounts(args, end) {
  const mounts = [];
  for (const value of optionValues(args, ["--mount"], end)) {
    const fields = mountFields(value);
    const source = fields.get("src") ?? fields.get("source");
    const destination = fields.get("dst") ?? fields.get("destination");
    if (
      fields.get("type") !== "bind" ||
      typeof source !== "string" ||
      typeof destination !== "string" ||
      !destination.startsWith("/") ||
      (fields.has("src") && fields.has("source")) ||
      (fields.has("dst") && fields.has("destination")) ||
      (fields.has("readonly") && fields.get("readonly") !== undefined)
    ) {
      throw new Error("contained image authority mount is invalid");
    }
    const resolvedSource = physicalRepositoryFile(
      source,
      `mount ${destination}`,
    );
    const readonly = fields.has("readonly");
    mounts.push({
      destination,
      readonly,
      source: resolvedSource,
      ...(readonly ? readOnlyMountContentAuthority(resolvedSource) : {}),
    });
  }
  for (const value of optionValues(args, ["-v", "--volume"], end)) {
    const separator = value.indexOf(":");
    const modeSeparator = value.lastIndexOf(":");
    const hasMode = modeSeparator !== separator;
    const source = value.slice(0, separator);
    const destination = value.slice(
      separator + 1,
      hasMode ? modeSeparator : undefined,
    );
    const mode = hasMode ? value.slice(modeSeparator + 1) : "";
    if (
      separator <= 0 ||
      !destination.startsWith("/") ||
      !["", "ro"].includes(mode)
    ) {
      throw new Error("contained image authority volume is invalid");
    }
    const resolvedSource = physicalRepositoryFile(
      source,
      `volume ${destination}`,
    );
    const readonly = mode === "ro";
    mounts.push({
      destination,
      readonly,
      source: resolvedSource,
      ...(readonly ? readOnlyMountContentAuthority(resolvedSource) : {}),
    });
  }
  if (
    new Set(mounts.map((entry) => entry.destination)).size !== mounts.length
  ) {
    throw new Error(
      "contained image authority mount destinations are duplicated",
    );
  }
  return mounts;
}

function requestedTmpfs(args, end) {
  const entries = optionValues(args, ["--tmpfs"], end).map((value) => {
    const separator = value.indexOf(":");
    if (separator <= 0 || !value.startsWith("/")) {
      throw new Error("contained image authority tmpfs is invalid");
    }
    const destination = value.slice(0, separator);
    const options = value
      .slice(separator + 1)
      .split(",")
      .sort();
    if (
      !["/tmp", "/counterlab-runtime"].includes(destination) ||
      !options.includes("rw") ||
      !options.includes("noexec") ||
      !options.includes("nosuid") ||
      !options.includes("nodev") ||
      !options.some((entry) => /^size=(?:16|64|256)m$/.test(entry)) ||
      !options.some((entry) => /^uid=\d{1,6}$/.test(entry)) ||
      !options.some((entry) => /^gid=\d{1,6}$/.test(entry)) ||
      !options.includes("mode=0700")
    ) {
      throw new Error("contained image authority tmpfs policy is invalid");
    }
    return { destination, options };
  });
  if (entries.length !== 1) {
    throw new Error("contained image authority requires one tmpfs");
  }
  return entries;
}

function expectedProcess(args, config) {
  const index = args.findIndex((argument) => imagePattern.test(argument));
  if (index === -1) {
    throw new Error("contained image authority command image is invalid");
  }
  const imageEntrypoint = stringArray(config.Entrypoint ?? [], "entrypoint");
  const imageCommand = stringArray(config.Cmd ?? [], "command");
  const requestedEntrypoint = oneOptionalOption(args, ["--entrypoint"], index);
  const command = args.slice(index + 1);
  const entrypoint =
    requestedEntrypoint === undefined
      ? imageEntrypoint
      : stringArray([requestedEntrypoint], "requested entrypoint", false);
  const processArgs = [
    ...entrypoint,
    ...(command.length > 0 ? command : imageCommand),
  ];
  if (processArgs.length === 0) {
    throw new Error("contained image authority process has no command");
  }
  const requestedUser =
    oneOptionalOption(args, ["--user"], index) ?? config.User;
  const userMatch = String(requestedUser ?? "").match(/^(\d{1,6}):(\d{1,6})$/);
  if (
    userMatch === null ||
    Number(userMatch[1]) === 0 ||
    Number(userMatch[2]) === 0
  ) {
    throw new Error("contained image authority user is invalid");
  }
  const cwd =
    oneOptionalOption(args, ["--workdir"], index) ?? config.WorkingDir;
  if (typeof cwd !== "string" || !cwd.startsWith("/")) {
    throw new Error("contained image authority working directory is invalid");
  }
  const imageEnvironment = stringArray(config.Env ?? [], "image environment");
  const environment = mergeEnvironment(
    imageEnvironment,
    optionValues(args, ["-e", "--env"], index),
  );
  return {
    args: processArgs,
    cwd,
    env: environment,
    gid: Number(userMatch[2]),
    uid: Number(userMatch[1]),
  };
}

export function createContainedImageAuthority({
  args,
  configSource,
  manifestDigest,
  manifestSource,
  target,
}) {
  if (
    !Array.isArray(args) ||
    args.length === 0 ||
    !digestPattern.test(manifestDigest ?? "") ||
    sha256(manifestSource) !== manifestDigest.slice("sha256:".length)
  ) {
    throw new Error("contained image authority manifest input is invalid");
  }
  const { configDigest, configSize, layerDigests } =
    parseContainedImageManifest({
      manifestDigest,
      source: manifestSource,
    });
  if (
    target.reportedConfigDigest !== undefined &&
    target.reportedConfigDigest !== configDigest
  ) {
    throw new Error(
      "contained image authority inspected config digest changed",
    );
  }
  if (
    typeof configSource !== "string" ||
    Buffer.byteLength(configSource) !== configSize ||
    sha256(configSource) !== configDigest.slice("sha256:".length)
  ) {
    throw new Error("contained image authority config content digest changed");
  }
  const imageConfiguration = object(
    parseJson(configSource, "image config"),
    "image config",
  );
  const config = object(imageConfiguration.config, "runtime image config");
  const manifestMediaType = object(
    parseJson(manifestSource, "manifest"),
    "manifest",
  ).mediaType;
  const image = args.find((argument) => imagePattern.test(argument));
  const match = image?.match(imagePattern);
  const labels = object(config.Labels, "image labels");
  if (
    target.canonicalImage !== normalizedImage(image ?? "") ||
    imageConfiguration.architecture !== "amd64" ||
    imageConfiguration.os !== "linux" ||
    match === null ||
    labels["org.opencontainers.image.revision"] !== match[1] ||
    labels["org.opencontainers.image.source"] !==
      "https://github.com/ALikesToCode/CounterLab" ||
    !/^[a-f0-9]{64}$/.test(labels["io.counterlab.source-tree-sha256"] ?? "") ||
    (config.Volumes !== undefined &&
      Object.keys(object(config.Volumes, "image volumes")).length !== 0)
  ) {
    throw new Error("contained image authority image config changed");
  }
  const process = expectedProcess(args, config);
  const rootfs = imageRootfsAuthority(imageConfiguration.rootfs);
  if (layerDigests.length !== rootfs.diffIds.length) {
    throw new Error("contained image authority manifest layer count changed");
  }
  const commandImageIndex = args.findIndex((argument) => argument === image);
  const mounts = requestedMounts(args, commandImageIndex);
  const readOnlyMountManifest = verifyContainedReadOnlyMounts(mounts);
  return {
    canonicalImage: target.canonicalImage,
    commandSha256: sha256(canonicalJson(args)),
    configDigest,
    manifestDigest,
    layerDigests,
    process,
    readOnlyMountManifest,
    readOnlyMountManifestSha256: sha256(canonicalJson(readOnlyMountManifest)),
    requestedMounts: mounts,
    requestedTmpfs: requestedTmpfs(args, commandImageIndex),
    rootfsChainId: rootfs.rootfsChainId,
    sourceCommit: match[1],
    sourceTreeSha256: labels["io.counterlab.source-tree-sha256"],
    targetDigest: target.targetDigest,
    targetMediaType: target.targetMediaType ?? manifestMediaType,
  };
}
