// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  RunnerTokenError,
  issueRunnerJobToken,
  verifyRunnerJobToken,
} from "./runner-token";

const claims = {
  schemaVersion: "1" as const,
  audience: "counterlab-runner" as const,
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
  it("signs one bounded job grant and verifies its exact authority", async () => {
    const secret = "test-runner-signing-key-32-bytes-minimum";
    const token = await issueRunnerJobToken(claims, secret);

    await expect(
      verifyRunnerJobToken(token, secret, {
        nowEpochSeconds: claims.issuedAt + 1,
        jobId: claims.jobId,
        artifactManifestHash: claims.artifactManifestHash,
        callbackPath: claims.callbackPath,
      }),
    ).resolves.toEqual(claims);
    expect(token).not.toContain(secret);
  });

  it("rejects tampering, expiration, weak keys, and cross-job reuse", async () => {
    const secret = "test-runner-signing-key-32-bytes-minimum";
    const token = await issueRunnerJobToken(claims, secret);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    await expect(
      verifyRunnerJobToken(tampered, secret, {
        nowEpochSeconds: claims.issuedAt + 1,
        jobId: claims.jobId,
      }),
    ).rejects.toBeInstanceOf(RunnerTokenError);
    await expect(
      verifyRunnerJobToken(token, secret, {
        nowEpochSeconds: claims.expiresAt,
        jobId: claims.jobId,
      }),
    ).rejects.toThrow(/expired/i);
    await expect(
      verifyRunnerJobToken(token, secret, {
        nowEpochSeconds: claims.issuedAt + 1,
        jobId: "job_other",
      }),
    ).rejects.toThrow(/job/i);
    await expect(issueRunnerJobToken(claims, "short-key")).rejects.toThrow(
      /32 bytes/i,
    );
  });
});
