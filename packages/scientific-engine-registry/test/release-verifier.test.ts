import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  loadScientificEngineSnapshot,
  verifyConceptPackBindings,
  verifyEvidenceFiles,
  verifyEvidenceSemantics,
  verifyPinnedSources,
  verifySboms,
  verifySnapshotArtifacts,
} from "../../../scripts/verify-scientific-engines.js";

const root = resolve(import.meta.dirname, "../../..");

describe("scientific engine release verifier", () => {
  it("accepts the repository evidence and canonical snapshot", async () => {
    const snapshot = await loadScientificEngineSnapshot(root);

    await expect(verifyEvidenceFiles(root, snapshot)).resolves.toEqual([]);
    await expect(verifyPinnedSources(root)).resolves.toEqual([]);
    await expect(verifySboms(root, snapshot)).resolves.toEqual([]);
    await expect(verifySnapshotArtifacts(root, snapshot)).resolves.toEqual([]);
  });

  it("detects a catalog hash that no longer matches its evidence bytes", async () => {
    const snapshot = await loadScientificEngineSnapshot(root);
    const tampered = structuredClone(snapshot);
    tampered.evidenceCatalog.records[0]!.sha256 = "0".repeat(64);

    const findings = await verifyEvidenceFiles(root, tampered);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "EVIDENCE_HASH_MISMATCH" }),
      ]),
    );
  });

  it("detects a registered engine missing from its SBOM", async () => {
    const snapshot = await loadScientificEngineSnapshot(root);
    const tampered = structuredClone(snapshot);
    tampered.registry.engines[0]!.packageName = "missing-engine";

    const findings = await verifySboms(root, tampered);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SBOM_ENGINE_MISSING" }),
      ]),
    );
  });

  it("detects a non-canonical snapshot file", async () => {
    const snapshot = await loadScientificEngineSnapshot(root);
    const canonical = await readFile(
      resolve(root, "scientific-engines/snapshot.json"),
      "utf8",
    );

    const findings = await verifySnapshotArtifacts(root, snapshot, {
      snapshotText: `${canonical.trimEnd()} \n`,
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SNAPSHOT_NOT_CANONICAL" }),
      ]),
    );
  });

  it("binds installed artifact hashes to integrity evidence", async () => {
    const snapshot = await loadScientificEngineSnapshot(root);
    const tampered = structuredClone(snapshot);
    tampered.runtimeManifest.installedEngines[0]!.artifactSha256 = "0".repeat(
      64,
    );

    const findings = await verifyEvidenceSemantics(root, tampered);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ENGINE_ARTIFACT_HASH_MISMATCH" }),
      ]),
    );
  });

  it("binds Subject Pack versions and operations to the released registry", async () => {
    const snapshot = await loadScientificEngineSnapshot(root);
    const tampered = structuredClone(snapshot);
    tampered.bindings.subjectPacks[0]!.subjectPackVersion = "99.0.0";

    const findings = verifyConceptPackBindings(tampered);

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SUBJECT_PACK_VERSION_MISMATCH" }),
      ]),
    );
  });
});
