"""
Compression Module

LZ-string compression/decompression for rule logic.
"""

import json
from typing import Any

import lzstring


# Create LZ-string compressor instance
_lz = lzstring.LZString()


def compress(logic: Any) -> str:
    """
    Compress rule logic to Foundry's expected format.

    Args:
        logic: The rule logic object (dict)

    Returns:
        JSON string containing { compressedValue, type: 'compressedValue' }
    """
    json_str = json.dumps(logic)
    compressed = _lz.compressToEncodedURIComponent(json_str)
    wrapper = {"compressedValue": compressed, "type": "compressedValue"}
    return json.dumps(wrapper)


def decompress(compressed_wrapper: str) -> Any:
    """
    Decompress rule logic from Foundry's format.

    Args:
        compressed_wrapper: JSON string containing compressedValue

    Returns:
        Parsed rule logic object (dict)

    Raises:
        ValueError: If decompression fails
    """
    wrapper = json.loads(compressed_wrapper)
    compressed_value = wrapper.get("compressedValue")

    if not compressed_value:
        raise ValueError("Missing compressedValue in wrapper")

    json_str = _lz.decompressFromEncodedURIComponent(compressed_value)

    if not json_str:
        raise ValueError("Failed to decompress - invalid compressed value")

    return json.loads(json_str)


def get_compressed_value(compressed_wrapper: str) -> str:
    """Get just the compressed value string (without wrapper)."""
    wrapper = json.loads(compressed_wrapper)
    return wrapper["compressedValue"]


def wrap_compressed_value(compressed_value: str) -> str:
    """Create compressed wrapper from raw compressed value."""
    wrapper = {"compressedValue": compressed_value, "type": "compressedValue"}
    return json.dumps(wrapper)


def get_compression_stats(logic: Any) -> dict[str, Any]:
    """
    Get compression statistics.

    Args:
        logic: The rule logic object

    Returns:
        Dict with originalSize, compressedSize, ratio
    """
    original = json.dumps(logic)
    compressed = _lz.compressToEncodedURIComponent(original)

    original_size = len(original)
    compressed_size = len(compressed)

    return {
        "original_size": original_size,
        "compressed_size": compressed_size,
        "ratio": compressed_size / original_size if original_size > 0 else 0,
    }
