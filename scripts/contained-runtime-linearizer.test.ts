import { describe, expect, it } from "vitest";

import { createContainedRuntimeLinearizer } from "./contained-runtime-linearizer.mjs";

describe("contained runtime request linearizer", () => {
  it("does not begin a drain until an accepted run reaches its terminal response", async () => {
    const linearizer = createContainedRuntimeLinearizer();
    const events: string[] = [];
    let releaseRun!: () => void;
    const runCanFinish = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });

    const run = linearizer.run(async () => {
      events.push("run-started");
      await runCanFinish;
      events.push("run-terminal-response");
    });
    const drain = linearizer.run(() => {
      events.push("drain-started");
    });

    await Promise.resolve();
    expect(events).toEqual(["run-started"]);
    releaseRun();
    await Promise.all([run, drain]);
    expect(events).toEqual([
      "run-started",
      "run-terminal-response",
      "drain-started",
    ]);
  });

  it("continues serializing after a failed request", async () => {
    const linearizer = createContainedRuntimeLinearizer();
    const failed = linearizer.run(() => {
      throw new Error("request failed");
    });
    const next = linearizer.run(() => "next response");

    await expect(failed).rejects.toThrow("request failed");
    await expect(next).resolves.toBe("next response");
  });

  it("rejects invalid tasks without poisoning the queue", async () => {
    const linearizer = createContainedRuntimeLinearizer();

    await expect(linearizer.run(null as never)).rejects.toThrow(
      "linearized task is invalid",
    );
    await expect(linearizer.run(() => "ready")).resolves.toBe("ready");
  });
});
