import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  containedInputFile,
  containedNewOutputFile,
  parseStrictNameValueArgs,
} from "./repository-cli-paths.js";

const root = process.cwd();
const stage = resolve(
  root,
  "node_modules/.cache/counterlab-v6.1",
  `repository-cli-paths-${Date.now()}-${process.pid}`,
);

describe("repository-contained release CLI paths", () => {
  beforeAll(() => {
    mkdirSync(stage, { recursive: true, mode: 0o700 });
  });

  it("rejects unknown, duplicate, and unpaired arguments", () => {
    const allowed = new Set(["--input", "--output"]);
    expect(() =>
      parseStrictNameValueArgs(["--unknown", "value"], allowed),
    ).toThrow(/Unknown argument/u);
    expect(() =>
      parseStrictNameValueArgs(["--input", "one", "--input", "two"], allowed),
    ).toThrow(/Duplicate argument/u);
    expect(() => parseStrictNameValueArgs(["--input"], allowed)).toThrow(
      /name\/value pairs/u,
    );
  });

  it("accepts only regular inputs reached without symlinks", async () => {
    const input = resolve(stage, "input.json");
    writeFileSync(input, "{}\n", { encoding: "utf8", mode: 0o600 });
    await expect(containedInputFile(root, input, "test input")).resolves.toBe(
      input,
    );
    await expect(
      containedInputFile(root, "../outside.json", "test input"),
    ).rejects.toThrow(/escapes the repository/u);

    const link = resolve(stage, "input-link.json");
    symlinkSync("input.json", link);
    await expect(containedInputFile(root, link, "test input")).rejects.toThrow(
      /contains a symlink/u,
    );
  });

  it("requires a new output beneath a physical repository directory", async () => {
    const output = resolve(stage, "new-output.json");
    await expect(
      containedNewOutputFile(root, output, "test output"),
    ).resolves.toBe(output);

    const existing = resolve(stage, "existing-output.json");
    writeFileSync(existing, "{}\n", { encoding: "utf8", mode: 0o600 });
    await expect(
      containedNewOutputFile(root, existing, "test output"),
    ).rejects.toThrow(/refusing to replace/u);

    const physicalParent = resolve(stage, "physical-parent");
    const symlinkParent = resolve(stage, "symlink-parent");
    mkdirSync(physicalParent, { mode: 0o700 });
    symlinkSync("physical-parent", symlinkParent, "dir");
    await expect(
      containedNewOutputFile(
        root,
        resolve(symlinkParent, "output.json"),
        "test output",
      ),
    ).rejects.toThrow(/contains a symlink/u);
  });
});
