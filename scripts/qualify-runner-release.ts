import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import {
  collectRunnerReleaseEvidence,
  createQualifiedRunnerRelease,
} from "./prepare-qualified-deploy.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const BuildReceiptSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  status: z.literal("BUILT"),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  sourceArchiveSha256: Sha256Schema,
  sourceTreeSha256: Sha256Schema,
  dockerfileSha256: Sha256Schema,
  localImageTag: z
    .string()
    .regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
  localImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  builtAt: z.iso.datetime({ offset: true }),
});

type Arguments = {
  buildReceipt: string;
  registryImage: string;
  output: string;
};

function argumentsFrom(argv: string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !["--build-receipt", "--registry-image", "--output"].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error(
        "Usage: qualify-runner-release --build-receipt FILE --registry-image URI --output FILE",
      );
    }
    values.set(flag, value);
  }
  if (values.size !== 3) {
    throw new Error(
      "Usage: qualify-runner-release --build-receipt FILE --registry-image URI --output FILE",
    );
  }
  return {
    buildReceipt: values.get("--build-receipt")!,
    registryImage: values.get("--registry-image")!,
    output: values.get("--output")!,
  };
}

async function main(): Promise<void> {
  const args = argumentsFrom(process.argv.slice(2));
  const root = resolve(import.meta.dirname, "..");
  const buildReceipt = BuildReceiptSchema.parse(
    JSON.parse(await readFile(resolve(args.buildReceipt), "utf8")) as unknown,
  );

  execFileSync(
    "bash",
    ["scripts/verify-scientific-engines.sh", "--image", buildReceipt.localImageTag],
    { cwd: root, stdio: "inherit" },
  );

  const observation = await collectRunnerReleaseEvidence({
    root,
    sourceCommit: buildReceipt.sourceCommit,
    localImageTag: buildReceipt.localImageTag,
    registryImage: args.registryImage,
  });
  for (const [label, built, observed] of [
    [
      "source archive",
      buildReceipt.sourceArchiveSha256,
      observation.sourceArchiveSha256,
    ],
    ["source tree", buildReceipt.sourceTreeSha256, observation.sourceTreeSha256],
    ["Dockerfile", buildReceipt.dockerfileSha256, observation.dockerfileSha256],
    ["local image", buildReceipt.localImageDigest, observation.localImageDigest],
  ] as const) {
    if (built !== observed) {
      throw new Error(`${label} changed after the source-bound runner build`);
    }
  }

  const receipt = createQualifiedRunnerRelease(observation);
  const output = resolve(args.output);
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, output);
  console.log(`Qualified runner receipt: ${output}`);
}

await main();
