from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

from counterlab_kernel.service import create_server


def _request(url: str, body: object | None = None) -> tuple[int, dict[str, object]]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"content-type": "application/json"},
        method="GET" if body is None else "POST",
    )
    try:
        response = urllib.request.urlopen(request, timeout=10)
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())
    return response.status, json.loads(response.read())


def test_kernel_service_exposes_health_and_only_the_fixed_public_run() -> None:
    root = Path(__file__).resolve().parents[3]
    server = create_server(root, "127.0.0.1", 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        health_status, health = _request(f"{base}/health")
        assert health_status == 200
        assert health["data"]["seed"] == 1729  # type: ignore[index]

        run_status, run = _request(
            f"{base}/v1/leakage/run", {"fixture": "public", "seed": 1729}
        )
        assert run_status == 200
        assert run["data"]["resultHash"] == (  # type: ignore[index]
            "2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0"
        )

        refused_status, refused = _request(
            f"{base}/v1/leakage/run", {"fixture": "/private/path", "seed": 1}
        )
        assert refused_status == 422
        assert refused["error"]["code"] == "FIXED_CONTRACT_ONLY"  # type: ignore[index]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
