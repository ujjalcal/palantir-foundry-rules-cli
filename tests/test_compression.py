"""Tests for compression module."""

import json
import pytest
from foundry_rules.compression import compress, decompress


class TestCompress:
    """Tests for compress function."""

    def test_compress_simple_dict(self):
        """Compress a simple dictionary."""
        data = {"key": "value"}
        result = compress(data)

        assert isinstance(result, str)
        wrapper = json.loads(result)
        assert "compressedValue" in wrapper
        assert wrapper["type"] == "compressedValue"

    def test_compress_nested_dict(self):
        """Compress a nested dictionary."""
        data = {
            "level1": {
                "level2": {
                    "level3": "deep value"
                }
            }
        }
        result = compress(data)
        wrapper = json.loads(result)
        assert "compressedValue" in wrapper

    def test_compress_with_arrays(self):
        """Compress dict with arrays."""
        data = {"items": [1, 2, 3, "a", "b", "c"]}
        result = compress(data)
        wrapper = json.loads(result)
        assert "compressedValue" in wrapper

    def test_compress_complex_rule_logic(self):
        """Compress complex rule logic structure."""
        data = {
            "namedStrategies": {},
            "strategyComponents": None,
            "grammarVersion": "V1",
            "strategy": {
                "filterNode": {
                    "nodeInput": {
                        "source": {
                            "objectTypeId": "test-object",
                            "type": "objectTypeId",
                        },
                        "type": "source",
                    },
                    "filter": {
                        "columnFilterRule": {
                            "column": {
                                "objectProperty": {
                                    "objectTypeId": "test-object",
                                    "propertyTypeId": "test-property",
                                },
                                "type": "objectProperty",
                            },
                            "filter": {
                                "stringColumnFilter": {
                                    "type": "EQUALS",
                                    "values": ["test-value"],
                                },
                                "type": "stringColumnFilter",
                            },
                        },
                        "type": "columnFilterRule",
                    },
                },
                "type": "filterNode",
            },
        }
        result = compress(data)
        wrapper = json.loads(result)
        assert "compressedValue" in wrapper


class TestDecompress:
    """Tests for decompress function."""

    def test_decompress_simple(self):
        """Decompress a simple compressed string."""
        original = {"key": "value"}
        compressed = compress(original)
        result = decompress(compressed)

        assert result == original

    def test_decompress_nested(self):
        """Decompress nested structure."""
        original = {
            "level1": {
                "level2": {
                    "level3": "deep value"
                }
            }
        }
        compressed = compress(original)
        result = decompress(compressed)

        assert result == original

    def test_decompress_with_arrays(self):
        """Decompress structure with arrays."""
        original = {"items": [1, 2, 3, "a", "b", "c"]}
        compressed = compress(original)
        result = decompress(compressed)

        assert result == original


class TestRoundTrip:
    """Round-trip compression tests."""

    def test_roundtrip_preserves_data(self):
        """Data should be identical after compress/decompress."""
        original = {
            "namedStrategies": {},
            "strategyComponents": None,
            "grammarVersion": "V1",
            "strategy": {
                "filterNode": {
                    "filter": {
                        "type": "columnFilterRule"
                    }
                }
            }
        }
        compressed = compress(original)
        decompressed = decompress(compressed)

        assert decompressed == original

    def test_roundtrip_unicode(self):
        """Unicode characters should be preserved."""
        original = {"message": "Hello, World!"}
        compressed = compress(original)
        decompressed = decompress(compressed)

        assert decompressed == original

    def test_roundtrip_special_chars(self):
        """Special characters should be preserved."""
        original = {"text": "quotes: \"test\", backslash: \\, newline: \n"}
        compressed = compress(original)
        decompressed = decompress(compressed)

        assert decompressed == original
