// @vitest-environment node

import { beforeAll, describe, expect, it } from "vitest";

import {
  RunnerTokenError,
  generateRunnerJobTokenKeyPair,
  issueRunnerJobToken,
  verifyRunnerJobToken,
} from "./runner-token";

const claims = {
  schemaVersion: "2" as const,
  issuer: "counterlab-control-plane" as const,
  audience: "counterlab-runner" as const,
  purpose: "RUN_JOB" as const,
  controlPlaneOrigin: "https://counterlab.example.test",
  tokenId: "token_job_live_1",
  jobId: "job_live_1",
  sessionId: "session_live_1",
  artifactManifestHash: "a".repeat(64),
  inputBundleKey: "runner-input/job_live_1.json",
  outputPrefix: "runner-output/job_live_1/",
  callbackPath: "/api/runner/jobs/job_live_1/callback",
  stateVersion: 4,
  issuedAt: 1_784_070_000,
  expiresAt: 1_784_070_300,
};

describe("runner job tokens", () => {
  let privateKey: string;
  let publicKey: string;

  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateRunnerJobTokenKeyPair());
  });

  it("signs one bounded job grant and verifies its exact authority", async () => {
    const token = await issueRunnerJobToken(claims, privateKey);

    await expect(
      verifyRunnerJobToken(token, publicKey, {
        nowEpochSeconds: claims.issuedAt + 1,
        jobId: claims.jobId,
        purpose: "RUN_JOB",
        controlPlaneOrigin: claims.controlPlaneOrigin,
        artifactManifestHash: claims.artifactManifestHash,
        callbackPath: claims.callbackPath,
      }),
    ).resolves.toEqual(claims);
    expect(token).not.toContain(privateKey);
    await expect(issueRunnerJobToken(claims, publicKey)).rejects.toThrow(
      /private/i,
    );
  });

  it("rejects tampering, expiration, private verification keys, and cross-job reuse", async () => {
    const token = await issueRunnerJobToken(claims, privateKey);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    await expect(
      verifyRunnerJobToken(tampered, publicKey, {
        nowEpochSeconds: claims.issuedAt + 1,
        jobId: claims.jobId,
        purpose: "RUN_JOB",
      }),
    ).rejects.toBeInstanceOf(RunnerTokenError);
    await expect(
      verifyRunnerJobToken(token, publicKey, {
        nowEpochSeconds: claims.expiresAt,
        jobId: claims.jobId,
        purpose: "RUN_JOB",
      }),
    ).rejects.toThrow(/expired/i);
    await expect(
      verifyRunnerJobToken(token, publicKey, {
        nowEpochSeconds: claims.issuedAt + 1,
        jobId: "job_other",
        purpose: "RUN_JOB",
      }),
    ).rejects.toThrow(/job/i);
    await expect(
      verifyRunnerJobToken(token, publicKey, {
        nowEpochSeconds: claims.issuedAt + 1,
        jobId: claims.jobId,
        purpose: "CANCEL_JOB",
      }),
    ).rejects.toThrow(/purpose/i);
    await expect(
      verifyRunnerJobToken(token, privateKey, {
        nowEpochSeconds: claims.issuedAt + 1,
        jobId: claims.jobId,
        purpose: "RUN_JOB",
      }),
    ).rejects.toThrow(/public/i);
    await expect(issueRunnerJobToken(claims, "not-a-key")).rejects.toThrow(
      /private/i,
    );
  });
});
