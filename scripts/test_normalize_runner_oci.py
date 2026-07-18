from __future__ import annotations

import gzip
import io
import tarfile

from normalize_runner_oci import rewrite_layer_bytes


def _fixture_layer() -> bytes:
    output = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.PAX_FORMAT) as archive:
            for name, kind, body in (
                ("usr/", tarfile.DIRTYPE, b""),
                ("usr/local/", tarfile.DIRTYPE, b""),
                ("usr/local/bin/", tarfile.DIRTYPE, b""),
                ("usr/local/bin/node", tarfile.REGTYPE, b"node"),
                ("app/", tarfile.DIRTYPE, b""),
                ("app/runner.mjs", tarfile.REGTYPE, b"runner"),
                ("unrelated", tarfile.REGTYPE, b"evidence"),
            ):
                member = tarfile.TarInfo(name)
                member.type = kind
                member.mode = 0o700
                member.uid = 0
                member.gid = 0
                member.size = len(body)
                archive.addfile(member, io.BytesIO(body) if body else None)
    return output.getvalue()


def _members(value: bytes) -> dict[str, tarfile.TarInfo]:
    with tarfile.open(fileobj=io.BytesIO(value), mode="r:gz") as archive:
        return {member.name.rstrip("/"): member for member in archive.getmembers()}


def test_rewrites_only_reviewed_runtime_metadata() -> None:
    normalized, report = rewrite_layer_bytes(_fixture_layer())
    members = _members(normalized)

    assert report.changed_entries == 6
    assert members["usr"].mode == 0o755
    assert members["usr/local/bin/node"].mode == 0o555
    assert members["usr/local/bin/node"].uid == 0
    assert members["app"].mode == 0o500
    assert members["app"].uid == 10001
    assert members["app/runner.mjs"].mode == 0o500
    assert members["app/runner.mjs"].uid == 10001
    assert members["unrelated"].mode == 0o700
    assert members["unrelated"].uid == 0


def test_rewrite_is_deterministic() -> None:
    first, first_report = rewrite_layer_bytes(_fixture_layer())
    second, second_report = rewrite_layer_bytes(_fixture_layer())

    assert first == second
    assert first_report == second_report
