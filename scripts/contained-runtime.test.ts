import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  CONTAINED_RUNTIME_CALLER_GRACE_SECONDS,
  CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS,
  CONTAINED_RUNTIME_POLICY_SHA256,
  containedRuntimeResourceAbsent,
  containedRunPlan,
  executeContainedRun,
  validateContainedImageRootfsSnapshot,
  validateContainedRunnerRootfsPermissions,
  validateContainedRunControlReceipt,
} from "./contained-runtime-run.mjs";
import {
  createContainedImageAuthority,
  parseContainedImageManifest,
  parseContainedImageTarget,
  selectContainedImageManifest,
  validateContainedImageAliasTarget,
  verifyContainedReadOnlyMounts,
} from "./contained-image-authority.mjs";
import {
  persistContainedRootlessSpec,
  sanitizeContainedRootlessSpec,
  validateContainedContainerInfo,
  validateContainedConfigContainerInfo,
  verifyPersistedContainedRootlessSpec,
} from "./contained-rootless-spec.mjs";
import {
  CONTAINERD_SHIM_SOCKET_DIR_MAX_LENGTH,
  CONTAINED_RUNTIME_SNAPSHOTTER,
  createContainedContainerdConfig,
  renderContainedContainerdConfig,
} from "./contained-containerd-config.mjs";
import { createContainedRuntimeEnvironment } from "./contained-runtime-environment.mjs";
import { AGGREGATE_TIMEOUT_QUALIFICATION_MODE } from "./contained-runtime-request.mjs";

const root = process.cwd();
const validator = resolve(
  root,
  "scripts/validate-contained-runtime-command.mjs",
);
const sourceCommit = "a".repeat(40);
const image = `counterlab-runner:git-${sourceCommit}`;
const adapterImage = `counterlab-adapter:git-${sourceCommit}`;
const invocationId = "1".repeat(64);
const sandboxRoot = resolve(
  root,
  "node_modules/.cache/counterlab-v6.1/tmp/counterlab-sandbox-validator-fixture",
);
const workspace = resolve(sandboxRoot, "runs/workspace-fixture");
const output = resolve(sandboxRoot, "runs/adapter-fixture");
const reviewRoot = resolve(
  root,
  `node_modules/.cache/counterlab-v6.1/scientific-evidence-${sourceCommit}-20260719T000000Z-1`,
);
const reviewFile = resolve(reviewRoot, "reachability-review.json");
const runcWrapper = resolve(root, "scripts/runtime-bin/runc");
const runtimeWrapperRoot = resolve(root, "scripts/runtime-bin");
const pinnedRunc = resolve(
  root,
  "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/bin/runc",
);
const runcStateRoot = resolve(root, ".rt/rt-runc-test/run/runc");
const shellInjectionFixture = resolve(sandboxRoot, "hostile-bash-env.sh");
let runcLogSymlink = "";

function validate(...args: string[]) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  });
}

function startupCommand(): string[] {
  return [
    "run",
    "--rm",
    "--name",
    "counterlab-startup-validator",
    "--pull=never",
    "--network",
    "none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--ipc=private",
    "--pids-limit=32",
    "--memory=4096m",
    "--memory-swap=4096m",
    "--cpus=2.0",
    "--ulimit=cpu=300:300",
    "--ulimit=as=17179869184:17179869184",
    "--ulimit=fsize=1048576:1048576",
    "--ulimit=nofile=64:64",
    "--tmpfs",
    "/counterlab-runtime:rw,noexec,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=0700",
    "-e",
    "TMPDIR=/counterlab-runtime",
    "-e",
    "COUNTERLAB_RUNNER_STARTUP_PROBE=1",
    "-e",
    "COUNTERLAB_RUNNER_WORK_ROOT=/counterlab-runtime/jobs",
    "-e",
    "COUNTERLAB_CODEX_HOME_ROOT=/counterlab-runtime/codex",
    image,
  ];
}

function scientificRuntimeCommand(): string[] {
  return [
    "run",
    "--rm",
    "--name",
    "counterlab-runtime-validator",
    "--user",
    "1000:1000",
    "--pull=never",
    "--network",
    "none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--ipc=private",
    "--pids-limit=32",
    "--memory=1024m",
    "--memory-swap=1024m",
    "--cpus=2.0",
    "--ulimit=cpu=300:300",
    "--ulimit=as=17179869184:17179869184",
    "--ulimit=fsize=1048576:1048576",
    "--ulimit=nofile=64:64",
    "--tmpfs",
    "/counterlab-runtime:rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=0700",
    "-e",
    "TMPDIR=/counterlab-runtime",
    "--mount",
    `type=bind,src=${resolve(root, "scripts/verify_scientific_runtime.py")},dst=/repo/scripts/verify_scientific_runtime.py,readonly`,
    "--mount",
    `type=bind,src=${resolve(root, "requirements.runner.lock.txt")},dst=/repo/requirements.runner.lock.txt,readonly`,
    "--mount",
    `type=bind,src=${resolve(root, "scientific-engines")},dst=/repo/scientific-engines,readonly`,
    "--workdir=/repo",
    "--entrypoint",
    "python",
    image,
    "/repo/scripts/verify_scientific_runtime.py",
    "--root",
    "/repo",
    "--image-digest",
    `sha256:${"b".repeat(64)}`,
    "--source-commit",
    sourceCommit,
  ];
}

function reachabilityCommand(): string[] {
  return [
    "run",
    "--rm",
    "--name",
    "counterlab-reachability-validator",
    "--pull=never",
    "--network=none",
    "--read-only",
    "--user=1000:1000",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--ipc=private",
    "--pids-limit=32",
    "--memory=1024m",
    "--memory-swap=1024m",
    "--cpus=2.0",
    "--ulimit=cpu=300:300",
    "--ulimit=as=17179869184:17179869184",
    "--ulimit=fsize=1048576:1048576",
    "--ulimit=nofile=64:64",
    "--tmpfs=/counterlab-runtime:rw,noexec,nosuid,nodev,size=256m,uid=1000,gid=1000,mode=0700",
    "--env=TMPDIR=/counterlab-runtime",
    "--mount",
    `type=bind,src=${resolve(root, "scripts/probe_cpython_htmlparser_reachability.py")},dst=/repo/scripts/probe_cpython_htmlparser_reachability.py,readonly`,
    "--mount",
    `type=bind,src=${resolve(root, "fixtures/public")},dst=/repo/fixtures/public,readonly`,
    "--mount",
    `type=bind,src=${resolve(root, "fixtures/notebooks")},dst=/repo/fixtures/notebooks,readonly`,
    "--mount",
    `type=bind,src=${reviewFile},dst=/repo/reachability-review.json,readonly`,
    "--workdir=/repo",
    "--entrypoint=python",
    image,
    "/repo/scripts/probe_cpython_htmlparser_reachability.py",
    "--root",
    "/repo",
    "--image-digest",
    `sha256:${"b".repeat(64)}`,
    "--source-commit",
    sourceCommit,
    "--sbom-sha256",
    "c".repeat(64),
    "--review-file",
    "/repo/reachability-review.json",
  ];
}

function boundedAdapterCommand(): string[] {
  return [
    "run",
    "--rm",
    `--name=counterlab-${"c".repeat(20)}`,
    "--pull=never",
    "--network=none",
    "--read-only",
    "--user=65532:65532",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges=true",
    "--ipc=private",
    "--pids-limit=16",
    "--memory=512m",
    "--memory-swap=512m",
    "--cpus=1.0",
    "--ulimit=cpu=20:20",
    "--ulimit=as=2147483648:2147483648",
    "--ulimit=fsize=262144:262144",
    "--ulimit=nofile=64:64",
    "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m,uid=65532,gid=65532,mode=0700",
    "--mount",
    `type=bind,src=${workspace},dst=/workspace,readonly`,
    "--mount",
    `type=bind,src=${resolve(root, "fixtures/public/customer_churn.csv")},dst=/fixtures/customer_churn.csv,readonly`,
    "--mount",
    `type=bind,src=${output},dst=/output`,
    "--env=PYTHONHASHSEED=0",
    "--workdir=/workspace",
    adapterImage,
  ];
}

function successful(stdout = ""): {
  status: number;
  stdout: Buffer;
  stderr: Buffer;
} {
  return {
    status: 0,
    stdout: Buffer.from(stdout),
    stderr: Buffer.alloc(0),
  };
}

function missing(): { status: number; stdout: Buffer; stderr: Buffer } {
  return {
    status: 1,
    stdout: Buffer.alloc(0),
    stderr: Buffer.from("not found\n"),
  };
}

function digest(source: string): string {
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function imageFixture(command: string[]) {
  const commandImage = command.find((entry) =>
    /^counterlab-(?:adapter|runner):git-[a-f0-9]{40}$/.test(entry),
  )!;
  const configSource = JSON.stringify({
    architecture: "amd64",
    os: "linux",
    rootfs: {
      type: "layers",
      diff_ids: [`sha256:${"3".repeat(64)}`],
    },
    config: {
      User: "10001:10001",
      Env: ["PATH=/usr/local/bin:/usr/bin:/bin"],
      Entrypoint: ["/usr/local/bin/node", "/app/runner.mjs"],
      Cmd: [],
      WorkingDir: "/app",
      Labels: {
        "io.counterlab.source-tree-sha256": "2".repeat(64),
        "org.opencontainers.image.revision": sourceCommit,
        "org.opencontainers.image.source":
          "https://github.com/ALikesToCode/CounterLab",
      },
    },
  });
  const configDigest = digest(configSource);
  const layerDigest = `sha256:${"4".repeat(64)}`;
  const manifestSource = JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: configDigest,
      size: configSource.length,
    },
    layers: [
      {
        mediaType: "application/vnd.oci.image.layer.v1.tar+gzip",
        digest: layerDigest,
        size: 1024,
      },
    ],
  });
  const manifestDigest = digest(manifestSource);
  const targetSource = JSON.stringify([
    {
      Id: configDigest,
      RepoTags: [commandImage],
      RepoDigests: [
        `${commandImage.slice(0, commandImage.lastIndexOf(":"))}@${manifestDigest}`,
      ],
      Architecture: "amd64",
      Os: "linux",
    },
  ]);
  const target = parseContainedImageTarget({
    image: commandImage,
    source: targetSource,
  });
  const selected = selectContainedImageManifest({
    source: manifestSource,
    target,
  });
  expect(
    parseContainedImageManifest({ manifestDigest, source: manifestSource }),
  ).toEqual({
    configDigest,
    configSize: configSource.length,
    layerDigests: [layerDigest],
  });
  return {
    authority: createContainedImageAuthority({
      args: command,
      configSource,
      manifestDigest: selected.manifestDigest,
      manifestSource,
      target,
    }),
    configDigest,
    configSource,
    layerDigest,
    manifestDigest,
    manifestSource,
    target,
    targetSource,
  };
}

function aliasMetadata(
  alias: string,
  fixture: ReturnType<typeof imageFixture>,
) {
  const shortAlias = alias.slice("docker.io/library/".length);
  return JSON.stringify([
    {
      Id: fixture.configDigest,
      RepoTags: [shortAlias],
      RepoDigests: [
        `${shortAlias.slice(0, shortAlias.lastIndexOf(":"))}@${fixture.target.targetDigest}`,
      ],
      Architecture: "amd64",
      Os: "linux",
    },
  ]);
}

function rootlessSpec(
  containerId: string,
  expected: {
    containerName: string;
    cpuCount: number;
    maxProcesses: number;
    memoryBytes: number;
    rlimits: Array<{ type: string; soft: number; hard: number }>;
    sessionRoot: string;
  },
  authority = imageFixture(startupCommand()).authority,
): string {
  const containerdSocket = resolve(expected.sessionRoot, "run/containerd.sock");
  const dataStore = resolve(
    expected.sessionRoot,
    "data/nerdctl",
    createHash("sha256").update(containerdSocket).digest("hex").slice(0, 8),
  );
  const stateDir = resolve(
    dataStore,
    "containers/counterlab-v6.1",
    containerId,
  );
  const hostsDir = resolve(dataStore, "etchosts/counterlab-v6.1", containerId);
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  mkdirSync(hostsDir, { recursive: true, mode: 0o700 });
  const internalMountSources: Array<
    [destination: string, source: string, contents: string]
  > = [
    [
      "/etc/hostname",
      resolve(stateDir, "hostname"),
      `${containerId.slice(0, 12)}\n`,
    ],
    ["/etc/hosts", resolve(hostsDir, "hosts"), "127.0.0.1 localhost\n"],
    [
      "/etc/resolv.conf",
      resolve(stateDir, "resolv.conf"),
      "nameserver 127.0.0.1\n",
    ],
  ];
  const internalMounts = internalMountSources.map(
    ([destination, source, contents]) => {
      writeFileSync(source, contents, { mode: 0o644 });
      return {
        destination,
        type: "bind",
        source,
        options: ["bind", "rprivate"],
      };
    },
  );
  const requestedMounts = authority.requestedMounts.map((entry) => ({
    destination: entry.destination,
    type: "bind",
    source: entry.source,
    options: [
      "rbind",
      ...(entry.readonly ? ["ro"] : []),
      "rprivate",
      "nodev",
      "nosuid",
    ],
  }));
  const requestedTmpfs = authority.requestedTmpfs.map((entry) => ({
    destination: entry.destination,
    type: "tmpfs",
    source: "tmpfs",
    options: [...entry.options, "rprivate"],
  }));
  const annotations = {
    "nerdctl/auto-remove": "true",
    "nerdctl/dns": JSON.stringify({
      DNSServers: null,
      DNSResolvConfOptions: null,
      DNSSearchDomains: null,
    }),
    "nerdctl/domainname": "",
    "nerdctl/extraHosts": "[]",
    "nerdctl/host-config": JSON.stringify({
      BlkioWeight: 0,
      CidFile: "",
      Devices: null,
    }),
    "nerdctl/hostname": containerId.slice(0, 12),
    "nerdctl/ipc": '{"mode":"private"}',
    "nerdctl/log-config": JSON.stringify({
      driver: "json-file",
      address: containerdSocket,
    }),
    "nerdctl/log-uri": (() => {
      const value = new URL(
        `binary://${resolve(root, "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/bin/nerdctl")}`,
      );
      value.searchParams.set("_NERDCTL_INTERNAL_LOGGING", dataStore);
      return value.toString();
    })(),
    "nerdctl/mounts": JSON.stringify([
      ...authority.requestedTmpfs.map((entry) => ({
        Type: "tmpfs",
        Source: "tmpfs",
        Destination: entry.destination,
        Mode: entry.options.join(","),
        RW: true,
        Propagation: "",
      })),
      ...authority.requestedMounts.map((entry) => ({
        Type: "bind",
        Source: entry.source,
        Destination: entry.destination,
        Mode: entry.readonly ? "ro,rbind" : "rbind",
        RW: !entry.readonly,
        Propagation: "",
      })),
    ]),
    "nerdctl/name": expected.containerName,
    "nerdctl/namespace": "counterlab-v6.1",
    "nerdctl/networks": '["none"]',
    "nerdctl/platform": "linux/amd64",
    "nerdctl/state-dir": resolve(
      dataStore,
      "containers/counterlab-v6.1",
      containerId,
    ),
    "nerdctl/user": `${authority.process.uid}:${authority.process.gid}`,
  };
  const binRoot = resolve(
    root,
    "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/bin",
  );
  const nerdctl = resolve(binRoot, "nerdctl");
  const runtimePath = `${resolve(root, "scripts/runtime-bin")}:${binRoot}:/usr/bin:/bin`;
  const hookEnvironment = [
    `HOME=${resolve(expected.sessionRoot, "home")}`,
    `TMPDIR=${resolve(expected.sessionRoot, "tmp")}`,
    `XDG_CACHE_HOME=${resolve(expected.sessionRoot, "xdg-cache")}`,
    `XDG_CONFIG_HOME=${resolve(expected.sessionRoot, "xdg-config")}`,
    `XDG_DATA_HOME=${resolve(expected.sessionRoot, "xdg-data")}`,
    `XDG_RUNTIME_DIR=${resolve(expected.sessionRoot, "run/inner")}`,
    `DOCKER_CONFIG=${resolve(expected.sessionRoot, "auth")}`,
    `BUILDKIT_HOST=unix://${resolve(expected.sessionRoot, "run/buildkitd.sock")}`,
    `COUNTERLAB_RUNC_BINARY=${resolve(binRoot, "runc")}`,
    `COUNTERLAB_RUNC_STATE_ROOT=${resolve(expected.sessionRoot, "run/runc")}`,
    `PATH=${runtimePath}`,
    `PATH=${runtimePath}:/usr/sbin:/sbin`,
  ];
  const hookArgs = [
    nerdctl,
    `--H=${containerdSocket}`,
    `--a=${containerdSocket}`,
    `--address=${containerdSocket}`,
    "--cgroup-manager=cgroupfs",
    `--cni-netconfpath=${resolve(expected.sessionRoot, "config/cni")}`,
    `--cni-path=${resolve(root, "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/libexec/cni")}`,
    `--data-root=${resolve(expected.sessionRoot, "data/nerdctl")}`,
    "--experimental=false",
    `--host=${containerdSocket}`,
    `--hosts-dir=[${resolve(expected.sessionRoot, "config/certs.d")}]`,
    "--n=counterlab-v6.1",
    "--namespace=counterlab-v6.1",
    `--snapshotter=${CONTAINED_RUNTIME_SNAPSHOTTER}`,
    `--storage-driver=${CONTAINED_RUNTIME_SNAPSHOTTER}`,
    "internal",
    "oci-hook",
  ];
  return JSON.stringify({
    ociVersion: "1.3.0",
    hostname: containerId.slice(0, 12),
    annotations,
    hooks: {
      createRuntime: [
        {
          path: nerdctl,
          args: [...hookArgs, "createRuntime"],
          env: hookEnvironment,
        },
      ],
      poststop: [
        {
          path: nerdctl,
          args: [...hookArgs, "postStop"],
          env: hookEnvironment,
        },
      ],
    },
    process: {
      user: {
        uid: authority.process.uid,
        gid: authority.process.gid,
        additionalGids: [authority.process.gid],
      },
      args: authority.process.args,
      env: [...authority.process.env, `HOSTNAME=${containerId.slice(0, 12)}`],
      cwd: authority.process.cwd,
      capabilities: {},
      // Model the exact raw nerdctl spec; RLIMIT_AS is injected only after
      // this staging document passes the contained-runtime policy.
      rlimits: expected.rlimits.filter((entry) => entry.type !== "RLIMIT_AS"),
      noNewPrivileges: true,
    },
    root: { path: "rootfs", readonly: true },
    mounts: [
      {
        destination: "/proc",
        type: "proc",
        source: "proc",
        options: ["nosuid", "noexec", "nodev"],
      },
      {
        destination: "/dev",
        type: "tmpfs",
        source: "tmpfs",
        options: ["nosuid", "strictatime", "mode=755", "size=65536k"],
      },
      {
        destination: "/dev/pts",
        type: "devpts",
        source: "devpts",
        options: [
          "nosuid",
          "noexec",
          "newinstance",
          "ptmxmode=0666",
          "mode=0620",
          "gid=5",
        ],
      },
      {
        destination: "/dev/shm",
        type: "tmpfs",
        source: "shm",
        options: ["nosuid", "noexec", "nodev", "mode=1777", "size=65536k"],
      },
      {
        destination: "/dev/mqueue",
        type: "mqueue",
        source: "mqueue",
        options: ["nosuid", "noexec", "nodev"],
      },
      {
        destination: "/sys",
        type: "sysfs",
        source: "sysfs",
        options: ["nosuid", "noexec", "nodev", "ro"],
      },
      ...requestedTmpfs,
      ...requestedMounts,
      ...internalMounts,
    ],
    linux: {
      cgroupsPath: `counterlab-v6.1/${containerId}`,
      resources: {
        devices: [
          { allow: false, access: "rwm" },
          ...[
            [1, 3],
            [1, 8],
            [1, 7],
            [5, 0],
            [1, 5],
            [1, 9],
            [5, 1],
            [5, 2],
          ].map(([major, minor]) => ({
            allow: true,
            type: "c",
            major,
            minor,
            access: "rwm",
          })),
          { allow: true, type: "c", major: 136, access: "rwm" },
        ],
        memory: { limit: expected.memoryBytes, swap: expected.memoryBytes },
        cpu: {
          quota: Math.round(expected.cpuCount * 100_000),
          period: 100_000,
          realtimeRuntime: 0,
          realtimePeriod: 0,
        },
        pids: { limit: expected.maxProcesses },
      },
      namespaces: [
        { type: "pid" },
        { type: "ipc" },
        { type: "uts" },
        { type: "mount" },
        { type: "network" },
        { type: "cgroup" },
      ],
      maskedPaths: [
        "/proc/acpi",
        "/proc/asound",
        "/proc/kcore",
        "/proc/keys",
        "/proc/latency_stats",
        "/proc/scsi",
        "/proc/sched_debug",
        "/proc/timer_list",
        "/proc/timer_stats",
        "/sys/firmware",
        "/sys/devices/virtual/powercap",
      ],
      readonlyPaths: [
        "/proc/bus",
        "/proc/fs",
        "/proc/irq",
        "/proc/sys",
        "/proc/sysrq-trigger",
      ],
      seccomp: {
        defaultAction: "SCMP_ACT_ERRNO",
        architectures: ["SCMP_ARCH_X86_64"],
        syscalls: [
          { names: ["exit", "exit_group"], action: "SCMP_ACT_ALLOW" },
          { names: ["fork", "vfork"], action: "SCMP_ACT_ALLOW" },
          {
            names: ["clone"],
            action: "SCMP_ACT_ALLOW",
            args: [
              {
                index: 0,
                value: 0x7e020000,
                valueTwo: 0,
                op: "SCMP_CMP_MASKED_EQ",
              },
            ],
          },
          {
            names: ["process_vm_readv", "process_vm_writev", "ptrace"],
            action: "SCMP_ACT_ALLOW",
          },
        ],
      },
      sysctl: { "net.ipv4.ip_unprivileged_port_start": "0" },
    },
  });
}

function containerMetadata(
  containerId: string,
  imageName: string,
  invocation = invocationId,
): string {
  const labels: Record<string, string> = {
    "io.counterlab.runtime.invocation": invocation,
  };
  return JSON.stringify({
    ID: containerId,
    Image: imageName,
    Labels: labels,
    Runtime: { Name: "io.containerd.runc.v2" },
    SnapshotKey: containerId,
    Snapshotter: CONTAINED_RUNTIME_SNAPSHOTTER,
  });
}

function configContainerMetadata(
  containerId: string,
  baseSpecSha256: string,
): string {
  return JSON.stringify({
    ID: containerId,
    Image: "",
    Labels: {
      "io.counterlab.runtime.invocation": invocationId,
      "io.counterlab.runtime.base-spec-sha256": baseSpecSha256,
    },
    Runtime: { Name: "io.containerd.runc.v2" },
    SnapshotKey: "",
    Snapshotter: "",
  });
}

function imageRootfsSnapshotMetadata(
  imageRootfsPath: string,
  parentChainId: string,
): string {
  return JSON.stringify({
    Kind: "Active",
    Name: imageRootfsPath,
    Parent: parentChainId,
  });
}

function absentInspectionResponses() {
  return [successful(), missing(), missing()];
}

function qualifiedRuntimeHarness() {
  const sessionRoot = resolve(root, ".rt/rt-validator-qualified");
  const installRoot = resolve(
    root,
    "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
  );
  const command = boundedAdapterCommand();
  const plan = containedRunPlan({
    args: command,
    binRoot: resolve(installRoot, "bin"),
    clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
    containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
    installRoot,
    invocationId,
    sessionRoot,
  });
  const fixture = imageFixture(command);
  const stagingContainerId = "d".repeat(64);
  let finalContainerId = "";
  const alias = plan.imageAlias;
  const imageRootfsPath = resolve(
    sessionRoot,
    `run/rootless-specs/${invocationId}.image-rootfs`,
  );
  const events: string[] = [];
  const commandTimeouts: {
    create?: number;
    run?: number;
    runKillSignal?: string;
  } = {};
  let aliasPresent = false;
  let imageRootfsMounted = false;
  let stagingPresent = true;
  let taskPresent = false;
  let containerPresent = false;
  let baseSpecSha256 = "";

  writeFileSync(resolve(output, "public-tests.stdout"), "", { mode: 0o600 });
  writeFileSync(resolve(output, "public-tests.stderr"), "", { mode: 0o600 });

  const fakeSpawn = (
    _program: string,
    args: string[],
    _options: { killSignal?: string; timeout: number },
  ) => {
    const joined = args.join(" ");
    if (joined.includes("image inspect docker.io/library/counterlab-adapter")) {
      return successful(fixture.targetSource);
    }
    if (joined.includes(`content get ${fixture.manifestDigest}`)) {
      return successful(fixture.manifestSource);
    }
    if (joined.includes(`content get ${fixture.configDigest}`)) {
      return successful(fixture.configSource);
    }
    if (joined.includes(`images inspect ${alias}`)) {
      return aliasPresent ? successful("{}") : missing();
    }
    if (joined.includes(`image inspect ${alias}`)) {
      return successful(aliasMetadata(alias, fixture));
    }
    if (joined.includes("images tag")) {
      aliasPresent = true;
      return successful();
    }
    if (joined.includes(`images remove ${alias}`)) {
      events.push("alias-cleaned");
      aliasPresent = false;
      return successful();
    }
    if (joined.includes("images mount")) {
      imageRootfsMounted = true;
      return successful(
        `${fixture.authority.rootfsChainId}\n${imageRootfsPath}\n`,
      );
    }
    if (joined.includes("images unmount")) {
      events.push("rootfs-cleaned");
      imageRootfsMounted = false;
      return successful(`${imageRootfsPath}\n`);
    }
    if (joined.includes(" create ")) {
      commandTimeouts.create = _options.timeout;
      return successful(`${stagingContainerId}\n`);
    }
    if (args.includes("--spec")) {
      return successful(
        rootlessSpec(stagingContainerId, plan.expected, fixture.authority),
      );
    }
    if (joined.includes("containers info")) {
      const id = args.at(-1);
      if (id === stagingContainerId) {
        return stagingPresent
          ? successful(containerMetadata(stagingContainerId, alias))
          : missing();
      }
      if (id === finalContainerId) {
        return containerPresent
          ? successful(
              configContainerMetadata(finalContainerId, baseSpecSha256),
            )
          : missing();
      }
      return missing();
    }
    if (joined.includes("tasks list")) {
      return successful(taskPresent ? `${finalContainerId}\n` : "");
    }
    if (joined.includes("snapshots") && joined.includes(" diff ")) {
      return successful("stable-rootfs-diff");
    }
    if (joined.includes("snapshots") && joined.includes(" info ")) {
      const id = args.at(-1);
      if (id === imageRootfsPath) {
        return imageRootfsMounted
          ? successful(
              imageRootfsSnapshotMetadata(
                imageRootfsPath,
                fixture.authority.rootfsChainId,
              ),
            )
          : missing();
      }
      return missing();
    }
    if (joined.includes(" rm --force ")) {
      stagingPresent = false;
      return successful();
    }
    if (joined.includes(" run ")) {
      commandTimeouts.run = _options.timeout;
      if (_options.killSignal !== undefined) {
        commandTimeouts.runKillSignal = _options.killSignal;
      }
      events.push("candidate-started");
      taskPresent = true;
      containerPresent = true;
      const label = args.find((entry) =>
        entry.startsWith("io.counterlab.runtime.base-spec-sha256="),
      );
      baseSpecSha256 = label!.split("=", 2)[1]!;
      const timeoutError = Object.assign(new Error("candidate timed out"), {
        code: "ETIMEDOUT",
      });
      return {
        status: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        error: timeoutError,
      };
    }
    if (joined.includes("tasks delete")) {
      events.push("task-cleaned");
      taskPresent = false;
      return successful();
    }
    if (joined.includes("containers delete")) {
      events.push("container-cleaned");
      containerPresent = false;
      return successful();
    }
    throw new Error(`unexpected mock command: ${joined}`);
  };

  return {
    context: {
      args: command,
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      cwd: root,
      environment: process.env,
      installRoot,
      qualificationMode: AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
      sessionRoot,
      stdin: Buffer.alloc(0),
    },
    commandTimeouts,
    events,
    fakeSpawn,
    get finalContainerId() {
      return finalContainerId;
    },
    imageRootfsPath,
    persistSpec: ({
      finalContainerId: persistedFinalContainerId,
      receipt,
      sessionRoot: persistedSessionRoot,
    }: {
      finalContainerId: string;
      receipt: Record<string, unknown>;
      sessionRoot: string;
    }) => {
      finalContainerId = persistedFinalContainerId;
      return {
        configFileSha256: String(receipt.configFileSha256),
        configPath: resolve(
          persistedSessionRoot,
          `run/rootless-specs/${finalContainerId}.config.json`,
        ),
        imageRootfsPath,
        receiptFileSha256: "4".repeat(64),
        receiptPath: resolve(
          persistedSessionRoot,
          `run/rootless-specs/${finalContainerId}.receipt.json`,
        ),
      };
    },
  };
}

describe("contained runtime command policy", () => {
  it("renders a bounded containerd shim manager configuration", () => {
    const snapshotterSocket = resolve(root, ".rt/runtime-snapshotter.sock");
    const config = renderContainedContainerdConfig(root, snapshotterSocket);

    expect(root.length).toBeLessThanOrEqual(
      CONTAINERD_SHIM_SOCKET_DIR_MAX_LENGTH,
    );
    expect(config).toContain("version = 4");
    expect(config).toContain("imports = []");
    expect(config).toContain("[plugins.'io.containerd.shim.v1.manager']");
    expect(config).toContain(`socket_dir = '${root}'`);
    expect(config).toContain(
      `[proxy_plugins.'${CONTAINED_RUNTIME_SNAPSHOTTER}']`,
    );
    expect(config).toContain(`address = '${snapshotterSocket}'`);
    expect(config).toContain(
      `snapshotter = "${CONTAINED_RUNTIME_SNAPSHOTTER}"`,
    );
    expect(config).toContain("'io.containerd.grpc.v1.cri'");
    expect(config).toContain("'io.containerd.nri.v1.nri'");
    expect(() =>
      renderContainedContainerdConfig(
        resolve(root, "shim-sockets"),
        snapshotterSocket,
      ),
    ).toThrow(/socket configuration is invalid/u);
  });

  it("configures the full Linux shim socket path in the repository", () => {
    const fixtureParent = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/tmp/containerd-config-tests",
    );
    mkdirSync(fixtureParent, { recursive: true, mode: 0o700 });
    const fixtureRoot = mkdtempSync(resolve(fixtureParent, "shim-"));
    const binding = createContainedContainerdConfig({
      configPath: resolve(fixtureRoot, "containerd.toml"),
      repositoryRoot: root,
      shimSocketRoot: root,
      snapshotterSocket: resolve(fixtureRoot, "fuse-overlayfs.sock"),
    });
    expect(binding.shimSocketDirectory.length).toBeLessThanOrEqual(42);
    expect(realpathSync(binding.shimSocketDirectory)).toBe(realpathSync(root));
    expect(
      readFileSync(resolve(fixtureRoot, "containerd.toml"), "utf8"),
    ).toContain(`socket_dir = '${binding.shimSocketDirectory}'`);
  });

  it("characterizes a distinct shim host root as rejected", () => {
    const fixtureParent = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/tmp/containerd-config-tests",
    );
    mkdirSync(fixtureParent, { recursive: true, mode: 0o700 });
    const sourceRoot = mkdtempSync(resolve(fixtureParent, "source-"));
    const shimHostRoot = mkdtempSync(resolve(fixtureParent, "host-"));

    expect(() =>
      createContainedContainerdConfig({
        configPath: resolve(sourceRoot, "containerd.toml"),
        repositoryRoot: sourceRoot,
        shimSocketRoot: shimHostRoot,
        snapshotterSocket: resolve(sourceRoot, "fuse-overlayfs.sock"),
      }),
    ).toThrow(/configuration escaped the repository/u);
  });

  beforeAll(() => {
    mkdirSync(workspace, { recursive: true, mode: 0o700 });
    mkdirSync(output, { recursive: true, mode: 0o700 });
    mkdirSync(reviewRoot, { recursive: true, mode: 0o700 });
    mkdirSync(resolve(runcStateRoot, "counterlab-v6.1"), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(reviewFile, "{}\n", { mode: 0o600 });
    writeFileSync(shellInjectionFixture, "exit 91\n", { mode: 0o600 });
    const logFixtureRoot = mkdtempSync(
      resolve(root, ".rt/rt-runc-test/runc-log-"),
    );
    const logTarget = resolve(logFixtureRoot, "target.log");
    runcLogSymlink = resolve(logFixtureRoot, "runc.log");
    writeFileSync(logTarget, "sentinel\n", { mode: 0o600 });
    symlinkSync(logTarget, runcLogSymlink);
  });

  it("accepts only self-hashed timeout controls with exact v2 or qualified v3 shape", () => {
    const payload = {
      schemaVersion: "2",
      status: "TIMED_OUT_CLEAN",
      timeoutKind: "WALL_CLOCK",
      runtimePolicySha256: CONTAINED_RUNTIME_POLICY_SHA256,
      invocationId,
      finalContainerId: "f".repeat(64),
      commandSha256: "2".repeat(64),
      rootlessReceiptFileSha256: "3".repeat(64),
      rootlessReceiptPayloadSha256: "4".repeat(64),
      timeoutObserved: true,
      candidateWallSeconds: 1,
      elapsedMs: 1_001,
      cleanupReserveMs: 120_000,
      taskAbsent: true,
      containerAbsent: true,
      snapshotAbsent: true,
      invocationAliasAbsent: true,
      imageRootfsAbsent: true,
      persistedAuthorityVerified: true,
      readOnlyMountsUnchanged: true,
      imageRootfsUnchanged: true,
      resultReleased: false,
    } as const;
    const receipt = {
      ...payload,
      receiptPayloadSha256: createHash("sha256")
        .update(canonicalJson(payload))
        .digest("hex"),
    };

    expect(validateContainedRunControlReceipt(receipt)).toEqual(receipt);
    const qualifiedPayload = {
      ...payload,
      schemaVersion: "3",
      qualificationMode: AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
    } as const;
    const qualifiedReceipt = {
      ...qualifiedPayload,
      receiptPayloadSha256: createHash("sha256")
        .update(canonicalJson(qualifiedPayload))
        .digest("hex"),
    };
    expect(validateContainedRunControlReceipt(qualifiedReceipt)).toEqual(
      qualifiedReceipt,
    );
    expect(() =>
      validateContainedRunControlReceipt({
        ...qualifiedReceipt,
        qualificationMode: "unknown",
      }),
    ).toThrow(/qualification|binding/u);
    expect(() =>
      validateContainedRunControlReceipt({
        ...receipt,
        qualificationMode: AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
      }),
    ).toThrow(/shape/u);
    expect(() =>
      validateContainedRunControlReceipt({
        ...receipt,
        resultReleased: true,
      }),
    ).toThrow(/binding|status/u);
    expect(() =>
      validateContainedRunControlReceipt({
        ...receipt,
        status: "TIMED_OUT_UNCLEAN",
        receiptPayloadSha256: createHash("sha256")
          .update(canonicalJson({ ...payload, status: "TIMED_OUT_UNCLEAN" }))
          .digest("hex"),
      }),
    ).toThrow(/status/u);
  });

  it("rejects an unknown qualification mode before invoking the runtime", async () => {
    let spawned = false;
    const result = await executeContainedRun(
      {
        args: startupCommand(),
        binRoot: resolve(root, "node_modules/.cache/unused/bin"),
        clientFifoRoot: resolve(root, ".rt/unused/client-fifo"),
        containerdSocket: resolve(root, ".rt/unused/containerd.sock"),
        cwd: root,
        environment: process.env,
        installRoot: resolve(root, "node_modules/.cache/unused"),
        qualificationMode: "unknown" as never,
        sessionRoot: resolve(root, ".rt/unused"),
        stdin: Buffer.alloc(0),
      },
      () => {
        spawned = true;
        throw new Error("invalid qualification mode must not reach spawn");
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr.toString("utf8")).toContain(
      "qualification mode is invalid",
    );
    expect(spawned).toBe(false);
  });

  it("reserves the candidate wall-clock limit for the candidate process", async () => {
    const harness = qualifiedRuntimeHarness();
    const rootfsModes: number[] = [];
    const coordinator = {
      async begin(input: { finalContainerId: string; invocationId: string }) {
        return input;
      },
      async waitForDraft() {
        return { receiptPayloadSha256: "6".repeat(64) };
      },
      async complete() {
        return {
          qualificationArtifacts: {},
          qualifiedReceipt: {},
          qualifiedReceiptFileSha256: "7".repeat(64),
          qualifiedReceiptPath: resolve(
            harness.context.sessionRoot,
            `run/cgroup-qualification/${invocationId}/${harness.finalContainerId}.qualified-receipt.json`,
          ),
          qualifiedReceiptPayloadSha256: "8".repeat(64),
        };
      },
    };

    await executeContainedRun(
      harness.context,
      harness.fakeSpawn,
      harness.persistSpec,
      () => undefined,
      () => invocationId,
      undefined,
      coordinator,
      () => undefined,
      (_plan, _path, mode) => rootfsModes.push(mode),
    );

    expect(harness.commandTimeouts.create).toBeGreaterThan(20_000);
    expect(harness.commandTimeouts.run).toBe(20_000);
    expect(harness.commandTimeouts.runKillSignal).toBe("SIGKILL");
    expect(rootfsModes).toEqual([0o755, 0o755, 0o700]);
  });

  it("binds a clean timed-out run to the aggregate-qualified receipt", async () => {
    const harness = qualifiedRuntimeHarness();
    let completionOutcome: unknown;
    const qualifiedReceiptFileSha256 = "7".repeat(64);
    const qualifiedReceiptPayloadSha256 = "8".repeat(64);
    const coordinator = {
      async begin(input: { finalContainerId: string; invocationId: string }) {
        harness.events.push("qualification-ready");
        expect(input).toMatchObject({
          finalContainerId: harness.finalContainerId,
          invocationId,
        });
        return {
          finalContainerId: input.finalContainerId,
          invocationId: input.invocationId,
        };
      },
      async waitForDraft() {
        harness.events.push("qualification-draft");
        return { receiptPayloadSha256: "6".repeat(64) };
      },
      async complete(_handle: unknown, outcome: unknown) {
        harness.events.push("qualification-complete");
        completionOutcome = outcome;
        return {
          qualificationArtifacts: {},
          qualifiedReceipt: {},
          qualifiedReceiptFileSha256,
          qualifiedReceiptPath: resolve(
            harness.context.sessionRoot,
            `run/cgroup-qualification/${invocationId}/${harness.finalContainerId}.qualified-receipt.json`,
          ),
          qualifiedReceiptPayloadSha256,
        };
      },
    };

    const result = await executeContainedRun(
      harness.context,
      harness.fakeSpawn,
      harness.persistSpec,
      () => undefined,
      () => invocationId,
      undefined,
      coordinator,
      () => undefined,
      () => undefined,
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toHaveLength(0);
    expect(
      result.controlReceipt,
      JSON.stringify({
        events: harness.events,
        stderr: result.stderr.toString("utf8"),
      }),
    ).toMatchObject({
      schemaVersion: "3",
      qualificationMode: AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
      status: "TIMED_OUT_CLEAN",
      timeoutObserved: true,
      resultReleased: false,
      rootlessReceiptFileSha256: qualifiedReceiptFileSha256,
      rootlessReceiptPayloadSha256: qualifiedReceiptPayloadSha256,
    });
    expect(completionOutcome).toEqual({
      cleanup: {
        taskAbsent: true,
        containerAbsent: true,
        snapshotAbsent: true,
        invocationAliasAbsent: true,
        imageRootfsAbsent: true,
        persistedAuthorityVerified: true,
        readOnlyMountsUnchanged: true,
        imageRootfsUnchanged: true,
      },
      resultReleased: false,
      runtimeFailed: false,
      timeoutObserved: true,
    });
    expect(harness.events).toEqual([
      "qualification-ready",
      "candidate-started",
      "qualification-draft",
      "task-cleaned",
      "container-cleaned",
      "rootfs-cleaned",
      "alias-cleaned",
      "qualification-complete",
    ]);
    expect(() =>
      validateContainedRunControlReceipt(result.controlReceipt),
    ).not.toThrow();
  });

  it.each(["begin", "draft", "complete"] as const)(
    "fails closed when aggregate qualification %s fails",
    async (failurePoint) => {
      const harness = qualifiedRuntimeHarness();
      const coordinator = {
        async begin() {
          harness.events.push("qualification-ready");
          if (failurePoint === "begin") throw new Error("begin failed");
          return {
            finalContainerId: harness.finalContainerId,
            invocationId,
          };
        },
        async waitForDraft() {
          harness.events.push("qualification-draft");
          if (failurePoint === "draft") throw new Error("draft failed");
          return { receiptPayloadSha256: "6".repeat(64) };
        },
        async complete() {
          harness.events.push("qualification-complete");
          throw new Error("completion failed");
        },
      };

      const result = await executeContainedRun(
        harness.context,
        harness.fakeSpawn,
        harness.persistSpec,
        () => undefined,
        () => invocationId,
        undefined,
        coordinator,
        () => undefined,
        () => undefined,
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toHaveLength(0);
      expect(result.controlReceipt).toBeUndefined();
      expect(result.stderr.toString("utf8")).toMatch(
        failurePoint === "begin"
          ? /qualification readiness failed/u
          : /aggregate qualification failed/u,
      );
      if (failurePoint === "begin") {
        expect(harness.events).toEqual([
          "qualification-ready",
          "rootfs-cleaned",
          "alias-cleaned",
        ]);
        expect(harness.events).not.toContain("candidate-started");
      } else {
        expect(harness.events).toContain("candidate-started");
        expect(harness.events.at(-1)).toBe("qualification-complete");
      }
    },
  );

  it("maps only the pinned runc state root into the runtime session", () => {
    const environment = {
      ...process.env,
      COUNTERLAB_RUNC_BINARY: pinnedRunc,
      COUNTERLAB_RUNC_STATE_ROOT: runcStateRoot,
    };
    const listed = spawnSync(
      runcWrapper,
      [
        "--root",
        "/run/containerd/runc/counterlab-v6.1",
        "list",
        "--format=json",
      ],
      {
        cwd: root,
        env: environment,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
      },
    );
    expect(listed.status).toBe(0);
    expect(JSON.parse(listed.stdout)).toBeNull();

    const version = spawnSync(runcWrapper, ["--version"], {
      cwd: root,
      env: { ...environment, BASH_ENV: shellInjectionFixture },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    });
    expect(version.status).toBe(0);
    expect(version.stdout).toContain("runc version 1.4.2");

    const escaped = spawnSync(
      runcWrapper,
      ["--root", "/run/user/1000/runc", "list", "--format=json"],
      {
        cwd: root,
        env: environment,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
      },
    );
    expect(escaped.status).not.toBe(0);
    expect(escaped.stderr).toContain(
      "runc root does not match the pinned containerd default",
    );

    for (const args of [
      ["--root=/run/containerd/runc", "list"],
      [
        "--root",
        "/run/containerd/runc",
        "--root",
        "/run/containerd/runc",
        "list",
      ],
      [
        "--root",
        "/run/containerd/runc",
        "--log",
        "/run/containerd/runc.log",
        "list",
      ],
      ["--root", "/run/containerd/runc", "--log", runcLogSymlink, "list"],
      ["--root", "/run/containerd/runc", "--rootless=false", "list"],
      ["run"],
    ]) {
      const invalid = spawnSync(runcWrapper, args, {
        cwd: root,
        env: environment,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10_000,
      });
      expect(invalid.status, args.join(" ")).not.toBe(0);
    }
  });

  it("uses one exact wrapper and scrubs inherited runtime injection", () => {
    expect(readdirSync(runtimeWrapperRoot).sort()).toEqual([
      "mount.fuse3",
      "runc",
    ]);
    const fuseMountWrapper = readFileSync(
      resolve(runtimeWrapperRoot, "mount.fuse3"),
      "utf8",
    );
    expect(fuseMountWrapper).toContain('OPTIONS=("allow_other")');
    expect(fuseMountWrapper).toContain(
      "rootless-tools/install-v2.3.1/bin/fuse-overlayfs",
    );
    expect(fuseMountWrapper).toContain(
      '"${MOUNT_MODE}" == "containerd" || "${MOUNT_MODE}" == "unpack"',
    );
    expect(fuseMountWrapper).toContain(
      "UPPER_SEEN == 0 && WORK_SEEN == 0 && READ_ONLY_SEEN == 0",
    );

    const environment = createContainedRuntimeEnvironment({
      auth: resolve(root, ".rt/rt-runc-test/auth"),
      binRoot: resolve(
        root,
        "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/bin",
      ),
      buildkitSocket: resolve(root, ".rt/rt-runc-test/run/buildkitd.sock"),
      home: resolve(root, ".rt/rt-runc-test/home"),
      runcBinary: pinnedRunc,
      runcStateRoot,
      runtimeWrapperRoot,
      tmp: resolve(root, ".rt/rt-runc-test/tmp"),
      xdgCache: resolve(root, ".rt/rt-runc-test/xdg-cache"),
      xdgConfig: resolve(root, ".rt/rt-runc-test/xdg-config"),
      xdgData: resolve(root, ".rt/rt-runc-test/xdg-data"),
      xdgRuntime: resolve(root, ".rt/rt-runc-test/run"),
    });

    expect(Object.keys(environment).sort()).toEqual(
      [
        "BUILDKIT_HOST",
        "COUNTERLAB_RUNC_BINARY",
        "COUNTERLAB_RUNC_STATE_ROOT",
        "DOCKER_CONFIG",
        "HOME",
        "PATH",
        "TMPDIR",
        "XDG_CACHE_HOME",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_RUNTIME_DIR",
      ].sort(),
    );
    for (const inherited of [
      "AWS_SHARED_CREDENTIALS_FILE",
      "BASH_ENV",
      "GOTMPDIR",
      "LD_PRELOAD",
      "NODE_OPTIONS",
      "SSH_AUTH_SOCK",
      "SSL_CERT_FILE",
      "TMP",
    ]) {
      expect(environment).not.toHaveProperty(inherited);
    }
    expect(environment.COUNTERLAB_RUNC_BINARY).toBe(pinnedRunc);
    expect(environment.COUNTERLAB_RUNC_STATE_ROOT).toBe(runcStateRoot);
    expect(environment.PATH).toBe(
      `${runtimeWrapperRoot}:${resolve(
        root,
        "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/bin",
      )}:/usr/bin:/bin`,
    );
  });

  it("starts the launcher in an empty privileged shell environment", () => {
    const launcher = resolve(root, "scripts/start-contained-runtime.sh");
    expect(readFileSync(launcher, "utf8").split("\n", 1)[0]).toBe(
      "#!/usr/bin/env -S -i PATH=/usr/bin:/bin /bin/bash -p",
    );

    const result = spawnSync(launcher, ["--invalid"], {
      cwd: root,
      env: {
        ...process.env,
        BASH_ENV: shellInjectionFixture,
        NODE_OPTIONS: "--definitely-not-a-node-option",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage: start-contained-runtime.sh");
    expect(result.stderr).not.toContain("definitely-not-a-node-option");
  });

  it("allows only the exact release verification profiles", () => {
    expect(validate(...startupCommand()).status).toBe(0);
    expect(validate(...scientificRuntimeCommand()).status).toBe(0);
    expect(validate(...reachabilityCommand()).status).toBe(0);
    expect(validate(...boundedAdapterCommand()).status).toBe(0);
  });

  it("binds every runner profile to the hosted image address-space limit", () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-image-role-limits");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    for (const command of [
      startupCommand(),
      scientificRuntimeCommand(),
      reachabilityCommand(),
      boundedAdapterCommand(),
    ]) {
      const plan = containedRunPlan({
        args: command,
        binRoot: resolve(installRoot, "bin"),
        clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
        containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
        installRoot,
        invocationId,
        sessionRoot,
      });
      const addressSpace = plan.expected.rlimits.find(
        (entry) => entry.type === "RLIMIT_AS",
      );
      expect(addressSpace?.soft).toBe(
        command.includes(adapterImage)
          ? 2 * 1024 * 1024 * 1024
          : 16 * 1024 * 1024 * 1024,
      );
      expect(addressSpace?.hard).toBe(addressSpace?.soft);
    }
  });

  it("mounts only bounded release inputs instead of the repository root", () => {
    for (const command of [scientificRuntimeCommand(), reachabilityCommand()]) {
      expect(command).not.toContain(`${root}:/repo:ro`);
      expect(command).not.toContain(`type=bind,src=${root},dst=/repo,readonly`);
    }
    expect(
      scientificRuntimeCommand().filter((value) => value === "--mount"),
    ).toHaveLength(3);
    expect(
      reachabilityCommand().filter((value) => value === "--mount"),
    ).toHaveLength(4);
  });

  it("requires a private IPC namespace for every run profile", () => {
    for (const command of [
      startupCommand(),
      scientificRuntimeCommand(),
      reachabilityCommand(),
      boundedAdapterCommand(),
    ]) {
      const ipcIndex = command.indexOf("--ipc=private");
      expect(ipcIndex).toBeGreaterThan(-1);

      command[ipcIndex] = "--ipc=none";
      expect(validate(...command).status).not.toBe(0);

      command[ipcIndex] = "--ipc=host";
      expect(validate(...command).status).not.toBe(0);
    }
  });

  it("starts validated runs through ctr with a repository-contained FIFO root", () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-plan");
    const clientFifoRoot = resolve(sessionRoot, "run/client-fifo");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const plan = containedRunPlan({
      args: startupCommand(),
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot,
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });

    expect(plan.create.args).toContain("create");
    expect(plan.create.args).not.toContain("run");
    expect(plan.create.args).not.toContain(
      "--ulimit=as=17179869184:17179869184",
    );
    expect(
      plan.create.args.filter((argument) => argument.startsWith("--ulimit=")),
    ).toHaveLength(3);
    const createIndex = plan.create.args.indexOf("create");
    const invocationLabelIndex = plan.create.args.indexOf("--label");
    expect(
      plan.create.args.slice(createIndex + 1, invocationLabelIndex),
    ).toEqual(
      startupCommand()
        .slice(1, -1)
        .filter(
          (argument) => argument !== "--ulimit=as=17179869184:17179869184",
        ),
    );
    expect(plan.start.program).toBe(resolve(installRoot, "bin/ctr"));
    const cgroupIndex = plan.start.args.indexOf("--cgroup");
    expect(plan.start.args[cgroupIndex + 1]).toBe(
      `/counterlab-v6.1-${invocationId}`,
    );
    expect(plan.start.args[cgroupIndex + 1]).not.toContain("/containerd/");
    expect(plan.start.args).toEqual(
      expect.arrayContaining([
        "run",
        "--rm",
        "--fifo-dir",
        clientFifoRoot,
        "--cgroup",
        `/counterlab-v6.1-${invocationId}`,
        "--platform",
        "linux/amd64",
      ]),
    );
    expect(
      plan.start.args.filter((argument) => argument === "--cgroup"),
    ).toHaveLength(1);
    expect(plan.start.args).not.toContain("");
    expect(plan.containerName).toBe("counterlab-startup-validator");
    expect(plan.start.args).not.toContain("counterlab-startup-validator");
    expect(plan.mountImageRootfs).toEqual({
      program: resolve(installRoot, "bin/ctr"),
      args: expect.arrayContaining([
        "images",
        "mount",
        "--snapshotter",
        CONTAINED_RUNTIME_SNAPSHOTTER,
        "--platform",
        "linux/amd64",
        "--rw",
      ]),
    });
    expect(plan.cleanupImageRootfs).toEqual({
      program: resolve(installRoot, "bin/ctr"),
      args: expect.arrayContaining([
        "images",
        "unmount",
        "--snapshotter",
        CONTAINED_RUNTIME_SNAPSHOTTER,
        "--rm",
      ]),
    });
    expect(plan.cleanupStaging.args.slice(-2)).toEqual(["rm", "--force"]);
    expect(plan.cleanupImageAlias.args.slice(-2)).toEqual(["images", "remove"]);
    expect(plan.expected.rlimits).toHaveLength(4);
    const fullCommandAuthority = imageFixture(startupCommand()).authority;
    const fullCommandSha256 = createHash("sha256")
      .update(canonicalJson(startupCommand()))
      .digest("hex");
    const stagingCommandSha256 = createHash("sha256")
      .update(
        canonicalJson(
          startupCommand().filter(
            (argument) => argument !== "--ulimit=as=17179869184:17179869184",
          ),
        ),
      )
      .digest("hex");
    expect(fullCommandAuthority.commandSha256).toBe(fullCommandSha256);
    expect(fullCommandAuthority.commandSha256).not.toBe(stagingCommandSha256);
    const splitUlimitCommand = startupCommand();
    const addressSpaceIndex = splitUlimitCommand.indexOf(
      "--ulimit=as=17179869184:17179869184",
    );
    splitUlimitCommand.splice(
      addressSpaceIndex,
      1,
      "--ulimit",
      "as=17179869184:17179869184",
    );
    const splitUlimitPlan = containedRunPlan({
      args: splitUlimitCommand,
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot,
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });
    expect(splitUlimitPlan.create.args).not.toContain(
      "as=17179869184:17179869184",
    );
    expect(splitUlimitPlan.expected.rlimits).toHaveLength(4);
    const invalidAddressSpaceCommands = [
      startupCommand().filter(
        (argument) => argument !== "--ulimit=as=17179869184:17179869184",
      ),
      startupCommand().map((argument) =>
        argument === "--ulimit=as=17179869184:17179869184"
          ? "--ulimit=as=536870912:536870912"
          : argument,
      ),
      (() => {
        const command = startupCommand();
        command.splice(
          command.length - 1,
          0,
          "--ulimit=as=17179869184:17179869184",
        );
        return command;
      })(),
    ];
    for (const args of invalidAddressSpaceCommands) {
      expect(() =>
        containedRunPlan({
          args,
          binRoot: resolve(installRoot, "bin"),
          clientFifoRoot,
          containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
          installRoot,
          invocationId,
          sessionRoot,
        }),
      ).toThrow(/resource intent|rlimit intent/u);
    }
    expect(CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS).toBe(420);
    expect(CONTAINED_RUNTIME_CALLER_GRACE_SECONDS).toBe(5);
    expect(JSON.stringify(plan)).not.toContain("/run/containerd/fifo");
  });

  it("requires exact snapshot ownership and does not hide snapshotter failure", () => {
    const imageRootfsPath = resolve(
      root,
      ".rt/rt-validator-snapshot-owner/run/rootless-specs/rootfs",
    );
    const parentChainId = `sha256:${"3".repeat(64)}`;
    expect(() =>
      validateContainedImageRootfsSnapshot(
        imageRootfsSnapshotMetadata(imageRootfsPath, parentChainId),
        imageRootfsPath,
        parentChainId,
      ),
    ).not.toThrow();
    expect(() =>
      validateContainedImageRootfsSnapshot(
        imageRootfsSnapshotMetadata(
          imageRootfsPath,
          `sha256:${"4".repeat(64)}`,
        ),
        imageRootfsPath,
        parentChainId,
      ),
    ).toThrow(/ownership changed/u);
    expect(
      containedRuntimeResourceAbsent({
        status: 1,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from("snapshotter fuse-overlayfs not found\n"),
      }),
    ).toBe(false);
    expect(containedRuntimeResourceAbsent(missing())).toBe(true);
  });

  it("fails closed when the imported runner loses non-root executable modes", () => {
    const safe = [
      { path: "/", kind: "directory", mode: 0o755, uid: 0, gid: 0 },
      { path: "/usr", kind: "directory", mode: 0o755, uid: 0, gid: 0 },
      {
        path: "/usr/local",
        kind: "directory",
        mode: 0o755,
        uid: 0,
        gid: 0,
      },
      {
        path: "/usr/local/bin",
        kind: "directory",
        mode: 0o755,
        uid: 0,
        gid: 0,
      },
      {
        path: "/usr/local/bin/node",
        kind: "file",
        mode: 0o555,
        uid: 0,
        gid: 0,
      },
      { path: "/usr/bin", kind: "directory", mode: 0o755, uid: 0, gid: 0 },
      { path: "/usr/bin/bwrap", kind: "file", mode: 0o555, uid: 0, gid: 0 },
      { path: "/usr/bin/setpriv", kind: "file", mode: 0o555, uid: 0, gid: 0 },
      { path: "/usr/bin/bash", kind: "file", mode: 0o555, uid: 0, gid: 0 },
      { path: "/usr/lib", kind: "directory", mode: 0o755, uid: 0, gid: 0 },
      {
        path: "/usr/lib64",
        kind: "directory",
        mode: 0o755,
        uid: 0,
        gid: 0,
      },
      {
        path: "/usr/lib/x86_64-linux-gnu",
        kind: "directory",
        mode: 0o755,
        uid: 0,
        gid: 0,
      },
      {
        path: "/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
        kind: "file",
        mode: 0o755,
        uid: 0,
        gid: 0,
      },
      { path: "/app", kind: "directory", mode: 0o555, uid: 0, gid: 0 },
      {
        path: "/app/runner.mjs",
        kind: "file",
        mode: 0o555,
        uid: 0,
        gid: 0,
      },
      { path: "/etc", kind: "directory", mode: 0o755, uid: 0, gid: 0 },
      { path: "/etc/passwd", kind: "file", mode: 0o444, uid: 0, gid: 0 },
      { path: "/etc/group", kind: "file", mode: 0o444, uid: 0, gid: 0 },
      { path: "/etc/hosts", kind: "file", mode: 0o644, uid: 0, gid: 0 },
      { path: "/repo", kind: "directory", mode: 0o555, uid: 0, gid: 0 },
      {
        path: "/repo/scripts",
        kind: "directory",
        mode: 0o555,
        uid: 0,
        gid: 0,
      },
      {
        path: "/repo/scripts/verify_scientific_runtime.py",
        kind: "file",
        mode: 0o444,
        uid: 0,
        gid: 0,
      },
      { path: "/dev/pts", kind: "directory", mode: 0o755, uid: 0, gid: 0 },
      { path: "/dev/shm", kind: "directory", mode: 0o755, uid: 0, gid: 0 },
      {
        path: "/dev/mqueue",
        kind: "directory",
        mode: 0o755,
        uid: 0,
        gid: 0,
      },
      {
        path: "/sys/fs/cgroup",
        kind: "directory",
        mode: 0o755,
        uid: 0,
        gid: 0,
      },
      {
        path: "/counterlab-runtime",
        kind: "directory",
        mode: 0o755,
        uid: 0,
        gid: 0,
      },
    ];

    expect(validateContainedRunnerRootfsPermissions(safe)).toEqual(safe);
    expect(() =>
      validateContainedRunnerRootfsPermissions(
        safe.map((entry) =>
          entry.path === "/usr/local/bin/node"
            ? { ...entry, mode: 0o700, uid: 1000, gid: 1000 }
            : entry,
        ),
      ),
    ).toThrow(
      "contained runner rootfs permissions are unsafe at /usr/local/bin/node: expected file 555 0:0, observed file 700 1000:1000",
    );
  });

  it("retains bounded cgroup intent without claiming observed enforcement", () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-spec");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const plan = containedRunPlan({
      args: startupCommand(),
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });
    const containerId = "d".repeat(64);
    const fixture = imageFixture(startupCommand());
    const expected = {
      ...plan.expected,
      containerName: plan.containerName,
      imageAuthority: fixture.authority,
      invocationId,
      sessionRoot,
    };
    const source = rootlessSpec(containerId, plan.expected, fixture.authority);
    const prepared = sanitizeContainedRootlessSpec({
      containerId,
      expected,
      metadataSha256: "3".repeat(64),
      source,
    });
    const sanitized = JSON.parse(prepared.config);
    const original = JSON.parse(source);

    expect(sanitized.linux.cgroupsPath).toBe(
      `/counterlab-v6.1-${invocationId}`,
    );
    expect(sanitized.linux.cgroupsPath).not.toContain("/containerd/");
    expect(sanitized.linux.resources.unified).toEqual({
      "memory.oom.group": "0",
    });
    expect(sanitized.linux.namespaces).toContainEqual({ type: "user" });
    expect(sanitized.linux.uidMappings).toEqual([
      { containerID: 0, hostID: 1, size: 1 },
      { containerID: fixture.authority.process.uid, hostID: 0, size: 1 },
    ]);
    expect(sanitized.linux.gidMappings).toEqual([
      { containerID: 0, hostID: 1, size: 1 },
      { containerID: 5, hostID: 2, size: 1 },
      { containerID: fixture.authority.process.gid, hostID: 0, size: 1 },
    ]);
    expect(sanitized.linux.resources).toEqual({
      ...original.linux.resources,
      unified: { "memory.oom.group": "0" },
    });
    const canonicalBase = structuredClone(sanitized);
    delete canonicalBase.annotations;
    expect(prepared.receipt.baseSpecSha256).toBe(
      createHash("sha256").update(canonicalJson(canonicalBase)).digest("hex"),
    );
    expect(prepared.receipt.sanitizedSpecSha256).toBe(
      createHash("sha256").update(canonicalJson(sanitized)).digest("hex"),
    );
    expect(prepared.receipt.configFileSha256).toBe(
      createHash("sha256").update(prepared.config).digest("hex"),
    );
    expect(sanitized.process.rlimits).toEqual(
      [...plan.expected.rlimits].sort((left, right) =>
        left.type.localeCompare(right.type),
      ),
    );
    expect(sanitized.process.noNewPrivileges).toBe(true);
    expect(sanitized.process.terminal).toBe(false);
    expect(sanitized.process.user.additionalGids).toEqual([]);
    expect(sanitized.process.env).toEqual(fixture.authority.process.env);
    expect(sanitized.process.capabilities).toEqual({
      ambient: [],
      bounding: [],
      effective: [],
      inheritable: [],
      permitted: [],
    });
    expect(sanitized.root.readonly).toBe(true);
    expect(sanitized.root.path).toBe(
      resolve(sessionRoot, `run/rootless-specs/${invocationId}.image-rootfs`),
    );
    expect(
      sanitized.mounts.filter((mount: { destination: string }) =>
        ["/etc/hostname", "/etc/hosts", "/etc/resolv.conf"].includes(
          mount.destination,
        ),
      ),
    ).toEqual([]);
    expect(sanitized.annotations).toEqual({
      "io.counterlab.runtime.base-spec-sha256": prepared.receipt.baseSpecSha256,
      "io.counterlab.runtime.invocation": invocationId,
    });
    expect(sanitized.linux).not.toHaveProperty("sysctl");
    expect(JSON.stringify(sanitized.linux.seccomp)).not.toContain("ptrace");
    const allowedProcessCreation = sanitized.linux.seccomp.syscalls.filter(
      (rule: { action: string; names: string[] }) =>
        rule.action === "SCMP_ACT_ALLOW" &&
        rule.names.some((name) =>
          ["clone", "clone3", "fork", "vfork"].includes(name),
        ),
    );
    expect(allowedProcessCreation).toEqual([
      { action: "SCMP_ACT_ALLOW", names: ["fork", "vfork"] },
      {
        action: "SCMP_ACT_ALLOW",
        args: [
          {
            index: 0,
            op: "SCMP_CMP_MASKED_EQ",
            value: 0x7e020000,
            valueTwo: 0,
          },
        ],
        names: ["clone"],
      },
    ]);
    expect(prepared.finalContainerId).toMatch(/^[a-f0-9]{64}$/u);
    expect(prepared.finalContainerId).not.toBe(containerId);
    expect(prepared.receipt).toMatchObject({
      limitMode: "process-address-space-rlimit-with-unenforced-cgroup-intent",
      aggregateLimitIntentEnforced: false,
      aggregateLimitEvidence: null,
      invocationId,
      imageRootfs: {
        mode: "containerd-ephemeral-writable-snapshot-readonly-runtime",
        mountPath: resolve(
          sessionRoot,
          `run/rootless-specs/${invocationId}.image-rootfs`,
        ),
        parentChainId: fixture.authority.rootfsChainId,
        snapshotter: CONTAINED_RUNTIME_SNAPSHOTTER,
      },
      removedFields: [
        "hooks",
        "annotations",
        "linux.sysctl",
        "linux.seccomp.restrictedTraceRule",
      ],
      stagingContainerId: containerId,
      finalContainerId: prepared.finalContainerId,
      removedMounts: ["/etc/hostname", "/etc/hosts", "/etc/resolv.conf"],
    });
    expect(prepared.receipt.normalizedFields).toContain("linux.cgroupsPath");
    expect(prepared.receipt.normalizedFields).toContain(
      "linux.resources.unified.memory.oom.group",
    );
    expect(prepared.receipt.normalizedFields).toContain("linux.uidMappings");
    expect(prepared.receipt.normalizedFields).toContain("linux.gidMappings");
    expect(prepared.receipt.normalizedFields).toContain(
      "linux.namespaces.user",
    );
    expect(prepared.receipt.normalizedFields).toContain("process.rlimits");

    const resourceMutations: Array<(spec: typeof original) => void> = [
      (spec) => {
        spec.linux.resources.memory.limit += 1;
      },
      (spec) => {
        spec.linux.resources.memory.swap = -1;
      },
      (spec) => {
        spec.linux.resources.pids.limit += 1;
      },
      (spec) => {
        spec.linux.resources.cpu.quota -= 1;
      },
      (spec) => {
        spec.linux.resources.devices[1].major = 2;
      },
      (spec) => {
        spec.linux.resources.io = {};
      },
      (spec) => {
        spec.linux.cgroupsPath = "/escaped";
      },
    ];
    for (const mutate of resourceMutations) {
      const changed = structuredClone(original);
      mutate(changed);
      expect(() =>
        sanitizeContainedRootlessSpec({
          containerId,
          expected,
          metadataSha256: "3".repeat(64),
          source: JSON.stringify(changed),
        }),
      ).toThrow(/cgroup path|resource/u);
    }

    const identityMappingMutations: Array<(spec: typeof original) => void> = [
      (spec) => {
        spec.linux.namespaces.push({ type: "user" });
      },
      (spec) => {
        spec.linux.uidMappings = [
          { containerID: fixture.authority.process.uid, hostID: 0, size: 1 },
        ];
      },
      (spec) => {
        spec.linux.gidMappings = [
          { containerID: fixture.authority.process.gid, hostID: 0, size: 1 },
        ];
      },
    ];
    for (const mutate of identityMappingMutations) {
      const changed = structuredClone(original);
      mutate(changed);
      expect(() =>
        sanitizeContainedRootlessSpec({
          containerId,
          expected,
          metadataSha256: "3".repeat(64),
          source: JSON.stringify(changed),
        }),
      ).toThrow(/staging (?:user namespace|identity mappings) changed/u);
    }

    const rlimitMutations: Array<(spec: typeof original) => void> = [
      (spec) => {
        spec.process.rlimits.push({
          type: "RLIMIT_AS",
          soft: 2 * 1024 * 1024 * 1024,
          hard: 2 * 1024 * 1024 * 1024,
        });
      },
      (spec) => {
        spec.process.rlimits[0].soft -= 1;
      },
      (spec) => {
        spec.process.rlimits.pop();
      },
      (spec) => {
        spec.process.rlimits.push(structuredClone(spec.process.rlimits[0]));
      },
      (spec) => {
        spec.process.rlimits.push({ type: "RLIMIT_RSS", soft: 1, hard: 1 });
      },
    ];
    for (const mutate of rlimitMutations) {
      const changed = structuredClone(original);
      mutate(changed);
      expect(() =>
        sanitizeContainedRootlessSpec({
          containerId,
          expected,
          metadataSha256: "3".repeat(64),
          source: JSON.stringify(changed),
        }),
      ).toThrow(/rlimit/u);
    }

    const missingHookSource = JSON.parse(source);
    missingHookSource.hooks = null;
    expect(() =>
      sanitizeContainedRootlessSpec({
        containerId,
        expected,
        metadataSha256: "3".repeat(64),
        source: JSON.stringify(missingHookSource),
      }),
    ).toThrow(/hooks/u);

    const unsafe = JSON.parse(source);
    unsafe.root.readonly = false;
    expect(() =>
      sanitizeContainedRootlessSpec({
        containerId,
        expected,
        metadataSha256: "3".repeat(64),
        source: JSON.stringify(unsafe),
      }),
    ).toThrow(/root filesystem/u);

    validateContainedContainerInfo({
      containerId,
      image: plan.imageAlias,
      invocationId,
      source: containerMetadata(containerId, plan.imageAlias),
    });
    expect(() =>
      validateContainedContainerInfo({
        containerId,
        image: plan.imageAlias,
        invocationId,
        source: containerMetadata("e".repeat(64), plan.imageAlias),
      }),
    ).toThrow(/metadata ID changed/u);

    const finalContainerId = "f".repeat(64);
    const baseSpecSha256 = "4".repeat(64);
    validateContainedConfigContainerInfo({
      baseSpecSha256,
      containerId: finalContainerId,
      invocationId,
      source: configContainerMetadata(finalContainerId, baseSpecSha256),
    });
    const imageBackedFinal = JSON.parse(
      configContainerMetadata(finalContainerId, baseSpecSha256),
    );
    imageBackedFinal.Image = plan.imageAlias;
    expect(() =>
      validateContainedConfigContainerInfo({
        baseSpecSha256,
        containerId: finalContainerId,
        invocationId,
        source: JSON.stringify(imageBackedFinal),
      }),
    ).toThrow(/ownership changed/u);
  });

  it("authenticates image target, manifest, config, and invocation alias", () => {
    const fixture = imageFixture(startupCommand());
    const alias = `docker.io/library/counterlab-runtime-invocation:${invocationId}`;

    validateContainedImageAliasTarget({
      alias,
      expectedTarget: fixture.target,
      source: aliasMetadata(alias, fixture),
    });
    const sourceRepositoryMetadata = JSON.parse(aliasMetadata(alias, fixture));
    sourceRepositoryMetadata[0].RepoDigests = [
      `counterlab-runner@${fixture.target.targetDigest}`,
    ];
    validateContainedImageAliasTarget({
      alias,
      expectedTarget: fixture.target,
      source: JSON.stringify(sourceRepositoryMetadata),
    });
    const wrongRepository = JSON.parse(aliasMetadata(alias, fixture));
    wrongRepository[0].RepoDigests = [
      `counterlab-runtime-invocation-shadow@${fixture.target.targetDigest}`,
    ];
    expect(() =>
      validateContainedImageAliasTarget({
        alias,
        expectedTarget: fixture.target,
        source: JSON.stringify(wrongRepository),
      }),
    ).toThrow(/repository path/u);
    expect(() =>
      selectContainedImageManifest({
        source: `${fixture.manifestSource} `,
        target: fixture.target,
      }),
    ).toThrow(/digest changed/u);
    expect(() =>
      createContainedImageAuthority({
        args: startupCommand(),
        configSource: `${fixture.configSource} `,
        manifestDigest: fixture.manifestDigest,
        manifestSource: fixture.manifestSource,
        target: fixture.target,
      }),
    ).toThrow(/config content digest/u);
    expect(() =>
      validateContainedImageAliasTarget({
        alias,
        expectedTarget: fixture.target,
        source: JSON.stringify({
          Name: alias,
          Target: {
            digest: `sha256:${"9".repeat(64)}`,
            mediaType: "application/vnd.oci.image.manifest.v1+json",
          },
        }),
      }),
    ).toThrow(/alias target changed/u);

    const indexSource = JSON.stringify({
      schemaVersion: 2,
      mediaType: "application/vnd.oci.image.index.v1+json",
      manifests: [
        {
          digest: fixture.manifestDigest,
          mediaType: "application/vnd.oci.image.manifest.v1+json",
          platform: { os: "linux", architecture: "amd64" },
        },
        {
          digest: fixture.manifestDigest,
          mediaType: "application/vnd.oci.image.manifest.v1+json",
          platform: { os: "linux", architecture: "amd64" },
        },
      ],
    });
    const indexTarget = parseContainedImageTarget({
      image,
      source: JSON.stringify({
        Name: `docker.io/library/${image}`,
        Target: {
          digest: digest(indexSource),
          mediaType: "application/vnd.oci.image.index.v1+json",
        },
      }),
    });
    expect(() =>
      selectContainedImageManifest({
        source: indexSource,
        target: indexTarget,
      }),
    ).toThrow(/one linux\/amd64 manifest/u);
  });

  it("hash-binds every read-only mount and rejects incomplete image layers", () => {
    const mountProbe = resolve(workspace, "mount-binding.txt");
    writeFileSync(mountProbe, "first\n", { mode: 0o600 });
    const command = boundedAdapterCommand();
    const first = imageFixture(command).authority;
    const firstReadonly = first.requestedMounts.filter(
      (mount) => mount.readonly,
    );

    expect(firstReadonly).toHaveLength(2);
    expect(firstReadonly).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destination: "/workspace",
          contentManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        }),
        expect.objectContaining({
          destination: "/fixtures/customer_churn.csv",
          contentManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        }),
      ]),
    );

    const sessionRoot = resolve(root, ".rt/rt-validator-mount-authority");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const plan = containedRunPlan({
      args: command,
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });
    const containerId = "5".repeat(64);
    const firstPrepared = sanitizeContainedRootlessSpec({
      containerId,
      expected: {
        ...plan.expected,
        imageAuthority: first,
        invocationId,
      },
      metadataSha256: "7".repeat(64),
      source: rootlessSpec(containerId, plan.expected, first),
    });

    writeFileSync(mountProbe, "second\n", { mode: 0o600 });
    expect(() => verifyContainedReadOnlyMounts(first.requestedMounts)).toThrow(
      /read-only mount \/workspace changed/u,
    );
    const second = imageFixture(command).authority;
    expect(() =>
      verifyContainedReadOnlyMounts(second.requestedMounts),
    ).not.toThrow();
    expect(second.requestedMounts[0]?.contentManifestSha256).not.toBe(
      first.requestedMounts[0]?.contentManifestSha256,
    );
    const secondPrepared = sanitizeContainedRootlessSpec({
      containerId,
      expected: {
        ...plan.expected,
        imageAuthority: second,
        invocationId,
      },
      metadataSha256: "7".repeat(64),
      source: rootlessSpec(containerId, plan.expected, second),
    });
    expect(firstPrepared.finalContainerId).not.toBe(
      secondPrepared.finalContainerId,
    );
    expect(secondPrepared.receipt).toMatchObject({
      schemaVersion: "5",
      readOnlyMountManifest: second.readOnlyMountManifest,
      readOnlyMountManifestSha256: second.readOnlyMountManifestSha256,
      imageAuthority: {
        layerDigests: second.layerDigests,
      },
    });

    const emptyLayers = JSON.parse(
      imageFixture(startupCommand()).manifestSource,
    );
    emptyLayers.layers = [];
    const emptySource = JSON.stringify(emptyLayers);
    expect(() =>
      parseContainedImageManifest({
        manifestDigest: digest(emptySource),
        source: emptySource,
      }),
    ).toThrow(/layers/u);

    for (const [label, mutate] of [
      [
        "external layer URL",
        (value: Record<string, any>) => {
          value.layers[0].urls = ["https://example.invalid/layer"];
        },
      ],
      [
        "unsupported layer media type",
        (value: Record<string, any>) => {
          value.layers[0].mediaType = "application/octet-stream";
        },
      ],
      [
        "invalid layer size",
        (value: Record<string, any>) => {
          value.layers[0].size = 0;
        },
      ],
    ] as const) {
      const candidate = JSON.parse(
        imageFixture(startupCommand()).manifestSource,
      );
      mutate(candidate);
      const candidateSource = JSON.stringify(candidate);
      expect(
        () =>
          parseContainedImageManifest({
            manifestDigest: digest(candidateSource),
            source: candidateSource,
          }),
        label,
      ).toThrow();
    }

    const fixture = imageFixture(startupCommand());
    const mismatchedLayers = JSON.parse(fixture.manifestSource);
    mismatchedLayers.layers.push({ ...mismatchedLayers.layers[0] });
    const mismatchedLayerSource = JSON.stringify(mismatchedLayers);
    expect(() =>
      createContainedImageAuthority({
        args: startupCommand(),
        configSource: fixture.configSource,
        manifestDigest: digest(mismatchedLayerSource),
        manifestSource: mismatchedLayerSource,
        target: {
          ...fixture.target,
          targetDigest: digest(mismatchedLayerSource),
        },
      }),
    ).toThrow(/layer count/u);
  });

  it("rejects hostile OCI hooks, identity, mounts, devices, and Linux policy", () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-attacks");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const plan = containedRunPlan({
      args: startupCommand(),
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });
    const fixture = imageFixture(startupCommand());
    const containerId = "6".repeat(64);
    const expected = {
      ...plan.expected,
      containerName: plan.containerName,
      imageAuthority: fixture.authority,
      invocationId,
      sessionRoot,
    };
    const valid = JSON.parse(
      rootlessSpec(containerId, plan.expected, fixture.authority),
    );
    const mutations: Array<[string, (value: any) => void]> = [
      [
        "hooks",
        (value) => {
          value.hooks = {
            prestart: [{ path: "/counterlab-forbidden-hook" }],
          };
        },
      ],
      [
        "supplementary group",
        (value) => {
          value.process.user.additionalGids = [0];
        },
      ],
      [
        "terminal allocation",
        (value) => {
          value.process.terminal = true;
        },
      ],
      [
        "hostname environment",
        (value) => {
          value.process.env[value.process.env.length - 1] = "HOSTNAME=wrong";
        },
      ],
      [
        "retained capability",
        (value) => {
          value.process.capabilities = { bounding: ["CAP_SYS_ADMIN"] };
        },
      ],
      [
        "entrypoint",
        (value) => {
          value.process.args = ["/counterlab-forbidden-entrypoint"];
        },
      ],
      [
        "environment",
        (value) => {
          value.process.env.push(["OPENAI_API_KEY", "forbidden"].join("="));
        },
      ],
      [
        "working directory",
        (value) => {
          value.process.cwd = "/counterlab-forbidden-cwd";
        },
      ],
      [
        "unknown process field",
        (value) => {
          value.process.ioPriority = { class: "IOPRIO_CLASS_RT", priority: 0 };
        },
      ],
      [
        "disguised external bind",
        (value) => {
          value.mounts.push({
            destination: "/escape",
            type: "none",
            source: "/counterlab-outside-repository-sentinel",
            options: ["rbind", "rw"],
          });
        },
      ],
      [
        "unsafe propagation",
        (value) => {
          value.mounts.push({
            destination: "/escape",
            type: "bind",
            source: root,
            options: ["rbind", "rshared", "ro"],
          });
        },
      ],
      [
        "default allow seccomp",
        (value) => {
          value.linux.seccomp.defaultAction = "SCMP_ACT_ALLOW";
        },
      ],
      [
        "dangerous allowed syscall",
        (value) => {
          value.linux.seccomp.syscalls.push({
            names: ["mount"],
            action: "SCMP_ACT_ALLOW",
          });
        },
      ],
      [
        "changed restricted trace rule",
        (value) => {
          const rule = value.linux.seccomp.syscalls.find(
            (entry: { names: string[] }) => entry.names.includes("ptrace"),
          );
          rule.names = ["ptrace"];
        },
      ],
      [
        "unfiltered clone",
        (value) => {
          value.linux.seccomp.syscalls.push({
            names: ["clone"],
            action: "SCMP_ACT_ALLOW",
          });
        },
      ],
      [
        "allowed clone3",
        (value) => {
          value.linux.seccomp.syscalls.push({
            names: ["clone3"],
            action: "SCMP_ACT_ALLOW",
            args: [
              {
                index: 0,
                value: 0x7e020000,
                valueTwo: 0,
                op: "SCMP_CMP_MASKED_EQ",
              },
            ],
          });
        },
      ],
      [
        "malformed seccomp argument",
        (value) => {
          value.linux.seccomp.syscalls.push({
            names: ["read"],
            action: "SCMP_ACT_ALLOW",
            args: [{ index: 6, value: 0, op: "SCMP_CMP_EQ" }],
          });
        },
      ],
      [
        "unexpected rootfs path",
        (value) => {
          value.root.path = "alternate-rootfs";
        },
      ],
      [
        "extra device",
        (value) => {
          value.linux.devices = [
            {
              path: "/dev/forbidden",
              type: "c",
              major: 10,
              minor: 200,
              fileMode: 0o666,
              uid: 0,
              gid: 0,
            },
          ];
        },
      ],
      [
        "host sysctl",
        (value) => {
          value.linux.sysctl = { "kernel.domainname": "forbidden" };
        },
      ],
    ];
    for (const [label, mutate] of mutations) {
      const candidate = structuredClone(valid);
      mutate(candidate);
      expect(
        () =>
          sanitizeContainedRootlessSpec({
            containerId,
            expected,
            metadataSha256: "7".repeat(64),
            source: JSON.stringify(candidate),
          }),
        label,
      ).toThrow();
    }
  });

  it("replaces nerdctl annotations with exact runtime authority bindings", () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-annotations");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const command = startupCommand();
    const plan = containedRunPlan({
      args: command,
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });
    const fixture = imageFixture(command);
    const containerId = "6".repeat(64);
    const prepared = sanitizeContainedRootlessSpec({
      containerId,
      expected: {
        ...plan.expected,
        imageAuthority: fixture.authority,
        invocationId,
      },
      metadataSha256: "7".repeat(64),
      source: rootlessSpec(containerId, plan.expected, fixture.authority),
    });
    expect(JSON.parse(prepared.config).annotations).toEqual({
      "io.counterlab.runtime.base-spec-sha256": prepared.receipt.baseSpecSha256,
      "io.counterlab.runtime.invocation": invocationId,
    });
    expect(prepared.receipt.removedFields).toContain("annotations");

    const invalid = JSON.parse(
      rootlessSpec(containerId, plan.expected, fixture.authority),
    );
    invalid.annotations["nerdctl/namespace"] = "default";
    expect(() =>
      sanitizeContainedRootlessSpec({
        containerId,
        expected: {
          ...plan.expected,
          imageAuthority: fixture.authority,
          invocationId,
        },
        metadataSha256: "7".repeat(64),
        source: JSON.stringify(invalid),
      }),
    ).toThrow(/nerdctl\/namespace changed/u);
  });

  it("rejects conflicting or unknown requested bind mount modes", () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-bind-modes");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const command = startupCommand();
    command.splice(
      command.length - 1,
      0,
      "-v",
      `${resolve(root, "fixtures/public")}:/fixtures:ro`,
    );
    const plan = containedRunPlan({
      args: command,
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });
    const fixture = imageFixture(command);
    const containerId = "6".repeat(64);
    const expected = {
      ...plan.expected,
      containerName: plan.containerName,
      imageAuthority: fixture.authority,
      invocationId,
      sessionRoot,
    };
    const valid = JSON.parse(
      rootlessSpec(containerId, plan.expected, fixture.authority),
    );

    for (const option of ["rw", "counterlab-unknown-mode"]) {
      const candidate = structuredClone(valid);
      const requested = candidate.mounts.find(
        (mount: { destination: string }) => mount.destination === "/fixtures",
      );
      requested.options.push(option);
      expect(
        () =>
          sanitizeContainedRootlessSpec({
            containerId,
            expected,
            metadataSha256: "7".repeat(64),
            source: JSON.stringify(candidate),
          }),
        option,
      ).toThrow(/requested bind/u);
    }
  });

  it("normalizes omitted requested bind safety flags before execution", () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-bind-normalization");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const command = boundedAdapterCommand();
    const plan = containedRunPlan({
      args: command,
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });
    const fixture = imageFixture(command);
    const containerId = "4".repeat(64);
    const expected = {
      ...plan.expected,
      containerName: plan.containerName,
      imageAuthority: fixture.authority,
      invocationId,
      sessionRoot,
    };
    const generated = JSON.parse(
      rootlessSpec(containerId, plan.expected, fixture.authority),
    );
    for (const mount of generated.mounts) {
      if (["/workspace", "/output"].includes(mount.destination)) {
        mount.options = mount.options.filter(
          (option: string) => !["nodev", "nosuid"].includes(option),
        );
      }
    }

    const prepared = sanitizeContainedRootlessSpec({
      containerId,
      expected,
      metadataSha256: "7".repeat(64),
      source: JSON.stringify(generated),
    });
    const sanitized = JSON.parse(prepared.config);
    expect(
      sanitized.mounts.find(
        (mount: { destination: string }) => mount.destination === "/workspace",
      ).options,
    ).toEqual(["rbind", "ro", "rprivate", "nodev", "nosuid"]);
    expect(
      sanitized.mounts.find(
        (mount: { destination: string }) => mount.destination === "/output",
      ).options,
    ).toEqual(["rbind", "rprivate", "nodev", "nosuid"]);
    expect(prepared.receipt.normalizedFields).toContain(
      "mounts.requestedBindSafetyOptions",
    );
  });

  it("accepts only the pinned default-writable --mount shape", () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-writable-bind");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const command = startupCommand();
    command.splice(
      command.length - 1,
      0,
      "--mount",
      `type=bind,src=${sandboxRoot},dst=/output`,
    );
    const plan = containedRunPlan({
      args: command,
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });
    const fixture = imageFixture(command);
    const containerId = "5".repeat(64);
    const expected = {
      ...plan.expected,
      containerName: plan.containerName,
      imageAuthority: fixture.authority,
      invocationId,
      sessionRoot,
    };
    const valid = JSON.parse(
      rootlessSpec(containerId, plan.expected, fixture.authority),
    );
    const outputMount = valid.mounts.find(
      (mount: { destination: string }) => mount.destination === "/output",
    );
    expect(outputMount.options).toEqual([
      "rbind",
      "rprivate",
      "nodev",
      "nosuid",
    ]);
    expect(() =>
      sanitizeContainedRootlessSpec({
        containerId,
        expected,
        metadataSha256: "7".repeat(64),
        source: JSON.stringify(valid),
      }),
    ).not.toThrow();

    for (const option of ["ro", "rw", "noexec"]) {
      const candidate = structuredClone(valid);
      candidate.mounts
        .find(
          (mount: { destination: string }) => mount.destination === "/output",
        )
        .options.push(option);
      expect(
        () =>
          sanitizeContainedRootlessSpec({
            containerId,
            expected,
            metadataSha256: "7".repeat(64),
            source: JSON.stringify(candidate),
          }),
        option,
      ).toThrow(/requested bind/u);
    }
  });

  it("binds cleanup ownership to the exact invocation image alias", () => {
    const otherAlias = `docker.io/library/counterlab-runtime-invocation:${"2".repeat(64)}`;
    expect(() =>
      validateContainedContainerInfo({
        containerId: "6".repeat(64),
        image: otherAlias,
        invocationId,
        source: containerMetadata("6".repeat(64), otherAlias),
      }),
    ).toThrow(/image identity/u);
  });

  it.each([
    {
      command: startupCommand(),
      label: "hosted runner",
      wrongAddressSpaceBytes: 2 * 1024 * 1024 * 1024,
    },
    {
      command: boundedAdapterCommand(),
      label: "bounded adapter",
      wrongAddressSpaceBytes: 16 * 1024 * 1024 * 1024,
    },
  ])(
    "rejects a coherent $label receipt with the other image role's address-space limit",
    ({ command, label, wrongAddressSpaceBytes }) => {
      const sessionRoot = mkdtempSync(
        resolve(root, `.rt/persisted-role-${label.replaceAll(" ", "-")}-`),
      );
      mkdirSync(resolve(sessionRoot, "run"), { mode: 0o700 });
      const installRoot = resolve(
        root,
        "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
      );
      const plan = containedRunPlan({
        args: command,
        binRoot: resolve(installRoot, "bin"),
        clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
        containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
        installRoot,
        invocationId,
        sessionRoot,
      });
      const fixture = imageFixture(command);
      const wrongExpected = structuredClone(plan.expected);
      const addressSpace = wrongExpected.rlimits.find(
        (entry) => entry.type === "RLIMIT_AS",
      );
      if (addressSpace === undefined) throw new Error("missing test rlimit");
      addressSpace.soft = wrongAddressSpaceBytes;
      addressSpace.hard = wrongAddressSpaceBytes;
      const prepared = sanitizeContainedRootlessSpec({
        containerId: "8".repeat(64),
        expected: {
          ...wrongExpected,
          containerName: plan.containerName,
          imageAuthority: fixture.authority,
          invocationId,
          sessionRoot,
        },
        metadataSha256: "9".repeat(64),
        source: rootlessSpec("8".repeat(64), wrongExpected, fixture.authority),
      });

      expect(() =>
        persistContainedRootlessSpec({
          config: prepared.config,
          finalContainerId: prepared.finalContainerId,
          internalMounts: prepared.internalMounts,
          receipt: prepared.receipt,
          sessionRoot,
        }),
      ).toThrow(/image role|rlimit binding/u);
    },
  );

  it("persists and verifies both config and self-hashed receipt", () => {
    const sessionRoot = mkdtempSync(resolve(root, ".rt/persisted-spec-"));
    mkdirSync(resolve(sessionRoot, "run"), { mode: 0o700 });
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const plan = containedRunPlan({
      args: startupCommand(),
      binRoot: resolve(installRoot, "bin"),
      clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
      containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
      installRoot,
      invocationId,
      sessionRoot,
    });
    const fixture = imageFixture(startupCommand());
    const prepared = sanitizeContainedRootlessSpec({
      containerId: "8".repeat(64),
      expected: {
        ...plan.expected,
        containerName: plan.containerName,
        imageAuthority: fixture.authority,
        invocationId,
        sessionRoot,
      },
      metadataSha256: "9".repeat(64),
      source: rootlessSpec("8".repeat(64), plan.expected, fixture.authority),
    });
    type MutableResourceReceipt = typeof prepared.receipt & {
      baseSpecSha256: string;
      commandSha256: string;
      configFileSha256: string;
      enforcedRlimits: Array<{ type: string; soft: number; hard: number }>;
      finalContainerId: string;
      internalMountManifestSha256: string;
      intendedAggregateLimits: {
        cpuCount: number;
        maxProcesses: number;
        memoryBytes: number;
      };
      invocationId: string;
      normalizedFields: string[];
      readOnlyMountManifestSha256: string;
      receiptPayloadSha256: string;
      sanitizedSpecSha256: string;
      stagingContainerId: string;
    };
    const receiptMutations: Array<(receipt: MutableResourceReceipt) => void> = [
      (receipt) => {
        const addressSpace = receipt.enforcedRlimits.find(
          (entry) => entry.type === "RLIMIT_AS",
        );
        if (addressSpace === undefined) throw new Error("missing test rlimit");
        addressSpace.soft -= 1;
        addressSpace.hard -= 1;
      },
      (receipt) => {
        receipt.intendedAggregateLimits.memoryBytes = 5 * 1024 * 1024 * 1024;
      },
      (receipt) => {
        receipt.normalizedFields = receipt.normalizedFields.filter(
          (field) => field !== "process.rlimits",
        );
      },
    ];
    for (const mutate of receiptMutations) {
      const invalid = structuredClone(
        prepared.receipt,
      ) as MutableResourceReceipt;
      mutate(invalid);
      expect(() =>
        persistContainedRootlessSpec({
          config: prepared.config,
          finalContainerId: prepared.finalContainerId,
          internalMounts: prepared.internalMounts,
          receipt: invalid,
          sessionRoot,
        }),
      ).toThrow(/resource|rlimit/u);
    }
    const semanticallyChangedConfig = JSON.parse(prepared.config) as {
      annotations: Record<string, string>;
      process: {
        rlimits: Array<{ type: string; soft: number; hard: number }>;
      };
    } & Record<string, unknown>;
    const changedAddressSpace = semanticallyChangedConfig.process.rlimits.find(
      (entry) => entry.type === "RLIMIT_AS",
    );
    if (changedAddressSpace === undefined)
      throw new Error("missing test rlimit");
    changedAddressSpace.soft -= 1;
    changedAddressSpace.hard -= 1;
    const { annotations: _annotations, ...changedBaseConfig } =
      semanticallyChangedConfig;
    const changedBaseSpecSha256 = createHash("sha256")
      .update(canonicalJson(changedBaseConfig))
      .digest("hex");
    semanticallyChangedConfig.annotations[
      "io.counterlab.runtime.base-spec-sha256"
    ] = changedBaseSpecSha256;
    const changedSanitizedSpecSha256 = createHash("sha256")
      .update(canonicalJson(semanticallyChangedConfig))
      .digest("hex");
    const changedConfigSource = `${JSON.stringify(semanticallyChangedConfig, null, 2)}\n`;
    const changedReceipt = structuredClone(
      prepared.receipt,
    ) as MutableResourceReceipt;
    changedReceipt.baseSpecSha256 = changedBaseSpecSha256;
    changedReceipt.sanitizedSpecSha256 = changedSanitizedSpecSha256;
    changedReceipt.configFileSha256 = createHash("sha256")
      .update(changedConfigSource)
      .digest("hex");
    changedReceipt.finalContainerId = createHash("sha256")
      .update(
        `counterlab-rootless-v5\0${changedReceipt.invocationId}\0${changedReceipt.stagingContainerId}\0${changedReceipt.sanitizedSpecSha256}\0${changedReceipt.commandSha256}\0${changedReceipt.internalMountManifestSha256}\0${changedReceipt.readOnlyMountManifestSha256}`,
      )
      .digest("hex");
    const { receiptPayloadSha256: _receiptHash, ...changedReceiptPayload } =
      changedReceipt;
    changedReceipt.receiptPayloadSha256 = createHash("sha256")
      .update(canonicalJson(changedReceiptPayload))
      .digest("hex");
    expect(() =>
      persistContainedRootlessSpec({
        config: changedConfigSource,
        finalContainerId: changedReceipt.finalContainerId,
        internalMounts: prepared.internalMounts,
        receipt: changedReceipt,
        sessionRoot,
      }),
    ).toThrow(/rlimit/u);
    const previousUmask = process.umask(0o077);
    let persisted: ReturnType<typeof persistContainedRootlessSpec>;
    try {
      persisted = persistContainedRootlessSpec({
        config: prepared.config,
        finalContainerId: prepared.finalContainerId,
        internalMounts: prepared.internalMounts,
        receipt: prepared.receipt,
        sessionRoot,
      });
    } finally {
      process.umask(previousUmask);
    }
    const binding = {
      ...persisted,
      finalContainerId: prepared.finalContainerId,
      sessionRoot,
    };

    expect(prepared.internalMounts).toHaveLength(3);
    const persistedConfig = JSON.parse(
      readFileSync(persisted.configPath, "utf8"),
    ) as { mounts: Array<{ destination: string; source: string }> };
    const internalSources = persistedConfig.mounts
      .filter((mount) =>
        ["/etc/hostname", "/etc/hosts", "/etc/resolv.conf"].includes(
          mount.destination,
        ),
      )
      .map((mount) => mount.source);
    expect(internalSources).toEqual([]);
    expect(statSync(persisted.imageRootfsPath).mode & 0o777).toBe(0o700);
    expect(() => verifyPersistedContainedRootlessSpec(binding)).not.toThrow();
    expect(() =>
      verifyPersistedContainedRootlessSpec({
        ...binding,
        configPath: resolve(root, "COUNTERLAB_REPO_ROOT"),
      }),
    ).toThrow(/persisted paths changed/u);
    writeFileSync(persisted.receiptPath, "{}\n", { mode: 0o600 });
    expect(() => verifyPersistedContainedRootlessSpec(binding)).toThrow(
      /persisted receipt changed/u,
    );
  });

  it("fails closed when owned final cleanup fails", async () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-cleanup");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const containerId = "d".repeat(64);
    const command = startupCommand();
    const fixture = imageFixture(command);
    const alias = `docker.io/library/counterlab-runtime-invocation:${invocationId}`;
    let stagingDeleted = false;
    let started = false;
    let finalId = "";
    let baseSpecSha256 = "";
    let finalContainerDeleted = false;
    let aliasPresent = false;
    let imageRootfsMounted = false;
    let imageRootfsUnmountAttempts = 0;
    let snapshotDiffInspections = 0;
    const imageRootfsPath = resolve(
      sessionRoot,
      `run/rootless-specs/${invocationId}.image-rootfs`,
    );
    const calls: string[][] = [];

    const fakeSpawn = (
      _program: string,
      args: string[],
      options: { timeout: number },
    ) => {
      calls.push(args);
      const joined = args.join(" ");
      if (
        joined.includes("image inspect docker.io/library/counterlab-runner")
      ) {
        return successful(fixture.targetSource);
      }
      if (joined.includes(`content get ${fixture.manifestDigest}`)) {
        return successful(fixture.manifestSource);
      }
      if (joined.includes(`content get ${fixture.configDigest}`)) {
        return successful(fixture.configSource);
      }
      if (joined.includes(`images inspect ${alias}`)) {
        return aliasPresent ? successful("{}") : missing();
      }
      if (joined.includes(`image inspect ${alias}`)) {
        return successful(aliasMetadata(alias, fixture));
      }
      if (joined.includes("images tag")) {
        aliasPresent = true;
        return successful();
      }
      if (joined.includes(`images remove ${alias}`)) {
        aliasPresent = false;
        return successful();
      }
      if (joined.includes("images mount")) {
        expect(options.timeout).toBe(300_000);
        imageRootfsMounted = true;
        return successful(
          `${fixture.authority.rootfsChainId}\n${imageRootfsPath}\n`,
        );
      }
      if (joined.includes("images unmount")) {
        expect(options.timeout).toBe(120_000);
        imageRootfsUnmountAttempts += 1;
        if (imageRootfsUnmountAttempts === 1) {
          return {
            status: 1,
            stdout: Buffer.alloc(0),
            stderr: Buffer.from("transient unmount failure\n"),
          };
        }
        imageRootfsMounted = false;
        return successful(`${imageRootfsPath}\n`);
      }
      if (joined.includes(" create ")) return successful(`${containerId}\n`);
      if (args.includes("--spec")) {
        return successful(
          rootlessSpec(
            containerId,
            {
              containerName: "counterlab-startup-validator",
              cpuCount: 2,
              maxProcesses: 32,
              memoryBytes: 4 * 1024 * 1024 * 1024,
              rlimits: [
                { type: "RLIMIT_CPU", soft: 300, hard: 300 },
                {
                  type: "RLIMIT_AS",
                  soft: 17179869184,
                  hard: 17179869184,
                },
                { type: "RLIMIT_FSIZE", soft: 1048576, hard: 1048576 },
                { type: "RLIMIT_NOFILE", soft: 64, hard: 64 },
              ],
              sessionRoot,
            },
            fixture.authority,
          ),
        );
      }
      if (joined.includes("containers info")) {
        const id = args.at(-1);
        if (id === containerId) {
          return stagingDeleted
            ? missing()
            : successful(containerMetadata(containerId, alias));
        }
        if (id === finalId && started && !finalContainerDeleted) {
          return successful(configContainerMetadata(finalId, baseSpecSha256));
        }
        return missing();
      }
      if (joined.includes("tasks list")) {
        return successful(
          started && !finalContainerDeleted ? `${finalId}\n` : "",
        );
      }
      if (joined.includes("snapshots") && joined.includes(" diff ")) {
        snapshotDiffInspections += 1;
        return successful(
          snapshotDiffInspections === 1
            ? "stable-rootfs-diff"
            : "changed-rootfs-diff",
        );
      }
      if (joined.includes("snapshots") && joined.includes(" info ")) {
        const id = args.at(-1);
        if (id === containerId)
          return stagingDeleted ? missing() : successful("{}");
        if (id === imageRootfsPath)
          return imageRootfsMounted
            ? successful(
                imageRootfsSnapshotMetadata(
                  imageRootfsPath,
                  fixture.authority.rootfsChainId,
                ),
              )
            : missing();
        return missing();
      }
      if (joined.includes(" rm --force ")) {
        stagingDeleted = true;
        return successful();
      }
      if (joined.includes(" run ")) {
        started = true;
        finalId = args.at(-1)!;
        const label = args.find((entry) =>
          entry.startsWith("io.counterlab.runtime.base-spec-sha256="),
        );
        baseSpecSha256 = label!.split("=", 2)[1]!;
        return successful("verified\n");
      }
      if (joined.includes("tasks delete")) {
        return {
          status: 1,
          stdout: Buffer.alloc(0),
          stderr: Buffer.from("cleanup refused\n"),
        };
      }
      if (joined.includes("containers delete")) {
        finalContainerDeleted = true;
        return successful();
      }
      throw new Error(`unexpected mock command: ${joined}`);
    };

    const qualificationCoordinator = {
      begin: () => {
        throw new Error("normal mode must not start qualification");
      },
      waitForDraft: () => {
        throw new Error("normal mode must not wait for qualification");
      },
      complete: () => {
        throw new Error("normal mode must not complete qualification");
      },
    };
    const result = await executeContainedRun(
      {
        args: command,
        binRoot: resolve(installRoot, "bin"),
        clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
        containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
        cwd: root,
        environment: process.env,
        installRoot,
        qualificationMode: null,
        sessionRoot,
        stdin: Buffer.alloc(0),
      },
      fakeSpawn,
      ({ finalContainerId, receipt, sessionRoot }) => ({
        configFileSha256: String(receipt.configFileSha256),
        configPath: resolve(
          sessionRoot,
          `run/rootless-specs/${finalContainerId}.config.json`,
        ),
        imageRootfsPath,
        receiptFileSha256: "4".repeat(64),
        receiptPath: resolve(
          sessionRoot,
          `run/rootless-specs/${finalContainerId}.receipt.json`,
        ),
      }),
      () => undefined,
      () => invocationId,
      undefined,
      qualificationCoordinator,
      () => undefined,
      () => undefined,
    );

    expect(result.status).toBe(1);
    expect(result.stdout.toString("utf8")).toBe("verified\n");
    expect(result.stderr.toString("utf8")).toContain(
      "contained runtime cleanup failed",
    );
    expect(result.stderr.toString("utf8")).toContain(
      "contained runtime image rootfs changed during execution",
    );
    expect(result.stderr.toString("utf8")).toContain(
      "contained runtime image rootfs cleanup failed",
    );
    expect(imageRootfsUnmountAttempts).toBe(2);
    expect(aliasPresent).toBe(false);
    expect(
      calls.some((args) => args.join(" ").includes(`images remove ${alias}`)),
    ).toBe(true);
    const startCall = calls.find((args) => args.includes("--config"));
    expect(startCall).toEqual(
      expect.arrayContaining([
        "--cgroup",
        `/counterlab-v6.1-${invocationId}`,
        "--label",
        `io.counterlab.runtime.invocation=${invocationId}`,
      ]),
    );
    expect(startCall).not.toContain(alias);
    expect(startCall?.at(-1)).toBe(finalId);
    expect(
      calls.some(
        (args) =>
          args.includes("delete") &&
          args.includes("snapshots") &&
          args.at(-1) === finalId,
      ),
    ).toBe(false);
  });

  it("rejects an invalid generated container ID without deleting by name", async () => {
    const sessionRoot = resolve(root, ".rt/rt-validator-id");
    const installRoot = resolve(
      root,
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    );
    const command = startupCommand();
    const fixture = imageFixture(command);
    const alias = `docker.io/library/counterlab-runtime-invocation:${invocationId}`;
    const calls: string[][] = [];
    let aliasPresent = false;
    const result = await executeContainedRun(
      {
        args: command,
        binRoot: resolve(installRoot, "bin"),
        clientFifoRoot: resolve(sessionRoot, "run/client-fifo"),
        containerdSocket: resolve(sessionRoot, "run/containerd.sock"),
        cwd: root,
        environment: process.env,
        installRoot,
        qualificationMode: null,
        sessionRoot,
        stdin: Buffer.alloc(0),
      },
      (_program, args) => {
        calls.push(args);
        const joined = args.join(" ");
        if (
          joined.includes("image inspect docker.io/library/counterlab-runner")
        ) {
          return successful(fixture.targetSource);
        }
        if (joined.includes(`content get ${fixture.manifestDigest}`)) {
          return successful(fixture.manifestSource);
        }
        if (joined.includes(`content get ${fixture.configDigest}`)) {
          return successful(fixture.configSource);
        }
        if (joined.includes(`images inspect ${alias}`)) {
          return aliasPresent ? successful("{}") : missing();
        }
        if (joined.includes(`image inspect ${alias}`)) {
          return successful(aliasMetadata(alias, fixture));
        }
        if (joined.includes("images tag")) {
          aliasPresent = true;
          return successful();
        }
        if (joined.includes(`images remove ${alias}`)) {
          aliasPresent = false;
          return successful();
        }
        if (joined.includes(" create ")) {
          return successful("counterlab-startup-validator\n");
        }
        throw new Error(`unexpected mock command: ${joined}`);
      },
      undefined,
      undefined,
      () => invocationId,
    );

    expect(result.status).toBe(1);
    expect(result.stderr.toString("utf8")).toContain(
      "create returned an invalid ID",
    );
    expect(aliasPresent).toBe(false);
    expect(
      calls.some((args) => args.join(" ").includes(`images remove ${alias}`)),
    ).toBe(true);
    expect(calls.some((args) => args.includes("delete"))).toBe(false);
    expect(calls.some((args) => args.includes("rm"))).toBe(false);
  });

  it("allows only a hash-bound drain control and keeps stop non-destructive", () => {
    expect(validate("counterlab-drain", "a".repeat(64)).status).toBe(0);
    expect(validate("counterlab-drain", "a".repeat(63)).status).not.toBe(0);
    expect(
      validate("counterlab-drain", "a".repeat(64), "extra").status,
    ).not.toBe(0);

    const stopSource = readFileSync(
      resolve(root, "scripts/stop-contained-runtime.mjs"),
      "utf8",
    );
    const supervisorSource = readFileSync(
      resolve(root, "scripts/contained-runtime-supervisor.mjs"),
      "utf8",
    );
    const launcherSource = readFileSync(
      resolve(root, "scripts/start-contained-runtime.sh"),
      "utf8",
    );
    const verifierSource = readFileSync(
      resolve(root, "scripts/verify-contained-runtime.mjs"),
      "utf8",
    );
    const attestationSource = readFileSync(
      resolve(root, "scripts/contained-runtime-attestation.mjs"),
      "utf8",
    );
    expect(launcherSource).toContain(
      "scripts/write-contained-runtime-attestation.mjs",
    );
    expect(launcherSource).toContain("contained-runtime-supervisor.mjs");
    expect(stopSource).toContain('action: "begin-drain"');
    expect(stopSource).toContain('action: "shutdown"');
    expect(stopSource).not.toContain("process.kill(");
    expect(supervisorSource).toContain('child.kill("SIGTERM")');
    expect(supervisorSource).not.toContain("process.kill(");
    expect(stopSource).not.toContain("SIGKILL");
    expect(supervisorSource).not.toContain("SIGKILL");
    expect(stopSource).not.toMatch(
      /\b(?:unlink|rmdir|rmSync|rm -|shutil\.rmtree)\b/u,
    );
    expect(supervisorSource).not.toMatch(
      /\b(?:unlink|rmdir|rmSync|rm -|shutil\.rmtree)\b/u,
    );
    for (const helper of [
      "runtimeStop",
      "timeoutProofDriver",
      "timeoutProofModule",
    ]) {
      expect(attestationSource).toContain(helper);
    }
    expect(verifierSource).toContain("Object.entries(RUNTIME_HELPER_PATHS)");
  });

  it("rejects root identities for scientific evidence containers", () => {
    const runtime = scientificRuntimeCommand();
    runtime[runtime.indexOf("1000:1000")] = "0:0";
    expect(validate(...runtime).status).not.toBe(0);

    const reachability = reachabilityCommand();
    reachability[reachability.indexOf("--user=1000:1000")] = "--user=0:0";
    expect(validate(...reachability).status).not.toBe(0);
  });

  it("rejects reachability command or review-path expansion", () => {
    const command = reachabilityCommand();
    command[
      command.indexOf("/repo/scripts/probe_cpython_htmlparser_reachability.py")
    ] = "/repo/scripts/verify_scientific_runtime.py";
    expect(validate(...command).status).not.toBe(0);

    const escaped = reachabilityCommand();
    escaped[escaped.length - 1] = "/repo/scientific-engines/registry.json";
    expect(validate(...escaped).status).not.toBe(0);

    const traversed = reachabilityCommand();
    traversed[traversed.length - 1] =
      `/repo/node_modules/.cache/counterlab-v6.1/scientific-evidence-${sourceCommit}-20260719T000000Z-1/../../../../scientific-engines/registry.json`;
    expect(validate(...traversed).status).not.toBe(0);
  });

  it("keeps the bounded adapter inputs in the source-bound build context", () => {
    const dockerIgnore = readFileSync(resolve(root, ".dockerignore"), "utf8");
    const sourceBuild = readFileSync(
      resolve(root, "scripts/build-source-bound-runner.sh"),
      "utf8",
    );
    const adapterDockerfile = readFileSync(
      resolve(root, "services/runner/Dockerfile"),
      "utf8",
    );

    expect(dockerIgnore).toContain("!services/runner/Dockerfile");
    expect(dockerIgnore).toContain("!services/runner/image");
    expect(dockerIgnore).toContain("!services/runner/image/harness.py");
    expect(sourceBuild).toContain(
      'tar -C "${NORMALIZED_OCI_LAYOUT}" -cf "${NORMALIZED_OCI_TAR}" \\\n  oci-layout index.json blobs',
    );
    expect(sourceBuild).not.toContain(
      'tar -C "${NORMALIZED_OCI_LAYOUT}" -cf "${NORMALIZED_OCI_TAR}" .',
    );
    // Restricted rootless build filesystems can collapse explicit modes to
    // 0700. Keep the read-only adapter rootfs traversable by its declared
    // non-root user even when that occurs.
    expect(adapterDockerfile).toContain(
      "chown 65532:65532 /opt /opt/counterlab /workspace /fixtures /output /tmp",
    );
    expect(adapterDockerfile).toContain("touch /fixtures/customer_churn.csv");
    expect(adapterDockerfile).toContain(
      "chmod 0444 /fixtures/customer_churn.csv",
    );
    expect(adapterDockerfile).toContain(
      "COPY --chown=65532:65532 --chmod=0444 concept-packs/leakage/public/counterlab_sdk.py",
    );
    expect(adapterDockerfile).toContain(
      "COPY --chown=65532:65532 --chmod=0555 services/runner/image/harness.py",
    );
  });

  it("keeps release diagnostics inside repository-owned files", () => {
    for (const file of [
      "start-contained-runtime.sh",
      "setup-contained-runtime.sh",
      "run-contained-pnpm.sh",
      "test-all.sh",
      "test-e2e.sh",
      "run-mutations.sh",
      "sandbox-smoke.sh",
      "verify-scientific-engines.sh",
      "deploy-qualified.sh",
      "production-smoke.sh",
      "refresh-source-bound-scientific-evidence.sh",
      "release-check.sh",
      "build-source-bound-runner.sh",
      "reproduce-session.sh",
      "replay-patch.sh",
    ]) {
      const script = readFileSync(resolve(root, "scripts", file), "utf8");
      expect(script, file).not.toContain("/dev/null");
      expect(script, file).toContain("pwd -P");
      expect(script, file).not.toMatch(/&& pwd\)"/u);
      if (script.includes("GIT_CONFIG_GLOBAL=")) {
        expect(script, file).toContain('"${GIT_CONFIG_GLOBAL}"');
      }
    }

    const environmentHelper = readFileSync(
      resolve(root, "scripts/prepare-contained-shell-environment.sh"),
      "utf8",
    );
    expect(environmentHelper).not.toContain("/dev/null");
    expect(environmentHelper).toContain("assert-contained-path.mjs");
    expect(environmentHelper).toContain("GIT_CONFIG_NOSYSTEM");

    const runtimeSetup = readFileSync(
      resolve(root, "scripts/setup-contained-runtime.sh"),
      "utf8",
    );
    for (const containedPath of [
      '"${HOME}"',
      '"${TMPDIR}"',
      '"${XDG_CACHE_HOME}"',
      '"${XDG_CONFIG_HOME}"',
      '"${XDG_DATA_HOME}"',
    ]) {
      expect(runtimeSetup.split(containedPath).length - 1).toBe(3);
    }
    expect(runtimeSetup.split('"${GIT_CONFIG_GLOBAL}"').length - 1).toBe(2);
    const runtimeSetupMkdirStart = runtimeSetup.indexOf("mkdir -p");
    const runtimeSetupMkdir = runtimeSetup.slice(
      runtimeSetupMkdirStart,
      runtimeSetup.indexOf(
        "node scripts/assert-contained-path.mjs",
        runtimeSetupMkdirStart,
      ),
    );
    expect(runtimeSetupMkdir).not.toContain('"${GIT_CONFIG_GLOBAL}"');

    const runtimeLauncher = readFileSync(
      resolve(root, "scripts/start-contained-runtime.sh"),
      "utf8",
    );
    const runtimeSupervisor = readFileSync(
      resolve(root, "scripts/contained-runtime-supervisor.mjs"),
      "utf8",
    );
    const attestationWriter = readFileSync(
      resolve(root, "scripts/write-contained-runtime-attestation.mjs"),
      "utf8",
    );
    const containerdConfigWriter = readFileSync(
      resolve(root, "scripts/contained-containerd-config.mjs"),
      "utf8",
    );
    expect(containerdConfigWriter).toContain(
      "[plugins.'io.containerd.transfer.v1.local']",
    );
    expect(containerdConfigWriter).toContain(
      "[[plugins.'io.containerd.transfer.v1.local'.unpack_config]]",
    );
    expect(containerdConfigWriter).toContain('platform = "linux/amd64"');
    expect(containerdConfigWriter).toContain(
      'CONTAINED_RUNTIME_SNAPSHOTTER = "fuse-overlayfs"',
    );
    expect(containerdConfigWriter).toContain(
      'snapshotter = "${CONTAINED_RUNTIME_SNAPSHOTTER}"',
    );
    expect(containerdConfigWriter).toContain(
      "[plugins.'io.containerd.shim.v1.manager']",
    );
    expect(runtimeLauncher).toContain("contained-runtime-supervisor.mjs");
    expect(runtimeSupervisor).toContain("contained-runtime-server.mjs");
    expect(runtimeLauncher).toContain("[otel]");
    expect(runtimeLauncher).toContain("buildkitOtelSocket");
    expect(attestationWriter).toContain("xdgRuntime");
    expect(
      readFileSync(
        resolve(root, "scripts/contained-runtime-server.mjs"),
        "utf8",
      ),
    ).toContain("await probeContainedShimSocketDirectory(shimSocketBinding)");

    const runtimeVerifier = readFileSync(
      resolve(root, "scripts/verify-contained-runtime.mjs"),
      "utf8",
    );
    const runtimeRunDeclaration = readFileSync(
      resolve(root, "scripts/contained-runtime-run.d.mts"),
      "utf8",
    );
    const planDeclaration = runtimeRunDeclaration.slice(
      runtimeRunDeclaration.indexOf("export interface ContainedRuntimeRunPlan"),
      runtimeRunDeclaration.indexOf(
        "export interface ContainedRuntimeRunPlanInput",
      ),
    );
    const inputDeclaration = runtimeRunDeclaration.slice(
      runtimeRunDeclaration.indexOf(
        "export interface ContainedRuntimeRunPlanInput",
      ),
      runtimeRunDeclaration.indexOf("export type ContainedRuntimeRunContext"),
    );
    expect(planDeclaration).toContain(
      "inspectImagePresence: ContainedRuntimeCommand;",
    );
    expect(planDeclaration).toContain(
      "inspectSnapshotDiff: ContainedRuntimeCommand;",
    );
    expect(inputDeclaration).toContain("invocationId: string;");
    expect(inputDeclaration).not.toContain("invocationId?: string;");
    for (const attestedPath of ["clientFifoRoot", "runcStateRoot"]) {
      expect(attestationWriter, attestedPath).toContain(attestedPath);
      expect(runtimeVerifier, attestedPath).toContain(attestedPath);
    }
    const runtimeAttestation = readFileSync(
      resolve(root, "scripts/contained-runtime-attestation.mjs"),
      "utf8",
    );
    for (const attestedHelper of [
      "runtimeRun",
      "rootlessSpec",
      "imageAuthority",
      "runtimeEnvironment",
      "runcWrapper",
      "containerdConfigWriter",
    ]) {
      expect(runtimeAttestation, attestedHelper).toContain(attestedHelper);
    }
    expect(runtimeVerifier).toContain("Object.entries(RUNTIME_HELPER_PATHS)");

    const secretScan = readFileSync(
      resolve(root, "scripts/secret-scan.py"),
      "utf8",
    );
    expect(secretScan).toContain("assert_repository_path");
    expect(secretScan).toContain("path traverses a repository symlink");
  });

  it("allows bounded image inspection and repository OCI input", () => {
    expect(
      validate("image", "inspect", image, "--format", "{{.Config.User}}")
        .status,
    ).toBe(0);
    expect(
      validate("load", "--platform", "linux/amd64", "--input", "package.json")
        .status,
    ).toBe(0);
    expect(validate("load", "--input", "package.json").status).not.toBe(0);
    expect(
      validate("load", "--platform", "linux/arm64", "--input", "package.json")
        .status,
    ).not.toBe(0);
  });

  it("rejects a shell command appended to the bounded adapter profile", () => {
    const result = validate(...boundedAdapterCommand(), "sh", "-c", "id");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/profile is incomplete/u);
  });

  it("rejects a host-user process rlimit in the bounded adapter profile", () => {
    const command = boundedAdapterCommand();
    command.splice(command.length - 1, 0, "--ulimit=nproc=16:16");
    const result = validate(...command);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/option shape is not approved/u);
  });

  it("rejects extra environment in the startup profile", () => {
    const command = startupCommand();
    command.splice(command.length - 1, 0, "-e", "OPENAI_API_KEY=$FORBIDDEN");
    const result = validate(...command);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/option shape is not approved/u);
  });

  it("rejects writable source and fixture mounts", () => {
    const command = boundedAdapterCommand();
    const fixtureIndex = command.findIndex((value) =>
      value.includes("dst=/fixtures/customer_churn.csv"),
    );
    command[fixtureIndex] = command[fixtureIndex]!.replace(",readonly", "");
    const result = validate(...command);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/mounts are invalid/u);
  });

  it("rejects a writable alias of the read-only workspace", () => {
    const command = boundedAdapterCommand();
    const outputIndex = command.findIndex((value) =>
      value.includes("dst=/output"),
    );
    command[outputIndex] = `type=bind,src=${workspace},dst=/output`;

    const result = validate(...command);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/mounts are invalid/u);
  });

  it("rejects nested writable and read-only mount sources", () => {
    const command = boundedAdapterCommand();
    const outputIndex = command.findIndex((value) =>
      value.includes("dst=/output"),
    );
    command[outputIndex] =
      `type=bind,src=${resolve(workspace, "nested")},dst=/output`;
    mkdirSync(resolve(workspace, "nested"), {
      recursive: true,
      mode: 0o700,
    });

    const result = validate(...command);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/mounts are invalid/u);
  });

  it("rejects non-source-bound images and paths outside the repository", () => {
    expect(
      validate("image", "inspect", "counterlab-runner:latest").status,
    ).not.toBe(0);
    const escaped = validate(
      "load",
      "--platform",
      "linux/amd64",
      "--input",
      "../outside.oci",
    );
    expect(escaped.status).not.toBe(0);
    expect(escaped.stderr).toMatch(/escaped the repository/u);
  });

  it("rejects registry mutation commands with incoherent source tags", () => {
    const coherentRegistry =
      "registry.cloudflare.com/account-1/counterlab-runner:git-" + sourceCommit;
    const incoherentRegistry =
      "registry.cloudflare.com/account-1/counterlab-runner:git-" +
      "d".repeat(40);
    expect(validate("tag", image, coherentRegistry).status).toBe(0);
    expect(validate("tag", image, incoherentRegistry).status).not.toBe(0);
    expect(
      validate(
        "tag",
        image,
        "registry.cloudflare.com/account-1/counterlab-runner:latest",
      ).status,
    ).not.toBe(0);
  });
});
