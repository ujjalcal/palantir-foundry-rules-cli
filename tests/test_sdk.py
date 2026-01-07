"""Tests for SDK module."""

import pytest
from unittest.mock import patch, MagicMock

from foundry_rules.sdk import (
    ProposalInput,
    validate_proposal,
    create_proposal,
    approve_proposal,
    reject_proposal,
    bulk_reject_proposals,
    edit_proposal,
    EditProposalInput,
)
from foundry_rules.config.types import (
    ResolvedConfig,
    WorkflowDefinition,
    ObjectTypeConfig,
    PropertyDefinition,
    OutputConfig,
    ResolvedFoundryConnection,
    SdkConfig,
    ActionConfig,
    ArchetypeConfig,
    ValidationConfig,
    ConventionConfig,
)


def get_test_config():
    """Get a test configuration."""
    return ResolvedConfig(
        version="1.0",
        workflow=WorkflowDefinition(
            name="Test Workflow",
            workflow_rid="ri.rules..workflow.test",
            object_type=ObjectTypeConfig(
                id="test-object",
                properties=[
                    PropertyDefinition(id="test-property", type="string"),
                ],
            ),
            output=OutputConfig(id="output-1", version="1"),
        ),
        foundry=ResolvedFoundryConnection(
            url="https://test.palantirfoundry.com",
            ontology_rid="ri.ontology.main.ontology.test",
            token="test-token",
        ),
        sdk=SdkConfig(
            package_name="@test/sdk",
            archetypes=ArchetypeConfig(
                proposal="Proposal",
                rule="Rule",
            ),
            actions=ActionConfig(
                create_proposal="create-proposal",
                approve_proposal="approve-proposal",
                reject_proposal="reject-proposal",
                edit_proposal="edit-proposal",
            ),
        ),
        validation=ValidationConfig(
            grammar_version="V1",
            supported_strategy_types=["filterNode"],
            supported_string_filters=["EQUALS", "CONTAINS"],
            unsupported_string_filters=["REGEX"],
        ),
        conventions=ConventionConfig(
            proposal_id_prefix="PROP-",
            rule_id_prefix="RULE-",
            default_author="test-author",
        ),
    )


def get_valid_logic():
    """Get valid rule logic."""
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
                                "values": ["test"],
                            },
                            "type": "stringColumnFilter",
                        },
                    },
                    "type": "columnFilterRule",
                },
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


class TestValidateProposal:
    """Tests for validate_proposal."""

    def test_valid_logic_passes(self):
        """Valid logic passes validation."""
        config = get_test_config()
        proposal = ProposalInput(logic=get_valid_logic())

        result = validate_proposal(proposal, config)
        assert result.valid

    def test_invalid_logic_fails(self):
        """Invalid logic fails validation."""
        config = get_test_config()
        proposal = ProposalInput(logic={"invalid": "structure"})

        result = validate_proposal(proposal, config)
        assert not result.valid

    def test_missing_logic_and_template_fails(self):
        """Missing both logic and template fails."""
        config = get_test_config()
        proposal = ProposalInput()

        result = validate_proposal(proposal, config)
        assert not result.valid

    def test_template_builds_logic(self):
        """Template params build valid logic."""
        config = get_test_config()
        proposal = ProposalInput(
            template="string-equals",
            params={"propertyId": "test-property", "value": "test"},
        )

        result = validate_proposal(proposal, config)
        assert result.valid


class TestCreateProposal:
    """Tests for create_proposal."""

    @patch("foundry_rules.sdk.FoundryClient")
    def test_creates_proposal(self, mock_client_class):
        """Creates proposal with valid input."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.apply_action_sync.return_value = {}

        config = get_test_config()
        proposal = ProposalInput(
            name="Test Proposal",
            description="Test description",
            logic=get_valid_logic(),
        )

        result = create_proposal(proposal, config)

        assert result.success
        assert result.proposal_id.startswith("PROP-")
        assert result.rule_id.startswith("RULE-")
        mock_client.apply_action_sync.assert_called_once()

    @patch("foundry_rules.sdk.FoundryClient")
    def test_creates_from_template(self, mock_client_class):
        """Creates proposal from template."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.apply_action_sync.return_value = {}

        config = get_test_config()
        proposal = ProposalInput(
            template="string-equals",
            params={"propertyId": "test-property", "value": "test"},
        )

        result = create_proposal(proposal, config)
        assert result.success

    def test_invalid_logic_raises(self):
        """Invalid logic raises ValueError."""
        config = get_test_config()
        proposal = ProposalInput(logic={"invalid": "structure"})

        with pytest.raises(ValueError):
            create_proposal(proposal, config)


class TestApproveProposal:
    """Tests for approve_proposal."""

    @patch("foundry_rules.sdk.FoundryClient")
    def test_approves_proposal(self, mock_client_class):
        """Approves proposal successfully."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.apply_action_sync.return_value = {}

        config = get_test_config()
        result = approve_proposal("PROP-123", "RULE-123", config)

        assert result.success
        assert result.proposal_id == "PROP-123"
        mock_client.apply_action_sync.assert_called_once()

    @patch("foundry_rules.sdk.FoundryClient")
    def test_uses_custom_reviewer(self, mock_client_class):
        """Uses custom reviewer when provided."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.apply_action_sync.return_value = {}

        config = get_test_config()
        approve_proposal("PROP-123", "RULE-123", config, reviewer="custom-reviewer")

        call_args = mock_client.apply_action_sync.call_args
        params = call_args[0][1]
        assert params["proposal_reviewer"] == "custom-reviewer"


class TestRejectProposal:
    """Tests for reject_proposal."""

    @patch("foundry_rules.sdk.FoundryClient")
    def test_rejects_proposal(self, mock_client_class):
        """Rejects proposal successfully."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.apply_action_sync.return_value = {}

        config = get_test_config()
        result = reject_proposal("PROP-123", config)

        assert result.success
        assert result.proposal_id == "PROP-123"


class TestBulkRejectProposals:
    """Tests for bulk_reject_proposals."""

    @patch("foundry_rules.sdk.FoundryClient")
    def test_rejects_all_proposals(self, mock_client_class):
        """Rejects all proposals successfully."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.apply_action_sync.return_value = {}

        config = get_test_config()
        result = bulk_reject_proposals(["PROP-1", "PROP-2", "PROP-3"], config)

        assert result.success
        assert result.total == 3
        assert result.rejected == 3
        assert result.failed == 0

    @patch("foundry_rules.sdk.FoundryClient")
    def test_handles_partial_failure(self, mock_client_class):
        """Handles partial failure correctly."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client

        # First call succeeds, second fails
        mock_client.apply_action_sync.side_effect = [
            {},
            Exception("API Error"),
            {},
        ]

        config = get_test_config()
        result = bulk_reject_proposals(["PROP-1", "PROP-2", "PROP-3"], config)

        assert not result.success
        assert result.total == 3
        assert result.rejected == 2
        assert result.failed == 1


class TestEditProposal:
    """Tests for edit_proposal."""

    @patch("foundry_rules.sdk.FoundryClient")
    def test_edits_metadata_only(self, mock_client_class):
        """Edits metadata without logic."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.apply_action_sync.return_value = {}

        config = get_test_config()
        edit_input = EditProposalInput(
            proposal_id="PROP-123",
            name="New Name",
            description="New Description",
        )

        result = edit_proposal(edit_input, config)

        assert result.success
        assert result.compressed_logic is None

    @patch("foundry_rules.sdk.FoundryClient")
    def test_edits_with_new_logic(self, mock_client_class):
        """Edits with new logic."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.apply_action_sync.return_value = {}

        config = get_test_config()
        edit_input = EditProposalInput(
            proposal_id="PROP-123",
            logic=get_valid_logic(),
        )

        result = edit_proposal(edit_input, config)

        assert result.success
        assert result.compressed_logic is not None

    def test_invalid_logic_raises(self):
        """Invalid logic raises ValueError."""
        config = get_test_config()
        edit_input = EditProposalInput(
            proposal_id="PROP-123",
            logic={"invalid": "structure"},
        )

        with pytest.raises(ValueError):
            edit_proposal(edit_input, config)
