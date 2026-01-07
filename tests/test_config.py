"""Tests for config module."""

import json
import os
import tempfile
import pytest

from foundry_rules.config import load_config
from foundry_rules.config.resolver import resolve_env_vars


class TestResolveEnvVars:
    """Tests for environment variable resolution."""

    def test_resolve_single_var(self):
        """Resolve a single env var."""
        os.environ["TEST_VAR"] = "test_value"
        result, missing = resolve_env_vars("${TEST_VAR}")
        assert result == "test_value"
        assert len(missing) == 0
        del os.environ["TEST_VAR"]

    def test_resolve_multiple_vars(self):
        """Resolve multiple env vars in string."""
        os.environ["VAR1"] = "hello"
        os.environ["VAR2"] = "world"
        result, missing = resolve_env_vars("${VAR1} ${VAR2}")
        assert result == "hello world"
        assert len(missing) == 0
        del os.environ["VAR1"]
        del os.environ["VAR2"]

    def test_unset_var_returns_original(self):
        """Unset env var returns original pattern and reports missing."""
        os.environ.pop("UNSET_VAR", None)
        result, missing = resolve_env_vars("${UNSET_VAR}")
        assert result == "${UNSET_VAR}"  # Keeps original
        assert "UNSET_VAR" in missing

    def test_no_vars_unchanged(self):
        """String without vars is unchanged."""
        result, missing = resolve_env_vars("no variables here")
        assert result == "no variables here"
        assert len(missing) == 0

    def test_partial_match_unchanged(self):
        """Incomplete pattern is unchanged."""
        result, missing = resolve_env_vars("$NOT_A_VAR")
        assert result == "$NOT_A_VAR"
        assert len(missing) == 0


class TestLoadConfig:
    """Tests for config loading."""

    def create_config_file(self, config: dict) -> str:
        """Create a temp config file and return path."""
        fd, path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w") as f:
            json.dump(config, f)
        return path

    def get_valid_config(self) -> dict:
        """Get a valid config dict matching the actual schema."""
        return {
            "version": "1.0",
            "workflow": {
                "name": "Test Workflow",
                "workflowRid": "ri.rules..workflow.test",
                "objectType": {
                    "id": "test-object",
                    "properties": [
                        {"id": "name", "type": "string"},
                        {"id": "value", "type": "number"},
                    ],
                },
                "output": {
                    "id": "output-1",
                    "version": "1",
                },
            },
            "foundry": {
                "url": "https://test.palantirfoundry.com",
                "ontologyRid": "ri.ontology.main.ontology.test",
                "tokenEnvVar": "TEST_TOKEN",
            },
            "sdk": {
                "packageName": "@test/sdk",
                "archetypes": {
                    "proposal": "Proposal",
                    "rule": "Rule",
                },
                "actions": {
                    "createProposal": "create-proposal",
                    "approveProposal": "approve-proposal",
                    "rejectProposal": "reject-proposal",
                    "editProposal": "edit-proposal",
                },
            },
            "validation": {
                "grammarVersion": "V1",
                "supportedStrategyTypes": ["filterNode"],
                "supportedStringFilters": ["EQUALS", "CONTAINS"],
                "unsupportedStringFilters": ["REGEX"],
            },
            "conventions": {
                "proposalIdPrefix": "PROP-",
                "ruleIdPrefix": "RULE-",
                "defaultAuthor": "test-author",
            },
        }

    def test_load_valid_config(self):
        """Load a valid config file."""
        os.environ["TEST_TOKEN"] = "test-token-value"
        config = self.get_valid_config()
        path = self.create_config_file(config)

        try:
            result = load_config(path)
            assert result.success
            assert result.config is not None
            assert result.config.workflow.workflow_rid == "ri.rules..workflow.test"
        finally:
            os.unlink(path)
            del os.environ["TEST_TOKEN"]

    def test_load_nonexistent_file(self):
        """Loading nonexistent file fails."""
        result = load_config("/nonexistent/path.json")
        assert not result.success
        assert len(result.errors) > 0

    def test_load_invalid_json(self):
        """Loading invalid JSON fails."""
        fd, path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w") as f:
            f.write("not valid json {")

        try:
            result = load_config(path)
            assert not result.success
        finally:
            os.unlink(path)

    def test_load_with_env_var(self):
        """Load config with env var substitution."""
        os.environ["TEST_TOKEN"] = "resolved-token"
        config = self.get_valid_config()
        path = self.create_config_file(config)

        try:
            result = load_config(path)
            assert result.success
            assert result.config is not None
            assert result.config.foundry.token == "resolved-token"
        finally:
            os.unlink(path)
            del os.environ["TEST_TOKEN"]

    def test_missing_token_gives_warning(self):
        """Missing token gives warning when validation enabled."""
        os.environ.pop("TEST_TOKEN", None)
        config = self.get_valid_config()
        path = self.create_config_file(config)

        try:
            result = load_config(path, validate_token=True)
            # It should succeed but with warnings
            assert result.success
            assert len(result.warnings) > 0
        finally:
            os.unlink(path)

    def test_missing_token_ok_without_validation(self):
        """Missing token ok when validation disabled."""
        os.environ.pop("TEST_TOKEN", None)
        config = self.get_valid_config()
        path = self.create_config_file(config)

        try:
            result = load_config(path, validate_token=False)
            assert result.success
        finally:
            os.unlink(path)

    def test_missing_required_field(self):
        """Missing required field fails."""
        config = self.get_valid_config()
        del config["workflow"]["workflowRid"]
        path = self.create_config_file(config)

        try:
            result = load_config(path)
            assert not result.success
        finally:
            os.unlink(path)

    def test_camel_case_conversion(self):
        """camelCase fields are converted to snake_case."""
        os.environ["TEST_TOKEN"] = "test-token"
        config = self.get_valid_config()
        path = self.create_config_file(config)

        try:
            result = load_config(path)
            assert result.success
            assert result.config is not None
            # Check snake_case fields
            assert hasattr(result.config.workflow, "workflow_rid")
            assert hasattr(result.config.foundry, "ontology_rid")
        finally:
            os.unlink(path)
            del os.environ["TEST_TOKEN"]
