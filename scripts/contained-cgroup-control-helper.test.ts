import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseContainedCgroupControl } from "./contained-cgroup-control-helper.mjs";

describe("contained cgroup negative-control helper", () => {
  it("accepts only bounded release-control modes", () => {
    expect(
      parseContainedCgroupControl([
        "--mode",
        "memory",
        "--requested-bytes",
        String(576 * 1024 * 1024),
      ]),
    ).toEqual({ mode: "memory", requestedBytes: 576 * 1024 * 1024 });
    expect(
      parseContainedCgroupControl([
        "--mode",
        "processes",
        "--attempted-processes",
        "17",
      ]),
    ).toEqual({ mode: "processes", attemptedProcesses: 17 });
    expect(
      parseContainedCgroupControl([
        "--mode",
        "cpu",
        "--busy-window-ms",
        "500",
        "--workers",
        "1",
      ]),
    ).toEqual({ mode: "cpu", busyWindowMs: 500, workers: 1 });
  });

  it("rejects unknown fields, unsafe bounds, and non-integers", () => {
    for (const args of [
      ["--mode", "unknown"],
      ["--mode", "memory", "--requested-bytes", "1"],
      ["--mode", "processes", "--attempted-processes", "65"],
      ["--mode", "cpu", "--busy-window-ms", "99", "--workers", "4"],
      ["--mode", "cpu", "--busy-window-ms", "500", "--workers", "0"],
      ["--mode", "memory", "--requested-bytes", "100.5"],
      ["--mode", "memory", "--requested-bytes", "67108864", "extra"],
    ]) {
      expect(() => parseContainedCgroupControl(args), args.join(" ")).toThrow(
        /cgroup control/u,
      );
    }
  });

  it("uses worker threads for CPU pressure without multiplying Node processes", () => {
    const source = readFileSync(
      new URL("./contained-cgroup-control-helper.mjs", import.meta.url),
      "utf8",
    );

    expect(source).toContain('from "node:worker_threads"');
    expect(source).toContain("{ length: workers - 1 }");
    expect(source).not.toContain('[scriptPath, "--internal-busy"');
  });

  it("runs the source-bound low-task helper with two CPU streams", async () => {
    const helper = resolve(
      process.cwd(),
      "scripts/contained-cgroup-control-helper.py",
    );
    const child = spawn(
      "/usr/bin/python3.14",
      [
        "-I",
        "-u",
        helper,
        "--mode",
        "cpu",
        "--busy-window-ms",
        "100",
        "--workers",
        "2",
      ],
      {
        cwd: process.cwd(),
        env: { LANG: "C", LC_ALL: "C", TZ: "UTC" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.stdin.end("GO\n");
    const status = await new Promise<number | null>((accept, reject) => {
      child.once("error", reject);
      child.once("close", accept);
    });

    expect(status).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toBe('READY\n{"busyWindowMs":100,"workers":2}\n');
  });
});
