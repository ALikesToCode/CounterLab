#!/usr/bin/env node

import { spawn } from "node:child_process";
import { realpathSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const minimumMemoryBytes = 64 * 1024 * 1024;
const maximumMemoryBytes = 1280 * 1024 * 1024;

function integer(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) {
    throw new Error("contained cgroup control integer is invalid");
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("contained cgroup control integer is invalid");
  }
  return parsed;
}

export function parseContainedCgroupControl(args) {
  if (!Array.isArray(args) || args[0] !== "--mode") {
    throw new Error("contained cgroup control arguments are invalid");
  }
  if (
    args[1] === "memory" &&
    args.length === 4 &&
    args[2] === "--requested-bytes"
  ) {
    const requestedBytes = integer(args[3]);
    if (
      requestedBytes < minimumMemoryBytes ||
      requestedBytes > maximumMemoryBytes
    ) {
      throw new Error("contained cgroup control memory bound is invalid");
    }
    return { mode: "memory", requestedBytes };
  }
  if (
    args[1] === "processes" &&
    args.length === 4 &&
    args[2] === "--attempted-processes"
  ) {
    const attemptedProcesses = integer(args[3]);
    if (attemptedProcesses < 2 || attemptedProcesses > 64) {
      throw new Error("contained cgroup control process bound is invalid");
    }
    return { mode: "processes", attemptedProcesses };
  }
  if (
    args[1] === "cpu" &&
    args.length === 6 &&
    args[2] === "--busy-window-ms" &&
    args[4] === "--workers"
  ) {
    const busyWindowMs = integer(args[3]);
    const workers = integer(args[5]);
    if (
      busyWindowMs < 100 ||
      busyWindowMs > 5_000 ||
      workers < 2 ||
      workers > 8
    ) {
      throw new Error("contained cgroup control CPU bound is invalid");
    }
    return { mode: "cpu", busyWindowMs, workers };
  }
  throw new Error("contained cgroup control mode or fields are invalid");
}

async function waitForGo() {
  process.stdout.write("READY\n");
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.byteLength;
    if (length > 16) {
      throw new Error("contained cgroup control handshake is oversized");
    }
    chunks.push(chunk);
  }
  if (Buffer.concat(chunks).toString("utf8") !== "GO\n") {
    throw new Error("contained cgroup control handshake is invalid");
  }
}

function childCompletion(child) {
  return new Promise((accept) => {
    let started = false;
    child.once("spawn", () => {
      started = true;
    });
    child.once("error", () => accept({ started: false }));
    child.once("close", (code, signal) => accept({ started, code, signal }));
  });
}

async function memoryControl(requestedBytes) {
  writeFileSync("/proc/self/oom_score_adj", "1000\n", "utf8");
  const retained = [];
  let allocated = 0;
  const chunkBytes = 8 * 1024 * 1024;
  while (allocated < requestedBytes) {
    const chunk = Buffer.allocUnsafe(
      Math.min(chunkBytes, requestedBytes - allocated),
    );
    for (let offset = 0; offset < chunk.byteLength; offset += 4_096) {
      chunk[offset] = 1;
    }
    retained.push(chunk);
    allocated += chunk.byteLength;
  }
  await new Promise((accept) => setTimeout(accept, 2_000));
  throw new Error(
    `contained cgroup memory control escaped its limit at ${retained.length} chunks`,
  );
}

async function processControl(attemptedProcesses, scriptPath) {
  const children = [];
  const completions = [];
  let denied = false;
  for (let index = 0; index < attemptedProcesses; index += 1) {
    const child = spawn(
      process.execPath,
      [scriptPath, "--internal-hold", "5000"],
      { stdio: "ignore" },
    );
    children.push(child);
    const completion = childCompletion(child);
    completions.push(completion);
    const state = await Promise.race([
      completion,
      new Promise((accept) =>
        child.once("spawn", () => accept({ started: true })),
      ),
    ]);
    if (!state.started) {
      denied = true;
      break;
    }
  }
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }
  await Promise.all(completions);
  if (!denied) {
    throw new Error("contained cgroup process control escaped its limit");
  }
  process.stdout.write(
    `${JSON.stringify({ attemptedProcesses, denied: true })}\n`,
  );
}

async function cpuControl(busyWindowMs, workers, scriptPath) {
  const children = Array.from({ length: workers }, () =>
    spawn(
      process.execPath,
      [scriptPath, "--internal-busy", String(busyWindowMs)],
      { stdio: "ignore" },
    ),
  );
  const results = await Promise.all(children.map(childCompletion));
  if (results.some((result) => !result.started || result.code !== 0)) {
    throw new Error("contained cgroup CPU control worker failed");
  }
  process.stdout.write(`${JSON.stringify({ busyWindowMs, workers })}\n`);
}

async function main() {
  const scriptPath = realpathSync(fileURLToPath(import.meta.url));
  if (process.argv[2] === "--internal-hold" && process.argv.length === 4) {
    const holdMs = integer(process.argv[3]);
    if (holdMs > 10_000) {
      throw new Error("contained cgroup internal hold bound is invalid");
    }
    await new Promise((accept) => setTimeout(accept, holdMs));
    return;
  }
  if (process.argv[2] === "--internal-busy" && process.argv.length === 4) {
    const busyMs = integer(process.argv[3]);
    if (busyMs > 5_000) {
      throw new Error("contained cgroup internal CPU bound is invalid");
    }
    const deadline = performance.now() + busyMs;
    while (performance.now() < deadline) {
      // Fixed release-only CPU load. Kernel counters are authoritative.
    }
    return;
  }
  const control = parseContainedCgroupControl(process.argv.slice(2));
  await waitForGo();
  if (control.mode === "memory") {
    await memoryControl(control.requestedBytes);
    return;
  }
  if (control.mode === "processes") {
    await processControl(control.attemptedProcesses, scriptPath);
    return;
  }
  await cpuControl(control.busyWindowMs, control.workers, scriptPath);
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "contained cgroup control failed"}\n`,
    );
    process.exitCode = 70;
  });
}
