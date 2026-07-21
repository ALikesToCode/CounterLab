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
        "4",
      ]),
    ).toEqual({ mode: "cpu", busyWindowMs: 500, workers: 4 });
  });

  it("rejects unknown fields, unsafe bounds, and non-integers", () => {
    for (const args of [
      ["--mode", "unknown"],
      ["--mode", "memory", "--requested-bytes", "1"],
      ["--mode", "processes", "--attempted-processes", "65"],
      ["--mode", "cpu", "--busy-window-ms", "99", "--workers", "4"],
      ["--mode", "cpu", "--busy-window-ms", "500", "--workers", "1"],
      ["--mode", "memory", "--requested-bytes", "100.5"],
      ["--mode", "memory", "--requested-bytes", "67108864", "extra"],
    ]) {
      expect(() => parseContainedCgroupControl(args), args.join(" ")).toThrow(
        /cgroup control/u,
      );
    }
  });
});
