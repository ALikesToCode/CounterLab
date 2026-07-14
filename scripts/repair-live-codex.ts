import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AppServerCodexCompiler,
  buildRepairLabPrompt,
  createDefaultBubblewrapCodexLaunchBoundary,
  type CompilerEvent,
  type RepairLabInput,
} from "../packages/codex-client/src/index.ts";
import { createLiveCompileInput } from "./live-codex-input.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const requested = process.argv[2];
  const repairAttempt = Number(process.argv[3] ?? "1");
  if (!requested || (repairAttempt !== 1 && repairAttempt !== 2)) {
    throw new Error(
      "Usage: pnpm exec tsx scripts/repair-live-codex.ts <run-directory> [1|2]",
    );
  }
  const liveRoot = resolve(root, "data", "live-runs");
  const runDirectory = resolve(root, requested);
  const containment = relative(liveRoot, runDirectory);
  if (containment.startsWith(`..${sep}`) || containment === "..") {
    throw new Error("Run directory is outside data/live-runs");
  }
  const compileMetadata = JSON.parse(
    await readFile(join(runDirectory, "compile-metadata.json"), "utf8"),
  ) as { sessionId: string; startedAt: string };
  const generationDirectory = join(
    runDirectory,
    "generated",
    compileMetadata.sessionId,
  );
  const compileInput = await createLiveCompileInput({
    root,
    sessionId: compileMetadata.sessionId,
    generationDirectory,
    createdAt: compileMetadata.startedAt,
  });
  const verifierReport = JSON.parse(
    await readFile(join(runDirectory, "external-verifier-report.json"), "utf8"),
  ) as {
    status: string;
    failures: Array<{
      invariant: string;
      observed: unknown;
      counterexample: unknown;
    }>;
  };
  if (
    verifierReport.status !== "REJECTED" ||
    verifierReport.failures.length === 0
  ) {
    throw new Error("Repair requires a rejected external verifier report");
  }
  const generatedFiles = [
    "artifact-adapter.py",
    "experiment-plan.json",
    "public_tests.py",
  ];
  const previousArtifactHashes = Object.fromEntries(
    await Promise.all(
      generatedFiles.map(async (name) => [
        name,
        sha256(await readFile(join(generationDirectory, name))),
      ]),
    ),
  );
  const input: RepairLabInput = {
    ...compileInput,
    repairAttempt: repairAttempt as 1 | 2,
    previousArtifactHashes,
    verifierCounterexamples: verifierReport.failures.map((failure) => ({
      invariant: failure.invariant,
      observed: failure.observed,
      counterexample: failure.counterexample,
    })),
  };
  const promptHash = sha256(buildRepairLabPrompt(input));
  const launchBoundary = await createDefaultBubblewrapCodexLaunchBoundary();
  const compiler = new AppServerCodexCompiler({
    launchBoundary,
    timeoutMs: 300_000,
  });
  const health = await compiler.health();
  if (!health.available) throw new Error(health.reason);

  const events: CompilerEvent[] = [];
  const eventPath = join(runDirectory, `repair-${repairAttempt}-events.json`);
  console.log(`Repair attempt ${repairAttempt}: ${compileMetadata.sessionId}`);
  for await (const event of compiler.repairLab(input)) {
    events.push(event);
    await writeFile(eventPath, `${JSON.stringify(events, null, 2)}\n`, "utf8");
    if (event.type === "verifier_counterexample")
      console.log(`counterexample: ${event.invariant}`);
    else if (event.type === "status")
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
  const finalFiles = (await readdir(generationDirectory)).sort();
  const expectedFiles = [...generatedFiles].sort();
  const exactFiles =
    JSON.stringify(finalFiles) === JSON.stringify(expectedFiles);
  const artifactHashes = Object.fromEntries(
    await Promise.all(
      generatedFiles.map(async (name) => [
        name,
        sha256(await readFile(join(generationDirectory, name))),
      ]),
    ),
  );
  await writeFile(
    join(runDirectory, `repair-${repairAttempt}-metadata.json`),
    `${JSON.stringify(
      {
        schemaVersion: "1",
        repairAttempt,
        completedAt: new Date().toISOString(),
        status: exactFiles ? "GENERATED" : "REJECTED_FILE_SET",
        promptHash,
        health,
        previousArtifactHashes,
        artifactHashes,
        finalFiles,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  if (!exactFiles)
    throw new Error(
      `Repair produced invalid file set: ${finalFiles.join(", ")}`,
    );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
