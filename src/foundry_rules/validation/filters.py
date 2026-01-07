"""
Filter Validation Module

Config-driven validation for filter types.
"""

from typing import Any
from pydantic import BaseModel

from ..config.types import ValidationConfig


class FilterValidationResult(BaseModel):
    """Result of filter validation."""

    valid: bool
    errors: list[str] = []
    warnings: list[str] = []
    used_filters: dict[str, list[str]] = {}


def extract_string_filter_types(filter_obj: Any) -> set[str]:
    """Extract all string filter types used in a filter (recursively)."""
    types: set[str] = set()

    if not filter_obj or not isinstance(filter_obj, dict):
        return types

    # Column filter with string type
    if "columnFilterRule" in filter_obj:
        rule = filter_obj["columnFilterRule"]
        if isinstance(rule, dict):
            column_filter = rule.get("filter")
            if column_filter and isinstance(column_filter, dict):
                str_filter = column_filter.get("stringColumnFilter")
                if str_filter and isinstance(str_filter, dict):
                    filter_type = str_filter.get("type")
                    if filter_type:
                        types.add(filter_type)

    # Recurse into compound filters
    if "orFilterRule" in filter_obj:
        rule = filter_obj["orFilterRule"]
        if isinstance(rule, dict):
            filters = rule.get("filters", [])
            if isinstance(filters, list):
                for sub_filter in filters:
                    types.update(extract_string_filter_types(sub_filter))

    if "andFilterRule" in filter_obj:
        rule = filter_obj["andFilterRule"]
        if isinstance(rule, dict):
            filters = rule.get("filters", [])
            if isinstance(filters, list):
                for sub_filter in filters:
                    types.update(extract_string_filter_types(sub_filter))

    if "notFilterRule" in filter_obj:
        rule = filter_obj["notFilterRule"]
        if isinstance(rule, dict):
            types.update(extract_string_filter_types(rule.get("filter")))

    return types


def extract_numeric_filter_types(filter_obj: Any) -> set[str]:
    """Extract all numeric filter types used in a filter (recursively)."""
    types: set[str] = set()

    if not filter_obj or not isinstance(filter_obj, dict):
        return types

    # Column filter with numeric type
    if "columnFilterRule" in filter_obj:
        rule = filter_obj["columnFilterRule"]
        if isinstance(rule, dict):
            column_filter = rule.get("filter")
            if column_filter and isinstance(column_filter, dict):
                num_filter = column_filter.get("numericColumnFilter")
                if num_filter and isinstance(num_filter, dict):
                    filter_type = num_filter.get("type")
                    if filter_type:
                        types.add(filter_type)

    # Recurse into compound filters
    if "orFilterRule" in filter_obj:
        rule = filter_obj["orFilterRule"]
        if isinstance(rule, dict):
            filters = rule.get("filters", [])
            if isinstance(filters, list):
                for sub_filter in filters:
                    types.update(extract_numeric_filter_types(sub_filter))

    if "andFilterRule" in filter_obj:
        rule = filter_obj["andFilterRule"]
        if isinstance(rule, dict):
            filters = rule.get("filters", [])
            if isinstance(filters, list):
                for sub_filter in filters:
                    types.update(extract_numeric_filter_types(sub_filter))

    if "notFilterRule" in filter_obj:
        rule = filter_obj["notFilterRule"]
        if isinstance(rule, dict):
            types.update(extract_numeric_filter_types(rule.get("filter")))

    return types


def extract_null_filter_types(filter_obj: Any) -> set[str]:
    """Extract all null filter types used in a filter (recursively)."""
    types: set[str] = set()

    if not filter_obj or not isinstance(filter_obj, dict):
        return types

    # Column filter with null type
    if "columnFilterRule" in filter_obj:
        rule = filter_obj["columnFilterRule"]
        if isinstance(rule, dict):
            column_filter = rule.get("filter")
            if column_filter and isinstance(column_filter, dict):
                null_filter = column_filter.get("nullColumnFilter")
                if null_filter and isinstance(null_filter, dict):
                    filter_type = null_filter.get("type")
                    if filter_type:
                        types.add(filter_type)

    # Recurse into compound filters
    if "orFilterRule" in filter_obj:
        rule = filter_obj["orFilterRule"]
        if isinstance(rule, dict):
            filters = rule.get("filters", [])
            if isinstance(filters, list):
                for sub_filter in filters:
                    types.update(extract_null_filter_types(sub_filter))

    if "andFilterRule" in filter_obj:
        rule = filter_obj["andFilterRule"]
        if isinstance(rule, dict):
            filters = rule.get("filters", [])
            if isinstance(filters, list):
                for sub_filter in filters:
                    types.update(extract_null_filter_types(sub_filter))

    if "notFilterRule" in filter_obj:
        rule = filter_obj["notFilterRule"]
        if isinstance(rule, dict):
            types.update(extract_null_filter_types(rule.get("filter")))

    return types


def validate_filter_types(
    logic: Any,
    validation_config: ValidationConfig,
) -> FilterValidationResult:
    """
    Validate filter types against config-driven rules.

    Args:
        logic: Rule logic dict
        validation_config: Validation configuration

    Returns:
        FilterValidationResult with any errors/warnings
    """
    errors: list[str] = []
    warnings: list[str] = []

    # Extract filter from rule logic
    strategy = logic.get("strategy") if logic else None
    filter_node = strategy.get("filterNode") if strategy else None
    filter_obj = filter_node.get("filter") if filter_node else None

    # Extract all filter types used
    string_types = sorted(extract_string_filter_types(filter_obj))
    numeric_types = sorted(extract_numeric_filter_types(filter_obj))
    null_types = sorted(extract_null_filter_types(filter_obj))

    # Validate string filters
    for filter_type in string_types:
        if filter_type in validation_config.unsupported_string_filters:
            errors.append(
                f'String filter type "{filter_type}" is not supported. '
                f'Use one of: {", ".join(validation_config.supported_string_filters)}'
            )
        elif filter_type not in validation_config.supported_string_filters:
            warnings.append(
                f'String filter type "{filter_type}" is not in the list of tested filters. '
                "It may not render correctly in the UI."
            )

    # Validate numeric filters
    if validation_config.supported_numeric_filters:
        for filter_type in numeric_types:
            if filter_type not in validation_config.supported_numeric_filters:
                warnings.append(
                    f'Numeric filter type "{filter_type}" is not in the list of tested filters.'
                )

    # Validate null filters
    if validation_config.supported_null_filters:
        for filter_type in null_types:
            if filter_type not in validation_config.supported_null_filters:
                warnings.append(
                    f'Null filter type "{filter_type}" is not in the list of tested filters.'
                )

    return FilterValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings,
        used_filters={
            "string": string_types,
            "numeric": numeric_types,
            "null": null_types,
        },
    )


def get_filter_summary(logic: Any) -> dict[str, Any]:
    """Get a summary of all filter types used."""
    strategy = logic.get("strategy") if logic else None
    filter_node = strategy.get("filterNode") if strategy else None
    filter_obj = filter_node.get("filter") if filter_node else None

    has_compound = False
    if filter_obj and isinstance(filter_obj, dict):
        has_compound = any(
            key in filter_obj for key in ["orFilterRule", "andFilterRule", "notFilterRule"]
        )

    return {
        "string_filters": sorted(extract_string_filter_types(filter_obj)),
        "numeric_filters": sorted(extract_numeric_filter_types(filter_obj)),
        "null_filters": sorted(extract_null_filter_types(filter_obj)),
        "has_compound_filters": has_compound,
    }
