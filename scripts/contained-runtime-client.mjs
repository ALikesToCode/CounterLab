#!/usr/bin/env node

import { readFileSync, realpathSync, statSync, writeSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const argv = process.argv.slice(2);
if (
  argv.length < 4 ||
  argv[0] !== "--session-id" ||
  argv[2] !== "--" ||
  !/^rt-[a-z0-9][a-z0-9-]{7,13}$/.test(argv[1])
) {
  throw new Error(
    "Usage: contained-runtime-client --session-id ID -- COMMAND [ARG...]",
  );
}

const sessionId = argv[1];
const command = argv.slice(3);
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

const request = `${JSON.stringify({
  schemaVersion: "1",
  args: command,
  stdinBase64: stdin.toString("base64"),
})}\n`;

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
  response.schemaVersion !== "1" ||
  !Number.isInteger(response.exitCode) ||
  typeof response.stdoutBase64 !== "string" ||
  typeof response.stderrBase64 !== "string"
) {
  throw new Error("contained runtime returned an invalid response");
}
writeSync(1, Buffer.from(response.stdoutBase64, "base64"));
writeSync(2, Buffer.from(response.stderrBase64, "base64"));
process.exitCode = response.exitCode;
