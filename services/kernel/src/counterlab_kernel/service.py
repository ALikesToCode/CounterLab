"""Small local HTTP boundary for the fixed CounterLab reference kernel."""

from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Sequence

import pandas as pd

from .canonical import canonical_json
from .experiment import run_leakage_experiment


MAX_REQUEST_BYTES = 4_096


class KernelServer(ThreadingHTTPServer):
    root: Path


class KernelHandler(BaseHTTPRequestHandler):
    server: KernelServer

    def log_message(self, format: str, *args: object) -> None:
        return

    def _json(self, status: HTTPStatus, payload: object) -> None:
        body = canonical_json(payload).encode("utf-8")
        self.send_response(status.value)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self._json(
                HTTPStatus.NOT_FOUND,
                {"ok": False, "error": {"code": "ROUTE_NOT_FOUND"}},
            )
            return
        self._json(
            HTTPStatus.OK,
            {
                "ok": True,
                "data": {
                    "service": "counterlab-kernel",
                    "schemaVersion": "1",
                    "fixture": "customer-churn-public-v1",
                    "seed": 1729,
                },
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/leakage/run":
            self._json(
                HTTPStatus.NOT_FOUND,
                {"ok": False, "error": {"code": "ROUTE_NOT_FOUND"}},
            )
            return
        try:
            length = int(self.headers.get("content-length", "0"))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_REQUEST_BYTES:
            self._json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"ok": False, "error": {"code": "REQUEST_TOO_LARGE"}},
            )
            return
        try:
            value = json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(
                HTTPStatus.BAD_REQUEST,
                {"ok": False, "error": {"code": "INVALID_JSON"}},
            )
            return
        if value not in ({}, {"fixture": "public", "seed": 1729}):
            self._json(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                {"ok": False, "error": {"code": "FIXED_CONTRACT_ONLY"}},
            )
            return
        fixture = self.server.root / "fixtures/public/customer_churn.csv"
        result = run_leakage_experiment(pd.read_csv(fixture), seed=1729)
        self._json(HTTPStatus.OK, {"ok": True, "data": result})


def create_server(root: Path, host: str, port: int) -> KernelServer:
    server = KernelServer((host, port), KernelHandler)
    server.root = root.resolve(strict=True)
    return server


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="counterlab-kernel-service")
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    server = create_server(arguments.root, arguments.host, arguments.port)
    print(f"CounterLab kernel listening on http://{arguments.host}:{arguments.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
