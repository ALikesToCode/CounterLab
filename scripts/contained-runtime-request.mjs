export const AGGREGATE_TIMEOUT_QUALIFICATION_MODE =
  "aggregate-timeout-proof-v1";

const requestKeys = [
  "args",
  "qualificationMode",
  "schemaVersion",
  "stdinBase64",
];

function validateArguments(value) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 128 ||
    value.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.length === 0 ||
        argument.length > 8_192,
    )
  ) {
    throw new Error("contained runtime request argument is invalid");
  }
}

function validateQualificationMode(value, args) {
  if (value !== null && value !== AGGREGATE_TIMEOUT_QUALIFICATION_MODE) {
    throw new Error("contained runtime request qualification mode is invalid");
  }
  if (value !== null && args[0] !== "run") {
    throw new Error("contained runtime qualification requires a run command");
  }
}

export function parseContainedRuntimeRequest(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...requestKeys].sort()) ||
    value.schemaVersion !== "2"
  ) {
    throw new Error("contained runtime request shape is invalid");
  }
  validateArguments(value.args);
  validateQualificationMode(value.qualificationMode, value.args);
  if (typeof value.stdinBase64 !== "string") {
    throw new Error("contained runtime request input is invalid");
  }
  const stdin = Buffer.from(value.stdinBase64, "base64");
  if (
    stdin.byteLength > 8_192 ||
    stdin.toString("base64") !== value.stdinBase64
  ) {
    throw new Error("contained runtime request input is invalid");
  }
  return {
    args: [...value.args],
    qualificationMode: value.qualificationMode,
    stdin,
  };
}

export function createContainedRuntimeRequest({
  args,
  qualificationMode,
  stdin,
}) {
  if (!Buffer.isBuffer(stdin)) {
    throw new Error("contained runtime request input is invalid");
  }
  const request = {
    schemaVersion: "2",
    args: Array.isArray(args) ? [...args] : args,
    qualificationMode,
    stdinBase64: stdin.toString("base64"),
  };
  parseContainedRuntimeRequest(request);
  return request;
}
