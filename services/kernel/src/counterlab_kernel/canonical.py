"""Canonical JSON serialization used by CounterLab integrity hashes."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from hashlib import sha256
import json
import math
from decimal import Decimal
from typing import Any


def _normalize(value: Any) -> Any:
    """Return a JSON-compatible value with one unambiguous representation."""

    if isinstance(value, Mapping):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("canonical JSON object keys must be strings")
        return {key: _normalize(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(
        value, (str, bytes, bytearray)
    ):
        return [_normalize(item) for item in value]
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("canonical JSON does not support non-finite floats")
        # JSON distinguishes -0.0 textually even though the values compare equal.
        return 0.0 if value == 0.0 else value
    if value is None or isinstance(value, (str, int, bool)):
        return value
    raise TypeError(f"unsupported canonical JSON value: {type(value).__name__}")


def canonical_json(value: Any) -> str:
    """Serialize *value* as stable, compact UTF-8 JSON."""

    return json.dumps(
        _normalize(value),
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def sha256_json(value: Any) -> str:
    """Hash the canonical UTF-8 JSON representation of *value*."""

    return sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _browser_number(value: int | float) -> str:
    """Serialize a CounterLab number like JSON.stringify/ECMAScript.

    Hosted v2 payloads cross the Python/Worker boundary, where ``0.0`` is parsed
    as the JavaScript number ``0``. The legacy serializer remains unchanged for
    recorded v1 evidence and replay hashes.
    """

    if isinstance(value, int):
        if abs(value) > 9_007_199_254_740_991:
            raise ValueError("browser canonical JSON requires safe integers")
        return str(value)
    if not math.isfinite(value):
        raise ValueError("browser canonical JSON does not support non-finite floats")
    if value == 0.0:
        return "0"
    absolute = abs(value)
    text = repr(value).lower()
    if 1e-6 <= absolute < 1e21:
        if "e" in text:
            text = format(Decimal(text), "f")
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        return text
    if "e" not in text:
        text = format(value, ".15e")
    mantissa, exponent_text = text.split("e", 1)
    mantissa = mantissa.rstrip("0").rstrip(".")
    exponent = int(exponent_text)
    sign = "+" if exponent >= 0 else ""
    return f"{mantissa}e{sign}{exponent}"


def _assert_valid_unicode(value: str) -> None:
    if any(0xD800 <= ord(character) <= 0xDFFF for character in value):
        raise ValueError(
            "browser canonical JSON does not support unpaired Unicode surrogates"
        )


def _browser_string(value: str) -> str:
    _assert_valid_unicode(value)
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def _utf16_sort_key(value: str) -> bytes:
    _assert_valid_unicode(value)
    return value.encode("utf-16-be")


def canonical_json_browser(value: Any) -> str:
    """Canonical JSON for v2 payloads hashed in both Python and a Worker."""

    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return _browser_number(value)
    if isinstance(value, str):
        return _browser_string(value)
    if isinstance(value, Mapping):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("canonical JSON object keys must be strings")
        return "{" + ",".join(
            f"{_browser_string(key)}:{canonical_json_browser(value[key])}"
            for key in sorted(value, key=_utf16_sort_key)
        ) + "}"
    if isinstance(value, Sequence) and not isinstance(
        value, (str, bytes, bytearray)
    ):
        return "[" + ",".join(canonical_json_browser(item) for item in value) + "]"
    raise TypeError(f"unsupported canonical JSON value: {type(value).__name__}")


def sha256_json_browser(value: Any) -> str:
    """Hash a v2 payload with the browser-compatible canonical encoding."""

    return sha256(canonical_json_browser(value).encode("utf-8")).hexdigest()
