import {
  RunnerJobTokenClaimsSchema,
  type RunnerJobTokenClaims,
} from "@counterlab/contracts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TOKEN_PREFIX = "v1";
const MAX_TOKEN_BYTES = 16_384;

export class RunnerTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerTokenError";
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new RunnerTokenError("Runner token contains invalid encoding");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(
      value.replaceAll("-", "+").replaceAll("_", "/") + padding,
    );
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new RunnerTokenError("Runner token contains invalid encoding");
  }
}

async function signingKey(secret: string): Promise<CryptoKey> {
  const bytes = encoder.encode(secret);
  if (bytes.byteLength < 32) {
    throw new RunnerTokenError(
      "Runner signing key must contain at least 32 bytes",
    );
  }
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function issueRunnerJobToken(
  input: unknown,
  secret: string,
): Promise<string> {
  const claims = RunnerJobTokenClaimsSchema.parse(input);
  const encodedClaims = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signed = `${TOKEN_PREFIX}.${encodedClaims}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(signed),
  );
  return `${signed}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyRunnerJobToken(
  token: string,
  secret: string,
  expected: {
    nowEpochSeconds: number;
    jobId: string;
    artifactManifestHash?: string;
    callbackPath?: string;
  },
): Promise<RunnerJobTokenClaims> {
  if (encoder.encode(token).byteLength > MAX_TOKEN_BYTES) {
    throw new RunnerTokenError("Runner token exceeds the size limit");
  }
  const segments = token.split(".");
  if (segments.length !== 3 || segments[0] !== TOKEN_PREFIX) {
    throw new RunnerTokenError("Runner token has an invalid envelope");
  }
  const encodedClaims = segments[1];
  const encodedSignature = segments[2];
  if (encodedClaims === undefined || encodedSignature === undefined) {
    throw new RunnerTokenError("Runner token has an invalid envelope");
  }
  const signed = `${TOKEN_PREFIX}.${encodedClaims}`;
  const verified = await crypto.subtle.verify(
    "HMAC",
    await signingKey(secret),
    base64UrlDecode(encodedSignature),
    encoder.encode(signed),
  );
  if (!verified)
    throw new RunnerTokenError("Runner token signature is invalid");

  let decoded: unknown;
  try {
    decoded = JSON.parse(decoder.decode(base64UrlDecode(encodedClaims)));
  } catch (error) {
    if (error instanceof RunnerTokenError) throw error;
    throw new RunnerTokenError("Runner token claims are not valid JSON");
  }
  const parsed = RunnerJobTokenClaimsSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new RunnerTokenError("Runner token claims are invalid");
  }
  const claims = parsed.data;
  if (claims.expiresAt <= expected.nowEpochSeconds) {
    throw new RunnerTokenError("Runner token has expired");
  }
  if (claims.issuedAt > expected.nowEpochSeconds + 60) {
    throw new RunnerTokenError("Runner token issue time is in the future");
  }
  if (claims.jobId !== expected.jobId) {
    throw new RunnerTokenError("Runner token does not authorize this job");
  }
  if (
    expected.artifactManifestHash !== undefined &&
    claims.artifactManifestHash !== expected.artifactManifestHash
  ) {
    throw new RunnerTokenError(
      "Runner token does not authorize this artifact manifest",
    );
  }
  if (
    expected.callbackPath !== undefined &&
    claims.callbackPath !== expected.callbackPath
  ) {
    throw new RunnerTokenError("Runner token does not authorize this callback");
  }
  return claims;
}
