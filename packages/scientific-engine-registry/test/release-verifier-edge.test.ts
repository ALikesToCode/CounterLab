import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadScientificEngineSnapshot,
  verifyEvidenceFiles,
  verifyPinnedSources,
  verifySboms,
  verifyVulnerabilityReport,
} from "../../../scripts/verify-scientific-engines.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const fixtureRoot = resolve(
  repositoryRoot,
  "node_modules/.cache/counterlab-v6.1/release-verifier-edge",
);
const fixtureNonce = `${Date.now()}-${process.pid}`;
let fixtureSequence = 0;

async function createTemporaryRoot(): Promise<string> {
  fixtureSequence += 1;
  const root = resolve(
    fixtureRoot,
    `counterlab-engine-verifier-${fixtureNonce}-${fixtureSequence}`,
  );
  await mkdir(root, { recursive: true });
  return root;
}

describe("scientific engine release verifier edge cases", () => {
  it("rejects evidence paths that escape the repository root", async () => {
    const snapshot = await loadScientificEngineSnapshot(repositoryRoot);
    const tampered = structuredClone(snapshot);
    tampered.evidenceCatalog.records[0]!.path = "../outside-license.txt";

    const findings = await verifyEvidenceFiles(repositoryRoot, tampered);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "EVIDENCE_PATH_OUTSIDE_ROOT" }),
      ]),
    );
  });

  it("fails the release gate when catalog evidence is only partial", async () => {
    const snapshot = await loadScientificEngineSnapshot(repositoryRoot);
    const tampered = structuredClone(snapshot);
    tampered.evidenceCatalog.records[0]!.status = "PARTIAL";

    const findings = await verifyEvidenceFiles(repositoryRoot, tampered);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "EVIDENCE_NOT_VERIFIED" }),
      ]),
    );
  });

  it("rejects stale source hashes nested inside internal integrity evidence", async () => {
    const snapshot = await loadScientificEngineSnapshot(repositoryRoot);
    const authorityRecord = snapshot.evidenceCatalog.records.find((candidate) =>
      candidate.id.startsWith("internal-oracle-integrity-"),
    );
    if (authorityRecord === undefined) {
      throw new Error(
        "scientific engine evidence is missing internal oracle authority",
      );
    }

    const root = await createTemporaryRoot();
    const evidencePath = join(
      root,
      "scientific-engines",
      "fixtures",
      "validation",
      `${authorityRecord.id}.json`,
    );
    const sourcePath = join(root, "services", "kernel", "oracle.py");
    await mkdir(resolve(evidencePath, ".."), { recursive: true });
    await mkdir(resolve(sourcePath, ".."), { recursive: true });
    await writeFile(sourcePath, "def verify():\n    return True\n", "utf8");
    const evidence = `${JSON.stringify(
      {
        schemaVersion: "2",
        evidenceId: authorityRecord.id,
        kind: "integrity",
        files: {
          "services/kernel/oracle.py": "0".repeat(64),
        },
      },
      null,
      2,
    )}\n`;
    await writeFile(evidencePath, evidence, "utf8");

    const tampered = structuredClone(snapshot);
    const record = tampered.evidenceCatalog.records.find(
      (candidate) => candidate.id === authorityRecord.id,
    );
    if (record === undefined) {
      throw new Error(
        "scientific engine evidence lost internal oracle authority",
      );
    }
    record.path = relative(root, evidencePath);
    record.sha256 = createHash("sha256").update(evidence).digest("hex");

    const findings = await verifyEvidenceFiles(root, tampered);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INTERNAL_INTEGRITY_FILE_HASH_MISMATCH",
          path: "services/kernel/oracle.py",
        }),
      ]),
    );
  });

  it("rejects a floating container base even when the image tag is exact", async () => {
    const root = await createTemporaryRoot();
    const runnerDirectory = join(root, "services", "runner");
    await mkdir(runnerDirectory, { recursive: true });
    await writeFile(
      join(runnerDirectory, "Dockerfile"),
      "FROM python:3.12.13-slim-bookworm\n",
      "utf8",
    );

    const findings = await verifyPinnedSources(root);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "FLOATING_CONTAINER_BASE" }),
      ]),
    );
  });

  it("ignores repository-local runtime state when checking pinned sources", async () => {
    const root = await createTemporaryRoot();
    for (const runtimeDirectory of [
      ".cache",
      ".counterlab",
      ".playwright-cli",
      ".pnpm-store",
      ".rt",
      ".wrangler",
    ]) {
      const directory = join(root, runtimeDirectory, "session");
      await mkdir(directory, { recursive: true });
      await writeFile(
        join(directory, "Dockerfile"),
        "FROM python:latest\n",
        "utf8",
      );
      await writeFile(
        join(directory, "package.json"),
        JSON.stringify({ dependencies: { example: "latest" } }),
        "utf8",
      );
    }

    await expect(verifyPinnedSources(root)).resolves.toEqual([]);
  });

  it("rejects an SBOM component whose package version differs from the registry", async () => {
    const snapshot = await loadScientificEngineSnapshot(repositoryRoot);
    const tampered = structuredClone(snapshot);
    tampered.registry.engines[1]!.exactVersion = "2.4.5";

    const findings = await verifySboms(repositoryRoot, tampered);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SBOM_ENGINE_VERSION_MISMATCH" }),
      ]),
    );
  });

  it("rejects relabelling local vulnerability authority as production evidence", async () => {
    const snapshot = await loadScientificEngineSnapshot(repositoryRoot);
    const production = structuredClone(snapshot);
    production.runtimeManifest.environmentKind = "cloudflare_production";

    const findings = await verifyVulnerabilityReport(
      repositoryRoot,
      production,
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VULNERABILITY_REPORT_RUNTIME_MISMATCH",
        }),
      ]),
    );
  });
});
