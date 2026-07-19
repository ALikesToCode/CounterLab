import { z } from "zod";

import {
  ContainedRuntimeAttestationSchema,
  DeploymentReceiptSchema,
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
  ReleaseCheckReceiptSchema,
  SubjectPackAuthorityBindingSchema,
  SubjectPackEngineBindingSchema,
  SubjectPackEngineBindingsSchema,
} from "./schema.js";

export type ContainedRuntimeAttestation = z.infer<
  typeof ContainedRuntimeAttestationSchema
>;
export type DeploymentReceipt = z.infer<typeof DeploymentReceiptSchema>;

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
export type ReleaseCheckReceipt = z.infer<typeof ReleaseCheckReceiptSchema>;
