import { z } from "zod";

import {
  ContainedRuntimeAttestationSchema,
  ContainedRuntimeAttestationV1Schema,
  DeploymentReceiptSchema,
  DeploymentReceiptV3Schema,
  DeploymentReceiptV4Schema,
  ScientificEngineDescriptorSchema,
  ScientificEngineEvidenceCatalogSchema,
  ScientificEngineEvidenceKindSchema,
  ScientificEngineEvidenceRecordSchema,
  ScientificEngineRegistrySchema,
  ScientificEngineRoleSchema,
  ScientificEngineRuntimeManifestSchema,
  ScientificEngineSnapshotSchema,
  QualifiedRunnerReleaseSchema,
  QualifiedRunnerReleaseV1Schema,
  QualifiedRunnerReleaseV2Schema,
  QualifiedRunnerReleaseV3Schema,
  QualifiedRunnerReleaseV4Schema,
  ReleaseCheckReceiptSchema,
  ReleaseCheckReceiptV1Schema,
  ReleaseCheckReceiptV2Schema,
  SubjectPackAuthorityBindingSchema,
  SubjectPackEngineBindingSchema,
  SubjectPackEngineBindingsSchema,
  TimeoutCleanupReceiptSchema,
} from "./schema.js";

export type ContainedRuntimeAttestation = z.infer<
  typeof ContainedRuntimeAttestationSchema
>;
export type ContainedRuntimeAttestationV1 = z.infer<
  typeof ContainedRuntimeAttestationV1Schema
>;
export type DeploymentReceipt = z.infer<typeof DeploymentReceiptSchema>;
export type DeploymentReceiptV3 = z.infer<typeof DeploymentReceiptV3Schema>;
export type DeploymentReceiptV4 = z.infer<typeof DeploymentReceiptV4Schema>;

export type ScientificEngineRole = z.infer<typeof ScientificEngineRoleSchema>;
export type ScientificEngineDescriptor = z.infer<
  typeof ScientificEngineDescriptorSchema
>;
export type ScientificEngineEvidenceKind = z.infer<
  typeof ScientificEngineEvidenceKindSchema
>;
export type ScientificEngineEvidenceRecord = z.infer<
  typeof ScientificEngineEvidenceRecordSchema
>;
export type ScientificEngineEvidenceCatalog = z.infer<
  typeof ScientificEngineEvidenceCatalogSchema
>;
export type ScientificEngineRegistry = z.infer<
  typeof ScientificEngineRegistrySchema
>;
export type SubjectPackAuthorityBinding = z.infer<
  typeof SubjectPackAuthorityBindingSchema
>;
export type SubjectPackEngineBinding = z.infer<
  typeof SubjectPackEngineBindingSchema
>;
export type SubjectPackEngineBindings = z.infer<
  typeof SubjectPackEngineBindingsSchema
>;
export type ScientificEngineRuntimeManifest = z.infer<
  typeof ScientificEngineRuntimeManifestSchema
>;
export type ScientificEngineSnapshot = z.infer<
  typeof ScientificEngineSnapshotSchema
>;
export type QualifiedRunnerRelease = z.infer<
  typeof QualifiedRunnerReleaseSchema
>;
export type QualifiedRunnerReleaseV1 = z.infer<
  typeof QualifiedRunnerReleaseV1Schema
>;
export type QualifiedRunnerReleaseV2 = z.infer<
  typeof QualifiedRunnerReleaseV2Schema
>;
export type QualifiedRunnerReleaseV3 = z.infer<
  typeof QualifiedRunnerReleaseV3Schema
>;
export type QualifiedRunnerReleaseV4 = z.infer<
  typeof QualifiedRunnerReleaseV4Schema
>;
export type TimeoutCleanupReceipt = z.infer<typeof TimeoutCleanupReceiptSchema>;
export type ReleaseCheckReceipt = z.infer<typeof ReleaseCheckReceiptSchema>;
export type ReleaseCheckReceiptV1 = z.infer<typeof ReleaseCheckReceiptV1Schema>;
export type ReleaseCheckReceiptV2 = z.infer<typeof ReleaseCheckReceiptV2Schema>;
