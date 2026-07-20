import { createHash } from "node:crypto";
import { connect } from "node:net";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const sessionPattern = /^rt-[a-z0-9][a-z0-9-]{7,13}$/u;

export function canonicalSupervisorJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSupervisorJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalSupervisorJson(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256SupervisorBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactObject(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
  return value;
}

function validPid(value) {
  return Number.isSafeInteger(value) && value > 1;
}

export function parseSupervisorRequest(value, expectedSessionId) {
  const request =
    typeof value === "string" ? JSON.parse(value) : structuredClone(value);
  exactObject(request, Object.keys(request), "runtime supervisor request");
  if (
    request.schemaVersion !== "1" ||
    request.sessionId !== expectedSessionId ||
    !sessionPattern.test(request.sessionId ?? "")
  ) {
    throw new Error("runtime supervisor request identity is invalid");
  }
  if (request.action === "status" || request.action === "begin-drain") {
    exactObject(
      request,
      ["schemaVersion", "action", "sessionId", "attestationSha256"],
      "runtime supervisor request",
    );
    if (!sha256Pattern.test(request.attestationSha256 ?? "")) {
      throw new Error("runtime supervisor attestation hash is invalid");
    }
    return request;
  }
  if (request.action === "shutdown") {
    exactObject(
      request,
      [
        "schemaVersion",
        "action",
        "sessionId",
        "attestationSha256",
        "drainReceipt",
      ],
      "runtime supervisor request",
    );
    if (!sha256Pattern.test(request.attestationSha256 ?? "")) {
      throw new Error("runtime supervisor attestation hash is invalid");
    }
    return request;
  }
  throw new Error("runtime supervisor action is invalid");
}

function validateInventory(value, label, requireEmpty) {
  exactObject(value, ["count", "entriesSha256", "empty"], label);
  if (
    !Number.isSafeInteger(value.count) ||
    value.count < 0 ||
    !sha256Pattern.test(value.entriesSha256 ?? "") ||
    typeof value.empty !== "boolean" ||
    value.empty !== (value.count === 0) ||
    (requireEmpty && !value.empty)
  ) {
    throw new Error(`${label} is invalid`);
  }
}

export function validateRuntimeDrainReceipt(
  value,
  { sessionId, attestationSha256 },
) {
  const receipt = structuredClone(value);
  exactObject(
    receipt,
    [
      "schemaVersion",
      "status",
      "sessionId",
      "namespace",
      "attestationSha256",
      "tasks",
      "containers",
      "snapshots",
      "invocationAliases",
      "runcState",
      "clientFifos",
      "persistedSpecs",
      "drainedAt",
      "receiptPayloadSha256",
    ],
    "runtime drain receipt",
  );
  if (
    receipt.schemaVersion !== "2" ||
    receipt.status !== "DRAINED" ||
    receipt.sessionId !== sessionId ||
    receipt.namespace !== "counterlab-v6.1" ||
    receipt.attestationSha256 !== attestationSha256 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
      receipt.drainedAt ?? "",
    )
  ) {
    throw new Error("runtime drain receipt identity is invalid");
  }
  validateInventory(receipt.tasks, "runtime task inventory", true);
  validateInventory(receipt.containers, "runtime container inventory", true);
  validateInventory(
    receipt.invocationAliases,
    "runtime invocation-alias inventory",
    true,
  );
  validateInventory(receipt.runcState, "runtime runc-state inventory", true);
  validateInventory(receipt.clientFifos, "runtime client-FIFO inventory", true);
  exactObject(
    receipt.snapshots,
    ["count", "entriesSha256", "ownedTransientEmpty"],
    "runtime snapshot inventory",
  );
  if (
    !Number.isSafeInteger(receipt.snapshots.count) ||
    receipt.snapshots.count < 0 ||
    !sha256Pattern.test(receipt.snapshots.entriesSha256 ?? "") ||
    receipt.snapshots.ownedTransientEmpty !== true
  ) {
    throw new Error("runtime snapshot inventory is invalid");
  }
  exactObject(
    receipt.persistedSpecs,
    ["count", "entriesSha256", "verified"],
    "runtime persisted-spec inventory",
  );
  if (
    !Number.isSafeInteger(receipt.persistedSpecs.count) ||
    receipt.persistedSpecs.count < 0 ||
    !sha256Pattern.test(receipt.persistedSpecs.entriesSha256 ?? "") ||
    receipt.persistedSpecs.verified !== true
  ) {
    throw new Error("runtime persisted-spec inventory is invalid");
  }
  const { receiptPayloadSha256, ...payload } = receipt;
  if (
    !sha256Pattern.test(receiptPayloadSha256 ?? "") ||
    sha256SupervisorBytes(canonicalSupervisorJson(payload)) !==
      receiptPayloadSha256
  ) {
    throw new Error("runtime drain receipt hash is invalid");
  }
  return receipt;
}

export function validateSupervisorReadyReceipt(value, expected) {
  const receipt = structuredClone(value);
  exactObject(
    receipt,
    [
      "schemaVersion",
      "status",
      "sessionId",
      "namespace",
      "supervisorPid",
      "childPids",
      "childHandlesOwned",
      "supervisorSocket",
      "buildkitProxySocket",
      "buildkitInnerSocket",
      "createdAt",
      "receiptPayloadSha256",
    ],
    "runtime supervisor ready receipt",
  );
  exactObject(
    receipt.childPids,
    ["containerdRootlesskit", "buildkitRootlesskit"],
    "runtime supervisor child PIDs",
  );
  if (
    receipt.schemaVersion !== "1" ||
    receipt.status !== "READY" ||
    receipt.sessionId !== expected.sessionId ||
    receipt.namespace !== "counterlab-v6.1" ||
    !validPid(receipt.supervisorPid) ||
    !validPid(receipt.childPids.containerdRootlesskit) ||
    !validPid(receipt.childPids.buildkitRootlesskit) ||
    receipt.childHandlesOwned !== true ||
    receipt.supervisorSocket !== expected.supervisorSocket ||
    receipt.buildkitProxySocket !== expected.buildkitProxySocket ||
    receipt.buildkitInnerSocket !== expected.buildkitInnerSocket ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
      receipt.createdAt ?? "",
    )
  ) {
    throw new Error("runtime supervisor ready receipt is invalid");
  }
  const { receiptPayloadSha256, ...payload } = receipt;
  if (
    !sha256Pattern.test(receiptPayloadSha256 ?? "") ||
    sha256SupervisorBytes(canonicalSupervisorJson(payload)) !==
      receiptPayloadSha256
  ) {
    throw new Error("runtime supervisor ready receipt hash is invalid");
  }
  return receipt;
}

export function sendSupervisorRequest({ socketPath, request, timeoutMs }) {
  return new Promise((accept, reject) => {
    const socket = connect(socketPath);
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(timeoutMs, () =>
      fail(new Error("runtime supervisor request timed out")),
    );
    socket.once("connect", () => {
      socket.end(JSON.stringify(request));
    });
    socket.on("data", (chunk) => {
      total += chunk.byteLength;
      if (total > 128 * 1024) {
        fail(new Error("runtime supervisor response exceeded its bound"));
        return;
      }
      chunks.push(chunk);
    });
    socket.once("error", fail);
    socket.once("end", () => {
      if (settled) return;
      settled = true;
      try {
        const response = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        accept(response);
      } catch (error) {
        reject(
          new Error("runtime supervisor response is invalid", { cause: error }),
        );
      }
    });
  });
}
