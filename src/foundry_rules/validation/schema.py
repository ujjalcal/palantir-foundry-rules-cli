"""
Schema Validation Module

Config-driven structure validation for rule logic.
"""

from typing import Any, Optional
from pydantic import BaseModel

from ..config.types import ValidationConfig


class ValidationResult(BaseModel):
    """Result of validation."""

    valid: bool
    errors: list[str] = []
    warnings: list[str] = []


def validate_rule_logic(logic: Any, validation_config: ValidationConfig) -> ValidationResult:
    """
    Validate rule logic structure against config-driven rules.

    Args:
        logic: Rule logic dict
        validation_config: Validation configuration

    Returns:
        ValidationResult with any errors
    """
    errors: list[str] = []
    warnings: list[str] = []

    if not logic or not isinstance(logic, dict):
        return ValidationResult(valid=False, errors=["Root must be an object"])

    # Check grammar version
    if logic.get("grammarVersion") != validation_config.grammar_version:
        errors.append(
            f"grammarVersion must be '{validation_config.grammar_version}', "
            f"got: {logic.get('grammarVersion')}"
        )

    # Check workflowRid
    workflow_rid = logic.get("workflowRid")
    if not workflow_rid or not isinstance(workflow_rid, str):
        errors.append("workflowRid is required and must be a string")

    # Check strategy
    strategy = logic.get("strategy")
    if not strategy or not isinstance(strategy, dict):
        errors.append("strategy is required and must be an object")
    else:
        strategy_type = strategy.get("type")

        if strategy_type not in validation_config.supported_strategy_types:
            errors.append(
                f"strategy.type must be one of "
                f"[{', '.join(validation_config.supported_strategy_types)}], "
                f"got: {strategy_type}"
            )

        # Check that the corresponding node exists
        if strategy_type and strategy_type not in strategy:
            errors.append(
                f"strategy.{strategy_type} is required when type is '{strategy_type}'"
            )

        # Check for common mistakes in filterNode
        if strategy_type == "filterNode":
            filter_node = strategy.get("filterNode")
            if filter_node and isinstance(filter_node, dict) and "type" in filter_node:
                errors.append("filterNode should NOT have a type field (type goes in strategy)")

    # Check effect
    effect = logic.get("effect")
    if not effect or not isinstance(effect, dict):
        errors.append("effect is required and must be an object")
    else:
        if effect.get("type") != "v2":
            errors.append(f"effect.type must be 'v2', got: {effect.get('type')}")

        v2 = effect.get("v2")
        if not v2 or not isinstance(v2, dict):
            errors.append("effect.v2 is required")
        elif not v2.get("outputAndVersion"):
            errors.append("effect.v2.outputAndVersion is required")

    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings if warnings else [],
    )


def get_strategy_type(logic: Any) -> Optional[str]:
    """Extract the strategy type from rule logic."""
    if not logic or not isinstance(logic, dict):
        return None
    strategy = logic.get("strategy")
    if not strategy or not isinstance(strategy, dict):
        return None
    return strategy.get("type")


def extract_object_type_id(logic: Any) -> Optional[str]:
    """Extract the object type ID from rule logic (works with any node type)."""
    if not logic or not isinstance(logic, dict):
        return None

    strategy = logic.get("strategy")
    if not strategy or not isinstance(strategy, dict):
        return None

    # Try each node type
    node_types = ["filterNode", "windowNode", "aggregationNode"]

    for node_type in node_types:
        node = strategy.get(node_type)
        if node and isinstance(node, dict):
            node_input = node.get("nodeInput")
            if node_input and isinstance(node_input, dict):
                source = node_input.get("source")
                if source and isinstance(source, dict):
                    object_type_id = source.get("objectTypeId")
                    if object_type_id:
                        return object_type_id

    return None


def extract_workflow_rid(logic: Any) -> Optional[str]:
    """Extract the workflow RID from rule logic."""
    if not logic or not isinstance(logic, dict):
        return None
    return logic.get("workflowRid")


def validate_workflow_rid(logic: Any, expected_rid: str) -> ValidationResult:
    """Validate that workflowRid matches expected value."""
    errors: list[str] = []
    actual_rid = extract_workflow_rid(logic)

    if not actual_rid:
        errors.append("workflowRid not found in rule logic")
    elif actual_rid != expected_rid:
        errors.append(f"workflowRid mismatch: expected '{expected_rid}', got '{actual_rid}'")

    return ValidationResult(valid=len(errors) == 0, errors=errors)


def validate_object_type(logic: Any, expected_id: str) -> ValidationResult:
    """Validate that objectTypeId matches expected value."""
    errors: list[str] = []
    actual_id = extract_object_type_id(logic)

    if not actual_id:
        errors.append("objectTypeId not found in rule logic")
    elif actual_id != expected_id:
        errors.append(f"objectTypeId mismatch: expected '{expected_id}', got '{actual_id}'")

    return ValidationResult(valid=len(errors) == 0, errors=errors)
