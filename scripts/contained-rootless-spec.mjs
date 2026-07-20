import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = realpathSync(
  resolve(fileURLToPath(import.meta.url), "../.."),
);
const namespace = "counterlab-v6.1";
const containerIdPattern = /^[a-f0-9]{64}$/;
const supportedRlimits = new Set([
  "RLIMIT_AS",
  "RLIMIT_CPU",
  "RLIMIT_FSIZE",
  "RLIMIT_NOFILE",
  "RLIMIT_NPROC",
]);
const invocationIdPattern = /^[a-f0-9]{64}$/;
const maskedPaths = new Set([
  "/proc/acpi",
  "/proc/asound",
  "/proc/kcore",
  "/proc/keys",
  "/proc/latency_stats",
  "/proc/scsi",
  "/proc/sched_debug",
  "/proc/timer_list",
  "/proc/timer_stats",
  "/sys/firmware",
  "/sys/devices/virtual/powercap",
]);
const readonlyPaths = new Set([
  "/proc/bus",
  "/proc/fs",
  "/proc/irq",
  "/proc/sys",
  "/proc/sysrq-trigger",
]);
const nerdctlAnnotationKeys = new Set([
  "nerdctl/auto-remove",
  "nerdctl/dns",
  "nerdctl/domainname",
  "nerdctl/extraHosts",
  "nerdctl/host-config",
  "nerdctl/hostname",
  "nerdctl/ipc",
  "nerdctl/log-config",
  "nerdctl/log-uri",
  "nerdctl/mounts",
  "nerdctl/name",
  "nerdctl/namespace",
  "nerdctl/networks",
  "nerdctl/platform",
  "nerdctl/state-dir",
  "nerdctl/user",
]);
const pinnedNerdctlBinary = resolve(
  repositoryRoot,
  "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/bin/nerdctl",
);
const internalMountPolicy = [
  { containerDestination: "/etc/hostname", fileName: "hostname" },
  { containerDestination: "/etc/hosts", fileName: "hosts" },
  { containerDestination: "/etc/resolv.conf", fileName: "resolv.conf" },
];
const internalMountContentLimit = 64 * 1024;

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

function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`contained rootless OCI spec has invalid ${label}`);
  }
  return value;
}

function assertKnownKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `contained rootless OCI spec has unknown ${label}: ${unknown.sort().join(",")}`,
    );
  }
}

function assertNerdctlHooks(parsed, expected) {
  if (!Object.hasOwn(parsed, "hooks")) {
    throw new Error("contained rootless OCI spec lost nerdctl hooks");
  }
  const hooks = object(parsed.hooks, "hooks");
  assertKnownKeys(
    hooks,
    new Set([
      "createContainer",
      "createRuntime",
      "poststart",
      "poststop",
      "prestart",
      "startContainer",
    ]),
    "hook fields",
  );
  if (
    Object.keys(hooks).length !== 2 ||
    !Array.isArray(hooks.createRuntime) ||
    hooks.createRuntime.length !== 1 ||
    !Array.isArray(hooks.poststop) ||
    hooks.poststop.length !== 1
  ) {
    throw new Error("contained rootless OCI nerdctl hook set changed");
  }

  const binRoot = resolve(
    repositoryRoot,
    "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/bin",
  );
  const runtimePath = `${resolve(repositoryRoot, "scripts/runtime-bin")}:${binRoot}:/usr/bin:/bin`;
  const expectedEnvironment = [
    `HOME=${resolve(expected.sessionRoot, "home")}`,
    `TMPDIR=${resolve(expected.sessionRoot, "tmp")}`,
    `XDG_CACHE_HOME=${resolve(expected.sessionRoot, "xdg-cache")}`,
    `XDG_CONFIG_HOME=${resolve(expected.sessionRoot, "xdg-config")}`,
    `XDG_DATA_HOME=${resolve(expected.sessionRoot, "xdg-data")}`,
    `XDG_RUNTIME_DIR=${resolve(expected.sessionRoot, "run/inner")}`,
    `DOCKER_CONFIG=${resolve(expected.sessionRoot, "auth")}`,
    `BUILDKIT_HOST=unix://${resolve(expected.sessionRoot, "run/buildkitd.sock")}`,
    `COUNTERLAB_RUNC_BINARY=${resolve(binRoot, "runc")}`,
    `COUNTERLAB_RUNC_STATE_ROOT=${resolve(expected.sessionRoot, "run/runc")}`,
    `PATH=${runtimePath}`,
    `PATH=${runtimePath}:/usr/sbin:/sbin`,
  ].sort();
  const containerdSocket = resolve(expected.sessionRoot, "run/containerd.sock");
  const globalArgs = [
    `--H=${containerdSocket}`,
    `--a=${containerdSocket}`,
    `--address=${containerdSocket}`,
    "--cgroup-manager=cgroupfs",
    `--cni-netconfpath=${resolve(expected.sessionRoot, "config/cni")}`,
    `--cni-path=${resolve(repositoryRoot, "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/libexec/cni")}`,
    `--data-root=${resolve(expected.sessionRoot, "data/nerdctl")}`,
    "--experimental=false",
    `--host=${containerdSocket}`,
    `--hosts-dir=[${resolve(expected.sessionRoot, "config/certs.d")}]`,
    `--n=${namespace}`,
    `--namespace=${namespace}`,
    "--snapshotter=native",
    "--storage-driver=native",
  ];
  for (const [name, event] of [
    ["createRuntime", "createRuntime"],
    ["poststop", "postStop"],
  ]) {
    const hook = object(hooks[name][0], `${name} hook`);
    assertKnownKeys(
      hook,
      new Set(["args", "env", "path"]),
      "hook entry fields",
    );
    if (
      Object.keys(hook).length !== 3 ||
      hook.path !== pinnedNerdctlBinary ||
      !sameStrings(hook.args, [
        pinnedNerdctlBinary,
        ...globalArgs,
        "internal",
        "oci-hook",
        event,
      ]) ||
      !Array.isArray(hook.env) ||
      hook.env.some((entry) => typeof entry !== "string") ||
      JSON.stringify([...hook.env].sort()) !==
        JSON.stringify(expectedEnvironment)
    ) {
      throw new Error(`contained rootless OCI ${name} hook changed`);
    }
  }
  return true;
}

function sameStrings(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    JSON.stringify(left) === JSON.stringify(right)
  );
}

function contained(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return (
    fromParent === "" ||
    (!fromParent.startsWith("..") && !isAbsolute(fromParent))
  );
}

function sameFileIdentity(left, right) {
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

function readContainedInternalMount(source, sessionRoot, label) {
  if (
    typeof source !== "string" ||
    !isAbsolute(source) ||
    !contained(sessionRoot, resolve(source)) ||
    !contained(repositoryRoot, resolve(source)) ||
    !Number.isInteger(constants.O_NOFOLLOW)
  ) {
    throw new Error(`contained rootless OCI ${label} source is invalid`);
  }
  let descriptor;
  try {
    const before = lstatSync(source, { bigint: true });
    if (
      before.isSymbolicLink() ||
      !before.isFile() ||
      before.nlink !== 1n ||
      before.uid !== BigInt(process.getuid()) ||
      (before.mode & 0o022n) !== 0n ||
      before.size < 1n ||
      before.size > BigInt(internalMountContentLimit) ||
      realpathSync(source) !== source
    ) {
      throw new Error("unsafe source metadata");
    }
    descriptor = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || !sameFileIdentity(before, opened)) {
      throw new Error("source identity changed");
    }
    const contents = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      contents.byteLength !== Number(opened.size) ||
      contents.includes(0) ||
      !sameFileIdentity(opened, after)
    ) {
      throw new Error("source contents changed");
    }
    return contents;
  } catch (error) {
    throw new Error(`contained rootless OCI ${label} source is invalid`, {
      cause: error,
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function captureContainedInternalMounts(parsed, expected, containerId) {
  const specRoot = resolve(expected.sessionRoot, "run/rootless-specs");
  const assetRoot = resolve(
    specRoot,
    `${expected.invocationId}.internal-mounts`,
  );
  if (
    !contained(expected.sessionRoot, assetRoot) ||
    !contained(repositoryRoot, assetRoot)
  ) {
    throw new Error("contained rootless OCI internal mount root escaped");
  }
  const containerdSocket = resolve(expected.sessionRoot, "run/containerd.sock");
  const dataStore = resolve(
    expected.sessionRoot,
    "data/nerdctl",
    sha256(containerdSocket).slice(0, 8),
  );
  const stateDir = resolve(dataStore, "containers", namespace, containerId);
  const expectedSources = new Map([
    ["/etc/hostname", resolve(stateDir, "hostname")],
    [
      "/etc/hosts",
      resolve(dataStore, "etchosts", namespace, containerId, "hosts"),
    ],
    ["/etc/resolv.conf", resolve(stateDir, "resolv.conf")],
  ]);
  const captures = internalMountPolicy.map((policy) => {
    const matches = parsed.mounts.filter(
      (mount) => mount.destination === policy.containerDestination,
    );
    if (matches.length !== 1) {
      throw new Error(
        `contained rootless OCI ${policy.fileName} mount is invalid`,
      );
    }
    const mount = matches[0];
    if (mount.source !== expectedSources.get(policy.containerDestination)) {
      throw new Error(
        `contained rootless OCI ${policy.fileName} mount source changed`,
      );
    }
    const contents = readContainedInternalMount(
      mount.source,
      expected.sessionRoot,
      `${policy.fileName} mount`,
    );
    const targetPath = resolve(assetRoot, policy.fileName);
    if (!contained(assetRoot, targetPath)) {
      throw new Error("contained rootless OCI internal mount target escaped");
    }
    return {
      ...policy,
      contents,
      contentSha256: sha256(contents),
      mount,
      targetPath,
    };
  });
  return { assetRoot, captures };
}

function assertPrivateDirectory(path, label, expectedMode) {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o777) !== expectedMode
  ) {
    throw new Error(`contained rootless OCI ${label} is invalid`);
  }
}

function assertEmptyCapabilities(processSpec) {
  const capabilities = object(processSpec.capabilities, "process capabilities");
  const observedNames = Object.keys(capabilities);
  if (observedNames.length !== 0) {
    throw new Error(
      `contained rootless OCI spec capability set is unknown: ${observedNames.sort().join(",")}`,
    );
  }
}

function assertExpectedRlimits(expectedRlimits) {
  if (!Array.isArray(expectedRlimits) || expectedRlimits.length !== 5) {
    throw new Error("contained rootless OCI resource intent is incomplete");
  }
  const observed = new Set();
  for (const entry of expectedRlimits) {
    const value = object(entry, "expected process rlimit");
    if (
      !supportedRlimits.has(value.type) ||
      observed.has(value.type) ||
      !Number.isSafeInteger(value.soft) ||
      !Number.isSafeInteger(value.hard) ||
      value.soft <= 0 ||
      value.soft !== value.hard
    ) {
      throw new Error("contained rootless OCI resource intent is invalid");
    }
    observed.add(value.type);
  }
}

function assertResourceIntent(linux, expected) {
  const resourceIntent = object(expected, "expected resource intent");
  if (
    !Number.isFinite(resourceIntent.cpuCount) ||
    resourceIntent.cpuCount < 0.25 ||
    resourceIntent.cpuCount > 2 ||
    !Number.isSafeInteger(resourceIntent.maxProcesses) ||
    resourceIntent.maxProcesses < 1 ||
    resourceIntent.maxProcesses > 32 ||
    !Number.isSafeInteger(resourceIntent.memoryBytes) ||
    resourceIntent.memoryBytes < 64 * 1024 * 1024 ||
    resourceIntent.memoryBytes > 1024 * 1024 * 1024
  ) {
    throw new Error(
      "contained rootless OCI aggregate resource intent is invalid",
    );
  }
  assertExpectedRlimits(resourceIntent.rlimits);

  const cgroupsPath = linux.cgroupsPath;
  if (
    typeof cgroupsPath !== "string" ||
    !new RegExp(
      `^/?${namespace.replace(".", "\\.")}(?:/[A-Za-z0-9_.-]+)*$`,
    ).test(cgroupsPath)
  ) {
    throw new Error(
      "contained rootless OCI spec has an unexpected cgroup path",
    );
  }

  const resources = object(linux.resources, "Linux resources");
  const allowedResourceKeys = new Set(["cpu", "devices", "memory", "pids"]);
  if (Object.keys(resources).some((key) => !allowedResourceKeys.has(key))) {
    throw new Error("contained rootless OCI spec has unknown Linux resources");
  }
  const memory = object(resources.memory, "memory intent");
  const cpu = object(resources.cpu, "CPU intent");
  const pids = object(resources.pids, "process intent");
  assertKnownKeys(memory, new Set(["limit", "swap"]), "memory resource fields");
  assertKnownKeys(
    cpu,
    new Set(["period", "quota", "realtimePeriod", "realtimeRuntime"]),
    "CPU resource fields",
  );
  assertKnownKeys(pids, new Set(["limit"]), "process resource fields");
  if (
    memory.limit !== resourceIntent.memoryBytes ||
    ![0, resourceIntent.memoryBytes].includes(memory.swap) ||
    pids.limit !== resourceIntent.maxProcesses ||
    !Number.isSafeInteger(cpu.period) ||
    !Number.isSafeInteger(cpu.quota) ||
    cpu.period <= 0 ||
    cpu.quota <= 0 ||
    cpu.quota / cpu.period !== resourceIntent.cpuCount ||
    cpu.realtimePeriod !== 0 ||
    cpu.realtimeRuntime !== 0
  ) {
    throw new Error(
      [
        "contained rootless OCI spec resource intent changed",
        `memory=${String(memory.limit)}:${String(memory.swap)}`,
        `pids=${String(pids.limit)}`,
        `cpu=${String(cpu.quota)}:${String(cpu.period)}`,
      ].join("; "),
    );
  }

  if (!Array.isArray(resources.devices)) {
    throw new Error(
      "contained rootless OCI spec device resource intent is invalid",
    );
  }
  for (const entry of resources.devices) {
    const device = object(entry, "device resource rule");
    assertKnownKeys(
      device,
      new Set(["access", "allow", "major", "minor", "type"]),
      "device resource fields",
    );
    if (
      device.access !== "rwm" ||
      typeof device.allow !== "boolean" ||
      (device.allow === true &&
        (device.type !== "c" ||
          ![
            "1:3",
            "1:5",
            "1:7",
            "1:8",
            "1:9",
            "5:0",
            "5:1",
            "5:2",
            "136:*",
          ].includes(`${String(device.major)}:${String(device.minor ?? "*")}`)))
    ) {
      throw new Error(
        "contained rootless OCI spec device resource rule changed",
      );
    }
  }
}

function assertRlimits(processSpec, expectedRlimits) {
  if (!Array.isArray(processSpec.rlimits)) {
    throw new Error("contained rootless OCI spec has no process rlimits");
  }
  const observed = processSpec.rlimits
    .map((entry) => {
      const value = object(entry, "process rlimit");
      if (
        !supportedRlimits.has(value.type) ||
        !Number.isSafeInteger(value.soft) ||
        !Number.isSafeInteger(value.hard)
      ) {
        throw new Error("contained rootless OCI spec has an invalid rlimit");
      }
      return `${value.type}:${value.soft}:${value.hard}`;
    })
    .sort();
  const expected = expectedRlimits
    .map((entry) => `${entry.type}:${entry.soft}:${entry.hard}`)
    .sort();
  if (
    new Set(observed).size !== observed.length ||
    JSON.stringify(observed) !== JSON.stringify(expected)
  ) {
    throw new Error(
      `contained rootless OCI spec rlimits changed: ${observed.join(",")}`,
    );
  }
}

function assertNamespaces(linux) {
  if (!Array.isArray(linux.namespaces)) {
    throw new Error("contained rootless OCI spec has no Linux namespaces");
  }
  const namespaceTypes = new Set();
  for (const entry of linux.namespaces) {
    const namespaceSpec = object(entry, "Linux namespace");
    assertKnownKeys(
      namespaceSpec,
      new Set(["path", "type"]),
      "namespace fields",
    );
    if (
      typeof namespaceSpec.type !== "string" ||
      namespaceSpec.type.length === 0 ||
      !["cgroup", "ipc", "mount", "network", "pid", "user", "uts"].includes(
        namespaceSpec.type,
      ) ||
      namespaceTypes.has(namespaceSpec.type) ||
      Object.hasOwn(namespaceSpec, "path")
    ) {
      throw new Error("contained rootless OCI spec namespace is invalid");
    }
    namespaceTypes.add(namespaceSpec.type);
  }
  for (const required of ["ipc", "mount", "network", "pid", "uts"]) {
    if (!namespaceTypes.has(required)) {
      throw new Error(`contained rootless OCI spec lost ${required} isolation`);
    }
  }
}

function mountOptionState(options, label) {
  const flags = new Set();
  const values = new Map();
  for (const option of options) {
    const separator = option.indexOf("=");
    if (separator === -1) {
      if (flags.has(option)) {
        throw new Error(
          `contained rootless OCI spec ${label} option is duplicated`,
        );
      }
      flags.add(option);
      continue;
    }
    const name = option.slice(0, separator);
    if (values.has(name)) {
      throw new Error(
        `contained rootless OCI spec ${label} option is duplicated`,
      );
    }
    values.set(name, option.slice(separator + 1));
  }
  return { flags, values };
}

function assertRequestedBindOptions(optionState, requested) {
  const expectedFlags = new Set(
    requested.readonly
      ? ["rbind", "ro", "rprivate", "nodev", "nosuid"]
      : ["rbind", "rprivate", "nodev", "nosuid"],
  );
  if (
    optionState.flags.size !== expectedFlags.size ||
    [...optionState.flags].some((flag) => !expectedFlags.has(flag)) ||
    optionState.values.size !== 0
  ) {
    throw new Error("contained rootless OCI spec requested bind mode changed");
  }
}

function parseSize(value) {
  const match = String(value).match(/^(\d+)([kKmMgG]?)$/);
  if (match === null) return undefined;
  const scale = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[
    match[2].toLowerCase()
  ];
  const parsed = Number(match[1]) * scale;
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseMode(value) {
  if (!/^\d{3,4}$/.test(String(value))) return undefined;
  const source = String(value);
  return source.startsWith("0")
    ? Number.parseInt(source, 8)
    : Number.parseInt(source, 10);
}

function assertRequestedTmpfs(mount, requested) {
  if (
    mount.type !== "tmpfs" ||
    !["tmpfs", requested.destination].includes(mount.source)
  ) {
    throw new Error("contained rootless OCI spec requested tmpfs changed");
  }
  const observed = mountOptionState(mount.options, "tmpfs");
  const expected = mountOptionState(requested.options, "expected tmpfs");
  for (const required of ["rw", "noexec", "nosuid", "nodev"]) {
    if (!observed.flags.has(required)) {
      throw new Error("contained rootless OCI spec tmpfs lost isolation");
    }
  }
  if (
    parseSize(observed.values.get("size")) !==
      parseSize(expected.values.get("size")) ||
    Number(observed.values.get("uid")) !== Number(expected.values.get("uid")) ||
    Number(observed.values.get("gid")) !== Number(expected.values.get("gid")) ||
    parseMode(observed.values.get("mode")) !==
      parseMode(expected.values.get("mode"))
  ) {
    throw new Error("contained rootless OCI spec tmpfs policy changed");
  }
  const safeFlags = new Set([
    "nodev",
    "noexec",
    "nosuid",
    "relatime",
    "rprivate",
    "rw",
    "strictatime",
  ]);
  if (
    [...observed.flags].some((flag) => !safeFlags.has(flag)) ||
    [...observed.values.keys()].some(
      (name) => !["gid", "mode", "size", "uid"].includes(name),
    )
  ) {
    throw new Error("contained rootless OCI spec tmpfs has unknown policy");
  }
}

function assertPseudoMount(mount) {
  const policies = {
    "/dev": { type: "tmpfs", flags: ["nosuid"] },
    "/dev/mqueue": {
      type: "mqueue",
      flags: ["nodev", "noexec", "nosuid"],
    },
    "/dev/pts": { type: "devpts", flags: ["noexec", "nosuid"] },
    "/dev/shm": {
      type: "tmpfs",
      flags: ["nodev", "noexec", "nosuid"],
    },
    "/proc": { type: "proc", flags: ["nodev", "noexec", "nosuid"] },
    "/sys": {
      type: "sysfs",
      flags: ["nodev", "noexec", "nosuid", "ro"],
    },
    "/sys/fs/cgroup": {
      type: "cgroup",
      flags: ["nodev", "noexec", "nosuid", "ro"],
    },
  };
  const policy = policies[mount.destination];
  if (policy === undefined || mount.type !== policy.type) {
    throw new Error("contained rootless OCI spec pseudo filesystem changed");
  }
  const options = mountOptionState(mount.options, "pseudo filesystem");
  if (policy.flags.some((flag) => !options.flags.has(flag))) {
    throw new Error(
      "contained rootless OCI spec pseudo filesystem lost isolation",
    );
  }
  const unsafe = ["bind", "dev", "exec", "rbind", "rw", "shared", "suid"];
  if (
    mount.destination !== "/dev" &&
    unsafe.some((flag) => options.flags.has(flag))
  ) {
    throw new Error("contained rootless OCI spec pseudo filesystem is unsafe");
  }
}

function assertFilesystemShape(parsed, expected) {
  const root = object(parsed.root, "root filesystem");
  assertKnownKeys(root, new Set(["path", "readonly"]), "root fields");
  if (root.readonly !== true) {
    throw new Error("contained rootless OCI spec root filesystem is writable");
  }
  if (root.path !== "rootfs") {
    throw new Error("contained rootless OCI spec root path is invalid");
  }
  if (!Array.isArray(parsed.mounts)) {
    throw new Error("contained rootless OCI spec mounts are invalid");
  }
  const observedDestinations = new Set();
  const requestedMounts = new Map(
    expected.imageAuthority.requestedMounts.map((entry) => [
      entry.destination,
      entry,
    ]),
  );
  const requestedTmpfs = new Map(
    expected.imageAuthority.requestedTmpfs.map((entry) => [
      entry.destination,
      entry,
    ]),
  );
  const requiredPseudo = new Set([
    "/dev",
    "/dev/mqueue",
    "/dev/pts",
    "/dev/shm",
    "/proc",
    "/sys",
  ]);
  for (const [index, entry] of parsed.mounts.entries()) {
    const mount = object(entry, "mount");
    assertKnownKeys(
      mount,
      new Set(["destination", "options", "source", "type"]),
      "mount fields",
    );
    if (
      typeof mount.destination !== "string" ||
      !mount.destination.startsWith("/") ||
      mount.destination.includes("\0") ||
      typeof mount.type !== "string" ||
      mount.type.length === 0 ||
      !Array.isArray(mount.options) ||
      mount.options.some((option) => typeof option !== "string")
    ) {
      throw new Error(`contained rootless OCI spec mount ${index} is invalid`);
    }
    if (observedDestinations.has(mount.destination)) {
      throw new Error(
        "contained rootless OCI spec mount destination is duplicated",
      );
    }
    observedDestinations.add(mount.destination);
    const optionState = mountOptionState(mount.options, "mount");
    const isBind =
      mount.type === "bind" ||
      optionState.flags.has("bind") ||
      optionState.flags.has("rbind");
    if (isBind) {
      if (
        typeof mount.source !== "string" ||
        !isAbsolute(mount.source) ||
        !contained(repositoryRoot, resolve(mount.source)) ||
        lstatSync(mount.source).isSymbolicLink() ||
        !contained(repositoryRoot, realpathSync(mount.source))
      ) {
        throw new Error(
          "contained rootless OCI spec bind mount escaped the repository",
        );
      }
      const requested = requestedMounts.get(mount.destination);
      const internal = [
        "/etc/hostname",
        "/etc/hosts",
        "/etc/resolv.conf",
      ].includes(mount.destination);
      if (requested !== undefined) {
        if (
          mount.type !== "bind" ||
          realpathSync(mount.source) !== requested.source ||
          requested.readonly !== optionState.flags.has("ro")
        ) {
          throw new Error("contained rootless OCI spec requested bind changed");
        }
        assertRequestedBindOptions(optionState, requested);
        requestedMounts.delete(mount.destination);
      } else if (!internal) {
        throw new Error("contained rootless OCI spec has an unrequested bind");
      } else if (
        mount.type !== "bind" ||
        !sameStrings(mount.options, ["bind", "rprivate"]) ||
        !contained(expected.sessionRoot, realpathSync(mount.source))
      ) {
        throw new Error("contained rootless OCI internal bind changed");
      }
      if (
        [
          "shared",
          "slave",
          "unbindable",
          "rshared",
          "rslave",
          "runbindable",
        ].some((flag) => optionState.flags.has(flag))
      ) {
        throw new Error(
          "contained rootless OCI spec bind propagation is unsafe",
        );
      }
      continue;
    }
    const tmpfs = requestedTmpfs.get(mount.destination);
    if (tmpfs !== undefined) {
      assertRequestedTmpfs(mount, tmpfs);
      requestedTmpfs.delete(mount.destination);
      continue;
    }
    assertPseudoMount(mount);
    requiredPseudo.delete(mount.destination);
  }
  if (
    requestedMounts.size > 0 ||
    requestedTmpfs.size > 0 ||
    requiredPseudo.size > 0
  ) {
    throw new Error("contained rootless OCI spec mount set is incomplete");
  }
}

function annotationString(annotations, key) {
  const value = annotations[key];
  if (
    typeof value !== "string" ||
    value.length > 131_072 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`contained rootless OCI annotation ${key} is invalid`);
  }
  return value;
}

function annotationJson(annotations, key) {
  const source = annotationString(annotations, key);
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`contained rootless OCI annotation ${key} is invalid`, {
      cause: error,
    });
  }
}

function assertNerdctlMountAnnotations(annotations, expected) {
  const mounts = annotationJson(annotations, "nerdctl/mounts");
  if (!Array.isArray(mounts)) {
    throw new Error("contained rootless OCI mount annotations are invalid");
  }
  const expectedMounts = new Map([
    ...expected.imageAuthority.requestedMounts.map((entry) => [
      entry.destination,
      { ...entry, type: "bind" },
    ]),
    ...expected.imageAuthority.requestedTmpfs.map((entry) => [
      entry.destination,
      { ...entry, type: "tmpfs" },
    ]),
  ]);
  if (mounts.length !== expectedMounts.size) {
    throw new Error("contained rootless OCI mount annotations changed");
  }
  for (const entry of mounts) {
    const mount = object(entry, "mount annotation");
    const fields = new Set([
      "Destination",
      "Mode",
      "Propagation",
      "RW",
      "Source",
      "Type",
    ]);
    assertKnownKeys(mount, fields, "mount annotation fields");
    if (
      Object.keys(mount).length !== fields.size ||
      typeof mount.Destination !== "string" ||
      typeof mount.Source !== "string" ||
      typeof mount.Mode !== "string" ||
      typeof mount.Propagation !== "string" ||
      typeof mount.RW !== "boolean" ||
      typeof mount.Type !== "string"
    ) {
      throw new Error("contained rootless OCI mount annotation is invalid");
    }
    const requested = expectedMounts.get(mount.Destination);
    if (requested === undefined || requested.type !== mount.Type) {
      throw new Error("contained rootless OCI mount annotations changed");
    }
    if (requested.type === "bind") {
      const expectedReadOnly = requested.readonly === true;
      const acceptedModes = expectedReadOnly
        ? ["ro", "ro,rbind"]
        : ["", "rbind"];
      if (
        mount.Source !== requested.source ||
        mount.RW !== !expectedReadOnly ||
        mount.Propagation !== "" ||
        !acceptedModes.includes(mount.Mode)
      ) {
        throw new Error("contained rootless OCI bind annotation changed");
      }
    } else {
      if (
        mount.Source !== "tmpfs" ||
        mount.RW !== true ||
        mount.Propagation !== ""
      ) {
        throw new Error("contained rootless OCI tmpfs annotation changed");
      }
      assertRequestedTmpfs(
        {
          type: mount.Type,
          source: mount.Source,
          options: mount.Mode.split(",").filter(Boolean),
        },
        requested,
      );
    }
    expectedMounts.delete(mount.Destination);
  }
  if (expectedMounts.size !== 0) {
    throw new Error("contained rootless OCI mount annotations are incomplete");
  }
}

function assertNerdctlAnnotations(parsed, expected, containerId) {
  const annotations = object(parsed.annotations, "annotations");
  const keys = Object.keys(annotations).sort();
  if (
    keys.length !== nerdctlAnnotationKeys.size ||
    keys.some((key) => !nerdctlAnnotationKeys.has(key))
  ) {
    throw new Error(
      `contained rootless OCI annotation set changed: ${keys.join(",")}`,
    );
  }
  for (const key of keys) annotationString(annotations, key);

  const exactStrings = {
    "nerdctl/auto-remove": "true",
    "nerdctl/domainname": "",
    "nerdctl/hostname": parsed.hostname,
    "nerdctl/name": expected.containerName,
    "nerdctl/namespace": namespace,
    "nerdctl/platform": "linux/amd64",
    "nerdctl/user": `${expected.imageAuthority.process.uid}:${expected.imageAuthority.process.gid}`,
  };
  for (const [key, value] of Object.entries(exactStrings)) {
    if (annotations[key] !== value) {
      throw new Error(`contained rootless OCI annotation ${key} changed`);
    }
  }
  if (
    !sameStrings(annotationJson(annotations, "nerdctl/extraHosts"), []) ||
    !sameStrings(annotationJson(annotations, "nerdctl/networks"), ["none"])
  ) {
    throw new Error("contained rootless OCI network annotations changed");
  }

  const hostConfig = annotationJson(annotations, "nerdctl/host-config");
  const dns = annotationJson(annotations, "nerdctl/dns");
  const ipc = annotationJson(annotations, "nerdctl/ipc");
  if (
    canonicalJson(hostConfig) !==
      canonicalJson({ BlkioWeight: 0, CidFile: "", Devices: null }) ||
    canonicalJson(dns) !==
      canonicalJson({
        DNSServers: null,
        DNSResolvConfOptions: null,
        DNSSearchDomains: null,
      }) ||
    canonicalJson(ipc) !== canonicalJson({ mode: "private" })
  ) {
    throw new Error("contained rootless OCI host annotations changed");
  }

  const containerdSocket = resolve(expected.sessionRoot, "run/containerd.sock");
  const dataStore = resolve(
    expected.sessionRoot,
    "data/nerdctl",
    sha256(containerdSocket).slice(0, 8),
  );
  const stateDir = annotationString(annotations, "nerdctl/state-dir");
  const expectedStateDir = resolve(
    dataStore,
    "containers",
    namespace,
    containerId,
  );
  if (
    !isAbsolute(stateDir) ||
    resolve(stateDir) !== stateDir ||
    stateDir !== expectedStateDir ||
    !contained(expected.sessionRoot, stateDir)
  ) {
    throw new Error("contained rootless OCI state annotation changed");
  }

  const logConfig = object(
    annotationJson(annotations, "nerdctl/log-config"),
    "log annotation",
  );
  assertKnownKeys(logConfig, new Set(["address", "driver"]), "log fields");
  if (
    Object.keys(logConfig).length !== 2 ||
    logConfig.driver !== "json-file" ||
    logConfig.address !== containerdSocket
  ) {
    throw new Error("contained rootless OCI log annotation changed");
  }

  let logUri;
  try {
    logUri = new URL(annotationString(annotations, "nerdctl/log-uri"));
  } catch (error) {
    throw new Error("contained rootless OCI log URI annotation is invalid", {
      cause: error,
    });
  }
  const logParameters = [...logUri.searchParams.entries()];
  if (
    logUri.protocol !== "binary:" ||
    logUri.hostname !== "" ||
    logUri.username !== "" ||
    logUri.password !== "" ||
    logUri.port !== "" ||
    logUri.hash !== "" ||
    logUri.pathname !== pinnedNerdctlBinary ||
    logParameters.length !== 1 ||
    logParameters[0][0] !== "_NERDCTL_INTERNAL_LOGGING" ||
    logParameters[0][1] !== dataStore
  ) {
    throw new Error("contained rootless OCI log URI annotation changed");
  }

  assertNerdctlMountAnnotations(annotations, expected);
}

function assertProcess(processSpec, expected, hostname) {
  assertKnownKeys(
    processSpec,
    new Set([
      "apparmorProfile",
      "args",
      "capabilities",
      "cwd",
      "env",
      "noNewPrivileges",
      "oomScoreAdj",
      "rlimits",
      "selinuxLabel",
      "terminal",
      "user",
    ]),
    "process fields",
  );
  const user = object(processSpec.user, "process user");
  assertKnownKeys(
    user,
    new Set(["additionalGids", "gid", "uid", "umask"]),
    "user fields",
  );
  const additionalGids = user.additionalGids;
  const identityIssues = [];
  if (processSpec.noNewPrivileges !== true)
    identityIssues.push("noNewPrivileges");
  if (![undefined, false].includes(processSpec.terminal))
    identityIssues.push("terminal");
  if (
    user.uid !== expected.imageAuthority.process.uid ||
    user.gid !== expected.imageAuthority.process.gid ||
    !Array.isArray(additionalGids) ||
    additionalGids.length !== 1 ||
    additionalGids[0] !== expected.imageAuthority.process.gid ||
    user.umask !== undefined
  ) {
    identityIssues.push("user");
  }
  if (!sameStrings(processSpec.args, expected.imageAuthority.process.args)) {
    identityIssues.push("args");
  }
  if (
    !sameStrings(processSpec.env, [
      ...expected.imageAuthority.process.env,
      `HOSTNAME=${hostname}`,
    ])
  ) {
    identityIssues.push("env");
  }
  if (processSpec.cwd !== expected.imageAuthority.process.cwd) {
    identityIssues.push("cwd");
  }
  if (
    (processSpec.apparmorProfile !== undefined &&
      processSpec.apparmorProfile !== "") ||
    (processSpec.selinuxLabel !== undefined &&
      processSpec.selinuxLabel !== "") ||
    (processSpec.oomScoreAdj !== undefined && processSpec.oomScoreAdj !== 0)
  ) {
    identityIssues.push("host-policy");
  }
  if (identityIssues.length > 0) {
    throw new Error(
      `contained rootless OCI spec security identity changed: ${identityIssues.join(", ")}`,
    );
  }
  assertEmptyCapabilities(processSpec);
  assertRlimits(processSpec, expected.rlimits);
}

function assertPathPolicy(linux) {
  for (const [value, expected, label] of [
    [linux.maskedPaths, maskedPaths, "masked"],
    [linux.readonlyPaths, readonlyPaths, "read-only"],
  ]) {
    if (
      !Array.isArray(value) ||
      new Set(value).size !== value.length ||
      value.some((entry) => typeof entry !== "string") ||
      value.some((entry) => !expected.has(entry)) ||
      [...expected].some((entry) => !value.includes(entry))
    ) {
      throw new Error(
        `contained rootless OCI spec ${label} path policy changed`,
      );
    }
  }
}

function assertDevices(linux) {
  if (linux.devices !== undefined) {
    throw new Error("contained rootless OCI spec device set changed");
  }
}

function assertSeccomp(linux) {
  const seccomp = object(linux.seccomp, "seccomp policy");
  assertKnownKeys(
    seccomp,
    new Set([
      "architectures",
      "defaultAction",
      "defaultErrnoRet",
      "flags",
      "syscalls",
    ]),
    "seccomp fields",
  );
  if (
    !["SCMP_ACT_ERRNO", "SCMP_ACT_KILL", "SCMP_ACT_KILL_PROCESS"].includes(
      seccomp.defaultAction,
    ) ||
    !Array.isArray(seccomp.architectures) ||
    !seccomp.architectures.includes("SCMP_ARCH_X86_64") ||
    !Array.isArray(seccomp.syscalls) ||
    seccomp.syscalls.length === 0 ||
    (seccomp.flags !== undefined &&
      (!Array.isArray(seccomp.flags) ||
        seccomp.flags.some(
          (flag) =>
            ![
              "SECCOMP_FILTER_FLAG_LOG",
              "SECCOMP_FILTER_FLAG_SPEC_ALLOW",
            ].includes(flag),
        )))
  ) {
    throw new Error("contained rootless OCI spec seccomp default is unsafe");
  }
  const restrictedRuleIndexes = [];
  for (const [index, entry] of seccomp.syscalls.entries()) {
    const syscall = object(entry, "seccomp syscall rule");
    assertKnownKeys(
      syscall,
      new Set(["action", "args", "errnoRet", "names"]),
      "seccomp syscall fields",
    );
    if (
      !Array.isArray(syscall.names) ||
      syscall.names.length === 0 ||
      syscall.names.some((name) => !/^[a-z0-9_]+$/.test(name)) ||
      ![
        "SCMP_ACT_ALLOW",
        "SCMP_ACT_ERRNO",
        "SCMP_ACT_KILL",
        "SCMP_ACT_KILL_PROCESS",
      ].includes(syscall.action) ||
      (syscall.args !== undefined && !Array.isArray(syscall.args))
    ) {
      throw new Error("contained rootless OCI spec seccomp rule is invalid");
    }
    const args = syscall.args ?? [];
    for (const entry of args) {
      const argument = object(entry, "seccomp syscall argument");
      assertKnownKeys(
        argument,
        new Set(["index", "op", "value", "valueTwo"]),
        "seccomp syscall argument fields",
      );
      if (
        !Number.isSafeInteger(argument.index) ||
        argument.index < 0 ||
        argument.index > 5 ||
        !Number.isSafeInteger(argument.value) ||
        argument.value < 0 ||
        (argument.valueTwo !== undefined &&
          (!Number.isSafeInteger(argument.valueTwo) ||
            argument.valueTwo < 0)) ||
        ![
          "SCMP_CMP_EQ",
          "SCMP_CMP_GE",
          "SCMP_CMP_GT",
          "SCMP_CMP_LE",
          "SCMP_CMP_LT",
          "SCMP_CMP_MASKED_EQ",
          "SCMP_CMP_NE",
        ].includes(argument.op)
      ) {
        throw new Error(
          "contained rootless OCI spec seccomp argument is invalid",
        );
      }
    }
    const forbiddenAllowedSyscalls = new Set([
      "acct",
      "add_key",
      "bpf",
      "delete_module",
      "finit_module",
      "fsconfig",
      "fsmount",
      "fsopen",
      "init_module",
      "ioperm",
      "iopl",
      "kexec_file_load",
      "kexec_load",
      "keyctl",
      "lookup_dcookie",
      "mount",
      "mount_setattr",
      "move_mount",
      "open_by_handle_at",
      "open_tree",
      "perf_event_open",
      "process_vm_readv",
      "process_vm_writev",
      "ptrace",
      "quotactl",
      "reboot",
      "request_key",
      "setns",
      "swapoff",
      "swapon",
      "syslog",
      "umount2",
      "unshare",
      "userfaultfd",
    ]);
    if (syscall.action === "SCMP_ACT_ALLOW") {
      const forbiddenNames = syscall.names.filter((name) =>
        forbiddenAllowedSyscalls.has(name),
      );
      if (forbiddenNames.length > 0) {
        const isPinnedRestrictedRule =
          sameStrings(syscall.names, [
            "process_vm_readv",
            "process_vm_writev",
            "ptrace",
          ]) &&
          args.length === 0 &&
          syscall.errnoRet === undefined;
        if (!isPinnedRestrictedRule) {
          throw new Error(
            "contained rootless OCI spec seccomp rule expands host authority",
          );
        }
        restrictedRuleIndexes.push(index);
      }
    }
    if (
      syscall.action === "SCMP_ACT_ALLOW" &&
      syscall.names.includes("clone3")
    ) {
      throw new Error(
        "contained rootless OCI spec seccomp clone3 rule expands host authority",
      );
    }
    if (
      syscall.action === "SCMP_ACT_ALLOW" &&
      syscall.names.includes("clone") &&
      !args.some(
        (argument) =>
          argument.index === 0 &&
          argument.op === "SCMP_CMP_MASKED_EQ" &&
          argument.value === 0x7e020000 &&
          [undefined, 0].includes(argument.valueTwo),
      )
    ) {
      throw new Error(
        "contained rootless OCI spec seccomp clone rule expands host authority",
      );
    }
  }
  if (restrictedRuleIndexes.length !== 1) {
    throw new Error(
      "contained rootless OCI spec restricted trace rule changed",
    );
  }
  return restrictedRuleIndexes;
}

function assertLinuxSecurity(linux) {
  assertKnownKeys(
    linux,
    new Set([
      "cgroupsPath",
      "devices",
      "maskedPaths",
      "namespaces",
      "readonlyPaths",
      "resources",
      "rootfsPropagation",
      "seccomp",
      "sysctl",
    ]),
    "Linux fields",
  );
  const sysctl = object(linux.sysctl, "sysctl");
  if (
    (linux.rootfsPropagation !== undefined &&
      !["private", "rprivate"].includes(linux.rootfsPropagation)) ||
    Object.keys(sysctl).length !== 1 ||
    sysctl["net.ipv4.ip_unprivileged_port_start"] !== "0"
  ) {
    throw new Error("contained rootless OCI spec Linux host policy changed");
  }
  assertDevices(linux);
  assertPathPolicy(linux);
  return { restrictedSeccompRuleIndexes: assertSeccomp(linux) };
}

export function sanitizeContainedRootlessSpec({
  containerId,
  expected,
  metadataSha256,
  source,
}) {
  if (
    !containerIdPattern.test(containerId) ||
    !invocationIdPattern.test(expected?.invocationId ?? "") ||
    !/^[a-f0-9]{64}$/.test(metadataSha256 ?? "") ||
    typeof expected?.containerName !== "string" ||
    expected.containerName.length === 0 ||
    !isAbsolute(expected?.sessionRoot ?? "") ||
    !contained(repositoryRoot, expected.sessionRoot) ||
    typeof expected?.imageAuthority?.commandSha256 !== "string"
  ) {
    throw new Error("contained rootless OCI container ID is invalid");
  }
  if (
    typeof source !== "string" ||
    source.length === 0 ||
    source.length > 1_048_576
  ) {
    throw new Error("contained rootless OCI spec source is invalid");
  }
  let parsed;
  try {
    parsed = object(JSON.parse(source), "root");
  } catch (error) {
    throw new Error("contained rootless OCI spec JSON is invalid", {
      cause: error,
    });
  }
  assertKnownKeys(
    parsed,
    new Set([
      "annotations",
      "hostname",
      "hooks",
      "linux",
      "mounts",
      "ociVersion",
      "process",
      "root",
    ]),
    "top-level fields",
  );
  if (
    typeof parsed.ociVersion !== "string" ||
    !/^1\.[0-3]\.\d+$/.test(parsed.ociVersion) ||
    typeof parsed.hostname !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(parsed.hostname) ||
    parsed.hostname !== containerId.slice(0, 12)
  ) {
    throw new Error("contained rootless OCI spec top-level identity changed");
  }
  assertNerdctlAnnotations(parsed, expected, containerId);
  const processSpec = object(parsed.process, "process");
  const linux = object(parsed.linux, "Linux section");
  const hasNerdctlHooks = assertNerdctlHooks(parsed, expected);
  assertFilesystemShape(parsed, expected);
  assertProcess(processSpec, expected, parsed.hostname);
  assertResourceIntent(linux, expected);
  assertNamespaces(linux);
  const linuxNormalization = assertLinuxSecurity(linux);

  const internalMounts = captureContainedInternalMounts(
    parsed,
    expected,
    containerId,
  );
  const originalCanonical = canonicalJson(parsed);
  const imageRootfsPath = containedImageRootfsPath(
    resolve(expected.sessionRoot, "run/rootless-specs"),
    expected.invocationId,
  );
  parsed.root.path = imageRootfsPath;
  processSpec.terminal = false;
  processSpec.user.additionalGids = [];
  processSpec.env = [...expected.imageAuthority.process.env];
  processSpec.capabilities = {
    ambient: [],
    bounding: [],
    effective: [],
    inheritable: [],
    permitted: [],
  };
  linux.seccomp.syscalls = linux.seccomp.syscalls.filter(
    (_entry, index) =>
      !linuxNormalization.restrictedSeccompRuleIndexes.includes(index),
  );
  const internalMountDestinations = new Set(
    internalMountPolicy.map((entry) => entry.containerDestination),
  );
  parsed.mounts = parsed.mounts.filter(
    (mount) => !internalMountDestinations.has(mount.destination),
  );
  if (hasNerdctlHooks) delete parsed.hooks;
  delete parsed.annotations;
  delete linux.cgroupsPath;
  delete linux.resources;
  delete linux.sysctl;
  if (
    Object.hasOwn(linux, "cgroupsPath") ||
    Object.hasOwn(linux, "resources")
  ) {
    throw new Error("contained rootless OCI spec cgroup removal failed");
  }
  const baseSpecSha256 = sha256(canonicalJson(parsed));
  const runtimeAnnotations = {
    "io.counterlab.runtime.base-spec-sha256": baseSpecSha256,
    "io.counterlab.runtime.invocation": expected.invocationId,
  };
  parsed.annotations = runtimeAnnotations;
  const sanitizedCanonical = canonicalJson(parsed);
  const sanitizedSpecSha256 = sha256(sanitizedCanonical);
  const internalMountManifest = internalMounts.captures.map((capture) => ({
    byteLength: capture.contents.byteLength,
    containerDestination: capture.containerDestination,
    contentSha256: capture.contentSha256,
    fileName: capture.fileName,
  }));
  const internalMountManifestSha256 = sha256(
    canonicalJson(internalMountManifest),
  );
  const readOnlyMountManifest = expected.imageAuthority.readOnlyMountManifest;
  const readOnlyMountManifestSha256 =
    expected.imageAuthority.readOnlyMountManifestSha256;
  if (
    !Array.isArray(readOnlyMountManifest) ||
    !/^[a-f0-9]{64}$/.test(readOnlyMountManifestSha256 ?? "") ||
    sha256(canonicalJson(readOnlyMountManifest)) !== readOnlyMountManifestSha256
  ) {
    throw new Error(
      "contained rootless OCI read-only mount authority is invalid",
    );
  }
  const finalContainerId = sha256(
    `counterlab-rootless-v4\0${expected.invocationId}\0${containerId}\0${sanitizedSpecSha256}\0${expected.imageAuthority.commandSha256}\0${internalMountManifestSha256}\0${readOnlyMountManifestSha256}`,
  );
  const config = `${JSON.stringify(parsed, null, 2)}\n`;
  const receiptPayload = {
    schemaVersion: "4",
    status: "VALIDATED",
    limitMode: "process-address-space-rlimit-with-unenforced-cgroup-intent",
    aggregateLimitIntentEnforced: false,
    invocationId: expected.invocationId,
    stagingContainerId: containerId,
    finalContainerId,
    metadataSha256,
    originalSpecSha256: sha256(originalCanonical),
    baseSpecSha256,
    sanitizedSpecSha256,
    configFileSha256: sha256(config),
    internalMountManifest,
    internalMountManifestSha256,
    readOnlyMountManifest,
    readOnlyMountManifestSha256,
    commandSha256: expected.imageAuthority.commandSha256,
    imageAuthority: {
      canonicalImage: expected.imageAuthority.canonicalImage,
      configDigest: expected.imageAuthority.configDigest,
      layerDigests: expected.imageAuthority.layerDigests,
      manifestDigest: expected.imageAuthority.manifestDigest,
      rootfsChainId: expected.imageAuthority.rootfsChainId,
      sourceCommit: expected.imageAuthority.sourceCommit,
      sourceTreeSha256: expected.imageAuthority.sourceTreeSha256,
      targetDigest: expected.imageAuthority.targetDigest,
      targetMediaType: expected.imageAuthority.targetMediaType,
    },
    imageRootfs: {
      mode: "containerd-ephemeral-writable-snapshot-readonly-runtime",
      mountPath: imageRootfsPath,
      parentChainId: expected.imageAuthority.rootfsChainId,
      snapshotter: "native",
    },
    removedFields: [
      ...(hasNerdctlHooks ? ["hooks"] : []),
      "annotations",
      "linux.cgroupsPath",
      "linux.resources",
      "linux.sysctl",
      "linux.seccomp.restrictedTraceRule",
    ],
    normalizedFields: [
      "annotations",
      "process.terminal",
      "process.user.additionalGids",
      "process.env.HOSTNAME",
      "process.capabilities",
      "root.path",
    ],
    removedMounts: internalMountManifest.map(
      (entry) => entry.containerDestination,
    ),
    intendedAggregateLimits: {
      cpuCount: expected.cpuCount,
      maxProcesses: expected.maxProcesses,
      memoryBytes: expected.memoryBytes,
    },
    enforcedRlimits: [...expected.rlimits].sort((left, right) =>
      left.type.localeCompare(right.type),
    ),
    aggregateLimitEvidence: null,
  };
  const receipt = {
    ...receiptPayload,
    receiptPayloadSha256: sha256(canonicalJson(receiptPayload)),
  };
  return {
    config,
    finalContainerId,
    internalMounts: internalMounts.captures.map((capture) => ({
      containerDestination: capture.containerDestination,
      contents: capture.contents,
      contentSha256: capture.contentSha256,
      fileName: capture.fileName,
      targetPath: capture.targetPath,
    })),
    receipt,
  };
}

export function validateContainedContainerInfo({
  configFileSha256,
  containerId,
  image,
  invocationId,
  source,
}) {
  const expectedImage = `docker.io/library/counterlab-runtime-invocation:${invocationId}`;
  if (
    !containerIdPattern.test(containerId) ||
    !invocationIdPattern.test(invocationId ?? "") ||
    image !== expectedImage ||
    (configFileSha256 !== undefined &&
      !/^[a-f0-9]{64}$/.test(configFileSha256)) ||
    typeof source !== "string" ||
    source.length === 0 ||
    source.length > 1_048_576
  ) {
    throw new Error(
      image !== expectedImage
        ? "contained rootless container image identity is invalid"
        : "contained rootless container metadata input is invalid",
    );
  }
  let metadata;
  try {
    metadata = object(JSON.parse(source), "container metadata");
  } catch (error) {
    throw new Error("contained rootless container metadata JSON is invalid", {
      cause: error,
    });
  }
  const runtime = object(metadata.Runtime, "container runtime metadata");
  const labels = object(metadata.Labels, "container labels");
  if (metadata.ID !== containerId) {
    throw new Error("contained rootless container metadata ID changed");
  }
  if (metadata.Image !== image) {
    throw new Error("contained rootless container metadata image changed");
  }
  if (metadata.SnapshotKey !== containerId) {
    throw new Error(
      "contained rootless container metadata snapshot key changed",
    );
  }
  if (metadata.Snapshotter !== "native") {
    throw new Error(
      "contained rootless container metadata snapshotter changed",
    );
  }
  if (runtime.Name !== "io.containerd.runc.v2") {
    throw new Error("contained rootless container metadata runtime changed");
  }
  if (
    labels["io.counterlab.runtime.invocation"] !== invocationId ||
    (configFileSha256 !== undefined &&
      labels["io.counterlab.runtime.config-sha256"] !== configFileSha256)
  ) {
    throw new Error("contained rootless container ownership changed");
  }
  return metadata;
}

export function validateContainedConfigContainerInfo({
  baseSpecSha256,
  containerId,
  invocationId,
  source,
}) {
  if (
    !containerIdPattern.test(containerId) ||
    !invocationIdPattern.test(invocationId ?? "") ||
    !/^[a-f0-9]{64}$/.test(baseSpecSha256 ?? "") ||
    typeof source !== "string" ||
    source.length === 0 ||
    source.length > 1_048_576
  ) {
    throw new Error("contained rootless config container input is invalid");
  }
  let metadata;
  try {
    metadata = object(JSON.parse(source), "config container metadata");
  } catch (error) {
    throw new Error("contained rootless config container JSON is invalid", {
      cause: error,
    });
  }
  const runtime = object(metadata.Runtime, "config container runtime");
  const labels = object(metadata.Labels, "config container labels");
  if (
    metadata.ID !== containerId ||
    metadata.Image !== "" ||
    metadata.SnapshotKey !== "" ||
    metadata.Snapshotter !== "" ||
    runtime.Name !== "io.containerd.runc.v2" ||
    labels["io.counterlab.runtime.invocation"] !== invocationId ||
    JSON.stringify(Object.keys(labels).sort()) !==
      JSON.stringify(
        [
          "io.counterlab.runtime.base-spec-sha256",
          "io.counterlab.runtime.invocation",
        ].sort(),
      ) ||
    labels["io.counterlab.runtime.base-spec-sha256"] !== baseSpecSha256
  ) {
    throw new Error("contained rootless config container ownership changed");
  }
  return metadata;
}

function containedSpecRoot(sessionRoot, { create }) {
  if (!isAbsolute(sessionRoot) || !contained(repositoryRoot, sessionRoot)) {
    throw new Error("contained rootless OCI persistence input is invalid");
  }
  assertPrivateDirectory(sessionRoot, "session root", 0o700);
  const runRoot = resolve(sessionRoot, "run");
  if (!contained(sessionRoot, runRoot)) {
    throw new Error("contained rootless OCI persistence escaped the session");
  }
  assertPrivateDirectory(runRoot, "runtime state root", 0o700);
  const specRoot = resolve(runRoot, "rootless-specs");
  if (create) mkdirSync(specRoot, { recursive: true, mode: 0o700 });
  assertPrivateDirectory(specRoot, "persistence root", 0o700);
  return specRoot;
}

function containedImageRootfsPath(specRoot, invocationId) {
  if (!invocationIdPattern.test(invocationId ?? "")) {
    throw new Error("contained rootless OCI image rootfs identity is invalid");
  }
  const rootfsPath = resolve(specRoot, `${invocationId}.image-rootfs`);
  if (!contained(specRoot, rootfsPath)) {
    throw new Error(
      "contained rootless OCI image rootfs escaped persistence root",
    );
  }
  return rootfsPath;
}

function assertPrivateFile(path, specRoot, label) {
  if (!contained(specRoot, path)) {
    throw new Error(`contained rootless OCI ${label} escaped persistence root`);
  }
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o600) !== 0o600 ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new Error(`contained rootless OCI ${label} is invalid`);
  }
}

function assertInternalMountFile(path, assetRoot, label) {
  if (!contained(assetRoot, path)) {
    throw new Error(`contained rootless OCI ${label} escaped asset root`);
  }
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o600) !== 0o600 ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.nlink !== 1 ||
    metadata.size < 1 ||
    metadata.size > internalMountContentLimit
  ) {
    throw new Error(`contained rootless OCI ${label} is invalid`);
  }
}

function validateInternalMountManifest(receipt) {
  if (
    !invocationIdPattern.test(receipt?.invocationId ?? "") ||
    !Array.isArray(receipt?.internalMountManifest) ||
    receipt.internalMountManifest.length !== internalMountPolicy.length ||
    !/^[a-f0-9]{64}$/.test(receipt?.internalMountManifestSha256 ?? "") ||
    sha256(canonicalJson(receipt.internalMountManifest)) !==
      receipt.internalMountManifestSha256
  ) {
    throw new Error(
      "contained rootless OCI internal mount manifest is invalid",
    );
  }
  for (const [index, policy] of internalMountPolicy.entries()) {
    const entry = object(
      receipt.internalMountManifest[index],
      "internal mount manifest entry",
    );
    assertKnownKeys(
      entry,
      new Set([
        "byteLength",
        "containerDestination",
        "contentSha256",
        "fileName",
      ]),
      "internal mount manifest fields",
    );
    if (
      Object.keys(entry).length !== 4 ||
      entry.containerDestination !== policy.containerDestination ||
      entry.fileName !== policy.fileName ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 1 ||
      entry.byteLength > internalMountContentLimit ||
      !/^[a-f0-9]{64}$/.test(entry.contentSha256 ?? "")
    ) {
      throw new Error("contained rootless OCI internal mount manifest changed");
    }
  }
  return receipt.internalMountManifest;
}

function validateReadOnlyMountManifest(receipt) {
  if (
    !Array.isArray(receipt?.readOnlyMountManifest) ||
    !/^[a-f0-9]{64}$/.test(receipt?.readOnlyMountManifestSha256 ?? "") ||
    sha256(canonicalJson(receipt.readOnlyMountManifest)) !==
      receipt.readOnlyMountManifestSha256
  ) {
    throw new Error(
      "contained rootless OCI read-only mount manifest is invalid",
    );
  }
  const destinations = new Set();
  for (const entryValue of receipt.readOnlyMountManifest) {
    const entry = object(entryValue, "read-only mount manifest entry");
    assertKnownKeys(
      entry,
      new Set([
        "contentManifestSha256",
        "destination",
        "repositoryRelativeSource",
      ]),
      "read-only mount manifest fields",
    );
    const resolvedSource = resolve(
      repositoryRoot,
      entry.repositoryRelativeSource ?? "",
    );
    if (
      Object.keys(entry).length !== 3 ||
      !/^[a-f0-9]{64}$/.test(entry.contentManifestSha256 ?? "") ||
      typeof entry.destination !== "string" ||
      !entry.destination.startsWith("/") ||
      destinations.has(entry.destination) ||
      typeof entry.repositoryRelativeSource !== "string" ||
      entry.repositoryRelativeSource.length === 0 ||
      !contained(repositoryRoot, resolvedSource) ||
      relative(repositoryRoot, resolvedSource) !==
        entry.repositoryRelativeSource
    ) {
      throw new Error(
        "contained rootless OCI read-only mount manifest changed",
      );
    }
    destinations.add(entry.destination);
  }
  const sorted = [...receipt.readOnlyMountManifest].sort((left, right) =>
    left.destination.localeCompare(right.destination),
  );
  if (canonicalJson(sorted) !== canonicalJson(receipt.readOnlyMountManifest)) {
    throw new Error(
      "contained rootless OCI read-only mount manifest order changed",
    );
  }
  return receipt.readOnlyMountManifest;
}

function assertReceiptFinalIdentity(receipt) {
  if (
    receipt?.schemaVersion !== "4" ||
    !containerIdPattern.test(receipt?.stagingContainerId ?? "") ||
    !containerIdPattern.test(receipt?.finalContainerId ?? "") ||
    !/^[a-f0-9]{64}$/.test(receipt?.sanitizedSpecSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(receipt?.commandSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(receipt?.internalMountManifestSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(receipt?.readOnlyMountManifestSha256 ?? "") ||
    receipt.finalContainerId !==
      sha256(
        `counterlab-rootless-v4\0${receipt.invocationId}\0${receipt.stagingContainerId}\0${receipt.sanitizedSpecSha256}\0${receipt.commandSha256}\0${receipt.internalMountManifestSha256}\0${receipt.readOnlyMountManifestSha256}`,
      )
  ) {
    throw new Error("contained rootless OCI final identity changed");
  }
}

function internalMountAssetRoot(specRoot, invocationId) {
  const assetRoot = resolve(specRoot, `${invocationId}.internal-mounts`);
  if (!contained(specRoot, assetRoot)) {
    throw new Error("contained rootless OCI internal mount root escaped");
  }
  return assetRoot;
}

function assertConfigInternalMountsRemoved(config) {
  let parsed;
  try {
    parsed = object(JSON.parse(config), "persisted config");
  } catch (error) {
    throw new Error("contained rootless OCI persisted config is invalid", {
      cause: error,
    });
  }
  if (!Array.isArray(parsed.mounts)) {
    throw new Error("contained rootless OCI persisted mounts are invalid");
  }
  for (const policy of internalMountPolicy) {
    if (
      parsed.mounts.some(
        (mount) => mount?.destination === policy.containerDestination,
      )
    ) {
      throw new Error(
        `contained rootless OCI ${policy.fileName} mount was not removed`,
      );
    }
  }
}

function assertConfigImageRootfs(config, specRoot, receipt) {
  const binding = object(receipt?.imageRootfs, "image rootfs binding");
  const imageAuthority = object(receipt?.imageAuthority, "image authority");
  assertKnownKeys(
    imageAuthority,
    new Set([
      "canonicalImage",
      "configDigest",
      "layerDigests",
      "manifestDigest",
      "rootfsChainId",
      "sourceCommit",
      "sourceTreeSha256",
      "targetDigest",
      "targetMediaType",
    ]),
    "image authority fields",
  );
  assertKnownKeys(
    binding,
    new Set(["mode", "mountPath", "parentChainId", "snapshotter"]),
    "image rootfs binding fields",
  );
  const expectedPath = containedImageRootfsPath(specRoot, receipt.invocationId);
  let parsed;
  try {
    parsed = object(JSON.parse(config), "persisted config");
  } catch (error) {
    throw new Error("contained rootless OCI persisted config is invalid", {
      cause: error,
    });
  }
  const root = object(parsed.root, "persisted root filesystem");
  if (
    Object.keys(binding).length !== 4 ||
    binding.mode !==
      "containerd-ephemeral-writable-snapshot-readonly-runtime" ||
    binding.mountPath !== expectedPath ||
    !/^sha256:[a-f0-9]{64}$/.test(binding.parentChainId ?? "") ||
    binding.parentChainId !== imageAuthority.rootfsChainId ||
    binding.snapshotter !== "native" ||
    Object.keys(imageAuthority).length !== 9 ||
    !Array.isArray(imageAuthority.layerDigests) ||
    imageAuthority.layerDigests.length < 1 ||
    imageAuthority.layerDigests.length > 128 ||
    imageAuthority.layerDigests.some(
      (entry) => !/^sha256:[a-f0-9]{64}$/.test(entry ?? ""),
    ) ||
    root.path !== expectedPath ||
    root.readonly !== true
  ) {
    throw new Error("contained rootless OCI image rootfs binding changed");
  }
  return expectedPath;
}

function assertConfigRuntimeAnnotations(config, receipt) {
  let parsed;
  try {
    parsed = object(JSON.parse(config), "runtime annotated config");
  } catch (error) {
    throw new Error("contained rootless OCI runtime annotations are invalid", {
      cause: error,
    });
  }
  const annotations = object(parsed.annotations, "runtime annotations");
  const expected = {
    "io.counterlab.runtime.base-spec-sha256": receipt.baseSpecSha256,
    "io.counterlab.runtime.invocation": receipt.invocationId,
  };
  if (
    !/^[a-f0-9]{64}$/.test(receipt.baseSpecSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(receipt.sanitizedSpecSha256 ?? "") ||
    JSON.stringify(Object.keys(annotations).sort()) !==
      JSON.stringify(Object.keys(expected).sort()) ||
    Object.entries(expected).some(
      ([key, value]) => annotations[key] !== value,
    ) ||
    sha256(canonicalJson(parsed)) !== receipt.sanitizedSpecSha256
  ) {
    throw new Error("contained rootless OCI runtime annotations changed");
  }
  delete parsed.annotations;
  if (sha256(canonicalJson(parsed)) !== receipt.baseSpecSha256) {
    throw new Error("contained rootless OCI base spec binding changed");
  }
}

export function persistContainedRootlessSpec({
  config,
  finalContainerId,
  internalMounts,
  receipt,
  sessionRoot,
}) {
  if (
    !containerIdPattern.test(finalContainerId) ||
    typeof config !== "string" ||
    config.length === 0 ||
    config.length > 1_048_576 ||
    receipt?.finalContainerId !== finalContainerId ||
    receipt?.configFileSha256 !== sha256(config) ||
    !Array.isArray(internalMounts) ||
    internalMounts.length !== internalMountPolicy.length
  ) {
    throw new Error("contained rootless OCI persistence input is invalid");
  }
  const specRoot = containedSpecRoot(sessionRoot, { create: true });
  const manifest = validateInternalMountManifest(receipt);
  validateReadOnlyMountManifest(receipt);
  assertReceiptFinalIdentity(receipt);
  const assetRoot = internalMountAssetRoot(specRoot, receipt.invocationId);
  const imageRootfsPath = assertConfigImageRootfs(config, specRoot, receipt);
  assertConfigRuntimeAnnotations(config, receipt);
  assertConfigInternalMountsRemoved(config);
  mkdirSync(imageRootfsPath, { mode: 0o700 });
  assertPrivateDirectory(imageRootfsPath, "image rootfs mount point", 0o700);
  if (readdirSync(imageRootfsPath).length !== 0) {
    throw new Error(
      "contained rootless OCI image rootfs mount point is not empty",
    );
  }
  mkdirSync(assetRoot, { mode: 0o700 });
  assertPrivateDirectory(assetRoot, "internal mount asset root", 0o700);
  for (const [index, policy] of internalMountPolicy.entries()) {
    const input = object(internalMounts[index], "internal mount input");
    assertKnownKeys(
      input,
      new Set([
        "containerDestination",
        "contents",
        "contentSha256",
        "fileName",
        "targetPath",
      ]),
      "internal mount input fields",
    );
    const targetPath = resolve(assetRoot, policy.fileName);
    if (
      Object.keys(input).length !== 5 ||
      input.containerDestination !== policy.containerDestination ||
      input.fileName !== policy.fileName ||
      input.targetPath !== targetPath ||
      !Buffer.isBuffer(input.contents) ||
      input.contents.byteLength !== manifest[index].byteLength ||
      sha256(input.contents) !== manifest[index].contentSha256 ||
      input.contentSha256 !== manifest[index].contentSha256
    ) {
      throw new Error("contained rootless OCI internal mount input changed");
    }
    writeFileSync(targetPath, input.contents, { flag: "wx", mode: 0o600 });
    assertInternalMountFile(targetPath, assetRoot, `${policy.fileName} asset`);
    if (sha256(readFileSync(targetPath)) !== manifest[index].contentSha256) {
      throw new Error(
        `contained rootless OCI ${policy.fileName} asset changed`,
      );
    }
  }
  if (
    JSON.stringify(readdirSync(assetRoot).sort()) !==
    JSON.stringify(internalMountPolicy.map((entry) => entry.fileName).sort())
  ) {
    throw new Error("contained rootless OCI internal mount asset set changed");
  }
  const configPath = resolve(specRoot, `${finalContainerId}.config.json`);
  const receiptPath = resolve(specRoot, `${finalContainerId}.receipt.json`);
  const receiptSource = `${JSON.stringify(receipt, null, 2)}\n`;
  writeFileSync(configPath, config, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  writeFileSync(receiptPath, receiptSource, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  assertPrivateFile(configPath, specRoot, "config file");
  assertPrivateFile(receiptPath, specRoot, "receipt file");
  return {
    configFileSha256: receipt.configFileSha256,
    configPath,
    imageRootfsPath,
    receiptFileSha256: sha256(receiptSource),
    receiptPath,
  };
}

export function verifyPersistedContainedRootlessSpec({
  configFileSha256,
  configPath,
  finalContainerId,
  receiptFileSha256,
  receiptPath,
  imageRootfsPath,
  sessionRoot,
}) {
  if (
    !containerIdPattern.test(finalContainerId ?? "") ||
    !/^[a-f0-9]{64}$/.test(configFileSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(receiptFileSha256 ?? "")
  ) {
    throw new Error("contained rootless OCI persisted hash is invalid");
  }
  const specRoot = containedSpecRoot(sessionRoot, { create: false });
  const expectedConfigPath = resolve(
    specRoot,
    `${finalContainerId}.config.json`,
  );
  const expectedReceiptPath = resolve(
    specRoot,
    `${finalContainerId}.receipt.json`,
  );
  if (
    configPath !== expectedConfigPath ||
    receiptPath !== expectedReceiptPath
  ) {
    throw new Error("contained rootless OCI persisted paths changed");
  }
  assertPrivateFile(configPath, specRoot, "config file");
  assertPrivateFile(receiptPath, specRoot, "receipt file");
  const config = readFileSync(configPath);
  const receiptSource = readFileSync(receiptPath);
  if (config.byteLength === 0 || config.byteLength > 1_048_576) {
    throw new Error("contained rootless OCI persisted config is invalid");
  }
  if (sha256(config) !== configFileSha256) {
    throw new Error("contained rootless OCI persisted config changed");
  }
  if (
    receiptSource.byteLength === 0 ||
    receiptSource.byteLength > 1_048_576 ||
    sha256(receiptSource) !== receiptFileSha256
  ) {
    throw new Error("contained rootless OCI persisted receipt changed");
  }
  let receipt;
  try {
    receipt = object(
      JSON.parse(receiptSource.toString("utf8")),
      "persisted receipt",
    );
  } catch (error) {
    throw new Error("contained rootless OCI persisted receipt is invalid", {
      cause: error,
    });
  }
  const { receiptPayloadSha256, ...payload } = receipt;
  if (
    receipt.schemaVersion !== "4" ||
    receipt.finalContainerId !== finalContainerId ||
    receipt.configFileSha256 !== configFileSha256 ||
    !/^[a-f0-9]{64}$/.test(receiptPayloadSha256 ?? "") ||
    sha256(canonicalJson(payload)) !== receiptPayloadSha256
  ) {
    throw new Error("contained rootless OCI persisted receipt binding changed");
  }
  const expectedImageRootfsPath = containedImageRootfsPath(
    specRoot,
    receipt.invocationId,
  );
  if (imageRootfsPath !== expectedImageRootfsPath) {
    throw new Error("contained rootless OCI persisted paths changed");
  }
  assertConfigImageRootfs(config.toString("utf8"), specRoot, receipt);
  assertConfigRuntimeAnnotations(config.toString("utf8"), receipt);
  assertConfigInternalMountsRemoved(config.toString("utf8"));
  validateReadOnlyMountManifest(receipt);
  assertReceiptFinalIdentity(receipt);
  assertPrivateDirectory(imageRootfsPath, "image rootfs mount point", 0o700);
  if (readdirSync(imageRootfsPath).length !== 0) {
    throw new Error("contained rootless OCI image rootfs remains mounted");
  }
  const manifest = validateInternalMountManifest(receipt);
  const assetRoot = internalMountAssetRoot(specRoot, receipt.invocationId);
  assertPrivateDirectory(assetRoot, "internal mount asset root", 0o700);
  if (
    JSON.stringify(readdirSync(assetRoot).sort()) !==
    JSON.stringify(internalMountPolicy.map((entry) => entry.fileName).sort())
  ) {
    throw new Error("contained rootless OCI internal mount asset set changed");
  }
  for (const [index, policy] of internalMountPolicy.entries()) {
    const path = resolve(assetRoot, policy.fileName);
    assertInternalMountFile(path, assetRoot, `${policy.fileName} asset`);
    const contents = readFileSync(path);
    if (
      contents.byteLength !== manifest[index].byteLength ||
      sha256(contents) !== manifest[index].contentSha256
    ) {
      throw new Error(
        `contained rootless OCI ${policy.fileName} asset changed`,
      );
    }
  }
}
