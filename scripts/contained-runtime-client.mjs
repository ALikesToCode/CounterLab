#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { connect } from "node:net";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateContainedRunControlReceipt } from "./contained-runtime-run.mjs";
import {
  AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
  createContainedRuntimeRequest,
} from "./contained-runtime-request.mjs";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const argv = process.argv.slice(2);
if (argv.length < 4 || argv[0] !== "--session-id") {
  throw new Error(
    "Usage: contained-runtime-client --session-id ID [--control-receipt PATH] -- COMMAND [ARG...]",
  );
}

const sessionId = argv[1];
if (!/^rt-[a-z0-9][a-z0-9-]{7,13}$/u.test(sessionId)) {
  throw new Error("contained runtime session ID is invalid");
}
let argumentIndex = 2;
let requestedControlReceipt;
if (argv[argumentIndex] === "--control-receipt") {
  requestedControlReceipt = argv[argumentIndex + 1];
  argumentIndex += 2;
}
if (
  typeof requestedControlReceipt !== "undefined" &&
  (typeof requestedControlReceipt !== "string" ||
    requestedControlReceipt.length === 0)
) {
  throw new Error("contained runtime control receipt output is invalid");
}
if (argv[argumentIndex] !== "--" || argumentIndex + 1 >= argv.length) {
  throw new Error(
    "Usage: contained-runtime-client --session-id ID [--control-receipt PATH] -- COMMAND [ARG...]",
  );
}
const command = argv.slice(argumentIndex + 1);
let controlReceiptPath;
if (requestedControlReceipt !== undefined) {
  const releasesRoot = resolve(
    root,
    "node_modules/.cache/counterlab-v6.1/releases",
  );
  const candidate = resolve(requestedControlReceipt);
  const fromRoot = relative(root, candidate);
  const fromReleases = relative(releasesRoot, candidate);
  if (
    command[0] !== "run" ||
    !isAbsolute(requestedControlReceipt) ||
    fromRoot.startsWith("..") ||
    isAbsolute(fromRoot) ||
    fromReleases.startsWith("..") ||
    isAbsolute(fromReleases) ||
    resolve(candidate, "..") !== releasesRoot ||
    !/^timeout-control-[a-f0-9]{40}-[0-9]{1,12}\.json$/u.test(
      candidate.slice(releasesRoot.length + 1),
    ) ||
    !statSync(releasesRoot).isDirectory() ||
    realpathSync(releasesRoot) !== releasesRoot ||
    existsSync(candidate)
  ) {
    throw new Error("contained runtime control receipt output is invalid");
  }
  controlReceiptPath = candidate;
}
const socketPath = resolve(
  root,
  ".rt",
  sessionId,
  "run",
  "runtime-command.sock",
);
if (!statSync(socketPath).isSocket()) {
  throw new Error("contained runtime command socket is unavailable");
}
let stdin = Buffer.alloc(0);
if (command[0] === "login") {
  stdin = readFileSync(0);
  if (stdin.byteLength > 8_192) {
    throw new Error("contained registry credential input is too large");
  }
}

const request = `${JSON.stringify(
  createContainedRuntimeRequest({
    args: command,
    qualificationMode:
      controlReceiptPath === undefined
        ? null
        : AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
    stdin,
  }),
)}\n`;

const response = await new Promise((accept, reject) => {
  const chunks = [];
  let total = 0;
  const socket = connect(socketPath);
  socket.setTimeout(1_800_000);
  socket.on("connect", () => socket.end(request));
  socket.on("data", (chunk) => {
    total += chunk.byteLength;
    if (total > 48 * 1024 * 1024) {
      socket.destroy(
        new Error("contained runtime response exceeded its bound"),
      );
      return;
    }
    chunks.push(chunk);
  });
  socket.on("timeout", () =>
    socket.destroy(new Error("contained runtime command timed out")),
  );
  socket.on("error", reject);
  socket.on("end", () => {
    try {
      accept(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch (error) {
      reject(error);
    }
  });
});

if (
  response === null ||
  typeof response !== "object" ||
  Array.isArray(response) ||
  JSON.stringify(Object.keys(response).sort()) !==
    JSON.stringify(
      [
        "exitCode",
        "schemaVersion",
        "stderrBase64",
        "stdoutBase64",
        ...(response.runControlReceipt === undefined
          ? []
          : ["runControlReceipt"]),
      ].sort(),
    ) ||
  response.schemaVersion !== "1" ||
  !Number.isInteger(response.exitCode) ||
  typeof response.stdoutBase64 !== "string" ||
  typeof response.stderrBase64 !== "string"
) {
  throw new Error("contained runtime returned an invalid response");
}
if (response.runControlReceipt !== undefined) {
  validateContainedRunControlReceipt(response.runControlReceipt);
}
if (controlReceiptPath !== undefined) {
  if (response.runControlReceipt === undefined) {
    throw new Error("contained runtime returned no control receipt");
  }
  writeFileSync(
    controlReceiptPath,
    `${JSON.stringify(response.runControlReceipt, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
}
writeSync(1, Buffer.from(response.stdoutBase64, "base64"));
writeSync(2, Buffer.from(response.stderrBase64, "base64"));
process.exitCode = response.exitCode;
