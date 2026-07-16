import { stat, readFile } from "node:fs/promises";

import { canonicalJsonV1 } from "@counterlab/contracts";

import {
  validateProofCapsulePayloadAuthorityV2,
  validateProofCapsuleV2,
  type ValidatedProofCapsuleV2,
} from "./index.js";

const MAX_CAPSULE_BYTES = 16_777_216;

export type ProofCapsuleCliIO = {
  readBytes(path: string): Promise<Uint8Array>;
  stdout(value: string): void;
  stderr(value: string): void;
  env: Readonly<Record<string, string | undefined>>;
};

type ProofCapsuleCommand = "validate" | "inspect" | "replay";

type ParsedArguments = {
  command: ProofCapsuleCommand;
  path: string;
  requireSigned: boolean;
};

const usage =
  "Usage: proof-capsule <validate|inspect|replay> [--require-signed] <file.counterlab>";

const defaultIO: ProofCapsuleCliIO = {
  async readBytes(path) {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size > MAX_CAPSULE_BYTES) {
      throw new Error("Proof Capsule file is outside the release size limit");
    }
    return new Uint8Array(await readFile(path));
  },
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
  env: process.env,
};

function parseArguments(args: readonly string[]): ParsedArguments | undefined {
  const requireSigned = args.includes("--require-signed");
  const positional = args.filter((argument) => argument !== "--require-signed");
  if (
    positional.length !== 2 ||
    !["validate", "inspect", "replay"].includes(positional[0] ?? "") ||
    (requireSigned &&
      args.filter((argument) => argument === "--require-signed").length !==
        1) ||
    args.some(
      (argument) =>
        argument.startsWith("--") && argument !== "--require-signed",
    )
  ) {
    return undefined;
  }
  return {
    command: positional[0] as ProofCapsuleCommand,
    path: positional[1]!,
    requireSigned,
  };
}

function signingKeyFor(
  validated: ValidatedProofCapsuleV2,
  io: ProofCapsuleCliIO,
): {
  capsuleSigningKeys?: Readonly<Record<string, string>>;
  boundarySigningKeys?: Readonly<Record<string, string>>;
} {
  const capsuleIntegrity = validated.envelope.integrity;
  const boundaryIntegrity =
    validated.manifest.authority.boundary.receipt.integrity;
  const signingKey = io.env.COUNTERLAB_SIGNING_KEY;
  const configuredKeyId = io.env.COUNTERLAB_SIGNING_KEY_ID?.trim();
  const signedKeyIds = [
    ...(capsuleIntegrity.mode === "hmac-signed"
      ? [capsuleIntegrity.keyId]
      : []),
    ...(boundaryIntegrity.mode === "hmac-signed"
      ? [boundaryIntegrity.keyId]
      : []),
  ];
  if (
    signedKeyIds.length > 0 &&
    (signingKey === undefined || signingKey.length === 0)
  ) {
    throw new Error("A signing key is required for this Proof Capsule");
  }
  if (
    configuredKeyId !== undefined &&
    configuredKeyId.length > 0 &&
    signedKeyIds.some((keyId) => keyId !== configuredKeyId)
  ) {
    throw new Error(
      "The configured signing key ID does not match the Proof Capsule",
    );
  }
  return {
    ...(capsuleIntegrity.mode === "hmac-signed" && signingKey !== undefined
      ? { capsuleSigningKeys: { [capsuleIntegrity.keyId]: signingKey } }
      : {}),
    ...(boundaryIntegrity.mode === "hmac-signed" && signingKey !== undefined
      ? { boundarySigningKeys: { [boundaryIntegrity.keyId]: signingKey } }
      : {}),
  };
}

async function validateAll(
  bytes: Uint8Array,
  requireSigned: boolean,
  io: ProofCapsuleCliIO,
) {
  let declaredCapsuleKeyId: string | undefined;
  try {
    const envelope = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    ) as { integrity?: { mode?: unknown; keyId?: unknown } };
    if (
      envelope.integrity?.mode === "hmac-signed" &&
      typeof envelope.integrity.keyId === "string"
    ) {
      declaredCapsuleKeyId = envelope.integrity.keyId;
    }
  } catch {
    declaredCapsuleKeyId = undefined;
  }
  const candidateSigningKey = io.env.COUNTERLAB_SIGNING_KEY;
  const unsignedInspection = validateProofCapsuleV2(bytes, {
    ...(requireSigned ? { expectedIntegrityMode: "hmac-signed" } : {}),
    ...(declaredCapsuleKeyId !== undefined &&
    candidateSigningKey !== undefined &&
    candidateSigningKey.trim().length > 0
      ? {
          signingKeys: {
            [declaredCapsuleKeyId]: candidateSigningKey,
          },
        }
      : {}),
  });
  const signing = signingKeyFor(unsignedInspection, io);
  const validated = validateProofCapsuleV2(bytes, {
    ...(requireSigned ? { expectedIntegrityMode: "hmac-signed" } : {}),
    ...(signing.capsuleSigningKeys === undefined
      ? {}
      : { signingKeys: signing.capsuleSigningKeys }),
  });
  const authority = await validateProofCapsulePayloadAuthorityV2(validated, {
    ...(signing.boundarySigningKeys === undefined
      ? {}
      : { boundarySigningKeys: signing.boundarySigningKeys }),
  });
  return { validated, authority };
}

function parseJsonlEntry(
  capsule: ValidatedProofCapsuleV2,
  path: "compiler-events.jsonl" | "event-chain.jsonl",
): unknown[] {
  const entry = capsule.envelope.entries.find(
    (candidate) => candidate.path === path,
  );
  if (entry === undefined)
    throw new Error(`Proof Capsule entry is missing: ${path}`);
  return entry.content
    .slice(0, -1)
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}

function commandOutput(
  command: ProofCapsuleCommand,
  validated: ValidatedProofCapsuleV2,
  authority: Awaited<ReturnType<typeof validateProofCapsulePayloadAuthorityV2>>,
): unknown {
  const common = {
    valid: true as const,
    capsuleId: validated.manifest.capsuleId,
    sessionId: validated.manifest.sessionId,
    concept: validated.manifest.concept,
    sourceMode: validated.manifest.mode,
    integrityMode: validated.envelope.integrity.mode,
    rootHash: validated.reference.rootHash,
    bytesHash: validated.reference.bytesHash,
    resultHash: authority.resultHash,
    patchResultHash: authority.patchResultHash,
  };
  if (command === "validate") return common;
  if (command === "inspect") {
    return {
      ...common,
      createdAt: validated.manifest.createdAt,
      canonicalProfile: validated.manifest.canonicalProfile,
      limitations: validated.manifest.limitations,
      authority: validated.manifest.authority,
      entries: validated.manifest.entries,
    };
  }
  return {
    ...common,
    playbackMode: "verified_capsule_replay" as const,
    evidenceEvents: parseJsonlEntry(validated, "event-chain.jsonl"),
    compilerEvents: parseJsonlEntry(validated, "compiler-events.jsonl"),
  };
}

export async function runProofCapsuleCli(
  args: readonly string[],
  io: ProofCapsuleCliIO = defaultIO,
): Promise<number> {
  const parsed = parseArguments(args);
  if (parsed === undefined) {
    io.stderr(`${usage}\n`);
    return 2;
  }
  let bytes: Uint8Array;
  try {
    bytes = await io.readBytes(parsed.path);
  } catch {
    io.stderr("Unable to read the Proof Capsule file.\n");
    return 1;
  }
  try {
    const { validated, authority } = await validateAll(
      bytes,
      parsed.requireSigned,
      io,
    );
    io.stdout(
      `${canonicalJsonV1(commandOutput(parsed.command, validated, authority))}\n`,
    );
    return 0;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Proof Capsule validation failed";
    io.stderr(`${message.replace(/[\r\n]+/gu, " ")}\n`);
    return 1;
  }
}
