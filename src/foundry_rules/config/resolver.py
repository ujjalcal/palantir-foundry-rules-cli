"""
Environment variable resolver.

Handles ${VAR_NAME} pattern resolution in config values.
"""

import os
import re
from typing import Optional


# Pattern to match ${VAR_NAME}
ENV_VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")


def has_env_vars(value: str) -> bool:
    """Check if a string contains environment variable references."""
    return bool(ENV_VAR_PATTERN.search(value))


def extract_env_var_names(value: str) -> list[str]:
    """Extract all environment variable names from a string."""
    return ENV_VAR_PATTERN.findall(value)


def resolve_env_vars(value: str) -> tuple[str, list[str]]:
    """
    Resolve environment variables in a string.

    Args:
        value: String potentially containing ${VAR_NAME} patterns

    Returns:
        Tuple of (resolved_value, list_of_missing_vars)
    """
    missing: list[str] = []

    def replacer(match: re.Match) -> str:
        var_name = match.group(1)
        env_value = os.environ.get(var_name)
        if env_value is None:
            missing.append(var_name)
            return match.group(0)  # Keep original if not found
        return env_value

    resolved = ENV_VAR_PATTERN.sub(replacer, value)
    return resolved, missing


def validate_env_vars(var_names: list[str]) -> tuple[bool, list[str]]:
    """
    Check if environment variables are set.

    Args:
        var_names: List of environment variable names to check

    Returns:
        Tuple of (all_valid, list_of_missing_vars)
    """
    missing = [name for name in var_names if os.environ.get(name) is None]
    return len(missing) == 0, missing


def get_env_var(name: str, default: Optional[str] = None) -> Optional[str]:
    """Get an environment variable value."""
    return os.environ.get(name, default)
