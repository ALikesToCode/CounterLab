import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalCgroupJson,
  createContainedCgroupIdentity,
  sha256CgroupBytes,
} from "./contained-cgroup-evidence.mjs";
import {
  persistQualifiedContainedRootlessReceipt,
  verifyQualifiedContainedRootlessReceipt,
} from "./contained-qualified-receipt-store.mjs";
import { UNQUALIFIED_AGGREGATE_LIMIT_MODE } from "./contained-qualified-rootless-receipt.mjs";

const root = process.cwd();
const invocationId = "1".repeat(64);
const finalContainerId = "2".repeat(64);
const sanitizedSpecSha256 = "3".repeat(64);
const intendedAggregateLimits = {
  cpuCount: 1,
  maxProcesses: 16,
  memoryBytes: 512 * 1024 * 1024,
};
const observerBindings = {
  runtimeAttestationSha256: "4".repeat(64),
  runtimeSessionId: "rt-v61-test1",
  driverCliSha256: "5".repeat(64),
  driverModuleSha256: "6".repeat(64),
};

function hashed<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    receiptPayloadSha256: sha256CgroupBytes(canonicalCgroupJson(payload)),
  };
}

function baseReceipt() {
  return hashed({
    schemaVersion: "4",
    status: "VALIDATED",
    limitMode: UNQUALIFIED_AGGREGATE_LIMIT_MODE,
    aggregateLimitIntentEnforced: false,
    invocationId,
    stagingContainerId: "7".repeat(64),
    finalContainerId,
    metadataSha256: "8".repeat(64),
    originalSpecSha256: "9".repeat(64),
    baseSpecSha256: "a".repeat(64),
    sanitizedSpecSha256,
    configFileSha256: "b".repeat(64),
    internalMountManifest: [],
    internalMountManifestSha256: "c".repeat(64),
    readOnlyMountManifest: [],
    readOnlyMountManifestSha256: "d".repeat(64),
    commandSha256: "e".repeat(64),
    imageAuthority: {},
    imageRootfs: {},
    removedFields: [],
    normalizedFields: [],
    removedMounts: [],
    intendedAggregateLimits,
    enforcedRlimits: [],
    aggregateLimitEvidence: null,
  });
}

function aggregateEvidence() {
  const memberPids = [100, 101];
  return hashed({
    schemaVersion: "1",
    status: "OBSERVED",
    authority: "linux-cgroup-v2",
    cgroupVersion: 2,
    cgroupId: `counterlab-v6.1-${invocationId}`,
    cgroupPath: `counterlab-v6.1/${invocationId}`,
    cgroupIdentity: createContainedCgroupIdentity({
      invocationId,
      finalContainerId,
      sanitizedSpecSha256,
    }),
    invocationId,
    finalContainerId,
    sanitizedSpecSha256,
    runtimeAttestationSha256: observerBindings.runtimeAttestationSha256,
    observedLimits: {
      memoryMaxBytes: intendedAggregateLimits.memoryBytes,
      memorySwapMaxBytes: intendedAggregateLimits.memoryBytes,
      pidsMax: intendedAggregateLimits.maxProcesses,
      cpuQuotaMicros: 100_000,
      cpuPeriodMicros: 100_000,
    },
    membership: {
      leaderPid: 100,
      leaderStartTimeTicks: "12345",
      memberPids,
      memberSetSha256: sha256CgroupBytes(canonicalCgroupJson(memberPids)),
      descendantsObserved: true,
    },
    negativeControls: {
      memory: {
        requestedBytes: intendedAggregateLimits.memoryBytes + 1,
        oomKillBefore: 0,
        oomKillAfter: 1,
        enforced: true,
      },
      processes: {
        attemptedProcesses: intendedAggregateLimits.maxProcesses + 1,
        maxEventsBefore: 0,
        maxEventsAfter: 1,
        enforced: true,
      },
      cpu: {
        busyWindowMs: 500,
        nrThrottledBefore: 0,
        nrThrottledAfter: 1,
        throttledUsecBefore: 0,
        throttledUsecAfter: 1,
        enforced: true,
      },
    },
    cleanup: { cgroupAbsentAfterTimeout: true },
    observer: {
      runtimeSessionId: observerBindings.runtimeSessionId,
      driverCliSha256: observerBindings.driverCliSha256,
      driverModuleSha256: observerBindings.driverModuleSha256,
    },
    observedAt: "2026-07-20T12:00:00.000Z",
  });
}

function fixture() {
  const parent = resolve(
    root,
    "node_modules/.cache/counterlab-v6.1/tmp/qualified-receipt-store",
  );
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const sessionRoot = mkdtempSync(resolve(parent, "rt-store-"));
  const runRoot = resolve(sessionRoot, "run");
  const specRoot = resolve(runRoot, "rootless-specs");
  mkdirSync(specRoot, { recursive: true, mode: 0o700 });
  const baseReceiptPath = resolve(specRoot, `${finalContainerId}.receipt.json`);
  const source = `${JSON.stringify(baseReceipt(), null, 2)}\n`;
  writeFileSync(baseReceiptPath, source, { mode: 0o600, flag: "wx" });
  return {
    baseReceiptFileSha256: sha256CgroupBytes(source),
    baseReceiptPath,
    sessionRoot,
  };
}

describe("qualified rootless receipt store", () => {
  it("creates and verifies one distinct qualified receipt", () => {
    const input = fixture();
    const persisted = persistQualifiedContainedRootlessReceipt({
      ...input,
      aggregateLimitEvidence: aggregateEvidence(),
      finalContainerId,
      observerBindings,
    });

    expect(persisted.qualifiedReceiptPath).toBe(
      resolve(
        input.sessionRoot,
        `run/rootless-specs/${finalContainerId}.qualified-receipt.json`,
      ),
    );
    expect(readFileSync(input.baseReceiptPath, "utf8")).toBe(
      `${JSON.stringify(baseReceipt(), null, 2)}\n`,
    );
    expect(() =>
      verifyQualifiedContainedRootlessReceipt({
        ...input,
        finalContainerId,
        observerBindings,
        qualifiedReceiptFileSha256: persisted.qualifiedReceiptFileSha256,
        qualifiedReceiptPath: persisted.qualifiedReceiptPath,
      }),
    ).not.toThrow();
    expect(() =>
      persistQualifiedContainedRootlessReceipt({
        ...input,
        aggregateLimitEvidence: aggregateEvidence(),
        finalContainerId,
        observerBindings,
      }),
    ).toThrow(/already exists/u);
  });

  it("rejects path, hash, and symbolic-link drift", () => {
    const wrongHash = fixture();
    expect(() =>
      persistQualifiedContainedRootlessReceipt({
        ...wrongHash,
        aggregateLimitEvidence: aggregateEvidence(),
        baseReceiptFileSha256: "0".repeat(64),
        finalContainerId,
        observerBindings,
      }),
    ).toThrow(/base receipt/u);

    const linked = fixture();
    const linkedPath = resolve(
      linked.sessionRoot,
      "run/rootless-specs/link.json",
    );
    symlinkSync(linked.baseReceiptPath, linkedPath);
    expect(() =>
      persistQualifiedContainedRootlessReceipt({
        ...linked,
        aggregateLimitEvidence: aggregateEvidence(),
        baseReceiptPath: linkedPath,
        finalContainerId,
        observerBindings,
      }),
    ).toThrow(/path/u);
  });
});
