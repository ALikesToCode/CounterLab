import { describe, expect, it } from "vitest";

import {
  isPathContained,
  PRIVSEP_PROTOCOL_VERSION,
  PrivsepProbePayloadSchema,
  PrivsepRequestSchema,
} from "./privsep-protocol.js";

describe("privilege-separation protocol", () => {
  it("accepts only the pinned App Server command shape", () => {
    const request = {
      protocolVersion: PRIVSEP_PROTOCOL_VERSION,
      requestId: "5fa4d3f1-62ee-43f4-8a39-9022738ece04",
      operation: "prepare",
      workspace: "/work/jobs/job_1",
      appServerArgs: ["app-server", "--stdio"],
    };
    expect(PrivsepRequestSchema.parse(request)).toEqual(request);
    for (const mutation of [
      { ...request, workspace: "../../repo" },
      { ...request, appServerArgs: ["exec", "sh"] },
      { ...request, environment: { OPENAI_API_KEY: "forbidden" } },
      { ...request, executable: "/bin/sh" },
    ]) {
      expect(() => PrivsepRequestSchema.parse(mutation)).toThrow();
    }
  });

  it("rejects incomplete process-identity proof", () => {
    const proof = {
      brokerUid: 0,
      brokerGid: 0,
      runnerUid: 10_001,
      runnerGid: 10_001,
      generatorUid: 10_002,
      generatorGid: 10_002,
      generatorSupplementaryGroupsCleared: true,
      generatorCapabilitiesEmpty: true,
      generatorNoNewPrivileges: true,
      protectedPathsUnreadable: true,
      protectedPathsUnwritable: true,
      parentEnvironmentUnreadable: true,
      brokerEnvironmentUnreadable: true,
      workspaceVisible: true,
      workspaceWritable: true,
      outsideWorkspaceWritesDenied: true,
      fixedKernelUnavailable: true,
      credentialReadOnlyDuringInitialization: true,
      credentialRevocationSupported: true,
      boundedLaunchesEnforced: true,
      maximumLaunches: 3,
    } as const;
    expect(PrivsepProbePayloadSchema.parse(proof)).toEqual(proof);
    expect(() =>
      PrivsepProbePayloadSchema.parse({
        ...proof,
        generatorCapabilitiesEmpty: false,
      }),
    ).toThrow();
    expect(() =>
      PrivsepProbePayloadSchema.parse({
        ...proof,
        generatorGid: 10_001,
      }),
    ).toThrow();
  });

  it("contains only direct descendants of the fixed root", () => {
    expect(isPathContained("/work/jobs", "/work/jobs/job_1")).toBe(true);
    expect(isPathContained("/work/jobs", "/work/jobs")).toBe(false);
    expect(isPathContained("/work/jobs", "/work/jobs/../repo")).toBe(false);
    expect(isPathContained("/work/jobs", "/repo")).toBe(false);
  });
});
