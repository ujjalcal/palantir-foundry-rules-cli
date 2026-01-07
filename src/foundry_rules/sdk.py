"""
SDK Functions

High-level functions for managing Foundry Rules proposals.
"""

from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel

from .config.types import ResolvedConfig
from .compression import compress
from .templates import build_from_template
from .validation import validate_rule_logic, validate_properties, validate_filter_types
from .api import FoundryClient


class ProposalInput(BaseModel):
    """Proposal input structure."""

    name: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    template: Optional[str] = None
    params: Optional[dict[str, Any]] = None
    logic: Optional[dict[str, Any]] = None


class ValidationResult(BaseModel):
    """Validation result."""

    valid: bool
    structure_errors: list[str] = []
    property_errors: list[str] = []
    filter_errors: list[str] = []
    filter_warnings: list[str] = []


class CreateProposalResult(BaseModel):
    """Result of proposal creation."""

    success: bool
    proposal_id: str
    rule_id: str
    compressed_logic: str


class ApproveProposalResult(BaseModel):
    """Result of proposal approval."""

    success: bool
    proposal_id: str
    message: str


class RejectProposalResult(BaseModel):
    """Result of proposal rejection."""

    success: bool
    proposal_id: str
    message: str


class BulkRejectResult(BaseModel):
    """Result of bulk rejection."""

    success: bool
    total: int
    rejected: int
    failed: int
    results: list[RejectProposalResult]


class EditProposalInput(BaseModel):
    """Input for editing a proposal."""

    proposal_id: str
    name: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[str] = None
    template: Optional[str] = None
    params: Optional[dict[str, Any]] = None
    logic: Optional[dict[str, Any]] = None


class EditProposalResult(BaseModel):
    """Result of proposal edit."""

    success: bool
    proposal_id: str
    compressed_logic: Optional[str] = None
    message: str


def validate_proposal(proposal: ProposalInput, config: ResolvedConfig) -> ValidationResult:
    """
    Validate a proposal without creating it.

    Args:
        proposal: The proposal input
        config: Resolved config

    Returns:
        ValidationResult with any errors
    """
    result = ValidationResult(valid=True)

    # Build logic from template if needed
    logic: Optional[dict[str, Any]] = None

    if proposal.template and proposal.params:
        build_result = build_from_template(
            proposal.template,
            proposal.params,
            config.workflow,
        )

        if not build_result.success or not build_result.logic:
            result.valid = False
            result.structure_errors = build_result.errors or ["Template build failed"]
            return result

        logic = build_result.logic

    elif proposal.logic:
        logic = proposal.logic

    else:
        result.valid = False
        result.structure_errors = ["Either template+params or logic must be provided"]
        return result

    # Structure validation
    structure_result = validate_rule_logic(logic, config.validation)
    result.structure_errors = structure_result.errors

    if not structure_result.valid:
        result.valid = False
        return result

    # Property validation
    prop_result = validate_properties(logic, config.workflow.object_type)
    result.property_errors = prop_result.errors

    if not prop_result.valid:
        result.valid = False

    # Filter validation
    filter_result = validate_filter_types(logic, config.validation)
    result.filter_errors = filter_result.errors
    result.filter_warnings = filter_result.warnings

    if not filter_result.valid:
        result.valid = False

    return result


def create_proposal(proposal: ProposalInput, config: ResolvedConfig) -> CreateProposalResult:
    """
    Create a proposal in Foundry Rules.

    Args:
        proposal: The proposal input
        config: Resolved config

    Returns:
        CreateProposalResult with proposal ID and rule ID

    Raises:
        ValueError: If validation fails or API call fails
    """
    # Validate first
    validation = validate_proposal(proposal, config)

    if not validation.valid:
        all_errors = (
            [f"[Structure] {e}" for e in validation.structure_errors]
            + [f"[Property] {e}" for e in validation.property_errors]
            + [f"[Filter] {e}" for e in validation.filter_errors]
        )
        raise ValueError(f"Validation failed:\n" + "\n".join(all_errors))

    # Build logic from template if needed
    if proposal.template and proposal.params:
        build_result = build_from_template(
            proposal.template,
            proposal.params,
            config.workflow,
        )
        logic = build_result.logic
    else:
        logic = proposal.logic

    # Compress
    compressed = compress(logic)

    # Generate IDs
    timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    proposal_id = f"{config.conventions.proposal_id_prefix}{timestamp}"
    rule_id = f"{config.conventions.rule_id_prefix}{timestamp}"

    # Get values
    name = proposal.name or f"Rule-{timestamp}"
    description = proposal.description or config.conventions.default_description or "Created via CLI"
    keywords = proposal.keywords or config.conventions.default_keywords or "cli-created"

    # Create client and call action
    client = FoundryClient(config)
    client.apply_action_sync(
        config.sdk.actions.create_proposal,
        {
            "proposal_id": proposal_id,
            "rule_id": rule_id,
            "new_rule_name": name,
            "new_rule_description": description,
            "new_logic": compressed,
            "new_logic_keywords": keywords,
            "proposal_author": config.conventions.default_author,
            "proposal_creation_timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )

    return CreateProposalResult(
        success=True,
        proposal_id=proposal_id,
        rule_id=rule_id,
        compressed_logic=compressed,
    )


def approve_proposal(
    proposal_id: str,
    rule_id: str,
    config: ResolvedConfig,
    reviewer: Optional[str] = None,
) -> ApproveProposalResult:
    """
    Approve a proposal in Foundry Rules.

    Args:
        proposal_id: The proposal ID to approve
        rule_id: The rule ID associated with the proposal
        config: Resolved config
        reviewer: Optional reviewer name

    Returns:
        ApproveProposalResult with success status

    Raises:
        ValueError: If API call fails
    """
    client = FoundryClient(config)
    client.apply_action_sync(
        config.sdk.actions.approve_proposal,
        {
            "proposal_object": proposal_id,
            "proposal_review_timestamp": datetime.now(timezone.utc).isoformat(),
            "proposal_reviewer": reviewer or config.conventions.default_author,
            "rule_id": rule_id,
        },
    )

    return ApproveProposalResult(
        success=True,
        proposal_id=proposal_id,
        message=f"Proposal {proposal_id} approved successfully",
    )


def reject_proposal(
    proposal_id: str,
    config: ResolvedConfig,
    reviewer: Optional[str] = None,
) -> RejectProposalResult:
    """
    Reject a proposal in Foundry Rules.

    Args:
        proposal_id: The proposal ID to reject
        config: Resolved config
        reviewer: Optional reviewer name

    Returns:
        RejectProposalResult with success status

    Raises:
        ValueError: If API call fails
    """
    client = FoundryClient(config)
    client.apply_action_sync(
        config.sdk.actions.reject_proposal,
        {
            "proposal_object": proposal_id,
            "proposal_review_timestamp": datetime.now(timezone.utc).isoformat(),
            "proposal_reviewer": reviewer or config.conventions.default_author,
        },
    )

    return RejectProposalResult(
        success=True,
        proposal_id=proposal_id,
        message=f"Proposal {proposal_id} rejected successfully",
    )


def bulk_reject_proposals(
    proposal_ids: list[str],
    config: ResolvedConfig,
    reason: Optional[str] = None,
) -> BulkRejectResult:
    """
    Bulk reject multiple proposals.

    Args:
        proposal_ids: List of proposal IDs to reject
        config: Resolved config
        reason: Optional rejection reason (used as reviewer)

    Returns:
        BulkRejectResult with success/failure counts
    """
    results: list[RejectProposalResult] = []
    rejected = 0
    failed = 0

    for proposal_id in proposal_ids:
        try:
            result = reject_proposal(proposal_id, config, reason)
            results.append(result)
            rejected += 1
        except Exception as e:
            results.append(
                RejectProposalResult(
                    success=False,
                    proposal_id=proposal_id,
                    message=f"Failed to reject: {str(e)}",
                )
            )
            failed += 1

    return BulkRejectResult(
        success=failed == 0,
        total=len(proposal_ids),
        rejected=rejected,
        failed=failed,
        results=results,
    )


def edit_proposal(
    input: EditProposalInput,
    config: ResolvedConfig,
) -> EditProposalResult:
    """
    Edit an existing proposal.

    Args:
        input: Edit input with proposal ID and new values
        config: Resolved config

    Returns:
        EditProposalResult with success status

    Raises:
        ValueError: If validation fails or API call fails
    """
    compressed_logic: Optional[str] = None

    # Build and validate new logic if provided
    if input.logic or (input.template and input.params):
        proposal_input = ProposalInput(
            template=input.template,
            params=input.params,
            logic=input.logic,
        )

        # Validate
        validation = validate_proposal(proposal_input, config)
        if not validation.valid:
            all_errors = (
                [f"[Structure] {e}" for e in validation.structure_errors]
                + [f"[Property] {e}" for e in validation.property_errors]
                + [f"[Filter] {e}" for e in validation.filter_errors]
            )
            raise ValueError(f"Validation failed:\n" + "\n".join(all_errors))

        # Build logic from template if needed
        if input.template and input.params:
            build_result = build_from_template(
                input.template,
                input.params,
                config.workflow,
            )
            logic = build_result.logic
        else:
            logic = input.logic

        compressed_logic = compress(logic)

    # Build parameters
    parameters: dict[str, Any] = {
        "proposal_object": input.proposal_id,
        "proposal_creation_timestamp": datetime.now(timezone.utc).isoformat(),
        "proposal_author": config.conventions.default_author,
    }

    if input.name is not None:
        parameters["new_rule_name"] = input.name
    if input.description is not None:
        parameters["new_rule_description"] = input.description
    if input.keywords is not None:
        parameters["new_logic_keywords"] = input.keywords
    if compressed_logic is not None:
        parameters["new_logic"] = compressed_logic

    # Call action
    client = FoundryClient(config)
    client.apply_action_sync(config.sdk.actions.edit_proposal, parameters)

    return EditProposalResult(
        success=True,
        proposal_id=input.proposal_id,
        compressed_logic=compressed_logic,
        message=f"Proposal {input.proposal_id} edited successfully",
    )
