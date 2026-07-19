#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

const namespace = "counterlab-v6.1";
const containerNamePattern =
  /^counterlab-(?:[a-f0-9]{20}|(?:startup|runtime|reachability)-[A-Za-z0-9-]{1,80})$/;
const containerIdPattern = /^[a-f0-9]{64}$/;

function contained(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return (
    fromParent === "" ||
    (!fromParent.startsWith("..") && !isAbsolute(fromParent))
  );
}

function runContainerName(args) {
  const names = [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--name") {
      names.push(args[index + 1]);
      index += 1;
    } else if (argument.startsWith("--name=")) {
      names.push(argument.slice("--name=".length));
    }
  }
  if (
    names.length !== 1 ||
    typeof names[0] !== "string" ||
    !containerNamePattern.test(names[0])
  ) {
    throw new Error("contained runtime run name is invalid");
  }
  return names[0];
}

export function containedRunPlan({
  binRoot,
  containerdSocket,
  clientFifoRoot,
  installRoot,
  sessionRoot,
  args,
}) {
  if (!Array.isArray(args) || args[0] !== "run") {
    throw new Error("contained runtime run plan requires a run command");
  }
  for (const [label, candidate] of [
    ["runtime binary root", binRoot],
    ["containerd socket", containerdSocket],
    ["client FIFO root", clientFifoRoot],
    ["runtime installation", installRoot],
  ]) {
    if (typeof candidate !== "string" || !isAbsolute(candidate)) {
      throw new Error(`${label} is not absolute`);
    }
  }
  if (
    typeof sessionRoot !== "string" ||
    !isAbsolute(sessionRoot) ||
    !contained(sessionRoot, clientFifoRoot)
  ) {
    throw new Error("client FIFO root escaped the runtime session");
  }

  const name = runContainerName(args);
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

  return {
    containerName: name,
    create: {
      program: resolve(binRoot, "nerdctl"),
      args: [...nerdctlGlobalArgs, "create", ...args.slice(1)],
    },
    start: {
      program: resolve(binRoot, "ctr"),
      args: [
        "--address",
        containerdSocket,
        "--namespace",
        namespace,
        "tasks",
        "start",
        "--fifo-dir",
        clientFifoRoot,
      ],
    },
    cleanup: {
      program: resolve(binRoot, "nerdctl"),
      args: [...nerdctlGlobalArgs, "rm", "--force", name],
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

export function executeContainedRun(context, spawn = spawnSync) {
  const plan = containedRunPlan(context);
  const options = {
    cwd: context.cwd,
    env: context.environment,
    encoding: null,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 1_800_000,
    maxBuffer: 32 * 1024 * 1024,
  };
  const created = spawn(plan.create.program, plan.create.args, {
    ...options,
    input: Buffer.alloc(0),
  });
  if (created.status !== 0) {
    return {
      status: created.status ?? 1,
      stdout: Buffer.alloc(0),
      stderr: appendBuffers(created.stderr, resultError(created)),
    };
  }

  const containerId = Buffer.from(created.stdout ?? "")
    .toString("utf8")
    .trim();
  if (!containerIdPattern.test(containerId)) {
    const cleaned = spawn(plan.cleanup.program, plan.cleanup.args, {
      ...options,
      input: Buffer.alloc(0),
    });
    const cleanupFailed = cleaned.status !== 0;
    return {
      status: 1,
      stdout: Buffer.alloc(0),
      stderr: appendBuffers(
        created.stderr,
        Buffer.from("contained runtime create returned an invalid ID\n"),
        cleanupFailed
          ? Buffer.from("contained runtime cleanup failed\n")
          : Buffer.alloc(0),
        cleanupFailed ? cleaned.stderr : Buffer.alloc(0),
        cleanupFailed ? resultError(cleaned) : Buffer.alloc(0),
      ),
    };
  }

  const started = spawn(plan.start.program, [...plan.start.args, containerId], {
    ...options,
    input: context.stdin,
  });
  const cleaned = spawn(plan.cleanup.program, plan.cleanup.args, {
    ...options,
    input: Buffer.alloc(0),
  });
  const cleanupFailed = cleaned.status !== 0;
  return {
    status: cleanupFailed ? 1 : (started.status ?? 1),
    stdout: Buffer.from(started.stdout ?? ""),
    stderr: appendBuffers(
      created.stderr,
      started.stderr,
      resultError(started),
      cleanupFailed
        ? Buffer.from("contained runtime cleanup failed\n")
        : Buffer.alloc(0),
      cleanupFailed ? cleaned.stderr : Buffer.alloc(0),
      cleanupFailed ? resultError(cleaned) : Buffer.alloc(0),
    ),
  };
}
