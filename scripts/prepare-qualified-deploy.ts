import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { QualifiedRunnerReleaseSchema } from "../packages/scientific-engine-registry/src/index.js";

type Arguments = {
  config: string;
  receipt: string;
  image: string;
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
      !["--config", "--receipt", "--image", "--output"].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error(
        "Usage: prepare-qualified-deploy --config FILE --receipt FILE --image REGISTRY_IMAGE --output FILE",
      );
    }
    values.set(flag, value);
  }
  if (values.size !== 4) {
    throw new Error(
      "Usage: prepare-qualified-deploy --config FILE --receipt FILE --image REGISTRY_IMAGE --output FILE",
    );
  }
  return {
    config: values.get("--config")!,
    receipt: values.get("--receipt")!,
    image: values.get("--image")!,
    output: values.get("--output")!,
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function qualifiedDeployConfig(input: {
  config: unknown;
  receipt: unknown;
  image: string;
}): Record<string, unknown> {
  const config = structuredClone(record(input.config, "Wrangler config"));
  const receipt = QualifiedRunnerReleaseSchema.parse(input.receipt);
  const imageMatch = input.image.match(
    /^registry\.cloudflare\.com\/([A-Za-z0-9_-]{3,64})\/counterlab-runner:git-([a-f0-9]{40})$/,
  );
  if (imageMatch === null) {
    throw new Error(
      "qualified image must use registry.cloudflare.com/<account>/counterlab-runner:git-<source-commit>",
    );
  }
  if (imageMatch[2] !== receipt.sourceCommit) {
    throw new Error("qualified image tag does not match the receipt source commit");
  }
  if (config.account_id !== imageMatch[1]) {
    throw new Error("qualified image account does not match Wrangler account_id");
  }

  if (!Array.isArray(config.containers) || config.containers.length !== 1) {
    throw new Error("Wrangler config must contain exactly one Container");
  }
  const container = record(config.containers[0], "Container config");
  if (container.class_name !== "CounterLabRunner") {
    throw new Error("qualified image may bind only to CounterLabRunner");
  }
  container.image = input.image;
  delete container.image_vars;
  delete container.image_build_context;
  config.containers = [container];
  return config;
}

async function main(): Promise<void> {
  const args = argumentsFrom(process.argv.slice(2));
  const [configText, receiptText] = await Promise.all([
    readFile(resolve(args.config), "utf8"),
    readFile(resolve(args.receipt), "utf8"),
  ]);
  const generated = qualifiedDeployConfig({
    config: JSON.parse(configText) as unknown,
    receipt: JSON.parse(receiptText) as unknown,
    image: args.image,
  });
  const output = resolve(args.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
  console.log(`Qualified deploy config: ${output}`);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
