// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { ArtifactManifestSchema } from "@counterlab/contracts";
import { describe, expect, it } from "vitest";

import { D1ArtifactStore } from "./artifact-store";

class SqliteD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.sql, values);
  }

  async run() {
    const result = this.database
      .prepare(this.sql)
      .run(...(this.values as SQLInputValue[]));
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  async first<T>(): Promise<T | null> {
    return (
      (this.database
        .prepare(this.sql)
        .get(...(this.values as SQLInputValue[])) as T) ?? null
    );
  }
}

function artifactStore(): D1ArtifactStore {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../migrations/0001_evidence_store.sql",
      ),
      "utf8",
    ),
  );
  return new D1ArtifactStore({
    prepare: (sql: string) =>
      new SqliteD1Statement(database, sql) as unknown as D1PreparedStatement,
  } as D1Database);
}

const firstManifest = ArtifactManifestSchema.parse({
  artifactId: "artifact_aaaaaaaaaaaaaaaaaaaaaaaa",
  fileName: "first.ipynb",
  fileSha256: "a".repeat(64),
  nbformat: 4,
  support: { status: "SUPPORTED", reasons: [] },
  cells: [],
  schemaSummary: {
    fields: [],
    entityCandidates: [],
    targetCandidates: [],
  },
  packageHints: [],
  createdAt: "2026-07-20T10:00:00.000Z",
});

describe("D1ArtifactStore", () => {
  it("keeps the first content-addressed manifest and object key stable", async () => {
    const store = artifactStore();
    await expect(
      store.save(firstManifest, "uploads/first.ipynb"),
    ).resolves.toEqual({
      manifest: firstManifest,
      objectKey: "uploads/first.ipynb",
    });

    const retryManifest = ArtifactManifestSchema.parse({
      ...firstManifest,
      fileName: "renamed.ipynb",
      createdAt: "2026-07-20T10:01:00.000Z",
    });
    await expect(
      store.save(retryManifest, "uploads/retry.ipynb"),
    ).resolves.toEqual({
      manifest: firstManifest,
      objectKey: "uploads/first.ipynb",
    });
    await expect(store.find(firstManifest.artifactId)).resolves.toEqual({
      manifest: firstManifest,
      objectKey: "uploads/first.ipynb",
    });
  });

  it("fills an absent object key once without replacing it later", async () => {
    const store = artifactStore();
    await expect(store.save(firstManifest)).resolves.toEqual({
      manifest: firstManifest,
    });
    await expect(
      store.save(firstManifest, "uploads/recovered.ipynb"),
    ).resolves.toEqual({
      manifest: firstManifest,
      objectKey: "uploads/recovered.ipynb",
    });
    await expect(
      store.save(firstManifest, "uploads/replacement.ipynb"),
    ).resolves.toEqual({
      manifest: firstManifest,
      objectKey: "uploads/recovered.ipynb",
    });
  });
});
