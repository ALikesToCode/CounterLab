export const AGGREGATE_TIMEOUT_QUALIFICATION_MODE: "aggregate-timeout-proof-v1";

export type ContainedRuntimeQualificationMode =
  typeof AGGREGATE_TIMEOUT_QUALIFICATION_MODE | null;

export interface ContainedRuntimeWireRequest {
  schemaVersion: "2";
  args: string[];
  qualificationMode: ContainedRuntimeQualificationMode;
  stdinBase64: string;
}

export interface ContainedRuntimeRequest {
  args: string[];
  qualificationMode: ContainedRuntimeQualificationMode;
  stdin: Buffer;
}

export function parseContainedRuntimeRequest(
  value: unknown,
): ContainedRuntimeRequest;

export function createContainedRuntimeRequest(input: {
  args: string[];
  qualificationMode: ContainedRuntimeQualificationMode;
  stdin: Buffer;
}): ContainedRuntimeWireRequest;
