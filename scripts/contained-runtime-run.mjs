#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { containedCgroupQualificationCoordinator } from "./contained-cgroup-qualification-coordinator.mjs";
import {
  persistContainedRootlessSpec,
  sanitizeContainedRootlessSpec,
  validateContainedContainerInfo,
  validateContainedConfigContainerInfo,
  verifyPersistedContainedRootlessSpec,
} from "./contained-rootless-spec.mjs";
import {
  createContainedImageAuthority,
  parseContainedImageManifest,
  parseContainedImageTarget,
  selectContainedImageManifest,
  validateContainedImageAliasTarget,
  verifyContainedReadOnlyMounts,
} from "./contained-image-authority.mjs";
import { AGGREGATE_TIMEOUT_QUALIFICATION_MODE } from "./contained-runtime-request.mjs";

const repositoryRoot = realpathSync(
  resolve(fileURLToPath(import.meta.url), "../.."),
);
const namespace = "counterlab-v6.1";
const containerNamePattern =
  /^counterlab-(?:[a-f0-9]{20}|(?:startup|runtime|reachability)-[A-Za-z0-9-]{1,80})$/;
const containerIdPattern = /^[a-f0-9]{64}$/;
const imagePattern = /^counterlab-(?:adapter|runner):git-[a-f0-9]{40}$/;
const invocationIdPattern = /^[a-f0-9]{64}$/;
const runtimePolicyPath = resolve(
  repositoryRoot,
  "services/runner/src/counterlab_runner/contained-runtime-policy.json",
);
const runtimePolicy = JSON.parse(readFileSync(runtimePolicyPath, "utf8"));
export const CONTAINED_RUNTIME_POLICY_SHA256 = sha256(
  readFileSync(runtimePolicyPath),
);
if (
  runtimePolicy === null ||
  typeof runtimePolicy !== "object" ||
  Array.isArray(runtimePolicy) ||
  JSON.stringify(Object.keys(runtimePolicy).sort()) !==
    JSON.stringify(
      [
        "callerGraceMs",
        "cleanupReserveMs",
        "executionControlOverheadMs",
        "schemaVersion",
        "shortCommandTimeoutMs",
      ].sort(),
    ) ||
  runtimePolicy.schemaVersion !== "1" ||
  [
    runtimePolicy.callerGraceMs,
    runtimePolicy.cleanupReserveMs,
    runtimePolicy.executionControlOverheadMs,
    runtimePolicy.shortCommandTimeoutMs,
  ].some((value) => !Number.isSafeInteger(value) || value < 1)
) {
  throw new Error("contained runtime deadline policy is invalid");
}
const shortCommandTimeoutMs = runtimePolicy.shortCommandTimeoutMs;
const executionControlOverheadMs = runtimePolicy.executionControlOverheadMs;
const cleanupReserveMs = runtimePolicy.cleanupReserveMs;
export const CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS =
  (executionControlOverheadMs + cleanupReserveMs) / 1_000;
export const CONTAINED_RUNTIME_CALLER_GRACE_SECONDS =
  runtimePolicy.callerGraceMs / 1_000;
if (
  executionControlOverheadMs + cleanupReserveMs !==
  CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS * 1_000
) {
  throw new Error("contained runtime deadline policy is inconsistent");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

const runControlReceiptV2Keys = [
  "candidateWallSeconds",
  "cleanupReserveMs",
  "commandSha256",
  "containerAbsent",
  "finalContainerId",
  "elapsedMs",
  "imageRootfsAbsent",
  "imageRootfsUnchanged",
  "invocationAliasAbsent",
  "invocationId",
  "persistedAuthorityVerified",
  "readOnlyMountsUnchanged",
  "receiptPayloadSha256",
  "resultReleased",
  "rootlessReceiptFileSha256",
  "rootlessReceiptPayloadSha256",
  "schemaVersion",
  "snapshotAbsent",
  "status",
  "taskAbsent",
  "timeoutObserved",
  "timeoutKind",
  "runtimePolicySha256",
];
const runControlReceiptV3Keys = [
  ...runControlReceiptV2Keys,
  "qualificationMode",
];

export function validateContainedRunControlReceipt(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !(
      (value.schemaVersion === "2" &&
        JSON.stringify(Object.keys(value).sort()) ===
          JSON.stringify([...runControlReceiptV2Keys].sort())) ||
      (value.schemaVersion === "3" &&
        JSON.stringify(Object.keys(value).sort()) ===
          JSON.stringify([...runControlReceiptV3Keys].sort()))
    )
  ) {
    throw new Error("contained runtime control receipt shape is invalid");
  }
  const { receiptPayloadSha256, ...payload } = value;
  const cleanupFields = [
    "containerAbsent",
    "imageRootfsAbsent",
    "imageRootfsUnchanged",
    "invocationAliasAbsent",
    "persistedAuthorityVerified",
    "readOnlyMountsUnchanged",
    "snapshotAbsent",
    "taskAbsent",
    "timeoutObserved",
  ];
  if (
    !["2", "3"].includes(value.schemaVersion) ||
    (value.schemaVersion === "3" &&
      value.qualificationMode !== AGGREGATE_TIMEOUT_QUALIFICATION_MODE) ||
    !["TIMED_OUT_CLEAN", "TIMED_OUT_UNCLEAN"].includes(value.status) ||
    !invocationIdPattern.test(value.invocationId ?? "") ||
    !containerIdPattern.test(value.finalContainerId ?? "") ||
    !Number.isSafeInteger(value.candidateWallSeconds) ||
    value.candidateWallSeconds < 1 ||
    value.candidateWallSeconds > 60 ||
    value.cleanupReserveMs !== cleanupReserveMs ||
    value.timeoutKind !== "WALL_CLOCK" ||
    value.runtimePolicySha256 !== CONTAINED_RUNTIME_POLICY_SHA256 ||
    !Number.isSafeInteger(value.elapsedMs) ||
    value.elapsedMs < 1 ||
    value.elapsedMs > 600_000 ||
    !/^[a-f0-9]{64}$/.test(value.commandSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(value.rootlessReceiptFileSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(value.rootlessReceiptPayloadSha256 ?? "") ||
    !/^[a-f0-9]{64}$/.test(receiptPayloadSha256 ?? "") ||
    cleanupFields.some((field) => typeof value[field] !== "boolean") ||
    typeof value.resultReleased !== "boolean" ||
    value.timeoutObserved !== true ||
    sha256(canonicalJson(payload)) !== receiptPayloadSha256
  ) {
    throw new Error("contained runtime control receipt binding is invalid");
  }
  const clean =
    cleanupFields.every((field) => value[field] === true) &&
    value.resultReleased === false;
  if (
    (value.status === "TIMED_OUT_CLEAN") !== clean ||
    (value.status === "TIMED_OUT_UNCLEAN") === clean
  ) {
    throw new Error("contained runtime control receipt status is invalid");
  }
  return value;
}

function createRunControlReceipt(payload) {
  return validateContainedRunControlReceipt({
    ...payload,
    receiptPayloadSha256: sha256(canonicalJson(payload)),
  });
}

function imageIndex(args) {
  const index = args.findIndex((argument) => imagePattern.test(argument));
  if (index === -1) throw new Error("contained runtime image is invalid");
  return index;
}

function optionValues(args, name) {
  const values = [];
  const end = imageIndex(args);
  for (let index = 1; index < end; index += 1) {
    const argument = args[index];
    if (argument === name) {
      values.push(args[index + 1]);
      index += 1;
    } else if (argument.startsWith(`${name}=`)) {
      values.push(argument.slice(name.length + 1));
    }
  }
  return { image: args[end], values };
}

function oneOption(args, name) {
  const { values } = optionValues(args, name);
  if (values.length !== 1 || typeof values[0] !== "string") {
    throw new Error(`contained runtime ${name} option is invalid`);
  }
  return values[0];
}

function resourceIntent(args) {
  const memory = oneOption(args, "--memory").match(/^(\d{2,4})m$/);
  const maxProcesses = Number.parseInt(oneOption(args, "--pids-limit"), 10);
  const cpuCount = Number.parseFloat(oneOption(args, "--cpus"));
  const { values: rawRlimits } = optionValues(args, "--ulimit");
  const typeNames = {
    as: "RLIMIT_AS",
    cpu: "RLIMIT_CPU",
    fsize: "RLIMIT_FSIZE",
    nofile: "RLIMIT_NOFILE",
    nproc: "RLIMIT_NPROC",
  };
  const rlimits = rawRlimits.map((value) => {
    const match = value.match(/^(as|cpu|fsize|nofile|nproc)=(\d+):(\d+)$/);
    if (
      match === null ||
      match[2] !== match[3] ||
      !Number.isSafeInteger(Number(match[2])) ||
      Number(match[2]) <= 0
    ) {
      throw new Error("contained runtime rlimit is invalid");
    }
    return {
      type: typeNames[match[1]],
      soft: Number(match[2]),
      hard: Number(match[3]),
    };
  });
  if (
    memory === null ||
    !Number.isSafeInteger(maxProcesses) ||
    maxProcesses < 1 ||
    maxProcesses > 32 ||
    !Number.isFinite(cpuCount) ||
    cpuCount < 0.25 ||
    cpuCount > 2 ||
    rlimits.length !== 5 ||
    new Set(rlimits.map((entry) => entry.type)).size !== 5
  ) {
    throw new Error("contained runtime resource intent is invalid");
  }
  const memoryBytes = Number.parseInt(memory[1], 10) * 1024 * 1024;
  const byType = new Map(rlimits.map((entry) => [entry.type, entry.soft]));
  if (
    memoryBytes < 64 * 1024 * 1024 ||
    memoryBytes > 1024 * 1024 * 1024 ||
    byType.get("RLIMIT_CPU") < 1 ||
    byType.get("RLIMIT_CPU") > 300 ||
    byType.get("RLIMIT_AS") !== memoryBytes ||
    byType.get("RLIMIT_FSIZE") > 1_048_576 ||
    byType.get("RLIMIT_NOFILE") !== 64 ||
    byType.get("RLIMIT_NPROC") !== maxProcesses
  ) {
    throw new Error("contained runtime rlimit intent is inconsistent");
  }
  return { cpuCount, maxProcesses, memoryBytes, rlimits };
}

function nerdctlCreateOptions(args, imageArgumentIndex) {
  // nerdctl 2.3.1 rejects Docker's `as` spelling. The sanitized OCI spec
  // injects the already-validated RLIMIT_AS before direct ctr execution.
  const options = [];
  let omittedAddressSpaceLimit = 0;
  for (let index = 1; index < imageArgumentIndex; index += 1) {
    const argument = args[index];
    if (argument === "--ulimit") {
      const value = args[index + 1];
      if (typeof value !== "string" || index + 1 >= imageArgumentIndex) {
        throw new Error("contained runtime ulimit option is invalid");
      }
      if (value.startsWith("as=")) {
        omittedAddressSpaceLimit += 1;
      } else {
        options.push(argument, value);
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("--ulimit=as=")) {
      omittedAddressSpaceLimit += 1;
      continue;
    }
    options.push(argument);
  }
  if (omittedAddressSpaceLimit !== 1) {
    throw new Error("contained runtime address-space limit is invalid");
  }
  return options;
}

function contained(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return (
    fromParent === "" ||
    (!fromParent.startsWith("..") && !isAbsolute(fromParent))
  );
}

function runContainerName(args) {
  const { values } = optionValues(args, "--name");
  if (
    values.length !== 1 ||
    typeof values[0] !== "string" ||
    !containerNamePattern.test(values[0])
  ) {
    throw new Error("contained runtime run name is invalid");
  }
  return values[0];
}

function adapterOutputDirectory(args, image) {
  if (!image.startsWith("counterlab-adapter:git-")) return undefined;
  const { values } = optionValues(args, "--mount");
  const outputs = values
    .map((value) => new Map(value.split(",").map((part) => part.split("=", 2))))
    .filter(
      (fields) =>
        (fields.get("dst") ?? fields.get("destination")) === "/output",
    );
  const requested = outputs[0]?.get("src") ?? outputs[0]?.get("source");
  if (
    outputs.length !== 1 ||
    typeof requested !== "string" ||
    !isAbsolute(requested) ||
    !contained(repositoryRoot, requested) ||
    realpathSync(requested) !== requested ||
    !statSync(requested).isDirectory()
  ) {
    throw new Error("contained runtime output mount is invalid");
  }
  return requested;
}

export function containedRunPlan({
  binRoot,
  containerdSocket,
  clientFifoRoot,
  installRoot,
  sessionRoot,
  args,
  invocationId,
}) {
  if (!Array.isArray(args) || args[0] !== "run") {
    throw new Error("contained runtime run plan requires a run command");
  }
  for (const [label, candidate] of [
    ["runtime binary root", binRoot],
    ["containerd socket", containerdSocket],
    ["client FIFO root", clientFifoRoot],
    ["runtime installation", installRoot],
    ["runtime session", sessionRoot],
  ]) {
    if (
      typeof candidate !== "string" ||
      !isAbsolute(candidate) ||
      !contained(repositoryRoot, candidate)
    ) {
      throw new Error(`${label} is not repository-contained`);
    }
  }
  if (!contained(sessionRoot, clientFifoRoot)) {
    throw new Error("client FIFO root escaped the runtime session");
  }
  if (!invocationIdPattern.test(invocationId ?? "")) {
    throw new Error("contained runtime invocation ID is invalid");
  }

  const containerName = runContainerName(args);
  const image = optionValues(args, "--memory").image;
  const commandImageIndex = imageIndex(args);
  const canonicalImage = `docker.io/library/${image}`;
  const imageAlias = `docker.io/library/counterlab-runtime-invocation:${invocationId}`;
  const invocationLabel = `io.counterlab.runtime.invocation=${invocationId}`;
  const expected = {
    ...resourceIntent(args),
    containerName,
    sessionRoot,
  };
  const createOptions = nerdctlCreateOptions(args, commandImageIndex);
  const ctrGlobalArgs = [
    "--address",
    containerdSocket,
    "--namespace",
    namespace,
  ];
  const nerdctlGlobalArgs = [
    "--address",
    containerdSocket,
    "--namespace",
    namespace,
    "--snapshotter",
    "native",
    "--data-root",
    resolve(sessionRoot, "data/nerdctl"),
    "--cgroup-manager",
    "cgroupfs",
    "--cni-path",
    resolve(installRoot, "libexec/cni"),
    "--cni-netconfpath",
    resolve(sessionRoot, "config/cni"),
    "--hosts-dir",
    resolve(sessionRoot, "config/certs.d"),
    "--experimental=false",
  ];
  const ctr = resolve(binRoot, "ctr");

  return {
    canonicalImage,
    containerName,
    expected,
    image,
    imageAlias,
    invocationId,
    invocationLabel,
    outputDirectory: adapterOutputDirectory(args, image),
    inspectImagePresence: {
      program: ctr,
      args: [...ctrGlobalArgs, "images", "inspect"],
    },
    inspectImageTarget: {
      program: resolve(binRoot, "nerdctl"),
      args: [...nerdctlGlobalArgs, "image", "inspect"],
    },
    inspectContent: {
      program: ctr,
      args: [...ctrGlobalArgs, "content", "get"],
    },
    tagImageAlias: {
      program: ctr,
      args: [...ctrGlobalArgs, "images", "tag"],
    },
    cleanupImageAlias: {
      program: ctr,
      args: [...ctrGlobalArgs, "images", "remove"],
    },
    mountImageRootfs: {
      program: ctr,
      args: [
        ...ctrGlobalArgs,
        "images",
        "mount",
        "--snapshotter",
        "native",
        "--platform",
        "linux/amd64",
        "--rw",
      ],
    },
    cleanupImageRootfs: {
      program: ctr,
      args: [
        ...ctrGlobalArgs,
        "images",
        "unmount",
        "--snapshotter",
        "native",
        "--rm",
      ],
    },
    create: {
      program: resolve(binRoot, "nerdctl"),
      args: [
        ...nerdctlGlobalArgs,
        "create",
        ...createOptions,
        "--label",
        invocationLabel,
        imageAlias,
        ...args.slice(commandImageIndex + 1),
      ],
    },
    inspectMetadata: {
      program: ctr,
      args: [...ctrGlobalArgs, "containers", "info"],
    },
    inspectSpec: {
      program: ctr,
      args: [...ctrGlobalArgs, "containers", "info", "--spec"],
    },
    inspectTasks: {
      program: ctr,
      args: [...ctrGlobalArgs, "tasks", "list", "--quiet"],
    },
    inspectContainer: {
      program: ctr,
      args: [...ctrGlobalArgs, "containers", "info"],
    },
    inspectSnapshot: {
      program: ctr,
      args: [...ctrGlobalArgs, "snapshots", "--snapshotter", "native", "info"],
    },
    inspectSnapshotDiff: {
      program: ctr,
      args: [...ctrGlobalArgs, "snapshots", "--snapshotter", "native", "diff"],
    },
    cleanupStaging: {
      program: resolve(binRoot, "nerdctl"),
      args: [...nerdctlGlobalArgs, "rm", "--force"],
    },
    cleanupTask: {
      program: ctr,
      args: [...ctrGlobalArgs, "tasks", "delete", "--force"],
    },
    cleanupContainer: {
      program: ctr,
      args: [...ctrGlobalArgs, "containers", "delete"],
    },
    cleanupSnapshot: {
      program: ctr,
      args: [
        ...ctrGlobalArgs,
        "snapshots",
        "--snapshotter",
        "native",
        "delete",
      ],
    },
    start: {
      program: ctr,
      args: [
        ...ctrGlobalArgs,
        "run",
        "--rm",
        "--fifo-dir",
        clientFifoRoot,
        "--snapshotter",
        "native",
        "--runtime",
        "io.containerd.runc.v2",
        "--runc-binary",
        resolve(repositoryRoot, "scripts/runtime-bin/runc"),
        "--runc-root",
        resolve(sessionRoot, "run/runc"),
        "--cgroup",
        `${namespace}/${invocationId}`,
        "--platform",
        "linux/amd64",
      ],
    },
  };
}

function resultError(result) {
  if (result.error instanceof Error) {
    return Buffer.from(`${result.error.message}\n`);
  }
  return Buffer.alloc(0);
}

function appendBuffers(...values) {
  return Buffer.concat(
    values.filter((value) => Buffer.isBuffer(value) && value.byteLength > 0),
  );
}

function commandOptions(context, timeout) {
  return {
    cwd: context.cwd,
    env: context.environment,
    encoding: null,
    stdio: ["pipe", "pipe", "pipe"],
    timeout,
    maxBuffer: 4 * 1024 * 1024,
  };
}

function spawnBeforeDeadline(spawn, deadlineMs, now) {
  return (program, args, options) => {
    const remainingMs = Math.floor(deadlineMs - now());
    if (remainingMs <= 0) {
      const error = new Error(
        "contained runtime deadline expired before spawn",
      );
      error.code = "ETIMEDOUT";
      return {
        status: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from(`${error.message}\n`),
        error,
      };
    }
    return spawn(program, args, {
      ...options,
      timeout: Math.min(options.timeout, remainingMs),
    });
  };
}

export function containedRuntimeResourceAbsent(result) {
  if (result.status === 0) return false;
  const diagnostic = appendBuffers(result.stderr, resultError(result))
    .toString("utf8")
    .toLowerCase();
  if (
    /(?:snapshotter|plugin|executable|binary|command)[^\n]*(?:not found|does not exist)/u.test(
      diagnostic,
    )
  ) {
    return false;
  }
  return /(?:not found|does not exist|no such container|no running task)/u.test(
    diagnostic,
  );
}

function inspectRuntimeState(plan, containerId, spawn, options) {
  const tasks = spawn(plan.inspectTasks.program, plan.inspectTasks.args, {
    ...options,
    input: Buffer.alloc(0),
  });
  const container = spawn(
    plan.inspectContainer.program,
    [...plan.inspectContainer.args, containerId],
    { ...options, input: Buffer.alloc(0) },
  );
  const snapshot = spawn(
    plan.inspectSnapshot.program,
    [...plan.inspectSnapshot.args, containerId],
    { ...options, input: Buffer.alloc(0) },
  );
  const taskIds = Buffer.from(tasks.stdout ?? "")
    .toString("utf8")
    .split(/\s+/u)
    .filter(Boolean);
  const validTaskList =
    tasks.status === 0 &&
    taskIds.every((value) => containerIdPattern.test(value));
  const validContainer =
    container.status === 0 || containedRuntimeResourceAbsent(container);
  const validSnapshot =
    snapshot.status === 0 || containedRuntimeResourceAbsent(snapshot);
  return {
    absent:
      validTaskList &&
      !taskIds.includes(containerId) &&
      validContainer &&
      container.status !== 0 &&
      validSnapshot &&
      snapshot.status !== 0,
    diagnostics: appendBuffers(
      validTaskList ? Buffer.alloc(0) : tasks.stderr,
      validTaskList ? Buffer.alloc(0) : resultError(tasks),
      validContainer ? Buffer.alloc(0) : container.stderr,
      validContainer ? Buffer.alloc(0) : resultError(container),
      validSnapshot ? Buffer.alloc(0) : snapshot.stderr,
      validSnapshot ? Buffer.alloc(0) : resultError(snapshot),
    ),
    container,
    containerPresent: container.status === 0,
    snapshotPresent: snapshot.status === 0,
    taskPresent: validTaskList && taskIds.includes(containerId),
    valid: validTaskList && validContainer && validSnapshot,
  };
}

function cleanupStaging(plan, containerId, spawn, options) {
  const owned = inspectRuntimeState(plan, containerId, spawn, options);
  try {
    if (!owned.valid || !owned.containerPresent) {
      return {
        ok: false,
        diagnostics: appendBuffers(
          Buffer.from("contained runtime staging ownership is ambiguous\n"),
          owned.diagnostics,
        ),
      };
    }
    validateContainedContainerInfo({
      containerId,
      image: plan.imageAlias,
      invocationId: plan.invocationId,
      source: Buffer.from(owned.container.stdout ?? "").toString("utf8"),
    });
  } catch (error) {
    return {
      ok: false,
      diagnostics: Buffer.from(
        `${error instanceof Error ? error.message : "contained runtime staging ownership changed"}\n`,
      ),
    };
  }
  const deletion = spawn(
    plan.cleanupStaging.program,
    [...plan.cleanupStaging.args, containerId],
    { ...options, input: Buffer.alloc(0) },
  );
  const state = inspectRuntimeState(plan, containerId, spawn, options);
  const deletionAccepted =
    deletion.status === 0 || containedRuntimeResourceAbsent(deletion);
  return {
    ok: deletionAccepted && state.valid && state.absent,
    diagnostics: appendBuffers(
      deletionAccepted ? Buffer.alloc(0) : deletion.stderr,
      deletionAccepted ? Buffer.alloc(0) : resultError(deletion),
      state.diagnostics,
    ),
  };
}

function cleanupFinal(plan, containerId, baseSpecSha256, spawn, options) {
  const owned = inspectRuntimeState(plan, containerId, spawn, options);
  if (owned.valid && owned.absent) {
    return { ok: true, diagnostics: Buffer.alloc(0), state: owned };
  }
  if (owned.valid && owned.snapshotPresent) {
    return {
      ok: false,
      diagnostics: Buffer.from(
        "contained runtime final identity has an unowned snapshot\n",
      ),
      state: owned,
    };
  }
  if (!owned.valid || !owned.containerPresent) {
    return {
      ok: false,
      diagnostics: appendBuffers(
        Buffer.from("contained runtime final ownership is ambiguous\n"),
        owned.diagnostics,
      ),
      state: owned,
    };
  }
  try {
    validateContainedConfigContainerInfo({
      baseSpecSha256,
      containerId,
      invocationId: plan.invocationId,
      source: Buffer.from(owned.container.stdout ?? "").toString("utf8"),
    });
  } catch (error) {
    return {
      ok: false,
      diagnostics: Buffer.from(
        `${error instanceof Error ? error.message : "contained runtime final ownership changed"}\n`,
      ),
      state: owned,
    };
  }
  const deletions = [];
  if (owned.taskPresent) {
    deletions.push(
      spawn(plan.cleanupTask.program, [...plan.cleanupTask.args, containerId], {
        ...options,
        input: Buffer.alloc(0),
      }),
    );
  }
  deletions.push(
    spawn(
      plan.cleanupContainer.program,
      [...plan.cleanupContainer.args, containerId],
      { ...options, input: Buffer.alloc(0) },
    ),
  );
  const deletionFailures = deletions.filter(
    (result) => result.status !== 0 && !containedRuntimeResourceAbsent(result),
  );
  const state = inspectRuntimeState(plan, containerId, spawn, options);
  return {
    ok: deletionFailures.length === 0 && state.valid && state.absent,
    diagnostics: appendBuffers(
      ...deletionFailures.flatMap((result) => [
        result.stderr,
        resultError(result),
      ]),
      state.diagnostics,
    ),
    state,
  };
}

function validateMountedImageRootfs(
  source,
  imageRootfsPath,
  expectedParentChainId,
) {
  const lines = Buffer.from(source ?? "")
    .toString("utf8")
    .trimEnd()
    .split("\n");
  if (
    lines.length !== 2 ||
    lines[0] !== expectedParentChainId ||
    lines[1] !== imageRootfsPath
  ) {
    throw new Error("contained runtime image rootfs mount result is invalid");
  }
  return lines[0];
}

export function validateContainedImageRootfsSnapshot(
  source,
  imageRootfsPath,
  expectedParentChainId,
) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(source ?? "").toString("utf8"));
  } catch (error) {
    throw new Error("contained runtime image rootfs snapshot is invalid", {
      cause: error,
    });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("contained runtime image rootfs snapshot is invalid");
  }
  const name = parsed.Name ?? parsed.name;
  const parent = parsed.Parent ?? parsed.parent;
  const kind = parsed.Kind ?? parsed.kind;
  if (
    name !== imageRootfsPath ||
    parent !== expectedParentChainId ||
    !["Active", "active", 2].includes(kind)
  ) {
    throw new Error(
      "contained runtime image rootfs snapshot ownership changed",
    );
  }
  return parsed;
}

function snapshotDiffSha256(result) {
  if (
    result.status !== 0 ||
    !Buffer.isBuffer(result.stdout) ||
    result.stdout.byteLength === 0 ||
    result.stdout.byteLength > 4 * 1024 * 1024
  ) {
    throw new Error("contained runtime image rootfs diff failed");
  }
  return sha256(result.stdout);
}

function cleanupImageRootfs(
  plan,
  imageRootfsPath,
  expectedParentChainId,
  spawn,
  options,
) {
  if (
    typeof imageRootfsPath !== "string" ||
    !isAbsolute(imageRootfsPath) ||
    !contained(plan.expected.sessionRoot, imageRootfsPath)
  ) {
    return {
      ok: false,
      absent: false,
      diagnostics: Buffer.from(
        "contained runtime image rootfs cleanup path is invalid\n",
      ),
    };
  }
  const before = spawn(
    plan.inspectSnapshot.program,
    [...plan.inspectSnapshot.args, imageRootfsPath],
    { ...options, input: Buffer.alloc(0) },
  );
  if (before.status !== 0) {
    const absent = containedRuntimeResourceAbsent(before);
    return {
      ok: absent,
      absent,
      diagnostics: absent
        ? Buffer.alloc(0)
        : appendBuffers(before.stderr, resultError(before)),
    };
  }
  try {
    validateContainedImageRootfsSnapshot(
      before.stdout,
      imageRootfsPath,
      expectedParentChainId,
    );
  } catch (error) {
    return {
      ok: false,
      absent: false,
      diagnostics: Buffer.from(
        `${error instanceof Error ? error.message : "contained runtime image rootfs ownership changed"}\n`,
      ),
    };
  }
  const unmounted = spawn(
    plan.cleanupImageRootfs.program,
    [...plan.cleanupImageRootfs.args, imageRootfsPath],
    { ...options, input: Buffer.alloc(0) },
  );
  const after = spawn(
    plan.inspectSnapshot.program,
    [...plan.inspectSnapshot.args, imageRootfsPath],
    { ...options, input: Buffer.alloc(0) },
  );
  const absent = after.status !== 0 && containedRuntimeResourceAbsent(after);
  const unmountAccepted = unmounted.status === 0;
  return {
    ok: unmountAccepted && absent,
    absent,
    diagnostics: appendBuffers(
      unmountAccepted ? Buffer.alloc(0) : unmounted.stderr,
      unmountAccepted ? Buffer.alloc(0) : resultError(unmounted),
      absent ? Buffer.alloc(0) : after.stderr,
      absent ? Buffer.alloc(0) : resultError(after),
    ),
  };
}

function cleanupImageAlias(plan, expectedTarget, spawn, options) {
  try {
    const inspection = spawn(
      plan.inspectImageTarget.program,
      [...plan.inspectImageTarget.args, plan.imageAlias],
      { ...options, input: Buffer.alloc(0) },
    );
    if (inspection.status !== 0) {
      return {
        ok: containedRuntimeResourceAbsent(inspection),
        absent: containedRuntimeResourceAbsent(inspection),
        diagnostics: containedRuntimeResourceAbsent(inspection)
          ? Buffer.alloc(0)
          : appendBuffers(inspection.stderr, resultError(inspection)),
      };
    }
    validateContainedImageAliasTarget({
      alias: plan.imageAlias,
      expectedTarget,
      source: Buffer.from(inspection.stdout ?? "").toString("utf8"),
    });
    const deletion = spawn(
      plan.cleanupImageAlias.program,
      [...plan.cleanupImageAlias.args, plan.imageAlias],
      { ...options, input: Buffer.alloc(0) },
    );
    const postflight = spawn(
      plan.inspectImagePresence.program,
      [...plan.inspectImagePresence.args, plan.imageAlias],
      { ...options, input: Buffer.alloc(0) },
    );
    const absent =
      postflight.status !== 0 && containedRuntimeResourceAbsent(postflight);
    return {
      ok: deletion.status === 0 && absent,
      absent,
      diagnostics: appendBuffers(
        deletion.status === 0 ? Buffer.alloc(0) : deletion.stderr,
        deletion.status === 0 ? Buffer.alloc(0) : resultError(deletion),
        absent ? Buffer.alloc(0) : postflight.stderr,
        absent ? Buffer.alloc(0) : resultError(postflight),
      ),
    };
  } catch (error) {
    return {
      ok: false,
      absent: false,
      diagnostics: Buffer.from(
        `${error instanceof Error ? error.message : "contained runtime image alias cleanup failed"}\n`,
      ),
    };
  }
}

function failedResult(message, ...diagnostics) {
  return {
    status: 1,
    stdout: Buffer.alloc(0),
    stderr: appendBuffers(Buffer.from(`${message}\n`), ...diagnostics),
  };
}

function resultWasReleased(plan, started) {
  if (
    plan.outputDirectory === undefined ||
    !existsSync(plan.outputDirectory) ||
    !statSync(plan.outputDirectory).isDirectory()
  ) {
    return true;
  }
  const nonResultFiles = new Set([
    "public-tests.stderr",
    "public-tests.stdout",
  ]);
  const entries = readdirSync(plan.outputDirectory, { withFileTypes: true });
  const expectedEmptyFiles = ["public-tests.stderr", "public-tests.stdout"];
  return (
    Buffer.from(started.stdout ?? "").byteLength > 0 ||
    Buffer.from(started.stderr ?? "").byteLength > 0 ||
    entries.some(
      (entry) => !entry.isFile() || !nonResultFiles.has(entry.name),
    ) ||
    expectedEmptyFiles.some((name) => {
      const path = resolve(plan.outputDirectory, name);
      return (
        !existsSync(path) ||
        !statSync(path).isFile() ||
        statSync(path).size !== 0
      );
    })
  );
}

export async function executeContainedRun(
  context,
  spawn = spawnSync,
  persistSpec = persistContainedRootlessSpec,
  verifySpec = verifyPersistedContainedRootlessSpec,
  createInvocationId = () => randomBytes(32).toString("hex"),
  now = () => performance.now(),
  qualificationCoordinator = containedCgroupQualificationCoordinator,
) {
  if (
    context.qualificationMode !== null &&
    context.qualificationMode !== AGGREGATE_TIMEOUT_QUALIFICATION_MODE
  ) {
    return failedResult("contained runtime qualification mode is invalid");
  }
  const qualificationRequested =
    context.qualificationMode === AGGREGATE_TIMEOUT_QUALIFICATION_MODE;
  const startedAtMs = now();
  const invocationId = createInvocationId();
  if (!invocationIdPattern.test(invocationId)) {
    return failedResult("contained runtime invocation ID generation failed");
  }
  const plan = containedRunPlan({ ...context, invocationId });
  const cpuLimit = plan.expected.rlimits.find(
    (entry) => entry.type === "RLIMIT_CPU",
  )?.soft;
  const runtimeTimeout = cpuLimit * 1_000;
  const executionDeadlineMs =
    startedAtMs + runtimeTimeout + executionControlOverheadMs;
  const cleanupDeadlineMs = executionDeadlineMs + cleanupReserveMs;
  const executeSpawn = spawnBeforeDeadline(spawn, executionDeadlineMs, now);
  const cleanupSpawn = spawnBeforeDeadline(spawn, cleanupDeadlineMs, now);
  const shortOptions = commandOptions(context, shortCommandTimeoutMs);
  const controlOptions = commandOptions(context, executionControlOverheadMs);
  const cleanupOptions = commandOptions(context, cleanupReserveMs);
  const runtimeOptions = commandOptions(context, runtimeTimeout);

  let imageAuthority;
  let aliasCreated = false;
  let imageRootfsOwned = false;
  let imageRootfsPath = "";
  let imageRootfsBaselineSha256 = "";
  let lastAliasCleanup = { ok: false, absent: false };
  let lastRootfsCleanup = { ok: false, absent: false };
  const finish = (result) => {
    let finished = result;
    if (imageRootfsOwned) {
      const rootfsCleanup = cleanupImageRootfs(
        plan,
        imageRootfsPath,
        imageAuthority.rootfsChainId,
        cleanupSpawn,
        cleanupOptions,
      );
      lastRootfsCleanup = rootfsCleanup;
      if (rootfsCleanup.ok) imageRootfsOwned = false;
      if (!rootfsCleanup.ok) {
        finished = {
          status: 1,
          stdout: Buffer.from(finished.stdout ?? ""),
          stderr: appendBuffers(
            finished.stderr,
            Buffer.from("contained runtime image rootfs cleanup failed\n"),
            rootfsCleanup.diagnostics,
          ),
        };
      }
    }
    if (!aliasCreated) return finished;
    const aliasCleanup = cleanupImageAlias(
      plan,
      imageAuthority,
      cleanupSpawn,
      shortOptions,
    );
    lastAliasCleanup = aliasCleanup;
    aliasCreated = false;
    if (aliasCleanup.ok) return finished;
    return {
      status: 1,
      stdout: Buffer.from(finished.stdout ?? ""),
      stderr: appendBuffers(
        finished.stderr,
        Buffer.from("contained runtime image alias cleanup failed\n"),
        aliasCleanup.diagnostics,
      ),
    };
  };
  try {
    const targetInspection = executeSpawn(
      plan.inspectImageTarget.program,
      [...plan.inspectImageTarget.args, plan.canonicalImage],
      { ...shortOptions, input: Buffer.alloc(0) },
    );
    if (targetInspection.status !== 0) {
      throw new Error("contained runtime image target inspection failed");
    }
    const target = parseContainedImageTarget({
      image: plan.image,
      source: Buffer.from(targetInspection.stdout ?? "").toString("utf8"),
    });
    const targetContent = executeSpawn(
      plan.inspectContent.program,
      [...plan.inspectContent.args, target.targetDigest],
      { ...shortOptions, input: Buffer.alloc(0) },
    );
    if (targetContent.status !== 0) {
      throw new Error("contained runtime image target content failed");
    }
    const targetSource = Buffer.from(targetContent.stdout ?? "").toString(
      "utf8",
    );
    const selected = selectContainedImageManifest({
      source: targetSource,
      target,
    });
    let manifestSource = targetSource;
    if (selected.manifestDigest !== target.targetDigest) {
      const manifestContent = executeSpawn(
        plan.inspectContent.program,
        [...plan.inspectContent.args, selected.manifestDigest],
        { ...shortOptions, input: Buffer.alloc(0) },
      );
      if (manifestContent.status !== 0) {
        throw new Error("contained runtime image manifest content failed");
      }
      manifestSource = Buffer.from(manifestContent.stdout ?? "").toString(
        "utf8",
      );
    }
    const { configDigest } = parseContainedImageManifest({
      manifestDigest: selected.manifestDigest,
      source: manifestSource,
    });
    const configContent = executeSpawn(
      plan.inspectContent.program,
      [...plan.inspectContent.args, configDigest],
      { ...shortOptions, input: Buffer.alloc(0) },
    );
    if (configContent.status !== 0) {
      throw new Error("contained runtime image config content failed");
    }
    imageAuthority = createContainedImageAuthority({
      args: context.args,
      configSource: Buffer.from(configContent.stdout ?? "").toString("utf8"),
      manifestDigest: selected.manifestDigest,
      manifestSource,
      target,
    });

    const aliasPreflight = executeSpawn(
      plan.inspectImagePresence.program,
      [...plan.inspectImagePresence.args, plan.imageAlias],
      { ...shortOptions, input: Buffer.alloc(0) },
    );
    if (
      aliasPreflight.status === 0 ||
      !containedRuntimeResourceAbsent(aliasPreflight)
    ) {
      throw new Error("contained runtime image alias is not clean");
    }
    const tagged = executeSpawn(
      plan.tagImageAlias.program,
      [...plan.tagImageAlias.args, plan.canonicalImage, plan.imageAlias],
      { ...shortOptions, input: Buffer.alloc(0) },
    );
    if (tagged.status !== 0) {
      throw new Error("contained runtime image alias creation failed");
    }
    aliasCreated = true;
    const aliasInspection = executeSpawn(
      plan.inspectImageTarget.program,
      [...plan.inspectImageTarget.args, plan.imageAlias],
      { ...shortOptions, input: Buffer.alloc(0) },
    );
    if (aliasInspection.status !== 0) {
      throw new Error("contained runtime image alias inspection failed");
    }
    validateContainedImageAliasTarget({
      alias: plan.imageAlias,
      expectedTarget: target,
      source: Buffer.from(aliasInspection.stdout ?? "").toString("utf8"),
    });
  } catch (error) {
    return finish(
      failedResult(
        error instanceof Error
          ? error.message
          : "contained runtime image authority failed",
      ),
    );
  }

  const created = executeSpawn(plan.create.program, plan.create.args, {
    ...runtimeOptions,
    input: Buffer.alloc(0),
  });
  if (created.status !== 0) {
    return finish(
      failedResult(
        "contained runtime create failed",
        created.stderr,
        resultError(created),
      ),
    );
  }

  const stagingContainerId = Buffer.from(created.stdout ?? "")
    .toString("utf8")
    .trim();
  if (!containerIdPattern.test(stagingContainerId)) {
    return finish(
      failedResult("contained runtime create returned an invalid ID"),
    );
  }

  const metadata = executeSpawn(
    plan.inspectMetadata.program,
    [...plan.inspectMetadata.args, stagingContainerId],
    { ...shortOptions, input: Buffer.alloc(0) },
  );
  const inspected = executeSpawn(
    plan.inspectSpec.program,
    [...plan.inspectSpec.args, stagingContainerId],
    { ...shortOptions, input: Buffer.alloc(0) },
  );

  let prepared;
  let persisted;
  let stagingOwned = false;
  try {
    if (metadata.status !== 0 || inspected.status !== 0) {
      throw new Error("contained runtime staging inspection failed");
    }
    validateContainedContainerInfo({
      containerId: stagingContainerId,
      image: plan.imageAlias,
      invocationId,
      source: Buffer.from(metadata.stdout ?? "").toString("utf8"),
    });
    stagingOwned = true;
    prepared = sanitizeContainedRootlessSpec({
      containerId: stagingContainerId,
      expected: {
        ...plan.expected,
        containerName: plan.containerName,
        imageAuthority,
        invocationId,
        sessionRoot: context.sessionRoot,
      },
      metadataSha256: sha256(
        Buffer.from(metadata.stdout ?? "").toString("utf8"),
      ),
      source: Buffer.from(inspected.stdout ?? "").toString("utf8"),
    });
    persisted = persistSpec({
      config: prepared.config,
      finalContainerId: prepared.finalContainerId,
      internalMounts: prepared.internalMounts,
      receipt: prepared.receipt,
      sessionRoot: context.sessionRoot,
    });
  } catch (error) {
    const cleaned = stagingOwned
      ? cleanupStaging(plan, stagingContainerId, cleanupSpawn, shortOptions)
      : { ok: false, diagnostics: Buffer.alloc(0) };
    return finish(
      failedResult(
        error instanceof Error
          ? error.message
          : "contained rootless OCI spec validation failed",
        metadata.status === 0 ? Buffer.alloc(0) : metadata.stderr,
        inspected.status === 0 ? Buffer.alloc(0) : inspected.stderr,
        !stagingOwned || cleaned.ok
          ? Buffer.alloc(0)
          : Buffer.from("contained runtime staging cleanup failed\n"),
        cleaned.diagnostics,
      ),
    );
  }

  const stagingCleanup = cleanupStaging(
    plan,
    stagingContainerId,
    cleanupSpawn,
    shortOptions,
  );
  if (!stagingCleanup.ok) {
    return finish(
      failedResult(
        "contained runtime staging cleanup failed",
        stagingCleanup.diagnostics,
      ),
    );
  }

  const preflight = inspectRuntimeState(
    plan,
    prepared.finalContainerId,
    executeSpawn,
    shortOptions,
  );
  if (!preflight.valid || !preflight.absent) {
    return finish(
      failedResult(
        "contained runtime final identity is not clean",
        preflight.diagnostics,
      ),
    );
  }

  try {
    verifySpec({
      configFileSha256: persisted.configFileSha256,
      configPath: persisted.configPath,
      finalContainerId: prepared.finalContainerId,
      imageRootfsPath: persisted.imageRootfsPath,
      receiptFileSha256: persisted.receiptFileSha256,
      receiptPath: persisted.receiptPath,
      sessionRoot: context.sessionRoot,
    });
  } catch (error) {
    return finish(
      failedResult(
        error instanceof Error
          ? error.message
          : "contained rootless OCI persisted config verification failed",
      ),
    );
  }

  imageRootfsPath = persisted.imageRootfsPath;
  const imageRootfsPreflight = executeSpawn(
    plan.inspectSnapshot.program,
    [...plan.inspectSnapshot.args, imageRootfsPath],
    { ...shortOptions, input: Buffer.alloc(0) },
  );
  if (
    imageRootfsPreflight.status === 0 ||
    !containedRuntimeResourceAbsent(imageRootfsPreflight)
  ) {
    return finish(
      failedResult(
        "contained runtime image rootfs identity is not clean",
        imageRootfsPreflight.stderr,
        resultError(imageRootfsPreflight),
      ),
    );
  }
  imageRootfsOwned = true;
  const mountedImageRootfs = executeSpawn(
    plan.mountImageRootfs.program,
    [...plan.mountImageRootfs.args, plan.imageAlias, imageRootfsPath],
    { ...controlOptions, input: Buffer.alloc(0) },
  );
  try {
    if (mountedImageRootfs.status !== 0) {
      throw new Error("contained runtime image rootfs mount failed");
    }
    validateMountedImageRootfs(
      mountedImageRootfs.stdout,
      imageRootfsPath,
      imageAuthority.rootfsChainId,
    );
    const mountedSnapshot = executeSpawn(
      plan.inspectSnapshot.program,
      [...plan.inspectSnapshot.args, imageRootfsPath],
      { ...shortOptions, input: Buffer.alloc(0) },
    );
    if (mountedSnapshot.status !== 0) {
      throw new Error("contained runtime image rootfs snapshot is unavailable");
    }
    validateContainedImageRootfsSnapshot(
      mountedSnapshot.stdout,
      imageRootfsPath,
      imageAuthority.rootfsChainId,
    );
    imageRootfsBaselineSha256 = snapshotDiffSha256(
      executeSpawn(
        plan.inspectSnapshotDiff.program,
        [...plan.inspectSnapshotDiff.args, imageRootfsPath],
        { ...controlOptions, input: Buffer.alloc(0) },
      ),
    );
  } catch (error) {
    return finish(
      failedResult(
        error instanceof Error
          ? error.message
          : "contained runtime image rootfs authority failed",
        mountedImageRootfs.stderr,
        resultError(mountedImageRootfs),
      ),
    );
  }

  const aliasReinspection = executeSpawn(
    plan.inspectImageTarget.program,
    [...plan.inspectImageTarget.args, plan.imageAlias],
    { ...shortOptions, input: Buffer.alloc(0) },
  );
  try {
    if (aliasReinspection.status !== 0) {
      throw new Error("contained runtime image alias disappeared");
    }
    validateContainedImageAliasTarget({
      alias: plan.imageAlias,
      expectedTarget: imageAuthority,
      source: Buffer.from(aliasReinspection.stdout ?? "").toString("utf8"),
    });
    const readOnlyMountManifest = verifyContainedReadOnlyMounts(
      imageAuthority.requestedMounts,
    );
    if (
      sha256(JSON.stringify(readOnlyMountManifest)) !==
      sha256(JSON.stringify(imageAuthority.readOnlyMountManifest))
    ) {
      throw new Error("contained runtime read-only mount authority changed");
    }
  } catch (error) {
    return finish(
      failedResult(
        error instanceof Error
          ? error.message
          : "contained runtime image alias changed",
      ),
    );
  }

  let qualificationHandle;
  if (qualificationRequested) {
    try {
      qualificationHandle = await qualificationCoordinator.begin({
        baseReceiptFileSha256: persisted.receiptFileSha256,
        baseReceiptPath: persisted.receiptPath,
        baseReceiptPayloadSha256: prepared.receipt.receiptPayloadSha256,
        finalContainerId: prepared.finalContainerId,
        intendedAggregateLimits: prepared.receipt.intendedAggregateLimits,
        invocationId,
        sanitizedSpecSha256: prepared.receipt.sanitizedSpecSha256,
        sessionRoot: context.sessionRoot,
      });
    } catch {
      return finish(
        failedResult("contained runtime qualification readiness failed"),
      );
    }
  }

  const candidateStartedAt = now();
  const started = executeSpawn(
    plan.start.program,
    [
      ...plan.start.args,
      "--label",
      plan.invocationLabel,
      "--label",
      `io.counterlab.runtime.base-spec-sha256=${prepared.receipt.baseSpecSha256}`,
      "--config",
      persisted.configPath,
      prepared.finalContainerId,
    ],
    { ...runtimeOptions, input: context.stdin },
  );
  const timeoutObserved = started.error?.code === "ETIMEDOUT";
  let qualificationDraftFailed = false;
  if (qualificationRequested) {
    try {
      await qualificationCoordinator.waitForDraft(qualificationHandle);
    } catch {
      qualificationDraftFailed = true;
    }
  }
  let imageRootfsUnchanged = true;
  try {
    const afterSha256 = snapshotDiffSha256(
      executeSpawn(
        plan.inspectSnapshotDiff.program,
        [...plan.inspectSnapshotDiff.args, imageRootfsPath],
        { ...controlOptions, input: Buffer.alloc(0) },
      ),
    );
    if (afterSha256 !== imageRootfsBaselineSha256) {
      throw new Error(
        "contained runtime image rootfs changed during execution",
      );
    }
  } catch {
    imageRootfsUnchanged = false;
  }
  let readOnlyMountsAfterRun = true;
  try {
    const readOnlyMountManifest = verifyContainedReadOnlyMounts(
      imageAuthority.requestedMounts,
    );
    if (
      sha256(JSON.stringify(readOnlyMountManifest)) !==
      sha256(JSON.stringify(imageAuthority.readOnlyMountManifest))
    ) {
      throw new Error("contained runtime read-only mount authority changed");
    }
  } catch {
    readOnlyMountsAfterRun = false;
  }
  let aliasAfterRun = true;
  const aliasPostflight = executeSpawn(
    plan.inspectImageTarget.program,
    [...plan.inspectImageTarget.args, plan.imageAlias],
    { ...shortOptions, input: Buffer.alloc(0) },
  );
  try {
    if (aliasPostflight.status !== 0) {
      throw new Error(
        "contained runtime image alias disappeared after execution",
      );
    }
    validateContainedImageAliasTarget({
      alias: plan.imageAlias,
      expectedTarget: imageAuthority,
      source: Buffer.from(aliasPostflight.stdout ?? "").toString("utf8"),
    });
  } catch {
    aliasAfterRun = false;
  }
  const cleaned = cleanupFinal(
    plan,
    prepared.finalContainerId,
    prepared.receipt.baseSpecSha256,
    cleanupSpawn,
    shortOptions,
  );
  const rootfsCleaned = cleanupImageRootfs(
    plan,
    imageRootfsPath,
    imageAuthority.rootfsChainId,
    cleanupSpawn,
    cleanupOptions,
  );
  lastRootfsCleanup = rootfsCleaned;
  if (rootfsCleaned.ok) imageRootfsOwned = false;
  let persistedAfterRun = true;
  try {
    verifySpec({
      configFileSha256: persisted.configFileSha256,
      configPath: persisted.configPath,
      finalContainerId: prepared.finalContainerId,
      imageRootfsPath: persisted.imageRootfsPath,
      receiptFileSha256: persisted.receiptFileSha256,
      receiptPath: persisted.receiptPath,
      sessionRoot: context.sessionRoot,
    });
  } catch {
    persistedAfterRun = false;
  }
  const finished = finish({
    status:
      cleaned.ok &&
      rootfsCleaned.ok &&
      persistedAfterRun &&
      aliasAfterRun &&
      readOnlyMountsAfterRun &&
      imageRootfsUnchanged
        ? (started.status ?? 1)
        : 1,
    stdout: Buffer.from(started.stdout ?? ""),
    stderr: appendBuffers(
      created.stderr,
      started.stderr,
      resultError(started),
      persistedAfterRun
        ? Buffer.alloc(0)
        : Buffer.from("contained runtime persisted authority changed\n"),
      aliasAfterRun
        ? Buffer.alloc(0)
        : Buffer.from(
            "contained runtime image alias changed after execution\n",
          ),
      readOnlyMountsAfterRun
        ? Buffer.alloc(0)
        : Buffer.from(
            "contained runtime read-only mount authority changed after execution\n",
          ),
      imageRootfsUnchanged
        ? Buffer.alloc(0)
        : Buffer.from(
            "contained runtime image rootfs changed during execution\n",
          ),
      cleaned.ok
        ? Buffer.alloc(0)
        : Buffer.from("contained runtime cleanup failed\n"),
      cleaned.diagnostics,
      rootfsCleaned.ok
        ? Buffer.alloc(0)
        : Buffer.from("contained runtime image rootfs cleanup failed\n"),
      rootfsCleaned.diagnostics,
    ),
  });
  if (qualificationRequested) {
    let resultReleased = true;
    try {
      resultReleased = resultWasReleased(plan, started);
    } catch {
      resultReleased = true;
    }
    const taskAbsent = cleaned.state.valid && !cleaned.state.taskPresent;
    const containerAbsent =
      cleaned.state.valid && !cleaned.state.containerPresent;
    const snapshotAbsent =
      cleaned.state.valid && !cleaned.state.snapshotPresent;
    let qualified;
    try {
      qualified = await qualificationCoordinator.complete(qualificationHandle, {
        cleanup: {
          taskAbsent,
          containerAbsent,
          snapshotAbsent,
          invocationAliasAbsent: lastAliasCleanup.absent === true,
          imageRootfsAbsent: lastRootfsCleanup.absent === true,
          persistedAuthorityVerified: persistedAfterRun,
          readOnlyMountsUnchanged: readOnlyMountsAfterRun,
          imageRootfsUnchanged,
        },
        resultReleased,
        runtimeFailed: qualificationDraftFailed,
        timeoutObserved,
      });
    } catch {
      return failedResult("contained runtime aggregate qualification failed");
    }
    const controlPayload = {
      schemaVersion: "3",
      qualificationMode: AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
      status: "TIMED_OUT_CLEAN",
      timeoutKind: "WALL_CLOCK",
      runtimePolicySha256: CONTAINED_RUNTIME_POLICY_SHA256,
      invocationId,
      finalContainerId: prepared.finalContainerId,
      commandSha256: imageAuthority.commandSha256,
      rootlessReceiptFileSha256: qualified.qualifiedReceiptFileSha256,
      rootlessReceiptPayloadSha256: qualified.qualifiedReceiptPayloadSha256,
      timeoutObserved: true,
      candidateWallSeconds: cpuLimit,
      elapsedMs: Math.max(1, Math.floor(now() - candidateStartedAt)),
      cleanupReserveMs,
      taskAbsent,
      containerAbsent,
      snapshotAbsent,
      invocationAliasAbsent: lastAliasCleanup.absent === true,
      imageRootfsAbsent: lastRootfsCleanup.absent === true,
      persistedAuthorityVerified: persistedAfterRun,
      readOnlyMountsUnchanged: readOnlyMountsAfterRun,
      imageRootfsUnchanged,
      resultReleased,
    };
    return {
      ...finished,
      controlReceipt: createRunControlReceipt(controlPayload),
    };
  }
  if (!timeoutObserved || plan.outputDirectory === undefined) return finished;

  let resultReleased = true;
  try {
    resultReleased = resultWasReleased(plan, started);
  } catch {
    resultReleased = true;
  }
  const taskAbsent = cleaned.state.valid && !cleaned.state.taskPresent;
  const containerAbsent =
    cleaned.state.valid && !cleaned.state.containerPresent;
  const snapshotAbsent = cleaned.state.valid && !cleaned.state.snapshotPresent;
  const controlPayload = {
    schemaVersion: "2",
    status: "TIMED_OUT_UNCLEAN",
    timeoutKind: "WALL_CLOCK",
    runtimePolicySha256: CONTAINED_RUNTIME_POLICY_SHA256,
    invocationId,
    finalContainerId: prepared.finalContainerId,
    commandSha256: imageAuthority.commandSha256,
    rootlessReceiptFileSha256: persisted.receiptFileSha256,
    rootlessReceiptPayloadSha256: prepared.receipt.receiptPayloadSha256,
    timeoutObserved: true,
    candidateWallSeconds: cpuLimit,
    elapsedMs: Math.max(1, Math.floor(now() - candidateStartedAt)),
    cleanupReserveMs,
    taskAbsent,
    containerAbsent,
    snapshotAbsent,
    invocationAliasAbsent: lastAliasCleanup.absent === true,
    imageRootfsAbsent: lastRootfsCleanup.absent === true,
    persistedAuthorityVerified: persistedAfterRun,
    readOnlyMountsUnchanged: readOnlyMountsAfterRun,
    imageRootfsUnchanged,
    resultReleased,
  };
  const cleanupVerified =
    taskAbsent &&
    containerAbsent &&
    snapshotAbsent &&
    controlPayload.invocationAliasAbsent &&
    controlPayload.imageRootfsAbsent &&
    persistedAfterRun &&
    readOnlyMountsAfterRun &&
    imageRootfsUnchanged &&
    !resultReleased;
  controlPayload.status = cleanupVerified
    ? "TIMED_OUT_CLEAN"
    : "TIMED_OUT_UNCLEAN";
  return {
    ...finished,
    controlReceipt: createRunControlReceipt(controlPayload),
  };
}
