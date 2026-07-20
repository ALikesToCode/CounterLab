from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

import pytest

from scripts.production_smoke_report import (
    finish_report,
    initialize_report,
    load_report,
    record_stage,
    validate_report,
)


_REQUIRED_PASSING_STAGES = (
    ("public-readiness", "control_plane", None),
    ("capability-health", "control_plane", None),
    ("public-secret-scan", "control_plane", None),
    ("judge-mode", "control_plane", None),
    ("sample-lesson", "sample", None),
    ("verified-replay", "replay", None),
    ("hosted-capsule-replay", "replay", "entity_leakage"),
    ("live-leakage", "live_notebook", "entity_leakage"),
    ("live-imbalance", "live_notebook", "class_imbalance"),
)


def _deployment_identity(**overrides: object) -> dict[str, object]:
    identity = {
        "deployment_id": "11111111-2222-3333-4444-555555555555",
        "worker_evidence_commit": "c" * 40,
        "runner_source_commit": "d" * 40,
        "container_image_digest": "sha256:" + "a" * 64,
        "timeout_cleanup_receipt_sha256": "b" * 64,
        "aggregate_limit_evidence_sha256": "9" * 64,
        "runtime_policy_sha256": "c" * 64,
        "proof_dependency_manifest_sha256": "d" * 64,
        "worker_artifact_classification": "PROCESS_BOUND_PARTIAL",
        "worker_artifact_manifest_sha256": "1" * 64,
        "worker_bundle_sha256": "2" * 64,
        "client_assets_sha256": "3" * 64,
        "client_asset_count": 27,
        "client_public_assets_sha256": "4" * 64,
        "client_public_asset_count": 25,
        "vite_version": "8.1.4",
        "wrangler_version": "4.110.0",
        "deployment_receipt_sha256": "e" * 64,
    }
    identity.update(overrides)
    return identity


def _passing_stage(
    stage_id: str,
    mode: str,
    concept: str | None,
) -> dict[str, object]:
    stage: dict[str, object] = {
        "id": stage_id,
        "mode": mode,
        "status": "PASSED",
        "startedAt": "2026-07-15T12:00:01Z",
        "completedAt": "2026-07-15T12:00:05Z",
        "evidence": {"responseSha256": "b" * 64},
    }
    if concept is not None:
        stage["concept"] = concept
    return stage


def _live_evidence_source() -> str:
    script = pathlib.Path(__file__).with_name("production-smoke.sh").read_text(
        encoding="utf-8"
    )
    marker = 'python3 - "$1" "$2" <<\'PY\'\n'
    start = script.index(marker) + len(marker)
    return script[start : script.index("\nPY\n", start)]


def _parse_deployment_identity(
    path: pathlib.Path,
) -> subprocess.CompletedProcess[str]:
    root = pathlib.Path(__file__).parents[1]
    return subprocess.run(
        [
            "node",
            "--import",
            "tsx",
            "scripts/release-check-receipt.ts",
            "deployment-identity",
            "--deployment",
            str(path),
        ],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )


def _control_plane_validator_source(kind: str) -> str:
    script = pathlib.Path(__file__).with_name("production-smoke.sh").read_text(
        encoding="utf-8"
    )
    marker = (
        f'python3 - "${{WORK_DIR}}/{kind}.json" "${{WORKER_VERSION_ID}}" '
        '"${WORKER_EVIDENCE_COMMIT}" "${RUNNER_SOURCE_COMMIT}" '
        '"${CONTAINER_IMAGE_DIGEST}" "${TIMEOUT_CLEANUP_RECEIPT_SHA256}" '
        '"${AGGREGATE_LIMIT_EVIDENCE_SHA256}" '
        '"${RUNTIME_POLICY_SHA256}" "${PROOF_DEPENDENCY_MANIFEST_SHA256}" '
        '"${WORKER_ARTIFACT_CLASSIFICATION}" '
        '"${WORKER_ARTIFACT_MANIFEST_SHA256}" "${WORKER_BUNDLE_SHA256}" '
        '"${CLIENT_ASSETS_SHA256}" "${CLIENT_ASSET_COUNT}" '
        '"${CLIENT_PUBLIC_ASSETS_SHA256}" "${CLIENT_PUBLIC_ASSET_COUNT}" '
        '"${FROZEN_VITE_VERSION}" "${FROZEN_WRANGLER_VERSION}" <<\'PY\'\n'
    )
    start = script.index(marker) + len(marker)
    return script[start : script.index("\nPY\n", start)]


def test_smoke_workspaces_are_repo_contained_and_never_recursively_deleted() -> None:
    script = pathlib.Path(__file__).with_name("production-smoke.sh").read_text(
        encoding="utf-8"
    )

    assert "node_modules/.cache/counterlab-v6.1/production-smoke-work" in script
    assert "mktemp" not in script
    assert "rm -rf" not in script
    assert "COUNTERLAB_DEPLOYMENT_RECEIPT" in script
    assert "COUNTERLAB_DEPLOYMENT_ID" not in script
    assert "COUNTERLAB_CONTAINER_IMAGE_DIGEST" not in script
    assert (
        "node_modules/.cache/counterlab-v6.1/releases/production-smoke-"
        in script
    )


def _deployment_receipt() -> dict[str, object]:
    worker = "a" * 40
    runner = "b" * 40
    digest = "sha256:" + "c" * 64
    return {
        "schemaVersion": "4",
        "status": "DEPLOYED",
        "workerName": "counterlab",
        "productionOrigin": "https://counterlab.cserules.workers.dev",
        "generationFilesystemReadIsolation": "PARTIAL",
        "workerEvidenceCommit": worker,
        "runnerSourceCommit": runner,
        "qualifiedRunnerReceiptSha256": "1" * 64,
        "releaseCheckReceiptSha256": "2" * 64,
        "releaseCheckCheckedAt": "2026-07-18T23:59:00.000Z",
        "timeoutCleanupReceiptSha256": "d" * 64,
        "aggregateLimitEvidenceSha256": "9" * 64,
        "runtimeToolchainSha256": "3" * 64,
        "runtimePolicySha256": "e" * 64,
        "proofDependencyManifestSha256": "f" * 64,
        "runtimeAdapterSha256": "4" * 64,
        "adapterImageDigest": "sha256:" + "5" * 64,
        "workerVersionId": "11111111-2222-3333-4444-555555555555",
        "workerTag": f"git-{worker}",
        "workerMessage": f"CounterLab Worker {worker}; runner {runner}",
        "containerApplicationId": "container-app-1",
        "containerApplicationVersion": "3",
        "containerImage": (
            f"registry.cloudflare.com/account/counterlab-runner@{digest}"
        ),
        "containerState": "active",
        "containerImageDigest": digest,
        "workerArtifactClassification": "PROCESS_BOUND_PARTIAL",
        "workerArtifactManifestSha256": "5" * 64,
        "deployConfigSha256": "d" * 64,
        "workerBundleSha256": "6" * 64,
        "clientAssetsSha256": "7" * 64,
        "clientAssetCount": 8,
        "clientPublicAssetsSha256": "8" * 64,
        "clientPublicAssetCount": 6,
        "viteVersion": "8.1.4",
        "wranglerVersion": "4.110.0",
        "dryRunSha256": "6" * 64,
        "dryRunFileCount": 1,
        "deploymentStatusSha256": "9" * 64,
        "workerVersionSha256": "a" * 64,
        "containerStatusSha256": "b" * 64,
        "deployedAt": "2026-07-19T00:00:00.000Z",
        "verifierVersion": "counterlab-deployment-v4",
    }


def test_deployment_receipt_parser_accepts_only_the_exact_release_tuple() -> None:
    root = pathlib.Path(__file__).parents[1]
    contained_temp = root / "node_modules/.cache/counterlab-v6.1/test-tmp"
    contained_temp.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=contained_temp) as destination:
        path = pathlib.Path(destination) / "deployment-receipt.json"
        receipt = _deployment_receipt()
        path.write_text(json.dumps(receipt), encoding="utf-8")
        accepted = _parse_deployment_identity(path)
        assert accepted.returncode == 0, accepted.stderr
        identity = json.loads(accepted.stdout)
        assert set(identity) == {
            "identitySchemaVersion",
            "receiptType",
            "receiptSha256",
            "receipt",
        }
        assert identity["identitySchemaVersion"] == "1"
        assert identity["receiptType"] == "deployment-receipt"
        assert identity["receipt"] == receipt
        assert identity["receiptSha256"] == hashlib.sha256(path.read_bytes()).hexdigest()

        receipt["unexpected"] = True
        path.write_text(json.dumps(receipt), encoding="utf-8")
        unknown = _parse_deployment_identity(path)
        assert unknown.returncode != 0
        assert "unexpected" in unknown.stderr

        receipt = _deployment_receipt()
        receipt.pop("releaseCheckReceiptSha256")
        path.write_text(json.dumps(receipt), encoding="utf-8")
        missing = _parse_deployment_identity(path)
        assert missing.returncode != 0
        assert "releaseCheckReceiptSha256" in missing.stderr

        receipt = _deployment_receipt()
        receipt["containerState"] = "degraded"
        path.write_text(json.dumps(receipt), encoding="utf-8")
        degraded = _parse_deployment_identity(path)
        assert degraded.returncode != 0
        assert "containerState" in degraded.stderr

        receipt = _deployment_receipt()
        receipt["containerImage"] = (
            "registry.cloudflare.com/account/counterlab-runner@sha256:"
            + "0" * 64
            + str(receipt["containerImageDigest"])
        )
        path.write_text(json.dumps(receipt), encoding="utf-8")
        embedded = _parse_deployment_identity(path)
        assert embedded.returncode != 0
        assert "Container image must bind" in embedded.stderr


def test_control_plane_validators_bind_exact_release_and_maintenance_state() -> None:
    version = "11111111-2222-3333-4444-555555555555"
    worker = "a" * 40
    runner = "b" * 40
    digest = "sha256:" + "c" * 64
    timeout_receipt = "d" * 64
    aggregate_limit_evidence = "9" * 64
    runtime_policy = "e" * 64
    proof_manifest = "f" * 64
    artifact_classification = "PROCESS_BOUND_PARTIAL"
    artifact_manifest = "1" * 64
    worker_bundle = "2" * 64
    client_assets = "3" * 64
    client_asset_count = 27
    public_assets = "4" * 64
    public_asset_count = 25
    vite_version = "8.1.4"
    wrangler_version = "4.110.0"
    release = {
        "status": "bound",
        "workerVersionId": version,
        "workerVersionTag": f"git-{worker}",
        "workerEvidenceCommit": worker,
        "runnerSourceCommit": runner,
        "runnerImageDigest": digest,
        "timeoutCleanupReceiptSha256": timeout_receipt,
        "aggregateLimitEvidenceSha256": aggregate_limit_evidence,
        "runtimePolicySha256": runtime_policy,
        "proofDependencyManifestSha256": proof_manifest,
        "workerArtifactClassification": artifact_classification,
        "workerArtifactManifestSha256": artifact_manifest,
        "workerBundleSha256": worker_bundle,
        "clientAssetsSha256": client_assets,
        "clientAssetCount": client_asset_count,
        "clientPublicAssetsSha256": public_assets,
        "clientPublicAssetCount": public_asset_count,
        "viteVersion": vite_version,
        "wranglerVersion": wrangler_version,
    }
    ready = {
        "status": "ready",
        "checks": {
            key: True
            for key in (
                "admission",
                "analyst",
                "maintenance",
                "persistence",
                "privateStorage",
                "releaseIdentity",
                "runner",
                "signing",
            )
        },
        "maintenance": False,
        "release": release,
    }
    health = {
        "ok": True,
        "data": {
            "platform": "cloudflare-workers",
            "sample": "available",
            "replay": "available",
            "liveGpt": "configured",
            "liveCodex": "configured",
            "liveKernel": "configured",
            "sandbox": "credential-and-privilege-boundary",
            "generationFilesystemReadIsolation": "PARTIAL",
            "readiness": "not-checked",
            "maintenance": False,
            "release": release,
        },
    }

    def run_validator(
        kind: str, path: pathlib.Path
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                "-c",
                _control_plane_validator_source(kind),
                str(path),
                version,
                worker,
                runner,
                digest,
                timeout_receipt,
                aggregate_limit_evidence,
                runtime_policy,
                proof_manifest,
                artifact_classification,
                artifact_manifest,
                worker_bundle,
                client_assets,
                str(client_asset_count),
                public_assets,
                str(public_asset_count),
                vite_version,
                wrangler_version,
            ],
            check=False,
            capture_output=True,
            text=True,
        )

    with tempfile.TemporaryDirectory() as destination:
        for kind, payload in (("ready", ready), ("health", health)):
            path = pathlib.Path(destination) / f"{kind}.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            accepted = run_validator(kind, path)
            assert accepted.returncode == 0, accepted.stderr

            tampered = json.loads(json.dumps(payload))
            tampered_release = (
                tampered["release"]
                if kind == "ready"
                else tampered["data"]["release"]
            )
            tampered_release["runnerImageDigest"] = "sha256:" + "d" * 64
            path.write_text(json.dumps(tampered), encoding="utf-8")
            rejected = run_validator(kind, path)
            assert rejected.returncode != 0
            assert "release identity does not match" in rejected.stderr

            for field in (
                "aggregateLimitEvidenceSha256",
                "runtimePolicySha256",
                "proofDependencyManifestSha256",
                "workerArtifactClassification",
                "workerArtifactManifestSha256",
                "workerBundleSha256",
                "clientAssetsSha256",
                "clientAssetCount",
                "clientPublicAssetsSha256",
                "clientPublicAssetCount",
                "viteVersion",
                "wranglerVersion",
            ):
                tampered = json.loads(json.dumps(payload))
                tampered_release = (
                    tampered["release"]
                    if kind == "ready"
                    else tampered["data"]["release"]
                )
                tampered_release[field] = (
                    1 if field.endswith("Count") else "0" * 64
                )
                path.write_text(json.dumps(tampered), encoding="utf-8")
                rejected = run_validator(kind, path)
                assert rejected.returncode != 0
                assert "release identity does not match" in rejected.stderr

            maintenance = json.loads(json.dumps(payload))
            if kind == "ready":
                maintenance["maintenance"] = True
            else:
                maintenance["data"]["maintenance"] = True
            path.write_text(json.dumps(maintenance), encoding="utf-8")
            frozen = run_validator(kind, path)
            assert frozen.returncode != 0
            assert "maintenance" in frozen.stderr


def _valid_live_evidence(
    concept: str,
    **overrides: object,
) -> dict[str, object]:
    evidence: dict[str, object] = {
        "schemaVersion": "3",
        "concept": concept,
        "sessionId": "session_live_123",
        "publishedReplayId": "replay_live_123",
        "proofCapsuleMediaType": "application/vnd.counterlab.capsule+json",
        "proofCapsuleIntegrityMode": "hmac-signed",
        "proofCapsuleByteLength": 12_345,
        "replayPlaybackMode": "verified_capsule_replay",
        "replaySourceMode": "live_notebook",
        "replayPersistedAfterRefresh": True,
        "publicReplayAuthorityMatches": True,
        "publicReplayPrivateArtifactsUnavailable": True,
        "duplicateReplayPublicationReused": True,
    }
    for key, fill in {
        "sourceArtifactHash": "1",
        "experimentIrHash": "2",
        "experimentSelectionHash": "0",
        "resultHash": "3",
        "evidenceVerdictHash": "0",
        "epistemicReportHash": "0",
        "boundaryMapHash": "4",
        "boundaryReceiptHash": "0",
        "transferResultHash": "0",
        "patchPlanHash": "0",
        "patchResultHash": "5",
        "patchedArtifactHash": "0",
        "patchedNotebookSha256": "6",
        "proofCapsuleSha256": "7",
        "proofCapsuleRootHash": "8",
        "proofCapsuleBytesHash": "9",
        "reasoningDiffHash": "a",
        "eventChainHead": "b",
        "scientificEngineSnapshotHash": "c",
        "replayProjectionHash": "d",
        "ownerProofCapsuleSha256": "e",
        "ownerPatchedNotebookSha256": "f",
    }.items():
        evidence[key] = fill * 64
    evidence.update(overrides)
    return evidence


def test_public_asset_scan_is_cloak_backed_and_repo_contained() -> None:
    script = pathlib.Path(__file__).with_name("production-smoke.sh").read_text(
        encoding="utf-8"
    )
    browser = (
        pathlib.Path(__file__).parents[1]
        / "apps/web/e2e/judged-flow.spec.ts"
    ).read_text(encoding="utf-8")

    assert "urllib.request" not in script
    assert "COUNTERLAB_E2E_PUBLIC_ASSET_SCAN=1" in script
    assert "COUNTERLAB_E2E_PUBLIC_ASSET_EVIDENCE_PATH" in script
    assert "COUNTERLAB_E2E_FROZEN_WORKER_MANIFEST_PATH" in script
    assert "COUNTERLAB_E2E_CLIENT_PUBLIC_ASSETS_SHA256" in script
    assert "COUNTERLAB_E2E_CLIENT_PUBLIC_ASSET_COUNT" in script
    assert 'COUNTERLAB_E2E_RUNTIME_ROOT="${PUBLIC_ASSET_RUNTIME_ROOT}"' in script
    assert (
        "Loaded public release routes and assets retain security headers and contain no secrets"
        in script
    )
    assert (
        'test("Loaded public release routes and assets retain security headers and contain no secrets"'
        in browser
    )
    assert "response!.request().redirectedFrom()" in browser
    assert "expect(asset.redirectedFrom, url).toBeNull()" in browser
    assert "max-age=31536000" in browser
    assert "ensureRuntimeParent(evidencePath)" in browser
    assert "FrozenWorkerReleaseManifestSchema" in browser
    assert 'crypto.subtle.digest("SHA-256", bytes)' in browser
    assert "exactPublicAssets" in browser
    assert "manifest.clientPublicAssetsSha256" in browser


def test_smoke_report_is_atomic_idempotent_and_secret_free() -> None:
    with tempfile.TemporaryDirectory() as destination:
        path = pathlib.Path(destination) / "production-smoke.json"
        initialized = initialize_report(
            path,
            base_url="https://counterlab.example.test/",
            started_at="2026-07-15T12:00:00Z",
            **_deployment_identity(),
        )
        assert initialized["status"] == "RUNNING"
        assert initialized["schemaVersion"] == "4"
        assert initialized["baseUrl"] == "https://counterlab.example.test"
        assert initialized["stages"] == []

        for stage_id, mode, concept in _REQUIRED_PASSING_STAGES:
            stage = _passing_stage(stage_id, mode, concept)
            record_stage(path, stage)
            record_stage(path, stage)
        report = finish_report(
            path,
            status="PASSED",
            completed_at="2026-07-15T12:00:06Z",
        )

        assert report["status"] == "PASSED"
        assert len(report["stages"]) == len(_REQUIRED_PASSING_STAGES)
        assert load_report(path) == report
        assert not list(path.parent.glob("*.tmp"))
        assert report["privacy"] == {
            "containsSecrets": False,
            "containsRawNotebookBytes": False,
            "containsPrivateReasoning": False,
        }


def test_smoke_report_versions_preserve_v2_v3_and_require_v4_artifact_bindings() -> None:
    with tempfile.TemporaryDirectory() as destination:
        path = pathlib.Path(destination) / "production-smoke.json"
        current = initialize_report(
            path,
            base_url="https://counterlab.example.test",
            started_at="2026-07-15T12:00:00Z",
            **_deployment_identity(),
        )
        assert current["schemaVersion"] == "4"

        v4_fields = (
            "aggregateLimitEvidenceSha256",
            "workerArtifactClassification",
            "workerArtifactManifestSha256",
            "workerBundleSha256",
            "clientAssetsSha256",
            "clientAssetCount",
            "clientPublicAssetsSha256",
            "clientPublicAssetCount",
            "viteVersion",
            "wranglerVersion",
        )

        historical_v3 = json.loads(json.dumps(current))
        historical_v3["schemaVersion"] = "3"
        for field in v4_fields:
            historical_v3["deployment"].pop(field)
        assert validate_report(historical_v3)["schemaVersion"] == "3"

        historical = json.loads(json.dumps(historical_v3))
        historical["schemaVersion"] = "2"
        for field in (
            "timeoutCleanupReceiptSha256",
            "runtimePolicySha256",
            "proofDependencyManifestSha256",
        ):
            historical["deployment"].pop(field)
        assert validate_report(historical)["schemaVersion"] == "2"

        expanded_v2 = json.loads(json.dumps(current))
        expanded_v2["schemaVersion"] = "2"
        with pytest.raises(ValueError, match="deployment metadata"):
            validate_report(expanded_v2)

        incomplete_v3 = json.loads(json.dumps(historical_v3))
        incomplete_v3["deployment"].pop("runtimePolicySha256")
        with pytest.raises(ValueError, match="deployment metadata"):
            validate_report(incomplete_v3)

        malformed_v3 = json.loads(json.dumps(historical_v3))
        malformed_v3["deployment"]["proofDependencyManifestSha256"] = "short"
        with pytest.raises(ValueError, match="proofDependencyManifestSha256"):
            validate_report(malformed_v3)

        invalid_v4 = json.loads(json.dumps(current))
        invalid_v4["deployment"]["clientPublicAssetCount"] = 28
        with pytest.raises(ValueError, match="asset counts"):
            validate_report(invalid_v4)


def test_smoke_report_rejects_conflicts_secrets_and_credential_urls() -> None:
    with tempfile.TemporaryDirectory() as destination:
        path = pathlib.Path(destination) / "production-smoke.json"
        with pytest.raises(ValueError, match="credentials"):
            initialize_report(
                path,
                base_url="https://user:pass@counterlab.example.test",
                started_at="2026-07-15T12:00:00Z",
            )
        initialize_report(
            path,
            base_url="https://counterlab.example.test",
            started_at="2026-07-15T12:00:00Z",
        )
        record_stage(
            path,
            {
                "id": "ready",
                "mode": "control_plane",
                "status": "PASSED",
                "startedAt": "2026-07-15T12:00:01Z",
                "completedAt": "2026-07-15T12:00:02Z",
                "evidence": {},
            },
        )
        with pytest.raises(ValueError, match="conflicting"):
            record_stage(
                path,
                {
                    "id": "ready",
                    "mode": "control_plane",
                    "status": "FAILED",
                    "startedAt": "2026-07-15T12:00:01Z",
                    "completedAt": "2026-07-15T12:00:02Z",
                    "evidence": {},
                },
            )
        with pytest.raises(ValueError, match="secret"):
            record_stage(
                path,
                {
                    "id": "unsafe",
                    "mode": "control_plane",
                    "status": "FAILED",
                    "startedAt": "2026-07-15T12:00:03Z",
                    "completedAt": "2026-07-15T12:00:04Z",
                    "evidence": {"excerpt": "sk-" + "x" * 40},
                },
            )


def test_smoke_report_rejects_nested_private_content_and_invalid_chronology() -> None:
    with tempfile.TemporaryDirectory() as destination:
        invalid_identity = pathlib.Path(destination) / "invalid-identity.json"
        with pytest.raises(ValueError, match="deployment ID"):
            initialize_report(
                invalid_identity,
                base_url="https://counterlab.example.test",
                started_at="2026-07-15T12:00:00Z",
                **_deployment_identity(deployment_id="worker-version-1"),
            )

        path = pathlib.Path(destination) / "production-smoke.json"
        initialize_report(
            path,
            base_url="https://counterlab.example.test",
            started_at="2026-07-15T12:00:00Z",
        )
        with pytest.raises(ValueError, match="forbidden secret field"):
            record_stage(
                path,
                {
                    "id": "nested-secret",
                    "mode": "control_plane",
                    "status": "FAILED",
                    "startedAt": "2026-07-15T12:00:01Z",
                    "completedAt": "2026-07-15T12:00:02Z",
                    "evidence": {"nested": {"authorization": "redacted"}},
                },
            )
        with pytest.raises(ValueError, match="forbidden secret field"):
            record_stage(
                path,
                {
                    "id": "punctuated-secret",
                    "mode": "control_plane",
                    "status": "FAILED",
                    "startedAt": "2026-07-15T12:00:01Z",
                    "completedAt": "2026-07-15T12:00:02Z",
                    "evidence": {"nested": {"API Key": "redacted"}},
                },
            )
        with pytest.raises(ValueError, match="raw notebook content"):
            record_stage(
                path,
                {
                    "id": "raw-notebook",
                    "mode": "control_plane",
                    "status": "FAILED",
                    "startedAt": "2026-07-15T12:00:01Z",
                    "completedAt": "2026-07-15T12:00:02Z",
                    "evidence": {
                        "nested": {"cells": [], "metadata": {}, "nbformat": 4}
                    },
                },
            )
        with pytest.raises(ValueError, match="raw notebook content"):
            record_stage(
                path,
                {
                    "id": "encoded-notebook",
                    "mode": "control_plane",
                    "status": "FAILED",
                    "startedAt": "2026-07-15T12:00:01Z",
                    "completedAt": "2026-07-15T12:00:02Z",
                    "evidence": {
                        "nested": json.dumps(
                            {"cells": [], "metadata": {}, "nbformat": "4"}
                        )
                    },
                },
            )
        with pytest.raises(ValueError, match="chronology"):
            record_stage(
                path,
                {
                    "id": "reversed",
                    "mode": "control_plane",
                    "status": "FAILED",
                    "startedAt": "2026-07-15T12:00:03Z",
                    "completedAt": "2026-07-15T12:00:02Z",
                    "evidence": {},
                },
            )
        record_stage(
            path,
            {
                "id": "chronology-baseline",
                "mode": "control_plane",
                "status": "FAILED",
                "startedAt": "2026-07-15T12:00:01Z",
                "completedAt": "2026-07-15T12:00:05Z",
                "evidence": {},
            },
        )
        with pytest.raises(ValueError, match="completions"):
            record_stage(
                path,
                {
                    "id": "completion-regression",
                    "mode": "control_plane",
                    "status": "FAILED",
                    "startedAt": "2026-07-15T12:00:02Z",
                    "completedAt": "2026-07-15T12:00:04Z",
                    "evidence": {},
                },
            )


def test_passing_report_requires_deployment_identity_and_exact_stage_matrix() -> None:
    with tempfile.TemporaryDirectory() as destination:
        path = pathlib.Path(destination) / "production-smoke.json"
        initialize_report(
            path,
            base_url="https://counterlab.example.test",
            started_at="2026-07-15T12:00:00Z",
        )
        for stage_id, mode, concept in _REQUIRED_PASSING_STAGES:
            record_stage(path, _passing_stage(stage_id, mode, concept))
        with pytest.raises(ValueError, match="deployment identity"):
            finish_report(
                path,
                status="PASSED",
                completed_at="2026-07-15T12:00:06Z",
            )

        path.unlink()
        initialize_report(
            path,
            base_url="https://counterlab.example.test",
            started_at="2026-07-15T12:00:00Z",
            **_deployment_identity(),
        )
        for stage_id, mode, concept in _REQUIRED_PASSING_STAGES[:-1]:
            record_stage(path, _passing_stage(stage_id, mode, concept))
        with pytest.raises(ValueError, match="required stage matrix"):
            finish_report(
                path,
                status="PASSED",
                completed_at="2026-07-15T12:00:06Z",
            )


def test_live_leakage_evidence_requires_every_operational_authority_check() -> None:
    authority = {
        "duplicateCompileReused": True,
        "reconnectedFromCursor": True,
        "cancellationAcknowledged": True,
        "cancelledWithoutResult": True,
        "duplicateCancelReused": True,
    }
    with tempfile.TemporaryDirectory() as destination:
        path = pathlib.Path(destination) / "live-evidence.json"
        path.write_text(
            json.dumps(
                _valid_live_evidence("entity_leakage", **authority)
            ),
            encoding="utf-8",
        )
        accepted = subprocess.run(
            [
                sys.executable,
                "-c",
                _live_evidence_source(),
                str(path),
                "entity_leakage",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert accepted.returncode == 0, accepted.stderr
        accepted_payload = json.loads(accepted.stdout)
        assert accepted_payload["reconnectedFromCursor"] is True
        assert accepted_payload["scientificEngineSnapshotHash"] == "c" * 64

        path.write_text(
            json.dumps(
                _valid_live_evidence(
                    "entity_leakage",
                    **{**authority, "cancelledWithoutResult": False},
                )
            ),
            encoding="utf-8",
        )
        rejected = subprocess.run(
            [
                sys.executable,
                "-c",
                _live_evidence_source(),
                str(path),
                "entity_leakage",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert rejected.returncode != 0
        assert "authority checks are incomplete" in rejected.stderr


def test_live_evidence_requires_scientific_engine_authority() -> None:
    with tempfile.TemporaryDirectory() as destination:
        path = pathlib.Path(destination) / "live-evidence.json"
        path.write_text(
            json.dumps(
                _valid_live_evidence(
                    "class_imbalance",
                    scientificEngineSnapshotHash=None,
                )
            ),
            encoding="utf-8",
        )
        rejected = subprocess.run(
            [
                sys.executable,
                "-c",
                _live_evidence_source(),
                str(path),
                "class_imbalance",
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        assert rejected.returncode != 0
        assert "scientific engine authority is missing" in rejected.stderr


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("publishedReplayId", None, "published replay authority is missing"),
        ("replayPersistedAfterRefresh", False, "replay persistence check failed"),
        (
            "publicReplayAuthorityMatches",
            False,
            "public replay authority binding failed",
        ),
        (
            "publicReplayPrivateArtifactsUnavailable",
            False,
            "public replay exposed a private artifact route",
        ),
        (
            "duplicateReplayPublicationReused",
            False,
            "duplicate replay publication was not reused",
        ),
        (
            "proofCapsuleIntegrityMode",
            "integrity-hashed",
            "production Proof Capsule must be HMAC-signed",
        ),
        ("proofCapsuleSha256", "not-a-hash", "evidence hashes are invalid"),
    ],
)
def test_live_evidence_requires_native_capsule_and_persisted_replay(
    field: str,
    value: object,
    message: str,
) -> None:
    with tempfile.TemporaryDirectory() as destination:
        path = pathlib.Path(destination) / "live-evidence.json"
        path.write_text(
            json.dumps(_valid_live_evidence("class_imbalance", **{field: value})),
            encoding="utf-8",
        )
        rejected = subprocess.run(
            [
                sys.executable,
                "-c",
                _live_evidence_source(),
                str(path),
                "class_imbalance",
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        assert rejected.returncode != 0
        assert message in rejected.stderr


def test_production_smoke_wires_readiness_modes_and_json_release_evidence() -> None:
    script = pathlib.Path(__file__).with_name("production-smoke.sh").read_text(
        encoding="utf-8"
    )

    assert '"${BASE_URL}/ready"' in script
    assert "COUNTERLAB_SMOKE_REPORT_PATH" in script
    assert "production_smoke_report.py" in script
    assert "Production stage" in script
    assert 'local evidence_json="${7:-}"' in script
    assert 'evidence_json="{}"' in script
    for authority_check in (
        "duplicateCompileReused",
        "reconnectedFromCursor",
        "cancellationAcknowledged",
        "cancelledWithoutResult",
        "duplicateCancelReused",
    ):
        assert authority_check in script
    for stage_id in (
        "public-readiness",
        "capability-health",
        "public-secret-scan",
        "judge-mode",
        "sample-lesson",
        "verified-replay",
        "hosted-capsule-replay",
        "live-leakage",
        "live-imbalance",
    ):
        assert stage_id in script
