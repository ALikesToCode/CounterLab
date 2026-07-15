import {
  RunnerJobTokenClaimsSchema,
  type RunnerJobTokenClaims,
} from "@counterlab/contracts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TOKEN_PREFIX = "v2";
const MAX_TOKEN_BYTES = 16_384;
const EC_VALUE = /^[A-Za-z0-9_-]+$/u;

type RunnerPrivateJwk = {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  d: string;
};

type RunnerPublicJwk = Omit<RunnerPrivateJwk, "d">;

export type RunnerJobTokenKeyPair = {
  privateKey: string;
  publicKey: string;
};

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

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  if (!EC_VALUE.test(value)) {
    throw new RunnerTokenError("Runner token contains invalid encoding");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(
      value.replaceAll("-", "+").replaceAll("_", "/") + padding,
    );
    return new Uint8Array(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer,
    );
  } catch {
    throw new RunnerTokenError("Runner token contains invalid encoding");
  }
}

function normalizedPublicJwk(value: unknown): RunnerPublicJwk {
  if (
    typeof value !== "object" ||
    value === null ||
    !("kty" in value) ||
    value.kty !== "EC" ||
    !("crv" in value) ||
    value.crv !== "P-256" ||
    !("x" in value) ||
    typeof value.x !== "string" ||
    !EC_VALUE.test(value.x) ||
    !("y" in value) ||
    typeof value.y !== "string" ||
    !EC_VALUE.test(value.y)
  ) {
    throw new RunnerTokenError(
      "Runner verifying public key must be an encoded P-256 key",
    );
  }
  return { kty: "EC", crv: "P-256", x: value.x, y: value.y };
}

function normalizedPrivateJwk(value: unknown): RunnerPrivateJwk {
  const publicKey = normalizedPublicJwk(value);
  if (
    typeof value !== "object" ||
    value === null ||
    !("d" in value) ||
    typeof value.d !== "string" ||
    !EC_VALUE.test(value.d)
  ) {
    throw new RunnerTokenError(
      "Runner signing private key must be an encoded P-256 key",
    );
  }
  return { ...publicKey, d: value.d };
}

function decodeKey(value: string, kind: "private" | "public"): unknown {
  try {
    return JSON.parse(decoder.decode(base64UrlDecode(value))) as unknown;
  } catch (error) {
    if (error instanceof RunnerTokenError) {
      throw new RunnerTokenError(
        `Runner ${kind} key must use valid base64url JSON encoding`,
      );
    }
    throw new RunnerTokenError(`Runner ${kind} key is not valid JSON`);
  }
}

function encodeKey(value: RunnerPrivateJwk | RunnerPublicJwk): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(value)));
}

function privateJwk(encoded: string): RunnerPrivateJwk {
  return normalizedPrivateJwk(decodeKey(encoded, "private"));
}

function publicJwk(encoded: string): RunnerPublicJwk {
  const decoded = decodeKey(encoded, "public");
  if (typeof decoded === "object" && decoded !== null && "d" in decoded) {
    throw new RunnerTokenError(
      "Runner verification requires a public key without private material",
    );
  }
  return normalizedPublicJwk(decoded);
}

async function signingKey(encoded: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      "jwk",
      {
        ...privateJwk(encoded),
        alg: "ES256",
        ext: false,
        key_ops: ["sign"],
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    if (error instanceof RunnerTokenError) throw error;
    throw new RunnerTokenError("Runner signing private key is invalid");
  }
}

async function verifyingKey(encoded: string): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey(
      "jwk",
      {
        ...publicJwk(encoded),
        alg: "ES256",
        ext: false,
        key_ops: ["verify"],
      },
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } catch (error) {
    if (error instanceof RunnerTokenError) throw error;
    throw new RunnerTokenError("Runner verifying public key is invalid");
  }
}

export async function generateRunnerJobTokenKeyPair(): Promise<RunnerJobTokenKeyPair> {
  const generated = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.exportKey("jwk", generated.privateKey),
    crypto.subtle.exportKey("jwk", generated.publicKey),
  ]);
  return {
    privateKey: encodeKey(normalizedPrivateJwk(privateKey)),
    publicKey: encodeKey(normalizedPublicJwk(publicKey)),
  };
}

export function deriveRunnerJobTokenPublicKey(privateKey: string): string {
  const { d: _privateScalar, ...publicKey } = privateJwk(privateKey);
  return encodeKey(publicKey);
}

export async function issueRunnerJobToken(
  input: unknown,
  privateKey: string,
): Promise<string> {
  const claims = RunnerJobTokenClaimsSchema.parse(input);
  const encodedClaims = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signed = `${TOKEN_PREFIX}.${encodedClaims}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await signingKey(privateKey),
    encoder.encode(signed),
  );
  return `${signed}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyRunnerJobToken(
  token: string,
  publicKey: string,
  expected: {
    nowEpochSeconds: number;
    jobId: string;
    purpose: RunnerJobTokenClaims["purpose"];
    controlPlaneOrigin?: string;
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
    { name: "ECDSA", hash: "SHA-256" },
    await verifyingKey(publicKey),
    base64UrlDecode(encodedSignature),
    encoder.encode(signed),
  );
  if (!verified) {
    throw new RunnerTokenError("Runner token signature is invalid");
  }

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
  if (claims.purpose !== expected.purpose) {
    throw new RunnerTokenError("Runner token does not authorize this purpose");
  }
  if (
    expected.controlPlaneOrigin !== undefined &&
    claims.controlPlaneOrigin !== expected.controlPlaneOrigin
  ) {
    throw new RunnerTokenError(
      "Runner token does not authorize this control plane origin",
    );
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
