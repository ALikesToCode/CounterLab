#!/usr/bin/env node

import { readFile } from "node:fs/promises";

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function publicFromPrivate(encodedPrivateKey) {
  const key = decode(encodedPrivateKey.trim());
  if (
    key?.kty !== "EC" ||
    key?.crv !== "P-256" ||
    typeof key.x !== "string" ||
    typeof key.y !== "string" ||
    typeof key.d !== "string"
  ) {
    throw new Error("Expected an encoded CounterLab P-256 private key");
  }
  return encode({ kty: "EC", crv: "P-256", x: key.x, y: key.y });
}

async function generate() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const [privateKey, publicKey] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.privateKey),
    crypto.subtle.exportKey("jwk", pair.publicKey),
  ]);
  return {
    privateKey: encode({
      kty: "EC",
      crv: "P-256",
      x: privateKey.x,
      y: privateKey.y,
      d: privateKey.d,
    }),
    publicKey: encode({
      kty: "EC",
      crv: "P-256",
      x: publicKey.x,
      y: publicKey.y,
    }),
  };
}

const command = process.argv[2] ?? "--json";
if (command === "--derive-public") {
  process.stdout.write(
    `${publicFromPrivate(await readFile("/dev/stdin", "utf8"))}\n`,
  );
} else {
  const pair = await generate();
  if (command === "--tsv") {
    process.stdout.write(`${pair.privateKey}\t${pair.publicKey}\n`);
  } else if (command === "--private") {
    process.stdout.write(`${pair.privateKey}\n`);
  } else if (command === "--json") {
    process.stdout.write(`${JSON.stringify(pair)}\n`);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}
