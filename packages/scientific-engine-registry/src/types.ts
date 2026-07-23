import { z } from "zod";

import {
  ContainedRuntimeAttestationSchema,
  ContainedRuntimeAttestationV1Schema,
  DeploymentReceiptSchema,
  DeploymentReceiptV3Schema,
  DeploymentReceiptV4Schema,
  DeploymentReceiptV5Schema,
  DeploymentReceiptV6Schema,
  DeploymentReceiptV7Schema,
  GenerationIsolationEvidenceSchema,
  GenerationIsolationEvidenceV1Schema,
  GenerationIsolationEvidenceV2Schema,
  GenerationIsolationProbePayloadSchema,
  GenerationIsolationProbePayloadV2Schema,
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
  QualifiedRunnerReleaseV5Schema,
  QualifiedRunnerReleaseV6Schema,
  ReleaseCheckReceiptSchema,
  ReleaseCheckReceiptV1Schema,
  ReleaseCheckReceiptV2Schema,
  ReleaseCheckReceiptV3Schema,
  ReleaseCheckReceiptV4Schema,
  ReleaseCheckReceiptV5Schema,
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
export type DeploymentReceiptV5 = z.infer<typeof DeploymentReceiptV5Schema>;
export type DeploymentReceiptV6 = z.infer<typeof DeploymentReceiptV6Schema>;
export type DeploymentReceiptV7 = z.infer<typeof DeploymentReceiptV7Schema>;
export type GenerationIsolationEvidence = z.infer<
  typeof GenerationIsolationEvidenceSchema
>;
export type GenerationIsolationEvidenceV1 = z.infer<
  typeof GenerationIsolationEvidenceV1Schema
>;
export type GenerationIsolationEvidenceV2 = z.infer<
  typeof GenerationIsolationEvidenceV2Schema
>;
export type GenerationIsolationProbePayload = z.infer<
  typeof GenerationIsolationProbePayloadSchema
>;
export type GenerationIsolationProbePayloadV2 = z.infer<
  typeof GenerationIsolationProbePayloadV2Schema
>;

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
export type QualifiedRunnerReleaseV5 = z.infer<
  typeof QualifiedRunnerReleaseV5Schema
>;
export type QualifiedRunnerReleaseV6 = z.infer<
  typeof QualifiedRunnerReleaseV6Schema
>;
export type TimeoutCleanupReceipt = z.infer<typeof TimeoutCleanupReceiptSchema>;
export type ReleaseCheckReceipt = z.infer<typeof ReleaseCheckReceiptSchema>;
export type ReleaseCheckReceiptV1 = z.infer<typeof ReleaseCheckReceiptV1Schema>;
export type ReleaseCheckReceiptV2 = z.infer<typeof ReleaseCheckReceiptV2Schema>;
export type ReleaseCheckReceiptV3 = z.infer<typeof ReleaseCheckReceiptV3Schema>;
export type ReleaseCheckReceiptV4 = z.infer<typeof ReleaseCheckReceiptV4Schema>;
export type ReleaseCheckReceiptV5 = z.infer<typeof ReleaseCheckReceiptV5Schema>;
