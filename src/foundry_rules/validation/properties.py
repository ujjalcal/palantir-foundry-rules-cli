"""
Property Validation Module

Validates that properties used in rule logic exist on the object type.
"""

from typing import Any
from pydantic import BaseModel

from ..config.types import ObjectTypeConfig


class PropertyValidationResult(BaseModel):
    """Result of property validation."""

    valid: bool
    errors: list[str] = []
    used_properties: list[str] = []
    valid_properties: list[str] = []


def extract_properties_from_filter(filter_obj: Any) -> set[str]:
    """Extract all property IDs used in a filter (recursively)."""
    properties: set[str] = set()

    if not filter_obj or not isinstance(filter_obj, dict):
        return properties

    # Column filter - extract property
    if "columnFilterRule" in filter_obj:
        rule = filter_obj["columnFilterRule"]
        if isinstance(rule, dict):
            column = rule.get("column")
            if column and isinstance(column, dict):
                obj_prop = column.get("objectProperty")
                if obj_prop and isinstance(obj_prop, dict):
                    prop_id = obj_prop.get("propertyTypeId")
                    if prop_id:
                        properties.add(prop_id)

    # OR filter - recurse into sub-filters
    if "orFilterRule" in filter_obj:
        rule = filter_obj["orFilterRule"]
        if isinstance(rule, dict):
            filters = rule.get("filters", [])
            if isinstance(filters, list):
                for sub_filter in filters:
                    properties.update(extract_properties_from_filter(sub_filter))

    # AND filter - recurse into sub-filters
    if "andFilterRule" in filter_obj:
        rule = filter_obj["andFilterRule"]
        if isinstance(rule, dict):
            filters = rule.get("filters", [])
            if isinstance(filters, list):
                for sub_filter in filters:
                    properties.update(extract_properties_from_filter(sub_filter))

    # NOT filter - recurse into inner filter
    if "notFilterRule" in filter_obj:
        rule = filter_obj["notFilterRule"]
        if isinstance(rule, dict):
            inner_filter = rule.get("filter")
            properties.update(extract_properties_from_filter(inner_filter))

    return properties


def _extract_property_from_column(column: Any) -> str | None:
    """Extract property from a column reference."""
    if not column or not isinstance(column, dict):
        return None
    obj_prop = column.get("objectProperty")
    if obj_prop and isinstance(obj_prop, dict):
        return obj_prop.get("propertyTypeId")
    return None


def extract_properties_from_window_node(node: Any) -> set[str]:
    """Extract all property IDs used in windowNode."""
    properties: set[str] = set()

    if not node or not isinstance(node, dict):
        return properties

    # columnsToAdd
    columns_to_add = node.get("columnsToAdd", [])
    if isinstance(columns_to_add, list):
        for col in columns_to_add:
            if isinstance(col, dict):
                col_def = col.get("columnDefinition")
                if col_def and isinstance(col_def, dict):
                    prop_id = _extract_property_from_column(col_def.get("column"))
                    if prop_id:
                        properties.add(prop_id)

    # partitionBy
    partition_by = node.get("partitionBy", [])
    if isinstance(partition_by, list):
        for col in partition_by:
            prop_id = _extract_property_from_column(col)
            if prop_id:
                properties.add(prop_id)

    return properties


def extract_properties_from_aggregation_node(node: Any) -> set[str]:
    """Extract all property IDs used in aggregationNode."""
    properties: set[str] = set()

    if not node or not isinstance(node, dict):
        return properties

    # columnsToAdd
    columns_to_add = node.get("columnsToAdd", [])
    if isinstance(columns_to_add, list):
        for col in columns_to_add:
            if isinstance(col, dict):
                col_def = col.get("columnDefinition")
                if col_def and isinstance(col_def, dict):
                    prop_id = _extract_property_from_column(col_def.get("aggregationColumn"))
                    if prop_id:
                        properties.add(prop_id)

    # groupByColumns
    group_by_columns = node.get("groupByColumns", [])
    if isinstance(group_by_columns, list):
        for col in group_by_columns:
            if isinstance(col, dict):
                prop_id = _extract_property_from_column(col.get("column"))
                if prop_id:
                    properties.add(prop_id)

    return properties


def extract_all_properties(logic: Any) -> set[str]:
    """Extract all property IDs used in rule logic (any node type)."""
    properties: set[str] = set()

    if not logic or not isinstance(logic, dict):
        return properties

    strategy = logic.get("strategy")
    if not strategy or not isinstance(strategy, dict):
        return properties

    # filterNode
    filter_node = strategy.get("filterNode")
    if filter_node and isinstance(filter_node, dict):
        filter_obj = filter_node.get("filter")
        properties.update(extract_properties_from_filter(filter_obj))

    # windowNode
    window_node = strategy.get("windowNode")
    if window_node:
        properties.update(extract_properties_from_window_node(window_node))

    # aggregationNode
    aggregation_node = strategy.get("aggregationNode")
    if aggregation_node:
        properties.update(extract_properties_from_aggregation_node(aggregation_node))

    # Also extract from effect parameterValues (column type)
    effect = logic.get("effect")
    if effect and isinstance(effect, dict):
        v2 = effect.get("v2")
        if v2 and isinstance(v2, dict):
            param_values = v2.get("parameterValues")
            if param_values and isinstance(param_values, dict):
                for value in param_values.values():
                    if isinstance(value, dict) and value.get("type") == "column":
                        prop_id = _extract_property_from_column(value.get("column"))
                        if prop_id:
                            properties.add(prop_id)

    return properties


def validate_properties(
    logic: Any,
    object_type_config: ObjectTypeConfig,
) -> PropertyValidationResult:
    """
    Validate properties against object type config (static validation).

    Args:
        logic: Rule logic dict
        object_type_config: Object type configuration

    Returns:
        PropertyValidationResult with any errors
    """
    errors: list[str] = []

    # Extract used properties
    used_properties = extract_all_properties(logic)
    used_list = sorted(used_properties)

    # Get valid properties from config
    valid_properties = [p.id for p in object_type_config.properties]

    # Check each used property
    for prop in used_list:
        if prop not in valid_properties:
            errors.append(
                f'Property "{prop}" does not exist on object type '
                f'"{object_type_config.id}". Valid properties: {", ".join(valid_properties)}'
            )

    return PropertyValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        used_properties=used_list,
        valid_properties=valid_properties,
    )


def get_property_summary(logic: Any) -> dict[str, Any]:
    """Get a summary of properties used in rule logic."""
    properties = sorted(extract_all_properties(logic))
    return {
        "properties": properties,
        "count": len(properties),
    }
