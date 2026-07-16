import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadScientificEngineSnapshot,
  verifyEvidenceFiles,
  verifyPinnedSources,
  verifySboms,
  verifyVulnerabilityReport,
} from "../../../scripts/verify-scientific-engines.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const temporaryRoots: string[] = [];

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "counterlab-engine-verifier-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

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
        expect.objectContaining({
          code: "VEX_RUNTIME_BINDING_MISMATCH",
        }),
      ]),
    );
  });
});
