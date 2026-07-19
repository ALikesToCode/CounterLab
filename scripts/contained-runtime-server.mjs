#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { executeContainedRun } from "./contained-runtime-run.mjs";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const argv = process.argv.slice(2);
if (
  argv.length !== 2 ||
  argv[0] !== "--session-id" ||
  !/^rt-[a-z0-9][a-z0-9-]{7,13}$/.test(argv[1])
) {
  throw new Error("Usage: contained-runtime-server --session-id ID");
}

const sessionId = argv[1];
const sessionRoot = resolve(root, ".rt", sessionId);
const installRoot = resolve(
  root,
  "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
);
const binRoot = resolve(installRoot, "bin");
const containerdSocket = resolve(sessionRoot, "run/containerd.sock");
const commandSocket = resolve(sessionRoot, "run/runtime-command.sock");
const clientFifoRoot = resolve(sessionRoot, "run/client-fifo");
const environment = {
  ...process.env,
  HOME: resolve(sessionRoot, "home"),
  TMPDIR: resolve(sessionRoot, "tmp"),
  XDG_CACHE_HOME: resolve(sessionRoot, "xdg-cache"),
  XDG_CONFIG_HOME: resolve(sessionRoot, "xdg-config"),
  XDG_DATA_HOME: resolve(sessionRoot, "xdg-data"),
  XDG_RUNTIME_DIR: resolve(sessionRoot, "run/inner"),
  DOCKER_CONFIG: resolve(sessionRoot, "auth"),
  BUILDKIT_HOST: `unix://${resolve(sessionRoot, "run/buildkitd.sock")}`,
  PATH: `${binRoot}:/usr/bin:/bin`,
};
delete environment.CONTAINERD_ADDRESS;
delete environment.CONTAINERD_NAMESPACE;
delete environment.CONTAINERD_SNAPSHOTTER;
delete environment.NERDCTL_TOML;
delete environment.DOCKER_HOST;
delete environment.ROOTLESSKIT_STATE_DIR;
delete environment.ROOTLESSKIT_PARENT_EUID;
delete environment.ROOTLESSKIT_PARENT_EGID;
delete environment._CONTAINERD_ROOTLESS_CHILD;

const containerd = spawn(
  resolve(binRoot, "containerd"),
  [
    "--config",
    resolve(sessionRoot, "config/containerd.toml"),
    "--address",
    containerdSocket,
    "--root",
    resolve(sessionRoot, "data/containerd"),
    "--state",
    resolve(sessionRoot, "state/containerd"),
    "--log-level",
    "info",
  ],
  {
    cwd: root,
    env: environment,
    stdio: ["ignore", "inherit", "inherit"],
  },
);

await new Promise((accept, reject) => {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    try {
      if (statSync(containerdSocket).isSocket()) {
        clearInterval(timer);
        accept();
        return;
      }
    } catch {
      // The server is still starting.
    }
    if (attempts >= 300) {
      clearInterval(timer);
      reject(new Error("contained containerd socket did not become ready"));
    }
  }, 100);
  containerd.once("exit", (code, signal) => {
    clearInterval(timer);
    reject(
      new Error(
        `contained containerd exited during startup (${String(code ?? signal)})`,
      ),
    );
  });
});

const server = createServer((socket) => {
  const chunks = [];
  let total = 0;
  socket.setTimeout(1_800_000);
  socket.on("data", (chunk) => {
    total += chunk.byteLength;
    if (total > 64 * 1024) {
      socket.destroy(new Error("contained runtime request exceeded its bound"));
      return;
    }
    chunks.push(chunk);
  });
  socket.on("timeout", () => socket.destroy());
  socket.on("error", () => undefined);
  socket.on("end", () => {
    let response;
    try {
      const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (
        request === null ||
        typeof request !== "object" ||
        request.schemaVersion !== "1" ||
        !Array.isArray(request.args) ||
        request.args.length === 0 ||
        request.args.length > 128 ||
        request.args.some(
          (argument) =>
            typeof argument !== "string" ||
            argument.length === 0 ||
            argument.length > 8_192,
        ) ||
        typeof request.stdinBase64 !== "string"
      ) {
        throw new Error("contained runtime request is invalid");
      }
      const stdin = Buffer.from(request.stdinBase64, "base64");
      if (stdin.byteLength > 8_192) {
        throw new Error("contained runtime input exceeded its bound");
      }
      const validation = spawnSync(
        process.execPath,
        [
          resolve(root, "scripts/validate-contained-runtime-command.mjs"),
          ...request.args,
        ],
        {
          cwd: root,
          env: environment,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 10_000,
        },
      );
      if (validation.status !== 0) {
        throw new Error(
          "contained runtime command failed independent validation",
        );
      }
      const result =
        request.args[0] === "run"
          ? executeContainedRun({
              args: request.args,
              binRoot,
              clientFifoRoot,
              containerdSocket,
              cwd: root,
              environment,
              installRoot,
              sessionRoot,
              stdin,
            })
          : spawnSync(
              resolve(binRoot, "nerdctl"),
              [
                "--address",
                containerdSocket,
                "--namespace",
                "counterlab-v6.1",
                "--snapshotter",
                "native",
                "--data-root",
                resolve(sessionRoot, "data/nerdctl"),
                "--cgroup-manager",
                "cgroupfs",
                "--cni-path",
                resolve(installRoot, "libexec/cni"),
                "--cni-netconfpath",
                resolve(sessionRoot, "config/cni"),
                "--hosts-dir",
                resolve(sessionRoot, "config/certs.d"),
                "--experimental=false",
                ...request.args,
              ],
              {
                cwd: root,
                env: environment,
                input: stdin,
                encoding: null,
                stdio: ["pipe", "pipe", "pipe"],
                timeout: 1_800_000,
                maxBuffer: 32 * 1024 * 1024,
              },
            );
      response = {
        schemaVersion: "1",
        exitCode: result.status ?? 1,
        stdoutBase64: Buffer.from(result.stdout ?? "").toString("base64"),
        stderrBase64: Buffer.from(result.stderr ?? "").toString("base64"),
      };
    } catch (error) {
      response = {
        schemaVersion: "1",
        exitCode: 1,
        stdoutBase64: "",
        stderrBase64: Buffer.from(
          error instanceof Error
            ? `${error.message}\n`
            : "contained runtime failure\n",
        ).toString("base64"),
      };
    }
    socket.end(JSON.stringify(response));
  });
});

await new Promise((accept, reject) => {
  server.once("error", reject);
  server.listen(commandSocket, () => {
    chmodSync(commandSocket, 0o600);
    accept();
  });
});

const shutdown = () => {
  server.close();
  containerd.kill("SIGTERM");
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
containerd.once("exit", (code) => {
  server.close(() => {
    process.exitCode = code ?? 1;
  });
});
