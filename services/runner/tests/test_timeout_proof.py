from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import pytest
import counterlab_runner.timeout_proof as timeout_proof_module

from counterlab_runner.docker import CONTAINED_RUNTIME_POLICY_SHA256
from counterlab_runner.timeout_proof import (
    select_new_receipt,
    validate_control_receipt,
    validate_rootless_receipt,
)


def _canonical(value: object) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _hash(value: object) -> str:
    return hashlib.sha256(_canonical(value).encode()).hexdigest()


def _control() -> dict[str, object]:
    payload: dict[str, object] = {
        "schemaVersion": "2",
        "status": "TIMED_OUT_CLEAN",
        "timeoutKind": "WALL_CLOCK",
        "runtimePolicySha256": CONTAINED_RUNTIME_POLICY_SHA256,
        "invocationId": "1" * 64,
        "finalContainerId": "2" * 64,
        "commandSha256": "3" * 64,
        "rootlessReceiptFileSha256": "4" * 64,
        "rootlessReceiptPayloadSha256": "5" * 64,
        "timeoutObserved": True,
        "candidateWallSeconds": 1,
        "elapsedMs": 1_001,
        "cleanupReserveMs": 120_000,
        "taskAbsent": True,
        "containerAbsent": True,
        "snapshotAbsent": True,
        "invocationAliasAbsent": True,
        "imageRootfsAbsent": True,
        "persistedAuthorityVerified": True,
        "readOnlyMountsUnchanged": True,
        "imageRootfsUnchanged": True,
        "resultReleased": False,
    }
    return {**payload, "receiptPayloadSha256": _hash(payload)}


def _rootless(control: dict[str, object], build: dict[str, object]) -> dict[str, object]:
    invocation_id = str(control["invocationId"])
    final_container_id = str(control["finalContainerId"])
    intended_limits = {
        "cpuCount": 1,
        "maxProcesses": 16,
        "memoryBytes": 512 * 1024 * 1024,
    }
    sanitized_spec_sha256 = "a" * 64
    member_pids = [100, 101]
    aggregate_payload: dict[str, object] = {
        "schemaVersion": "2",
        "status": "OBSERVED",
        "authority": "linux-cgroup-v2",
        "cgroupVersion": 2,
        "cgroupId": f"counterlab-v6.1-{invocation_id}",
        "cgroupPath": f"counterlab-v6.1/{invocation_id}",
        "cgroupIdentity": hashlib.sha256(
            (
                "counterlab-cgroup-v2\0"
                f"{invocation_id}\0{final_container_id}\0{sanitized_spec_sha256}"
            ).encode()
        ).hexdigest(),
        "invocationId": invocation_id,
        "finalContainerId": final_container_id,
        "finalizationPayloadSha256": "7" * 64,
        "sanitizedSpecSha256": sanitized_spec_sha256,
        "runtimeAttestationSha256": "6" * 64,
        "observedLimits": {
            "memoryMaxBytes": intended_limits["memoryBytes"],
            "memorySwapMaxBytes": 0,
            "pidsMax": intended_limits["maxProcesses"],
            "cpuQuotaMicros": 100_000,
            "cpuPeriodMicros": 100_000,
        },
        "membership": {
            "leaderPid": 100,
            "leaderStartTimeTicks": "12345",
            "memberPids": member_pids,
            "memberSetSha256": _hash(member_pids),
            "descendantsObserved": True,
        },
        "negativeControls": {
            "memory": {
                "requestedBytes": intended_limits["memoryBytes"] + 1,
                "oomKillBefore": 0,
                "oomKillAfter": 1,
                "enforced": True,
            },
            "processes": {
                "attemptedProcesses": intended_limits["maxProcesses"] + 1,
                "maxEventsBefore": 0,
                "maxEventsAfter": 1,
                "enforced": True,
            },
            "cpu": {
                "busyWindowMs": 250,
                "nrThrottledBefore": 0,
                "nrThrottledAfter": 1,
                "throttledUsecBefore": 0,
                "throttledUsecAfter": 1,
                "enforced": True,
            },
        },
        "cleanup": {"cgroupAbsentAfterTimeout": True},
        "observer": {
            "runtimeSessionId": "rt-v61-test1",
            "driverCliSha256": "f" * 64,
            "driverModuleSha256": "0" * 64,
        },
        "observedAt": "2026-07-20T12:00:00.000Z",
    }
    aggregate_evidence = {
        **aggregate_payload,
        "receiptPayloadSha256": _hash(aggregate_payload),
    }
    payload: dict[str, object] = {
        "schemaVersion": "4",
        "status": "VALIDATED",
        "limitMode": "container-cgroup-and-process-rlimit",
        "aggregateLimitIntentEnforced": True,
        "invocationId": control["invocationId"],
        "stagingContainerId": "6" * 64,
        "finalContainerId": control["finalContainerId"],
        "metadataSha256": "7" * 64,
        "originalSpecSha256": "8" * 64,
        "baseSpecSha256": "9" * 64,
        "sanitizedSpecSha256": "a" * 64,
        "configFileSha256": "b" * 64,
        "internalMountManifest": [],
        "internalMountManifestSha256": "c" * 64,
        "readOnlyMountManifest": [],
        "readOnlyMountManifestSha256": "d" * 64,
        "commandSha256": control["commandSha256"],
        "imageAuthority": {
            "canonicalImage": f"counterlab-adapter:git-{build['sourceCommit']}",
            "layerDigests": [f"sha256:{'d' * 64}"],
            "rootfsChainId": f"sha256:{'e' * 64}",
            "targetDigest": build["adapterManifestDigest"],
            "targetMediaType": "application/vnd.oci.image.manifest.v1+json",
            "sourceCommit": build["sourceCommit"],
            "sourceTreeSha256": build["sourceTreeSha256"],
            "configDigest": build["adapterImageDigest"],
            "manifestDigest": build["adapterManifestDigest"],
        },
        "imageRootfs": {},
        "removedFields": [],
        "normalizedFields": [],
        "removedMounts": [],
        "intendedAggregateLimits": intended_limits,
        "enforcedRlimits": [
            {"type": name, "soft": 1, "hard": 1}
            for name in (
                "RLIMIT_AS",
                "RLIMIT_CPU",
                "RLIMIT_FSIZE",
                "RLIMIT_NOFILE",
                "RLIMIT_NPROC",
            )
        ],
        "aggregateLimitEvidence": aggregate_evidence,
    }
    receipt = {**payload, "receiptPayloadSha256": _hash(payload)}
    control["rootlessReceiptPayloadSha256"] = receipt["receiptPayloadSha256"]
    control_payload = {
        key: value for key, value in control.items() if key != "receiptPayloadSha256"
    }
    control["receiptPayloadSha256"] = _hash(control_payload)
    return receipt


def test_control_receipt_requires_every_clean_postcondition() -> None:
    control = _control()
    assert validate_control_receipt(control) == control

    for field in (
        "taskAbsent",
        "containerAbsent",
        "snapshotAbsent",
        "invocationAliasAbsent",
        "imageRootfsAbsent",
        "persistedAuthorityVerified",
        "readOnlyMountsUnchanged",
        "imageRootfsUnchanged",
    ):
        mutated = {**control, field: False}
        payload = {
            key: value
            for key, value in mutated.items()
            if key != "receiptPayloadSha256"
        }
        mutated["receiptPayloadSha256"] = _hash(payload)
        with pytest.raises(RuntimeError, match="not clean"):
            validate_control_receipt(mutated)


def test_control_receipt_rejects_result_release_and_hash_mutation() -> None:
    control = _control()
    with pytest.raises(RuntimeError, match="not clean"):
        validate_control_receipt({**control, "resultReleased": True})
    with pytest.raises(RuntimeError, match="not clean"):
        validate_control_receipt({**control, "receiptPayloadSha256": "f" * 64})


def test_rootless_rlimit_validator_matches_the_runtime_contract() -> None:
    runtime_limits = [
        {"type": name, "soft": 1, "hard": 1}
        for name in (
            "RLIMIT_AS",
            "RLIMIT_CPU",
            "RLIMIT_FSIZE",
            "RLIMIT_NOFILE",
            "RLIMIT_NPROC",
        )
    ]

    assert timeout_proof_module._validate_enforced_rlimits(runtime_limits)
    assert not timeout_proof_module._validate_enforced_rlimits(
        [
            {**entry, "type": "RLIMIT_CORE"}
            if entry["type"] == "RLIMIT_NOFILE"
            else entry
            for entry in runtime_limits
        ]
    )


def test_rootless_receipt_binds_control_and_exact_adapter_authority() -> None:
    control = _control()
    build = {
        "sourceCommit": "e" * 40,
        "sourceTreeSha256": "a" * 64,
        "adapterImageDigest": f"sha256:{'b' * 64}",
        "adapterManifestDigest": f"sha256:{'c' * 64}",
    }
    rootless = _rootless(control, build)

    assert validate_rootless_receipt(rootless, control=control, build=build) == rootless
    with pytest.raises(RuntimeError, match="authority"):
        validate_rootless_receipt(
            rootless,
            control=control,
            build={**build, "sourceCommit": "d" * 40},
        )

    for mutation in (
        {
            "limitMode": (
                "process-address-space-rlimit-with-unenforced-cgroup-intent"
            ),
            "aggregateLimitIntentEnforced": False,
        },
        {
            "limitMode": "declared-but-unverified",
            "aggregateLimitIntentEnforced": True,
        },
        {
            "limitMode": "container-cgroup-and-process-rlimit",
            "aggregateLimitIntentEnforced": True,
            "aggregateLimitEvidence": None,
        },
    ):
        rejected = {**rootless, **mutation}
        payload = {
            key: value
            for key, value in rejected.items()
            if key != "receiptPayloadSha256"
        }
        rejected["receiptPayloadSha256"] = _hash(payload)
        control["rootlessReceiptPayloadSha256"] = rejected[
            "receiptPayloadSha256"
        ]
        with pytest.raises(
            RuntimeError, match="authority|aggregate limit evidence"
        ):
            validate_rootless_receipt(rejected, control=control, build=build)

    broken_counter = json.loads(json.dumps(rootless))
    broken_counter["aggregateLimitEvidence"]["negativeControls"]["memory"][
        "oomKillAfter"
    ] = 2
    evidence_payload = {
        key: value
        for key, value in broken_counter["aggregateLimitEvidence"].items()
        if key != "receiptPayloadSha256"
    }
    broken_counter["aggregateLimitEvidence"]["receiptPayloadSha256"] = _hash(
        evidence_payload
    )
    payload = {
        key: value
        for key, value in broken_counter.items()
        if key != "receiptPayloadSha256"
    }
    broken_counter["receiptPayloadSha256"] = _hash(payload)
    control["rootlessReceiptPayloadSha256"] = broken_counter[
        "receiptPayloadSha256"
    ]
    with pytest.raises(RuntimeError, match="aggregate limit evidence"):
        validate_rootless_receipt(broken_counter, control=control, build=build)


def test_exactly_one_new_rootless_receipt_is_required(tmp_path: Path) -> None:
    first = tmp_path / "first.receipt.json"
    second = tmp_path / "second.receipt.json"
    assert select_new_receipt(set(), {first}) == first
    with pytest.raises(RuntimeError, match="exactly one"):
        select_new_receipt(set(), set())
    with pytest.raises(RuntimeError, match="exactly one"):
        select_new_receipt(set(), {first, second})


def test_repository_evidence_rejects_intermediate_symlinks(tmp_path: Path) -> None:
    root = tmp_path / "repo"
    target = root / "target"
    root.mkdir()
    target.mkdir()
    (target / "receipt.json").write_text("{}\n", encoding="utf-8")
    (root / "linked").symlink_to(target, target_is_directory=True)

    with pytest.raises(RuntimeError, match="symbolic link"):
        timeout_proof_module._repository_file(
            root, "linked/receipt.json", "receipt"
        )


def test_adapter_calls_use_explicit_identity_and_a_fixed_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    observed: dict[str, object] = {}

    def fake_run(command: tuple[str, ...], **options: object):
        observed["command"] = command
        observed.update(options)
        return subprocess.CompletedProcess(command, 0, stdout="{}\n", stderr="")

    monkeypatch.setattr(timeout_proof_module.subprocess, "run", fake_run)
    adapter = tmp_path / "scripts/contained-runtime-adapter.sh"
    control = tmp_path / "timeout-control.json"
    timeout_proof_module._run_adapter(
        adapter,
        "rt-v61-test1",
        ("run", "--pull=never", "counterlab-runner:local"),
        control_receipt=control,
        timeout=30,
    )

    assert observed["command"] == (
        str(adapter),
        "--session-id",
        "rt-v61-test1",
        "--control-receipt",
        str(control),
        "--",
        "run",
        "--pull=never",
        "counterlab-runner:local",
    )
    assert observed["env"] == {"PATH": "/usr/bin:/bin"}
    assert "COUNTERLAB_RUNTIME_SESSION_ID" not in observed["env"]
    assert "COUNTERLAB_RUNTIME_CONTROL_RECEIPT" not in observed["env"]
