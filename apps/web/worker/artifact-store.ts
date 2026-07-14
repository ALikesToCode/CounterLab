import type { ArtifactManifest } from "@counterlab/contracts";

export interface StoredArtifact {
  manifest: ArtifactManifest;
  objectKey?: string;
}

export interface ArtifactStore {
  save(manifest: ArtifactManifest, objectKey?: string): Promise<StoredArtifact>;
  find(artifactId: string): Promise<StoredArtifact | undefined>;
}

export class D1ArtifactStore implements ArtifactStore {
  constructor(private readonly database: D1Database) {}

  async save(
    manifest: ArtifactManifest,
    objectKey?: string,
  ): Promise<StoredArtifact> {
    await this.database
      .prepare(
        `INSERT INTO artifacts
          (id, file_name, file_sha256, manifest_json, object_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_sha256) DO UPDATE SET
           manifest_json = excluded.manifest_json,
           object_key = COALESCE(artifacts.object_key, excluded.object_key)`,
      )
      .bind(
        manifest.artifactId,
        manifest.fileName,
        manifest.fileSha256,
        JSON.stringify(manifest),
        objectKey ?? null,
        manifest.createdAt,
      )
      .run();

    return { manifest, ...(objectKey === undefined ? {} : { objectKey }) };
  }

  async find(artifactId: string): Promise<StoredArtifact | undefined> {
    const row = await this.database
      .prepare(
        "SELECT manifest_json, object_key FROM artifacts WHERE id = ?",
      )
      .bind(artifactId)
      .first<{ manifest_json: string; object_key: string | null }>();
    if (row === null) return undefined;
    return {
      manifest: JSON.parse(row.manifest_json) as ArtifactManifest,
      ...(row.object_key === null ? {} : { objectKey: row.object_key }),
    };
  }
}
