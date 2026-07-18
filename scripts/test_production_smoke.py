from __future__ import annotations

import http.server
import json
import pathlib
import subprocess
import sys
import tempfile
import threading

import pytest

from scripts.production_smoke_report import (
    finish_report,
    initialize_report,
    load_report,
    record_stage,
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


class _AssetHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/":
            body = b'<script src="/assets/app.js"></script>'
            self.send_response(200)
            self.send_header("content-type", "text/html")
        elif self.path == "/assets/app.js":
            if self.headers.get("user-agent") != "CounterLab release smoke":
                self.send_error(403)
                return
            body = b"console.log('safe asset')"
            self.send_response(200)
            self.send_header("content-type", "text/javascript")
        else:
            self.send_error(404)
            return
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *args: object) -> None:
        return


def _scanner_source() -> str:
    script = pathlib.Path(__file__).with_name("production-smoke.sh").read_text(
        encoding="utf-8"
    )
    marker = 'python3 - "${BASE_URL}" "${WORK_DIR}" <<\'PY\'\n'
    start = script.index(marker) + len(marker)
    return script[start : script.index("\nPY\n", start)]


def _live_evidence_source() -> str:
    script = pathlib.Path(__file__).with_name("production-smoke.sh").read_text(
        encoding="utf-8"
    )
    marker = 'python3 - "$1" "$2" <<\'PY\'\n'
    start = script.index(marker) + len(marker)
    return script[start : script.index("\nPY\n", start)]


def test_smoke_workspaces_are_repo_contained_and_never_recursively_deleted() -> None:
    script = pathlib.Path(__file__).with_name("production-smoke.sh").read_text(
        encoding="utf-8"
    )

    assert "node_modules/.cache/counterlab-v6.1/production-smoke-work" in script
    assert "mktemp" not in script
    assert "rm -rf" not in script


def _valid_live_evidence(
    concept: str,
    **overrides: object,
) -> dict[str, object]:
    evidence: dict[str, object] = {
        "schemaVersion": "2",
        "concept": concept,
        "sessionId": "session_live_123",
        "publishedReplayId": "replay_live_123",
        "proofCapsuleMediaType": "application/vnd.counterlab.capsule+json",
        "proofCapsuleIntegrityMode": "integrity-hashed",
        "proofCapsuleByteLength": 12_345,
        "replayPlaybackMode": "verified_capsule_replay",
        "replaySourceMode": "live_notebook",
        "replayPersistedAfterRefresh": True,
        "replayDownloadsMatch": True,
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
        "replayProofCapsuleSha256": "e",
        "replayPatchedNotebookSha256": "f",
    }.items():
        evidence[key] = fill * 64
    evidence.update(overrides)
    return evidence


def test_public_asset_scanner_uses_release_user_agent_for_every_request() -> None:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _AssetHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory() as destination:
            completed = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    _scanner_source(),
                    f"http://127.0.0.1:{server.server_port}",
                    destination,
                ],
                check=False,
                capture_output=True,
                text=True,
            )
    finally:
        server.shutdown()
        thread.join()

    assert completed.returncode == 0, completed.stderr
    assert "Public asset secret scan: PASS" in completed.stdout


def test_smoke_report_is_atomic_idempotent_and_secret_free() -> None:
    with tempfile.TemporaryDirectory() as destination:
        path = pathlib.Path(destination) / "production-smoke.json"
        initialized = initialize_report(
            path,
            base_url="https://counterlab.example.test/",
            started_at="2026-07-15T12:00:00Z",
            deployment_id="worker-version-1",
            container_image_digest="sha256:" + "a" * 64,
        )
        assert initialized["status"] == "RUNNING"
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
            deployment_id="worker-version-1",
            container_image_digest="sha256:" + "a" * 64,
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
        ("replayDownloadsMatch", False, "replay download authority check failed"),
        (
            "duplicateReplayPublicationReused",
            False,
            "duplicate replay publication was not reused",
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
