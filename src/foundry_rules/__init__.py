"""
Foundry Rules CLI - Python

Config-driven CLI and library for managing Foundry Rules proposals.
"""

__version__ = "1.0.0"

from .config import load_config, ResolvedConfig
from .compression import compress, decompress
from .templates import build_from_template, get_builtin_templates
from .validation import validate_rule_logic, validate_properties, validate_filter_types
from .sdk import (
    validate_proposal,
    create_proposal,
    approve_proposal,
    reject_proposal,
    edit_proposal,
    bulk_reject_proposals,
)

__all__ = [
    # Config
    "load_config",
    "ResolvedConfig",
    # Compression
    "compress",
    "decompress",
    # Templates
    "build_from_template",
    "get_builtin_templates",
    # Validation
    "validate_rule_logic",
    "validate_properties",
    "validate_filter_types",
    # SDK
    "validate_proposal",
    "create_proposal",
    "approve_proposal",
    "reject_proposal",
    "edit_proposal",
    "bulk_reject_proposals",
]
