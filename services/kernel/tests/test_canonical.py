from __future__ import annotations

from counterlab_kernel.canonical import canonical_json, sha256_json


def test_canonical_json_orders_keys_and_normalizes_negative_zero() -> None:
    assert canonical_json({"z": -0.0, "a": [2, 1]}) == '{"a":[2,1],"z":0.0}'


def test_sha256_json_is_independent_of_mapping_insertion_order() -> None:
    assert sha256_json({"a": 1, "b": 2}) == sha256_json({"b": 2, "a": 1})

