#!/usr/bin/env node

import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const args = process.argv.slice(2);
const hostedImage = /^counterlab-runner:git-[a-f0-9]{40}$/;
const adapterImage = /^counterlab-adapter:git-[a-f0-9]{40}$/;
const registryImage =
  /^registry\.cloudflare\.com\/[A-Za-z0-9_-]{3,64}\/counterlab-runner:git-[a-f0-9]{40}$/;
const containerName =
  /^counterlab-(?:[a-f0-9]{20}|(?:startup|runtime|reachability)-[A-Za-z0-9-]{1,80})$/;
const inspectFormats = new Set([
  "{{.Id}}",
  "{{.Config.User}}",
  '{{index .Config.Labels "org.opencontainers.image.revision"}}',
  '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}',
]);

function fail(message) {
  throw new Error(`contained runtime command rejected: ${message}`);
}

function isContained(candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

function containsPath(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return (
    fromParent === "" ||
    (!fromParent.startsWith("..") && !isAbsolute(fromParent))
  );
}

function pathsOverlap(left, right) {
  return containsPath(left, right) || containsPath(right, left);
}

function repositoryFile(requested, label, expectedKind = "any") {
  if (typeof requested !== "string" || requested.length === 0) {
    fail(`${label} is missing`);
  }
  const candidate = resolve(root, requested);
  if (!isContained(candidate)) fail(`${label} escaped the repository`);
  if (lstatSync(candidate).isSymbolicLink()) fail(`${label} is a symlink`);
  const physical = realpathSync(candidate);
  if (!isContained(physical)) fail(`${label} resolved outside the repository`);
  const metadata = statSync(physical);
  if (expectedKind === "file" && !metadata.isFile())
    fail(`${label} is not a file`);
  if (expectedKind === "directory" && !metadata.isDirectory()) {
    fail(`${label} is not a directory`);
  }
  return physical;
}

function expectLocalImage(value, label = "local image") {
  if (!hostedImage.test(value ?? "") && !adapterImage.test(value ?? "")) {
    fail(`${label} is not source-bound`);
  }
}

function expectHostedImage(value, label = "hosted runner image") {
  if (!hostedImage.test(value ?? "")) fail(`${label} is not source-bound`);
}

function expectAdapterImage(value, label = "adapter image") {
  if (!adapterImage.test(value ?? "")) fail(`${label} is not source-bound`);
}

function expectRegistryImage(value, label = "registry image") {
  if (!registryImage.test(value ?? "")) fail(`${label} is not source-bound`);
}

function optionValue(argument, next, name) {
  if (argument === name) {
    if (next === undefined) fail(`${name} requires a value`);
    return { value: next, consumed: 2 };
  }
  const prefix = `${name}=`;
  if (argument.startsWith(prefix)) {
    const value = argument.slice(prefix.length);
    if (value.length === 0) fail(`${name} requires a value`);
    return { value, consumed: 1 };
  }
  return undefined;
}

function validateMount(value) {
  const entries = value.split(",").map((part) => part.split("=", 2));
  const allowedKeys = new Set([
    "type",
    "src",
    "source",
    "dst",
    "destination",
    "readonly",
  ]);
  if (
    entries.some(([key]) => !allowedKeys.has(key)) ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  ) {
    fail("bind mount contains unsupported or duplicate fields");
  }
  const fields = new Map(entries);
  const source = fields.get("src") ?? fields.get("source");
  const destination = fields.get("dst") ?? fields.get("destination");
  if (
    fields.get("type") !== "bind" ||
    source === undefined ||
    destination === undefined ||
    (fields.has("src") && fields.has("source")) ||
    (fields.has("dst") && fields.has("destination")) ||
    (fields.has("readonly") && fields.get("readonly") !== undefined)
  ) {
    fail("bind mount shape is invalid");
  }
  return {
    source: repositoryFile(source, "bind mount source"),
    destination,
    readonly: fields.has("readonly"),
  };
}

function validateVolume(value) {
  const separator = value.indexOf(":");
  if (separator <= 0) fail("volume source is missing");
  const source = value.slice(0, separator);
  const remainder = value.slice(separator + 1);
  const modeSeparator = remainder.indexOf(":");
  const destination =
    modeSeparator === -1 ? remainder : remainder.slice(0, modeSeparator);
  const mode = modeSeparator === -1 ? "" : remainder.slice(modeSeparator + 1);
  if (!destination.startsWith("/") || !["", "ro"].includes(mode)) {
    fail("volume destination or mode is invalid");
  }
  return {
    source: repositoryFile(source, "volume source"),
    destination,
    mode,
  };
}

function sameValues(actual, expected) {
  return (
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

function rlimitMap(values) {
  if (values.length !== 4) fail("exactly four process rlimits are required");
  const parsed = new Map();
  for (const value of values) {
    const match = value.match(/^(as|cpu|fsize|nofile)=(\d+):(\d+)$/);
    if (
      match === null ||
      match[2] !== match[3] ||
      parsed.has(match[1]) ||
      !Number.isSafeInteger(Number(match[2]))
    ) {
      fail("process rlimit set is invalid");
    }
    parsed.set(match[1], Number(match[2]));
  }
  if (parsed.size !== 4) fail("process rlimit set is incomplete");
  return parsed;
}

function expectOptionShape(options, expected) {
  const observed = Object.fromEntries(
    [...options.entries()].map(([name, values]) => [name, values.length]),
  );
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    fail("run option shape is not approved");
  }
}

function boundedNumber(value, pattern, minimum, maximum, label) {
  if (!pattern.test(value ?? "")) fail(`${label} is invalid`);
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    fail(`${label} is outside the approved bound`);
  }
  return parsed;
}

function validateRun(runArgs) {
  let index = 0;
  let image;
  let name;
  let network;
  let readOnly = false;
  let entrypoint;
  const environment = [];
  const mounts = [];
  const volumes = [];
  const command = [];
  const options = new Map();
  const flags = new Set();
  const valueOptions = new Set([
    "--name",
    "--network",
    "--tmpfs",
    "-e",
    "--env",
    "--user",
    "-v",
    "--volume",
    "--entrypoint",
    "--mount",
    "--security-opt",
    "--pids-limit",
    "--memory",
    "--memory-swap",
    "--cpus",
    "--ulimit",
    "--workdir",
  ]);
  const flagOptions = new Set([
    "--rm",
    "--read-only",
    "--pull=never",
    "--cap-drop=ALL",
    "--ipc=private",
  ]);

  while (index < runArgs.length) {
    const argument = runArgs[index];
    if (image !== undefined) {
      command.push(argument);
      index += 1;
      continue;
    }
    if (!argument.startsWith("-")) {
      image = argument;
      index += 1;
      continue;
    }
    if (flagOptions.has(argument)) {
      if (flags.has(argument)) fail(`duplicate run flag: ${argument}`);
      flags.add(argument);
      if (argument === "--read-only") readOnly = true;
      index += 1;
      continue;
    }

    let matched = false;
    for (const option of valueOptions) {
      const parsed = optionValue(argument, runArgs[index + 1], option);
      if (parsed === undefined) continue;
      matched = true;
      const { value } = parsed;
      const canonicalOption =
        option === "-e" ? "--env" : option === "-v" ? "--volume" : option;
      const optionValues = options.get(canonicalOption) ?? [];
      optionValues.push(value);
      options.set(canonicalOption, optionValues);
      if (option === "--name") name = value;
      if (option === "--network") network = value;
      if (option === "--entrypoint") entrypoint = value;
      if (option === "--mount") mounts.push(validateMount(value));
      if (option === "-v" || option === "--volume") {
        volumes.push(validateVolume(value));
      }
      if (option === "-e" || option === "--env") environment.push(value);
      if (
        option === "--tmpfs" &&
        !/^\/(?:tmp|counterlab-runtime):/.test(value)
      ) {
        fail("tmpfs destination is not approved");
      }
      if (option === "--user" && !/^\d{1,6}:\d{1,6}$/.test(value)) {
        fail("container user is invalid");
      }
      index += parsed.consumed;
      break;
    }
    if (!matched) fail(`unsupported run option: ${argument}`);
  }

  if (image === undefined) fail("run image is missing");
  if (name === undefined || !containerName.test(name))
    fail("container name is not approved");
  if (network !== "none") fail("containers must use network=none");
  if (!readOnly) fail("containers must use a read-only root filesystem");
  if (entrypoint !== undefined && entrypoint !== "python") {
    fail("container entrypoint is not approved");
  }

  const requestedUser = options.get("--user")?.[0];
  if (requestedUser !== undefined) {
    const match = requestedUser.match(/^(\d{1,6}):(\d{1,6})$/);
    if (
      match === null ||
      Number.parseInt(match[1], 10) === 0 ||
      Number.parseInt(match[2], 10) === 0
    ) {
      fail("container user and group must both be non-root");
    }
  }

  if (name.startsWith("counterlab-startup-")) {
    expectHostedImage(image);
    expectOptionShape(options, {
      "--name": 1,
      "--network": 1,
      "--security-opt": 1,
      "--pids-limit": 1,
      "--memory": 1,
      "--memory-swap": 1,
      "--cpus": 1,
      "--ulimit": 4,
      "--tmpfs": 1,
      "--env": 4,
    });
    if (
      command.length !== 0 ||
      !sameValues(environment, [
        "TMPDIR=/counterlab-runtime",
        "COUNTERLAB_RUNNER_STARTUP_PROBE=1",
        "COUNTERLAB_RUNNER_WORK_ROOT=/counterlab-runtime/jobs",
        "COUNTERLAB_CODEX_HOME_ROOT=/counterlab-runtime/codex",
      ]) ||
      options.get("--tmpfs")?.[0] !==
        "/counterlab-runtime:rw,noexec,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=0700" ||
      options.get("--security-opt")?.[0] !== "no-new-privileges=true" ||
      options.get("--pids-limit")?.[0] !== "32" ||
      options.get("--memory")?.[0] !== "4096m" ||
      options.get("--memory-swap")?.[0] !== "4096m" ||
      options.get("--cpus")?.[0] !== "2.0" ||
      !sameValues(options.get("--ulimit") ?? [], [
        "cpu=300:300",
        "as=8589934592:8589934592",
        "fsize=1048576:1048576",
        "nofile=64:64",
      ]) ||
      !sameValues(flags, [
        "--rm",
        "--read-only",
        "--pull=never",
        "--cap-drop=ALL",
        "--ipc=private",
      ])
    ) {
      fail("startup probe profile is incomplete");
    }
  } else if (name.startsWith("counterlab-runtime-")) {
    expectHostedImage(image);
    expectOptionShape(options, {
      "--name": 1,
      "--user": 1,
      "--network": 1,
      "--security-opt": 1,
      "--pids-limit": 1,
      "--memory": 1,
      "--memory-swap": 1,
      "--cpus": 1,
      "--ulimit": 4,
      "--tmpfs": 1,
      "--env": 1,
      "--mount": 3,
      "--workdir": 1,
      "--entrypoint": 1,
    });
    const uid = requestedUser?.split(":")[0];
    const gid = requestedUser?.split(":")[1];
    const byDestination = new Map(
      mounts.map((mount) => [mount.destination, mount]),
    );
    const scientificScript = byDestination.get(
      "/repo/scripts/verify_scientific_runtime.py",
    );
    const runnerLock = byDestination.get("/repo/requirements.runner.lock.txt");
    const engineEvidence = byDestination.get("/repo/scientific-engines");
    if (
      entrypoint !== "python" ||
      !sameValues(flags, [
        "--rm",
        "--read-only",
        "--pull=never",
        "--cap-drop=ALL",
        "--ipc=private",
      ]) ||
      options.get("--security-opt")?.[0] !== "no-new-privileges=true" ||
      options.get("--pids-limit")?.[0] !== "32" ||
      options.get("--memory")?.[0] !== "1024m" ||
      options.get("--memory-swap")?.[0] !== "1024m" ||
      options.get("--cpus")?.[0] !== "2.0" ||
      !sameValues(options.get("--ulimit") ?? [], [
        "cpu=300:300",
        "as=8589934592:8589934592",
        "fsize=1048576:1048576",
        "nofile=64:64",
      ]) ||
      options.get("--tmpfs")?.[0] !==
        `/counterlab-runtime:rw,noexec,nosuid,nodev,size=64m,uid=${uid},gid=${gid},mode=0700` ||
      !sameValues(environment, ["TMPDIR=/counterlab-runtime"]) ||
      volumes.length !== 0 ||
      byDestination.size !== 3 ||
      scientificScript?.source !==
        repositoryFile(
          "scripts/verify_scientific_runtime.py",
          "scientific runtime verifier",
          "file",
        ) ||
      !scientificScript.readonly ||
      runnerLock?.source !==
        repositoryFile(
          "requirements.runner.lock.txt",
          "runner dependency lock",
          "file",
        ) ||
      !runnerLock.readonly ||
      engineEvidence?.source !==
        repositoryFile(
          "scientific-engines",
          "scientific engine evidence",
          "directory",
        ) ||
      !engineEvidence.readonly ||
      options.get("--workdir")?.[0] !== "/repo" ||
      command[0] !== "/repo/scripts/verify_scientific_runtime.py" ||
      command[1] !== "--root" ||
      command[2] !== "/repo" ||
      command[3] !== "--image-digest" ||
      !/^sha256:[a-f0-9]{64}$/.test(command[4] ?? "") ||
      command[5] !== "--source-commit" ||
      !/^[a-f0-9]{40}$/.test(command[6] ?? "") ||
      command[6] !== image.slice("counterlab-runner:git-".length) ||
      command.length !== 7
    ) {
      fail("scientific runtime verification profile is invalid");
    }
  } else if (name.startsWith("counterlab-reachability-")) {
    expectHostedImage(image);
    expectOptionShape(options, {
      "--name": 1,
      "--network": 1,
      "--user": 1,
      "--security-opt": 1,
      "--pids-limit": 1,
      "--memory": 1,
      "--memory-swap": 1,
      "--cpus": 1,
      "--ulimit": 4,
      "--tmpfs": 1,
      "--env": 1,
      "--mount": 4,
      "--workdir": 1,
      "--entrypoint": 1,
    });
    const uid = requestedUser?.split(":")[0];
    const gid = requestedUser?.split(":")[1];
    const byDestination = new Map(
      mounts.map((mount) => [mount.destination, mount]),
    );
    const reachabilityScript = byDestination.get(
      "/repo/scripts/probe_cpython_htmlparser_reachability.py",
    );
    const publicFixtures = byDestination.get("/repo/fixtures/public");
    const notebookFixtures = byDestination.get("/repo/fixtures/notebooks");
    const review = byDestination.get("/repo/reachability-review.json");
    const reviewRelativePath =
      review === undefined ? "" : relative(root, review.source);
    const reviewMatch = reviewRelativePath.match(
      /^node_modules\/\.cache\/counterlab-v6\.1\/scientific-evidence-([a-f0-9]{40})-\d{8}T\d{6}Z-\d+\/reachability-review\.json$/,
    );
    if (
      entrypoint !== "python" ||
      !sameValues(flags, [
        "--rm",
        "--read-only",
        "--pull=never",
        "--cap-drop=ALL",
        "--ipc=private",
      ]) ||
      options.get("--security-opt")?.[0] !== "no-new-privileges=true" ||
      options.get("--pids-limit")?.[0] !== "32" ||
      options.get("--memory")?.[0] !== "1024m" ||
      options.get("--memory-swap")?.[0] !== "1024m" ||
      options.get("--cpus")?.[0] !== "2.0" ||
      !sameValues(options.get("--ulimit") ?? [], [
        "cpu=300:300",
        "as=8589934592:8589934592",
        "fsize=1048576:1048576",
        "nofile=64:64",
      ]) ||
      options.get("--tmpfs")?.[0] !==
        `/counterlab-runtime:rw,noexec,nosuid,nodev,size=256m,uid=${uid},gid=${gid},mode=0700` ||
      !sameValues(environment, ["TMPDIR=/counterlab-runtime"]) ||
      volumes.length !== 0 ||
      byDestination.size !== 4 ||
      reachabilityScript?.source !==
        repositoryFile(
          "scripts/probe_cpython_htmlparser_reachability.py",
          "reachability verifier",
          "file",
        ) ||
      !reachabilityScript.readonly ||
      publicFixtures?.source !==
        repositoryFile("fixtures/public", "public fixtures", "directory") ||
      !publicFixtures.readonly ||
      notebookFixtures?.source !==
        repositoryFile(
          "fixtures/notebooks",
          "notebook fixtures",
          "directory",
        ) ||
      !notebookFixtures.readonly ||
      review === undefined ||
      !review.readonly ||
      reviewMatch?.[1] !== image.slice("counterlab-runner:git-".length) ||
      options.get("--workdir")?.[0] !== "/repo" ||
      command[0] !== "/repo/scripts/probe_cpython_htmlparser_reachability.py" ||
      command[1] !== "--root" ||
      command[2] !== "/repo" ||
      command[3] !== "--image-digest" ||
      !/^sha256:[a-f0-9]{64}$/.test(command[4] ?? "") ||
      command[5] !== "--source-commit" ||
      command[6] !== image.slice("counterlab-runner:git-".length) ||
      command[7] !== "--sbom-sha256" ||
      !/^[a-f0-9]{64}$/.test(command[8] ?? "") ||
      command[9] !== "--review-file" ||
      command[10] !== "/repo/reachability-review.json" ||
      command.length !== 11
    ) {
      fail("scientific reachability profile is invalid");
    }
    repositoryFile(review.source, "reachability review", "file");
  } else {
    expectAdapterImage(image);
    expectOptionShape(options, {
      "--name": 1,
      "--network": 1,
      "--user": 1,
      "--security-opt": 1,
      "--pids-limit": 1,
      "--memory": 1,
      "--memory-swap": 1,
      "--cpus": 1,
      "--ulimit": 4,
      "--tmpfs": 1,
      "--mount": 3,
      "--env": 1,
      "--workdir": 1,
    });
    const memory = options.get("--memory")?.[0];
    const memorySwap = options.get("--memory-swap")?.[0];
    boundedNumber(
      options.get("--pids-limit")?.[0],
      /^\d{1,2}$/,
      1,
      32,
      "process limit",
    );
    const memoryMegabytes = boundedNumber(
      memory,
      /^\d{2,4}m$/,
      64,
      1_024,
      "memory limit",
    );
    boundedNumber(
      options.get("--cpus")?.[0],
      /^(?:\d|\d\.\d{1,2})$/,
      0.25,
      2,
      "CPU limit",
    );
    const ulimits = rlimitMap(options.get("--ulimit") ?? []);
    if (
      command.length !== 0 ||
      entrypoint !== undefined ||
      !sameValues(flags, [
        "--rm",
        "--read-only",
        "--pull=never",
        "--cap-drop=ALL",
        "--ipc=private",
      ]) ||
      options.get("--user")?.[0] !== "65532:65532" ||
      options.get("--security-opt")?.[0] !== "no-new-privileges=true" ||
      memory !== memorySwap ||
      (ulimits.get("cpu") ?? 0) < 1 ||
      (ulimits.get("cpu") ?? 0) > 60 ||
      ulimits.get("as") !== 2 * 1024 * 1024 * 1024 ||
      (ulimits.get("fsize") ?? 0) < 1 ||
      (ulimits.get("fsize") ?? 0) > 1_048_576 ||
      ulimits.get("nofile") !== 64 ||
      options.get("--tmpfs")?.[0] !==
        "/tmp:rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532,mode=0700" ||
      !sameValues(environment, ["PYTHONHASHSEED=0"]) ||
      options.get("--workdir")?.[0] !== "/workspace"
    ) {
      fail("bounded adapter profile is incomplete");
    }
    const byDestination = new Map(
      mounts.map((mount) => [mount.destination, mount]),
    );
    const cacheTmp = resolve(root, "node_modules/.cache/counterlab-v6.1/tmp");
    const workspace = byDestination.get("/workspace");
    const fixture = byDestination.get("/fixtures/customer_churn.csv");
    const output = byDestination.get("/output");
    const mountSources = [workspace?.source, fixture?.source, output?.source];
    const distinctNonOverlappingSources =
      mountSources.every((source) => source !== undefined) &&
      mountSources.every((source, index) =>
        mountSources
          .slice(index + 1)
          .every(
            (other) =>
              other !== undefined &&
              source !== undefined &&
              !pathsOverlap(source, other),
          ),
      );
    if (
      byDestination.size !== 3 ||
      workspace === undefined ||
      !workspace.readonly ||
      !relative(cacheTmp, workspace.source).startsWith("counterlab-sandbox-") ||
      fixture === undefined ||
      !fixture.readonly ||
      fixture.source !== resolve(root, "fixtures/public/customer_churn.csv") ||
      output === undefined ||
      output.readonly ||
      !relative(cacheTmp, output.source).startsWith("counterlab-sandbox-") ||
      !distinctNonOverlappingSources
    ) {
      fail("bounded adapter mounts are invalid");
    }
  }
}

if (args.length === 0) fail("command is missing");
switch (args[0]) {
  case "version":
    if (args.length !== 3 || args[1] !== "--format" || args[2] !== "json") {
      fail("version probe arguments are invalid");
    }
    break;
  case "counterlab-drain":
    if (args.length !== 2 || !/^[a-f0-9]{64}$/u.test(args[1] ?? "")) {
      fail("drain arguments are invalid");
    }
    break;
  case "image": {
    if (args[1] !== "inspect" || ![3, 5].includes(args.length)) {
      fail("only image inspect is approved");
    }
    expectLocalImage(args[2]);
    if (
      args.length === 5 &&
      (args[3] !== "--format" || !inspectFormats.has(args[4]))
    ) {
      fail("image inspect format is not approved");
    }
    break;
  }
  case "load": {
    if (
      args.length !== 5 ||
      args[1] !== "--platform" ||
      args[2] !== "linux/amd64" ||
      args[3] !== "--input"
    )
      fail("load arguments are invalid");
    repositoryFile(args[4], "OCI archive", "file");
    break;
  }
  case "login": {
    if (
      args.length !== 5 ||
      args[1] !== "--username" ||
      !/^[A-Za-z0-9_.@-]{1,128}$/.test(args[2] ?? "") ||
      args[3] !== "--password-stdin" ||
      args[4] !== "registry.cloudflare.com"
    ) {
      fail("registry login arguments are invalid");
    }
    break;
  }
  case "tag":
    if (args.length !== 3) fail("tag arguments are invalid");
    expectHostedImage(args[1]);
    expectRegistryImage(args[2]);
    if (!args[2].endsWith(args[1].slice("counterlab-runner".length))) {
      fail("local and registry image tags bind different source commits");
    }
    break;
  case "push":
    if (args.length !== 2) fail("push arguments are invalid");
    expectRegistryImage(args[1]);
    break;
  case "run":
    validateRun(args.slice(1));
    break;
  case "kill":
    if (args.length !== 2 || !/^counterlab-[a-f0-9]{20}$/.test(args[1] ?? "")) {
      fail("kill target is not an agent-owned bounded runner container");
    }
    break;
  case "rm":
    if (
      args.length !== 3 ||
      args[1] !== "--force" ||
      !/^counterlab-[a-f0-9]{20}$/.test(args[2] ?? "")
    ) {
      fail("remove target is not an agent-owned bounded runner container");
    }
    break;
  default:
    fail(`unsupported command: ${args[0]}`);
}
