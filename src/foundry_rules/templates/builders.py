"""
Template Loader and Builder

Builds rule logic from templates.
"""

from typing import Any, Optional
from pydantic import BaseModel

from ..config.types import WorkflowDefinition


class BuildResult(BaseModel):
    """Result of building from template."""

    success: bool
    logic: Optional[dict[str, Any]] = None
    errors: list[str] = []


# Default macro for filters
DEFAULT_MACRO = {
    "function": "VALUE",
    "inputType": "ALL_TYPES",
    "outputType": "ALL_TYPES",
}


def build_string_equals_filter(
    object_type_id: str,
    property_id: str,
    value: str,
    case_sensitive: bool = False,
) -> dict[str, Any]:
    """Build a string equals filter."""
    return {
        "columnFilterRule": {
            "column": {
                "objectProperty": {
                    "objectTypeId": object_type_id,
                    "propertyTypeId": property_id,
                },
                "type": "objectProperty",
            },
            "filter": {
                "stringColumnFilter": {
                    "type": "EQUALS",
                    "caseSensitive": case_sensitive,
                    "ignoreWhitespace": False,
                    "values": [value],
                    "macro": DEFAULT_MACRO,
                },
                "type": "stringColumnFilter",
            },
        },
        "type": "columnFilterRule",
    }


def build_string_or_filter(
    object_type_id: str,
    property_id: str,
    values: list[str],
    case_sensitive: bool = False,
) -> dict[str, Any]:
    """Build a string OR filter (multiple values)."""
    filters = [
        build_string_equals_filter(object_type_id, property_id, value, case_sensitive)
        for value in values
    ]

    return {
        "orFilterRule": {"filters": filters},
        "type": "orFilterRule",
    }


def build_numeric_filter(
    object_type_id: str,
    property_id: str,
    comparison: str,
    value: float,
) -> dict[str, Any]:
    """Build a numeric comparison filter."""
    return {
        "columnFilterRule": {
            "column": {
                "objectProperty": {
                    "objectTypeId": object_type_id,
                    "propertyTypeId": property_id,
                },
                "type": "objectProperty",
            },
            "filter": {
                "numericColumnFilter": {
                    "type": comparison,
                    "values": [value],
                    "macro": DEFAULT_MACRO,
                },
                "type": "numericColumnFilter",
            },
        },
        "type": "columnFilterRule",
    }


def build_numeric_range_filter(
    object_type_id: str,
    property_id: str,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
) -> dict[str, Any]:
    """Build a numeric range filter (min <= value <= max)."""
    filters: list[dict[str, Any]] = []

    if min_value is not None:
        filters.append(
            build_numeric_filter(
                object_type_id, property_id, "GREATER_THAN_OR_EQUAL", min_value
            )
        )

    if max_value is not None:
        filters.append(
            build_numeric_filter(
                object_type_id, property_id, "LESS_THAN_OR_EQUAL", max_value
            )
        )

    if not filters:
        raise ValueError("Numeric range filter requires at least min or max")

    if len(filters) == 1:
        return filters[0]

    return {
        "andFilterRule": {"filters": filters},
        "type": "andFilterRule",
    }


def build_null_filter(
    object_type_id: str,
    property_id: str,
    is_null: bool = True,
) -> dict[str, Any]:
    """Build a null check filter."""
    return {
        "columnFilterRule": {
            "column": {
                "objectProperty": {
                    "objectTypeId": object_type_id,
                    "propertyTypeId": property_id,
                },
                "type": "objectProperty",
            },
            "filter": {
                "nullColumnFilter": {
                    "type": "NULL" if is_null else "NOT_NULL",
                },
                "type": "nullColumnFilter",
            },
        },
        "type": "columnFilterRule",
    }


def wrap_filter_as_rule_logic(
    filter_obj: dict[str, Any],
    workflow: WorkflowDefinition,
) -> dict[str, Any]:
    """Wrap a filter in a complete rule logic structure."""
    return {
        "namedStrategies": {},
        "strategyComponents": None,
        "grammarVersion": "V1",
        "strategy": {
            "filterNode": {
                "nodeInput": {
                    "source": {
                        "objectTypeId": workflow.object_type.id,
                        "type": "objectTypeId",
                    },
                    "type": "source",
                },
                "filter": filter_obj,
                "joinFilterInputs": {},
            },
            "type": "filterNode",
        },
        "workflowRid": workflow.workflow_rid,
        "effect": {
            "v2": {
                "outputAndVersion": {
                    "outputId": workflow.output.id,
                    "outputVersion": workflow.output.version,
                    "workflowRid": workflow.workflow_rid,
                },
                "parameterValues": {},
            },
            "type": "v2",
        },
    }


def build_from_template(
    template_name: str,
    params: dict[str, Any],
    workflow: WorkflowDefinition,
) -> BuildResult:
    """
    Build rule logic from a template name and parameters.

    Args:
        template_name: Name of the template (string-equals, string-or, etc.)
        params: Template parameters
        workflow: Workflow definition

    Returns:
        BuildResult with logic or errors
    """
    errors: list[str] = []
    object_type_id = workflow.object_type.id

    try:
        filter_obj: dict[str, Any]

        if template_name == "string-equals":
            property_id = params.get("propertyId")
            value = params.get("value")
            case_sensitive = params.get("caseSensitive", False)

            if not property_id:
                errors.append("Missing required parameter: propertyId")
            if not value:
                errors.append("Missing required parameter: value")

            if errors:
                return BuildResult(success=False, errors=errors)

            filter_obj = build_string_equals_filter(
                object_type_id, property_id, value, case_sensitive
            )

        elif template_name == "string-or":
            property_id = params.get("propertyId")
            values = params.get("values")
            case_sensitive = params.get("caseSensitive", False)

            if not property_id:
                errors.append("Missing required parameter: propertyId")
            if not values or not isinstance(values, list) or len(values) == 0:
                errors.append("Missing or empty required parameter: values")

            if errors:
                return BuildResult(success=False, errors=errors)

            filter_obj = build_string_or_filter(
                object_type_id, property_id, values, case_sensitive
            )

        elif template_name == "numeric-range":
            property_id = params.get("propertyId")
            min_value = params.get("min")
            max_value = params.get("max")

            if not property_id:
                errors.append("Missing required parameter: propertyId")
            if min_value is None and max_value is None:
                errors.append("At least one of min or max is required")

            if errors:
                return BuildResult(success=False, errors=errors)

            filter_obj = build_numeric_range_filter(
                object_type_id, property_id, min_value, max_value
            )

        elif template_name == "null-check":
            property_id = params.get("propertyId")
            is_null = params.get("isNull", True)

            if not property_id:
                errors.append("Missing required parameter: propertyId")

            if errors:
                return BuildResult(success=False, errors=errors)

            filter_obj = build_null_filter(object_type_id, property_id, is_null)

        else:
            return BuildResult(success=False, errors=[f"Unknown template: {template_name}"])

        logic = wrap_filter_as_rule_logic(filter_obj, workflow)
        return BuildResult(success=True, logic=logic)

    except Exception as e:
        return BuildResult(success=False, errors=[str(e)])


def get_builtin_templates() -> list[dict[str, Any]]:
    """Get available built-in templates."""
    return [
        {
            "name": "string-equals",
            "description": "Simple string equality filter",
            "parameters": ["propertyId", "value", "caseSensitive?"],
        },
        {
            "name": "string-or",
            "description": "OR filter with multiple string values",
            "parameters": ["propertyId", "values[]", "caseSensitive?"],
        },
        {
            "name": "numeric-range",
            "description": "Numeric range filter (min <= value <= max)",
            "parameters": ["propertyId", "min?", "max?"],
        },
        {
            "name": "null-check",
            "description": "Check if property is null or not null",
            "parameters": ["propertyId", "isNull?"],
        },
    ]
