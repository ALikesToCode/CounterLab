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

const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function nonCanonicalSignatureAlias(token: string): string {
  const segments = token.split(".");
  const signature = segments[2];
  if (segments.length !== 3 || signature === undefined) {
    throw new Error("test token envelope is invalid");
  }
  const finalCharacter = signature.at(-1);
  if (finalCharacter === undefined) throw new Error("test signature is empty");
  const finalIndex = BASE64URL_ALPHABET.indexOf(finalCharacter);
  if (finalIndex < 0 || signature.length % 4 !== 2) {
    throw new Error("test signature is not the expected P-256 encoding");
  }
  const aliasCharacter = BASE64URL_ALPHABET[finalIndex ^ 1];
  if (aliasCharacter === undefined) throw new Error("test alias is invalid");
  segments[2] = `${signature.slice(0, -1)}${aliasCharacter}`;
  return segments.join(".");
}

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

  it("rejects a non-canonical base64url alias of a valid signature", async () => {
    const token = await issueRunnerJobToken(claims, privateKey);
    const alias = nonCanonicalSignatureAlias(token);
    expect(alias).not.toBe(token);

    await expect(
      verifyRunnerJobToken(alias, publicKey, {
        nowEpochSeconds: claims.issuedAt + 1,
        jobId: claims.jobId,
        purpose: "RUN_JOB",
      }),
    ).rejects.toThrow(/encoding/i);
  });
});
