#!/usr/bin/env python3
"""Normalize CounterLab runner OCI metadata for the declared non-root user.

Some restricted build filesystems preserve file bytes while collapsing locally
created ownership and modes to root:root 0700. This tool repairs only the
reviewed runner runtime paths in an OCI layout, updates every affected digest,
and leaves the input layout untouched.
"""

from __future__ import annotations

import argparse
import copy
import gzip
import hashlib
import io
import json
import shutil
import tarfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO, Mapping, Sequence


POLICY_VERSION = "counterlab-runner-nonroot-v3"
ADAPTER_POLICY_VERSION = "counterlab-adapter-nonroot-v1"
RUNNER_UID = 10001
RUNNER_GID = 10001


@dataclass(frozen=True)
class LayerRewrite:
    compressed_sha256: str
    diff_id: str
    size: int
    changed_entries: int
    changed_samples: tuple[str, ...]


class _DigestingWriter:
    def __init__(self, target: BinaryIO) -> None:
        self._target = target
        self._digest = hashlib.sha256()
        self._position = 0

    def write(self, value: bytes) -> int:
        self._digest.update(value)
        written = self._target.write(value)
        self._position += written
        return written

    def flush(self) -> None:
        self._target.flush()

    def tell(self) -> int:
        return self._position

    @property
    def hexdigest(self) -> str:
        return self._digest.hexdigest()


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_bytes(value: Mapping[str, Any]) -> bytes:
    return json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _clean_member_path(value: str) -> str:
    candidate = value[2:] if value.startswith("./") else value
    path = PurePosixPath(candidate)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"OCI layer member escapes its root: {value}")
    return path.as_posix().rstrip("/")


def _under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(f"{prefix}/")


def _mode_for(member: tarfile.TarInfo, *, directory: int, regular: int) -> int:
    if member.isdir():
        return directory
    if member.issym() or member.islnk():
        return 0o777
    return regular


def _normalized_identity(
    member: tarfile.TarInfo, *, profile: str = "runner"
) -> tuple[int, int, int, str, str] | None:
    path = _clean_member_path(member.name)

    if profile == "adapter":
        if path in {"opt", "opt/counterlab", "workspace", "fixtures"}:
            return (0, 0, 0o555, "root", "root")
        if path == "opt/counterlab/harness.py":
            return (0, 0, 0o555, "root", "root")
        if path == "opt/counterlab/counterlab_sdk.py":
            return (0, 0, 0o444, "root", "root")
        if path == "output":
            return (0, 0, 0o755, "root", "root")
        if path == "tmp":
            return (0, 0, 0o1777, "root", "root")
        return None
    if profile != "runner":
        raise ValueError(f"Unknown OCI normalization profile: {profile}")

    if _under(path, "app"):
        return (
            0,
            0,
            _mode_for(member, directory=0o555, regular=0o444)
            if path != "app/runner.mjs"
            else 0o555,
            "root",
            "root",
        )

    if _under(path, "work/jobs") or _under(path, "run/counterlab-codex"):
        return (
            RUNNER_UID,
            RUNNER_GID,
            _mode_for(member, directory=0o700, regular=0o600),
            "counterlab-codex",
            "counterlab-codex",
        )

    if _under(path, "opt/codex") or _under(path, "opt/counterlab-venv"):
        return (
            0,
            0,
            _mode_for(member, directory=0o555, regular=0o555),
            "root",
            "root",
        )

    if _under(path, "opt/counterlab"):
        return (
            0,
            0,
            _mode_for(member, directory=0o555, regular=0o555),
            "root",
            "root",
        )

    if _under(path, "opt/counterlab-wheelhouse"):
        return (
            0,
            0,
            _mode_for(member, directory=0o555, regular=0o444),
            "root",
            "root",
        )

    if path == "usr/local/bin/node":
        return (0, 0, 0o555, "root", "root")

    if path == "usr/local/bin/codex":
        return (0, 0, 0o777, "root", "root")

    if _under(path, "usr/bin"):
        return (
            0,
            0,
            _mode_for(member, directory=0o755, regular=0o555),
            "root",
            "root",
        )

    if path == "usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2":
        return (0, 0, 0o755, "root", "root")

    if _under(path, "usr/lib"):
        return (
            0,
            0,
            _mode_for(member, directory=0o755, regular=0o444),
            "root",
            "root",
        )

    if _under(path, "usr/share") or _under(path, "repo") or _under(path, "etc/ssl"):
        return (
            0,
            0,
            _mode_for(member, directory=0o555, regular=0o444),
            "root",
            "root",
        )

    if path in {
        "usr/lib64",
        "dev",
        "dev/pts",
        "dev/shm",
        "dev/mqueue",
        "sys",
        "sys/fs",
        "sys/fs/cgroup",
        "counterlab-runtime",
        "etc",
    }:
        return (
            0,
            0,
            _mode_for(member, directory=0o755, regular=0o755),
            "root",
            "root",
        )

    if path == "etc/hosts":
        return (0, 0, 0o644, "root", "root")

    if path in {
        "etc/passwd",
        "etc/group",
        "etc/nsswitch.conf",
        "etc/hostname",
        "etc/resolv.conf",
        "etc/ld.so.cache",
        "etc/ca-certificates.conf",
    }:
        return (0, 0, 0o444, "root", "root")

    if path in {
        "usr",
        "usr/local",
        "usr/local/bin",
        "opt",
        "work",
        "run",
    }:
        return (0, 0, 0o755, "root", "root")

    return None


def _apply_policy(member: tarfile.TarInfo, *, profile: str = "runner") -> bool:
    normalized = _normalized_identity(member, profile=profile)
    if normalized is None:
        return False
    uid, gid, mode, uname, gname = normalized
    changed = (
        member.uid != uid
        or member.gid != gid
        or member.mode != mode
    )
    member.uid = uid
    member.gid = gid
    member.mode = mode
    member.uname = uname
    member.gname = gname
    member.pax_headers = dict(member.pax_headers)
    for key in (
        "uid",
        "gid",
        "uname",
        "gname",
        "mode",
        "SCHILY.mode",
        "SCHILY.uid",
        "SCHILY.gid",
    ):
        member.pax_headers.pop(key, None)
    return changed


def _copy_normalized_tar(
    source: tarfile.TarFile, target: tarfile.TarFile, *, profile: str = "runner"
) -> tuple[int, tuple[str, ...]]:
    changed = 0
    samples: list[str] = []
    for original in source:
        member = copy.copy(original)
        member.pax_headers = dict(original.pax_headers)
        if _apply_policy(member, profile=profile):
            changed += 1
            if len(samples) < 24:
                samples.append(_clean_member_path(member.name))
        payload = source.extractfile(original) if original.isfile() else None
        target.addfile(member, payload)
    return changed, tuple(samples)


def rewrite_layer_bytes(
    value: bytes, *, profile: str = "runner"
) -> tuple[bytes, LayerRewrite]:
    source_buffer = io.BytesIO(value)
    compressed_output = io.BytesIO()
    with tarfile.open(fileobj=source_buffer, mode="r:gz") as source:
        with gzip.GzipFile(
            filename="",
            mode="wb",
            fileobj=compressed_output,
            compresslevel=9,
            mtime=0,
        ) as compressor:
            digesting = _DigestingWriter(compressor)
            with tarfile.open(
                fileobj=digesting, mode="w|", format=tarfile.PAX_FORMAT
            ) as target:
                changed, samples = _copy_normalized_tar(
                    source, target, profile=profile
                )
            diff_id = f"sha256:{digesting.hexdigest}"
    output = compressed_output.getvalue()
    return output, LayerRewrite(
        compressed_sha256=_sha256_bytes(output),
        diff_id=diff_id,
        size=len(output),
        changed_entries=changed,
        changed_samples=samples,
    )


def _layer_needs_rewrite(path: Path, *, profile: str) -> bool:
    with tarfile.open(path, mode="r:gz") as source:
        for original in source:
            member = copy.copy(original)
            member.pax_headers = dict(original.pax_headers)
            if _apply_policy(member, profile=profile):
                return True
    return False


def _rewrite_layer_file(
    source_path: Path, temporary_path: Path, *, profile: str
) -> LayerRewrite:
    with source_path.open("rb") as raw_source, tarfile.open(
        fileobj=raw_source, mode="r:gz"
    ) as source, temporary_path.open("xb") as raw_target:
        with gzip.GzipFile(
            filename="",
            mode="wb",
            fileobj=raw_target,
            compresslevel=9,
            mtime=0,
        ) as compressor:
            digesting = _DigestingWriter(compressor)
            with tarfile.open(
                fileobj=digesting, mode="w|", format=tarfile.PAX_FORMAT
            ) as target:
                changed, samples = _copy_normalized_tar(
                    source, target, profile=profile
                )
            diff_id = f"sha256:{digesting.hexdigest}"
    return LayerRewrite(
        compressed_sha256=_sha256_file(temporary_path),
        diff_id=diff_id,
        size=temporary_path.stat().st_size,
        changed_entries=changed,
        changed_samples=samples,
    )


def _digest_value(descriptor: Mapping[str, Any]) -> str:
    digest = descriptor.get("digest")
    if not isinstance(digest, str) or not digest.startswith("sha256:"):
        raise ValueError("OCI descriptor is missing a sha256 digest")
    value = digest.removeprefix("sha256:")
    if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
        raise ValueError("OCI descriptor has an invalid sha256 digest")
    return value


def _source_blob(layout: Path, descriptor: Mapping[str, Any]) -> Path:
    digest = _digest_value(descriptor)
    path = layout / "blobs" / "sha256" / digest
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"OCI blob is missing or unsafe: {digest}")
    if _sha256_file(path) != digest:
        raise ValueError(f"OCI blob digest mismatch: {digest}")
    return path


def _write_blob(directory: Path, value: bytes) -> tuple[str, int]:
    digest = _sha256_bytes(value)
    path = directory / digest
    if path.exists():
        if not path.is_file() or _sha256_file(path) != digest:
            raise ValueError(f"Refusing to replace conflicting OCI blob: {digest}")
    else:
        path.write_bytes(value)
    return digest, len(value)


def normalize_layout(
    *,
    repo_root: Path,
    source_layout: Path,
    output_layout: Path,
    report_path: Path,
    profile: str = "runner",
) -> dict[str, Any]:
    root = repo_root.resolve(strict=True)
    source = source_layout.resolve(strict=True)
    output_parent = output_layout.parent.resolve(strict=True)
    report_parent = report_path.parent.resolve(strict=True)
    for label, candidate in (
        ("source", source),
        ("output parent", output_parent),
        ("report parent", report_parent),
    ):
        if candidate != root and root not in candidate.parents:
            raise ValueError(f"{label} escaped the repository root")
    if output_layout.exists() or report_path.exists():
        raise ValueError("Output layout and report must be new paths")
    if source.is_symlink():
        raise ValueError("Source OCI layout must not be a symlink")

    index = json.loads((source / "index.json").read_text(encoding="utf-8"))
    manifests = index.get("manifests")
    if not isinstance(manifests, list) or len(manifests) != 1:
        raise ValueError("Runner OCI layout must contain exactly one manifest")
    manifest_descriptor = manifests[0]
    manifest_path = _source_blob(source, manifest_descriptor)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    config_descriptor = manifest.get("config")
    layers = manifest.get("layers")
    if not isinstance(config_descriptor, dict) or not isinstance(layers, list):
        raise ValueError("Runner OCI manifest is incomplete")
    config_path = _source_blob(source, config_descriptor)
    config = json.loads(config_path.read_text(encoding="utf-8"))
    diff_ids = config.get("rootfs", {}).get("diff_ids")
    if not isinstance(diff_ids, list) or len(diff_ids) != len(layers):
        raise ValueError("Runner OCI rootfs diff_ids do not match its layers")
    expected_user = "10001:10001" if profile == "runner" else "65532:65532"
    if profile not in {"runner", "adapter"}:
        raise ValueError(f"Unknown OCI normalization profile: {profile}")
    if config.get("config", {}).get("User") != expected_user:
        raise ValueError(
            f"{profile.title()} OCI config must declare user {expected_user}"
        )

    output_layout.mkdir()
    blob_directory = output_layout / "blobs" / "sha256"
    blob_directory.mkdir(parents=True)
    shutil.copyfile(source / "oci-layout", output_layout / "oci-layout")

    updated_layers: list[dict[str, Any]] = []
    updated_diff_ids: list[str] = []
    layer_reports: list[dict[str, Any]] = []
    for index_value, (layer, existing_diff_id) in enumerate(zip(layers, diff_ids)):
        if not isinstance(layer, dict):
            raise ValueError("Runner OCI layer descriptor is invalid")
        if layer.get("mediaType") != "application/vnd.oci.image.layer.v1.tar+gzip":
            raise ValueError("Runner OCI normalization requires gzip OCI layers")
        layer_path = _source_blob(source, layer)
        if not _layer_needs_rewrite(layer_path, profile=profile):
            digest = _digest_value(layer)
            shutil.copyfile(layer_path, blob_directory / digest)
            updated_layers.append(dict(layer))
            updated_diff_ids.append(existing_diff_id)
            layer_reports.append(
                {"index": index_value, "changedEntries": 0, "digest": layer["digest"]}
            )
            continue

        temporary = blob_directory / f"normalized-layer-{index_value}.tar.gz"
        rewrite = _rewrite_layer_file(layer_path, temporary, profile=profile)
        final_path = blob_directory / rewrite.compressed_sha256
        if final_path.exists():
            raise ValueError("Normalized layer digest unexpectedly already exists")
        temporary.rename(final_path)
        updated_layer = dict(layer)
        updated_layer["digest"] = f"sha256:{rewrite.compressed_sha256}"
        updated_layer["size"] = rewrite.size
        updated_layers.append(updated_layer)
        updated_diff_ids.append(rewrite.diff_id)
        layer_reports.append(
            {
                "index": index_value,
                "changedEntries": rewrite.changed_entries,
                "changedSamples": list(rewrite.changed_samples),
                "digest": updated_layer["digest"],
                "diffId": rewrite.diff_id,
            }
        )

    config["rootfs"]["diff_ids"] = updated_diff_ids
    config_bytes = _json_bytes(config)
    config_digest, config_size = _write_blob(blob_directory, config_bytes)
    updated_manifest = dict(manifest)
    updated_manifest["config"] = {
        **config_descriptor,
        "digest": f"sha256:{config_digest}",
        "size": config_size,
    }
    updated_manifest["layers"] = updated_layers
    manifest_bytes = _json_bytes(updated_manifest)
    manifest_digest, manifest_size = _write_blob(blob_directory, manifest_bytes)
    updated_index = dict(index)
    updated_index["manifests"] = [
        {
            **manifest_descriptor,
            "digest": f"sha256:{manifest_digest}",
            "size": manifest_size,
        }
    ]
    (output_layout / "index.json").write_bytes(_json_bytes(updated_index))

    report = {
        "schemaVersion": "1",
        "policyVersion": (
            POLICY_VERSION if profile == "runner" else ADAPTER_POLICY_VERSION
        ),
        "status": "NORMALIZED",
        "sourceManifestDigest": manifest_descriptor["digest"],
        "normalizedManifestDigest": f"sha256:{manifest_digest}",
        "sourceConfigDigest": config_descriptor["digest"],
        "normalizedConfigDigest": f"sha256:{config_digest}",
        "layers": layer_reports,
    }
    report_path.write_text(
        f"{json.dumps(report, indent=2, sort_keys=True)}\n", encoding="utf-8"
    )
    return report


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--source-layout", type=Path, required=True)
    parser.add_argument("--output-layout", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument(
        "--profile", choices=("runner", "adapter"), default="runner"
    )
    args = parser.parse_args(argv)
    report = normalize_layout(
        repo_root=args.repo_root,
        source_layout=args.source_layout,
        output_layout=args.output_layout,
        report_path=args.report,
        profile=args.profile,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
