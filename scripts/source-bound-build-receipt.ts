import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const SourceBoundBuildReceiptSchema = z.strictObject({
  schemaVersion: z.literal("4"),
  status: z.literal("BUILT"),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  sourceArchiveSha256: Sha256Schema,
  sourceTreeSha256: Sha256Schema,
  dockerfileSha256: Sha256Schema,
  localImageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
  localImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  localManifestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  localOciArchive: z.string().min(1),
  localOciArchiveSha256: Sha256Schema,
  adapterDockerfileSha256: Sha256Schema,
  adapterImageTag: z.string().regex(/^counterlab-adapter:git-[a-f0-9]{40}$/),
  adapterImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  adapterManifestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  adapterOciArchive: z.string().min(1),
  adapterOciArchiveSha256: Sha256Schema,
  adapterOciRevision: z.string().regex(/^[a-f0-9]{40}$/),
  adapterOciSourceTreeSha256: Sha256Schema,
  runtimeToolchainSha256: Sha256Schema,
  runtimePolicySha256: Sha256Schema,
  proofDependencyManifestSha256: Sha256Schema,
  toolchainLockSha256: Sha256Schema,
  runtimeAdapterSha256: Sha256Schema,
  buildctlSha256: Sha256Schema,
  buildkitdSha256: Sha256Schema,
  buildkitConfigSha256: Sha256Schema,
  builtAt: z.iso.datetime({ offset: true }),
});

export type SourceBoundBuildReceipt = z.infer<
  typeof SourceBoundBuildReceiptSchema
>;
