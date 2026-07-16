import readline from "node:readline";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ignoreSigtermArgument = process.argv.find((argument) =>
  argument.startsWith("--ignore-sigterm="),
);
const ignoreSigtermPidFile = ignoreSigtermArgument?.slice(
  "--ignore-sigterm=".length,
);
if (ignoreSigtermPidFile) {
  writeFileSync(ignoreSigtermPidFile, String(process.pid), { mode: 0o600 });
  process.on("SIGTERM", () => undefined);
  setInterval(() => undefined, 1_000);
}

const exitOnceArgument = process.argv.find((argument) =>
  argument.startsWith("--exit-once="),
);
const exitOnceFile = exitOnceArgument?.slice("--exit-once=".length);
if (exitOnceFile && !existsSync(exitOnceFile)) {
  writeFileSync(exitOnceFile, "exited\n", { mode: 0o600 });
  process.exit(17);
}

const lines = readline.createInterface({ input: process.stdin });
let initialized = false;
let selectedModel = "installed-compatible-default";
const requestApproval = process.argv.includes("--request-approval");
const failedTurn = process.argv.includes("--failed-turn");
const silentTurn = process.argv.includes("--silent-turn");
const failTurnOnceArgument = process.argv.find((argument) =>
  argument.startsWith("--fail-turn-once="),
);
const failTurnOnceFile = failTurnOnceArgument?.slice(
  "--fail-turn-once=".length,
);
const failTurnTwiceArgument = process.argv.find((argument) =>
  argument.startsWith("--fail-turn-twice="),
);
const failTurnTwiceFile = failTurnTwiceArgument?.slice(
  "--fail-turn-twice=".length,
);
const expectModelOmitted = process.argv.includes("--expect-model-omitted");
const expectConstrainedTurn = process.argv.includes(
  "--expect-constrained-turn",
);
const expectStructuredTurn = process.argv.includes("--expect-structured-turn");
const structuredPlanOutput = process.argv.includes("--structured-plan-output");
const expectedModelArgument = process.argv.find((argument) =>
  argument.startsWith("--expect-model="),
);
const expectedModel = expectedModelArgument?.slice("--expect-model=".length);
const expectedCwdArgument = process.argv.find((argument) =>
  argument.startsWith("--expect-cwd="),
);
const expectedCwd = expectedCwdArgument?.slice("--expect-cwd=".length);

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      id: message.id,
      result: {
        userAgent: "counterlab-test/0.144.4",
        codexHome: "/tmp/codex-home",
        platformFamily: "unix",
        platformOs: "linux",
      },
    });
    return;
  }
  if (message.method === "initialized") {
    initialized = true;
    return;
  }
  if (message.method === "account/read") {
    if (!initialized) process.exit(8);
    send({
      id: message.id,
      result: {
        account: { type: "chatgpt", planType: "test" },
        requiresOpenaiAuth: true,
      },
    });
    return;
  }
  if (message.method === "thread/start") {
    if (!initialized) process.exit(2);
    if (expectModelOmitted && Object.hasOwn(message.params, "model")) {
      process.exit(3);
    }
    if (expectedModel && message.params.model !== expectedModel) {
      process.exit(4);
    }
    if (Object.hasOwn(message.params, "model")) {
      selectedModel = message.params.model;
    }
    if (expectedCwd && message.params.cwd !== expectedCwd) process.exit(6);
    if (expectStructuredTurn && message.params.sandbox !== "read-only") {
      process.exit(9);
    }
    send({
      id: message.id,
      result: {
        thread: { id: "thread_test" },
        model: selectedModel,
      },
    });
    return;
  }
  if (message.method === "turn/start") {
    const failureMarker = failTurnTwiceFile ?? failTurnOnceFile;
    const failuresBeforeSuccess = failTurnTwiceFile ? 2 : 1;
    const observedFailures =
      failureMarker && existsSync(failureMarker)
        ? Number(readFileSync(failureMarker, "utf8"))
        : 0;
    const failThisTurn =
      failedTurn ||
      (failureMarker !== undefined &&
        Number.isInteger(observedFailures) &&
        observedFailures < failuresBeforeSuccess);
    if (failureMarker !== undefined && failThisTurn && !failedTurn) {
      writeFileSync(failureMarker, String(observedFailures + 1), {
        mode: 0o600,
      });
    }
    if (expectedCwd && message.params.cwd !== expectedCwd) process.exit(7);
    if (
      expectConstrainedTurn &&
      (message.params.sandboxPolicy?.type !== "workspaceWrite" ||
        message.params.sandboxPolicy?.networkAccess !== false ||
        message.params.sandboxPolicy?.excludeSlashTmp !== true ||
        message.params.sandboxPolicy?.excludeTmpdirEnvVar !== true ||
        JSON.stringify(message.params.sandboxPolicy?.writableRoots) !==
          JSON.stringify([message.params.cwd]))
    ) {
      process.exit(5);
    }
    if (
      expectStructuredTurn &&
      (message.params.sandboxPolicy?.type !== "readOnly" ||
        message.params.sandboxPolicy?.networkAccess !== false ||
        message.params.outputSchema?.properties?.authoritativeArtifact ===
          undefined ||
        message.params.outputSchema?.properties?.publicRationale === undefined)
    ) {
      process.exit(10);
    }
    send({ id: message.id, result: { turn: { id: "turn_test" } } });
    if (silentTurn) return;
    if (requestApproval) {
      send({
        id: 99,
        method: "item/commandExecution/requestApproval",
        params: { command: "not allowed" },
      });
      return;
    }
    if (!failThisTurn) {
      if (structuredPlanOutput) {
        send({
          method: "item/completed",
          params: {
            threadId: "thread_test",
            turnId: "turn_test",
            completedAtMs: 122,
            item: {
              type: "agentMessage",
              id: "structured_output",
              text: JSON.stringify({
                authoritativeArtifact: {
                  schemaVersion: "2",
                  artifactManifestHash: "e".repeat(64),
                },
                publicRationale:
                  "Whole-entity holdout is the smallest fair test.",
              }),
              phase: "final_answer",
              memoryCitation: null,
            },
          },
        });
      }
      send({
        method: "item/plan/delta",
        params: {
          threadId: "thread_test",
          turnId: "turn_test",
          itemId: "plan_test",
          delta: "Create the constrained adapter.",
        },
      });
      send({
        method: "item/reasoning/textDelta",
        params: {
          threadId: "thread_test",
          turnId: "turn_test",
          itemId: "reasoning_test",
          delta: "private reasoning must never surface",
        },
      });
    }
    send({
      method: "turn/completed",
      params: {
        threadId: "thread_test",
        turn: {
          id: "turn_test",
          status: failThisTurn ? "failed" : "completed",
          durationMs: 123,
          error: failThisTurn
            ? { message: "candidate generation failed" }
            : null,
        },
      },
    });
  }
});
