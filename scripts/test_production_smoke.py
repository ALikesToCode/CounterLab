from __future__ import annotations

import http.server
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
    marker = 'python3 - "${BASE_URL}" "${TMP_DIR}" <<\'PY\'\n'
    start = script.index(marker) + len(marker)
    return script[start : script.index("\nPY\n", start)]


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

        stage = {
            "id": "live-leakage",
            "mode": "live_notebook",
            "concept": "entity_leakage",
            "status": "PASSED",
            "startedAt": "2026-07-15T12:00:01Z",
            "completedAt": "2026-07-15T12:00:05Z",
            "evidence": {"resultHash": "b" * 64},
        }
        record_stage(path, stage)
        record_stage(path, stage)
        report = finish_report(
            path,
            status="PASSED",
            completed_at="2026-07-15T12:00:06Z",
        )

        assert report["status"] == "PASSED"
        assert len(report["stages"]) == 1
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
    for stage_id in (
        "public-readiness",
        "capability-health",
        "public-secret-scan",
        "sample-lesson",
        "verified-replay",
        "live-leakage",
        "live-imbalance",
    ):
        assert stage_id in script
