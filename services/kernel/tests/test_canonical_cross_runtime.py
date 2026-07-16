from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

import pytest

from counterlab_kernel.canonical import canonical_json_browser, sha256_json_browser


VECTORS = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "fixtures"
        / "canonical"
        / "counterlab-canonical-json-v1.json"
    ).read_text(encoding="utf-8")
)


@pytest.mark.parametrize("vector", VECTORS["vectors"], ids=lambda item: item["id"])
def test_browser_canonical_json_matches_shared_vectors(vector: dict[str, object]) -> None:
    canonical = canonical_json_browser(vector["value"])
    assert canonical == vector["canonical"]
    assert sha256(canonical.encode("utf-8")).hexdigest() == vector["sha256"]
    assert sha256_json_browser(vector["value"]) == vector["sha256"]


@pytest.mark.parametrize("value", ["\ud800", "\udc00", {"\ud800": "key"}])
def test_browser_canonical_json_rejects_unpaired_surrogates(value: object) -> None:
    with pytest.raises((TypeError, ValueError)):
        canonical_json_browser(value)
