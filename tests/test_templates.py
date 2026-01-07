"""Tests for templates module."""

import pytest

from foundry_rules.templates import (
    build_from_template,
    get_builtin_templates,
    build_string_equals_filter,
    build_string_or_filter,
    build_numeric_range_filter,
    build_null_filter,
    wrap_filter_as_rule_logic,
)
from foundry_rules.config.types import WorkflowDefinition, ObjectTypeConfig, OutputConfig


def get_workflow():
    """Get a test workflow definition."""
    return WorkflowDefinition(
        name="Test Workflow",
        workflow_rid="ri.rules..workflow.test",
        object_type=ObjectTypeConfig(id="test-object", properties=[]),
        output=OutputConfig(id="output-1", version="1"),
    )


class TestBuildStringEqualsFilter:
    """Tests for string equals filter builder."""

    def test_builds_correct_structure(self):
        """Builds correct filter structure."""
        result = build_string_equals_filter(
            object_type_id="test-object",
            property_id="test-prop",
            value="test-value",
        )

        assert result["type"] == "columnFilterRule"
        assert "columnFilterRule" in result

        column = result["columnFilterRule"]["column"]
        assert column["type"] == "objectProperty"
        assert column["objectProperty"]["objectTypeId"] == "test-object"
        assert column["objectProperty"]["propertyTypeId"] == "test-prop"

        filter_obj = result["columnFilterRule"]["filter"]
        assert filter_obj["type"] == "stringColumnFilter"
        assert filter_obj["stringColumnFilter"]["type"] == "EQUALS"
        assert filter_obj["stringColumnFilter"]["values"] == ["test-value"]

    def test_case_sensitive_option(self):
        """Case sensitive option is set correctly."""
        result = build_string_equals_filter(
            object_type_id="test-object",
            property_id="test-prop",
            value="test",
            case_sensitive=True,
        )

        filter_obj = result["columnFilterRule"]["filter"]["stringColumnFilter"]
        assert filter_obj["caseSensitive"] is True

    def test_case_insensitive_default(self):
        """Case insensitive is default."""
        result = build_string_equals_filter(
            object_type_id="test-object",
            property_id="test-prop",
            value="test",
        )

        filter_obj = result["columnFilterRule"]["filter"]["stringColumnFilter"]
        assert filter_obj["caseSensitive"] is False


class TestBuildStringOrFilter:
    """Tests for string OR filter builder."""

    def test_builds_or_filter_with_multiple_values(self):
        """Builds OR filter with multiple values."""
        result = build_string_or_filter(
            object_type_id="test-object",
            property_id="test-prop",
            values=["a", "b", "c"],
        )

        assert result["type"] == "orFilterRule"
        assert "orFilterRule" in result
        assert len(result["orFilterRule"]["filters"]) == 3

    def test_each_subfilter_is_equals(self):
        """Each subfilter is an EQUALS filter."""
        result = build_string_or_filter(
            object_type_id="test-object",
            property_id="test-prop",
            values=["x", "y"],
        )

        for sub in result["orFilterRule"]["filters"]:
            assert sub["type"] == "columnFilterRule"
            filter_obj = sub["columnFilterRule"]["filter"]["stringColumnFilter"]
            assert filter_obj["type"] == "EQUALS"


class TestBuildNumericRangeFilter:
    """Tests for numeric range filter builder."""

    def test_min_only(self):
        """Build filter with min only."""
        result = build_numeric_range_filter(
            object_type_id="test-object",
            property_id="test-prop",
            min_value=10,
        )

        assert result["type"] == "columnFilterRule"
        filter_obj = result["columnFilterRule"]["filter"]["numericColumnFilter"]
        assert filter_obj["type"] == "GREATER_THAN_OR_EQUAL"
        assert filter_obj["values"] == [10]

    def test_max_only(self):
        """Build filter with max only."""
        result = build_numeric_range_filter(
            object_type_id="test-object",
            property_id="test-prop",
            max_value=100,
        )

        assert result["type"] == "columnFilterRule"
        filter_obj = result["columnFilterRule"]["filter"]["numericColumnFilter"]
        assert filter_obj["type"] == "LESS_THAN_OR_EQUAL"
        assert filter_obj["values"] == [100]

    def test_min_and_max(self):
        """Build filter with both min and max."""
        result = build_numeric_range_filter(
            object_type_id="test-object",
            property_id="test-prop",
            min_value=10,
            max_value=100,
        )

        assert result["type"] == "andFilterRule"
        assert len(result["andFilterRule"]["filters"]) == 2

    def test_neither_min_nor_max_raises(self):
        """Raises error if neither min nor max provided."""
        with pytest.raises(ValueError):
            build_numeric_range_filter(
                object_type_id="test-object",
                property_id="test-prop",
            )


class TestBuildNullFilter:
    """Tests for null filter builder."""

    def test_is_null(self):
        """Build IS NULL filter."""
        result = build_null_filter(
            object_type_id="test-object",
            property_id="test-prop",
            is_null=True,
        )

        assert result["type"] == "columnFilterRule"
        filter_obj = result["columnFilterRule"]["filter"]["nullColumnFilter"]
        assert filter_obj["type"] == "NULL"

    def test_is_not_null(self):
        """Build IS NOT NULL filter."""
        result = build_null_filter(
            object_type_id="test-object",
            property_id="test-prop",
            is_null=False,
        )

        filter_obj = result["columnFilterRule"]["filter"]["nullColumnFilter"]
        assert filter_obj["type"] == "NOT_NULL"


class TestWrapFilterAsRuleLogic:
    """Tests for wrapping filter in rule logic."""

    def test_wraps_correctly(self):
        """Wraps filter in complete rule logic structure."""
        filter_obj = build_string_equals_filter("test-object", "test-prop", "value")
        workflow = get_workflow()

        result = wrap_filter_as_rule_logic(filter_obj, workflow)

        assert result["grammarVersion"] == "V1"
        assert result["workflowRid"] == "ri.rules..workflow.test"
        assert "strategy" in result
        assert result["strategy"]["type"] == "filterNode"
        assert result["strategy"]["filterNode"]["filter"] == filter_obj
        assert "effect" in result


class TestBuildFromTemplate:
    """Tests for template builder function."""

    def test_string_equals_template(self):
        """Build from string-equals template."""
        workflow = get_workflow()
        result = build_from_template(
            "string-equals",
            {"propertyId": "test-prop", "value": "test-value"},
            workflow,
        )

        assert result.success
        assert result.logic is not None
        assert result.logic["strategy"]["type"] == "filterNode"

    def test_string_or_template(self):
        """Build from string-or template."""
        workflow = get_workflow()
        result = build_from_template(
            "string-or",
            {"propertyId": "test-prop", "values": ["a", "b", "c"]},
            workflow,
        )

        assert result.success
        assert result.logic is not None

    def test_numeric_range_template(self):
        """Build from numeric-range template."""
        workflow = get_workflow()
        result = build_from_template(
            "numeric-range",
            {"propertyId": "test-prop", "min": 10, "max": 100},
            workflow,
        )

        assert result.success
        assert result.logic is not None

    def test_null_check_template(self):
        """Build from null-check template."""
        workflow = get_workflow()
        result = build_from_template(
            "null-check",
            {"propertyId": "test-prop", "isNull": True},
            workflow,
        )

        assert result.success
        assert result.logic is not None

    def test_unknown_template_fails(self):
        """Unknown template name fails."""
        workflow = get_workflow()
        result = build_from_template(
            "unknown-template",
            {"propertyId": "test-prop"},
            workflow,
        )

        assert not result.success
        assert len(result.errors) > 0

    def test_missing_required_param_fails(self):
        """Missing required parameter fails."""
        workflow = get_workflow()
        result = build_from_template(
            "string-equals",
            {"propertyId": "test-prop"},  # Missing "value"
            workflow,
        )

        assert not result.success
        assert any("value" in e.lower() for e in result.errors)


class TestGetBuiltinTemplates:
    """Tests for getting available templates."""

    def test_returns_all_templates(self):
        """Returns all built-in templates."""
        templates = get_builtin_templates()

        assert len(templates) == 4
        names = [t["name"] for t in templates]
        assert "string-equals" in names
        assert "string-or" in names
        assert "numeric-range" in names
        assert "null-check" in names

    def test_templates_have_required_fields(self):
        """Each template has required fields."""
        templates = get_builtin_templates()

        for t in templates:
            assert "name" in t
            assert "description" in t
            assert "parameters" in t
