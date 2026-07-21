from __future__ import annotations

import hashlib
import json
import math
import os
import re
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .docker import (
    CONTAINED_RUNTIME_POLICY_SHA256,
    DockerAdapterExecutor,
    DockerExecutionError,
    bind_contained_runtime_adapter,
    create_repository_work_directory,
    require_trusted_repository_root,
)
from .workspace import create_fresh_workspace, validate_generated_workspace


_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_DIGEST = re.compile(r"^sha256:[a-f0-9]{64}$")
_SOURCE_COMMIT = re.compile(r"^[a-f0-9]{40}$")
_SESSION_ID = re.compile(r"^rt-[a-z0-9][a-z0-9-]{7,13}$")
_QUALIFIED_AGGREGATE_LIMIT_MODE = "container-cgroup-and-process-rlimit"
_AGGREGATE_TIMEOUT_QUALIFICATION_MODE = "aggregate-timeout-proof-v1"
_BUILD_KEYS = {
    "schemaVersion",
    "status",
    "sourceCommit",
    "sourceArchiveSha256",
    "sourceTreeSha256",
    "dockerfileSha256",
    "localImageTag",
    "localImageDigest",
    "localManifestDigest",
    "localOciArchive",
    "localOciArchiveSha256",
    "adapterDockerfileSha256",
    "adapterImageTag",
    "adapterImageDigest",
    "adapterManifestDigest",
    "adapterOciArchive",
    "adapterOciArchiveSha256",
    "adapterOciRevision",
    "adapterOciSourceTreeSha256",
    "runtimeToolchainSha256",
    "runtimePolicySha256",
    "proofDependencyManifestSha256",
    "toolchainLockSha256",
    "runtimeAdapterSha256",
    "buildctlSha256",
    "buildkitdSha256",
    "buildkitConfigSha256",
    "builtAt",
}
_CONTROL_V2_KEYS = frozenset(
    {
        "schemaVersion",
        "status",
        "timeoutKind",
        "runtimePolicySha256",
        "invocationId",
        "finalContainerId",
        "commandSha256",
        "rootlessReceiptFileSha256",
        "rootlessReceiptPayloadSha256",
        "timeoutObserved",
        "candidateWallSeconds",
        "elapsedMs",
        "cleanupReserveMs",
        "taskAbsent",
        "containerAbsent",
        "snapshotAbsent",
        "invocationAliasAbsent",
        "imageRootfsAbsent",
        "persistedAuthorityVerified",
        "readOnlyMountsUnchanged",
        "imageRootfsUnchanged",
        "resultReleased",
        "receiptPayloadSha256",
    }
)
_CONTROL_V3_KEYS = _CONTROL_V2_KEYS | {"qualificationMode"}
_ATTESTATION_KEYS = {
    "schemaVersion",
    "status",
    "sessionId",
    "namespace",
    "runtimeToolchainSha256",
    "runtimePolicySha256",
    "proofDependencyManifestSha256",
    "toolchainLockSha256",
    "adapterSha256",
    "componentSha256",
    "fileSha256",
    "containerdRootlesskitApiSocket",
    "containerdSocket",
    "runtimeCommandSocket",
    "buildkitSocket",
}
_ATTESTATION_COMPONENT_KEYS = {
    "buildctl",
    "buildkitd",
    "containerd",
    "containerd-shim-runc-v2",
    "ctr",
    "nerdctl",
    "rootlesskit",
    "runc",
}
_ROOTLESS_KEYS = {
    "schemaVersion",
    "status",
    "limitMode",
    "aggregateLimitIntentEnforced",
    "invocationId",
    "stagingContainerId",
    "finalContainerId",
    "metadataSha256",
    "originalSpecSha256",
    "baseSpecSha256",
    "sanitizedSpecSha256",
    "configFileSha256",
    "internalMountManifest",
    "internalMountManifestSha256",
    "readOnlyMountManifest",
    "readOnlyMountManifestSha256",
    "commandSha256",
    "imageAuthority",
    "imageRootfs",
    "removedFields",
    "normalizedFields",
    "removedMounts",
    "intendedAggregateLimits",
    "enforcedRlimits",
    "aggregateLimitEvidence",
    "receiptPayloadSha256",
}
_CLEANUP_FIELDS = (
    "taskAbsent",
    "containerAbsent",
    "snapshotAbsent",
    "invocationAliasAbsent",
    "imageRootfsAbsent",
    "persistedAuthorityVerified",
    "readOnlyMountsUnchanged",
    "imageRootfsUnchanged",
)
def _timeout_public_test(address_space_bytes: int) -> str:
    if not _safe_integer(address_space_bytes, positive=True):
        raise RuntimeError("timeout address-space expectation is invalid")
    return f"""import resource
import time

expected = ({address_space_bytes}, {address_space_bytes})
observed = resource.getrlimit(resource.RLIMIT_AS)
if observed != expected:
    raise AssertionError(f"address-space limit mismatch: {{observed!r}}")
time.sleep(5)
raise AssertionError("timeout cleanup sentinel unexpectedly survived")
"""


def _canonical_json(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _read_json(path: Path, *, maximum: int = 1_048_576) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > maximum:
        raise RuntimeError(f"invalid JSON evidence file: {path.name}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"invalid JSON evidence file: {path.name}") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"invalid JSON evidence object: {path.name}")
    return value


def _repository_file(root: Path, requested: object, label: str) -> Path:
    if not isinstance(requested, str) or not requested:
        raise RuntimeError(f"{label} path is invalid")
    supplied = Path(requested)
    if supplied.is_absolute():
        try:
            relative_path = supplied.relative_to(root)
        except ValueError as exc:
            raise RuntimeError(f"{label} escaped the repository") from exc
    else:
        relative_path = supplied
    if ".." in relative_path.parts or relative_path == Path("."):
        raise RuntimeError(f"{label} path is invalid")
    candidate = root / relative_path
    current = root
    for component in relative_path.parts:
        current /= component
        if current.is_symlink():
            raise RuntimeError(f"{label} traverses a symbolic link")
    try:
        resolved = candidate.resolve(strict=True)
    except OSError as exc:
        raise RuntimeError(f"{label} is unavailable") from exc
    if resolved == root or not resolved.is_relative_to(root):
        raise RuntimeError(f"{label} escaped the repository")
    if not resolved.is_file():
        raise RuntimeError(f"{label} is not a file")
    return resolved


def _prepare_output(root: Path, requested: Path) -> Path:
    releases = root / "node_modules/.cache/counterlab-v6.1/releases"
    releases.mkdir(parents=True, exist_ok=True, mode=0o700)
    releases = releases.resolve(strict=True)
    candidate = Path(requested)
    if not candidate.is_absolute():
        candidate = root / candidate
    if (
        ".." in candidate.parts
        or candidate.parent.resolve(strict=True) != releases
        or candidate.exists()
        or candidate.is_symlink()
        or not re.fullmatch(
            r"timeout-cleanup-[a-f0-9]{40}\.json", candidate.name
        )
    ):
        raise RuntimeError("timeout cleanup output path is invalid")
    return candidate


def validate_build_receipt(root: Path, value: object) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != _BUILD_KEYS:
        raise RuntimeError("build receipt shape is invalid")
    source = value.get("sourceCommit")
    sha_fields = {
        "sourceArchiveSha256",
        "sourceTreeSha256",
        "dockerfileSha256",
        "localOciArchiveSha256",
        "adapterDockerfileSha256",
        "adapterOciArchiveSha256",
        "adapterOciSourceTreeSha256",
        "runtimeToolchainSha256",
        "runtimePolicySha256",
        "proofDependencyManifestSha256",
        "toolchainLockSha256",
        "runtimeAdapterSha256",
        "buildctlSha256",
        "buildkitdSha256",
        "buildkitConfigSha256",
    }
    digest_fields = {
        "localImageDigest",
        "localManifestDigest",
        "adapterImageDigest",
        "adapterManifestDigest",
    }
    if (
        value.get("schemaVersion") != "4"
        or value.get("status") != "BUILT"
        or not isinstance(source, str)
        or not _SOURCE_COMMIT.fullmatch(source)
        or value.get("localImageTag") != f"counterlab-runner:git-{source}"
        or value.get("adapterImageTag") != f"counterlab-adapter:git-{source}"
        or value.get("adapterOciRevision") != source
        or value.get("adapterOciSourceTreeSha256") != value.get("sourceTreeSha256")
        or any(
            not isinstance(value.get(field), str)
            or not _SHA256.fullmatch(value[field])
            for field in sha_fields
        )
        or any(
            not isinstance(value.get(field), str)
            or not _DIGEST.fullmatch(value[field])
            for field in digest_fields
        )
        or not isinstance(value.get("builtAt"), str)
    ):
        raise RuntimeError("build receipt identity is invalid")
    runner_archive = _repository_file(
        root, value["localOciArchive"], "runner OCI archive"
    )
    adapter_archive = _repository_file(
        root, value["adapterOciArchive"], "adapter OCI archive"
    )
    if (
        _sha256_file(runner_archive) != value["localOciArchiveSha256"]
        or _sha256_file(adapter_archive) != value["adapterOciArchiveSha256"]
    ):
        raise RuntimeError("build receipt archive hash changed")
    return value


def validate_control_receipt(
    value: object,
    *,
    expected_wall_seconds: int = 1,
    expected_runtime_policy_sha256: str = CONTAINED_RUNTIME_POLICY_SHA256,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeError("timeout control receipt shape is invalid")
    schema_version = value.get("schemaVersion")
    if schema_version == "2":
        expected_keys = _CONTROL_V2_KEYS
    elif schema_version == "3":
        expected_keys = _CONTROL_V3_KEYS
    else:
        raise RuntimeError("timeout control receipt shape is invalid")
    if set(value) != expected_keys:
        raise RuntimeError("timeout control receipt shape is invalid")
    payload = {key: entry for key, entry in value.items() if key != "receiptPayloadSha256"}
    if (
        (
            schema_version == "3"
            and value.get("qualificationMode")
            != _AGGREGATE_TIMEOUT_QUALIFICATION_MODE
        )
        or value.get("status") != "TIMED_OUT_CLEAN"
        or value.get("timeoutKind") != "WALL_CLOCK"
        or value.get("runtimePolicySha256")
        != expected_runtime_policy_sha256
        or not _SHA256.fullmatch(str(value.get("invocationId", "")))
        or not _SHA256.fullmatch(str(value.get("finalContainerId", "")))
        or not _SHA256.fullmatch(str(value.get("commandSha256", "")))
        or not _SHA256.fullmatch(str(value.get("rootlessReceiptFileSha256", "")))
        or not _SHA256.fullmatch(str(value.get("rootlessReceiptPayloadSha256", "")))
        or value.get("timeoutObserved") is not True
        or value.get("candidateWallSeconds") != expected_wall_seconds
        or not isinstance(value.get("candidateWallSeconds"), int)
        or isinstance(value.get("candidateWallSeconds"), bool)
        or not isinstance(value.get("elapsedMs"), int)
        or isinstance(value.get("elapsedMs"), bool)
        or value["elapsedMs"] < 1
        or value["elapsedMs"] > 600_000
        or not isinstance(value.get("cleanupReserveMs"), int)
        or isinstance(value.get("cleanupReserveMs"), bool)
        or value["cleanupReserveMs"] < 1
        or any(value.get(field) is not True for field in _CLEANUP_FIELDS)
        or value.get("resultReleased") is not False
        or not _SHA256.fullmatch(str(value.get("receiptPayloadSha256", "")))
        or _sha256_bytes(_canonical_json(payload).encode())
        != value["receiptPayloadSha256"]
    ):
        raise RuntimeError("timeout control receipt is not clean and bound")
    return value


def _rootless_receipt_name(control: dict[str, Any]) -> str:
    if control.get("schemaVersion") == "2":
        suffix = "receipt.json"
    elif (
        control.get("schemaVersion") == "3"
        and control.get("qualificationMode")
        == _AGGREGATE_TIMEOUT_QUALIFICATION_MODE
    ):
        suffix = "qualified-receipt.json"
    else:
        raise RuntimeError("timeout control receipt qualification is invalid")
    return f"{control['finalContainerId']}.{suffix}"


def validate_rootless_receipt(
    value: object,
    *,
    control: dict[str, Any],
    build: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != _ROOTLESS_KEYS:
        raise RuntimeError("rootless receipt shape is invalid")
    payload = {key: entry for key, entry in value.items() if key != "receiptPayloadSha256"}
    authority = value.get("imageAuthority")
    aggregate_evidence = _validate_aggregate_limit_evidence(
        value.get("aggregateLimitEvidence"),
        invocation_id=value.get("invocationId"),
        final_container_id=value.get("finalContainerId"),
        sanitized_spec_sha256=value.get("sanitizedSpecSha256"),
        intended=value.get("intendedAggregateLimits"),
    )
    if (
        value.get("schemaVersion") != "4"
        or value.get("status") != "VALIDATED"
        or value.get("limitMode") != _QUALIFIED_AGGREGATE_LIMIT_MODE
        or value.get("aggregateLimitIntentEnforced") is not True
        or value.get("invocationId") != control["invocationId"]
        or value.get("finalContainerId") != control["finalContainerId"]
        or value.get("commandSha256") != control["commandSha256"]
        or value.get("receiptPayloadSha256")
        != control["rootlessReceiptPayloadSha256"]
        or _sha256_bytes(_canonical_json(payload).encode())
        != value.get("receiptPayloadSha256")
        or not isinstance(authority, dict)
        or set(authority)
        != {
            "canonicalImage",
            "configDigest",
            "layerDigests",
            "manifestDigest",
            "rootfsChainId",
            "sourceCommit",
            "sourceTreeSha256",
            "targetDigest",
            "targetMediaType",
        }
        or not isinstance(authority.get("canonicalImage"), str)
        or not authority["canonicalImage"]
        or not isinstance(authority.get("layerDigests"), list)
        or not authority["layerDigests"]
        or any(
            not isinstance(digest, str) or not _DIGEST.fullmatch(digest)
            for digest in authority["layerDigests"]
        )
        or any(
            not isinstance(authority.get(field), str)
            or not _DIGEST.fullmatch(authority[field])
            for field in (
                "configDigest",
                "manifestDigest",
                "rootfsChainId",
                "targetDigest",
            )
        )
        or not isinstance(authority.get("targetMediaType"), str)
        or not authority["targetMediaType"]
        or authority.get("sourceCommit") != build["sourceCommit"]
        or authority.get("sourceTreeSha256") != build["sourceTreeSha256"]
        or authority.get("configDigest") != build["adapterImageDigest"]
        or authority.get("manifestDigest") != build["adapterManifestDigest"]
        or not _validate_enforced_rlimits(
            value.get("enforcedRlimits"), value.get("intendedAggregateLimits")
        )
    ):
        raise RuntimeError("rootless receipt authority is invalid")
    return value


def _validate_enforced_rlimits(value: object, intended: object) -> bool:
    required = {
        "RLIMIT_AS",
        "RLIMIT_CPU",
        "RLIMIT_FSIZE",
        "RLIMIT_NOFILE",
        "RLIMIT_NPROC",
    }
    if (
        not isinstance(intended, dict)
        or set(intended) != {"cpuCount", "maxProcesses", "memoryBytes"}
        or not isinstance(intended.get("cpuCount"), (int, float))
        or isinstance(intended.get("cpuCount"), bool)
        or not math.isfinite(intended["cpuCount"])
        or not 0.25 <= intended["cpuCount"] <= 2
        or not _safe_integer(intended.get("maxProcesses"), positive=True)
        or not 1 <= intended["maxProcesses"] <= 32
        or not _safe_integer(intended.get("memoryBytes"), positive=True)
        or not 64 * 1024 * 1024
        <= intended["memoryBytes"]
        <= 1024 * 1024 * 1024
        or not isinstance(value, list)
        or len(value) != len(required)
    ):
        return False
    observed: set[str] = set()
    by_type: dict[str, int] = {}
    for entry in value:
        if (
            not isinstance(entry, dict)
            or set(entry) != {"type", "soft", "hard"}
            or entry.get("type") not in required
            or entry["type"] in observed
            or not _safe_integer(entry.get("soft"), positive=True)
            or entry.get("hard") != entry.get("soft")
        ):
            return False
        observed.add(entry["type"])
        by_type[entry["type"]] = entry["soft"]
    return (
        observed == required
        and by_type["RLIMIT_AS"] == intended["memoryBytes"]
        and by_type["RLIMIT_NPROC"] == intended["maxProcesses"]
        and by_type["RLIMIT_NOFILE"] == 64
        and 1 <= by_type["RLIMIT_CPU"] <= 300
        and 1 <= by_type["RLIMIT_FSIZE"] <= 1_048_576
    )


def _safe_integer(value: object, *, positive: bool = False) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and value >= (1 if positive else 0)
        and value <= (2**53 - 1)
    )


def _validate_aggregate_limit_evidence(
    value: object,
    *,
    invocation_id: object,
    final_container_id: object,
    sanitized_spec_sha256: object,
    intended: object,
) -> dict[str, Any]:
    top_keys = {
        "schemaVersion",
        "status",
        "authority",
        "cgroupVersion",
        "cgroupId",
        "cgroupPath",
        "cgroupIdentity",
        "invocationId",
        "finalContainerId",
        "finalizationPayloadSha256",
        "sanitizedSpecSha256",
        "runtimeAttestationSha256",
        "observedLimits",
        "membership",
        "negativeControls",
        "cleanup",
        "observer",
        "observedAt",
        "receiptPayloadSha256",
    }
    if not isinstance(value, dict) or set(value) != top_keys:
        raise RuntimeError("aggregate limit evidence shape is invalid")
    observed = value.get("observedLimits")
    membership = value.get("membership")
    controls = value.get("negativeControls")
    cleanup = value.get("cleanup")
    observer = value.get("observer")
    if (
        not isinstance(intended, dict)
        or set(intended) != {"cpuCount", "maxProcesses", "memoryBytes"}
        or not isinstance(observed, dict)
        or set(observed)
        != {
            "memoryMaxBytes",
            "memorySwapMaxBytes",
            "pidsMax",
            "cpuQuotaMicros",
            "cpuPeriodMicros",
        }
        or not isinstance(membership, dict)
        or set(membership)
        != {
            "leaderPid",
            "leaderStartTimeTicks",
            "memberPids",
            "memberSetSha256",
            "descendantsObserved",
        }
        or not isinstance(controls, dict)
        or set(controls) != {"memory", "processes", "cpu"}
        or not isinstance(cleanup, dict)
        or set(cleanup) != {"cgroupAbsentAfterTimeout"}
        or not isinstance(observer, dict)
        or set(observer)
        != {"runtimeSessionId", "driverCliSha256", "driverModuleSha256"}
    ):
        raise RuntimeError("aggregate limit evidence shape is invalid")
    memory_control = controls.get("memory")
    process_control = controls.get("processes")
    cpu_control = controls.get("cpu")
    member_pids = membership.get("memberPids")
    if (
        value.get("schemaVersion") != "2"
        or value.get("status") != "OBSERVED"
        or value.get("authority") != "linux-cgroup-v2"
        or value.get("cgroupVersion") != 2
        or value.get("invocationId") != invocation_id
        or value.get("finalContainerId") != final_container_id
        or not _SHA256.fullmatch(str(value.get("finalizationPayloadSha256", "")))
        or value.get("cgroupId") != f"counterlab-v6.1-{invocation_id}"
        or value.get("cgroupPath") != f"counterlab-v6.1/{invocation_id}"
        or value.get("sanitizedSpecSha256") != sanitized_spec_sha256
        or not _SHA256.fullmatch(str(value.get("sanitizedSpecSha256", "")))
        or not _SHA256.fullmatch(str(value.get("runtimeAttestationSha256", "")))
        or value.get("cgroupIdentity")
        != _sha256_bytes(
            (
                "counterlab-cgroup-v2\0"
                f"{invocation_id}\0{final_container_id}\0{sanitized_spec_sha256}"
            ).encode()
        )
        or not isinstance(intended.get("cpuCount"), (int, float))
        or isinstance(intended.get("cpuCount"), bool)
        or not 0.25 <= intended["cpuCount"] <= 2
        or not _safe_integer(intended.get("maxProcesses"), positive=True)
        or not 1 <= intended["maxProcesses"] <= 32
        or not _safe_integer(intended.get("memoryBytes"), positive=True)
        or not 64 * 1024 * 1024
        <= intended["memoryBytes"]
        <= 1024 * 1024 * 1024
        or not all(
            _safe_integer(observed.get(field), positive=field != "memorySwapMaxBytes")
            for field in observed
        )
        or observed.get("memoryMaxBytes") != intended["memoryBytes"]
        or observed.get("memorySwapMaxBytes") not in (0, intended["memoryBytes"])
        or observed.get("pidsMax") != intended["maxProcesses"]
        or observed.get("cpuQuotaMicros") / observed.get("cpuPeriodMicros")
        != intended["cpuCount"]
        or not _safe_integer(membership.get("leaderPid"), positive=True)
        or not isinstance(membership.get("leaderStartTimeTicks"), str)
        or not re.fullmatch(r"[1-9][0-9]*", membership["leaderStartTimeTicks"])
        or not isinstance(member_pids, list)
        or not 2 <= len(member_pids) <= 64
        or any(not _safe_integer(pid, positive=True) for pid in member_pids)
        or len(set(member_pids)) != len(member_pids)
        or membership.get("leaderPid") not in member_pids
        or membership.get("memberSetSha256")
        != _sha256_bytes(
            _canonical_json(sorted(member_pids)).encode()
        )
        or membership.get("descendantsObserved") is not True
        or not isinstance(memory_control, dict)
        or set(memory_control)
        != {"requestedBytes", "oomKillBefore", "oomKillAfter", "enforced"}
        or not isinstance(process_control, dict)
        or set(process_control)
        != {"attemptedProcesses", "maxEventsBefore", "maxEventsAfter", "enforced"}
        or not isinstance(cpu_control, dict)
        or set(cpu_control)
        != {
            "busyWindowMs",
            "nrThrottledBefore",
            "nrThrottledAfter",
            "throttledUsecBefore",
            "throttledUsecAfter",
            "enforced",
        }
        or not all(
            _safe_integer(memory_control.get(field), positive=field == "requestedBytes")
            for field in ("requestedBytes", "oomKillBefore", "oomKillAfter")
        )
        or memory_control.get("requestedBytes") <= intended["memoryBytes"]
        or memory_control.get("oomKillAfter")
        != memory_control.get("oomKillBefore") + 1
        or memory_control.get("enforced") is not True
        or not all(
            _safe_integer(
                process_control.get(field), positive=field == "attemptedProcesses"
            )
            for field in ("attemptedProcesses", "maxEventsBefore", "maxEventsAfter")
        )
        or process_control.get("attemptedProcesses") <= intended["maxProcesses"]
        or process_control.get("maxEventsAfter")
        <= process_control.get("maxEventsBefore")
        or process_control.get("enforced") is not True
        or not all(
            _safe_integer(cpu_control.get(field), positive=field == "busyWindowMs")
            for field in (
                "busyWindowMs",
                "nrThrottledBefore",
                "nrThrottledAfter",
                "throttledUsecBefore",
                "throttledUsecAfter",
            )
        )
        or cpu_control.get("nrThrottledAfter")
        <= cpu_control.get("nrThrottledBefore")
        or cpu_control.get("throttledUsecAfter")
        <= cpu_control.get("throttledUsecBefore")
        or cpu_control.get("enforced") is not True
        or cleanup.get("cgroupAbsentAfterTimeout") is not True
        or not _SESSION_ID.fullmatch(str(observer.get("runtimeSessionId", "")))
        or not _SHA256.fullmatch(str(observer.get("driverCliSha256", "")))
        or not _SHA256.fullmatch(str(observer.get("driverModuleSha256", "")))
        or not isinstance(value.get("observedAt"), str)
        or _invalid_iso_datetime(value["observedAt"])
        or not _SHA256.fullmatch(str(value.get("receiptPayloadSha256", "")))
        or _sha256_bytes(
            _canonical_json(
                {
                    key: entry
                    for key, entry in value.items()
                    if key != "receiptPayloadSha256"
                }
            ).encode()
        )
        != value.get("receiptPayloadSha256")
    ):
        raise RuntimeError("aggregate limit evidence is not independently bound")
    return value


def _invalid_iso_datetime(value: str) -> bool:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return True
    return False


def select_new_receipt(before: set[Path], after: set[Path]) -> Path:
    created = after.difference(before)
    if len(created) != 1:
        raise RuntimeError("timeout run did not create exactly one rootless receipt")
    return next(iter(created))


def _run_adapter(
    adapter: Path,
    session_id: str,
    arguments: tuple[str, ...],
    *,
    control_receipt: Path | None = None,
    timeout: int,
) -> subprocess.CompletedProcess[str]:
    prefix = (str(adapter), "--session-id", session_id)
    if control_receipt is not None:
        prefix = (*prefix, "--control-receipt", str(control_receipt))
    completed = subprocess.run(
        (*prefix, "--", *arguments),
        cwd=adapter.parents[1],
        env={"PATH": "/usr/bin:/bin"},
        capture_output=True,
        check=False,
        text=True,
        timeout=timeout,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"contained adapter command failed: {arguments[0]}")
    return completed


def _attest(adapter: Path, session_id: str) -> dict[str, Any]:
    completed = _run_adapter(
        adapter,
        session_id,
        ("counterlab-attest",),
        timeout=30,
    )
    try:
        value = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("contained runtime attestation is invalid") from exc
    if (
        not isinstance(value, dict)
        or set(value) != _ATTESTATION_KEYS
        or value.get("schemaVersion") != "2"
        or value.get("status") != "VERIFIED"
        or value.get("sessionId") != session_id
        or value.get("namespace") != "counterlab-v6.1"
        or not _SHA256.fullmatch(str(value.get("runtimeToolchainSha256", "")))
        or not _SHA256.fullmatch(str(value.get("runtimePolicySha256", "")))
        or not _SHA256.fullmatch(
            str(value.get("proofDependencyManifestSha256", ""))
        )
        or not _SHA256.fullmatch(str(value.get("toolchainLockSha256", "")))
        or not _SHA256.fullmatch(str(value.get("adapterSha256", "")))
        or not isinstance(value.get("componentSha256"), dict)
        or set(value["componentSha256"]) != _ATTESTATION_COMPONENT_KEYS
        or any(
            not _SHA256.fullmatch(str(component_hash))
            for component_hash in value["componentSha256"].values()
        )
        or not isinstance(value.get("fileSha256"), dict)
        or set(value["fileSha256"]) != {"containerdConfig", "buildkitConfig"}
        or any(
            not _SHA256.fullmatch(str(file_hash))
            for file_hash in value["fileSha256"].values()
        )
    ):
        raise RuntimeError("contained runtime attestation is invalid")
    socket_prefix = f".rt/{session_id}/run"
    expected_sockets = {
        "containerdRootlesskitApiSocket": (
            f"{socket_prefix}/containerd-rootless/api.sock"
        ),
        "containerdSocket": f"{socket_prefix}/containerd.sock",
        "runtimeCommandSocket": f"{socket_prefix}/runtime-command.sock",
        "buildkitSocket": f"{socket_prefix}/buildkitd.sock",
    }
    if any(value.get(name) != path for name, path in expected_sockets.items()):
        raise RuntimeError("contained runtime attestation sockets are invalid")
    return value


def _write_new(path: Path, source: str, mode: int = 0o600) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", closefd=False) as stream:
            stream.write(source)
            stream.flush()
    finally:
        os.close(descriptor)


def run_timeout_cleanup_proof(
    repository_root: Path,
    build_receipt_path: Path,
    output_path: Path,
    session_id: str,
) -> dict[str, Any]:
    root = require_trusted_repository_root(repository_root)
    build_path = _repository_file(root, str(build_receipt_path), "build receipt")
    build = validate_build_receipt(root, _read_json(build_path))
    output = _prepare_output(root, output_path)

    head = subprocess.run(
        ("git", "rev-parse", "HEAD"),
        cwd=root,
        capture_output=True,
        check=True,
        text=True,
        timeout=10,
    ).stdout.strip()
    if head != build["sourceCommit"]:
        raise RuntimeError("timeout proof source does not match HEAD")

    if not _SESSION_ID.fullmatch(session_id):
        raise RuntimeError("contained runtime session ID is missing or invalid")
    adapter = root / "scripts/contained-runtime-adapter.sh"
    bound_adapter = bind_contained_runtime_adapter(root, str(adapter))
    if bound_adapter is None or _sha256_file(bound_adapter) != build["runtimeAdapterSha256"]:
        raise RuntimeError("runtime adapter does not match the build receipt")
    before_attestation = _attest(bound_adapter, session_id)
    if (
        before_attestation["runtimeToolchainSha256"]
        != build["runtimeToolchainSha256"]
        or before_attestation["runtimePolicySha256"]
        != build["runtimePolicySha256"]
        or before_attestation["proofDependencyManifestSha256"]
        != build["proofDependencyManifestSha256"]
        or before_attestation["adapterSha256"] != build["runtimeAdapterSha256"]
    ):
        raise RuntimeError("runtime attestation does not match the build receipt")

    adapter_archive = _repository_file(
        root, build["adapterOciArchive"], "adapter OCI archive"
    )
    _run_adapter(
        bound_adapter,
        session_id,
        ("load", "--platform", "linux/amd64", "--input", str(adapter_archive)),
        timeout=1_800,
    )
    inspections = {
        "digest": "{{.Id}}",
        "sourceCommit": '{{index .Config.Labels "org.opencontainers.image.revision"}}',
        "sourceTreeSha256": '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}',
    }
    expected = {
        "digest": build["adapterImageDigest"],
        "sourceCommit": build["sourceCommit"],
        "sourceTreeSha256": build["sourceTreeSha256"],
    }
    for label, format_value in inspections.items():
        observed = _run_adapter(
            bound_adapter,
            session_id,
            ("image", "inspect", build["adapterImageTag"], "--format", format_value),
            timeout=30,
        ).stdout.strip()
        if observed != expected[label]:
            raise RuntimeError(f"adapter image {label} does not match the build receipt")

    work = create_repository_work_directory(root, "timeout-proof")
    generated_root = work / "generated"
    workspace = create_fresh_workspace(generated_root, "timeout-session")
    public = root / "concept-packs/leakage/public"
    plan = _read_json(public / "sample-experiment-plan.json")
    limits = plan.get("resourceLimits")
    if not isinstance(limits, dict):
        raise RuntimeError("fixed timeout plan has no resource limits")
    limits["wallSeconds"] = 1
    memory_mb = limits.get("memoryMb")
    if not _safe_integer(memory_mb, positive=True):
        raise RuntimeError("fixed timeout plan has no memory limit")
    _write_new(
        workspace / "experiment-plan.json",
        f"{json.dumps(plan, indent=2, sort_keys=True)}\n",
    )
    adapter_source = (public / "artifact-adapter.template.py").read_text(
        encoding="utf-8"
    )
    _write_new(workspace / "artifact-adapter.py", adapter_source)
    _write_new(
        workspace / "public_tests.py",
        _timeout_public_test(memory_mb * 1024 * 1024),
    )
    artifacts = validate_generated_workspace(workspace, generated_root)

    run_root = work / "runs"
    control_path = output.parent / (
        f"timeout-control-{build['sourceCommit']}-{os.getpid()}.json"
    )
    if control_path.exists() or control_path.is_symlink():
        raise RuntimeError("timeout control receipt path already exists")
    started = time.monotonic()
    try:
        DockerAdapterExecutor(
            image=build["adapterImageTag"],
            docker_bin=str(bound_adapter),
            contained_runtime_adapter=bound_adapter,
            contained_runtime_session_id=session_id,
            contained_runtime_control_receipt=control_path,
        ).execute(
            artifacts=artifacts,
            fixture=root / "fixtures/public/customer_churn.csv",
            run_root=run_root,
        )
    except DockerExecutionError as exc:
        if (
            exc.code != "wall_clock_limit"
            or exc.details.get("maximumSeconds") != 1
            or exc.details.get("timeoutKind") != "WALL_CLOCK"
            or exc.details.get("controlStatus") != "TIMED_OUT_CLEAN"
            or exc.details.get("cleanupVerified") is not True
        ):
            raise RuntimeError(
                "timeout probe did not prove a clean inner wall-clock limit"
            ) from exc
        control_relative = str(control_path.relative_to(root))
        if exc.details.get("controlReceipt") != control_relative:
            raise RuntimeError("timeout probe named a different control receipt") from exc
        rootless_path = _repository_file(
            root,
            exc.details.get("rootlessReceipt"),
            "timeout rootless receipt",
        )
        expected_rootless_parent = (
            root / ".rt" / session_id / "run/rootless-specs"
        ).resolve(strict=True)
        if rootless_path.parent != expected_rootless_parent:
            raise RuntimeError(
                "timeout probe rootless receipt belongs to another session"
            ) from exc
        expected_control_sha256 = exc.details.get("controlReceiptSha256")
        expected_rootless_sha256 = exc.details.get("rootlessReceiptSha256")
    else:
        raise RuntimeError("timeout probe unexpectedly completed")
    elapsed_ms = max(1, int((time.monotonic() - started) * 1_000))

    control = validate_control_receipt(
        _read_json(control_path),
        expected_wall_seconds=1,
        expected_runtime_policy_sha256=build["runtimePolicySha256"],
    )
    if (
        not isinstance(expected_control_sha256, str)
        or _sha256_file(control_path) != expected_control_sha256
        or not isinstance(expected_rootless_sha256, str)
        or _sha256_file(rootless_path) != expected_rootless_sha256
    ):
        raise RuntimeError("timeout proof exception receipt hashes changed")
    if rootless_path.name != _rootless_receipt_name(control):
        raise RuntimeError("timeout control and rootless receipt IDs disagree")
    if _sha256_file(rootless_path) != control["rootlessReceiptFileSha256"]:
        raise RuntimeError("rootless receipt file hash changed")
    rootless = validate_rootless_receipt(
        _read_json(rootless_path), control=control, build=build
    )

    output_directories = [
        path
        for path in run_root.iterdir()
        if path.is_dir() and not path.is_symlink() and path.name.startswith("adapter-")
    ]
    if len(output_directories) != 1:
        raise RuntimeError("timeout probe output directory is ambiguous")
    output_entries = sorted(path.name for path in output_directories[0].iterdir())
    if output_entries != ["public-tests.stderr", "public-tests.stdout"] or any(
        (output_directories[0] / name).is_symlink()
        or not (output_directories[0] / name).is_file()
        or (output_directories[0] / name).stat().st_size != 0
        for name in output_entries
    ):
        raise RuntimeError("timeout probe released a result-bearing output")

    after_attestation = _attest(bound_adapter, session_id)
    if _canonical_json(after_attestation) != _canonical_json(before_attestation):
        raise RuntimeError("runtime attestation changed during timeout proof")

    driver_cli_sha256 = _sha256_file(
        root / "scripts/verify-contained-runtime-timeout.py"
    )
    driver_module_sha256 = _sha256_file(Path(__file__).resolve(strict=True))
    aggregate_limit_evidence = rootless["aggregateLimitEvidence"]
    runtime_attestation_sha256 = _sha256_bytes(
        _canonical_json(before_attestation).encode()
    )
    aggregate_observed_at = datetime.fromisoformat(
        aggregate_limit_evidence["observedAt"].replace("Z", "+00:00")
    )
    aggregate_age_seconds = (datetime.now(UTC) - aggregate_observed_at).total_seconds()
    if aggregate_limit_evidence["observer"] != {
        "runtimeSessionId": session_id,
        "driverCliSha256": driver_cli_sha256,
        "driverModuleSha256": driver_module_sha256,
    } or aggregate_limit_evidence["runtimeAttestationSha256"] != runtime_attestation_sha256:
        raise RuntimeError("aggregate limit observer is not source-bound")
    if aggregate_age_seconds < -300 or aggregate_age_seconds > 300:
        raise RuntimeError("aggregate limit observation is stale or future-dated")

    payload = {
        "schemaVersion": "1",
        "status": "VERIFIED",
        "sourceCommit": build["sourceCommit"],
        "sourceTreeSha256": build["sourceTreeSha256"],
        "buildReceipt": str(build_path.relative_to(root)),
        "buildReceiptSha256": _sha256_file(build_path),
        "adapterImageTag": build["adapterImageTag"],
        "adapterImageDigest": build["adapterImageDigest"],
        "adapterManifestDigest": build["adapterManifestDigest"],
        "adapterOciArchiveSha256": build["adapterOciArchiveSha256"],
        "runtimeSessionId": session_id,
        "runtimeToolchainSha256": build["runtimeToolchainSha256"],
        "runtimePolicySha256": build["runtimePolicySha256"],
        "proofDependencyManifestSha256": build[
            "proofDependencyManifestSha256"
        ],
        "runtimeAttestationSha256Before": runtime_attestation_sha256,
        "runtimeAttestationSha256After": _sha256_bytes(
            _canonical_json(after_attestation).encode()
        ),
        "driverCliSha256": driver_cli_sha256,
        "driverModuleSha256": driver_module_sha256,
        "probePlanSha256": _sha256_file(workspace / "experiment-plan.json"),
        "probeAdapterSha256": _sha256_file(workspace / "artifact-adapter.py"),
        "probePublicTestsSha256": _sha256_file(workspace / "public_tests.py"),
        "runControlReceipt": str(control_path.relative_to(root)),
        "runControlReceiptSha256": _sha256_file(control_path),
        "rootlessReceipt": str(rootless_path.relative_to(root)),
        "rootlessReceiptSha256": _sha256_file(rootless_path),
        "aggregateLimitEvidenceSha256": _sha256_bytes(
            _canonical_json(aggregate_limit_evidence).encode()
        ),
        "invocationId": control["invocationId"],
        "finalContainerId": control["finalContainerId"],
        "commandSha256": control["commandSha256"],
        "candidateWallSeconds": 1,
        "elapsedMs": elapsed_ms,
        "resultReleased": False,
        "cleanup": {field: control[field] for field in _CLEANUP_FIELDS},
        "retainedWorkRoot": str(work.relative_to(root)),
        "verifiedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    report = {
        **payload,
        "receiptPayloadSha256": _sha256_bytes(_canonical_json(payload).encode()),
    }
    _write_new(output, f"{json.dumps(report, indent=2, sort_keys=True)}\n")
    return report
