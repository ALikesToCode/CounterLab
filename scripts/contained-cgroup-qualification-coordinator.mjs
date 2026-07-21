import { spawn } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalCgroupJson,
  sha256CgroupBytes,
} from "./contained-cgroup-evidence.mjs";
import { resolveContainedCgroupObserverBindings } from "./contained-cgroup-observer-bindings.mjs";
import {
  validateContainedCgroupObserverDraft,
  validateContainedCgroupObserverFailure,
  validateContainedCgroupObserverReady,
} from "./contained-cgroup-observer.mjs";
import {
  containedCgroupQualificationPaths,
  createContainedCgroupObserverFinalization,
  createContainedCgroupObserverManifest,
} from "./contained-cgroup-observer-protocol.mjs";
import {
  persistQualifiedContainedRootlessReceipt,
  verifyQualifiedContainedRootlessReceipt,
} from "./contained-qualified-receipt-store.mjs";
import { UNQUALIFIED_AGGREGATE_LIMIT_MODE } from "./contained-qualified-rootless-receipt.mjs";

const repositoryRoot = realpathSync(
  resolve(fileURLToPath(import.meta.url), "../.."),
);
const maximumArtifactBytes = 1_048_576;
const maximumObserverOutputBytes = 8_192;
const observerArtifactTimeoutMs = 30_000;
const observerExitTimeoutMs = 30_000;
const observerForcedExitTimeoutMs = 2_000;
const maximumObservationAgeMs = 5 * 60_000;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const cleanupKeys = [
  "containerAbsent",
  "imageRootfsAbsent",
  "imageRootfsUnchanged",
  "invocationAliasAbsent",
  "persistedAuthorityVerified",
  "readOnlyMountsUnchanged",
  "snapshotAbsent",
  "taskAbsent",
];

function contained(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return (
    fromParent === "" ||
    (!fromParent.startsWith("..") && !isAbsolute(fromParent))
  );
}

function privateDirectory(path, label) {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o777) !== 0o700
  ) {
    throw new Error(`contained cgroup coordinator ${label} is invalid`);
  }
}

function privateFile(path, label) {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o600) !== 0o600 ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size < 1 ||
    metadata.size > maximumArtifactBytes
  ) {
    throw new Error(`contained cgroup coordinator ${label} is invalid`);
  }
}

function lstatOrAbsent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function writeArtifact(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  privateFile(path, "artifact");
}

function readArtifact(path, label) {
  privateFile(path, label);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`contained cgroup coordinator ${label} JSON is invalid`, {
      cause: error,
    });
  }
}

function exactDate(value, label) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`contained cgroup coordinator ${label} is invalid`);
  }
  return value;
}

function chronologicalTimestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`contained cgroup coordinator ${label} is invalid`);
  }
  return parsed;
}

function defaultSleep(milliseconds) {
  return new Promise((accept) => setTimeout(accept, milliseconds));
}

async function settleCompletionState() {
  await Promise.resolve();
  await Promise.resolve();
}

function defaultStartObserver({ manifestPath, runtimeSessionId }) {
  const observerPath = resolve(
    repositoryRoot,
    "scripts/contained-cgroup-observer.mjs",
  );
  const child = spawn(
    process.execPath,
    [
      observerPath,
      "--session-id",
      runtimeSessionId,
      "--manifest",
      manifestPath,
    ],
    {
      cwd: repositoryRoot,
      env: { LANG: "C", LC_ALL: "C", TZ: "UTC" },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  let stderrBytes = 0;
  let outputExceeded = false;
  child.stderr.on("data", (chunk) => {
    stderrBytes += Buffer.byteLength(chunk);
    if (stderrBytes > maximumObserverOutputBytes) {
      outputExceeded = true;
      child.kill("SIGTERM");
    }
  });
  let settled = false;
  const completion = new Promise((accept) => {
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      accept({ ...outcome, outputExceeded });
    };
    child.once("error", (error) => finish({ code: null, signal: null, error }));
    child.once("close", (code, signal) =>
      finish({ code, signal, error: undefined }),
    );
  });
  return {
    completion,
    isRunning: () => child.exitCode === null && child.signalCode === null,
    pid: child.pid,
    terminate: (signal) => child.kill(signal),
  };
}

function validateBaseReceipt(input, observerBindings) {
  if (
    !isAbsolute(input.sessionRoot) ||
    !contained(repositoryRoot, input.sessionRoot) ||
    !sha256Pattern.test(input.baseReceiptFileSha256 ?? "") ||
    !sha256Pattern.test(input.baseReceiptPayloadSha256 ?? "") ||
    !sha256Pattern.test(input.finalContainerId ?? "") ||
    !sha256Pattern.test(input.invocationId ?? "") ||
    !sha256Pattern.test(input.sanitizedSpecSha256 ?? "")
  ) {
    throw new Error("contained cgroup coordinator base input is invalid");
  }
  const expectedPath = resolve(
    input.sessionRoot,
    `run/rootless-specs/${input.finalContainerId}.receipt.json`,
  );
  if (
    input.baseReceiptPath !== expectedPath ||
    input.sessionRoot !==
      resolve(repositoryRoot, ".rt", observerBindings.runtimeSessionId)
  ) {
    throw new Error("contained cgroup coordinator base path is invalid");
  }
  privateFile(input.baseReceiptPath, "base receipt");
  const source = readFileSync(input.baseReceiptPath);
  let receipt;
  try {
    receipt = JSON.parse(source.toString("utf8"));
  } catch (error) {
    throw new Error("contained cgroup coordinator base JSON is invalid", {
      cause: error,
    });
  }
  const { receiptPayloadSha256, ...payload } = receipt;
  if (
    sha256CgroupBytes(source) !== input.baseReceiptFileSha256 ||
    receiptPayloadSha256 !== input.baseReceiptPayloadSha256 ||
    sha256CgroupBytes(canonicalCgroupJson(payload)) !== receiptPayloadSha256 ||
    receipt.schemaVersion !== "4" ||
    receipt.status !== "VALIDATED" ||
    receipt.limitMode !== UNQUALIFIED_AGGREGATE_LIMIT_MODE ||
    receipt.aggregateLimitIntentEnforced !== false ||
    receipt.aggregateLimitEvidence !== null ||
    receipt.invocationId !== input.invocationId ||
    receipt.finalContainerId !== input.finalContainerId ||
    receipt.sanitizedSpecSha256 !== input.sanitizedSpecSha256 ||
    canonicalCgroupJson(receipt.intendedAggregateLimits) !==
      canonicalCgroupJson(input.intendedAggregateLimits)
  ) {
    throw new Error("contained cgroup coordinator base binding changed");
  }
  return receipt;
}

function prepareQualificationDirectories(paths) {
  privateDirectory(resolve(repositoryRoot, ".rt"), "runtime root");
  privateDirectory(paths.sessionRoot, "session root");
  try {
    mkdirSync(paths.qualificationRoot, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  privateDirectory(paths.qualificationRoot, "qualification root");
  mkdirSync(paths.invocationRoot, { mode: 0o700 });
  privateDirectory(paths.invocationRoot, "invocation root");
}

function processOutcomeSucceeded(outcome) {
  return (
    outcome?.code === 0 &&
    outcome?.signal === null &&
    outcome?.error === undefined &&
    outcome?.outputExceeded === false
  );
}

function exactOutcome(value) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(
        [
          "cleanup",
          "resultReleased",
          "runtimeFailed",
          "timeoutObserved",
        ].sort(),
      )
  ) {
    throw new Error("contained cgroup coordinator outcome is invalid");
  }
  const cleanup = value.cleanup;
  if (
    cleanup === null ||
    typeof cleanup !== "object" ||
    Array.isArray(cleanup) ||
    JSON.stringify(Object.keys(cleanup).sort()) !==
      JSON.stringify([...cleanupKeys].sort()) ||
    cleanupKeys.some((key) => typeof cleanup[key] !== "boolean") ||
    typeof value.resultReleased !== "boolean" ||
    typeof value.runtimeFailed !== "boolean" ||
    typeof value.timeoutObserved !== "boolean"
  ) {
    throw new Error("contained cgroup coordinator outcome is invalid");
  }
  return value;
}

function finalizationDecision(state, outcome) {
  if (state.draft === undefined) {
    return { abortCode: "OBSERVER_FAILED", status: "ABORT" };
  }
  if (outcome.runtimeFailed) {
    return { abortCode: "RUNTIME_FAILED", status: "ABORT" };
  }
  if (!outcome.timeoutObserved) {
    return { abortCode: "TIMEOUT_NOT_OBSERVED", status: "ABORT" };
  }
  if (outcome.resultReleased) {
    return { abortCode: "RESULT_RELEASED", status: "ABORT" };
  }
  if (cleanupKeys.some((key) => outcome.cleanup[key] !== true)) {
    return { abortCode: "CLEANUP_UNVERIFIED", status: "ABORT" };
  }
  return { abortCode: null, status: "FINALIZE" };
}

export function createContainedCgroupQualificationCoordinator({
  now = () => new Date(),
  persistQualifiedReceipt = persistQualifiedContainedRootlessReceipt,
  resolveObserverBindings = resolveContainedCgroupObserverBindings,
  sleep = defaultSleep,
  startObserver = defaultStartObserver,
  verifyQualifiedReceipt = verifyQualifiedContainedRootlessReceipt,
} = {}) {
  const states = new WeakMap();

  function normalizeCompletion(completion) {
    return completion.then(
      (outcome) => outcome,
      (error) => ({
        code: null,
        error:
          error instanceof Error
            ? error
            : new Error("contained cgroup observer completion failed"),
        outputExceeded: false,
        signal: null,
      }),
    );
  }

  async function boundedCompletion(state, timeoutMs = observerExitTimeoutMs) {
    if (
      state.processOutcome !== undefined &&
      state.process.isRunning() === false
    ) {
      return state.processOutcome;
    }
    let timer;
    try {
      const outcome = await Promise.race([
        state.process.completion,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error("contained cgroup coordinator observer timed out"),
              ),
            timeoutMs,
          );
        }),
      ]);
      if (state.process.isRunning() === true) {
        throw new Error(
          "contained cgroup coordinator completion preceded observer exit",
        );
      }
      return outcome;
    } finally {
      clearTimeout(timer);
    }
  }

  async function waitForStoppedProcess(state, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (state.process.isRunning() === true && Date.now() <= deadline) {
      await sleep(10);
    }
    if (state.process.isRunning() === true) {
      throw new Error("contained cgroup coordinator observer did not exit");
    }
    return boundedCompletion(state, Math.max(1, deadline - Date.now()));
  }

  async function stopObserver(state) {
    if (state.process.isRunning() === false) {
      return boundedCompletion(state, observerForcedExitTimeoutMs);
    }
    let terminationError;
    try {
      state.process.terminate("SIGTERM");
    } catch (error) {
      terminationError = error;
    }
    try {
      return await waitForStoppedProcess(state, observerForcedExitTimeoutMs);
    } catch (graceError) {
      try {
        state.process.terminate("SIGKILL");
      } catch (error) {
        throw new Error(
          "contained cgroup coordinator could not terminate observer",
          {
            cause: new AggregateError(
              [terminationError, graceError, error].filter(Boolean),
            ),
          },
        );
      }
      try {
        return await waitForStoppedProcess(state, observerForcedExitTimeoutMs);
      } catch (forcedError) {
        throw new Error(
          "contained cgroup coordinator could not reap observer",
          {
            cause: new AggregateError(
              [terminationError, graceError, forcedError].filter(Boolean),
            ),
          },
        );
      }
    }
  }

  async function stopAfterFailure(state, originalError, label) {
    try {
      await stopObserver(state);
    } catch (terminationError) {
      throw new Error(
        `contained cgroup coordinator ${label} and observer termination failed`,
        {
          cause: new AggregateError([originalError, terminationError]),
        },
      );
    }
    throw originalError;
  }

  async function waitForArtifact(state, path, label, validator) {
    const deadline = Date.now() + observerArtifactTimeoutMs;
    while (Date.now() <= deadline) {
      if (lstatOrAbsent(state.paths.failurePath) !== null) {
        validateContainedCgroupObserverFailure(
          readArtifact(state.paths.failurePath, "observer failure"),
          state.manifest,
        );
        throw new Error("contained cgroup coordinator observer failed");
      }
      if (
        state.processOutcome !== undefined ||
        state.process.isRunning() !== true
      ) {
        throw new Error(
          `contained cgroup coordinator observer exited before ${label}`,
        );
      }
      if (lstatOrAbsent(path) !== null) {
        return validator(readArtifact(path, label), state.manifest);
      }
      await sleep(10);
    }
    throw new Error(`contained cgroup coordinator ${label} timed out`);
  }

  async function begin(input) {
    const observerBindings = resolveObserverBindings({
      sessionRoot: input.sessionRoot,
    });
    const baseReceipt = validateBaseReceipt(input, observerBindings);
    const paths = containedCgroupQualificationPaths({
      repositoryRoot,
      runtimeSessionId: observerBindings.runtimeSessionId,
      invocationId: input.invocationId,
    });
    prepareQualificationDirectories(paths);
    const requestedAt = exactDate(now(), "request time");
    const manifest = createContainedCgroupObserverManifest({
      baseReceiptFileSha256: input.baseReceiptFileSha256,
      baseReceiptPayloadSha256: input.baseReceiptPayloadSha256,
      finalContainerId: input.finalContainerId,
      intendedAggregateLimits: input.intendedAggregateLimits,
      invocationId: input.invocationId,
      observerBindings,
      requestedAt,
      sanitizedSpecSha256: input.sanitizedSpecSha256,
    });
    writeArtifact(paths.manifestPath, manifest);
    let rawProcessHandle;
    try {
      rawProcessHandle = startObserver({
        manifest,
        manifestPath: paths.manifestPath,
        paths,
        runtimeSessionId: observerBindings.runtimeSessionId,
      });
      if (
        !Number.isSafeInteger(rawProcessHandle?.pid) ||
        rawProcessHandle.pid < 1 ||
        !(rawProcessHandle.completion instanceof Promise) ||
        typeof rawProcessHandle.isRunning !== "function" ||
        typeof rawProcessHandle.terminate !== "function"
      ) {
        throw new Error("contained cgroup coordinator process is invalid");
      }
    } catch (error) {
      if (typeof rawProcessHandle?.terminate === "function") {
        try {
          if (
            rawProcessHandle.completion instanceof Promise &&
            typeof rawProcessHandle.isRunning === "function"
          ) {
            const partialState = {
              process: {
                ...rawProcessHandle,
                completion: normalizeCompletion(rawProcessHandle.completion),
              },
              processOutcome: undefined,
            };
            partialState.process.completion.then((outcome) => {
              partialState.processOutcome = outcome;
            });
            await stopObserver(partialState);
          } else {
            rawProcessHandle.terminate("SIGTERM");
            rawProcessHandle.terminate("SIGKILL");
            throw new Error("partial observer exit could not be verified");
          }
        } catch (terminationError) {
          throw new Error(
            "contained cgroup coordinator observer start and termination failed",
            {
              cause: new AggregateError([error, terminationError]),
            },
          );
        }
      }
      throw new Error("contained cgroup coordinator observer start failed", {
        cause: error,
      });
    }
    const processHandle = {
      ...rawProcessHandle,
      completion: normalizeCompletion(rawProcessHandle.completion),
    };
    const handle = Object.freeze({
      finalContainerId: input.finalContainerId,
      invocationId: input.invocationId,
    });
    const state = {
      baseReceipt,
      input,
      manifest,
      observerBindings,
      paths,
      process: processHandle,
      processOutcome: undefined,
    };
    states.set(handle, state);
    processHandle.completion.then((outcome) => {
      state.processOutcome = outcome;
    });
    try {
      const ready = await waitForArtifact(
        state,
        paths.observerReadyPath,
        "observer readiness",
        validateContainedCgroupObserverReady,
      );
      await settleCompletionState();
      const readinessCheckedAt = exactDate(now(), "readiness check time");
      const requestedAtMs = chronologicalTimestamp(
        manifest.requestedAt,
        "request timestamp",
      );
      const armedAtMs = chronologicalTimestamp(
        ready.armedAt,
        "readiness timestamp",
      );
      if (
        state.processOutcome !== undefined ||
        processHandle.isRunning() !== true ||
        ready.observerPid !== processHandle.pid ||
        armedAtMs < requestedAtMs ||
        armedAtMs > readinessCheckedAt.getTime() ||
        readinessCheckedAt.getTime() - armedAtMs > maximumObservationAgeMs
      ) {
        throw new Error(
          "contained cgroup coordinator observer readiness binding changed",
        );
      }
      state.ready = ready;
      return handle;
    } catch (error) {
      return stopAfterFailure(state, error, "readiness failed");
    }
  }

  async function waitForDraft(handle) {
    const state = states.get(handle);
    if (state === undefined || state.ready === undefined || state.finalized) {
      throw new Error("contained cgroup coordinator handle is invalid");
    }
    if (state.draft !== undefined) return state.draft;
    try {
      const draft = await waitForArtifact(
        state,
        state.paths.observerDraftPath,
        "observer draft",
        validateContainedCgroupObserverDraft,
      );
      await settleCompletionState();
      const draftCheckedAt = exactDate(now(), "draft check time");
      const armedAtMs = chronologicalTimestamp(
        state.ready.armedAt,
        "readiness timestamp",
      );
      const observedAtMs = chronologicalTimestamp(
        draft.observedAt,
        "draft timestamp",
      );
      if (
        state.processOutcome !== undefined ||
        state.process.isRunning() !== true ||
        observedAtMs < armedAtMs ||
        observedAtMs > draftCheckedAt.getTime() ||
        draftCheckedAt.getTime() - observedAtMs > maximumObservationAgeMs
      ) {
        throw new Error(
          "contained cgroup coordinator draft chronology changed",
        );
      }
      state.draft = draft;
      return draft;
    } catch (error) {
      return stopAfterFailure(state, error, "draft validation failed");
    }
  }

  async function complete(handle, rawOutcome) {
    const state = states.get(handle);
    if (state === undefined || state.ready === undefined || state.finalized) {
      throw new Error("contained cgroup coordinator handle is invalid");
    }
    const outcome = exactOutcome(rawOutcome);
    const decision = finalizationDecision(state, outcome);
    const cleanupVerified = cleanupKeys.every(
      (key) => outcome.cleanup[key] === true,
    );
    const finalization = createContainedCgroupObserverFinalization(
      state.manifest,
      {
        abortCode: decision.abortCode,
        cleanup: outcome.cleanup,
        cleanupVerified,
        decisionAt: exactDate(now(), "decision time"),
        observerDraftPayloadSha256: state.draft?.receiptPayloadSha256 ?? null,
        resultReleased: outcome.resultReleased,
        status: decision.status,
        timeoutObserved: outcome.timeoutObserved,
      },
    );
    writeArtifact(state.paths.finalizationPath, finalization);
    state.finalized = true;
    if (decision.status === "ABORT") {
      const abortError = new Error(
        `contained cgroup coordinator qualification aborted: ${decision.abortCode}`,
      );
      return stopAfterFailure(state, abortError, "qualification aborted");
    }

    let processOutcome;
    try {
      processOutcome = await boundedCompletion(state);
    } catch (error) {
      return stopAfterFailure(state, error, "completion failed");
    }
    if (!processOutcomeSucceeded(processOutcome)) {
      return stopAfterFailure(
        state,
        new Error("contained cgroup coordinator observer failed"),
        "observer failed",
      );
    }
    if (
      lstatOrAbsent(state.paths.failurePath) !== null ||
      lstatOrAbsent(state.paths.evidencePath) === null
    ) {
      throw new Error(
        "contained cgroup coordinator terminal outcome is invalid",
      );
    }
    const qualified = persistQualifiedReceipt({
      baseReceiptFileSha256: state.input.baseReceiptFileSha256,
      baseReceiptPath: state.input.baseReceiptPath,
      finalContainerId: state.input.finalContainerId,
      sessionRoot: state.input.sessionRoot,
    });
    verifyQualifiedReceipt({
      baseReceiptFileSha256: state.input.baseReceiptFileSha256,
      baseReceiptPath: state.input.baseReceiptPath,
      finalContainerId: state.input.finalContainerId,
      qualifiedReceiptFileSha256: qualified.qualifiedReceiptFileSha256,
      qualifiedReceiptPath: qualified.qualifiedReceiptPath,
      sessionRoot: state.input.sessionRoot,
    });
    return qualified;
  }

  return Object.freeze({ begin, complete, waitForDraft });
}

export const containedCgroupQualificationCoordinator =
  createContainedCgroupQualificationCoordinator();
