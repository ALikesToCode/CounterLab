import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AppServerCodexCompiler,
  buildCompileLabPrompt,
  type CompilerEvent,
} from "../packages/codex-client/src/index.ts";
import { createLiveCompileInput } from "./live-codex-input.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const startedAt = new Date().toISOString();
const sessionId = `live_${startedAt.replaceAll(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 8)}`;
const runDirectory = join(root, "data", "live-runs", sessionId);
const generatedRoot = join(runDirectory, "generated");
const generationDirectory = join(generatedRoot, sessionId);
const eventFile = join(runDirectory, "compiler-events.json");

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function record(events: CompilerEvent[]): Promise<void> {
  await writeFile(eventFile, `${JSON.stringify(events, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  await mkdir(generationDirectory, { recursive: true, mode: 0o700 });
  const input = await createLiveCompileInput({
    root,
    sessionId,
    generationDirectory,
    createdAt: startedAt,
  });
  const promptHash = sha256(buildCompileLabPrompt(input));
  const compiler = new AppServerCodexCompiler({ timeoutMs: 300_000 });
  const health = await compiler.health();
  if (!health.available) throw new Error(health.reason);
  if (health.mode !== "live")
    throw new Error("Live compiler returned non-live health");

  const events: CompilerEvent[] = [];
  console.log(`CounterLab live Codex session: ${sessionId}`);
  console.log(`Codex health: ${health.version}`);
  console.log(`Generation directory: ${generationDirectory}`);
  for await (const event of compiler.compileLab(input)) {
    events.push(event);
    await record(events);
    if (event.type === "status")
      console.log(
        `${event.phase}: ${event.status}${event.detail ? ` (${event.detail})` : ""}`,
      );
    else if (event.type === "command")
      console.log(
        `command: ${event.status} exit=${String(event.exitCode)} ${event.command}`,
      );
    else if (event.type === "file_change")
      console.log(`files: ${event.status} ${event.files.join(", ")}`);
    else if (event.type === "final_status")
      console.log(`turn: ${event.status} ${event.threadId}/${event.turnId}`);
  }

  const generatedFiles = (await readdir(generationDirectory)).sort();
  const expectedFiles = [
    "artifact-adapter.py",
    "experiment-plan.json",
    "public_tests.py",
  ];
  const exactFiles =
    JSON.stringify(generatedFiles) === JSON.stringify(expectedFiles);
  const modelEvent = events.find(
    (event) =>
      event.type === "status" && event.phase === "thread" && event.detail,
  );
  await writeFile(
    join(runDirectory, "compile-metadata.json"),
    `${JSON.stringify(
      {
        schemaVersion: "1",
        sessionId,
        startedAt,
        completedAt: new Date().toISOString(),
        status: exactFiles ? "GENERATED" : "REJECTED_FILE_SET",
        promptHash,
        health,
        model:
          modelEvent?.type === "status" && modelEvent.detail
            ? modelEvent.detail.replace(/^model:/, "")
            : health.model,
        generatedFiles,
        expectedFiles,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  if (!exactFiles) {
    throw new Error(
      `Codex generated an invalid file set: ${generatedFiles.join(", ")}`,
    );
  }
  console.log(
    `Generated exact bounded file set. Run directory: ${runDirectory}`,
  );
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  await mkdir(runDirectory, { recursive: true });
  await writeFile(
    join(runDirectory, "setup-error.json"),
    `${JSON.stringify({ schemaVersion: "1", sessionId, startedAt, message }, null, 2)}\n`,
    "utf8",
  );
  console.error(`Live Codex generation failed: ${message}`);
  process.exitCode = 1;
});
