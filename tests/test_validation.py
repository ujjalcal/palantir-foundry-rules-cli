"""Tests for validation module."""

import pytest

from foundry_rules.validation import validate_rule_logic, validate_properties, validate_filter_types
from foundry_rules.validation.filters import (
    extract_string_filter_types,
    extract_numeric_filter_types,
    extract_null_filter_types,
)
from foundry_rules.config.types import (
    ValidationConfig,
    ObjectTypeConfig,
    PropertyDefinition,
)


def get_valid_logic(filter_obj=None):
    """Get valid rule logic structure."""
    if filter_obj is None:
        filter_obj = {
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
                        "values": ["test"],
                    },
                    "type": "stringColumnFilter",
                },
            },
            "type": "columnFilterRule",
        }

    return {
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
                "filter": filter_obj,
                "joinFilterInputs": {},
            },
            "type": "filterNode",
        },
        "workflowRid": "ri.rules..workflow.test",
        "effect": {
            "v2": {
                "outputAndVersion": {
                    "outputId": "output-1",
                    "outputVersion": "1",
                    "workflowRid": "ri.rules..workflow.test",
                },
                "parameterValues": {},
            },
            "type": "v2",
        },
    }


def get_validation_config():
    """Get validation config."""
    return ValidationConfig(
        grammar_version="V1",
        supported_strategy_types=["filterNode"],
        supported_string_filters=["EQUALS", "CONTAINS", "STARTS_WITH"],
        unsupported_string_filters=["REGEX"],
        supported_numeric_filters=["EQUALS", "GREATER_THAN", "LESS_THAN"],
        supported_null_filters=["NULL", "NOT_NULL"],
    )


def get_object_type():
    """Get object type config."""
    return ObjectTypeConfig(
        id="test-object",
        properties=[
            PropertyDefinition(id="test-property", type="string"),
            PropertyDefinition(id="numeric-prop", type="number"),
        ],
    )


class TestValidateRuleLogic:
    """Tests for schema validation."""

    def test_valid_logic_passes(self):
        """Valid logic passes validation."""
        logic = get_valid_logic()
        config = get_validation_config()

        result = validate_rule_logic(logic, config)
        assert result.valid

    def test_missing_strategy_fails(self):
        """Missing strategy fails validation."""
        logic = get_valid_logic()
        del logic["strategy"]
        config = get_validation_config()

        result = validate_rule_logic(logic, config)
        assert not result.valid
        assert any("strategy" in e.lower() for e in result.errors)

    def test_missing_filter_node_fails(self):
        """Missing filterNode fails validation."""
        logic = get_valid_logic()
        logic["strategy"] = {"type": "filterNode"}  # Missing filterNode
        config = get_validation_config()

        result = validate_rule_logic(logic, config)
        assert not result.valid

    def test_missing_effect_fails(self):
        """Missing effect fails validation."""
        logic = get_valid_logic()
        del logic["effect"]
        config = get_validation_config()

        result = validate_rule_logic(logic, config)
        assert not result.valid

    def test_null_logic_fails(self):
        """Null logic fails validation."""
        config = get_validation_config()
        result = validate_rule_logic(None, config)
        assert not result.valid


class TestValidateProperties:
    """Tests for property validation."""

    def test_known_property_passes(self):
        """Known property passes validation."""
        logic = get_valid_logic()
        object_type = get_object_type()

        result = validate_properties(logic, object_type)
        assert result.valid

    def test_unknown_property_fails(self):
        """Unknown property fails validation."""
        filter_obj = {
            "columnFilterRule": {
                "column": {
                    "objectProperty": {
                        "objectTypeId": "test-object",
                        "propertyTypeId": "unknown-property",
                    },
                    "type": "objectProperty",
                },
                "filter": {
                    "stringColumnFilter": {"type": "EQUALS", "values": ["test"]},
                    "type": "stringColumnFilter",
                },
            },
            "type": "columnFilterRule",
        }
        logic = get_valid_logic(filter_obj)
        object_type = get_object_type()

        result = validate_properties(logic, object_type)
        assert not result.valid
        assert any("unknown" in e.lower() for e in result.errors)

    def test_extracts_nested_properties(self):
        """Extracts properties from nested filters."""
        filter_obj = {
            "orFilterRule": {
                "filters": [
                    {
                        "columnFilterRule": {
                            "column": {
                                "objectProperty": {
                                    "objectTypeId": "test-object",
                                    "propertyTypeId": "test-property",
                                },
                                "type": "objectProperty",
                            },
                            "filter": {
                                "stringColumnFilter": {"type": "EQUALS", "values": ["a"]},
                                "type": "stringColumnFilter",
                            },
                        },
                        "type": "columnFilterRule",
                    },
                    {
                        "columnFilterRule": {
                            "column": {
                                "objectProperty": {
                                    "objectTypeId": "test-object",
                                    "propertyTypeId": "numeric-prop",
                                },
                                "type": "objectProperty",
                            },
                            "filter": {
                                "numericColumnFilter": {"type": "EQUALS", "values": [42]},
                                "type": "numericColumnFilter",
                            },
                        },
                        "type": "columnFilterRule",
                    },
                ]
            },
            "type": "orFilterRule",
        }
        logic = get_valid_logic(filter_obj)
        object_type = get_object_type()

        result = validate_properties(logic, object_type)
        assert result.valid


class TestExtractFilterTypes:
    """Tests for filter type extraction."""

    def test_extract_string_filter_type(self):
        """Extract string filter type."""
        filter_obj = {
            "columnFilterRule": {
                "filter": {
                    "stringColumnFilter": {"type": "EQUALS"},
                    "type": "stringColumnFilter",
                }
            }
        }

        result = extract_string_filter_types(filter_obj)
        assert "EQUALS" in result

    def test_extract_numeric_filter_type(self):
        """Extract numeric filter type."""
        filter_obj = {
            "columnFilterRule": {
                "filter": {
                    "numericColumnFilter": {"type": "GREATER_THAN"},
                    "type": "numericColumnFilter",
                }
            }
        }

        result = extract_numeric_filter_types(filter_obj)
        assert "GREATER_THAN" in result

    def test_extract_null_filter_type(self):
        """Extract null filter type."""
        filter_obj = {
            "columnFilterRule": {
                "filter": {
                    "nullColumnFilter": {"type": "NULL"},
                    "type": "nullColumnFilter",
                }
            }
        }

        result = extract_null_filter_types(filter_obj)
        assert "NULL" in result

    def test_extract_from_or_filter(self):
        """Extract from OR filter."""
        filter_obj = {
            "orFilterRule": {
                "filters": [
                    {
                        "columnFilterRule": {
                            "filter": {
                                "stringColumnFilter": {"type": "EQUALS"},
                                "type": "stringColumnFilter",
                            }
                        }
                    },
                    {
                        "columnFilterRule": {
                            "filter": {
                                "stringColumnFilter": {"type": "CONTAINS"},
                                "type": "stringColumnFilter",
                            }
                        }
                    },
                ]
            }
        }

        result = extract_string_filter_types(filter_obj)
        assert "EQUALS" in result
        assert "CONTAINS" in result


class TestValidateFilterTypes:
    """Tests for filter type validation."""

    def test_supported_filter_passes(self):
        """Supported filter type passes."""
        logic = get_valid_logic()
        config = get_validation_config()

        result = validate_filter_types(logic, config)
        assert result.valid

    def test_unsupported_filter_fails(self):
        """Unsupported filter type fails."""
        filter_obj = {
            "columnFilterRule": {
                "column": {
                    "objectProperty": {
                        "objectTypeId": "test-object",
                        "propertyTypeId": "test-property",
                    },
                    "type": "objectProperty",
                },
                "filter": {
                    "stringColumnFilter": {"type": "REGEX", "values": [".*"]},
                    "type": "stringColumnFilter",
                },
            },
            "type": "columnFilterRule",
        }
        logic = get_valid_logic(filter_obj)
        config = get_validation_config()

        result = validate_filter_types(logic, config)
        assert not result.valid
        assert any("REGEX" in e for e in result.errors)

    def test_unknown_filter_warns(self):
        """Unknown (but not unsupported) filter produces warning."""
        filter_obj = {
            "columnFilterRule": {
                "column": {
                    "objectProperty": {
                        "objectTypeId": "test-object",
                        "propertyTypeId": "test-property",
                    },
                    "type": "objectProperty",
                },
                "filter": {
                    "stringColumnFilter": {"type": "UNKNOWN_TYPE", "values": ["test"]},
                    "type": "stringColumnFilter",
                },
            },
            "type": "columnFilterRule",
        }
        logic = get_valid_logic(filter_obj)
        config = get_validation_config()

        result = validate_filter_types(logic, config)
        # Not in unsupported, so should pass with warning
        assert result.valid
        assert len(result.warnings) > 0
