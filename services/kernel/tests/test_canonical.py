from __future__ import annotations

from counterlab_kernel.canonical import (
    canonical_json,
    canonical_json_browser,
    sha256_json,
)


def test_canonical_json_orders_keys_and_normalizes_negative_zero() -> None:
    assert canonical_json({"z": -0.0, "a": [2, 1]}) == '{"a":[2,1],"z":0.0}'


def test_sha256_json_is_independent_of_mapping_insertion_order() -> None:
    assert sha256_json({"a": 1, "b": 2}) == sha256_json({"b": 2, "a": 1})


def test_browser_canonical_json_matches_json_stringify_number_rules() -> None:
    assert canonical_json_browser(
        {
            "whole_float": 0.0,
            "negative_zero": -0.0,
            "small": 1e-7,
            "fixed": 1e-6,
            "large_fixed": 1e20,
            "large_exp": 1e21,
        }
    ) == (
        '{"fixed":0.000001,"large_exp":1e+21,'
        '"large_fixed":100000000000000000000,"negative_zero":0,'
        '"small":1e-7,"whole_float":0}'
    )
