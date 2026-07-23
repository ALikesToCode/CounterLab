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


def _control(schema_version: str = "2") -> dict[str, object]:
    payload: dict[str, object] = {
        "schemaVersion": schema_version,
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
    if schema_version == "3":
        payload["qualificationMode"] = "aggregate-timeout-proof-v1"
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
        "schemaVersion": "3",
        "status": "OBSERVED",
        "authority": "linux-cgroup-v2",
        "cgroupVersion": 2,
        "cgroupId": f"counterlab-v6.1-{invocation_id}",
        "cgroupPath": f"containerd/counterlab-v6.1-{invocation_id}",
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
                "maxEventsBefore": 0,
                "maxEventsAfter": 1,
                "oomKillBefore": 0,
                "oomKillAfter": 0,
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
        "schemaVersion": "5",
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
            {
                "type": "RLIMIT_AS",
                "soft": timeout_proof_module.CONTAINED_PROCESS_ADDRESS_SPACE_BYTES,
                "hard": timeout_proof_module.CONTAINED_PROCESS_ADDRESS_SPACE_BYTES,
            },
            {"type": "RLIMIT_CPU", "soft": 20, "hard": 20},
            {"type": "RLIMIT_FSIZE", "soft": 262_144, "hard": 262_144},
            {"type": "RLIMIT_NOFILE", "soft": 64, "hard": 64},
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


def _rebind_aggregate_receipt(
    rootless: dict[str, object],
    control: dict[str, object],
) -> None:
    evidence = rootless["aggregateLimitEvidence"]
    assert isinstance(evidence, dict)
    evidence_payload = {
        key: value
        for key, value in evidence.items()
        if key != "receiptPayloadSha256"
    }
    evidence["receiptPayloadSha256"] = _hash(evidence_payload)
    rootless_payload = {
        key: value
        for key, value in rootless.items()
        if key != "receiptPayloadSha256"
    }
    rootless["receiptPayloadSha256"] = _hash(rootless_payload)
    control["rootlessReceiptPayloadSha256"] = rootless[
        "receiptPayloadSha256"
    ]
    control_payload = {
        key: value
        for key, value in control.items()
        if key != "receiptPayloadSha256"
    }
    control["receiptPayloadSha256"] = _hash(control_payload)


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


def test_control_receipt_accepts_only_exact_v2_and_qualified_v3_shapes() -> None:
    assert validate_control_receipt(_control("2"))["schemaVersion"] == "2"
    assert validate_control_receipt(_control("3"))["schemaVersion"] == "3"

    for mutated in (
        {**_control("2"), "qualificationMode": "aggregate-timeout-proof-v1"},
        {
            key: value
            for key, value in _control("3").items()
            if key != "qualificationMode"
        },
        {**_control("3"), "qualificationMode": "unknown"},
        {**_control("2"), "schemaVersion": []},
        {**_control("2"), "candidateWallSeconds": True},
    ):
        payload = {
            key: value
            for key, value in mutated.items()
            if key != "receiptPayloadSha256"
        }
        mutated["receiptPayloadSha256"] = _hash(payload)
        with pytest.raises(RuntimeError, match="shape|not clean"):
            validate_control_receipt(mutated)


def test_control_schema_selects_the_exact_rootless_receipt_name() -> None:
    assert timeout_proof_module._rootless_receipt_name(_control("2")) == (
        f"{'2' * 64}.receipt.json"
    )
    assert timeout_proof_module._rootless_receipt_name(_control("3")) == (
        f"{'2' * 64}.qualified-receipt.json"
    )
    with pytest.raises(RuntimeError, match="qualification"):
        timeout_proof_module._rootless_receipt_name(
            {**_control("3"), "qualificationMode": "unknown"}
        )


def test_rootless_rlimit_validator_matches_the_runtime_contract() -> None:
    intended = {
        "cpuCount": 1,
        "maxProcesses": 16,
        "memoryBytes": 512 * 1024 * 1024,
    }
    runtime_limits = [
        {
            "type": "RLIMIT_AS",
            "soft": timeout_proof_module.CONTAINED_PROCESS_ADDRESS_SPACE_BYTES,
            "hard": timeout_proof_module.CONTAINED_PROCESS_ADDRESS_SPACE_BYTES,
        },
        {"type": "RLIMIT_CPU", "soft": 20, "hard": 20},
        {"type": "RLIMIT_FSIZE", "soft": 262_144, "hard": 262_144},
        {"type": "RLIMIT_NOFILE", "soft": 64, "hard": 64},
    ]

    assert timeout_proof_module._validate_enforced_rlimits(runtime_limits, intended)
    assert not timeout_proof_module._validate_enforced_rlimits(
        [
            {**entry, "type": "RLIMIT_CORE"}
            if entry["type"] == "RLIMIT_NOFILE"
            else entry
            for entry in runtime_limits
        ],
        intended,
    )
    for limit_type in ("RLIMIT_AS",):
        changed = json.loads(json.dumps(runtime_limits))
        entry = next(item for item in changed if item["type"] == limit_type)
        entry["soft"] -= 1
        entry["hard"] -= 1
        assert not timeout_proof_module._validate_enforced_rlimits(changed, intended)


def test_timeout_candidate_observes_the_exact_address_space_limit() -> None:
    source = timeout_proof_module._timeout_public_test(512 * 1024 * 1024)
    assert timeout_proof_module.TIMEOUT_PROOF_WALL_SECONDS == 30
    assert "resource.getrlimit(resource.RLIMIT_AS)" in source
    assert "expected = (536870912, 536870912)" in source
    assert "subprocess.Popen" in source
    assert source.count("while time.monotonic() < deadline") == 1
    assert "time.sleep(90)" in source
    assert "child.wait" in source
    with pytest.raises(RuntimeError, match="address-space"):
        timeout_proof_module._timeout_public_test(0)


def test_aggregate_memory_control_v3_proves_max_without_an_oom_kill() -> None:
    build = {
        "sourceCommit": "e" * 40,
        "sourceTreeSha256": "a" * 64,
        "adapterImageDigest": f"sha256:{'b' * 64}",
        "adapterManifestDigest": f"sha256:{'c' * 64}",
    }
    control = _control("3")
    rootless = _rootless(control, build)
    evidence = rootless["aggregateLimitEvidence"]
    assert isinstance(evidence, dict)
    assert evidence["schemaVersion"] == "3"
    controls = evidence["negativeControls"]
    assert isinstance(controls, dict)
    memory = controls["memory"]
    assert isinstance(memory, dict)
    assert set(memory) == {
        "requestedBytes",
        "maxEventsBefore",
        "maxEventsAfter",
        "oomKillBefore",
        "oomKillAfter",
        "enforced",
    }
    assert validate_rootless_receipt(rootless, control=control, build=build) == rootless

    for mutate in (
        lambda value: value.update(maxEventsAfter=value["maxEventsBefore"]),
        lambda value: value.update(oomKillAfter=value["oomKillBefore"] + 1),
        lambda value: value.update(requestedBytes=512 * 1024 * 1024),
        lambda value: value.pop("maxEventsAfter"),
        lambda value: value.update(reclaimedBytes=1),
    ):
        rejected_control = _control("3")
        rejected = _rootless(rejected_control, build)
        rejected_evidence = rejected["aggregateLimitEvidence"]
        assert isinstance(rejected_evidence, dict)
        rejected_controls = rejected_evidence["negativeControls"]
        assert isinstance(rejected_controls, dict)
        rejected_memory = rejected_controls["memory"]
        assert isinstance(rejected_memory, dict)
        mutate(rejected_memory)
        _rebind_aggregate_receipt(rejected, rejected_control)
        with pytest.raises(RuntimeError, match="aggregate limit evidence"):
            validate_rootless_receipt(
                rejected,
                control=rejected_control,
                build=build,
            )


def test_aggregate_memory_control_v2_remains_fail_closed_for_compatibility() -> None:
    build = {
        "sourceCommit": "e" * 40,
        "sourceTreeSha256": "a" * 64,
        "adapterImageDigest": f"sha256:{'b' * 64}",
        "adapterManifestDigest": f"sha256:{'c' * 64}",
    }
    control = _control()
    rootless = _rootless(control, build)
    evidence = rootless["aggregateLimitEvidence"]
    assert isinstance(evidence, dict)
    evidence["schemaVersion"] = "2"
    controls = evidence["negativeControls"]
    assert isinstance(controls, dict)
    memory = controls["memory"]
    assert isinstance(memory, dict)
    memory.clear()
    memory.update(
        {
            "requestedBytes": 512 * 1024 * 1024 + 1,
            "oomKillBefore": 0,
            "oomKillAfter": 1,
            "enforced": True,
        }
    )
    _rebind_aggregate_receipt(rootless, control)
    assert validate_rootless_receipt(rootless, control=control, build=build) == rootless

    qualified_control = _control("3")
    qualified_rootless = _rootless(qualified_control, build)
    qualified_evidence = qualified_rootless["aggregateLimitEvidence"]
    assert isinstance(qualified_evidence, dict)
    qualified_evidence["schemaVersion"] = "2"
    qualified_controls = qualified_evidence["negativeControls"]
    assert isinstance(qualified_controls, dict)
    qualified_memory = qualified_controls["memory"]
    assert isinstance(qualified_memory, dict)
    qualified_memory.clear()
    qualified_memory.update(memory)
    _rebind_aggregate_receipt(qualified_rootless, qualified_control)
    with pytest.raises(RuntimeError, match="authority"):
        validate_rootless_receipt(
            qualified_rootless,
            control=qualified_control,
            build=build,
        )

    memory["oomKillAfter"] = memory["oomKillBefore"]
    _rebind_aggregate_receipt(rootless, control)
    with pytest.raises(RuntimeError, match="aggregate limit evidence"):
        validate_rootless_receipt(rootless, control=control, build=build)


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
    direct_control = _control()
    direct = _rootless(direct_control, build)
    direct["aggregateLimitEvidence"]["cgroupPath"] = (
        f"counterlab-v6.1-{direct_control['invocationId']}"
    )
    direct_evidence_payload = {
        key: value
        for key, value in direct["aggregateLimitEvidence"].items()
        if key != "receiptPayloadSha256"
    }
    direct["aggregateLimitEvidence"]["receiptPayloadSha256"] = _hash(
        direct_evidence_payload
    )
    direct_payload = {
        key: value for key, value in direct.items() if key != "receiptPayloadSha256"
    }
    direct["receiptPayloadSha256"] = _hash(direct_payload)
    direct_control["rootlessReceiptPayloadSha256"] = direct[
        "receiptPayloadSha256"
    ]
    direct_control_payload = {
        key: value
        for key, value in direct_control.items()
        if key != "receiptPayloadSha256"
    }
    direct_control["receiptPayloadSha256"] = _hash(direct_control_payload)
    assert (
        validate_rootless_receipt(
            direct,
            control=direct_control,
            build=build,
        )
        == direct
    )
    for limit_type in ("RLIMIT_AS",):
        changed_control = _control()
        changed = _rootless(changed_control, build)
        limit = next(
            entry
            for entry in changed["enforcedRlimits"]
            if entry["type"] == limit_type
        )
        limit["soft"] -= 1
        limit["hard"] -= 1
        changed_payload = {
            key: value
            for key, value in changed.items()
            if key != "receiptPayloadSha256"
        }
        changed["receiptPayloadSha256"] = _hash(changed_payload)
        changed_control["rootlessReceiptPayloadSha256"] = changed[
            "receiptPayloadSha256"
        ]
        changed_control_payload = {
            key: value
            for key, value in changed_control.items()
            if key != "receiptPayloadSha256"
        }
        changed_control["receiptPayloadSha256"] = _hash(changed_control_payload)
        with pytest.raises(RuntimeError, match="authority"):
            validate_rootless_receipt(
                changed, control=changed_control, build=build
            )
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

    nested_control = _control()
    nested_path = _rootless(nested_control, build)
    nested_path["aggregateLimitEvidence"]["cgroupPath"] = (
        f"other/counterlab-v6.1-{nested_control['invocationId']}"
    )
    nested_evidence_payload = {
        key: value
        for key, value in nested_path["aggregateLimitEvidence"].items()
        if key != "receiptPayloadSha256"
    }
    nested_path["aggregateLimitEvidence"]["receiptPayloadSha256"] = _hash(
        nested_evidence_payload
    )
    nested_payload = {
        key: value
        for key, value in nested_path.items()
        if key != "receiptPayloadSha256"
    }
    nested_path["receiptPayloadSha256"] = _hash(nested_payload)
    nested_control["rootlessReceiptPayloadSha256"] = nested_path[
        "receiptPayloadSha256"
    ]
    nested_control_payload = {
        key: value
        for key, value in nested_control.items()
        if key != "receiptPayloadSha256"
    }
    nested_control["receiptPayloadSha256"] = _hash(nested_control_payload)
    with pytest.raises(RuntimeError, match="aggregate limit evidence"):
        validate_rootless_receipt(
            nested_path,
            control=nested_control,
            build=build,
        )


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
