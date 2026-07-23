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
                ("usr/bin/", tarfile.DIRTYPE, b""),
                ("usr/bin/setpriv", tarfile.REGTYPE, b"setpriv"),
                ("usr/bin/bash", tarfile.REGTYPE, b"bash"),
                ("usr/lib/", tarfile.DIRTYPE, b""),
                ("usr/lib64/", tarfile.DIRTYPE, b""),
                ("usr/lib/x86_64-linux-gnu/", tarfile.DIRTYPE, b""),
                ("usr/lib/x86_64-linux-gnu/libexample.so", tarfile.REGTYPE, b"lib"),
                (
                    "usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2",
                    tarfile.REGTYPE,
                    b"loader",
                ),
                ("dev/", tarfile.DIRTYPE, b""),
                ("dev/pts/", tarfile.DIRTYPE, b""),
                ("dev/shm/", tarfile.DIRTYPE, b""),
                ("dev/mqueue/", tarfile.DIRTYPE, b""),
                ("sys/", tarfile.DIRTYPE, b""),
                ("sys/fs/", tarfile.DIRTYPE, b""),
                ("sys/fs/cgroup/", tarfile.DIRTYPE, b""),
                ("counterlab-runtime/", tarfile.DIRTYPE, b""),
                ("etc/", tarfile.DIRTYPE, b""),
                ("etc/hosts", tarfile.REGTYPE, b""),
                ("etc/passwd", tarfile.REGTYPE, b"user"),
                ("etc/group", tarfile.REGTYPE, b"group"),
                ("etc/shadow", tarfile.REGTYPE, b"secret"),
                ("etc/ssl/", tarfile.DIRTYPE, b""),
                ("etc/ssl/cert.pem", tarfile.REGTYPE, b"cert"),
                ("usr/share/", tarfile.DIRTYPE, b""),
                ("usr/share/data.txt", tarfile.REGTYPE, b"data"),
                ("repo/", tarfile.DIRTYPE, b""),
                ("repo/scripts/", tarfile.DIRTYPE, b""),
                ("repo/scripts/verify.py", tarfile.REGTYPE, b"verify"),
                ("repo/fixtures/", tarfile.DIRTYPE, b""),
                ("repo/fixtures/public/", tarfile.DIRTYPE, b""),
                ("repo/fixtures/public/sample.csv", tarfile.REGTYPE, b"sample"),
                ("app/", tarfile.DIRTYPE, b""),
                ("app/runner.mjs", tarfile.REGTYPE, b"runner"),
                ("app/config.json", tarfile.REGTYPE, b"{}"),
                ("opt/", tarfile.DIRTYPE, b""),
                ("opt/counterlab/", tarfile.DIRTYPE, b""),
                (
                    "opt/counterlab/landlock_launcher.py",
                    tarfile.REGTYPE,
                    b"launcher",
                ),
                ("work/", tarfile.DIRTYPE, b""),
                ("work/jobs/", tarfile.DIRTYPE, b""),
                ("run/", tarfile.DIRTYPE, b""),
                ("run/counterlab-codex/", tarfile.DIRTYPE, b""),
                ("unrelated", tarfile.REGTYPE, b"evidence"),
            ):
                member = tarfile.TarInfo(name)
                member.type = kind
                member.mode = 0o700
                member.uid = 10001 if name.startswith("app/") else 0
                member.gid = 10001 if name.startswith("app/") else 0
                member.size = len(body)
                archive.addfile(member, io.BytesIO(body) if body else None)
    return output.getvalue()


def _members(value: bytes) -> dict[str, tarfile.TarInfo]:
    with tarfile.open(fileobj=io.BytesIO(value), mode="r:gz") as archive:
        return {member.name.rstrip("/"): member for member in archive.getmembers()}


def test_rewrites_only_reviewed_runtime_metadata() -> None:
    normalized, report = rewrite_layer_bytes(_fixture_layer())
    members = _members(normalized)

    assert report.changed_entries == 44
    assert members["usr"].mode == 0o755
    assert members["usr/local/bin/node"].mode == 0o555
    assert members["usr/local/bin/node"].uid == 0
    assert members["usr/lib"].mode == 0o755
    assert members["usr/lib64"].mode == 0o755
    assert members["usr/lib/x86_64-linux-gnu"].mode == 0o755
    assert (
        members["usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"].mode
        == 0o755
    )
    assert members["usr/bin"].mode == 0o755
    assert members["usr/bin/setpriv"].mode == 0o555
    assert members["usr/bin/bash"].mode == 0o555
    assert members["usr/lib/x86_64-linux-gnu/libexample.so"].mode == 0o444
    assert members["usr/share"].mode == 0o555
    assert members["usr/share/data.txt"].mode == 0o444
    assert members["opt/counterlab"].mode == 0o555
    assert members["opt/counterlab/landlock_launcher.py"].mode == 0o555
    assert members["repo"].mode == 0o555
    assert members["repo/scripts/verify.py"].mode == 0o444
    for mount_target in (
        "dev/pts",
        "dev/shm",
        "dev/mqueue",
        "sys/fs/cgroup",
        "counterlab-runtime",
    ):
        assert members[mount_target].mode == 0o755
        assert members[mount_target].uid == 0
        assert members[mount_target].gid == 0
    assert members["etc/hosts"].mode == 0o644
    assert members["etc/passwd"].mode == 0o444
    assert members["etc/group"].mode == 0o444
    assert members["etc/ssl"].mode == 0o555
    assert members["etc/ssl/cert.pem"].mode == 0o444
    assert members["etc/shadow"].mode == 0o700
    assert members["app"].mode == 0o555
    assert members["app"].uid == 0
    assert members["app/runner.mjs"].mode == 0o555
    assert members["app/runner.mjs"].uid == 0
    assert members["app/config.json"].mode == 0o444
    assert members["app/config.json"].uid == 0
    assert members["work/jobs"].mode == 0o700
    assert members["work/jobs"].uid == 10001
    assert members["work/jobs"].gid == 10001
    assert members["run/counterlab-codex"].mode == 0o700
    assert members["run/counterlab-codex"].uid == 10001
    assert members["run/counterlab-codex"].gid == 10001
    assert members["unrelated"].mode == 0o700
    assert members["unrelated"].uid == 0


def test_rewrite_is_deterministic() -> None:
    first, first_report = rewrite_layer_bytes(_fixture_layer())
    second, second_report = rewrite_layer_bytes(_fixture_layer())

    assert first == second
    assert first_report == second_report


def test_adapter_profile_repairs_only_bounded_nonroot_paths() -> None:
    output = io.BytesIO()
    with gzip.GzipFile(
        filename="", mode="wb", fileobj=output, mtime=0
    ) as compressed:
        with tarfile.open(
            fileobj=compressed, mode="w|", format=tarfile.PAX_FORMAT
        ) as archive:
            for name, kind, body in (
                ("opt/", tarfile.DIRTYPE, b""),
                ("opt/counterlab/", tarfile.DIRTYPE, b""),
                ("opt/counterlab/harness.py", tarfile.REGTYPE, b"harness"),
                (
                    "opt/counterlab/counterlab_sdk.py",
                    tarfile.REGTYPE,
                    b"sdk",
                ),
                ("workspace/", tarfile.DIRTYPE, b""),
                ("fixtures/", tarfile.DIRTYPE, b""),
                ("output/", tarfile.DIRTYPE, b""),
                ("tmp/", tarfile.DIRTYPE, b""),
                ("unrelated", tarfile.REGTYPE, b"unchanged"),
            ):
                member = tarfile.TarInfo(name)
                member.type = kind
                member.mode = 0o700
                member.uid = 0
                member.gid = 0
                member.size = len(body)
                archive.addfile(member, io.BytesIO(body) if body else None)

    normalized, report = rewrite_layer_bytes(output.getvalue(), profile="adapter")
    members = _members(normalized)

    assert report.changed_entries == 8
    assert members["opt"].mode == 0o555
    assert members["opt/counterlab"].mode == 0o555
    assert members["opt/counterlab/harness.py"].mode == 0o555
    assert members["opt/counterlab/counterlab_sdk.py"].mode == 0o444
    assert members["workspace"].mode == 0o555
    assert members["fixtures"].mode == 0o555
    assert members["output"].mode == 0o755
    assert members["tmp"].mode == 0o1777
    assert members["unrelated"].mode == 0o700
