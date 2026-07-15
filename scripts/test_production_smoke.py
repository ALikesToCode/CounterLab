from __future__ import annotations

import http.server
import pathlib
import subprocess
import sys
import tempfile
import threading


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
